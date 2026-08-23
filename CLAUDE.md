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
all logic for sequences should live in the sequences gear implementation
inherent skills that only apply to specific actions should be implemented as buffs added and removed just on those actions.

# wording of buffs
lost on swap or lost on switching out = lost on inactive action, lostOnSwap method
if it has a short window 20s or less and its a self buff, have it be lost after outro via conversion
if its 20s or less and a team buff, have it be lost on the appliers next intro
if it has a duration 21s or more, make it never lost aka permanent uptime
all active resonators in the team = dont add the stat on inactive actions
all attribute damage bonus/amplification = just use dmg bonus/amp with no tag
if a team buff is based on a resonators own stats, just assume they meet the maximum stat requirement
