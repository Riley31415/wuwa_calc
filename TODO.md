
#
tier list and matrix maxxer navigation
invidual invest in matrix value

# action interface 
implement a full input interface for resonators
we already have intro/outro/dodge/jump stuff
add basic/skill etc
basically a full interface of what actions are available at any time
create a state machine to model unit kits?
inputs and timers transfer between states?
input validation for neutral state
heavy/basic inputs
find correct input buffers and hold buffer frames
find tb timeout frames
currently tb not allowed after mash,hold,
.tbCancel(), which will take priority for tb use for that section of the rotation (the first one after offtune is full takes the priority)

# cancel automation
throw an error on transforms that do not dodge cancel
may need midway position for echoes that fly up and down
throw errors on actions that could be cancelled without timeloss/position loss

# cleaning
do a big cleanup especially reducing comments but possibly adding new docs/ files as explanations

# crit fish
crit fish distribution (optimize build for a level of fishing)

# ui update
update website ui completely to use astryx

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
