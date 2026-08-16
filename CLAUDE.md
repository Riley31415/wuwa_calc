# general
keep your own todo checkmark list when i assign multiple tasks or steps or changes
keep code comments short only show the most important details or simplifications 
do not read my TODO.md

# implementing kits
the migration data is just a sanity check
use nanoka.cc and view the pages through chrome to get the most accurate data
however, thing like base attack =588 may be 587.5 in reality because nanoka rounds it on the website
no need to check for held stacks >0, a buff is auto removed when it reaches 0 stacks
all seperate pieces of gear like weapons and sonatas need to be able to work even if equipped on a different resonator
no need to check for overflowing stacks, its also handled by the buff system
no need to add intros to rotations, they are automatically triggered

# wording of buffs
lost on swap = lost on inactive action
if it has a short window 20s or less, have it be lost after the outro action gains stats
if an outro is lost on swap however, make it be lost BEFORE the outro action gains the stats
if it has a duration 21s or more, make it never lost aka permanent uptime
active resonators in the team = dont add the stat on inactive actions
all attribute damage bonus/amplification = just use dmg bonus/amp with no tag, not the resonators own attribute
assume all echo casts have unique names

# simplification of kits
always ask before simplifying things
avoid global 'watcher' effects where possible
its better to implement a buff using 1 buff with multiple stacks rather than multiple buffs if possible

