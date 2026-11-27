#
re add delay frames in time hover

#
better chain save system
maybe Input.Forced for brant flips, and make sure his MA4 chains from MA3 flip, which chains from MA3
better system to detect dimmed/offfield actions than just input.none - remove onField? field that was added
and optionally may insert the currently valid dash or tunebreak after if it would reach the next action faster, and the next action would still be valid after the dash.

#
create a "team building" filter system
make sure it still has search bars and keyboard shortcuts to access
fix compare weapon in multiple slots table too large
remove pins

#
define the goals of the site
123 rotations, or double intro
aim for 
opener may insert a reasonable amount of buildup for the maindps: carlotta, yangyang etc
make cancels more casual friendly
remove "DPR comparisons do not account for rotation time!"

move the loading screen inside the menus rather than blurring the whole page

optimizer must decide between DPS or DPR based loadout choices

# missing resources
fully implement current HP, healing
implement vibration bar
implement stamina, 
midair jump restriction

# clean up matrix value and tier list
nav bar
clean up alignment of README
improve ui for gear change in loadout view
have a team dpr and dps number on the side
invidual invest in matrix value
much better ui
add best weapons as a list
add best sequences as a list

# tb stuff
find tb timeout frames (cant tb after lib/intro etc)
currently tb not allowed after mash,hold,
.tbCancel(), which will take priority for tb use for that section of the rotation (the first one after offtune is full takes the priority)

#
suoming ba12 rot

#
allow eg verina s2 rot when ER allows

# cleaning
do a large scale cleanup of helper methods and things in the engine
reorganize the file structure to reduce the number of circular import workarounds
move helpers to be in seperate files from the actual engine
move src/tuning and explorer to a tools/ in the main project directory
set a maximum line length of 120 characters for code files (.ts)
max file length: 1000 lines
remove all of the huge comments at the top of resonator files. only add the explanatory comments above the relevant buffs or actions
try to clean up extraneous or oneoff/workaround fields added to various classes/interfaces

after cleaning, work on optimization of the engine, especially all of the new transition and input system

do not ask any questions, if you are unsure on something leave it in a final report

# to get from wuwalab
all swap ins
new frames
hitlag
transform echo noinput duration
lingyang cancels research

# waiting for wuwalab
chixia
yuanwu
youhu
luumi
calcharo
aalto
jianxin - frames
havoc rover - frames
taoqi - check rotation
yinlin jiyan - frames
xly - frames

# rankings
rank teams by mdps sig gain
rank teams by best subdps sig gain
rank by best high invest substats gain

# crit fish
crit fish distribution (optimize build for a level of fishing)
bar to choose number of runs attempted
