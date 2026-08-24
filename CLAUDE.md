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

# on nanoka.cc Damage Data Table
the site is sveltekit and renders that table client side, so the page html has nothing in it - pull
the CDN json the page fetches instead: https://static.nanoka.cc/ww/<ver>/en/character/<id>.json,
where <ver> is the version in any character page's `data-url` attributes (3.6+365 at time of
writing) and <id> is in 1101-1610 (scan the range and read `name`; it 404s where there is no
character). every skill_trees[*].skill.damage[*] entry is one hit: rate_lv[9] is the level-10 MV
x100, energy is Resonance Energy x100, element_power is Concerto x100, and weakness_lvl is off-tune
already in this engine's units. an engine action covering several hits sums them - hits whose damage
id is identical except for its last two digits are usually one stage, but do not group on that -
the real unit is skill.level[*], which is one row of the site's table. its param[0][9] is that row's
level-10 text, e.g. "22.06%*3+33.08%*2" or "33.25%+49.87%+41.56%*6": resolve each term to the damage
entry with that MV, multiply by the term's count, and sum, and you have that row's own MV, energy,
concerto and off-tune exactly as the site shows them. then match an engine action to the combination
of rows summing to its MV (one to four rows covers ~90% of them; brant's MA1 is Mid-air Stage 1 +
Stage 1 Flip, MA1H adds the Charged row on top). treat anything matching more than one distinct set
of values as unmatched rather than guessing. element_power is 0 on plenty of skills and liberations
where the game grants concerto some other way, so never write a 0 over a value already in the kit.
plain curl works; WebFetch gets a 403.
Elemental DMG = concerto
Weakness Break DMG = offtune
Dodge Counters: add hidden 10 bonus concerto for dodge counters not shown on nanoka

# concerto regen rows
element_power on the damage entries is not the whole of an action's concerto. the same
skill.level[*] table also carries non-damage rows - "Concerto Regen", "Resonance Cost", the STA
costs, cooldowns - whose param is a flat number rather than a percentage, and the Concerto Regen
ones are real concerto the action grants on top of its per-hit element_power. shorekeeper's skill
is the worked example: chaos theory is 5 hits of Dim Star Butterfly at 2.00 each = 10, plus a
"Concerto Regen 20" row, = 30. 134 of these rows exist across the roster and most skills,
liberations and intros get all their concerto this way (element_power is 0 on them), which is why
they look empty if you only read the damage entries. a row named just "Concerto Regen" belongs to
its skill's main action; one prefixed with a sub-action ("Illation Concerto Regen", "Discernment
Concerto Regen") belongs to that sub-action. "Resonance Cost" is the liberation's energy cost and
should equal the resonator's own maxEnergy.

check every node, not just the skill and the liberation - the intro nodes almost all carry one
(+10 usually), and forte circuits carry them too (sigrika's "Forte Circuit - Learn My True Name
Concerto Regen 10", brant's "Returned from Ashes" +20). a forte circuit can also carry "Extra
Concerto Regen" rows that name their action loosely - iuno's "Moonbow - Basic Attack 1 Extra
Concerto Regen 4" belongs to the "Enhanced Moonbow - Basic Attack 1 DMG" row - so match on the
words rather than on a substring. two rules keep the matching honest: take the damage row from the
*same skill* as the regen row (MVs collide across skills - shorekeeper's mid-air and Transmutation
are both 73.96), and require the engine action's node/cast to match the skill's type, or a bare
regen walks onto every enhanced basic tagged with the liberation's node. a regen row only ever
*adds* concerto, so a proposal that lowers an existing value is a mis-match, not a correction.

# concerto in the kit text
the attribute table is not the last word either. skill and inherent *descriptions* grant flat
concerto that appears in no row at all - qiuyuan's Quietude Within ("Thus Spoke the Blade: To
Sacrifice additionally restores 30 of Concerto Energy on hit"), lucilla's Phantom Frame and Clear
As Day (20 each for Spotlight and Letting It Go), cantarella's Between Illusion and Reality (6 a
time, up to 6, off any teammate's echo skill). so a kit's concerto has three sources: per-hit
element_power, the flat Concerto Regen rows, and the text. read the descs with their `param` array
substituted into the {0} placeholders and grep them for Concerto before calling a kit done. put
these in a buff via addStat(Stat.AddConcerto, n) rather than in the action's own `concerto`, so a
later nanoka re-sync cannot overwrite them. the check that catches a miss: run every rotation and
see whether it reaches 100 concerto - it has to, or the outro cannot fire.
