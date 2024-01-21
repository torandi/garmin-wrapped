import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

class Wrapped
{
	init()
	{
		this.output = document.getElementById("output")
		this.loadJson().then( (success) => {

			if(success)
			{
				this.showFirstPage(this.splashPage())
				//this.showFirstPage(this.mainSportDuration())
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


	showFirstPage(page)
	{

		this.renderPage(page[0])
		this.updateCurrent(page[2])

		page[1]()
	}

	splashPage()
	{
		let page = this.generatePage("Your Year in Sports")
		page.append(fromHTML(`<p class='profile'><img src="${this.data.profilePicture}"/></p>`))
		page.append(banner(this.data.year, 'large'))
		page.append(banner(this.data.name, 'medium'))
		return [page,()=>{}, () => this.mainSportDuration()]
	}

	distanceTerm()
	{
		return this.data.unit_system == 'metric' ? "kilometers" : "miles";
	}

	mainSportDuration()
	{
		let page = this.generatePage("You spent a lot of time");
		const sport = this.data.sports_by_duration[0];
		const sportData = this.data.sports[sport];
 		page.append(banner(sport, 'large hidden sport'));
		page.append(banner(humanTime(sportData.duration), 'medium hidden duration'))
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
		return [page,() => {
			gsap.timeline()
				.set('.sport', {scaleX: 0, opacity: 1})
				.to(".sport", {scaleX: 1, duration: 1, ease: "power1.in"})
				.to(".duration", {opacity: 1, duration: 1, ease: "power2.in"})
				.to(".other", {opacity: 1},
				)
			},
			() => this.mainSportDistance()
		]
	}

	mainSportDistance()
	{
		let page = this.generatePage(`You covered the most ${this.distanceTerm()}`);
		const sport = this.data.sports_by_distance[0];
		const sportData = this.data.sports[sport];
 		page.append(banner(sport, 'large hidden sport'));
		page.append(banner(this.humanDistance(sportData.distance), 'medium hidden distance'))
		page.append(
			table(() => {
				return this.data.sports_by_distance.slice(1).reduce((result, sport) => {
					return result + `<tr>
						<td>${sport}</td>
						<td>${this.humanDistance(this.data.sports[sport].distance)}</td>
					</tr>`
				}, "");
			}, 'other hidden')
		)
		return [page, () => {
			gsap.timeline()
				.set('.sport', {scaleX: 0, opacity: 1})
				.to(".sport", {scaleX: 1, duration: 1, ease: "power1.in"})
				.to(".distance", {opacity: 1, duration: 1, ease: "power2.in"})
				.to(".other", {opacity: 1})
			}, 
			null
		]
	}

	generatePage(title)
	{
		let page = fromHTML(`<div class='container'><h1>${title}</h1></div>`)

		return page
	}

	renderPage(page)
	{
		page.id = 'next'
		page.visibility = "hidden"
		this.output.append(page)
	}

	updateCurrent(nextPage)
	{
		const next = document.getElementById('next')
		const cur = document.getElementById('current')
		if(cur != null)
			cur.remove()

		if(nextPage != null)
			next.addEventListener('click', () => {this.transitionTo(nextPage())})

		next.id = 'current'
	}

	transitionTo(nextPage) {
		if(nextPage == null)
			return

		this.renderPage(nextPage[0])

		let transition = gsap.timeline();
		transition
			.set("#next", { rotate: -45 })
			.set("#next", { x: (i, t) => getOffScreenLeft(t), visibility:"visible" })
			.to("#current", {x: (i,t) => getOffScreenRight(t), rotate: 45, duration: 2, ease: "power2.in"})
			.to("#next", {x: 0, rotate: 0, duration: 2, ease: "power2.out"})
			.call(() => {this.updateCurrent(nextPage[2])})
			.call(nextPage[1])
	}

	humanDistance(distance) {
		let result = ""
		if(this.data.unit_system == 'metric')
		{
			const metersInKm = 1000;

			const kms = Math.floor(distance / metersInKm);
			if (kms >= 10)
				result = `${kms} km`
			else
				result = `${Math.floor(distance)} m`
		}
		else
		{
			// I think the units are always in meters?
			let feets = distance * 3.28084;
			const feetsInMile = 5280;

			const miles = Math.floor(feets / feetsInMile);
			if (miles > 6)
				result = `${miles} miles`
			else
				result = `${Math.floor(feets)} ft`
		}
		return result;
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

function textItem(text, classes) {
	return fromHTML(`<p class='text ${classes}'>${text}</p>`)
}

function table(populateFunc, classes) {
	return fromHTML(`<div class='table ${classes}'><table>${populateFunc()}</table></div>`)
}

function numberEnding (number) {
	return (number > 1) ? 's' : '';
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
		result += `${days} day${numberEnding(days)} `

	const hours = Math.floor(seconds / secondsInHour);
	seconds -= hours * secondsInHour;
	if(hours > 0)
		result += `${hours} hour${numberEnding(hours)} `

	const minutes = Math.round(seconds / secondsInMinute);
	seconds -= minutes * secondsInMinute;
	if(minutes > 0)
		result += `${minutes} minute${numberEnding(minutes)}`

	return result;
}

export { Wrapped }