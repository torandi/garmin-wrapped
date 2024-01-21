# Garmin Wrapped
A tool to create your own garmin year summary.

# Running
Download repo, and install dependencies with pip
```
pip3 install -r requirements.txt
```

And then run garmin-wrapped.py

By default the previous year is selected if the current month is July or earlier, otherwise the current year is selected.
A year can also be provide on the command line

You'll need to enter your garmin email and password the first time, so the script can download your data.
You can look at the source code here and in the dependencies to ensure yourself that its safe.

After this, start the garmin-wrapped.html page, to view your year summary. Click a page to view the next one.

# Bugs
This is currently only tested with my data for 2023, so there are sure to be bugs with other peoples data.

Non-metric data is untested, and I don't know if garmin reports that in feets or meters.

# What's next
The webpage/viewer needs some better design, but that's not my area, so improvements from others are welcome
 
