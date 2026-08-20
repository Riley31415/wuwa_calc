# general across the project
check all exports for ones that are unnecessary
reduce comment sizes and remove uncessacary comments
update README.md

# optimal calculation sub and mainstats
optimize the calculation code
have every resonator define a list of possible:
sonata, mainslot, mainstats, substats, weapons
paralelize and compute them all
you need to compute every combination for all 3 resonators in the team

# cleanup chain system

# add custom forte display
any string to display them
full max forte implementation
show overcap on the action, but internally set to max?

# action cancelling
first need to seperate on hit vs on cast effects
still procs all the on cast effects
but all the mv, energy, offtune is set to 0 so it does no damage

# make mvs accurate
transform all mvs by * 100 (so that they are all integers, no decimal places)
but still display they way they do currently
also store all concerto, energy, shields, mv, dots as integers in the object

#
add weapon refines as a field and use [r1,r2,r3,r4,r5] arrays for stats

# building swap system
actions to mark swaps, and swaps that need swapback
have outro become a triggered action

# website
buff sources finish colors, maybe give echoes white?
have a way to list non-stat adding buffs

# dodge counter concerto
research concerto from dodge counter cast add it as a custom global buff
have a list of "Global" buffs including auto tune break
remove extra concerto on the dodge counter actions

# code cleanup
remove ResonatorFactory
clean up kit.ts
clean up state.ts
clean up enemy class
complete the TODOs in stats.ts 
