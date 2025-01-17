#!/usr/bin/env python3

import datetime
import json
import logging
import requests
import sys
import os
import math
from getpass import getpass
import datetime
from functools import reduce

from garth.exc import GarthHTTPError
from garminconnect import (
	Garmin,
	GarminConnectAuthenticationError,
	GarminConnectConnectionError,
	GarminConnectInvalidFileFormatError,
	GarminConnectTooManyRequestsError
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
tokenstore = ".garminconnect"

topLevelSports = {
	1: "Running",
	2: "Cycling",
	3: "Hiking",
	9: "Walking",
	13: "Strength Training",
	26: "Swimming",
	32: "Indoor Rowing",
	37: "Mounteneering",
	163: "Yoga",
	11: "Cardio",
	171: "Cross Country Skiing",
	172: "Alpine Skiing / Snowboarding",
	165: "Winter Sports",
	174: "Bouldering",
	89: "Multi Sport",
	219: "Racket sports"
	210: "Field Hockey",
	4: "Other",
}

# Mapping to start hour

timeOfDay = [
	{
		'start': 0,
		'name': "Night",
	},
	{
		'start': 5,
		'name': "Morning"
	},
	{
		'start': 11,
		'name': "Lunch"
	},
	{
		'start': 13,
		'name': "Afternoon"
	},
	{
		'start': 17,
		'name': "Evening"
	},
	{
		'start': 21,
		'name': "Night"
	},
]

def get_credentials():
	"""Get user credentials"""
	email = input("Login e-mail: ")
	password = getpass("Password: ")

	return email, password

def init_api():
	"""Initialize Garmin API"""
	try:
		logging.debug("Trying to authenticate with stored token")
		garmin = Garmin()
		garmin.login(tokenstore)
	except (FileNotFoundError, GarthHTTPError, GarminConnectAuthenticationError):
		logging.debug("Stored token login failed")
		# No stored session
		print(f"Enter garmin username and password. Only authentication token will be stored (in {tokenstore}/).\n")
		try:
			email, password = get_credentials()
			garmin = Garmin(email, password)
			garmin.login()
			garmin.garth.dump(tokenstore)
		except (FileNotFoundError, GarthHTTPError, GarminConnectAuthenticationError, requests.exceptions.HTTPError) as err:
			logger.error(f"Login failed: {err}")
			return None
	
	return garmin
		
	
def fetch_activites(year):
	return api.get_activities_by_date(f"{year}-01-01",f"{year}-12-31")

def write_json(filename, data):
	with open(filename, "w") as file:
		json.dump(data, file, indent=4)

def load_json(filename):
	with open(filename, "r") as file:
		return json.load(file)

def find_activity_group(activity):
	type = activity["activityType"]
	typeId = type["typeId"]
	if not (typeId in topLevelSports):
		if type["parentTypeId"] in topLevelSports:
			return topLevelSports[type["parentTypeId"]]
		else:
			logging.warning(f"Unknown sport id {typeId}, parent: {type['parentTypeId']}, key: {type['typeKey']}. Ignored.")
			return None
	else:
		return topLevelSports[typeId]

def parse_time(timeStr):
	return datetime.datetime.strptime(timeStr, "%Y-%m-%d %H:%M:%S")

def increment_entry(dict, entry, amount=1):
	if amount is None:
		return

	if entry not in dict:
		dict[entry] = amount
	else:
		dict[entry] += amount

def get_time_of_day(timeStr, duration):
	time = parse_time(timeStr)
	# add on half duration (to get midpoint)
	time += datetime.timedelta(seconds=duration / 2)
	hour = time.hour
	for i in range(0, len(timeOfDay) - 1):
		if hour >= timeOfDay[i]['start'] and hour < timeOfDay[i+1]['start']:
			return timeOfDay[i]['name']

	return timeOfDay[len(timeOfDay) - 1]['name']

def dict_to_list(key, val, defaultValueKey = 'value'):
	if not isinstance(val,dict):
		val = { defaultValueKey: val }

	val['name'] = key
	return val

def build_sorted_list(dataDict, sortFunc, defaultValueKey = 'value'):
	sorted_list = [ dict_to_list(key,val, defaultValueKey) for key,val in dataDict.items() ]
	sorted_list.sort(key = sortFunc, reverse=True)
	return sorted_list

def summarize_field(summaries, field):
	return reduce(lambda acum,cur: acum + cur.get(field, 0), summaries, 0 )

def sport_summary(activities):
	summary = {
		'distance': 0.0,
		'duration': 0.0,
		'elevation_gain': 0.0,
		'count': len(activities)
	}

	if(summary['count'] == 0):
		return None

	avgHrSum = 0

	durationActCount = 0
	distanceActCount = 0
	hrActCount = 0

	for act in activities:
		if "distance" in act and act["distance"]:
			summary['distance'] += act["distance"]
			distanceActCount += 1
		if act["duration"]:
			summary['duration'] += act['duration']
			durationActCount += 1
		if 'averageHR' in act and act['averageHR']:
			hrActCount += 1
			avgHrSum += act['averageHR']
		summary['elevation_gain'] += act.get('elevationGain', 0)

	summary['avg_hr'] = (avgHrSum / hrActCount) if hrActCount > 0 else 0
	summary['avg_distance'] =  (summary['distance'] / distanceActCount) if distanceActCount > 0 else 0
	summary['avg_duration'] = (summary['duration'] / durationActCount) if durationActCount > 0 else 0

	return summary

def find_first(activities, field):
	for act in activities:
		if act[field] is not None:
			return act[field]

def find_last(activities, field):
	for act in reversed(activities):
		if act[field] is not None:
			return act[field]

def fetch_biometric(year, field, sport):
	url = f"/biometric-service/stats/{field}/range/{year}-01-01/{year}-12-31"
	params = {
		"aggregation": "weekly",
		"userFirstDay": "monday"
	}

	rawFtp = api.connectapi(url, params=params)
	return list(filter(lambda x: x['series'] == sport, rawFtp))

def fetch_vo2max(year, sport):
	url = f"/metrics-service/metrics/maxmet/weekly/{year}-01-01/{year}-12-31"
	data = api.connectapi(url)
	return list(map(lambda x: x[sport],
				 filter(lambda x: (x[sport] is not None) and (x[sport]['vo2MaxValue'] is not None), data)))

# Convert speed in 1/10 m/s to pace
def convert_speed_to_pace(speed):
	pace = 1000.0 / (speed * 600.0)
	# seconds, min = math.modf(pace)
	# return f"{round(min)}:{round(seconds*60.0)}"
	return pace * 60.0;

def build_running_improvement(year):
	vo2max = fetch_vo2max(year, "generic") # Running is counted as generic
	result = {}

	if len(vo2max) > 0:
		result = {
			'vo2max_first': vo2max[0]['vo2MaxValue'],
			'vo2max_last': vo2max[-1]['vo2MaxValue']
		}

	# lactate threshold
	url = f"/biometric-service/stats"
	params = {
		"startDate": f"{year}-01-01",
		"endDate": f"{year}-12-31",
		"aggregation": "weekly",
		"userFirstDay": "monday"
	}

	rawStats = api.connectapi(url, params=params)

	filteredList = list(filter(lambda x: x is not None and x > 0, map(lambda x: x['stats']['lactateThresholdSpeed']['avg'], rawStats)))

	# threshold in 1/10 meters per second (weird unit?)

	if len(filteredList) > 0:
		result.update({
			'thresholdPace_first': convert_speed_to_pace(filteredList[0]),
			'thresholdPace_last': convert_speed_to_pace(filteredList[-1]),
		})

	return result

def build_cycling_improvement(year):

	result = {}

	vo2max = fetch_vo2max(year, "cycling")
	if(len(vo2max) > 0):
		result = {
			'vo2max_first': vo2max[0]['vo2MaxValue'],
			'vo2max_last': vo2max[-1]['vo2MaxValue']
		}

	ftpData = fetch_biometric(year, "functionalThresholdPower", "cycling")
	if len(ftpData) == 0:
		return result

	ftpPerKgData = fetch_biometric(year, "powerToWeight", "cycling")
	result.update({
		'ftp_first': ftpData[0]['value'],
		'ftp_last': ftpData[-1]['value'],
		'ftp_perKg_first': ftpPerKgData[0]['value'],
		'ftp_perKg_last': ftpPerKgData[-1]['value']
	})

	return result

# generic improvements?
# endurance score

def filter_activity(act):
	date = parse_time(act['startTimeLocal'])
	return {
		'name': act['activityName'],
		'distance': act.get('distance', 0),
		'duration': act.get('duration', 0),
		'elevation_gain': act.get('elevationGain', 0),
		'avgHr': act.get('averageHR', 0),
		'avgPower': act.get('avgPower', 0),
		'date': date.strftime("%d %B"),
	}

### Main Program

# Authenticate
api = init_api()

if api is None:
	exit(-1)

print("Successfully authenticated.\n")

# Figure out year to do
year = None
if len(sys.argv) > 1:
	year = int(sys.argv[1])

if year is None:
	today = datetime.date.today()
	# Pick current year if we're in july or later
	if today.month > 6:
		year = today.year
	else:
		year = today.year - 1

print(f"Getting info for year {year}\n")

data = {
	'name': api.get_full_name(),
	'unit_system': api.get_unit_system(),
	'year': year,
	'profilePicture': api.garth.profile['profileImageUrlLarge']
}

# Uncomment to prevent refetch on every run
#if os.path.exists(f"activities{year}.json"):
#	activities = load_json(f"activities{year}.json")
#else:
activities = fetch_activites(year)
write_json(f"activities{year}.json", activities)

# Sort activities by date
activities.sort(key = lambda act: parse_time(act['startTimeLocal']))

# group activites by top level sports

grouped_activities = {}
monthly = {x:{} for x in range(1,13)}
per_tod = {}

longest_activity = filter_activity(activities[0])
active_days = {x:{} for x in range(1,13)}

for act in activities:
	sport = find_activity_group(act)
	if sport is not None:
		if not sport in grouped_activities:
			grouped_activities[sport] = []
		grouped_activities[sport].append(act)
	time = parse_time(act['startTimeLocal'])
	month = time.month

	increment_entry(monthly[month], 'count')
	increment_entry(monthly[month], 'duration', act.get('duration', 0))
	increment_entry(monthly[month], 'distance', act.get('distance', 0))
	increment_entry(monthly[month], 'elevation_gain', act.get('elevationGain', 0))
	increment_entry(per_tod, get_time_of_day(act['startTimeLocal'], act.get('duration', 0)))

	active_days[month][time.day] = 1

	if act.get('distance', 0) > (longest_activity.get('distance', 0)):
		longest_activity = filter_activity(act)

# Set up favorite time of day data
summaries = {sport: sport_summary(sportsData) for sport,sportsData in grouped_activities.items() }
data['sports'] = summaries

data['time_of_day'] = build_sorted_list(per_tod, lambda x: x['count'], 'count')
data['sports_by_duration'] = [sport['name'] for sport in build_sorted_list(summaries, lambda sport: sport['duration'])]
data['sports_by_distance'] = [sport['name'] for sport in build_sorted_list(summaries, lambda sport: sport['distance'])]
data['sports_by_elevation_gain'] = [sport['name'] for sport in build_sorted_list(summaries, lambda sport: sport['elevation_gain'])]

data['longest_activity'] = longest_activity

data['active_days'] = {x: len(y) for x,y in active_days.items()}
data['monthly'] = monthly

data['totals'] = {
	'elevation_gain':  summarize_field(activities, 'elevationGain'),
	'distance': summarize_field(activities, 'distance'),
	'duration': summarize_field(activities, 'duration'),
	'count':  len(activities),
	'active_days': reduce(lambda x,y: x+y, data['active_days'].values())
}

# build improvement data for running and cycling
if "Running" in summaries:
	improvements = build_running_improvement(year)
	if improvements:
		data['sports']['Running']['improvements'] = improvements

if "Cycling" in summaries:
	improvements = build_cycling_improvement(year)
	if improvements:
		data['sports']['Cycling']['improvements'] = improvements

write_json("garmin-wrapped.json", data)

print("Data written to garmin-wrapped.json")
