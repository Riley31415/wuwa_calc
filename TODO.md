# heron
add heron 10 energy? make sure it works with echo mainslot system
full moonlit implementation, have it extend for N more actions after outro
add bell

# rework frolova auto hecates
first on is queue on next intro
then 1 action between each?
if none queue it gets instantly queued tho
insert hecate ba12 whenever none has been queued for a certain # of actions?

#
check all exports for ones that are unnecessary

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
transform all mvs by * 100 (so that they are all integers, no decimal places)
but still display they way they do currently
also store all concerto, energy, shields, mv, dots as integers in the object

# building swap system
actions to mark swaps, and swaps that need swapback
have outro become a triggered action

#
buff sources finish colors, maybe give echoes white?

#
normalize dodge counter concerto, move it into engine

#
remove ResonatorFactory

# 
clean up kit.ts

# enemy class
needs to be cleaned up its a mess

# stats
complete the TODOs in stats.ts 

#
have a way to list non-stat adding buffs

# characters that need tune implementation
mornye https://ww.nanoka.cc/character/1209 (maybe implement without any tune aspects first?)
denia https://ww.nanoka.cc/character/1211 (maybe implement without any tune aspects first?)
https://ww.nanoka.cc/weapon/21050076
aemeath https://ww.nanoka.cc/character/1210
rebecca https://ww.nanoka.cc/character/1308
qingxiao https://ww.nanoka.cc/character/1413
lucy https://ww.nanoka.cc/character/1511
luuk https://ww.nanoka.cc/character/1510
lynae https://ww.nanoka.cc/character/1509

# characters that need dot implementation
chisa https://ww.nanoka.cc/character/1508
suisui https://ww.nanoka.cc/character/1110
https://ww.nanoka.cc/weapon/21050096
hiyuki https://ww.nanoka.cc/character/1108
electro rover https://ww.nanoka.cc/character/1310
ciaconna https://ww.nanoka.cc/character/1407 (maybe impl without dot)
xuanling https://ww.nanoka.cc/character/1610 
zani https://ww.nanoka.cc/character/1507
phoebe https://ww.nanoka.cc/character/1506
https://ww.nanoka.cc/weapon/21050027/ at R5
https://ww.nanoka.cc/weapon/21050046
spectro rover https://ww.nanoka.cc/character/1502
aero rover https://ww.nanoka.cc/character/1408 
https://ww.nanoka.cc/weapon/21020046/
cartethiya https://ww.nanoka.cc/character/1409

# needs coords
jinhsi https://ww.nanoka.cc/character/1304

# todo fix these kits
Galbrena
Sigrika
Roccia
Changli 
Encore 
Verina
Jianxin 
havoc rover
cammelya
danjin
add offtune to resonator actions missing it

check old sonatas
check all sonata buff names, 2pc, 5pc
fix skill chain names