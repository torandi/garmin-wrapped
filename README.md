# Garmin Wrapped
End goal: A two stage tool: A python script to download and generate stats, and a html + json page to view a "fancy" garmin wrapped

# Current State
Currently only the python script is done (?), and produces a garmin-wrapped.json file with some summarized data.

# Running
Download repo, and install dependencies with pip
```
pip3 install -r requirements.txt
```

And then run garmin-wrapped.py

By default the previous year is selected if the current month is July or earlier, otherwise the current year is selected.
A year can also be provide on the command line

# Bugs
This is currently only tested with my data for 2023, so there are sure to be bugs with other peoples data
 
