# substats
allow 44111 with er builds eg for brant
add individual stat instances in the substats for each line eg ER 7.9% x2 in hover
basically each line of substats should be its own instance of gear, but they are static/constant so still optimized

new chem substat constructor:

substats(stat1, stat2, stat3, stat4, stat5)
stat1 and 2 will get 5 lines (almost all characters use cr, cd)
stat3,4,5 will get 2 lines (usually atk, dmg%, flat atk)

lets add a new box and checkmark for an option "High Invest Substats" for mdps, and for supports
this will switch all those resonators to use those substats.

rules for the substats:
cd =17.4
cr = 8.7
dmg = 9.4
atk = 9.4
flatatk = 50
er = 10%
https://wutheringwaves.fandom.com/wiki/Echo/Stats

they will use 5x cr, 5x cd, 4x dmg%, 4x atk%, 2x flat atk, 2x er

#
add all sequences and R5 weapons

#
add costs and max cost filter

# naming
standardize action naming
standardize sequence naming
cleanup all (team) (self) (whatever) buffs
make some buffs nameless if they dont add stats
