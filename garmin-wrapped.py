#!/usr/bin/env python3

import datetime
import json
import logging
import requests
import sys
import os
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

logging.basicConfig(level=logging.DEBUG)
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
	163: "Yoga",
	171: "Cross Country Skiing",
	172: "Alpine Skiing / Snowboarding",
	165: "Winter Sports",
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
		'name': "Afternoom"
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
		
def get_user_data():
	return {
		'full_name': api.get_full_name(),
		'unit_system': api.get_unit_system()
	}
	
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

def get_time_of_day(timeStr, duration):
	time = parse_time(timeStr)
	# add on half duration (to get midpoint)
	time += datetime.timedelta(seconds=duration / 2)
	hour = time.hour
	for i in range(0, len(timeOfDay) - 1):
		if hour >= timeOfDay[i]['start'] and hour < timeOfDay[i+1]['start']:
			return timeOfDay[i]['name']

	return timeOfDay[len(timeOfDay) - 1]['name']

def dict_to_list(key, val):
	if not isinstance(val,dict):
		val = { 'value': val }

	val['name'] = key
	return val

def build_sorted_list(dataDict, sortFunc):
	sorted_list = [ dict_to_list(key,val) for key,val in dataDict.items() ]
	sorted_list.sort(key = sortFunc, reverse=True)
	return sorted_list

def summarize_field(summaries, field):
	return reduce(lambda acum,cur: acum + cur[field], summaries.values(), 0 )

def sport_summary(activities, favTime):
	summary = {
		'total_distance': 0.0,
		'total_duration': 0.0,
		'total_elevation_gain': 0.0,
		'count': len(activities)
	}

	if(summary['count'] == 0):
		return None

	avgHrSum = 0

	for act in activities:
		summary['total_distance'] += act["distance"] or 0
		summary['total_duration'] += act['duration'] or 0
		summary['total_elevation_gain'] += act['elevationGain'] or 0
		avgHrSum += act['averageHR']
		favTime[get_time_of_day(act['startTimeLocal'], act['duration'])] += 1

	summary['avg_hr'] = avgHrSum / summary['count']
	summary['avg_distance'] = summary['total_distance'] / summary['count']
	summary['avg_duration'] = summary['total_duration'] / summary['count']

	return summary

def find_first_vo2max(activities):
	for act in activities:
		if act["vO2MaxValue"] is not None:
			return act["vO2MaxValue"]

def find_last_vo2max(activities):
	for act in reversed(activities):
		if act["vO2MaxValue"] is not None:
			return act["vO2MaxValue"]

def build_vo2max_improvement(activities):
	result = {
		'vo2max_first': find_first_vo2max(activities),
		'vo2max_last': find_last_vo2max(activities)
	}

	if result['vo2max_first'] is None:
		return None
	
	return result

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
	# Pick current year if we're in august or later
	if today.month > 7:
		year = today.year
	else:
		year = today.year - 1

print(f"Getting info for year {year}\n")

data = {}

data['user'] = get_user_data();

# prevent re-fetching activities every re-run
if os.path.exists("activities.json"):
	activities = load_json("activities.json")
else:
	activities = fetch_activites(year)
	write_json("activities.json", activities)

# Sort activities by date
activities.sort(key = lambda act: parse_time(act['startTimeLocal']))

# group activites by top level sports

grouped_activities = {}
month_activities = {}

for act in activities:
	sport = find_activity_group(act)
	if sport is not None:
		if not sport in grouped_activities:
			grouped_activities[sport] = []
		grouped_activities[sport].append(act)
	month = parse_time(act['startTimeLocal']).month
	if not month in month_activities:
		month_activities[month] = 0
	month_activities[month] += 1

# Set up favorite time of day data
favTime = { data['name']:0 for data in timeOfDay }

summaries = {sport: sport_summary(sportsData, favTime) for sport,sportsData in grouped_activities.items() }
data['sport_summaries'] = summaries

data['time_of_day'] = build_sorted_list(favTime, lambda x: x['value'])
data['sports_by_duration'] = [sport['name'] for sport in build_sorted_list(summaries, lambda sport: sport['total_duration'])]
data['sports_by_distance'] = [sport['name'] for sport in build_sorted_list(summaries, lambda sport: sport['total_distance'])]
data['sports_by_elevation_gain'] = [sport['name'] for sport in build_sorted_list(summaries, lambda sport: sport['total_elevation_gain'])]

# some summaries for all activities
data['total_elevation_gain'] = summarize_field(summaries, 'total_elevation_gain') 
data['total_distance'] = summarize_field(summaries, 'total_distance') 
data['total_duration'] = summarize_field(summaries, 'total_duration') 
data['total_activities'] = len(activities)

# find most active month
data['month_activities'] = build_sorted_list(month_activities, lambda x: x['value'])

# build improvement data for running and cycling
if "Running" in summaries:
	improvements = build_vo2max_improvement(grouped_activities['Running'])
	if improvements is not None:
		data['running_improvement'] = improvements

if "Cycling" in summaries:
	improvements = build_vo2max_improvement(grouped_activities['Cycling'])
	if improvements is not None:
		data['cycling_improvement'] = improvements

write_json("garmin-wrapped.json", data)