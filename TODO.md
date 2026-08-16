# offtune
add offtune to resonator actions missing it

# heron
add heron 10 energy? make sure it works with echo mainslot system
full moonlit implementation, have it extend for N more actions after outro
add bell

# rework frolova auto hecates
first on is queue on next intro
then 1 action between each?
if none queue it gets instantly queued tho
insert hecate ba12 whenever none has been queued for a certain # of actions?

# action names
update all action names to the ingame names, shortened in only certain cases

# echo mainslot
3 types of markers in the rotation:
SUMMON_ECHO, TRANSFORM_ECHO, TRANSFORM_CANCEL
when the engine reads these actions it does the following behaviour:
look up the mainslot echo equipped to that team member
if that echo is a summon/transform and the action is the same, cast it 
if its a transform echo and the action was TRANSFORM_CANCEL, cast it in cancel mode

# cancel mode
first need to seperate on hit vs on cast effects
still procs all the on cast effects
but all the mv, energy, offtune is set to 0 so it does no damage


# sub and mainstats
add iteration over all combos of substats and mainstats
also maybe define combos of sonatas + 2pc + mainslot?

# add custom forte display strings
up to 2 fortes
any string to display them
move resonator colors into their individual files
full max forte implementation
show overcap on the action, but internally set to max?

#
normalize dodge counter concerto, move it into engine

# stats
complete the TODOs in stats.ts



