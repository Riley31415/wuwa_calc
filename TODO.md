
#
make echo actions resolvers that play only if their mainslot echo is equipped (create a template one for all echo actions to use)
mainslot no longer points to echo, the echo action points to the required mainslot
delete the current ECHO placeholder action and related logic, replace them with every mainslot that character may have.
fully implement echo frames

#
preferred TB placement
implement action chain restriction. after this, remove the restriction of not casting it during action groups.
currently tb not allowed after mash,hold, cancels
remove midair special case for tb, instead it will check if the next action needs ground/air and allow tb if tb puts them in that spot
.no_tb marker removal.
swapin and air swaping replace nointro
midair and grounded state + restriction
.tbCancel(), which will take priority for tb use for that section of the rotation (the first one after offtune is full takes the priority)


#
restrict 44111 when no 2 4 costs

#
get sk/mornye field buff time (and for other fields/buff starts)
maybe check buling frames/cancels

#
find correct input buffers and hold buffer

#
add resonator, weapon, sonata, attribute, damage type, images

#
individual bullet in logs

#
rank teams by substats gains or sequences gains or weapon gains etc
rank teams by mdps sig gain
rank teams by best subdps sig gain
rank by best high invest substats gain
rank by best sequence gain
have it re order teams?
add costs and max cost filter and ranking

# standard 5 star/4 star
calcharo
lingyang
chixia
yuanwu
youhu
baizhi
luumi
taoqi
yangyang
aalto 