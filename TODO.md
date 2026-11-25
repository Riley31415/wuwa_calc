
make Cast.None the default for things like coords or actions that are not cast

yields to should be a [] not () -> []. no condition should be a function.

You added Cast.None to stats.ts at 17:18 (not me), and CAST_NAME doesn't have an entry for it yet. I've left that file alone. tsc still emits, and the full run completes.

All done: every valid is now AND-joined fields plus yieldsTo. Versus the run just before the codemod, all 1,814 runs match except 5 that the Tune Break change moved (that removes the Lingyang +4%; the rest are small Tune Break shifts). There are no new errors, and one conflict is left.

The fields. A press's conditions are now:

after, notAfter, position, holds, lacks
minConcerto and minForte1–5, with matching max fields; both ends inclusive
valid, for what no field can say (a sequence, Buling's Trigram store, a wearer)
yieldsTo
The engine ANDs them, reading the chain and stand first. The codemod converted 1,022 conditions in 62 files.

yieldsTo: () => [X] means "not while X is valid with a cooldown charge ready". It replaced every !(A && B) give-way and every onCooldown(X), so the onCooldown/offCooldown reads and the duetReady()/multiReady() helpers are gone.
A variant that sets any condition field replaces all of its base's conditions.
About 150 presses keep a valid for things fields can't express. None of them mixes condition types with OR any more. One OR is left but it's within buffs only: Phrolova's Curtain Call needs Maestro or Curtain Call Ready.
yieldsTo is ignored only in the engine's lookahead read modes (the same places lacks() already reads as met).
My codemod garbled 8 conditions, and I had no backup of the files, so I repaired those 8 by hand. They were all OR cases being rewritten anyway.
The real ORs:

Sigrika: two Stage 2 presses. The chained one follows Stage 1, the Heavy, plunge, mid-air dodge counter or Intro. BA2Start is the fresh start at 50 Full Stop and also her swap-in opener there. Stage 3 follows either, and there's an "untested" comment. Her rotations played Stages 2–4 right after the Liberation, which is the fresh start, so I pointed those two places at a new BA234_START group (37 warnings otherwise).
Chisa: Eradication follows Stage 3 only. The ring-empty condition is dropped, including on Stages 2 and 3.
Jingran: Scorching Yang and Encroaching Yin are grounded with no Cleanse window up, as you said. His rotation casts them right after Soul Raid and Stardome Meander, where that doesn't hold, so 58 runs now warn.
Qiuyuan: the Skill condition was !isHeld(QY_S3) || concerto() < 10000 || holds(INKSPLASH), which means "not while S3's Straw Cape is valid". Straw Cape takes the Skill at full Concerto outside Inksplash of Mind. So it was a give-way, now yieldsTo: [StrawCape]. Mornye's Skill was the same kind (it gives way to Distributed Array).
Your other two:

No Tune Break during a transform's window. The one spot it could land (taking a cut press's place) now checks the window.
Chisa's Serrated Loop half hold is deleted. The full hold was already on the Skill hold input.
Still left:

Lynae's Palettes vs Additive Color on the Skill input, waiting on her S6 rotation.
Rotations that now warn: Lynae S6 Spark Collision (120 runs), Aemeath Charged II (37), Cantarella Flickering Reverie (31), Jingran (58), Roccia S6 Fail (19).
The docs are updated for the fields and yieldsTo. Nothing is staged or committed.

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
nav bar
clean up alignment of README
remove changing gear within loadout view
invidual invest in matrix value
much better ui
add best weapons as a list
add best sequences as a list

# rework the ActionTag system into "Transition" system
we will rename the current cancel/tag system to a transition system
transitions tell us the delay between the current action and the next, and validate input delay/buffer
all actions must have a transition

this will also validate the type of input used to make the next action.
set INPUT_PRECISION = 12f, this is the average delay a user has when aiming for a precise cancel
set INPUT_SPEED = 9f, we will assume the user can click any input ~7 times per second
we already have HOLD_BUFFER = 17f, this means you must press (creating an input), then hold for 17f to create continuous hold inputs after
ideally, you want to begin this hold input during another action with higher priority, so that once the priority lowers, a hold input instantly begins the held input action
otherwise, we would press, wait 17f, then the hold goes off, cancelling the previous 17f action

remove all old cancel related errors, we will redefine them under the new transition system:

new list of transitions:

off field (same as the previous action tag)



# cancel automation
enforce hold duration
throw an error on transforms that do not dodge cancel
may need midway positioning for echoes that fly up and down
throw warnings on actions that could be cancelled without timeloss/position loss (positional state known at compile time, )

create an available list of transitions to use after the next action is chosen



# tb stuff
find tb timeout frames (cant tb after lib/intro etc)
currently tb not allowed after mash,hold,
.tbCancel(), which will take priority for tb use for that section of the rotation (the first one after offtune is full takes the priority)

# cleaning
do a large scale cleanup of helper methods and things in the engine
reorganize the file structure to reduce the number of circular import workarounds
move helpers to be in seperate files from the actual engine
move src/tuning and explorer to a tools/ in the main project directory

# to get from wuwalab
all swap ins
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
