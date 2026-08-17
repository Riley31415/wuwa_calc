# offtune
add offtune to resonator actions missing it
buling, brant

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

#
delete DamageConfig, use a constant RESONATOR_LEVEL = 90 just like the dot and tune constants

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


#
normalize dodge counter concerto, move it into engine

# enemy class
needs to be cleaned up its a mess

# stats
complete the TODOs in stats.ts

# todo
move sonata, mainslot, 2pc into 3 files under shared/: echoes1x, echoes2x, echoes3x corresponding to the major version release
move weapons into weapons1x, weapons2x, weapons3x corresponding to the major version release
move current weapons into weapons0x for standard weapons.

# characters that need tune implementation
mornye https://ww.nanoka.cc/character/1209 (maybe implement without any tune aspects first?)
denia https://ww.nanoka.cc/character/1211 (maybe implement without any tune aspects first?)
aemeath https://ww.nanoka.cc/character/1210
rebecca https://ww.nanoka.cc/character/1308
qingxiao https://ww.nanoka.cc/character/1413
lucy https://ww.nanoka.cc/character/1511
luuk https://ww.nanoka.cc/character/1510
lynae https://ww.nanoka.cc/character/1509

# characters that need dot implementation
chisa https://ww.nanoka.cc/character/1508
suisui https://ww.nanoka.cc/character/1110
hiyuki https://ww.nanoka.cc/character/1108
electro rover https://ww.nanoka.cc/character/1310
ciaconna https://ww.nanoka.cc/character/1407 (maybe impl without dot)
xuanling https://ww.nanoka.cc/character/1610 
zani https://ww.nanoka.cc/character/1507
phoebe https://ww.nanoka.cc/character/1506
spectro rover https://ww.nanoka.cc/character/1502
aero rover https://ww.nanoka.cc/character/1408 
cartethiya https://ww.nanoka.cc/character/1409

# less important chars
jinhsi https://ww.nanoka.cc/character/1304
havoc rover https://ww.nanoka.cc/character/1605
camellya https://ww.nanoka.cc/character/1603
danjin https://ww.nanoka.cc/character/1602

# characters to implement now


https://ww.nanoka.cc/character/1606 roccia
https://ww.nanoka.cc/weapon/21040026 roccia weapon

https://ww.nanoka.cc/character/1412 sigrika
https://ww.nanoka.cc/weapon/21040066 sigrika weapon

https://ww.nanoka.cc/character/1208 galbrena
https://ww.nanoka.cc/weapon/21030036 galbrena weapon

https://ww.nanoka.cc/character/1205 changli
https://ww.nanoka.cc/weapon/21020016 changli weapon
https://wuwalab.com/characters/changli/

https://ww.nanoka.cc/character/1203 encore (standard 5*, implement all her sequences, use stringmaster as her weapon)
https://ww.nanoka.cc/character/1405 jianxin (standard 5*, implement all sequences and use marcato R5 as her weapon)
https://ww.nanoka.cc/character/1503 verina (standard 5*, implement all sequences and use variation R5)

# add additional weapons from characters we arent implementing yet
move stringmaster to yinlin.ts (we wont implement yinlin herself tho)
https://ww.nanoka.cc/weapon/21040016 xiangliyao.js
https://ww.nanoka.cc/weapon/21010026 jinhsi.js
https://ww.nanoka.cc/weapon/21010016 jiyan.js