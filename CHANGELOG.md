# Changelog

## 3.0.1 - 2026-06-21

	- change : 33 cL label
	- fix : css weekly ranking
	- fix : ranking card alignment and table header weight
	- fix : remove year on dates timeline
	- fix : 33cl display in top evening

## 3.0 - 2026-06-20

🚀 BeerTracker becomes Zytholo, bringing a fresh identity, modernized interface and new features !

🌙 (Auto) dark mode is now available !

⚙️  The app now has a menu that lets you adjust settings !

📈 Compare your beer consumption with that of other drinkers !

---
⚠️ **Breaking change** :  We are migrating from SQLite to MySQL. You must export the data to CSV before updating, and reimport it after updating; otherwise, **all consumptions data will be lost**.


	- add : navigation menu
	- add : dark mode
	- add : settings menu
	- add : dahsboard can now be exported in a png file
	- add : buttons to view consumption figures for the current month or year
	- add : admin panel - add a button to force user to change password
	- add : new setting : average price of a beer 
	- add : new setting : alert threshold
	- add : new setting: consumption days alert threshold
	- add : record-breaking evening
	- add : timeline can show all users consumption
	- add : consumption of the day
	- add : arrows to change current date
	- change : the dashboard theme has been updated
	- change : migrate from SQLite to MySQL
	- change : change password is now a pop up
	- change : temporary password for imported user
	- change : change password is now mandatory when an user has been imported
	- change : total timeline is now displayong all days of the selected period
	- change : optimize desktop version
	- fix : monthly consumption chart did not show all the beers
	- fix : total timeline cannot display dates later than the current date
	- fix : total timeline cannot display dates before the first consumption
	- fix : fix bug in 3 days consumption when removing a beer
	- fic : login page on safari

## 2.3.1 - 2026-05-25
	- fix : Hide other users ranking when no one drank in period

## 2.3.0 - 2026-05-22
	- add : weekly ranking
	- add : ranking for other users
	- change : no more medal for non drinkers
	- change : message if no drinker for a ranking
	- change : syntax modifications

## 2.2.0 - 2026-05-17
	- fix : display bug in the header with Safari / iOS
	- fix : ex-aequo are now displayed together on the same medal 
	- change : rankings are updated automatically without reloading the page
	- fix : text align center for title in the dashboard
	- change : full timeline now indicate the period in the title
	- change : full timeline graph has been moved

## 2.1.0 - 2026-04-29
	- add : top 3 consummers of current month

## 2.0.0 - 2026-04-09

🇬🇧 BeerTracker is now avaiable in English !

🥇The list of the top 3 drinkers of the user dashboard has been replaced by medals

	- add : language is automatically detected based on your browser settings
	- add : button to manually switch between English and French
	- del : detailed list of the top 3 consumers
	- add : Medals for the heaviest drinkers (requires at least two users)

## 1.1.1 - 2026-03-11
	- change : dashboard - alerts are now displayed at the top of the page

## 1.1.0 - 2026-03-04
	- add : add favicon
	- add : check if user is already connected
	- add : display users stats on dashboard for current year
	- add : display beertracker version on login footer
	- change : stats on admin panel are displayed only for current year
	- change : refreshing admin page no longer resubmits a user creation or import

## 1.0.0 - 2026-03-02

	- First stable version
