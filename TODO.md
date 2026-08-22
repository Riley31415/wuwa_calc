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
re add chains, more simple definition,
make triggered actions from chains move into the correct place after opening the dropdwon

# make mvs accurate
transform all mvs by * 100 (so that they are all integers, no decimal places)
but still display they way they do currently
also store all concerto, energy, shields, mv, dots as integers

# building swap system
actions to mark swaps, and swaps that need swapback
have outro become a triggered action

# code cleanup
complete the TODOs in stats.ts 

# echoes
update transform echoes to be inactive or cancelled
heron 10 er


# rework frolova auto hecates
first on is queue on next intro
then 1 action between each?
if none queue it gets instantly queued tho
insert hecate ba12 whenever none has been queued for a certain # of actions?


#
add "er rolls needed" to substats

#
mark concerto red on outro if not enough

# 
implement all tune

#
implement all statuses
#
carlotta deconstruction should be a debuff class (purple for readability) and also should end after outro via conversion.

update all echoes and weapons to be Gear not Buffs where applicable. also make Weapons a new Weapon class that extends gear and has a WeaponType field.