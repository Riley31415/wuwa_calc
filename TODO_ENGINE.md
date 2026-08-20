# rework of all classes
TeamMember replaces Loadout:
now holds an instance of a Resonator class along with all the gear pieces
all pieces of gear should have their own instances

# note
we will inject the ctx pointer into all buffs when they are created so they dont need to pass it around

# events

onCast(Cast, Target, Buff)
onHit(Type1 | Type2, Target, Buff)
onEvent(Event, Target, Buff)
onApply(Debuff, Target, Buff)
onAction(Action, Target, Buff)

enum Event {
    HealAlly
    GainShield
    ConsumeStatus
}

debuff includes havoc bane, glacio chafe, etc which will apply real debuffs to enemy

# target
Self - applys buff to self
Next - adds buff to outro queue
Global - adds buff to global list
Other - remove this target, replace with a system that adds a global buff and removes it when the holder intros

# buffs: new shape
class CustomBuff {
    name: string
    duration: Duration
    stat: StatType
    value: () -> number
}
use this for conversion buffs or other niche buffs

class StackingBuff extends Buff {
    maxStacks: integer = 1
    stacks: integer = 1
    values: [number]
    value: () -> len(values) == 1 ? values[0] * stacks : values[stacks - 1]
}

if the list has 1 value, multiply that value by the stack count
if the list has multiple values, use the index of the stack count (1 stack = index 0)
any value of 0 wont even be added

# durations are auto handled by the engine
enum Duration {
    PERMANENT
    SINGLE_ACTION
    LOST_ON_SWAP
    LOST_AFTER_OUTRO
}
