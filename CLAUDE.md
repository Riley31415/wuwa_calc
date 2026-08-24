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
DO NOT JUST MAKE UP FORTE VALUES IF THEY ARE MISSING. ASK ME TO PROVIDE THEM.

# wording of buffs
lost on swap or lost on switching out = lost on inactive action, lostOnSwap method
if it has a short window 20s or less and its a self buff, have it be lost after outro via conversion
if its 20s or less and a team buff, have it be lost on the appliers next intro
if it has a duration 21s or more, make it never lost aka permanent uptime
all active resonators in the team = dont add the stat on inactive actions
all nearby resonators in the team = doesnt matter if inactive
all attribute damage bonus/amplification = just use dmg bonus/amp with no tag
if a team buff is based on a resonators own stats, just assume they meet the maximum stat requirement

# nanoka data
the damage table is client-rendered, so scrape the CDN json the page fetches, not the html:
https://static.nanoka.cc/ww/<ver>/en/character/<id>.json - <ver> is in any character page's
`data-url` (3.6+365 now), <id> is 1101-1610 (scan and read `name`, it 404s on gaps). plain curl
works, WebFetch gets a 403.

skill.damage[*] is one hit: rate_lv[9] = level-10 MV x100, energy = Resonance Energy x100,
element_power = concerto x100, weakness_lvl = off-tune in engine units already.

but the unit to match against is skill.level[*], one row of the site's table. its param[0][9] is
that row's text ("22.06%*3+33.08%*2"): resolve each term to the damage entry with that MV, multiply
by the count, sum. then match an engine action to the 1-4 rows summing to its MV (brant's MA1 is
Mid-air Stage 1 + Stage 1 Flip). more than one distinct result = unmatched, don't guess.

# concerto
three sources, and a kit is only done when all three are read:

1. per-hit element_power, above.
2. flat "Concerto Regen" rows in the same skill.level[*] table (134 of them). they *add* on top -
   shorekeeper's skill is 5 hits x2.00 = 10 plus a "Concerto Regen 20" row = 30. most skills,
   liberations and intros get all their concerto this way, so they look empty from the damage
   entries alone. check every node: intros nearly all carry +10, forte circuits carry them too.
3. skill and inherent *descriptions* - qiuyuan's To Sacrifice +30, lucilla's Spotlight +20,
   cantarella's 6-per-teammate-echo-cast. substitute `param` into the {0} placeholders and grep for
   Concerto. put these in a buff via addStat(Stat.AddConcerto, n), never the action's own
   `concerto`, so a nanoka re-sync can't overwrite them.

matching regen rows to actions: a bare "Concerto Regen" is its skill's main action, a prefixed one
("Illation Concerto Regen") is that sub-action, an "Extra Concerto Regen" names its row loosely so
match on words. take the damage row from the *same skill* (MVs collide across skills - shorekeeper's
mid-air and Transmutation are both 73.96) and require the action's node/cast to match the skill's
type, or a bare regen walks onto every enhanced basic under the liberation's node. regen only ever
adds, so a proposal that lowers an existing value is a mis-match.

also: dodge counters get a hidden +10 concerto nanoka doesn't show. never write a 0 over a value
already in the kit. "Resonance Cost" is the liberation's energy cost, = the resonator's maxEnergy.

the check that catches a miss: every rotation must reach 100 concerto, or its outro can't fire.
