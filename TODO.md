
change the auto tune break into a buff?

add additive MV

make concerto, energy, offtune hover breakdowns
maybe add element + type tags to all events?

add correct buff name to jingran heavy attack mv

make TBB conversion built into the dmg formula
remove the need for special amp just handle it internally

update all action names to use the ingame names

make all buffs and gear objects, stop using string constants everywhere to reference and add them
this removes the need for a "registry"

# global buff system

have buffs define and update "users" of the buff, while only ticking once
need to think of how to fix duplicate names or 2 COV users

# stacking
make the buffs just straight up return their name?
including whatever format they like for stack counts?
figure out stack count and max stack count handling