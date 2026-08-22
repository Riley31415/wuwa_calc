# general
do not read TODO.md
keep comments to 1-2 lines at most
do not screenshot websites, load and read the page as a human would

# implementing kits
the migration folder data is just a sanity check, use it to get action MVs too
use nanoka.cc and view the pages through chrome to get the most accurate data
no need to check for overflowing stacks, its also handled by the buff system
no need to add intros to rotations, they are automatically triggered
do not manually implement forte deltas, use forte1 forte2 etc on actions.
forte on actions can be negative when consumed. do not enforce bounds/maximums.
follow conventions of resonators and gear implemented previously

# wording of buffs
lost on swap = lost on inactive action, lostOnSwap method
if it has a short window 20s or less, have it be lost after outro cast via conversion
if an outro is lost on swap however, make it be lost during updateBuffs
if it has a duration 21s or more, make it never lost aka permanent uptime
all active resonators in the team = dont add the stat on inactive actions
all attribute damage bonus/amplification = just use dmg bonus/amp with no tag
