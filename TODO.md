#
create a "team building" filter system
make sure it still has search bars and keyboard shortcuts to access
fix compare weapon in multiple slots table too large
remove pins

#
one dps per team
make cost modes stricty apply to that mdps

#
dps over dpr

#
enforce start of fight no swapin

#
test viable 5 libs

#
nav bar
clean up alignment of README
tier list ui

#
remove changing gear within loadout view

#
invidual invest in matrix value
much better ui
add best weapons as a list
add best sequences as a list

# cancel automation
enforce hold duration
throw an error on transforms that do not dodge cancel
may need midway position for echoes that fly up and down
throw warnings on actions that could be cancelled without timeloss/position loss
rework cancel/tag system into "transitions" define ways to transition to the next action (make mash 6f)
allow mashing past an animation finish
lib -> mash adds 3f delay

# action interface 
implement a full input interface for resonators
we already have intro/outro/dodge/jump stuff
add basic/skill etc
basically a full interface of what actions are available at any time, built through functions. make resonators more of a class.
input validation for neutral state
heavy/basic inputs
find tb timeout frames (cant tb after lib/intro etc)
currently tb not allowed after mash,hold,
.tbCancel(), which will take priority for tb use for that section of the rotation (the first one after offtune is full takes the priority)

# cleaning
do a big cleanup especially reducing comments but possibly adding new docs/ files as explanations

# crit fish
crit fish distribution (optimize build for a level of fishing)
bar to choose number of runs attempted

#
lingyang cancels research

# rankings
show all teams
show best supports
show best team per mdps
rank teams by substats gains or sequences gains or weapon gains etc
rank teams by mdps sig gain
rank teams by best subdps sig gain
rank by best high invest substats gain
rank by best sequence gain
have it re order teams?
add costs and max cost filter and ranking

# resonators to implement
taoqi

# waiting for wuwalab
chixia
yuanwu
youhu
luumi
calcharo
aalto
jianxin
havoc rover
