# Phoebe's input blueprint (WuWa 3.8.13)

How the game turns Phoebe's key presses into skills, as the client's input blueprint describes it. Source: the
game's blueprint bytecode (`BP_Input_Feibi`), parsed into statements by the WuwaLab parser; skill names are WuwaLab's.

## How input works

- **Key events.** Every key (Attack, Skill, Liberation, Dodge, Echo...) fires three kinds of event: **press** (the
  key goes down), **hold** (fired once the key has been down longer than its hold time) and **release** (the key comes
  up). Each event calls one blueprint function, named key + event: `攻击按下` is Attack press, `攻击长按` Attack hold,
  `攻击抬起` Attack release (`技能1` is the Skill key, `大招` Liberation, `闪避` Dodge).
- **What a function does.** It reads the character's state (gameplay tags, whether it is on the ground, whether the
  running skill's chain window is open, gauges) and returns an input command, usually `CreateSkillCommand(skill id)`:
  "start this skill". Returning nothing means the key does nothing now.
- **The chain.** Blueprints inherit: `BP_Input_Feibi` (Phoebe's own) → `BP_InputComponent` (every character's
  defaults: jump, dodge, echo...) → `BP_InputBase`. A function Phoebe's blueprint does not define comes from the parent.
- **After the blueprint.** The game picks the command with the highest skill priority among the frame's events and
  tries to start it; the skill still has to pass the skill gate (the running skill's priority, chain window). An event
  that gave no command is kept in an **input cache** for its cache time and asked again at the running skill's break
  points (chain window opening, EndSkill), which is how buffering works.

## Hold and cache times (seconds)

| Key | Hold fires after | Press cached | Release cached | Hold cached |
|---|---|---|---|---|
| Attack (`攻击`) | 0.2 | 0.3 | 0.3 | 0.3 |
| Skill (`技能1`) | 0.2 | 0.3 | 0.3 | 0.3 |
| Liberation (`大招`) | — | 0.3 | 0.0 | 0.0 |
| Dodge (`闪避`) | — | 0.3 | 0.0 | 0.0 |
| Echo (`幻象1`) | 0.35 (repeats) | 0.3 | 0.0 | 0.0 |
| Jump (`跳跃`) | — | 0.3 | 0.0 | 0.0 |

Phoebe's Attack and Skill keep their release in the cache too (most characters only cache presses), and both have a
0.2 s hold: her attacks and skills come out on **release** (a tap) or **hold**, not on press.

## Reading the listings

Each line is one statement, `@N` its bytecode offset. `▸` marks a line something jumps to.

- `x = f(...)` calls a function; `ReturnValue = ...` sets what the function returns.
- `if not (x): goto @N` skips ahead when the condition is false (UE's JumpIfNot).
- `push resume point @N` / `if not (x): resume at the last pushed point`: UE's execution-flow stack, used by
  Sequence nodes and loops (run a branch, then come back).
- `CreateSkillCommand(id)` is the command; the skill's name follows it.
- Common reads: `HasMatchingGameplayTag(tag)` (has the tag), `HasAnyMatchingGameplayTags(tags[...])` (has any),
  `IsMovingOnGround()`, `GetSkillAcceptInput()` (the running skill's chain window is open),
  `GetCommonSkillCanBeInterrupt()` (the running skill reached its EndSkill), `CanResponseInput()` (not stunned or
  input-locked), `GetNextMultiSkillId(id)` (which part of a two-part skill comes next),
  `GetAttributeCurrentValue(id)` (a gauge).

Tag names are the game's own; a few that matter here: `行为状态.位置状态.空中` in the air, `行为状态.位置状态.地面` on the
ground, `角色.Common.技能通用标识.极限闪避` perfect dodge. The `角色.3f9237d8...` tags are Phoebe's own states (her
Absolution / Confession modes, the Ring of Mirrors, her Basic 3 state); their names are hashed in the client.

## Attack press (`攻击按下`)

```text
     @0  ____ = 攻击按下(0.0)
    @33  if not (self.通用_攻击按下): goto @74
    @47  ReturnValue = ____
▸   @74  return ReturnValue
    @84  return ReturnValue
```

## Attack hold (`攻击长按`)

```text
     @0  ____ = 攻击长按(time)
    @37  if not (self.通用_攻击按下): goto @83
    @51  ReturnValue = ____
    @78  goto @3097
▸   @83  CanResponseInput = CanResponseInput()
   @161  if not (CanResponseInput): goto @3097
   @175  MakeLiteralGameplayTagContainer_7 = MakeLiteralGameplayTagContainer(tags[角色.3f9237d8.逻辑.动作前摇])
   @258  HasAnyMatchingGameplayTags_7 = HasAnyMatchingGameplayTags(MakeLiteralGameplayTagContainer_7)
   @336  if not (HasAnyMatchingGameplayTags_7): goto @355
   @350  goto @3097
▸  @355  EqualEqual_ByteByte = EqualEqual_ByteByte(OwnerActor.CharacterMovement.CustomMovementMode, 5)
   @430  EqualEqual_ByteByte_1 = EqualEqual_ByteByte(OwnerActor.CharacterMovement.MovementMode, 6)
   @505  IsMovingOnGround = IsMovingOnGround()
   @573  BooleanAND = BooleanAND(EqualEqual_ByteByte_1, EqualEqual_ByteByte)
   @611  BooleanOR = BooleanOR(IsMovingOnGround, BooleanAND)
   @649  if not (BooleanOR): goto @961
   @663  MakeLiteralGameplayTagContainer_2 = MakeLiteralGameplayTagContainer(tags[角色.3f9237d8.逻辑.2eb8d958])
   @746  HasAnyMatchingGameplayTags_1 = HasAnyMatchingGameplayTags(MakeLiteralGameplayTagContainer_2)
   @824  if not (HasAnyMatchingGameplayTags_1): goto @1962
   @838  CreateSkillCommand_3 = CreateSkillCommand(1506501)   ⟵ skill 1506501: Heavy: Absolution Litany
   @929  ReturnValue = CreateSkillCommand_3
   @956  goto @3097
▸  @961  HasMatchingGameplayTag = HasMatchingGameplayTag(tag(角色.3f9237d8.2c7a5bea.925ff715))
  @1057  if not (HasMatchingGameplayTag): goto @1304
  @1071  HasMatchingGameplayTag_1 = HasMatchingGameplayTag(tag(角色.3f9237d8.逻辑.9f89f980))
  @1167  if not (HasMatchingGameplayTag_1): goto @1304
  @1181  CreateSkillCommand_5 = CreateSkillCommand(1506666021)   ⟵ skill 1506666021: (no WuwaLab ability for it)
  @1272  ReturnValue = CreateSkillCommand_5
  @1299  goto @3097
▸ @1304  MakeLiteralGameplayTagContainer_3 = MakeLiteralGameplayTagContainer(tags[角色.3f9237d8.被动.被动1])
  @1387  HasAnyMatchingGameplayTags_2 = HasAnyMatchingGameplayTags(MakeLiteralGameplayTagContainer_3)
  @1465  if not (HasAnyMatchingGameplayTags_2): goto @1659
  @1479  MakeLiteralGameplayTagContainer_5 = MakeLiteralGameplayTagContainer(tags[角色.3f9237d8.逻辑.fb7a5d8d])
  @1562  HasAnyMatchingGameplayTags_4 = HasAnyMatchingGameplayTags(MakeLiteralGameplayTagContainer_5)
  @1640  if not (HasAnyMatchingGameplayTags_4): goto @2681
  @1654  goto @3097
▸ @1659  MakeLiteralGameplayTagContainer_4 = MakeLiteralGameplayTagContainer(tags[角色.3f9237d8.逻辑.31e98562])
  @1742  HasAnyMatchingGameplayTags_3 = HasAnyMatchingGameplayTags(MakeLiteralGameplayTagContainer_4)
  @1820  if not (HasAnyMatchingGameplayTags_3): goto @1839
  @1834  goto @3097
▸ @1839  CreateSkillCommand_6 = CreateSkillCommand(1506021)   ⟵ skill 1506021: Heavy: O Come Divine Light 1 (Mid-Air)
  @1930  ReturnValue = CreateSkillCommand_6
  @1957  goto @3097
▸ @1962  MakeLiteralGameplayTagContainer_1 = MakeLiteralGameplayTagContainer(tags[角色.3f9237d8.逻辑.977b27fd])
  @2045  HasAnyMatchingGameplayTags = HasAnyMatchingGameplayTags(MakeLiteralGameplayTagContainer_1)
  @2123  if not (HasAnyMatchingGameplayTags): goto @2558
  @2137  MakeLiteralGameplayTagContainer = MakeLiteralGameplayTagContainer(tags[角色.3f9237d8.逻辑.65bec1d9])
  @2220  HasAnyMatchingGameplayTags_5 = HasAnyMatchingGameplayTags(MakeLiteralGameplayTagContainer)
  @2298  if not (HasAnyMatchingGameplayTags_5): goto @2435
  @2312  CreateSkillCommand = CreateSkillCommand(1506012)   ⟵ skill 1506012: Heavy: Starflash (Absolution)
  @2403  ReturnValue = CreateSkillCommand
  @2430  goto @3097
▸ @2435  CreateSkillCommand_4 = CreateSkillCommand(1506013)   ⟵ skill 1506013: Heavy: Starflash (Confession)
  @2526  ReturnValue = CreateSkillCommand_4
  @2553  goto @3097
▸ @2558  CreateSkillCommand_1 = CreateSkillCommand(1506011)   ⟵ skill 1506011: Heavy: O Come Divine Light
  @2649  ReturnValue = CreateSkillCommand_1
  @2676  goto @3097
▸ @2681  MakeLiteralGameplayTagContainer_6 = MakeLiteralGameplayTagContainer(tags[角色.3f9237d8.逻辑.31e98562])
  @2764  HasAnyMatchingGameplayTags_6 = HasAnyMatchingGameplayTags(MakeLiteralGameplayTagContainer_6)
  @2842  if not (HasAnyMatchingGameplayTags_6): goto @2979
  @2856  CreateSkillCommand_2 = CreateSkillCommand(1506022)   ⟵ skill 1506022: Heavy: O Come Divine Light 2 (Mid-Air)
  @2947  ReturnValue = CreateSkillCommand_2
  @2974  goto @3097
▸ @2979  CreateSkillCommand_7 = CreateSkillCommand(1506021)   ⟵ skill 1506021: Heavy: O Come Divine Light 1 (Mid-Air)
  @3070  ReturnValue = CreateSkillCommand_7
▸ @3097  return ReturnValue
  @3107  return ReturnValue
```

## Attack release (`攻击抬起`)

```text
     @0  ____ = 攻击抬起(0.0)
    @33  if not (self.通用_攻击按下): goto @79
    @47  ReturnValue = ____
    @74  goto @3677
▸   @79  CanResponseInput = CanResponseInput()
   @157  if not (CanResponseInput): goto @3677
   @171  Less_FloatFloat = Less_FloatFloat(time, 0.2)
   @205  if not (Less_FloatFloat): goto @3677
   @219  EqualEqual_ByteByte = EqualEqual_ByteByte(OwnerActor.CharacterMovement.CustomMovementMode, 5)
   @294  IsMovingOnGround = IsMovingOnGround()
   @362  EqualEqual_ByteByte_1 = EqualEqual_ByteByte(OwnerActor.CharacterMovement.MovementMode, 6)
   @437  BooleanAND = BooleanAND(EqualEqual_ByteByte_1, EqualEqual_ByteByte)
   @475  BooleanOR = BooleanOR(IsMovingOnGround, BooleanAND)
   @513  if not (BooleanOR): goto @1000
   @527  MakeLiteralGameplayTagContainer_2 = MakeLiteralGameplayTagContainer(tags[角色.Common.技能通用标识.极限闪避])
   @610  HasAnyMatchingGameplayTags = HasAnyMatchingGameplayTags(MakeLiteralGameplayTagContainer_2)
   @688  if not (HasAnyMatchingGameplayTags): goto @1757
   @702  MakeLiteralGameplayTagContainer_3 = MakeLiteralGameplayTagContainer(tags[角色.3f9237d8.逻辑.db1b0798])
   @785  HasAnyMatchingGameplayTags_1 = HasAnyMatchingGameplayTags(MakeLiteralGameplayTagContainer_3)
   @863  if not (HasAnyMatchingGameplayTags_1): goto @3559
   @877  CreateSkillCommand_6 = CreateSkillCommand(1506032)   ⟵ skill 1506032: Basic: Chamuel's Star 3 (Dodge Counter)
   @968  ReturnValue = CreateSkillCommand_6
   @995  goto @3677
▸ @1000  GetCommandInterval = GetCommandInterval(3, 1.0)
  @1062  Greater_FloatFloat = Greater_FloatFloat(GetCommandInterval, 0.2)
  @1096  if not (Greater_FloatFloat): goto @3677
  @1110  D_K2_GetActorLocation = D_K2_GetActorLocation()
  @1160  D_Add_VectorVector = D_Add_VectorVector(D_K2_GetActorLocation, {"X": 0.0, "Y": 0.0, "Z": -3.390625})
  @1222  K2Node_MakeArray_Array = [0, 1, 5]
  @1239  D_LineTraceSingleForObjects = D_LineTraceSingleForObjects(D_K2_GetActorLocation, D_Add_VectorVector, K2Node_MakeArray_Array, False, ___object_Variable, 0, D_LineTraceSingleForObjects_OutHit, True, LinearColor(1.0, 0.0, 0.0, 1.0), LinearColor(0.0, 1.0, 0.0, 1.0), 5.0)
  @1382  if not (D_LineTraceSingleForObjects): goto @1401
  @1396  goto @3677
▸ @1401  HasMatchingGameplayTag = HasMatchingGameplayTag(tag(角色.3f9237d8.2c7a5bea.925ff715))
  @1497  if not (HasMatchingGameplayTag): goto @1634
  @1511  CreateSkillCommand_1 = CreateSkillCommand(1506666031)   ⟵ skill 1506666031: (no WuwaLab ability for it)
  @1602  ReturnValue = CreateSkillCommand_1
  @1629  goto @3677
▸ @1634  CreateSkillCommand_2 = CreateSkillCommand(1506020)   ⟵ skill 1506020: Basic: O Come Divine Light (Mid-Air)
  @1725  ReturnValue = CreateSkillCommand_2
  @1752  goto @3677
▸ @1757  GetSkillAcceptInput = GetSkillAcceptInput()
  @1835  if not (GetSkillAcceptInput): goto @3462
  @1849  MakeLiteralGameplayTagContainer = MakeLiteralGameplayTagContainer(tags[角色.3f9237d8.技能.150cf046])
  @1932  HasAnyMatchingGameplayTags_2 = HasAnyMatchingGameplayTags(MakeLiteralGameplayTagContainer)
  @2010  if not (HasAnyMatchingGameplayTags_2): goto @2147
  @2024  CreateSkillCommand_7 = CreateSkillCommand(1506006)   ⟵ skill 1506006: Basic: Chamuel's Star 3
  @2115  ReturnValue = CreateSkillCommand_7
  @2142  goto @3677
▸ @2147  MakeLiteralGameplayTagContainer_4 = MakeLiteralGameplayTagContainer(tags[角色.3f9237d8.技能.6cac4982])
  @2230  HasAnyMatchingGameplayTags_3 = HasAnyMatchingGameplayTags(MakeLiteralGameplayTagContainer_4)
  @2308  if not (HasAnyMatchingGameplayTags_3): goto @2445
  @2322  CreateSkillCommand_5 = CreateSkillCommand(1506005)   ⟵ skill 1506005: Basic: Chamuel's Star 2
  @2413  ReturnValue = CreateSkillCommand_5
  @2440  goto @3677
▸ @2445  MakeLiteralGameplayTagContainer_1 = MakeLiteralGameplayTagContainer(tags[角色.3f9237d8.技能.普攻2])
  @2528  HasAnyMatchingGameplayTags_4 = HasAnyMatchingGameplayTags(MakeLiteralGameplayTagContainer_1)
  @2606  if not (HasAnyMatchingGameplayTags_4): goto @2743
  @2620  CreateSkillCommand_4 = CreateSkillCommand(1506003)   ⟵ skill 1506003: Basic: O Come Divine Light 3
  @2711  ReturnValue = CreateSkillCommand_4
  @2738  goto @3677
▸ @2743  MakeLiteralGameplayTagContainer_5 = MakeLiteralGameplayTagContainer(tags[角色.3f9237d8.技能.普攻1])
  @2826  HasAnyMatchingGameplayTags_5 = HasAnyMatchingGameplayTags(MakeLiteralGameplayTagContainer_5)
  @2904  if not (HasAnyMatchingGameplayTags_5): goto @3041
  @2918  CreateSkillCommand_3 = CreateSkillCommand(1506002)   ⟵ skill 1506002: Basic: O Come Divine Light 2
  @3009  ReturnValue = CreateSkillCommand_3
  @3036  goto @3677
▸ @3041  MakeLiteralGameplayTagContainer_6 = MakeLiteralGameplayTagContainer(tags[角色.3f9237d8.逻辑.db1b0798])
  @3124  HasAnyMatchingGameplayTags_6 = HasAnyMatchingGameplayTags(MakeLiteralGameplayTagContainer_6)
  @3202  if not (HasAnyMatchingGameplayTags_6): goto @3339
  @3216  CreateSkillCommand_8 = CreateSkillCommand(1506004)   ⟵ skill 1506004: Basic: Chamuel's Star 1
  @3307  ReturnValue = CreateSkillCommand_8
  @3334  goto @3677
▸ @3339  CreateSkillCommand = CreateSkillCommand(1506001)   ⟵ skill 1506001: Basic: O Come Divine Light 1
  @3430  ReturnValue = CreateSkillCommand
  @3457  goto @3677
▸ @3462  GetCommonSkillCanBeInterrupt = GetCommonSkillCanBeInterrupt()
  @3540  if not (GetCommonSkillCanBeInterrupt): goto @3677
  @3554  goto @3041
▸ @3559  CreateSkillCommand_9 = CreateSkillCommand(1506031)   ⟵ skill 1506031: Basic: O Come Divine Light 3 (Dodge Counter)
  @3650  ReturnValue = CreateSkillCommand_9
▸ @3677  return ReturnValue
  @3687  return ReturnValue
```

## Skill press (`技能1按下`)

```text
     @0  __1__ = 技能1按下(0.0)
    @33  if not (self.通用_技能1按下): goto @79
    @47  ReturnValue = __1__
    @74  goto @1328
▸   @79  CanResponseInput = CanResponseInput()
   @157  if not (CanResponseInput): goto @1328
   @171  MakeLiteralGameplayTagContainer = MakeLiteralGameplayTagContainer(tags[角色.3f9237d8.逻辑.2eb8d958])
   @254  HasAnyMatchingGameplayTags_1 = HasAnyMatchingGameplayTags(MakeLiteralGameplayTagContainer)
   @332  if not (HasAnyMatchingGameplayTags_1): goto @351
   @346  goto @1328
▸  @351  GetNextMultiSkillId = GetNextMultiSkillId(1506101)
   @442  FTrunc = FTrunc(GetNextMultiSkillId)
   @479  EqualEqual_IntInt = EqualEqual_IntInt(FTrunc, 0)
   @513  EqualEqual_IntInt_1 = EqualEqual_IntInt(FTrunc, 1506101)
   @547  BooleanOR = BooleanOR(EqualEqual_IntInt_1, EqualEqual_IntInt)
   @585  if not (BooleanOR): goto @1030
   @599  EqualEqual_ByteByte = EqualEqual_ByteByte(OwnerActor.CharacterMovement.CustomMovementMode, 5)
   @674  EqualEqual_ByteByte_1 = EqualEqual_ByteByte(OwnerActor.CharacterMovement.MovementMode, 6)
   @749  IsMovingOnGround = IsMovingOnGround()
   @817  BooleanAND = BooleanAND(EqualEqual_ByteByte_1, EqualEqual_ByteByte)
   @855  BooleanOR_1 = BooleanOR(IsMovingOnGround, BooleanAND)
   @893  if not (BooleanOR_1): goto @1328
   @907  CreateSkillCommand_1 = CreateSkillCommand(1506101)   ⟵ skill 1506101: Skill: To Where Light Shines
   @998  ReturnValue = CreateSkillCommand_1
  @1025  goto @1328
▸ @1030  MakeLiteralGameplayTagContainer_1 = MakeLiteralGameplayTagContainer(tags[角色.3f9237d8.逻辑.a60a92a4])
  @1113  HasAnyMatchingGameplayTags = HasAnyMatchingGameplayTags(MakeLiteralGameplayTagContainer_1)
  @1191  if not (HasAnyMatchingGameplayTags): goto @1210
  @1205  goto @1328
▸ @1210  CreateSkillCommand = CreateSkillCommand(1506102)   ⟵ skill 1506102: Skill: To Where Light Shines (Teleport)
  @1301  ReturnValue = CreateSkillCommand
▸ @1328  return ReturnValue
  @1338  return ReturnValue
```

## Skill hold (`技能1长按`)

```text
     @0  __1__ = 技能1长按(0.0)
    @33  if not (self.通用_技能1按下): goto @79
    @47  ReturnValue = __1__
    @74  goto @1277
▸   @79  CanResponseInput = CanResponseInput()
   @157  if not (CanResponseInput): goto @1277
   @171  EqualEqual_ByteByte = EqualEqual_ByteByte(OwnerActor.CharacterMovement.CustomMovementMode, 5)
   @246  IsMovingOnGround = IsMovingOnGround()
   @314  EqualEqual_ByteByte_1 = EqualEqual_ByteByte(OwnerActor.CharacterMovement.MovementMode, 6)
   @389  BooleanAND = BooleanAND(EqualEqual_ByteByte_1, EqualEqual_ByteByte)
   @427  BooleanOR = BooleanOR(IsMovingOnGround, BooleanAND)
   @465  if not (BooleanOR): goto @1277
   @479  MakeLiteralGameplayTagContainer_2 = MakeLiteralGameplayTagContainer(tags[角色.3f9237d8.逻辑.动作前摇])
   @562  HasAnyMatchingGameplayTags_1 = HasAnyMatchingGameplayTags(MakeLiteralGameplayTagContainer_2)
   @640  if not (HasAnyMatchingGameplayTags_1): goto @659
   @654  goto @1277
▸  @659  MakeLiteralGameplayTagContainer = MakeLiteralGameplayTagContainer(tags[角色.3f9237d8.逻辑.2eb8d958])
   @742  HasAnyMatchingGameplayTags = HasAnyMatchingGameplayTags(MakeLiteralGameplayTagContainer)
   @820  if not (HasAnyMatchingGameplayTags): goto @1277
   @834  MakeLiteralGameplayTagContainer_1 = MakeLiteralGameplayTagContainer(tags[角色.3f9237d8.2c7a5bea.7dfdf2e9, 角色.3f9237d8.2c7a5bea.925ff715])
   @944  HasAnyMatchingGameplayTags_2 = HasAnyMatchingGameplayTags(MakeLiteralGameplayTagContainer_1)
  @1022  if not (HasAnyMatchingGameplayTags_2): goto @1159
  @1036  CreateSkillCommand = CreateSkillCommand(1506501)   ⟵ skill 1506501: Heavy: Absolution Litany
  @1127  ReturnValue = CreateSkillCommand
  @1154  goto @1277
▸ @1159  CreateSkillCommand_1 = CreateSkillCommand(1506502)   ⟵ skill 1506502: Skill: Utter Confession
  @1250  ReturnValue = CreateSkillCommand_1
▸ @1277  return ReturnValue
  @1287  return ReturnValue
```

## Skill release (`技能1抬起`)

```text
     @0  __1__ = 技能1抬起(0.0)
    @33  if not (self.通用_技能1按下): goto @79
    @47  ReturnValue = __1__
    @74  goto @1376
▸   @79  CanResponseInput = CanResponseInput()
   @157  if not (CanResponseInput): goto @1376
   @171  GreaterEqual_FloatFloat = GreaterEqual_FloatFloat(time, 0.2)
   @205  if not (GreaterEqual_FloatFloat): goto @224
   @219  goto @1376
▸  @224  MakeLiteralGameplayTagContainer = MakeLiteralGameplayTagContainer(tags[角色.3f9237d8.逻辑.2eb8d958])
   @307  HasAnyMatchingGameplayTags_1 = HasAnyMatchingGameplayTags(MakeLiteralGameplayTagContainer)
   @385  if not (HasAnyMatchingGameplayTags_1): goto @1376
   @399  GetNextMultiSkillId = GetNextMultiSkillId(1506101)
   @490  FTrunc = FTrunc(GetNextMultiSkillId)
   @527  EqualEqual_IntInt = EqualEqual_IntInt(FTrunc, 0)
   @561  EqualEqual_IntInt_1 = EqualEqual_IntInt(FTrunc, 1506101)
   @595  BooleanOR = BooleanOR(EqualEqual_IntInt_1, EqualEqual_IntInt)
   @633  if not (BooleanOR): goto @1078
   @647  EqualEqual_ByteByte = EqualEqual_ByteByte(OwnerActor.CharacterMovement.CustomMovementMode, 5)
   @722  IsMovingOnGround = IsMovingOnGround()
   @790  EqualEqual_ByteByte_1 = EqualEqual_ByteByte(OwnerActor.CharacterMovement.MovementMode, 6)
   @865  BooleanAND = BooleanAND(EqualEqual_ByteByte_1, EqualEqual_ByteByte)
   @903  BooleanOR_1 = BooleanOR(IsMovingOnGround, BooleanAND)
   @941  if not (BooleanOR_1): goto @1376
   @955  CreateSkillCommand_1 = CreateSkillCommand(1506101)   ⟵ skill 1506101: Skill: To Where Light Shines
  @1046  ReturnValue = CreateSkillCommand_1
  @1073  goto @1376
▸ @1078  MakeLiteralGameplayTagContainer_1 = MakeLiteralGameplayTagContainer(tags[角色.3f9237d8.逻辑.a60a92a4])
  @1161  HasAnyMatchingGameplayTags = HasAnyMatchingGameplayTags(MakeLiteralGameplayTagContainer_1)
  @1239  if not (HasAnyMatchingGameplayTags): goto @1258
  @1253  goto @1376
▸ @1258  CreateSkillCommand = CreateSkillCommand(1506102)   ⟵ skill 1506102: Skill: To Where Light Shines (Teleport)
  @1349  ReturnValue = CreateSkillCommand
▸ @1376  return ReturnValue
  @1386  return ReturnValue
```

## Liberation press (`大招按下`)

```text
     @0  CanResponseInput = CanResponseInput()
    @78  if not (CanResponseInput): goto @985
    @92  EqualEqual_ByteByte = EqualEqual_ByteByte(OwnerActor.CharacterMovement.CustomMovementMode, 5)
   @167  IsMovingOnGround = IsMovingOnGround()
   @235  EqualEqual_ByteByte_1 = EqualEqual_ByteByte(OwnerActor.CharacterMovement.MovementMode, 6)
   @310  BooleanAND = BooleanAND(EqualEqual_ByteByte_1, EqualEqual_ByteByte)
   @348  BooleanOR = BooleanOR(IsMovingOnGround, BooleanAND)
   @386  if not (BooleanOR): goto @985
   @400  GetAttributeCurrentValue = GetAttributeCurrentValue(59)
   @491  GetAttributeCurrentValue_1 = GetAttributeCurrentValue(60)
   @582  GreaterEqual_FloatFloat = GreaterEqual_FloatFloat(GetAttributeCurrentValue_1, GetAttributeCurrentValue)
   @620  if not (GreaterEqual_FloatFloat): goto @985
   @634  HasMatchingGameplayTag = HasMatchingGameplayTag(tag(角色.3f9237d8.2c7a5bea.b2a153eb))
   @730  if not (HasMatchingGameplayTag): goto @867
   @744  CreateSkillCommand_1 = CreateSkillCommand(1506666041)   ⟵ skill 1506666041: (no WuwaLab ability for it)
   @835  ReturnValue = CreateSkillCommand_1
   @862  goto @985
▸  @867  CreateSkillCommand = CreateSkillCommand(1506200)   ⟵ skill 1506200: Liberation: Dawn of Enlightenment
   @958  ReturnValue = CreateSkillCommand
▸  @985  return ReturnValue
   @995  return ReturnValue
```

## Dodge press (`闪避按下`)

```text
     @0  MakeLiteralGameplayTagContainer = MakeLiteralGameplayTagContainer(tags[角色.3f9237d8.逻辑.120c38cb])
    @83  HasAnyMatchingGameplayTags = HasAnyMatchingGameplayTags(MakeLiteralGameplayTagContainer)
   @161  if not (HasAnyMatchingGameplayTags): goto @443
   @175  MakeLiteralGameplayTagContainer_7 = MakeLiteralGameplayTagContainer(tags[行为状态.动作状态.XA])
   @258  HasAnyMatchingGameplayTags_6 = HasAnyMatchingGameplayTags(MakeLiteralGameplayTagContainer_7)
   @336  if not (HasAnyMatchingGameplayTags_6): goto @508
   @350  K2Node_MakeStruct_SInputCommand.None = 10
   @379  K2Node_MakeStruct_SInputCommand.None = 1
   @411  ReturnValue = K2Node_MakeStruct_SInputCommand
   @438  goto @4107
▸  @443  _____1 = 闪避按下(0.0)
   @476  ReturnValue = _____1
   @503  goto @4107
▸  @508  MakeLiteralGameplayTagContainer_3 = MakeLiteralGameplayTagContainer(tags[角色.Common.技能通用标识.闪避.击飞落地可闪避])
   @591  HasAnyMatchingGameplayTags_1 = HasAnyMatchingGameplayTags(MakeLiteralGameplayTagContainer_3)
   @669  if not (HasAnyMatchingGameplayTags_1): goto @2363
▸  @683  HasMatchingGameplayTag_2 = HasMatchingGameplayTag(tag(行为状态.位置状态.攀爬))
   @779  if not (HasMatchingGameplayTag_2): goto @886
   @793  K2Node_MakeStruct_SInputCommand_2.None = 6
   @822  K2Node_MakeStruct_SInputCommand_2.None = 1
   @854  ReturnValue = K2Node_MakeStruct_SInputCommand_2
   @881  goto @4107
▸  @886  HasMatchingGameplayTag_1 = HasMatchingGameplayTag(tag(行为状态.位置状态.水中))
   @982  if not (HasMatchingGameplayTag_1): goto @1089
   @996  K2Node_MakeStruct_SInputCommand_1.None = 5
  @1025  K2Node_MakeStruct_SInputCommand_1.None = 1
  @1057  ReturnValue = K2Node_MakeStruct_SInputCommand_1
  @1084  goto @4107
▸ @1089  self.是否进入闪避通用 = True
  @1100  MakeLiteralGameplayTagContainer_1 = MakeLiteralGameplayTagContainer(tags[角色.Common.技能通用标识.闪避.击飞落地可闪避])
  @1183  HasAnyMatchingGameplayTags_5 = HasAnyMatchingGameplayTags(MakeLiteralGameplayTagContainer_1)
  @1261  if not (HasAnyMatchingGameplayTags_5): goto @2031
▸ @1275  EqualEqual_ByteByte = EqualEqual_ByteByte(OwnerActor.CharacterMovement.CustomMovementMode, 5)
  @1350  EqualEqual_ByteByte_1 = EqualEqual_ByteByte(OwnerActor.CharacterMovement.MovementMode, 6)
  @1425  IsMovingOnGround = IsMovingOnGround()
  @1493  BooleanAND = BooleanAND(EqualEqual_ByteByte_1, EqualEqual_ByteByte)
  @1531  BooleanOR = BooleanOR(IsMovingOnGround, BooleanAND)
  @1569  if not (BooleanOR): goto @3405
  @1583  GetAbilitySystemComponent = GetAbilitySystemComponent(self.OwnerActor)
  @1612  GetTagCount = GetTagCount(tag(角色.Common.技能通用标识.闪避禁止))
  @1689  EqualEqual_IntInt = EqualEqual_IntInt(GetTagCount, 0)
  @1723  if not (EqualEqual_IntInt): goto @2298
  @1737  HasMoveAxisInput_1 = HasMoveAxisInput()
  @1784  if not (HasMoveAxisInput_1): goto @3866
  @1798  HasMatchingGameplayTag = HasMatchingGameplayTag(tag(关卡.子弹跑.可使用))
  @1894  if not (HasMatchingGameplayTag): goto @3989
  @1908  CreateSkillCommand_4 = CreateSkillCommand(100014)   ⟵ skill 100014: (no WuwaLab ability for it)
  @1999  ReturnValue = CreateSkillCommand_4
  @2026  goto @4107
▸ @2031  CanResponseInput_1 = CanResponseInput()
  @2109  if not (CanResponseInput_1): goto @2298
  @2123  MakeLiteralGameplayTagContainer_4 = MakeLiteralGameplayTagContainer(tags[功能.功能制作.被击硬直时间])
  @2206  HasAnyMatchingGameplayTags_7 = HasAnyMatchingGameplayTags(MakeLiteralGameplayTagContainer_4)
  @2284  if not (HasAnyMatchingGameplayTags_7): goto @1275
▸ @2298  ____ = 闪避按下(0.0)
  @2331  ReturnValue = ____
  @2358  goto @4107
▸ @2363  CanResponseInput = CanResponseInput()
  @2441  if not (CanResponseInput): goto @2630
  @2455  MakeLiteralGameplayTagContainer_5 = MakeLiteralGameplayTagContainer(tags[功能.功能制作.被击硬直时间])
  @2538  HasAnyMatchingGameplayTags_3 = HasAnyMatchingGameplayTags(MakeLiteralGameplayTagContainer_5)
  @2616  if not (HasAnyMatchingGameplayTags_3): goto @683
▸ @2630  MakeLiteralGameplayTagContainer_2 = MakeLiteralGameplayTagContainer(tags[行为状态.位置状态.攀爬, 行为状态.位置状态.水中, 行为状态.位置状态.滑雪, 行为状态.动作状态.受击.被抓取, 行为状态.动作状态.受击.被弹反, 行为状态.逻辑状态.濒死, 行为状态.逻辑状态.濒死销毁推迟, 行为状态.逻辑状态.溺水, 战斗状态.技能限制.禁止地面闪避, 战斗状态.技能限制.禁止极限闪避, 战斗状态.技能限制.禁止空中闪避, 战斗状态.输入限制.禁止闪避])
  @3010  HasAnyMatchingGameplayTags_4 = HasAnyMatchingGameplayTags(MakeLiteralGameplayTagContainer_2)
  @3088  if not (HasAnyMatchingGameplayTags_4): goto @3107
  @3102  goto @4107
▸ @3107  MakeLiteralGameplayTagContainer_6 = MakeLiteralGameplayTagContainer(tags[角色.R2T1ShouanrenMd10011.buff标识.退场技.buff1])
  @3190  HasAnyMatchingGameplayTags_2 = HasAnyMatchingGameplayTags(MakeLiteralGameplayTagContainer_6)
  @3268  if not (HasAnyMatchingGameplayTags_2): goto @4107
  @3282  CreateSkillCommand_5 = CreateSkillCommand(100023)   ⟵ skill 100023: (no WuwaLab ability for it)
  @3373  ReturnValue = CreateSkillCommand_5
  @3400  goto @4107
▸ @3405  GetAbilitySystemComponent = GetAbilitySystemComponent(self.OwnerActor)
  @3434  GetTagCount = GetTagCount(tag(角色.Common.技能通用标识.闪避禁止))
  @3511  EqualEqual_IntInt = EqualEqual_IntInt(GetTagCount, 0)
  @3545  if not (EqualEqual_IntInt): goto @4107
  @3559  HasMoveAxisInput = HasMoveAxisInput()
  @3606  if not (HasMoveAxisInput): goto @3743
  @3620  CreateSkillCommand_3 = CreateSkillCommand(100003)   ⟵ skill 100003: Air Dash
  @3711  ReturnValue = CreateSkillCommand_3
  @3738  goto @4107
▸ @3743  CreateSkillCommand_2 = CreateSkillCommand(100004)   ⟵ skill 100004: 空中后闪
  @3834  ReturnValue = CreateSkillCommand_2
  @3861  goto @4107
▸ @3866  CreateSkillCommand_1 = CreateSkillCommand(1506702)   ⟵ skill 1506702: 菲比-隐身后闪
  @3957  ReturnValue = CreateSkillCommand_1
  @3984  goto @4107
▸ @3989  CreateSkillCommand = CreateSkillCommand(1506701)   ⟵ skill 1506701: 菲比-隐身前闪
  @4080  ReturnValue = CreateSkillCommand
▸ @4107  return ReturnValue
  @4117  return ReturnValue
```

## From the parent (`BP_InputComponent`), used by Phoebe's functions

### Attack press (`攻击按下`)

```text
     @0  发射事件Tags = tags[幻象.Common.冷却状态, 幻象.控物.发射子弹]
   @100  ____ = 攻击按下(time)
   @137  CharacterAttackOnPress = CharacterAttackOnPress(time, ____)
   @211  ReturnValue = CharacterAttackOnPress
   @238  return ReturnValue
   @248  return ReturnValue
```

### Attack hold (`攻击长按`)

```text
     @0  ____ = 攻击长按(time)
    @37  ParentCommand = ____
    @64  ReturnValue = ParentCommand
    @91  return ReturnValue
   @101  return ReturnValue
```

### Skill press (`技能1按下`)

```text
     @0  __1__ = 技能1按下(time)
    @37  ReturnValue = __1__
    @64  return ReturnValue
    @74  return ReturnValue
```

### Dodge press (`闪避按下`)

```text
     @0  MakeLiteralGameplayTagContainer_5 = MakeLiteralGameplayTagContainer(tags[行为状态.动作状态.XA])
    @83  HasAnyMatchingGameplayTags_1 = HasAnyMatchingGameplayTags(MakeLiteralGameplayTagContainer_5)
   @161  if not (HasAnyMatchingGameplayTags_1): goto @268
   @175  K2Node_MakeStruct_SInputCommand.None = 10
   @204  K2Node_MakeStruct_SInputCommand.None = 1
   @236  ReturnValue = K2Node_MakeStruct_SInputCommand
   @263  goto @4330
▸  @268  MakeLiteralGameplayTagContainer_1 = MakeLiteralGameplayTagContainer(tags[角色.Common.技能通用标识.闪避.击飞落地可闪避])
   @351  HasAnyMatchingGameplayTags_2 = HasAnyMatchingGameplayTags(MakeLiteralGameplayTagContainer_1)
   @429  if not (HasAnyMatchingGameplayTags_2): goto @646
▸  @443  HasMatchingGameplayTag_5 = HasMatchingGameplayTag(tag(行为状态.位置状态.攀爬))
   @539  if not (HasMatchingGameplayTag_5): goto @1390
   @553  K2Node_MakeStruct_SInputCommand_2.None = 6
   @582  K2Node_MakeStruct_SInputCommand_2.None = 1
   @614  ReturnValue = K2Node_MakeStruct_SInputCommand_2
   @641  goto @4330
▸  @646  CanResponseInput = CanResponseInput()
   @724  if not (CanResponseInput): goto @913
   @738  MakeLiteralGameplayTagContainer_6 = MakeLiteralGameplayTagContainer(tags[功能.功能制作.被击硬直时间])
   @821  HasAnyMatchingGameplayTags_3 = HasAnyMatchingGameplayTags(MakeLiteralGameplayTagContainer_6)
   @899  if not (HasAnyMatchingGameplayTags_3): goto @443
▸  @913  MakeLiteralGameplayTagContainer_2 = MakeLiteralGameplayTagContainer(tags[行为状态.位置状态.攀爬, 行为状态.位置状态.水中, 行为状态.位置状态.滑雪, 行为状态.动作状态.受击.被抓取, 行为状态.动作状态.受击.被弹反, 行为状态.逻辑状态.濒死, 行为状态.逻辑状态.濒死销毁推迟, 行为状态.逻辑状态.溺水, 战斗状态.技能限制.禁止地面闪避, 战斗状态.技能限制.禁止极限闪避, 战斗状态.技能限制.禁止空中闪避, 战斗状态.输入限制.禁止闪避])
  @1293  HasAnyMatchingGameplayTags_4 = HasAnyMatchingGameplayTags(MakeLiteralGameplayTagContainer_2)
  @1371  if not (HasAnyMatchingGameplayTags_4): goto @3553
  @1385  goto @4330
▸ @1390  HasMatchingGameplayTag_4 = HasMatchingGameplayTag(tag(行为状态.位置状态.水中))
  @1486  if not (HasMatchingGameplayTag_4): goto @1593
  @1500  K2Node_MakeStruct_SInputCommand_1.None = 5
  @1529  K2Node_MakeStruct_SInputCommand_1.None = 1
  @1561  ReturnValue = K2Node_MakeStruct_SInputCommand_1
  @1588  goto @4330
▸ @1593  self.是否进入闪避通用 = True
  @1604  MakeLiteralGameplayTagContainer = MakeLiteralGameplayTagContainer(tags[角色.Common.技能通用标识.闪避.击飞落地可闪避])
  @1687  HasAnyMatchingGameplayTags_5 = HasAnyMatchingGameplayTags(MakeLiteralGameplayTagContainer)
  @1765  if not (HasAnyMatchingGameplayTags_5): goto @3221
▸ @1779  EqualEqual_ByteByte = EqualEqual_ByteByte(OwnerActor.CharacterMovement.CustomMovementMode, 5)
  @1854  EqualEqual_ByteByte_1 = EqualEqual_ByteByte(OwnerActor.CharacterMovement.MovementMode, 6)
  @1929  IsMovingOnGround = IsMovingOnGround()
  @1997  BooleanAND = BooleanAND(EqualEqual_ByteByte_1, EqualEqual_ByteByte)
  @2035  BooleanOR = BooleanOR(IsMovingOnGround, BooleanAND)
  @2073  if not (BooleanOR): goto @2645
  @2087  GetAbilitySystemComponent = GetAbilitySystemComponent(self.OwnerActor)
  @2116  GetTagCount = GetTagCount(tag(角色.Common.技能通用标识.闪避禁止))
  @2193  EqualEqual_IntInt = EqualEqual_IntInt(GetTagCount, 0)
  @2227  if not (EqualEqual_IntInt): goto @3488
  @2241  HasMoveAxisInput_1 = HasMoveAxisInput()
  @2288  if not (HasMoveAxisInput_1): goto @3851
▸ @2302  HasMatchingGameplayTag = HasMatchingGameplayTag(tag(关卡.子弹跑.可使用))
  @2398  if not (HasMatchingGameplayTag): goto @4089
  @2412  HasMatchingGameplayTag_3 = HasMatchingGameplayTag(tag(关卡.子弹跑.34b66d2f))
  @2508  if not (HasMatchingGameplayTag_3): goto @4212
  @2522  CreateSkillCommand_6 = CreateSkillCommand(100037)   ⟵ skill 100037: (no WuwaLab ability for it)
  @2613  ReturnValue = CreateSkillCommand_6
  @2640  goto @4330
▸ @2645  GetAbilitySystemComponent = GetAbilitySystemComponent(self.OwnerActor)
  @2674  GetTagCount = GetTagCount(tag(角色.Common.技能通用标识.闪避禁止))
  @2751  EqualEqual_IntInt = EqualEqual_IntInt(GetTagCount, 0)
  @2785  if not (EqualEqual_IntInt): goto @4330
  @2799  HasMoveAxisInput = HasMoveAxisInput()
  @2846  if not (HasMoveAxisInput): goto @2983
▸ @2860  CreateSkillCommand_3 = CreateSkillCommand(100003)   ⟵ skill 100003: Air Dash
  @2951  ReturnValue = CreateSkillCommand_3
  @2978  goto @4330
▸ @2983  HasMatchingGameplayTag_2 = HasMatchingGameplayTag(tag(功能.功能制作.2c95f97f))
  @3079  if not (HasMatchingGameplayTag_2): goto @3098
  @3093  goto @2860
▸ @3098  CreateSkillCommand_2 = CreateSkillCommand(100004)   ⟵ skill 100004: 空中后闪
  @3189  ReturnValue = CreateSkillCommand_2
  @3216  goto @4330
▸ @3221  CanResponseInput_1 = CanResponseInput()
  @3299  if not (CanResponseInput_1): goto @3488
  @3313  MakeLiteralGameplayTagContainer_3 = MakeLiteralGameplayTagContainer(tags[功能.功能制作.被击硬直时间])
  @3396  HasAnyMatchingGameplayTags_6 = HasAnyMatchingGameplayTags(MakeLiteralGameplayTagContainer_3)
  @3474  if not (HasAnyMatchingGameplayTags_6): goto @1779
▸ @3488  ____ = 闪避按下(0.0)
  @3521  ReturnValue = ____
  @3548  goto @4330
▸ @3553  MakeLiteralGameplayTagContainer_4 = MakeLiteralGameplayTagContainer(tags[角色.R2T1ShouanrenMd10011.buff标识.退场技.buff1])
  @3636  HasAnyMatchingGameplayTags = HasAnyMatchingGameplayTags(MakeLiteralGameplayTagContainer_4)
  @3714  if not (HasAnyMatchingGameplayTags): goto @4330
  @3728  CreateSkillCommand_5 = CreateSkillCommand(100023)   ⟵ skill 100023: (no WuwaLab ability for it)
  @3819  ReturnValue = CreateSkillCommand_5
  @3846  goto @4330
▸ @3851  HasMatchingGameplayTag_1 = HasMatchingGameplayTag(tag(功能.功能制作.2c95f97f))
  @3947  if not (HasMatchingGameplayTag_1): goto @3966
  @3961  goto @2302
▸ @3966  CreateSkillCommand_1 = CreateSkillCommand(100002)   ⟵ skill 100002: 后闪
  @4057  ReturnValue = CreateSkillCommand_1
  @4084  goto @4330
▸ @4089  CreateSkillCommand = CreateSkillCommand(100001)   ⟵ skill 100001: Dash
  @4180  ReturnValue = CreateSkillCommand
  @4207  goto @4330
▸ @4212  CreateSkillCommand_4 = CreateSkillCommand(100014)   ⟵ skill 100014: (no WuwaLab ability for it)
  @4303  ReturnValue = CreateSkillCommand_4
▸ @4330  return ReturnValue
  @4340  return ReturnValue
```
