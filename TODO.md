# TODO
better chain save system
better system to detect dimmed/offfield actions than just input.none - remove onField? field that was added
 and optionally may insert the currently valid dash or tunebreak after if it would reach the next action faster, and the next action would still be valid after the dash.

# action interface 
enforce start of fight no swapin

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

optimizer must decide between DPS or DPR based loadout choices

# clean up matrix value and tier list
back button use the <  not <-
nav bar
clean up alignment of README
remove changing gear within loadout view
invidual invest in matrix value
much better ui
add best weapons as a list
add best sequences as a list

# automation of transitions
transitions will now be fully automated, and computed by the engine at runtime according to our intended timing:
until we fully verify the system, keep the old cancel tags to check that our new system finds them all

no more off field tag, the action log should instead check for actions with input.none or input.outro or whatever to dim them

we can no longer write out .whateverCancel(), instead we write our intended timings, the engine solves for the transition
we must also write out manual DASH/JUMP/SWAP where needed rather than it being part of a timing or cancel

Timing enum: (also .instant(), .firstHit(), .timed(frame))
lastcommit (default) - cut at last commit or later
instant - cut at exactly INPUT_PRECISION, error at rotation compile time if last commit <= INPUT_PRECISION
firsthit - cut at exactly on the first bullet + INPUT_PRECISION error at rotation compile time if first bullet is on or before INPUT_PRECISION, use instant instead, error if first bullet + INPUT_PRECISION >= last commit, use lastcommit instead
timed - cut at a specific frame

next, while running a rotation and knowing the intended timing for an action + the next action,
the engine must solve for the cut frame,

2 paths, for non-hold input:
for instant,firsthit,or timed, check if the action input is valid at the intended frame, if its not throw an error otherwise thats the cut

for lastcommit: 
starting at lastcommit - INPUT_PRECISION, find the first place where the input is valid. (do not check frames <0 aka before the cast, firstvalidframe is at most equal to the total animation length)
let num_invalid_frames = firstvalidframe - Max(0, lastcommit - INPUT_PRECISION)
if num_invalid_frames < INPUT_PRECISION:
cut at lastcommit+INPUT_PRECISION, throw an error if it is not valid at that exact frame saying "cancel automation failed"
else:
cut at firstvalidframe + MASH_SPEED, throw an error if it is not valid at that exact frame saying "cancel automation failed"

however if the result of the above cuts > animation length AND the action chains into the next, set the cut to the animation length

for hold input:
if timing is instant, throw an error saying hold cancel cannot achieve the timing

for timed, first check that at intended_time - HOLD_BUFFER, the corresponding non-held input would be invalid
 (if that would be a frame <0, throw an error that we cannot achieve this timing with a hold input)
then check that at the intended_time, this intended action is valid. if both succeed, we cut at that time.

for first hit, first check that at intended_time - HOLD_BUFFER - INPUT_PRECISION, the corresponding non-held input would be invalid
 (if that would be a frame <0, throw an error that we cannot achieve this timing with a hold input)
then check that at the intended_time, this intended action is valid. if both succeed, we cut at that time.

for lastcommit into hold:
starting at lastcommit - INPUT_PRECISION - HOLD_BUFFER, find the first place where the non-hold input action is valid. (do not check frames <0 aka before the cast, firstvalidframe is at most equal to the total animation length)
let num_invalid_frames = firstvalidframe - Max(0, lastcommit - INPUT_PRECISION - HOLD_BUFFER)
if num_invalid_frames < INPUT_PRECISION + HOLD_BUFFER:
throw an error saying not enough room to buffer hold
else:
starting at lastcommit, find the first place where the held input becomes valid (call it firstholdvalid)
if firstholdvalid > firstvalidframe, throw an error saying valid hold is too late
otherwise the cut frame will be firstholdvalid

no more enum for cancel types, we will display cancel tags in the log as follows, depending only on the cut frame and next input:
(no tag if cut >= animation time)
color = red if cut <= INPUT_PRECISION
yellow if cut > INPUT_PRECISION and < last commit
blue if cut > INPUT_PRECISION and >= last commit
display DASH/JUMP/SWAP in the name if the next action is an input of one of those 3 types, otherwise just cancel
no more insta/mash/onhit naming
just display "@ [n]f" at the end of the cancel tag, where n is the cut

once we verify the system, we will remove all the old manual cancel assignment and errors.


# tb stuff
find tb timeout frames (cant tb after lib/intro etc)
currently tb not allowed after mash,hold,
.tbCancel(), which will take priority for tb use for that section of the rotation (the first one after offtune is full takes the priority)

# cleaning
do a large scale cleanup of helper methods and things in the engine
reorganize the file structure to reduce the number of circular import workarounds
move helpers to be in seperate files from the actual engine
move src/tuning and explorer to a tools/ in the main project directory
set a maximum line length of 120 characters for code files (.ts)
max file length: 1000 lines
remove all of the huge comments at the top of resonator files. only add the explanatory comments above the relevant buffs or actions
try to clean up extraneous or oneoff/workaround fields added to various classes/interfaces

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

# rankings
rank teams by mdps sig gain
rank teams by best subdps sig gain
rank by best high invest substats gain

# crit fish
crit fish distribution (optimize build for a level of fishing)
bar to choose number of runs attempted
