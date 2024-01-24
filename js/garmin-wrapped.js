const monthNames = ["January", "February", "March", "April", "May", "June",
	"July", "August", "September", "October", "November", "December"
];

const todPrefix = {
	"Morning": "in the",
	"Lunch": "at",
	"Afternoon": "in the",
	"Evening": "in the",
	"Night": "at",
}

class Wrapped
{
	init()
	{
		this.output = document.getElementById("output")
		this.pageIndex = 0

		this.pages = [
			this.splashPage.bind(this),
			this.activeDays.bind(this),
			this.totalTime.bind(this),
			this.totalDistance.bind(this),
			this.totalElevation.bind(this),
			this.longestActivity.bind(this),
			this.preferredTod.bind(this),
			this.mainSportDuration.bind(this),
			this.mainSportDistance.bind(this),
		]

		this.loadJson().then( (success) => {

			if(success)
			{
				if(this.data.sports["Running"] || this.data.sports["Cycling"])
				{
					this.pages.push(this.vo2maxImprovements.bind(this))
				}

				for(const sport of this.data.sports_by_duration)
				{

					if(this.data.sports[sport].count > 1)
						this.pages.push(this.sportsSummary.bind(this, sport))
				}

				this.pages.push(this.summaryPage.bind(this))

				this.showFirstPage()
			}
			else
			{
				this.output.textContent = "Run python script first!"
			}
		})
	}

	async loadJson()
	{
		const response = await fetch("./garmin-wrapped.json")
		if(!response.ok)
			return false

		this.data = await response.json()
		return true
	}

	showFirstPage()
	{
		const page = this.pages[this.pageIndex]()

		this.renderPage(page[0])
		this.updateCurrent()

		page[1]()
	}

	distanceTerm()
	{
		return this.data.unit_system == 'metric' ? "kilometers" : "miles";
	}


	generatePage(title)
	{
		let page = fromHTML(`<div class='container'><h1>${title}</h1></div>`)

		return page
	}

	renderPage(page)
	{
		page.id = 'next'
		page.style.opacity = 0
		this.output.append(page)
	}

	updateCurrent()
	{
		const next = document.getElementById('next')
		const cur = document.getElementById('current')
		if(cur != null)
			cur.remove()

		next.addEventListener('click', () => {this.transition()})

		next.id = 'current'

		next.style.opacity = 1
	}

	transition() {
		let nextPageFunc = this.pages[this.pageIndex + 1]

		if(nextPageFunc == null)
			return

		let nextPage = nextPageFunc()

		this.pageIndex += 1

		this.renderPage(nextPage[0])

		let transition = gsap.timeline();
		transition
			.set("#next", { rotate: -45 })
			.set("#next", { x: (i, t) => getOffScreenLeft(t), opacity: 1 })
			.to("#current", {x: (i,t) => getOffScreenRight(t), rotate: 45, duration: 2, ease: "power2.in"})
			.to("#next", {x: 0, rotate: 0, duration: 2, ease: "power2.out"})
			.call(this.updateCurrent.bind(this))
			.call(nextPage[1])
	}


	humanDistance(distance) {
		let result = ""
		if(this.data.unit_system == 'metric')
		{
			const metersInKm = 1000;

			const kms = Math.floor(distance / metersInKm);
			if (kms >= 15)
				result = `${formatNumber(Math.round(distance/metersInKm))} km`
			else
				result = `${formatNumber(Math.floor(distance))} m`
	
		}
		else
		{
			// I think the units are always in meters?
			let feets = distance * 3.28084;
			const feetsInMile = 5280;

			const miles = Math.floor(feets / feetsInMile);
			if (miles > 10)
				result = `${formatNumber(Math.round(feets / feetsInMile))} miles`
			else
				result = `${formatNumber(Math.floor(feets))} ft`
		}
		return result;
	}

	buildMonthlyTable(entry, displayFunc, classes)
	{
		let data = [];
		let largest = 0;
		for(let i=0; i<12; ++i) {
			data[i] = this.data.monthly[i+1][entry]
			if(data[i] > largest)
				largest = data[i]
		}

		let diagram = fromHTML(`<div class='diagram-vertical ${classes}'></div>`)
		for(let i=0; i<12; ++i) {
			let row = fromHTML("<div class='diagram-vertical-row'></div>");

			row.append(fromHTML(`<span class='month-label'>${monthNames[i]}</span>`))

			const percentage = Math.round((data[i] / largest) * 100.0);

			row.append(fromHTML(`<span class='progress-bar-wrapper'><span class='progress-bar' style='width: ${percentage}%'/></span>`))
			row.append(fromHTML(`<span class='data-label'>${displayFunc(data[i])}</span>`))
			diagram.append(row)
		}
		return diagram
	}

	/**
	 *  PAGES
	 */

	splashPage()
	{
		let page = this.generatePage("Your Year in Sports")
		page.append(fromHTML(`<p class='profile'><img src="${this.data.profilePicture}"/></p>`))
		page.append(banner(this.data.year, 'large'))
		page.append(banner(this.data.name, 'medium'))
		return [page,()=>{}]
	}

	activeDays()
	{
		let page = this.generatePage("You spent many days active")
		page.append(banner(`${this.data.totals.active_days} in total`, 'large sport hidden'))

		let diagram = fromHTML("<div class='diagram-horizontal data hidden'></div>")
		for(let i=0; i<12; ++i) {
			let column = fromHTML("<div class='diagram-horizontal-column'></div>");

			const count = this.data.active_days[i+1];
			column.append(fromHTML(`<span class='count-label'>${count}</span>`))
			for(let j=0; j<count; ++j) {
				column.append(fromHTML("<span class='activity-circle'/>"))
			}
			column.append(fromHTML(`<span class='month-label'>${monthNames[i]}</span>`))
			diagram.append(column)
		}
		page.append(diagram)

		return [page, transitionInDefault]
	}


	preferredTod()
	{
		const sortedTod = ["Morning", "Lunch", "Afternoon","Evening","Night"]

		let page = this.generatePage("You preferred to go out");
		const tod = this.data.time_of_day[0].name;
		page.append(banner(`${todPrefix[tod]} ${tod}`, 'large sport hidden'))

		const largest = this.data.time_of_day[0].count

		let diagram = fromHTML(`<div class='diagram-vertical data hidden'></div>`)
		sortedTod.forEach((tod) => {
			const data = this.data.time_of_day.find(e => e.name == tod)
			const count = data !== undefined ? data.count : 0
			let row = fromHTML("<div class='diagram-vertical-row'></div>");

			row.append(fromHTML(`<span class='month-label'>${tod}</span>`))

			const percentage = Math.round((count / largest) * 100.0);

			row.append(fromHTML(`<span class='progress-bar-wrapper'><span class='progress-bar' style='width: ${percentage}%'/></span>`))
			row.append(fromHTML(`<span class='data-label'>${count}</span>`))
			diagram.append(row)
		})
		page.append(diagram)

		return [page, transitionInDefault]
	}

	totalTime()
	{
		let page = this.generatePage("You sure exercised a lot")
		page.append(banner(`${humanTime(this.data.totals.duration)} in fact`, 'large sport hidden duration-color'))

		page.append(this.buildMonthlyTable('duration', humanTime, 'data hidden'))

		return [page, transitionInDefault]
	}

	totalDistance()
	{
		let page = this.generatePage("And covered a lot of distance")
		page.append(banner(`${this.humanDistance(this.data.totals.distance)} in total`, 'large sport hidden distance-color'))

		page.append(this.buildMonthlyTable('distance', this.humanDistance.bind(this), 'data hidden'))

		return [page, transitionInDefault]
	}

	totalElevation()
	{
		let page = this.generatePage("Big hills were no challenge")
		page.append(banner(`You climbed ${this.humanDistance(this.data.totals.elevation_gain)}`, 'large sport hidden elevation-color'))

		page.append(this.buildMonthlyTable('elevation_gain', this.humanDistance.bind(this), 'data hidden'))

		return [page, transitionInDefault]
	}

	mainSportDuration()
	{
		let page = this.generatePage("You spent a lot of time");
		const sport = this.data.sports_by_duration[0];
		const sportData = this.data.sports[sport];
 		page.append(banner(sport, 'large hidden sport sport-color'));
		page.append(banner(humanTime(sportData.duration), 'medium hidden data duration-color'))
		page.append(
			table(() => {
				return this.data.sports_by_duration.slice(1).reduce((result, sport) => {
					return result + `<tr>
						<td>${sport}</td>
						<td>${humanTime(this.data.sports[sport].duration)}</td>
					</tr>`
				}, "");
			}, 'other hidden')
		)
		return [page, transitionInDefault]
	}

	mainSportDistance()
	{
		let page = this.generatePage(`You covered the most distance`);
		const sport = this.data.sports_by_distance[0];
		const sportData = this.data.sports[sport];
 		page.append(banner(sport, 'large hidden sport sport-color'));
		page.append(banner(this.humanDistance(sportData.distance), 'medium hidden data distance-color'))
		page.append(
			table(() => {
				return this.data.sports_by_distance.slice(1).reduce((result, sport) => {
					var distance = this.data.sports[sport].distance;
					return result + (distance > 0 ? `<tr>
						<td>${sport}</td>
						<td>${this.humanDistance(distance)}</td>
					</tr>` : "")
				}, "");
			}, 'other hidden')
		)
		return [page, transitionInDefault]
	}

	longestActivity()
	{
		let page = this.generatePage(`Your longest activity was`)
		page.append(banner(`${this.data.longest_activity.name} ${this.data.longest_activity.date}`, 'large sport hidden sport-color'))
		page.append(banner(this.humanDistance(this.data.longest_activity.distance), 'medium data hidden distance-color'))
		page.append(banner(`${this.humanDistance(this.data.longest_activity.elevation_gain)} elevation gain`, 'medium hidden other elevation-color'))
		page.append(banner(`${Math.floor(this.data.longest_activity.avgHr)} bpm average heart rate`, 'medium hidden other hr-color'))

		return [page, transitionInDefault]
	}

	vo2maxImprovements()
	{
		let running = this.data.sports["Running"] || {}
		let cycling = this.data.sports["Cycling"] || {}

		let run = [ running['vo2max_first'] || 0, running['vo2max_last'] || 0 ]
		let cycle = [ cycling['vo2max_first'] || 0, cycling['vo2max_last'] || 0 ]

		let any_improvement = run[1] > run[0] || cycle[1] > cycle[0]

		let page = any_improvement ? this.generatePage("All that hard work paid off") : this.generatePage("Your VO2 Max didn't change much")

		if(any_improvement)
			page.append(banner("Your VO2 Max improved", 'medium hidden vo2max'))

		if(run[0] > 0 && run[1] > 0)
			page.append(banner(`Running VO2Max from ${run[0]} to ${run[1]}`, 'medium hidden running vo2-color'))

		if(cycle[0] > 0 && cycle[1] > 0)
			page.append(banner(`Cycling VO2Max from ${cycle[0]} to ${cycle[1]}`, 'medium hidden cycling vo2-color'))

		return [page, ()=>{
			gsap.timeline()
				.set(".vo2max", {scale: 0})
				.set(".running", {scale: 0})
				.set(".cycling", {scale: 0})
				.to(".vo2max", {opacity: 1, rotate:360, scale:1, duration:1, ease:"power2.in"})
				.to(".running", {opacity: 1, scale:1, duration:1, ease:"power2.in"})
				.to(".cycling", {opacity: 1, scale:1, duration:1, ease:"power2.in"})
		}]
	}

	sportsSummary(sport)
	{
		const data = this.data.sports[sport]
		let page = this.generatePage(`Your ${sport} summary`)
		page.append(banner(`${humanTime(data.duration)}`, 'large duration-color'))
		if(data.distance > 0)
			page.append(banner(`${this.humanDistance(data.distance)}`, 'large distance-color'))
		if(data.elevation_gain > 0)
			page.append(banner(`${this.humanDistance(data.elevation_gain)} elevation gain`, 'large elevation-color'))
		page.append(banner(`${data.count} activities`, 'large'))

		page.append(banner(`Average duration ${humanTime(data.avg_duration)}`, 'medium duration-color'))
		if(data.distance > 0)
			page.append(banner(`Average distance ${this.humanDistance(data.avg_distance)}`, 'medium distance-color'))
		if(data.avg_hr > 0)
			page.append(banner(`Average heartrate ${Math.floor(data.avg_hr)} bpm`, 'medium hr-color'))

		return [page, () => {}]
	}

	summaryPage()
	{
		let page = this.generatePage(`${this.data.name}'s ${this.data.year}`)
		page.append(banner(`${humanTime(this.data.totals.duration)}`, 'large duration-color'))
		page.append(banner(`${this.humanDistance(this.data.totals.distance)}`, 'large distance-color'))
		page.append(banner(`${this.humanDistance(this.data.totals.elevation_gain)} elevation gain`, 'large elevation-color'))
		page.append(banner(`${this.data.totals.count} activities`, 'large'))
		page.append(banner(`${this.data.totals.active_days} active days`, 'large'))

		return [page, () => {}]
	}
}

function getOffScreenRight( el )
{
	var rect = el.getBoundingClientRect();
	return screen.width - rect.left + el.offsetWidth/2;
}
function getOffScreenLeft( el )
{
	var rect = el.getBoundingClientRect();
	return -rect.width - rect.left;
}

/**
 * @param {String} HTML representing a single element.
 * @param {Boolean} flag representing whether or not to trim input whitespace, defaults to true.
 * @return {Element | HTMLCollection | null}
 */
function fromHTML(html, trim = true)
{
	// Process the HTML string.
	html = trim ? html : html.trim();
	if (!html) return null;

	// Then set up a new template element.
	const template = document.createElement('template');
	template.innerHTML = html;
	const result = template.content.children;

	// Then return either an HTMLElement or HTMLCollection,
	// based on whether the input HTML had one or more roots.
	if (result.length === 1) return result[0];
	else console.log(result)
	return result;
}

function banner(text, classes) {
	return fromHTML(`<p class='banner ${classes}'><span>${text}</span></p>`)
}

function table(populateFunc, classes) {
	return fromHTML(`<div class='table ${classes}'><table>${populateFunc()}</table></div>`)
}

function humanTime(seconds)
{
	const secondsInMinute = 60;
	const secondsInHour = secondsInMinute * 60;
	const secondsInDay = secondsInHour * 24;

	let result = ""
	const days = Math.floor(seconds / secondsInDay);
	seconds -= days * secondsInDay;
	if(days > 0)
		result += `${days}d `

	const hours = Math.floor(seconds / secondsInHour);
	seconds -= hours * secondsInHour;
	if(hours > 0)
		result += `${hours}h `

	const minutes = Math.round(seconds / secondsInMinute);
	seconds -= minutes * secondsInMinute;
	if(minutes > 0)
		result += `${minutes}min`

	return result;
}

function formatNumber(number) {
	return new Intl.NumberFormat().format(number)
}

function transitionInDefault() {
	gsap.timeline()
		.set(".sport", {scale: 0})
		.to(".sport", {scale: 1, opacity: 1, rotate:360, duration: 1, ease: "power1.in"})
		.to(".data", {opacity: 1, duration: 1, ease: "power2.in"})
		.to(".other", {opacity: 1})
}

export { Wrapped }