/**
 * The engine. Buffs/Gear/Actions are stateless singletons — every mutable fact about a held one
 * (stacks) lives in the engine's own `TeamMember.stacks`, keyed by identity, never on the object
 * itself. `frozenStacks()`/`addStat()`/etc. resolve against "whichever Gear and slot the engine is
 * mid-call for" — safe because evaluation is fully synchronous. Replaces the previous kit.ts/
 * state.ts pair; see TODO_ENGINE.md for the rework this came out of.
 */
import { Stat, EnemyStat, Attribute, WeaponType, Type1, Type2, Cast, Node, Scaling, scopedStat, tagBand, STAT_COUNT, TYPE2_BITS } from "./stats.js";
import type { Tag, StatKey } from "./stats.js";
// type-only, so nothing at runtime imports rotation.js from here — that module imports *this* one
// (for Action/State/run), and a real import back would close the cycle.
import type { Rotation } from "./rotation.js";
import { damage } from "./damage.js";
export { Stat, EnemyStat, Attribute, WeaponType, Type1, Type2, Cast, Node, Scaling, scopedStat };

/** The action's own element/type/type2 as one word — each tag already sits in its own six-bit
 *  band (stats.ts), so they simply OR together — which is what `pushStat()` masks a scope's band
 *  out of to answer "is this scope one of the action's tags".
 *
 *  Cached on the Action itself (`_tagWord`), not recomputed per call: an Action is a module-level
 *  singleton with fixed fields, so its tags can never change once built. */
const tagWord = (element: Attribute | null, type: Type1 | null, type2: Type2 | null): number =>
  (element ?? 0) | (type ?? 0) | (type2 ?? 0);
const tagWordOf = (action: Action): number => {
  let word = action._tagWord;
  if (word === undefined) action._tagWord = word = tagWord(action.element, action.type, action.type2);
  return word;
};


export interface GearDef {
  /** Optional only because `toString` can cover for it entirely — a Gear whose display name is
   *  always computed (Shorekeeper's Stellarealm, Jingran's HP folds) has no separate fixed name
   *  to also give here. Leaving both unset means this Gear reports as "" everywhere; that's a
   *  bug in whatever kit does it, not something worth a guard here. */
  name?: string;
  /** Runs once, the moment this Gear is `equip()`-ped during team setup — never mid-fight.
   *  For anything that happens on entering combat, not on a specific cast (Phrolova's Octet:
   *  10 Aftersound the instant she's on the team, regardless of when she first acts). */
  combatStart?: () => void;
  /** What this cast *inflicts* — the enemy debuffs (Tune Shifting, the elemental Negative
   *  Statuses) and the shield marker (see statuses.ts) it puts up. Runs first of all, across every
   *  held Gear, so that by the time anything else looks, `applied()` already answers "did this
   *  action inflict X" — the same shape as `updateBuffs` (grant/revoke, never a stat), split out
   *  purely for that ordering. */
  updateDebuffs?: () => void;
  /** Same shape as `updateBuffs` below — grant/revoke/queue/spend, never a stat contribution — but
   *  runs one step ahead of it, and runs for this Gear no matter who actually took the action:
   *  every slot's own held gear gets its own `updateGlobal()` called every single action, not
   *  just when this Gear's own holder is the one acting. `updateBuffs` still only runs when this
   *  Gear is actually in the acting slot's own held set (or global) — `updateGlobal` is what a
   *  self-held buff needs to react to a *teammate's* action without being promoted to a real
   *  team-wide buff just to be reachable from their turn (Jingran's Trace the Vestige/Fixation:
   *  both react to any team member's own shield, but pay out onto his slot specifically). Runs
   *  after `updateDebuffs`, so a teammate's own Shifting/status/shield from this action is visible. */
  updateGlobal?: () => void;
  /** Grant/revoke/queue/spend — never a stat contribution. Runs across every held Gear, after
   *  `updateDebuffs` and `updateGlobal`. */
  updateBuffs?: () => void;
  /** A stat contribution that depends on nothing but what the action *is* — `addStat()` calls,
   *  plain or scoped to an element/type, and nothing else: no stacks, no gauges, no `casting()`
   *  or `applied()`, no reading another stat. The engine calls this once per distinct action
   *  tag-set a slot ever sees and caches the sum of every held Gear's own, so a weapon's base ATK
   *  or a substat spread costs nothing per action after the first. Anything conditional belongs
   *  in `applyStats` below, which runs every action. Contributes in the applyStats phase, ahead of
   *  every `applyStats`. */
  constantStats?: () => void;
  /** A flat stat contribution. Runs after every held Gear's own updateBuffs(). */
  applyStats?: () => void;
  /** Reads a total applyStats() already built this action (an ER threshold, an HP fold). */
  convertStats?: () => void;
  /** Runs last of all, after this action's own energy/concerto/off-tune/forte have banked — the
   *  only phase that sees the gauges as the action actually leaves them. For machinery reacting to
   *  a gauge crossing a threshold rather than to the action itself: tunebreak.ts's own watcher
   *  fires the break from here, which is why the engine needs no idea the mechanic exists. Grant/
   *  revoke/queue only, never a stat — stats are long since resolved by now. */
  afterAction?: () => void;
  /** Same shape as `convertStats`, one phase later — for a conversion that reads a stat *another*
   *  gear's convertStats() grants, which it would otherwise race (the roster runs the acting slot's
   *  own gear before team buffs, so a team buff's grant would land too late). Tune Strain's own
   *  payout is the case: it scales off Tune Break Boost, which Denia's Etched Colors hands the team
   *  from its own convertStats(). Runs last of all. */
  lateConvertStats?: () => void;
  /** How this Gear names itself wherever the report shows it — the source on every stat entry it
   *  contributes, and its row in the resonator popover. Defaults to its `name`, plus " xN" once
   *  it stacks; override for a Gear whose useful name isn't fixed (Shorekeeper's Stellarealm
   *  naming its own stage: "Inner Stellarealm" rather than "Stellarealm x2"; Jingran's HP folds
   *  naming how many 1000-HP steps they converted). Called with this Gear current, so `frozenStacks()`
   *  and the stat readers all work inside it.
   *  Named `display`, not `toString`: every plain object already inherits a `toString` from
   *  `Object.prototype`, so `def.toString` is never actually `undefined` when a kit leaves it
   *  unset — it silently reads as `Object.prototype.toString`, and Gear's own toString() below
   *  would call that instead of falling back to its default name, printing "[object Object]"
   *  everywhere. A same-named field can't tell "not provided" apart from "inherited". */
  display?: () => string;
}

/** The six per-action phases a `Pool` sorts a held Gear's hooks into, in the order
 *  `evaluate()` runs them (updateGlobal is not one: it walks every slot's `globalHooks` instead). */
const PHASE_DEBUFFS = 1, PHASE_BUFFS = 2, PHASE_APPLY = 4, PHASE_CONVERT = 8, PHASE_LATE = 16, PHASE_AFTER = 32;
/** Not a phase of its own: constantStats contributes inside the applyStats phase, but it is
 *  listed like one so a `Pool` can hand `evaluate()` exactly the Gear that declares it. */
const PHASE_CONST = 64;
const PHASE_COUNT = 7;

let nextGearId = 1;

/** Base for anything held/stacking/per-slot-tracked — kit passives, weapons, echoes, and
 *  eventually the resonator itself (TODO_ENGINE.md). `Buff` is a plain named subclass, same
 *  reasoning the old engine used for Debuff/GlobalBuff/Mode. */
export class Gear {
  name: string;
  /** How many stacks of this can be held at once. Only a `Buff` ever declares one (see `BuffDef`)
   *  — every other Gear is a single equipped piece, so 1. The field lives here rather than on
   *  Buff because the engine's own stack machinery (`addStack`/`setStacks`/`enemyMax`) reads it
   *  off a plain Gear: `equip()` puts a Resonator/weapon/echo onto a slot through exactly the
   *  same path a buff goes through. */
  maxStacks = 1;
  combatStartFn?: () => void;
  updateDebuffsFn?: () => void;
  updateGlobalFn?: () => void;
  updateBuffsFn?: () => void;
  constantStatsFn?: () => void;
  applyStatsFn?: () => void;
  convertStatsFn?: () => void;
  afterActionFn?: () => void;
  lateConvertStatsFn?: () => void;
  displayFn?: () => string;
  /** Which of the six per-action phases this Gear has a hook for, one bit each (see `PHASE_*`),
   *  fixed here since the hooks themselves are — a `Pool` reads this one field to sort a
   *  held Gear into its phase lists, rather than `evaluate()` probing six optional properties on
   *  every held Gear every action. */
  hookMask: number;
  /** A small integer unique to this Gear — what a variant dry run hashes a mutation by, to tell
   *  whether it would have changed the fight (see `noteMutation()`). */
  id: number;
  /** The same six hooks by phase index (bit order of `PHASE_*`), for `runPhase()` to call one
   *  phase's hook without naming the field — only the phases set in `hookMask` are ever read. */
  hookFns: ((() => void) | undefined)[];

  constructor(def: GearDef) {
    this.id = nextGearId++;
    this.name = def.name ?? "";
    this.combatStartFn = def.combatStart;
    this.updateDebuffsFn = def.updateDebuffs;
    this.updateGlobalFn = def.updateGlobal;
    this.updateBuffsFn = def.updateBuffs;
    this.constantStatsFn = def.constantStats;
    this.applyStatsFn = def.applyStats;
    this.convertStatsFn = def.convertStats;
    this.afterActionFn = def.afterAction;
    this.lateConvertStatsFn = def.lateConvertStats;
    this.displayFn = def.display;
    this.hookMask = (def.updateDebuffs ? PHASE_DEBUFFS : 0) | (def.updateBuffs ? PHASE_BUFFS : 0)
      | (def.applyStats ? PHASE_APPLY : 0) | (def.convertStats ? PHASE_CONVERT : 0)
      | (def.lateConvertStats ? PHASE_LATE : 0) | (def.afterAction ? PHASE_AFTER : 0)
      | (def.constantStats ? PHASE_CONST : 0);
    this.hookFns = [def.updateDebuffs, def.updateBuffs, def.applyStats, def.convertStats, def.lateConvertStats, def.afterAction, def.constantStats];
  }
  toString(): string {
    if (this.displayFn) return this.displayFn();
    return this.maxStacks > 1 ? `${this.name} x${frozenStacks()}` : this.name;
  }
}

/** A Buff is the only Gear that stacks, so it's the only one that can declare a ceiling — every
 *  other piece is either equipped once or cast once. Split out of `GearDef` so a Weapon/Mainslot/
 *  Sequence/Action def can't offer a `maxStacks` that nothing would ever raise past 1. */
export interface BuffDef extends GearDef {
  /** How many stacks this can be held at once; 1 (the default) for a plain on/off buff. Every
   *  grant path clamps to it, so a kit never has to check for overflow itself. For an enemy
   *  `Debuff` this is only the *base* ceiling — a kit can raise it for the fight with
   *  `maxStackIncrease()` (see `State.enemyMax`). */
  maxStacks?: number;
}

export class Buff extends Gear {
  constructor(def: BuffDef) {
    super(def);
    this.maxStacks = def.maxStacks ?? 1;
  }
}
export class Debuff extends Buff {}
/** A resonator's own stat-tree Talents bonus — one per kit, always equipped. */
export class Talent extends Gear {}
/** One of a resonator's two Inherent Skill slots — an always-equipped piece. A flat unconditional
 *  stat it grants lives directly in its own applyStats(); a conditional/stacking payout it triggers
 *  stays a separate Buff, granted from this piece's own updateBuffs(). */
export class Inherent extends Gear {}
/** One resonance-chain sequence node (S1-S6) — a loadout can carry up to six. */
export class Sequence extends Gear {}
/** A resonator's own Resonance Mode — a fixed stance a loadout commits to for the whole fight
 *  (Lucilla's Echo/Glacio Chafe split), not something toggled mid-rotation. Other pieces of that
 *  kit read `isHeld()` on the specific mode equipped, same as checking a Sequence. */
export class ResonanceMode extends Gear {}
/** An echo sonata set's 5-piece (or main) bonus. */
export class Sonata extends Gear {}
/** An echo sonata set's 2-piece bonus. */
export class Sonata2pc extends Gear {}

/** One echo choice — mainslot + sonata + its own 2pc, as a unit. A `Loadout` names a list of
 *  these (most kits just the one); the comparison table runs every weapon×echo combination its
 *  loadout allows (see index.ts's own team runner), not just one hardcoded pick. */
export class EchoLoadout {
  mainslot: Mainslot;
  sonata: Sonata;
  sonata2pc: Sonata2pc;
  constructor(mainslot: Mainslot, sonata: Sonata, sonata2pc: Sonata2pc) {
    this.mainslot = mainslot;
    this.sonata = sonata;
    this.sonata2pc = sonata2pc;
  }
  pieces(): Gear[] { return [this.mainslot, this.sonata, this.sonata2pc]; }
}

/** Everything a `Loadout` is built from, labeled — see the class itself for what each field is.
 *  `sequences` is the resonance chain S1 up, as many nodes as the kit actually declares: six for a
 *  `standardCharacter`, left unset for most limited kits. `mode` is for the rare kit built around
 *  a Resonance Mode (Lucilla, Lynae). */
export interface LoadoutDef {
  resonator: Resonator;
  talent: Talent;
  inherent1: Inherent;
  inherent2: Inherent;
  weapons: Weapon[];
  echoLoadouts: EchoLoadout[];
  mainstats: Buff[];
  substat: Buff;
  rotation: Rotation;
  sequences?: Sequence[];
  mode?: ResonanceMode;
}

/** A resonator's real build — every resonator file's own `_LOADOUT` export is one of these, not a
 *  loose array, so a loadout has to actually name its Talent/both Inherent Skills/every viable
 *  weapon and echo choice, not just hand over "some Gear" (see `LoadoutDef`). Forte Circuit logic
 *  lives directly on each resonator's own Resonator definition, not a separate loadout slot.
 *  Mainstat/substat rolls stay plain `Buff` (`mainstats()`/`chem()`'s own return type) — no
 *  dedicated class was asked for those.
 *
 *  `weapons`/`echoLoadouts`/`mainstats` are lists, not a single pick: the comparison table runs every
 *  combination of them (crossed with every other member's own combinations too — see index.ts's
 *  own `runTeam()`), one row per combo, rather than this file committing to just one. The
 *  `rotation` lives here too now, not a separate export — the scheduler reads its chains and
 *  decides whose turn it is (rotation.ts). */
export class Loadout {
  resonator: Resonator;
  talent: Talent;
  inherent1: Inherent;
  inherent2: Inherent;
  weapons: Weapon[];
  echoLoadouts: EchoLoadout[];
  /** Every main-stat build this loadout is willing to run (see mainstats.ts's own
   *  `mainstatOptions()`) — a list for the same reason `weapons`/`echoLoadouts` are, the table
   *  runs one row per combination. A pure support names just the one. */
  mainstats: Buff[];
  substat: Buff;
  /** This build's whole rotation, already compiled into the up-to-three action chains the
   *  scheduler schedules — start of combat, opener, and the Intro chain every visit after
   *  (rotation.ts). One field, not an opener/loop pair: the chains share a body, so splitting
   *  them across two lists only ever duplicated it. */
  rotation: Rotation;
  /** This loadout's own resonance-chain nodes, S1 first — as many as it actually declares, which
   *  is six for a `standardCharacter` and none for most limited kits. */
  sequences: Sequence[];
  mode?: ResonanceMode;

  constructor(def: LoadoutDef) {
    this.resonator = def.resonator;
    this.talent = def.talent;
    this.inherent1 = def.inherent1;
    this.inherent2 = def.inherent2;
    this.weapons = def.weapons;
    this.echoLoadouts = def.echoLoadouts;
    this.mainstats = def.mainstats;
    this.substat = def.substat;
    this.rotation = def.rotation;
    this.sequences = def.sequences ?? [];
    this.mode = def.mode;
  }

  /** Every piece for one specific weapon/echo/main-stat/sequence-level combo, flattened into the
   *  plain array `equip()` actually walks — the order matches how each resonator file's own loadout
   *  comment already reads (resonator, talent, both inherents, weapon, echoes, mainstat/substat,
   *  sequences, mode). `sequenceLevel` is how many nodes are actually held, S1 up: 0 for a build at
   *  S0, 6 for the full chain — the comparison table runs one row per level so the gain from each
   *  can be read off (see index.ts's own combos). */
  pieces(weapon: Weapon, echo: EchoLoadout, mainstat: Buff, sequenceLevel: number): Gear[] {
    return [
      this.resonator, this.talent, this.inherent1, this.inherent2,
      weapon, ...echo.pieces(), mainstat, this.substat,
      ...this.sequences.slice(0, sequenceLevel),
      this.mode,
    ].filter((g): g is Gear => g != null);
  }
}

export interface ResonatorDef extends GearDef {
  element: Attribute;
  /** Which of the five weapon categories this resonator wields — decides which weapon files
   *  (src/weapons/) their loadout can actually equip. */
  weapon: WeaponType;
  /** Liberation always spends everything a resonator has banked, so the cost only needs
   *  declaring once, here — not repeated as a `-12500` (or whatever) on the Liberation action
   *  itself (TODO_ENGINE.md). 0, the default, is for a kit whose Liberation genuinely costs no
   *  Resonance Energy at all (Phrolova, Lucilla), not "not yet filled in". */
  maxEnergy?: number;
  /** This resonator's own colour — the comparison table's member column, row wash, and gear/
   *  damage popovers all key off it, read straight off the Resonator rather than re-declared per
   *  team in index.ts. */
  color: string;
  /** Which Intro-cast action to use right now — resolved every time the `INTRO` rotation marker
   *  below is reached, not baked into a fixed opener/loop split. Most kits only ever have the
   *  one Intro, so this is just `() => Intro`; a kit with more than one (Phrolova's EIntro once
   *  Maestro's already open, Shorekeeper's Discernment once the realm's Supernal) puts the real
   *  check here instead of the rotation author having to know which visit needs which. Called
   *  with the "current" pointers already aimed at the acting slot, so it can read
   *  stacksOf()/stacksOfTeam() etc. same as any other kit logic. */
  intro: () => Action;
  /** Which Outro-cast action to use right now — the same shape as `intro` above, and resolved the
   *  same way: a rotation holds an OUTRO_NEXT/OUTRO_LAST marker rather than naming the cast, and
   *  the scheduler asks here when it reaches one. Almost every kit has exactly one, so this is
   *  just `() => Outro`. */
  outro: () => Action;
  /** Any 4-star or standard (permanently available) resonator — trivial to fully sequence, so
   *  their own S6 resonance-chain bonus is assumed as their baseline kit rather than gated behind
   *  the sequence-0 default every 5-star build in this project uses. Set true on the Resonator
   *  itself, not per-team: the kit file that declares it is what decides whether its own S6 buff
   *  belongs in its loadout unconditionally — nothing here enforces it, this is purely the flag a
   *  kit file checks. Doesn't affect the comparison table's own sequence filter (`data-maxseq`),
   *  which still reflects the *limited* members' own baseline. */
  standardCharacter?: boolean;
}

/** A resonator: a Gear like any other (TODO_ENGINE.md — "Resonator extends Gear"), plus its own
 *  name/element/weapon type/colour/intro-choice. The stat-tree talent bonus is not special-cased
 *  here — each resonator file exports its own separate `Buff` for it (e.g. `"Phrolova:
 *  Talents"`), just another piece of that resonator's loadout alongside its weapon/echoes. */
export class Resonator extends Gear {
  element: Attribute;
  weapon: WeaponType;
  maxEnergy: number;
  color: string;
  introFn: () => Action;
  outroFn: () => Action;
  standardCharacter: boolean;
  constructor(def: ResonatorDef) {
    super({
      ...def,
      // The four every resonator in the game starts with, applied here so no kit has to restate
      // them: 5% Crit. Rate, 150% Crit. DMG, 100% Energy Regen and a 100% Off-Tune Buildup Rate.
      // Off-tune is the one worth spelling out — the rate is a plain multiplier on what a cast
      // banks (see `evaluate()`), so 100 is the neutral baseline the way 100% ER is, and a kit
      // granting "+50% Buildup Rate" (Mornye's Syntony Field) adds 50 on top of it for x1.5.
      // A kit's own constantStats runs after, so its Base HP/ATK/DEF and anything else land on top.
      constantStats: () => {
        addStat(Stat.CritRate, 5);
        addStat(Stat.CritDmg, 150);
        addStat(Stat.Er, 100);
        addStat(Stat.OfftuneBuildup, 100);
        def.constantStats?.();
      },
      combatStart: () => {
        currentSlot!.resonator = this;
        // RealEnergy (see ActionDef.resetEnergy) starts a fight already filled, unlike the real
        // Energy bar, which starts empty — it's tracking "energy banked since the last reset",
        // and nothing has spent it yet.
        currentSlot!.realEnergy = this.maxEnergy;
        def.combatStart?.();
      },
    });
    this.element = def.element;
    this.weapon = def.weapon;
    this.maxEnergy = def.maxEnergy ?? 0;
    this.color = def.color;
    this.introFn = def.intro;
    this.outroFn = def.outro;
    this.standardCharacter = def.standardCharacter ?? false;
  }
}

export interface MainslotDef extends GearDef {
  /** The cast this echo performs, pulled out by the `ECHO_CAST` marker below. */
  action: Action;
}

/** A mainslot echo: gear that also carries its own cast. Every build equips exactly one, so a
 *  rotation doesn't name the echo — it holds `ECHO_CAST`, and `run()` swaps in whichever
 *  Mainslot the acting slot actually has equipped. */
export class Mainslot extends Gear {
  action: Action;
  constructor(def: MainslotDef) {
    super(def);
    this.action = def.action;
  }
}

export interface WeaponDef extends GearDef {
  /** Which of the five weapon categories this is — must match the wielder's own `Resonator.weapon`. */
  weaponType: WeaponType;
  /** True for every weapon in weapons/standard.ts (all three generations — Ceaseless Aria,
   *  Stormy Resolution, and the new standard set), false for a signature/limited one. The
   *  comparison table's own Allow R1 MDPS/Supports checkboxes key off this: unchecked restricts
   *  that role to standard weapons only, on the assumption a signature is only ever owned at R1. */
  standard?: boolean;
}

/** A weapon: gear that also carries which of the five categories it belongs to. Every top-level
 *  weapon export in src/weapons/ is one of these, not a plain Gear — the secondary proc buffs a
 *  weapon grants (Ad Veritatem, Panorama, etc.) stay plain Buff. */
export class Weapon extends Gear {
  weaponType: WeaponType;
  standard: boolean;
  constructor(def: WeaponDef) {
    super(def);
    this.weaponType = def.weaponType;
    this.standard = def.standard ?? false;
  }
}

/** An Action is a Gear (see the class below), so every hook `GearDef` declares is available here
 *  too — an action that *does* something declares it directly instead of a held Gear branching on
 *  `currentAction() === X`. The one that doesn't apply is `combatStart`: an Action is cast, never
 *  equipped, so nothing ever fires it. */
export interface ActionDef extends GearDef {
  element?: Attribute | null;
  type?: Type1 | null;
  type2?: Type2 | null;
  cast?: Cast | null;
  cast2?: Cast | null;
  active?: boolean;
  node?: Node | null;
  scaling?: Scaling | null;
  mv?: number;
  /** How much Resonance Energy/Concerto/Off-tune this resonator's own cast generates — the
   *  baseline every action carries regardless of any buff, same declared-once shape as `mv`.
   *  evaluate() banks this into the running total automatically (TeamMember.energy/concerto,
   *  State.offtune) right alongside whatever AddEnergy/AddConcerto/AddOfftune a held buff
   *  contributed — a kit never touches these fields itself, only declares them per action. */
  energy?: number;
  concerto?: number;
  offtune?: number;
  /** The report bucket this action's damage groups under, when it isn't the acting resonator's
   *  own — the shared Tune Break and every Negative Status's own damage, none of which is anyone's
   *  turn (`MISC_SLOT`). Defaults to whoever cast it. */
  slot?: string;
  /** Marks the actual button-press Liberation cast that spends the Energy bar — used only to
   *  reset RealEnergy (see `TeamMember.realEnergy`) back to 0 once it fires. Never set on a
   *  Liberation-tagged follow-up that doesn't itself cost the bar, or on a kit whose Liberation
   *  costs no Resonance Energy at all (`maxEnergy: 0`). */
  resetEnergy?: boolean;
  /** How much this cast moves the acting resonator's own forte gauges 1-5 — same declared-once
   *  shape as `energy`/`concerto` above, and can be negative (a gauge-spending cast, e.g. -500).
   *  evaluate() banks this into `TeamMember.forte` automatically via addForte1-5, which floor at
   *  0 but impose no ceiling — a kit never touches its own gauge from inside an action, it just
   *  declares the delta per action, same as everywhere else in this shape. */
  forte1?: number;
  forte2?: number;
  forte3?: number;
  forte4?: number;
  forte5?: number;
  /** A rotation marker rather than a real cast: `run()` calls this to get whichever action to
   *  actually evaluate in its place, with the "current" pointers already aimed at the acting slot
   *  (so it can read `currentMember()` etc. the same as any other kit logic). Every marker in
   *  rotation.ts that stands for a real cast — INTRO, ECHO_CAST — is built on this, which is why
   *  this engine knows nothing about any of them by name. */
  resolve?: () => Action;
  /** Report this cast as a triggered row even though it came straight off a rotation list — for
   *  engine bookkeeping a resonator didn't press a button for (rotation.ts's own swap markers).
   *  Everything else `run()` derives on its own; see its `triggered` local. */
  triggered?: boolean;
}

/** A cast. Mostly data — element/type/cast tags, its motion value, and the energy/concerto/
 *  off-tune/forte it banks — but a Gear like any other, so anything an action *does* can live
 *  directly on it: `evaluate()` runs the acting action's own hooks first in every phase, with the
 *  "current" pointers aimed at it, so what it grants is attributed to it and every stat it
 *  contributes is sourced to its own name. Prefer that to a held Gear branching on
 *  `currentAction() === X`; a `casting(Y)`/`isType(Y)` check that spans a whole *category* of
 *  actions still belongs on the Gear. */
export class Action extends Gear {
  element: Attribute | null;
  type: Type1 | null;
  type2: Type2 | null;
  cast: Cast | null;
  cast2: Cast | null;
  active: boolean;
  node: Node | null;
  scaling: Scaling | null;
  mv: number;
  energy: number;
  concerto: number;
  offtune: number;
  slot: string | null;
  resetEnergy: boolean;
  forte1: number;
  forte2: number;
  forte3: number;
  forte4: number;
  forte5: number;
  resolveFn?: () => Action;
  triggered: boolean;
  /** Lazily-filled cache for `tagWordOf()` — this action's own element/type/type2, as the one
   *  word every scoped stat contribution tests against. Engine-owned; never set by a kit. */
  _tagWord?: number;

  constructor(name: string, def: ActionDef = {}) {
    super({ ...def, name });
    this.element = def.element ?? null;
    this.type = def.type ?? null;
    this.type2 = def.type2 ?? null;
    this.cast = def.cast ?? null;
    this.cast2 = def.cast2 ?? null;
    this.active = def.active ?? true;
    this.node = def.node ?? null;
    this.scaling = def.scaling ?? null;
    this.mv = def.mv ?? 0;
    // No default: an action that deals damage says what it multiplies, so a kit that forgets
    // fails here rather than silently scaling off ATK. Only a rotation marker (rotation.ts's
    // SWAP and friends), which carries no motion value, is allowed to leave it null.
    if (this.mv !== 0 && this.scaling === null) throw new Error(`${name}: an action with a motion value must declare its scaling`);
    this.energy = def.energy ?? 0;
    this.concerto = def.concerto ?? 0;
    this.offtune = def.offtune ?? 0;
    this.slot = def.slot ?? null;
    this.resetEnergy = def.resetEnergy ?? false;
    this.forte1 = def.forte1 ?? 0;
    this.forte2 = def.forte2 ?? 0;
    this.forte3 = def.forte3 ?? 0;
    this.forte4 = def.forte4 ?? 0;
    this.forte5 = def.forte5 ?? 0;
    this.resolveFn = def.resolve;
    this.triggered = def.triggered ?? false;
  }
}



/* --------------------------------------------------------------- engine-owned per-slot state */

/** One stat contribution, tagged with what granted it and who was acting — `addStat()` fills
 *  `source`/`owner` in automatically from the "current" pointers, so no call site anywhere has
 *  to pass them. Feeds the report's own hover-trace panels (display.ts's `tracing()`/`explain()`). */
export interface StatEntry { stat: StatKey; value: number; source: string; owner: string | null; }

/** One buff held on a member, as the report's own resonator popover shows it: its name (with a
 *  stack count where it stacks) and whose kit put it there (see `State.sourceOf`). */
export interface HeldBuff { name: string; source: string; }

/** Shared stand-ins for the report-only fields of an untraced snapshot (see `tracing`) — one
 *  shared value each rather than a fresh allocation per action. Nothing on the untraced path reads
 *  either: the held-buff rosters and the forte gauges are both detail-page-only (display.ts). */
const EMPTY_HELD: HeldBuff[] = [];
const EMPTY_FORTE: [number, number, number, number, number] = [0, 0, 0, 0, 0];

/** A member's own RealEnergy ceiling — clamped to their resonator's own maxEnergy, floored at 0. */
const capEnergy = (member: TeamMember, value: number): number =>
  Math.min(member.resonator?.maxEnergy ?? 0, Math.max(0, value));

/**
 * `effective` is indexed by the stat itself: `Stat` and `EnemyStat` are numeric and share one index
 * space (stats.ts), so a contribution is one add in place with no lookup at all. `pushStat()`
 * writes the bare stat there and puts the *scoped* key in `totals` instead, so this array is
 * closed and tiny (`STAT_COUNT`, plus the one extra slot below) rather than open-ended.
 */

/** One slot past the real stats, holding the part of `Stat.Amp` that came in scoped to a `Type2`.
 *  Dot damage is amplified by that part alone — a buff scoped to Aero Erosion pays into an Aero
 *  Erosion tick, plain or element-scoped amplification does not (see damage.ts's own `ampFactor`)
 *  — and by the time the formula reads `Stat.Amp` every matching scope has already been summed
 *  into it, so the split has to happen here, where the tag is still in hand. Not a `Stat` of its
 *  own: nothing grants it, `pushStat()` derives it from the ordinary `addStat(Stat.Amp, n, tag)`
 *  a kit already writes. */
const TYPE2_AMP_INDEX = STAT_COUNT;

/** What every action's own `effective` starts as — cloned per action with `.slice()`, which is one
 *  memcpy of ~36 doubles. A plain array rather than a `Float64Array`: a typed array is a separate
 *  buffer object with its own header, and allocating one per action was the single most expensive
 *  line in `evaluate()`. The one fractional write below (and its undo) is deliberate — V8 fixes an
 *  array's element kind once it widens, and a clone inherits it, so every copy is a double array
 *  from the start rather than transitioning from integers on its first real contribution. */
const ZERO_STATS: number[] = new Array<number>(STAT_COUNT + 1).fill(0);
ZERO_STATS[0] = 0.5; ZERO_STATS[0] = 0;


/**
 * One pool of held Gear — a member's own, the team-wide pool, or the enemy's — with the stack
 * count of each, as copy-on-write arrays.
 *
 * `list`, `counts` and the per-phase `hooks` lists are never written in place: a grant or spend
 * replaces the ones it touches with fresh copies (~20 entries). That is what lets `evaluate()`
 * "freeze" a phase's roster for free — `capture()` just keeps the references it read, and a gear
 * that revokes itself (or grants another) mid-phase swaps new arrays in under the pool without
 * moving the ground under whatever the phase still has to visit. The alternative — rebuilding one
 * merged roster out of three Maps every time any of them changed, which a buff granted-and-dropped
 * on its own action makes about once per action — was the single most expensive thing left in
 * the engine.
 */
/** Bumped whenever a Gear with `constantStats` enters or leaves any pool — which is team setup,
 *  and then essentially never — so every slot's `constBase` cache can tell it is stale. */
let constVersion = 0;

interface PoolSnapshot { list: Gear[]; counts: number[]; hooks: number[][]; globalHooks: Gear[]; at: Map<Gear, number>; dead: number }
interface MemberSnapshot { pool: PoolSnapshot; globalHooks: Set<Gear>; forte: number[]; concerto: number }

class Pool {
  /** Every Gear granted here, in the order it was first granted — a Map's own order, so hooks run
   *  in the same sequence they always did. A dropped Gear *stays in place*: the phase lists stop
   *  naming its position and `at` forgets it, so nothing reaches it, and its slot is reclaimed by
   *  `compact()` once the dead outnumber the live. Positions therefore never shift on a drop,
   *  which is what keeps a drop down to filtering the one or two phase lists the Gear was in. A
   *  Gear dropped and re-granted goes to the end, as it would in a Map. */
  list: Gear[] = [];
  /** The stack count of `list[i]`. */
  counts: number[] = [];
  /** For each phase (`PHASE_*`, in bit order), the positions in `list` of the live Gear that has
   *  that hook — so a phase visits the two or three it will actually call rather than probing all
   *  ~20 for a hook they mostly haven't got. */
  hooks: number[][] = Array.from({ length: PHASE_COUNT }, () => []);
  /** The live Gear here with an `updateGlobalFn`, in order — what `evaluate()`'s updateGlobal
   *  phase walks for the team-wide and enemy pools. */
  globalHooks: Gear[] = [];
  /** Where each live Gear sits in `list`. Written in place — nothing iterates it — except while a
   *  `snapshot()` is live (`guarded`), where the first write swaps in a copy (`write()`) so
   *  `restore()` can put the original back untouched. */
  private at = new Map<Gear, number>();
  private atCloned = false;
  /** How many entries of `list` are dropped Gear. */
  private dead = 0;

  has(gear: Gear): boolean { return this.at.has(gear); }
  /** Everything a dry run can move, by reference — the arrays are never written in place, and
   *  `at` is cloned before a guarded write ever touches it — for `restore()` to hand back. */
  snapshotInto(s: PoolSnapshot): void {
    s.list = this.list; s.counts = this.counts; s.hooks = this.hooks; s.globalHooks = this.globalHooks; s.at = this.at; s.dead = this.dead;
  }
  restore(s: PoolSnapshot): void {
    this.list = s.list; this.counts = s.counts; this.hooks = s.hooks; this.globalHooks = s.globalHooks; this.at = s.at; this.dead = s.dead;
    this.atCloned = false;
  }
  /** Ahead of a write to `at`. Under a dry run the write is journaled for `undoDry()` to reverse;
   *  otherwise, while a snapshot is live, the first write swaps in a copy so the snapshot's own
   *  map stays as it was. */
  private write(gear: Gear): void {
    if (dryRun) dryLog.push(this.at, gear, this.at.get(gear));
    else if (guarded && !this.atCloned) { this.at = new Map(this.at); this.atCloned = true; }
  }
  get(gear: Gear): number | undefined {
    const i = this.at.get(gear);
    return i === undefined ? undefined : this.counts[i];
  }
  /** Every live Gear, in order — for the report's popover; the phases read `hooks` instead. */
  gears(): Gear[] { return this.list.filter((g, i) => this.at.get(g) === i); }

  set(gear: Gear, n: number): void {
    const i = this.at.get(gear);
    if (i !== undefined) {
      const counts = this.counts.slice();
      counts[i] = n;
      this.counts = counts;
      return;
    }
    const k = this.list.length;
    this.write(gear);
    this.at.set(gear, k);
    const list = this.list.slice(), counts = this.counts.slice();
    list.push(gear); counts.push(n);
    this.list = list; this.counts = counts;
    if (gear.hookMask) {
      const hooks = this.hooks.slice();
      for (let mask = gear.hookMask, p = 0; mask; mask >>= 1, p++) {
        if (!(mask & 1)) continue;
        const phase = hooks[p]!.slice();
        phase.push(k);
        hooks[p] = phase;
      }
      this.hooks = hooks;
    }
    if (gear.updateGlobalFn) this.globalHooks = [...this.globalHooks, gear];
    if (gear.constantStatsFn) constVersion++;
  }
  delete(gear: Gear): void {
    const i = this.at.get(gear);
    if (i === undefined) return;
    this.write(gear);
    this.at.delete(gear);
    if (gear.constantStatsFn) constVersion++;
    if (gear.hookMask) {
      const hooks = this.hooks.slice();
      for (let mask = gear.hookMask, p = 0; mask; mask >>= 1, p++) if (mask & 1) hooks[p] = hooks[p]!.filter((k) => k !== i);
      this.hooks = hooks;
    }
    if (gear.updateGlobalFn) this.globalHooks = this.globalHooks.filter((g) => g !== gear);
    // rarely: the dead cost nothing but their slot, so this only bounds how far `list` outgrows
    // the ~20 live entries it describes
    if (++this.dead > 32) this.compact();
  }
  /** Squeeze the dropped entries out of `list`/`counts` and renumber everything after them. */
  private compact(): void {
    const list: Gear[] = [], counts: number[] = [];
    const hooks: number[][] = Array.from({ length: PHASE_COUNT }, () => []);
    for (let i = 0; i < this.list.length; i++) {
      const gear = this.list[i]!;
      if (this.at.get(gear) !== i) continue;
      const k = list.length;
      this.write(gear);
      this.at.set(gear, k);
      list.push(gear); counts.push(this.counts[i]!);
      for (let mask = gear.hookMask, p = 0; mask; mask >>= 1, p++) if (mask & 1) hooks[p]!.push(k);
    }
    this.list = list; this.counts = counts; this.hooks = hooks; this.dead = 0;
  }
}

/** Where every Gear's mutable facts actually live — never on the Gear itself. */
export class TeamMember {
  name: string;
  /** Whichever Resonator is actually equipped here — set once, by Resonator's own combatStart,
   *  the moment it's equip()-ped. Attribute/energy/name all live on it, not duplicated here; null
   *  only in the brief window between constructing a State (from bare names) and equip()ping
   *  each member's own Resonator. */
  resonator: Resonator | null = null;
  /** Whichever Mainslot echo is equipped here — cached by `equip()` rather than re-found by
   *  scanning this member's whole held set every time the `ECHO_CAST` marker comes up (see
   *  `run()`). Set once at team setup, like `resonator` above. */
  mainslot: Mainslot | null = null;
  /** Generic forte gauges — a resonator assigns its own meaning onto whichever fits its kit
   *  (Jingran's Qi is forte 1, his Mingfire is forte 2). Real numeric bars, not stacking Buffs:
   *  nothing here caps at a Buff's own maxStacks, and there's no revoke-at-0 — a kit clamps its
   *  own ceiling itself (see `setForte()`/`addForte()`). Five slots, matching stats.ts's own
   *  Resource.Forte1-5. */
  forte: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  /** Running totals, banked automatically by evaluate() itself off however much AddEnergy/
   *  AddConcerto this action's own held Gear contributed (see `AddEnergy`/`AddConcerto` above) —
   *  no kit ever adds to these directly, the same way none adds to `forte` by calling addStat(). */
  energy = 0;
  concerto = 0;
  /** A second, parallel energy counter for the ER-requirement estimate (the detail page's own
   *  Energy Requirements table) — unlike `energy` above, it starts a fight already filled (set to
   *  `maxEnergy` by Resonator's own combatStart) and only resets on a `resetEnergy`-marked
   *  Liberation cast, not on every outro. Same gain (and the same maxEnergy ceiling) as `energy`,
   *  plus half of every *other* member's own gain (see `evaluate()`). */
  realEnergy = 0;
  stacks = new Pool();
  /** Exactly the gear in `stacks` that declares an `updateGlobalFn`, kept in lockstep by the four
   *  mutators below. `evaluate()` walks every slot's own global hooks on *every* action, and only
   *  about one gear in twenty-five has one — scanning `stacks` for them meant ~33 iterator steps
   *  per slot per action to reach one or two. Insertion order matches `stacks`' own (both are
   *  written in the same call, and neither a re-`set` nor a re-`add` moves an existing entry), so
   *  the hooks still run in the order they always did. */
  globalHooks = new Set<Gear>();
  /** Whatever was `equip()`-ped onto this member at team setup — their resonator and its talents,
   *  weapon, mainslot echo, sonata pieces, mainstat/substat rolls. Held in `stacks` like anything
   *  else (that's how their applyStats() runs), but it's gear, not a buff their kit put up, so the
   *  report's own "what's on this resonator" panel leaves it out (see `heldLocal` in evaluate()).
   *  `equip()` is the only thing that writes here, and it's the only way gear is ever granted. */
  equipped = new Set<Gear>();
  entries: StatEntry[] = [];
  /** Running sum per *scoped* stat key ("Dmg Bonus:Fusion" kept apart from "Dmg Bonus"), kept in
   *  lockstep with `entries` (same push site in `addStat()`, same reset in `evaluate()`). Only the
   *  report's own trace panels read this, so it's filled on the traced path only — `get()` and the
   *  damage formula both read `effective` below instead. */
  totals = new Map<StatKey, number>();
  /** Running sum per stat with every scope *that matches the action being evaluated* already
   *  folded in — so `get(Stat.DmgBonus)` on a Fusion Basic Attack is one read, not a re-sum of
   *  "Dmg Bonus" + "Dmg Bonus:Fusion" + "Dmg Bonus:Basic" behind three freshly-built key strings.
   *  Written by `pushStat()`, which knows the tag before it's been concatenated into a key and can
   *  test it against the action's own tags directly. Indexed by `STAT_INDEX`, not keyed by the
   *  stat string. Replaced (not cleared) each action, so a snapshot can keep the one it was built
   *  with at zero copying cost. */
  effective: number[] = ZERO_STATS.slice();
  /** What every held Gear's `constantStats` adds up to for this slot, per action tag word (the
   *  scopes that match), in `effective`'s own shape — built the first time each tag word is seen
   *  and added into `effective` in one pass every action after (see `evaluate()`). Cleared when
   *  `constVersion` moves on. */
  constBase = new Map<number, number[]>();
  constBaseVersion = -1;
  /** Main-stat variants to score alongside this member's own build (solver.ts's own
   *  `scoreMainstats()`): the held main-stat Buff each stands in for, the alternatives, and per
   *  alternative the same per-tag-word constant base `constBase` keeps for the real one. Every
   *  action this member takes is then re-scored once per variant (see `evaluate()`) — nothing else
   *  in the fight changes, since a main stat only ever feeds its wearer. */
  variantOf: Gear | null = null;
  variants: Gear[] = [];
  variantBase: Map<number, number[]>[] = [];
  /** Set per variant when its dry re-run would have changed the fight — a mutation the real build
   *  didn't make, or a resource stat that banks differently — so its scores can't be trusted and
   *  the solver runs it for real instead. */
  variantUnsafe: boolean[] = [];

  constructor(name: string) { this.name = name; }

  stacksOf(gear: Gear): number { return this.stacks.get(gear) ?? 0; }
  isHeld(gear: Gear): boolean { return this.stacks.has(gear); }

  /* The four mutators below write the pool only when it actually ends up different — a Pool
   * write is a copy (see `Pool`), and a kit that re-grants a buff it already holds at full stacks
   * (`applySelf(BUFF, 1)` every action, the commonest shape there is) would otherwise copy the
   * counts for nothing on most actions. */
  addStack(gear: Gear, n = 1): number {
    noteMutation(gear.id, n);
    if (!dryRun) recordApplied(gear, n);
    const next = Math.min(gear.maxStacks, this.stacksOf(gear) + n);
    // held-at-`next` already, so the pool is what it would be written to
    if (this.stacks.get(gear) === next) return next;
    this.stacks.set(gear, next);
    if (gear.updateGlobalFn) { this.writeHooks(gear); this.globalHooks.add(gear); }
    return next;
  }
  removeStack(gear: Gear, n = 1): number {
    noteMutation(gear.id, -n);
    const next = Math.max(0, this.stacksOf(gear) - n);
    if (next === 0) {
      if (!this.stacks.has(gear)) return 0;
      this.stacks.delete(gear);
      this.writeHooks(gear); this.globalHooks.delete(gear);
      return 0;
    }
    if (this.stacks.get(gear) === next) return next;
    this.stacks.set(gear, next);
    return next;
  }
  setStacks(gear: Gear, n: number): number {
    noteMutation(gear.id, 1e6 + n);
    if (!dryRun) recordApplied(gear, n - this.stacksOf(gear));
    const next = Math.max(0, Math.min(gear.maxStacks, n));
    if (next === 0) {
      if (!this.stacks.has(gear)) return 0;
      this.stacks.delete(gear);
      this.writeHooks(gear); this.globalHooks.delete(gear);
      return 0;
    }
    if (this.stacks.get(gear) === next) return next;
    this.stacks.set(gear, next);
    if (gear.updateGlobalFn) { this.writeHooks(gear); this.globalHooks.add(gear); }
    return next;
  }
  revoke(gear: Gear): void {
    noteMutation(gear.id, -1e6);
    if (!this.stacks.has(gear)) return;
    this.stacks.delete(gear);
    this.writeHooks(gear); this.globalHooks.delete(gear);
  }

  /** `globalHooks` is written in place — except while a snapshot is live (`guarded`), where the
   *  first write swaps in a copy so `restore()` can hand the original back (see `Pool.write()`). */
  private hooksCloned = false;
  private writeHooks(gear: Gear): void {
    if (dryRun) dryLog.push(this.globalHooks, gear, this.globalHooks.has(gear));
    else if (guarded && !this.hooksCloned) { this.globalHooks = new Set(this.globalHooks); this.hooksCloned = true; }
  }
  /** Everything of this member's a dry run can move (see `evaluate()`'s variants). */
  snapshotInto(s: MemberSnapshot): void {
    this.stacks.snapshotInto(s.pool);
    s.globalHooks = this.globalHooks;
    for (let i = 0; i < 5; i++) s.forte[i] = this.forte[i]!;
    s.concerto = this.concerto;
  }
  restore(s: MemberSnapshot): void {
    this.stacks.restore(s.pool);
    this.globalHooks = s.globalHooks; this.hooksCloned = false;
    for (let i = 0; i < 5; i++) this.forte[i] = s.forte[i]!;
    this.concerto = s.concerto;
  }

  total(stat: StatKey): number {
    return this.totals.get(stat) ?? 0;
  }
}

/** A team: several Slots, one active at a time, plus team-wide (global) Gear held once rather
 *  than per-slot — the "ticks for whoever's acting" mechanism the old engine's GlobalBuff was. */
export class State {
  slots: TeamMember[];
  active = 0;
  /** Which way the next Outro hands the field over: +1 for the ordinary handoff to the next
   *  resonator in team order, -1 for a rotation's own OUTRO_LAST (rotation.ts). The scheduler
   *  sets it right before the outro is evaluated and puts it back to +1 straight after, so a
   *  kit-queued outro — or any other path into `evaluate()` — always advances forward. */
  outroDir: 1 | -1 = 1;
  globalStacks = new Pool(); // use Buff here? how are maxstacks even handled?
  /** Debuffs placed on the enemy rather than held by any resonator — mechanically identical to
   *  `globalStacks` (ticks on every slot's own turn regardless of who's acting), kept as its own
   *  map purely so the resonator popover can bucket it into its own "Enemy debuffs" section
   *  instead of mixing it into "Global buffs" — a real distinction to the report, not just
   *  formatting (see `buffsPopover` in index.ts). */
  enemyStacks = new Pool(); // TODO change Gear to Debuff
  /** Raised caps for enemy debuffs, kept beside the stack counts: the effective max of any enemy
   *  debuff is its own declared maxStacks plus this entry. Independent of `enemyStacks`, so a cap
   *  can be raised before the debuff is ever applied (kits do it at combatStart). */
  enemyMaxIncrease = new Map<Gear, number>(); // TODO change Gear to Debuff
  /** Which Gear has already paid an increase into `enemyMaxIncrease`, by name and per debuff.
   *  Every kit that raises a cap says the effect isn't stackable, but the trigger is usually
   *  "on hit" rather than once — so a source that has already raised this debuff's cap is
   *  ignored the second time, while a second kit raising the same cap still counts. */
  enemyMaxSources = new Map<Gear, Set<string>>(); // TODO change Gear to Debuff
  outroQueue: Buff[] = [];
  /** Off-tune buildup — the enemy's own bar, not any one member's, banked automatically by
   *  evaluate() off whichever held Gear contributed AddOfftune this action, same as
   *  TeamMember's own energy/concerto. */
  offtune = 0;
  /** Whose kit each piece of Gear ultimately came from, by member name.
   *
   *  Gear equipped at setup is sourced to whoever equipped it. Everything else inherits: a buff
   *  granted while another Gear's own updateBuffs() is running is that Gear's doing, so it carries
   *  that Gear's source rather than the name of whichever member happened to be on field when it
   *  landed. Shorekeeper's echo granting "Fallacy of No Return" onto Iuno stays sourced to
   *  Shorekeeper; Iuno's domain stacking Blessing onto Jingran stays sourced to Iuno.
   *
   *  Lives on the State, not the Gear: a Gear is a module-level singleton shared by every team,
   *  so writing to it would leak one team's attribution into another's. */
  sourceOf = new Map<Gear, string>();

  /** The three fight snapshots `evaluate()` takes around a varied action — before the stat phases,
   *  after them, and after banking — made once, the first time this team needs them. */
  snapshots: [FightSnapshot, FightSnapshot, FightSnapshot] | null = null;

  constructor(names: string[]) { this.slots = names.map((n) => new TeamMember(n)); }
  get slot(): TeamMember { return this.slots[this.active]!; }
  slotByName(name: string): TeamMember | undefined { return this.slots.find((s) => s.name === name); }
  /** Whichever TeamMember currently holds this Resonator — what addBuff()/removeBuff() resolve
   *  a resonator reference against. Throws rather than returning undefined: a kit reaching for
   *  another resonator by reference is asserting they're on this team, and a silent no-op on a
   *  typo'd or absent one would be a much worse bug to chase than a thrown error. */
  memberOf(resonator: Resonator): TeamMember {
    const member = this.slots.find((s) => s.resonator === resonator);
    if (!member) throw new Error(`${resonator.name} is not on this team`);
    return member;
  }

  stacksOfGlobal(gear: Gear): number { return this.globalStacks.get(gear) ?? 0; }
  addStackGlobal(gear: Gear, n = 1): number {
    noteMutation(gear.id, n);
    const next = Math.min(gear.maxStacks, this.stacksOfGlobal(gear) + n);
    if (!dryRun) recordApplied(gear, n);
    if (this.globalStacks.get(gear) === next) return next;
    this.globalStacks.set(gear, next);
    return next;
  }
  removeStackGlobal(gear: Gear, n = 1): number {
    noteMutation(gear.id, -n);
    const next = Math.max(0, this.stacksOfGlobal(gear) - n);
    if (next === 0) {
      if (!this.globalStacks.has(gear)) return 0;
      this.globalStacks.delete(gear);
      return 0;
    }
    if (this.globalStacks.get(gear) === next) return next;
    this.globalStacks.set(gear, next);
    return next;
  }
  setStacksGlobal(gear: Gear, n: number): number {
    noteMutation(gear.id, 1e6 + n);
    const next = Math.max(0, Math.min(gear.maxStacks, n));
    if (!dryRun) recordApplied(gear, n - this.stacksOfGlobal(gear));
    if (next === 0) {
      if (!this.globalStacks.has(gear)) return 0;
      this.globalStacks.delete(gear);
      return 0;
    }
    if (this.globalStacks.get(gear) === next) return next;
    this.globalStacks.set(gear, next);
    return next;
  }
  revokeGlobal(gear: Gear): void {
    noteMutation(gear.id, -1e6);
    if (!this.globalStacks.has(gear)) return;
    this.globalStacks.delete(gear);
  }

  stacksOfEnemy(gear: Gear): number { return this.enemyStacks.get(gear) ?? 0; }
  enemyMax(gear: Gear): number { return gear.maxStacks + (this.enemyMaxIncrease.get(gear) ?? 0); }
  increaseMaxEnemy(gear: Gear, n: number, source: string): void {
    noteMutation(gear.id, 2e6 + n);
    if (dryRun) return;
    let sources = this.enemyMaxSources.get(gear);
    if (!sources) this.enemyMaxSources.set(gear, (sources = new Set()));
    if (sources.has(source)) return;
    sources.add(source);
    this.enemyMaxIncrease.set(gear, (this.enemyMaxIncrease.get(gear) ?? 0) + n);
  }
  addStackEnemy(gear: Gear, n = 1): number {
    noteMutation(gear.id, n);
    const next = Math.min(this.enemyMax(gear), this.stacksOfEnemy(gear) + n);
    if (!dryRun) recordApplied(gear, n);
    if (this.enemyStacks.get(gear) === next) return next;
    this.enemyStacks.set(gear, next);
    return next;
  }
  removeStackEnemy(gear: Gear, n = 1): number {
    noteMutation(gear.id, -n);
    const next = Math.max(0, this.stacksOfEnemy(gear) - n);
    if (next === 0) {
      if (!this.enemyStacks.has(gear)) return 0;
      this.enemyStacks.delete(gear);
      return 0;
    }
    if (this.enemyStacks.get(gear) === next) return next;
    this.enemyStacks.set(gear, next);
    return next;
  }
  setStacksEnemy(gear: Gear, n: number): number {
    noteMutation(gear.id, 1e6 + n);
    const next = Math.max(0, Math.min(this.enemyMax(gear), n));
    if (!dryRun) recordApplied(gear, n - this.stacksOfEnemy(gear));
    if (next === 0) {
      if (!this.enemyStacks.has(gear)) return 0;
      this.enemyStacks.delete(gear);
      return 0;
    }
    if (this.enemyStacks.get(gear) === next) return next;
    this.enemyStacks.set(gear, next);
    return next;
  }
  revokeEnemy(gear: Gear): void {
    noteMutation(gear.id, -1e6);
    if (!this.enemyStacks.has(gear)) return;
    this.enemyStacks.delete(gear);
  }
}

// TODO move this into enemy.ts
// level-100 enemy at a flat 20% resistance — the project's own standing baseline
const ENEMY_RES = 20, ENEMY_DEF_LEVEL = 100;
export const enemyDef = () => 792 + 8 * ENEMY_DEF_LEVEL;
export const enemyRes = () => ENEMY_RES;

/* -------------------------------------------------------------------------- the "current" pointers */

let currentState: State | null = null;
let currentSlot: TeamMember | null = null;
let currentBuff: Gear | null = null;
let currentAct: Action | null = null;
/** Whether the action being evaluated is the report's own "not really this resonator's turn" kind
 *  — see `triggeredAction()`. Passed in by `run()`, which is the only thing that knows. */
let currentTriggered = false;
/** The frozen stack count of whichever Gear is mid-callback, or -1 outside any phase — see
 *  `frozenStacks()`. */
let currentStacks = -1;
/** The tags of the action being evaluated as one word (`tagWordOf(currentAct)`, or the same with
 *  the override types swapped in), resolved once per action so `pushStat()` can test a scope
 *  against it with one mask. */
let currentTagWord = 0;
/** Set while `evaluate()` re-runs the stat phases for a main-stat variant (see
 *  `TeamMember.variants`). Grants, spends and gauge writes go ahead — a hook later in the same
 *  phase may read them live, exactly as it did in the real run — but onto copies, and
 *  `restoreFight()` puts the real fight back afterwards; the queues and `applied()` stay untouched,
 *  since nothing reads those mid-phase. */
let dryRun = false;
/** Set while a `snapshotFight()` is live — from the one taken ahead of the real build's stat
 *  phases until the last variant is restored — so every in-place structure a snapshot only holds
 *  by reference (a Pool's `at`, a member's `globalHooks`) is copied before its first write, by
 *  the real build's own hooks as much as by a dry run's. Everything else a snapshot holds is
 *  copy-on-write already, or a plain number. */
let guarded = false;
/** What a dry run wrote in place — a Pool's `at` or a member's `globalHooks`, the Gear, and what
 *  that key held before — as flat triples, for `undoDry()` to reverse before a snapshot is put
 *  back. A journal rather than a copy because a variant writes two or three entries and the copy
 *  was the whole map, once per variant per action. */
const dryLog: (Map<Gear, number> | Set<Gear> | Gear | number | boolean | undefined)[] = [];
function undoDry(): void {
  for (let i = dryLog.length - 3; i >= 0; i -= 3) {
    const target = dryLog[i], gear = dryLog[i + 1] as Gear, prev = dryLog[i + 2];
    if (target instanceof Map) { if (prev === undefined) target.delete(gear); else target.set(gear, prev as number); }
    else if (prev) (target as Set<Gear>).add(gear); else (target as Set<Gear>).delete(gear);
  }
  dryLog.length = 0;
}

/** The whole fight as `evaluate()` can put it back — allocated once per State (`State.snapshots`)
 *  and refilled in place, since one is taken on every varied action and an object per member per
 *  take was most of what a variant cost. */
class FightSnapshot {
  members: MemberSnapshot[];
  global: PoolSnapshot;
  enemy: PoolSnapshot;
  offtune = 0;
  constructor(state: State) {
    const pool = (): PoolSnapshot => ({ list: [], counts: [], hooks: [], globalHooks: [], at: new Map(), dead: 0 });
    const member = (): MemberSnapshot => ({ pool: pool(), globalHooks: new Set(), forte: [0, 0, 0, 0, 0], concerto: 0 });
    this.members = state.slots.map(member);
    this.global = pool(); this.enemy = pool();
  }
  take(state: State): void {
    state.slots.forEach((m, i) => m.snapshotInto(this.members[i]!));
    state.globalStacks.snapshotInto(this.global); state.enemyStacks.snapshotInto(this.enemy);
    this.offtune = state.offtune;
  }
  restore(state: State): void {
    undoDry();
    state.slots.forEach((m, i) => m.restore(this.members[i]!));
    state.globalStacks.restore(this.global); state.enemyStacks.restore(this.enemy);
    state.offtune = this.offtune;
  }
}
/** A running hash of every mutation attempted (which Gear or action, by how much) since it was
 *  last zeroed — taken over the real build's stat phases, then over each variant's dry re-run of
 *  the same, and compared: a variant that would have granted, spent or queued anything the real
 *  build didn't is one whose numbers can't stand in for a real run. */
let mutHash = 0;
const noteMutation = (id: number, n: number): void => { mutHash = (Math.imul(mutHash ^ id, 0x9e3779b1) + n) | 0; };
/** The stats `evaluate()` banks into the running gauges — a variant that moves any of these would
 *  bank differently, so the real build's fight isn't its fight either. */
const RESOURCE_STATS: Stat[] = [
  Stat.AddEnergy, Stat.AddConcerto, Stat.AddOfftune, Stat.DirectOfftune, Stat.OfftuneBuildup,
  Stat.AddForte1, Stat.AddForte2, Stat.AddForte3, Stat.AddForte4, Stat.AddForte5,
];
/** What a held Gear assigned for the action being evaluated (see `typeOverride()`) — the engine's
 *  own "override type1 / override type2", null when nothing did. Cleared by `evaluate()` for every
 *  action; read by `isType()`, the tag list, and the snapshot. */
let overrideType1: Type1 | null = null;
let overrideType2: Type2 | null = null;
/** Everything applied during the action being evaluated, and how many stacks of it — see
 *  `applied()`. Module-level rather than on the State so the stack methods (which have no State
 *  in hand) can record into it; `evaluate()` is never re-entered, so one shared map is safe. */
let appliedNow = new Map<Gear, number>();
const recordApplied = (gear: Gear, n: number): void => { if (n > 0) appliedNow.set(gear, (appliedNow.get(gear) ?? 0) + n); };

/** The three pools a phase reads — the acting slot's own, then team-wide, then enemy — as the
 *  arrays they held when `capture()` last ran. Three references apiece, nothing copied: a Pool's
 *  arrays are copy-on-write, so whatever a hook grants or spends mid-phase lands in new arrays and
 *  these keep describing the roster the phase started on. Module-level scratch rather than an
 *  object per capture — `evaluate()` is never re-entered, so one shared set is safe. */
const capList: Gear[][] = [[], [], []];
const capCounts: number[][] = [[], [], []];
const capHooks: number[][][] = [[], [], []];

/** The report bucket for damage that is nobody's turn — the shared Tune Break, and every Negative
 *  Status's own damage. Both still resolve on whoever is on field (see `evaluate()`); this only
 *  keeps them out of that resonator's own damage column. Declared per action through
 *  `ActionDef.slot`. */
export const MISC_SLOT = "Misc";

/** Take the three pools as they stand right now, for the phases that follow to run on. A Gear is
 *  only ever in one pool — a self buff is local, a team buff global, a debuff on the enemy — so
 *  the three are simply visited in turn, local first. */
function capture(slot: TeamMember, state: State): void {
  let pool = slot.stacks;
  capList[0] = pool.list; capCounts[0] = pool.counts; capHooks[0] = pool.hooks;
  pool = state.globalStacks;
  capList[1] = pool.list; capCounts[1] = pool.counts; capHooks[1] = pool.hooks;
  pool = state.enemyStacks;
  capList[2] = pool.list; capCounts[2] = pool.counts; capHooks[2] = pool.hooks;
}

/** Every captured Gear's constantStats summed into a fresh array, in roster order — the slot's
 *  own cached base for one tag word. With `from`/`to`, the one Gear `from` (a held main-stat Buff)
 *  is stood in for by `to` at the very same position, so a variant's base is built by exactly the
 *  additions, in exactly the order, a real run wearing `to` would make. */
function constBaseOf(slot: TeamMember, from: Gear | null, to: Gear | null): number[] {
  const live = slot.effective;
  slot.effective = ZERO_STATS.slice();
  for (let q = 0; q < 3; q++) {
    const list = capList[q]!, counts = capCounts[q]!, hooks = capHooks[q]![6]!;
    for (let i = 0, m = hooks.length; i < m; i++) {
      const k = hooks[i]!;
      const gear = list[k] === from ? to! : list[k]!;
      currentBuff = gear; currentStacks = counts[k]!;
      gear.constantStatsFn!();
    }
  }
  const base = slot.effective;
  slot.effective = live;
  return base;
}

/** Run one phase's hook on every captured Gear that has it, with the "current" pointers aimed at
 *  each in turn. `withStacks` hands each hook its own captured stack count (see `frozenStacks()`);
 *  afterAction runs without, reading the live count instead, since it is the one phase that
 *  runs after a gear may already have spent itself down. */
function runPhase(p: number, withStacks: boolean): void {
  for (let q = 0; q < 3; q++) {
    const list = capList[q]!, counts = capCounts[q]!, hooks = capHooks[q]![p]!;
    for (let i = 0, m = hooks.length; i < m; i++) {
      const k = hooks[i]!;
      const gear = list[k]!;
      currentBuff = gear;
      if (withStacks) currentStacks = counts[k]!;
      gear.hookFns[p]!();
    }
  }
}

/** Run one of the acting Action's own hooks (see the `Action` class), with the "current" pointers
 *  aimed at the action itself: whatever it grants is attributed through it and every stat it
 *  contributes is sourced to its own name. Called first in each phase, ahead of every held Gear's
 *  own hook, so an action's own effect is in place before anything reacting to it looks. */
function actionHook(fn: (() => void) | undefined): void {
  if (!fn) return;
  currentBuff = currentAct;
  currentStacks = 1;
  fn();
}

/** Whether this run is capturing the report's own per-entry trace — every `StatEntry`, the scoped
 *  `totals` behind it, and the held-buff rosters each snapshot carries for the resonator popover.
 *
 *  Off by default: the comparison table runs thousands of teams and reads nothing but each row's
 *  own damage/member/action, while building that trace means an object allocation and a
 *  `Gear.toString()` (which formats "Name xN") for every stat every buff contributes on every
 *  action — by far the most expensive thing this engine does, and pure waste for a row nobody has
 *  opened. `setTracing(true)` before re-running the one team whose detail page is actually being
 *  shown; see index.ts's own `detailFor()`. */
let tracing = false;
export function setTracing(on: boolean): void { tracing = on; }

export const currentAction = (): Action => currentAct!;
/** Whether the action being evaluated was queued rather than played — an engine-spawned follow-up
 *  or event, the ECHO_CAST marker, or an outro handoff. The same answer the snapshot reports
 *  (`ResolvedSnapshot.triggered`), readable mid-action by gear that must not fire off one. */
export const triggeredAction = (): boolean => currentTriggered;
export const currentTeam = (): State => currentState!;
/** Whichever member the engine is mid-call for — the acting slot in every ordinary phase, and the
 *  gear's *own holder* inside updateGlobal() (see `evaluate()`). What a rotation marker's own
 *  `resolve()` reads to find the resonator/mainslot it stands in for. */
export const currentMember = (): TeamMember => currentSlot!;

/** Is the action being evaluated this cast type — checks both `cast` and `cast2`. */
export function casting(cast: Cast): boolean {
  return isCast(currentAct!, cast);
}

/** Assign the action being evaluated a different damage type, for a kit whose state changes what a
 *  cast *counts as* rather than what it does — Denia's Breakdown Form hits becoming Resonance
 *  Liberation DMG while she holds Void Particle, Lucilla's Chafe mode making Clear As Day Basic
 *  Attack DMG. Pass a `Type1` to stand in for the action's own `type`, or a `Type2` for its
 *  `type2`; the assignment *replaces* that slot, so a Basic hit assigned Liberation is not Basic
 *  any more, and it lasts the one action (every action starts clean).
 *
 *  **Call it from `updateDebuffs()`** — not a debuff, but that is the first phase of the action,
 *  and everything that could care runs after it: `updateGlobal`/`updateBuffs`, every
 *  `applyStats`/`convertStats`, every `isType()` anywhere, the tags each scoped stat matches
 *  against (rebuilt here, so a Liberation-scoped bonus pays on a retagged Basic), and the
 *  snapshot's own `type`. The one gap is that phase itself: another gear's `updateDebuffs` may
 *  already have run and asked `isType()` before this call lands, so don't assign from anywhere
 *  later and don't rely on ordering within it.
 *
 *  The Action is never touched — kits compare actions by identity, and a mutated singleton would
 *  leak across the teams a worker runs. */
export function typeOverride(type: Type1 | Type2): void {
  const a = currentAct!;
  if (type & TYPE2_BITS) overrideType2 = type as Type2;
  else overrideType1 = type as Type1;
  // the same three tags `tagWordOf()` folds, with the assignment standing in for whichever slot
  // it claimed
  currentTagWord = tagWord(a.element, overrideType1 ?? a.type, overrideType2 ?? a.type2);
}

/** Is the action being evaluated this damage type — its own `type` or `type2`, or whichever of
 *  the two a held Gear's `typeOverride` assigned for this evaluation, which stands in for that
 *  slot (a Basic hit assigned Liberation answers Liberation, not Basic). Kits ask this, never
 *  `currentAction().type` directly, so an assignment is seen by every check everywhere. */
export function isType(type: Type1 | Type2): boolean {
  const a = currentAct!;
  return (overrideType1 ?? a.type) === type || (overrideType2 ?? a.type2) === type;
}

/** The same question about an action that isn't the one being evaluated — a snapshot's own, after
 *  the fact. Nothing outside this file should ever read `.cast`/`.cast2` directly: an action can
 *  count as two casts at once (Qiuyuan's Thus Spoke the Blade trio are Heavy Attacks whose
 *  performance also counts as performing an Echo Skill, which is what feeds Sigrika's own
 *  Soliskin Vitality), and a bare `.cast === X` silently misses every one of them. */
export function isCast(action: Action, cast: Cast): boolean {
  return action.cast === cast || action.cast2 === cast;
}

/** How many stacks of this Gear were applied *during the action being evaluated* — 0 if none.
 *  Every grant path (self, team, enemy, an outro handoff adopted at an Intro) records here, before
 *  any cap or "already held at that count" early-out, so re-inflicting a 1-stack debuff that's
 *  already on the target still reads as inflicted this action. Cleared at the top of every
 *  `evaluate()`. This is what a piece of gear reacting to "inflicts Tune Strain - Shifting" /
 *  "inflicts Fusion Burst" / "gains a shield" reads (see statuses.ts) — the counts, not just a
 *  yes/no, so a two-shield cast still counts twice. */
export function applied(gear: Gear): number { return appliedNow.get(gear) ?? 0; }

/** Same as `applied()`, but only counting it when *the resonator whose turn it is* is what put it
 *  on — 0 when it landed on this action off somebody else's kit.
 *
 *  The two differ exactly when one resonator's marker inflicts something off the back of a
 *  *teammate's* cast (Chisa's Unseen Snare handing out Havoc Bane on whoever is hitting the marked
 *  target). `applied()` is a plain "did this land this action", which is right for a kit reacting
 *  to the fight — Lucy's Countermeasure watching for anyone's Hack - Shifting, Lucilla's Film Roll
 *  answering a teammate's Chafe. It is wrong for a "when *you* inflict X" passive: a weapon or
 *  sonata worn by the teammate whose swing merely triggered Chisa's marker would read the Bane as
 *  theirs and pay out, when the kit text credits it to Chisa alone. Those read this instead.
 *
 *  "Whose doing" is `State.sourceOf`, already maintained on every grant path (see `attribute()`),
 *  so a debuff inherits the source of whichever Gear granted it rather than whoever was on field.
 *  It is compared against the acting slot, *not* against the asking Gear's own source: an outro
 *  handoff (Electro Rover's Electro Core) is sourced to whoever granted it but held and triggered
 *  by the resonator who received it, and that resonator inflicting the status is exactly the case
 *  it must still fire on.
 *
 *  Only meaningful for locally-held gear reading it in `updateBuffs`/`applyStats`, where the acting
 *  slot *is* the wearer. Inside `updateGlobal` a locally-held gear runs with `currentSlot` switched
 *  to its own holder rather than the actor, so anything deliberately watching the whole team's
 *  casts from there wants plain `applied()`. Only the last applier in an action is kept per Gear,
 *  so two kits inflicting the same status on one action credit the later — nothing in the roster
 *  does that today. */
export function appliedByMe(gear: Gear): number {
  const n = applied(gear);
  if (n === 0) return 0;
  return currentState!.sourceOf.get(gear) === currentSlot!.name ? n : 0;
}

/** This buff's own stack count — frozen at the start of the phase (see `capture()`), not a live
 *  re-read. A buff that revokes itself in `updateBuffs()` still reports its true held count to its own
 *  `applyStats()` this same action, matching the old engine's `apply(ctx, stacks)` — `stacks` was a
 *  parameter bound once, never re-read mid-action either.
 *
 *  Carried alongside `currentBuff` rather than looked up in a frozen Map: the engine walks the
 *  held roster one gear at a time and already knows each one's frozen count as it goes, so handing
 *  that count over directly removes the only reason that Map had to exist. -1 means "no phase is
 *  running" — a display() called outside one falls back to the live count. */
export function frozenStacks(): number {
  return currentStacks >= 0 ? currentStacks : currentSlot!.stacksOf(currentBuff!);
}

/** Shared write path for addStat()/addEnemyStat() — pushes the trace entry and bumps the running
 *  total, keyed off whatever string the caller already resolved (plain or scoped). Source (which
 *  Gear) and owner (whose *kit* granted it — `State.sourceOf`, not whoever's turn it happens to
 *  be) are read off the "current" pointers, not passed in — every call site stays exactly as
 *  terse as before, but the report can still trace every value back to what granted it and colour
 *  it by that kit. Falls back to whoever's actually acting only if this Gear was somehow never
 *  attributed (shouldn't happen — every grant path calls `attribute()`). */
function pushStat(stat: Stat | EnemyStat, tag: Tag | undefined, value: number): void {
  const slot = currentSlot!;

  // The formula-facing total: an unscoped contribution always counts, a scoped one only when its
  // own tag is the action's in that band — `currentTagWord` masked to the tag's six bits is the
  // tag itself. Folding that test in here is what lets `get()` and the snapshot's own `stat()`
  // be a single read rather than a re-sum over every scope.
  if (tag === undefined || (currentTagWord & tagBand(tag)) === tag) {
    slot.effective[stat] = slot.effective[stat]! + value;
    // ...and again into the Negative-Status-scoped subtotal, if that's what this is (see
    // TYPE2_AMP_INDEX). Only reached by an amplification that carried a scope at all, so it
    // costs nothing on the ordinary path.
    if (stat === Stat.Amp && tag !== undefined && (tag & TYPE2_BITS) !== 0) {
      slot.effective[TYPE2_AMP_INDEX] = slot.effective[TYPE2_AMP_INDEX]! + value;
    }
  }

  if (!tracing) return;

  // Trace-only from here (see `tracing`): the scoped running total and the per-entry record the
  // report's own hover panels read. `toString()`, not `.name` directly — a maxStacks > 1 Gear
  // reads "Name xN" (see Gear's own toString()), so those panels show the stack count behind
  // every value.
  const key = tag === undefined ? stat : scopedStat(tag, stat);
  slot.entries.push({
    stat: key, value,
    source: currentBuff?.toString() ?? "",
    owner: (currentBuff && currentState!.sourceOf.get(currentBuff)) ?? slot.name ?? null,
  });
  slot.totals.set(key, (slot.totals.get(key) ?? 0) + value);
}

/** Contribute a personal stat — optionally scoped (`addStat(Stat.DmgBonus, 12, Attribute.Havoc)`).
 *  For the attacker's own line only; a debuff that changes the *enemy's* own stat (Res Reduce,
 *  Def Reduce) is `addEnemyStat()` instead, below. */
export function addStat(stat: Stat, value: number, tag?: Tag): void {
  pushStat(stat, tag, value);
}

/** Contribute to an `EnemyStat` — a real debuff on the target (Res Reduce, Def Reduce) that every
 *  attacker reads identically, not a personal modifier. Its own function (not `addStat`) so a kit
 *  can't reach for `Stat.ResIgnore`-style attacker-side stats when it actually means a target-side
 *  one, or vice versa — same split as the two enums themselves (see `EnemyStat` in stats.ts). Still
 *  folds into the acting resonator's own running totals underneath, same as any other enemy
 *  debuff (`State.enemyStacks`'s own gear runs through this same acting slot every action, so
 *  every attacker ends up reading the identical number). */
export function addEnemyStat(stat: EnemyStat, value: number, tag?: Tag): void {
  pushStat(stat, tag, value);
}

/** Every value the three tag enums hold, for `menuStats()`'s own zipped passes below. */
const ALL_ATTRIBUTES: Attribute[] = [
  Attribute.Aero, Attribute.Electro, Attribute.Fusion, Attribute.Glacio,
  Attribute.Spectro, Attribute.Havoc, Attribute.Physical,
];
const ALL_TYPE1: Type1[] = [
  Type1.Basic, Type1.Heavy, Type1.Skill, Type1.Liberation, Type1.Intro, Type1.Outro,
  Type1.Echo, Type1.Status, Type1.Break, Type1.Rupture, Type1.Strain, Type1.Hack, Type1.Utility,
];
const ALL_TYPE2: Type2[] = [
  Type2.Coordinated, Type2.SpectroFrazzle, Type2.AeroErosion,
  Type2.FusionBurst, Type2.GlacioChafe, Type2.ElectroFlare,
];

/**
 * A loadout's own equipped gear, read cold — no action ever cast, just every `constantStats()`
 * call each piece makes. Drives the ordinary `addStat()`/`pushStat()` path exactly as a real
 * action would, unmodified: since there is no acting action here, a scoped call (a mainslot's
 * own attribute+type dmg bonus, a sonata 2pc's) is replayed once per Attribute/Type1/Type2 value
 * so it lands on whichever pass actually matches its own tag — the three bands are independent,
 * so one pass tests one attribute and one Type1 and one Type2 candidate at once, `ALL_TYPE1`'s
 * own length many passes covering the lot. An unscoped call (`tag === undefined`) matches every
 * pass regardless, so it is deduped back down to the one entry it actually is afterward. For the
 * loadout hover's own "menu stats" section (index.ts).
 */
export function menuStats(gear: Gear[]): StatEntry[] {
  const slot = new TeamMember("");
  const state = new State([]);
  const saved = { currentSlot, currentState, currentBuff, currentStacks, currentTagWord, tracing };
  currentSlot = slot;
  currentState = state;
  currentStacks = 1;
  tracing = true;
  const passes = ALL_TYPE1.length;
  for (const g of gear) {
    if (!g.constantStatsFn) continue;
    currentBuff = g;
    for (let i = 0; i < passes; i++) {
      currentTagWord = (ALL_ATTRIBUTES[i] ?? 0) | ALL_TYPE1[i]! | (ALL_TYPE2[i] ?? 0);
      g.constantStatsFn();
    }
  }
  ({ currentSlot, currentState, currentBuff, currentStacks, currentTagWord, tracing } = saved);

  // Collapse the duplicate pushes an unscoped call made on every pass back down to one — a scoped
  // call only ever matched a single pass to begin with, so this is a no-op for those.
  const seen = new Set<string>();
  return slot.entries.filter((e) => {
    const key = `${e.source} ${e.stat}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Running total for the action being evaluated, including any scoped variant matching it — one
 *  lookup, since `pushStat()` already folded every matching scope in as it was written. */
export function getStat(stat: Stat): number {
  return currentSlot!.effective[stat]!;
}
export function pct(stat: Stat): number { return getStat(stat) / 100; }

// local — the acting resonator's own held Gear. Read-only, so these still take any Gear
// (checking whether a Mainslot/Resonator is equipped is legitimate); only the stack-modifying
// functions below are Buff-only — a Resonator/Mainslot/weapon's own "equipped" identity is
// established once, by equip(), and never granted/revoked again mid-fight.
export function stacksOf(gear: Gear): number { return currentSlot!.stacksOf(gear); }
export function isHeld(gear: Gear): boolean { return currentSlot!.isHeld(gear); }
export function maxEnergy(): number { return currentSlot!.resonator?.maxEnergy ?? 0; }

/** The acting resonator's own forte gauges, 1-5 — plain numbers, not a Buff's stack count
 *  (Jingran's Qi is `forte1()`, his Mingfire is `forte2()`). No floor, no ceiling — a kit's own
 *  declared `forte1`/`forte2` deltas on an action can be negative when consumed, and this can run
 *  negative too (a kit clamps its own gauge's real bounds itself, if it ever needs to, by calling
 *  `setForteN` directly rather than relying on this to do it). One tiny factory rather than five
 *  hand-written copies of the same three lines. */
function forteGauge(i: 0 | 1 | 2 | 3 | 4) {
  return {
    get: (): number => currentSlot!.forte[i],
    set: (value: number): number => { noteMutation(-1 - i, value); return (currentSlot!.forte[i] = value); },
    add: (delta: number): number => { noteMutation(-1 - i, delta); return (currentSlot!.forte[i] = currentSlot!.forte[i] + delta); },
  };
}
export const { get: forte1, set: setForte1, add: addForte1 } = forteGauge(0);
export const { get: forte2, set: setForte2, add: addForte2 } = forteGauge(1);
export const { get: forte3, set: setForte3, add: addForte3 } = forteGauge(2);
export const { get: forte4, set: setForte4, add: addForte4 } = forteGauge(3);
export const { get: forte5, set: setForte5, add: addForte5 } = forteGauge(4);

/** The acting resonator's own running Concerto Energy — same "a kit clamps its own gauge's real
 *  bounds itself, by calling this directly" shape as `setForteN` above (Camellya's own Ephemeral:
 *  "requires full Concerto, consumes 70" only makes sense against a clamped-to-100 starting
 *  point, not whatever this run happens to have overshot to). Read-only everywhere else — a kit
 *  still never *adds* to this directly, same as forte; evaluate() alone banks `action.concerto`/
 *  `AddConcerto` into it every action. */
export function concerto(): number { return currentSlot!.concerto; }
export function setConcerto(value: number): number {
  noteMutation(-10, value);
  return (currentSlot!.concerto = value);
}

/** Record whose kit this Gear came from (see `State.sourceOf`). Called by every grant, so a buff
 *  is attributed the moment it lands rather than guessed at from its name later.
 *
 *  Whatever is granting right now is `currentBuff` — the Gear whose own updateBuffs() is mid-run — so
 *  a buff a buff puts up inherits that buff's source. Outside any Gear's update (which is only
 *  ever `equip()` during team setup) there's nothing to inherit from, so it's sourced to the
 *  member being equipped. */
function attribute(gear: Gear): void {
  const inherited = currentBuff ? currentState!.sourceOf.get(currentBuff) : undefined;
  currentState!.sourceOf.set(gear, inherited ?? currentSlot!.name);
}

export function applyCurrent(buff: Buff, n = 1): number {
  attribute(buff);
  return currentSlot!.addStack(buff, n);
}

/** Grant during team setup, not mid-fight — same as `applySelf` but also fires this Gear's own
 *  `combatStart()` exactly once, and (unlike every stack-modifying function below) takes any
 *  Gear, not just a Buff — this is the one place a Resonator/Mainslot/weapon's own "equipped"
 *  status is ever granted. Use this (not `applySelf`) for a resonator's own kit/talents, weapon,
 *  echoes, and mainstat/substat rolls when first assembling a team. */
export function equip(gear: Gear, n = 1): number {
  attribute(gear);
  const result = currentSlot!.addStack(gear, n);
  currentSlot!.equipped.add(gear);
  if (gear instanceof Mainslot) currentSlot!.mainslot = gear;
  // as `currentBuff` for the call, same as every other hook: what combatStart() grants inherits
  // this gear's own source, and maxStackIncrease() can name it
  const prevBuff = currentBuff;
  currentBuff = gear;
  try { gear.combatStartFn?.(); } finally { currentBuff = prevBuff; }
  return result;
}

export function setStacksSelf(buff: Buff, n: number): number {
  attribute(buff);
  return currentSlot!.setStacks(buff, n);
}
export function removeStack(buff: Buff, n = 1): number { return currentSlot!.removeStack(buff, n); }
export function revokeSelf(buff: Buff): void { currentSlot!.revoke(buff); }

/** Shortcut for a buff whose own kit text says "lost on swap" — revokes itself the moment the
 *  action being evaluated is inactive (the project's own standing convention: lost on swap =
 *  lost on inactive action). Call it from `updateBuffs()` if it should stop contributing before that
 *  same action's own stats apply, or from `convertStats()` if it should still pay out on it first —
 *  same choice as any other revoke, just this one condition spelled out once instead of copied at
 *  every call site. Only correct for a buff whose own holder has no *other* inactive action of
 *  their own (a queued coordinated-attack hit, say) that should leave it standing — one held by a
 *  resonator like that still needs its own explicit condition instead. */
export function lostOnSwap(): void {
  if (!currentAct!.active) revokeSelf(currentBuff as Buff);
}

// team-wide — one shared copy, ticks on every slot's own turn regardless of who's acting
export function stacksOfTeam(gear: Gear): number { return currentState!.stacksOfGlobal(gear); }
export function applyTeam(buff: Buff, n = 1): number {
  attribute(buff);
  return currentState!.addStackGlobal(buff, n);
}
export function removeStackTeam(buff: Buff, n = 1): number { return currentState!.removeStackGlobal(buff, n); }
export function revokeTeam(buff: Buff): void { currentState!.revokeGlobal(buff); }

// placed on the enemy rather than any resonator — same "ticks on every slot's own turn" shape as
// the Team functions above, kept as its own pool so the report can tell the two apart (see
// State.enemyStacks)
export function stacksOfEnemy(gear: Gear): number { return currentState!.stacksOfEnemy(gear); }
export function applyEnemy(debuff: Debuff, n = 1): number {
  attribute(debuff);
  return currentState!.addStackEnemy(debuff, n);
}
export function removeStackEnemy(debuff: Debuff, n = 1): number { return currentState!.removeStackEnemy(debuff, n); }
export function revokeEnemy(debuff: Debuff): void { currentState!.revokeEnemy(debuff); }
/** Raise an enemy debuff's cap for the rest of the fight: its effective max becomes its own
 *  declared maxStacks plus every increase granted. Works before the debuff is ever applied, so a
 *  kit can call it from combatStart(). Deduplicated by whichever Gear is running — one gear only
 *  ever raises a given debuff's cap once, so an "on hit, not stackable" raise can just be called
 *  on every hit (see `State.enemyMaxSources`). */
export function maxStackIncrease(debuff: Debuff, n = 1): void {
  currentState!.increaseMaxEnemy(debuff, n, currentBuff?.name ?? currentSlot!.name);
}

/** Grant/spend a Buff on one specific resonator's own local frozenStacks, regardless of whose turn it
 *  is — for a kit that reacts to the whole team but pays out onto one specific member (Jingran's
 *  Trace the Vestige, feeding his own Ghost Shroud off anyone's shield). Resolved via
 *  `State.memberOf()`, so it throws rather than silently no-opping if that resonator isn't
 *  actually on this team. */
export function addBuff(resonator: Resonator, buff: Buff, n = 1): number {
  attribute(buff);
  return currentState!.memberOf(resonator).addStack(buff, n);
}
export function removeBuff(resonator: Resonator, buff: Buff, n = 1): number {
  return currentState!.memberOf(resonator).removeStack(buff, n);
}
export function revokeBuff(resonator: Resonator, buff: Buff): void {
  currentState!.memberOf(resonator).revoke(buff);
}

/** Grant to every slot except the one currently acting. */
export function applyOthers(buff: Buff, n = 1): void {
  attribute(buff);
  for (const s of currentState!.slots) if (s !== currentSlot) s.addStack(buff, n);
}

/** Publish a Buff for whoever intros next — adopted automatically the moment an Intro-cast
 *  action is evaluated, before that action's own updateBuffs()/applyStats()/convertStats() run. */
export function queueOutro(buff: Buff): void {
  // attributed here, at the outro that publishes it — not when the next resonator adopts it,
  // which would credit the buff to whoever received it rather than whoever handed it over
  noteMutation(buff.id, 3e6);
  if (dryRun) return;
  attribute(buff);
  currentState!.outroQueue.push(buff);
}

/** Captures which slot queued it — `currentSlot`, not `state.active`: they're the same slot in
 *  every ordinary updateBuffs()/applyStats()/convertStats() call, but they can genuinely differ inside
 *  updateGlobal() (a locally-held gear reacting to a teammate's own turn runs with `currentSlot`
 *  switched to *its own* holder, not whoever's actually acting — see evaluate()'s own updateGlobal
 *  phase). Pinning to `currentSlot` is what lets a follow-up like this still land on its own
 *  caller's slot when queued that way (Phrolova's Maestro drawing a Hecate note off a teammate's
 *  own Echo Skill cast, say) instead of misfiring on whoever triggered it. Also covers the
 *  original reason this was pinned at all: an Outro right after can advance `state.active` before
 *  this runs, so without pinning to *some* fixed slot, a follow-up would misfire on whoever's turn
 *  it happens to be by then (matches the old engine's `ctx.queue()`). */
const pendingQueue: { action: Action; slot: number }[] = [];
export function queue(action: Action): void {
  noteMutation(action.id, 4e6);
  if (dryRun) return;
  pendingQueue.push({ action, slot: currentState!.slots.indexOf(currentSlot!) });
}

/** Queue an action that belongs to nobody — the two ways an engine-level event differs from a
 *  resonator's own follow-up, which is all the Tune Break needs to be one (tunebreak.ts):
 *
 *  - *ahead* of anything this action already queued, because a break fires the instant the bar
 *    fills, before any coordinated attack the same action spawned — and those follow-ups then bank
 *    onto the bar it already emptied instead of seeing it still full;
 *  - *unpinned* (slot -1, exactly like a rotation entry), so it runs on whoever is on field when it
 *    resolves rather than on whoever queued it. That's the difference on a break that goes off on
 *    an Outro: the handoff has landed by then, and the break is the incoming resonator's to eat. */
export function queueEvent(action: Action): void {
  noteMutation(action.id, 5e6);
  if (dryRun) return;
  pendingQueue.unshift({ action, slot: -1 });
}

/** Same as `queue()`, but attributed to one specific resonator's own slot regardless of whose
 *  turn it actually is or who's reacting — for a kit reacting through `updateGlobal()` (so
 *  `currentSlot` is its own holder, not the real actor) that still wants the follow-up to land on
 *  whoever it's actually for. Resolved via `State.memberOf()`, same "throws rather than silently
 *  no-opping" contract as `addBuff()`. */
export function queueOn(resonator: Resonator, action: Action): void {
  noteMutation(action.id, 6e6);
  if (dryRun) return;
  pendingQueue.push({ action, slot: currentState!.slots.indexOf(currentState!.memberOf(resonator)) });
}

/** Run `fn` (a resonator's initial grants, before any rotation has evaluated) with the "current"
 *  pointers aimed at `state`'s active slot. Save/restore, so nested use can't corrupt an outer
 *  in-flight call. */
export function withTeam(state: State, fn: () => void): void {
  const prevState = currentState, prevSlot = currentSlot, prevBuff = currentBuff, prevAction = currentAct;
  currentState = state;
  currentSlot = state.slot;
  try { fn(); } finally {
    currentState = prevState; currentSlot = prevSlot; currentBuff = prevBuff; currentAct = prevAction;
  }
}

/* ------------------------------------------------------------------------------- evaluation */

export interface Snapshot {
  action: Action;
  member: string;
  stat(key: Stat | EnemyStat): number;
  /** The same totals `stat()` reads, as the array itself — indexed by the stat, for damage.ts's
   *  dozen reads per row. */
  stats: number[];
  atk: number; hp: number; def: number;
  amp: number; dmgBonus: number;
  /** The `Type2`-scoped part of `amp` on its own — the only amplification a dot row reads (see
   *  TYPE2_AMP_INDEX and damage.ts's own `ampFactor`). */
  type2Amp: number;
  enemyRes: number; enemyDef: number;
}

/** A snapshot with everything the old report/display layer also wants: the raw per-entry trace
 *  (`entries`), a `slot` alias for `member` (display.ts's own field name), and resource counters
 *  — always empty here, since this engine folds Energy/Concerto/Offtune into Stat's own space
 *  rather than tracking a running counter (see `AddEnergy` above); a column fed entirely by
 *  zeroes is dropped by `buildReport()` itself, so this degrades to "not shown" rather than
 *  lying with a fake number. `triggered` is set by `run()`, not here — only it knows whether an
 *  action came off the rotation list or was queued mid-fight. */
export interface ResolvedSnapshot extends Snapshot {
  slot: string;
  entries: StatEntry[];
  triggered: boolean;
  /** The damage type this action was actually evaluated as — its own `type`, unless a held Gear
   *  called `typeOverride()` on it (`action.type` off a snapshot is always the base type; this is
   *  the effective one, what `isType()` answered against). */
  type: Type1 | null;
  /** This slot's own forte gauges 1-5, as they stood once this action resolved. */
  forte: [number, number, number, number, number];
  /** Running totals as they stood once this action resolved — energy/concerto are this slot's
   *  own (TeamMember.energy/concerto), offtune is the enemy's shared one (State.offtune). All
   *  three are banked automatically by evaluate() itself; see AddEnergy/AddConcerto/AddOfftune. */
  energy: number;
  concerto: number;
  offtune: number;
  /** How much concerto this action's own outro-firing zeroed back out by — 0 on every action
   *  that isn't an outro. Not folded into `concerto` above (that is already the post-reset 0);
   *  it's what the report reads to flag an outro that fired on an underfull bar. */
  concertoSpent: number;
  /** This slot's own RealEnergy (see `TeamMember.realEnergy`) as it stood right before this
   *  action's own gain landed — what the Energy Requirements table reads off a resetEnergy-marked
   *  Liberation's own row to compute that loop's ER requirement. */
  realEnergyBefore: number;
  /** Every Buff actually held once this action resolved — local (this slot's own), global
   *  (team-wide), and enemy (debuffs on the target — `State.enemyStacks`) kept apart, since
   *  that's a real distinction to a resonator popover, not just a formatting detail. Equipped
   *  gear is excluded (see `TeamMember.equipped`); each entry carries its own name (`toString()`,
   *  so "Name xN" where it stacks) and whose kit it came from (`State.sourceOf`). */
  heldLocal: HeldBuff[];
  heldGlobal: HeldBuff[];
  heldEnemy: HeldBuff[];
  /** This action's own average damage under each of the acting member's main-stat variants (see
   *  `TeamMember.variants`), in their order — `null` on every action of a member without any, and
   *  on every traced run. solver.ts sums these the way it sums the real `avg`. */
  variantAvg: number[] | null;
}

/** One rendered line in the report: this engine has no multi-hit chain concept (a queued
 *  follow-up is already its own top-level row — see `run()`), so every group is a single action,
 *  never collapsed. Kept only so display.ts's own `buildReport(lines: ChainGroup[])` — otherwise
 *  unmodified — still has something to consume. */
export interface ChainGroup {
  id: string;
  isChain: boolean;
  parts: { snap: ResolvedSnapshot; dmg: { avg: number } }[];
  snap: ResolvedSnapshot;
  mv: number;
  avg: number;
}

/** Evaluate one action on `state`'s active slot: an Intro-cast adopts whatever's queued for it
 *  first; then every held Gear's updateDebuffs() runs — local (acting slot), global, and enemy
 *  together — so what this cast inflicts is on the target before anything reacts; then every
 *  held Gear's updateGlobal() (every slot's own gear, not just the acting one — see its own
 *  comment below); then every held Gear's updateBuffs(); then every applyStats(), then every
 *  convertStats(), then every lateConvertStats(); an Outro-cast advances the active slot
 *  afterward.
 *
 *  The action itself is a Gear too, and its own hook for a phase runs first in that phase, ahead
 *  of every held Gear's (see `actionHook`) — so a cast's own effect is in place before anything
 *  reacting to it looks. */
export function evaluate(state: State, action: Action, triggered = false): ResolvedSnapshot {
  // always whoever is on field. A Negative Status's own damage used to be diverted onto a
  // resonator-less slot of its own, which meant no attacker's gear reached it and the one
  // amplification a dot row does read (`Type2`-scoped, see damage.ts) could only ever be granted
  // team-wide. It now resolves on the acting slot exactly the way a Tune Break does — their stats,
  // their `Type2` amplification — while still reporting under `MISC_SLOT`, which the action itself
  // declares, so it stays out of anybody's damage column. It is still not their *action*: it is
  // an ordinary active cast all the same, exactly like a Tune Break — the resonator really is on
  // field for it — so no "lost on swap" buff mistakes it for its holder leaving. What separates it
  // from a real press is `triggeredAction()`, which a passive counting those tests instead.
  const slot = state.slot;
  currentState = state;
  currentSlot = slot;
  currentAct = action;
  currentTriggered = triggered;
  currentTagWord = tagWordOf(action);
  // every action starts on its own type; a held Gear reassigns it from updateDebuffs() below, and
  // `typeOverride()` rebuilds `currentTagWord` when one does
  overrideType1 = null; overrideType2 = null;
  // a fresh map rather than a clear, same reasoning as `slot.effective` below
  appliedNow = new Map();
  // Replaced rather than cleared/copied: the snapshot below keeps whichever array this action built,
  // so handing it a fresh one here is what makes that snapshot immutable at zero copying cost (the
  // old code cleared these and then cloned `totals` at the end, paying an O(entries) copy per
  // action for the same guarantee).
  slot.effective = ZERO_STATS.slice();
  if (tracing) { slot.entries = []; slot.totals = new Map(); }

  if (casting(Cast.Intro) && state.outroQueue.length) {
    for (const gear of state.outroQueue.splice(0)) slot.addStack(gear, 1);
  }

  // A phase's own roster and stack counts are captured before it runs (see `capture()`), so
  // nothing a gear does mid-phase shifts the ground under whatever this engine iterates to next.
  //
  // updateDebuffs() first of all: what this cast inflicts (Shifting, Negative Statuses, the shield
  // marker) goes on the target before anything — updateGlobal() included — looks at `applied()`.
  capture(slot, state);
  actionHook(action.updateDebuffsFn);
  runPhase(0, true);

  // updateGlobal() runs next, and runs for every slot's own held gear — not just the acting
  // slot's — plus global and enemy gear, regardless of whose turn this actually is. That's what
  // lets a kit react to "any team member's own action" through gear held locally (a self buff)
  // instead of needing the whole thing to live in globalStacks just to be reachable from someone
  // else's turn. For a locally-held gear, `currentSlot` is switched to *its own holder* for the
  // call (not the slot actually acting) — so `revoke()`/`applySelf()`/`stacksOf()` inside it
  // still resolve against whoever holds it, the same way they would if that holder were the one
  // acting. Global and enemy gear keep the ordinary convention instead: `currentSlot` stays the
  // real acting slot, matching every other global buff's own updateBuffs().
  actionHook(action.updateGlobalFn);
  for (const s of state.slots) {
    for (const gear of s.globalHooks) {
      currentSlot = s;
      currentBuff = gear;
      gear.updateGlobalFn!();
    }
  }
  currentSlot = slot;
  // Both lists are read before either runs: a hook here may put up another team-wide or enemy
  // buff, and that lands in a new array (see `Pool`) — the ones in hand are the roster as it
  // stood, which is the behaviour. Not deduplicated across the two pools, as it never was.
  const globalHooks = state.globalStacks.globalHooks, enemyHooks = state.enemyStacks.globalHooks;
  for (let i = 0; i < globalHooks.length; i++) { currentBuff = globalHooks[i]!; currentBuff.updateGlobalFn!(); }
  for (let i = 0; i < enemyHooks.length; i++) { currentBuff = enemyHooks[i]!; currentBuff.updateGlobalFn!(); }
  currentBuff = null;

  // updateBuffs() decides what's held; it runs over whatever updateDebuffs()/updateGlobal() left —
  // a debuff those just put up gets its own updateBuffs() this same action.
  capture(slot, state);
  actionHook(action.updateBuffsFn);
  runPhase(1, true);

  // ...then applyStats()/convertStats() pay out over what's held *now*, not what was held a
  // moment ago: a buff updateBuffs() just granted pays into this same action, and one it just
  // revoked pays nothing. Captured again at post-update counts, so a buff that gained or spent
  // stacks reports the count it actually ended on to its own applyStats() — and this one capture
  // serves every phase from here down, so a buff that spends itself in convertStats() (Jingran's
  // Fire of Life) still reaches lateConvertStats()/afterAction() and the popover below.
  capture(slot, state);
  // Every held Gear's constantStats first, ahead of any applyStats. Traced, they run like any
  // other phase so the report gets its per-entry sources; untraced, the slot's cached sum for
  // this action's tag word lands in one pass — built by running them just once (see `constBase`).
  // ...and what the acting member's main-stat variants (if any) start from: everything the phases
  // so far contributed, before the real build's constant base goes in
  const pre = !tracing && slot.variants.length !== 0 ? slot.effective.slice() : null;
  // ...and the fight as it stands going into them, for each variant to start from
  guarded = pre !== null;
  const snapshots = pre !== null ? (state.snapshots ??= [new FightSnapshot(state), new FightSnapshot(state), new FightSnapshot(state)]) : null;
  if (snapshots !== null) snapshots[0].take(state);
  if (tracing) runPhase(6, true);
  else {
    // ...and the variants' own bases alongside it: they are the same sum with one main stat
    // swapped, so whatever stales one stales the other. Load-bearing the moment anything that
    // comes and goes declares `constantStats` — without it a variant is scored against a base
    // built before the buff landed, and the search picks a main stat on numbers that never
    // happened.
    if (slot.constBaseVersion !== constVersion) {
      slot.constBase.clear();
      for (const m of slot.variantBase) m.clear();
      slot.constBaseVersion = constVersion;
    }
    let base = slot.constBase.get(currentTagWord);
    if (base === undefined) slot.constBase.set(currentTagWord, base = constBaseOf(slot, null, null));
    const effective = slot.effective;
    for (let i = 0; i < effective.length; i++) effective[i] = effective[i]! + base[i]!;
  }
  mutHash = 0;
  actionHook(action.applyStatsFn);
  runPhase(2, true);
  actionHook(action.convertStatsFn);
  runPhase(3, true);
  // ...and one phase later again, for a conversion that reads what another gear's convertStats()
  // just granted (see GearDef.lateConvertStats).
  actionHook(action.lateConvertStatsFn);
  runPhase(4, true);

  // Each variant now: the same three phases again on the same captured roster, from the same
  // starting point plus its own base, with the fight rolled back to what the real build left
  // after each (`dryRun`/`restoreFight`) — so every hook reads exactly what it read in the real
  // build, live reads included. A variant whose hooks would have granted/spent/queued anything
  // different, or whose resource stats would bank differently, is marked unsafe: its fight would
  // not have been this fight.
  let variantEff: number[][] | null = null;
  if (pre !== null && snapshots !== null) {
    const primaryHash = mutHash, primaryEff = slot.effective;
    const [before, after] = snapshots;
    after.take(state);
    variantEff = [];
    dryRun = true;
    for (let v = 0; v < slot.variants.length; v++) {
      let vbase = slot.variantBase[v]!.get(currentTagWord);
      if (vbase === undefined) slot.variantBase[v]!.set(currentTagWord, vbase = constBaseOf(slot, slot.variantOf, slot.variants[v]!));
      const eff = pre.slice();
      for (let i = 0; i < eff.length; i++) eff[i] = eff[i]! + vbase[i]!;
      slot.effective = eff;
      before.restore(state);
      mutHash = 0;
      actionHook(action.applyStatsFn);
      runPhase(2, true);
      actionHook(action.convertStatsFn);
      runPhase(3, true);
      actionHook(action.lateConvertStatsFn);
      runPhase(4, true);
      let unsafe = mutHash !== primaryHash;
      for (const s of RESOURCE_STATS) if (eff[s] !== primaryEff[s]) unsafe = true;
      if (unsafe) slot.variantUnsafe[v] = true;
      variantEff.push(eff);
    }
    dryRun = false;
    after.restore(state);
    slot.effective = primaryEff;
  }

  // What belongs in the resonator popover is what's held once updateBuffs() has finished, before
  // applyStats()/convertStats() run. A buff that spends/revokes itself inside its own convertStats() (Jingran's
  // Fire of Life: does its one job, then removes itself the same action) still counts as having
  // been present and paid out, so it still belongs in the list — which is why the roster comes off
  // `active`/the pre-convert pools rather than being re-derived here. Buffs only: everything this
  // member `equip()`-ped is gear (see TeamMember.equipped), and the loadout popover on their own
  // name already names all of it. Globals need no such filter — equip() only ever writes to a
  // slot, so nothing equipped can reach globalStacks.
  //
  // Names are generated only now, after applyStats()/convertStats() have both run — a display() reading a
  // stat one of them just contributed (Jingran's HP-based step counts) needs the final number.
  // `currentHeldStacks` is still the same frozen map applyStats()/convertStats() just used (not re-frozen
  // here), so a buff's own stack-count display still reports the count it actually held at that
  // point too, not whatever's left once convertStats() may have spent it down (Fire of Life again — 0
  // stacks by now, were this re-frozen). Trace-only: every one of these is a `Gear.toString()`,
  // and nothing but the detail page's own resonator popover ever reads them (see `tracing`).
  let heldLocal: HeldBuff[] = EMPTY_HELD, heldGlobal: HeldBuff[] = EMPTY_HELD, heldEnemy: HeldBuff[] = EMPTY_HELD;
  if (tracing) {
    // the counts applyStats()/convertStats() just ran with, so a stack-count display still reports what it
    // actually held then rather than whatever a live re-read would show now
    // walked through the phase lists rather than `list` itself, since a dropped Gear stays in
    // `list` (see Pool)
    const frozen = new Map<Gear, number>();
    for (let q = 0; q < 3; q++) {
      const list = capList[q]!, counts = capCounts[q]!, hooks = capHooks[q]!;
      for (let p = 0; p < PHASE_COUNT; p++) for (const k of hooks[p]!) frozen.set(list[k]!, counts[k]!);
    }
    // Gear with no hook at all is in none of those phase lists and so in no freeze, and falls back
    // to a live read of the pool it was actually found in. That has to be the pool, not this
    // slot's own: a global or enemy Gear is never in `slot.stacks`, so reading the count there
    // would have every hookless team buff and enemy debuff that stacks report "xN" as "x0".
    const describe = (g: Gear, pool: Pool): HeldBuff => {
      currentBuff = g;
      currentStacks = frozen.get(g) ?? pool.get(g) ?? 0;
      return { name: g.toString(), source: state.sourceOf.get(g) ?? "" };
    };
    // nameless gear is engine machinery someone's setup put there, not a buff a kit put up
    // (tunebreak.ts's own watcher), so it belongs in no popover — same exclusion equipped gear gets
    const named = (b: HeldBuff): boolean => b.name !== "";
    heldLocal = slot.stacks.gears().filter((g) => !slot.equipped.has(g)).map((g) => describe(g, slot.stacks)).filter(named);
    heldGlobal = state.globalStacks.gears().map((g) => describe(g, state.globalStacks)).filter(named);
    heldEnemy = state.enemyStacks.gears().map((g) => describe(g, state.enemyStacks)).filter(named);
  }
  currentStacks = -1;
  currentBuff = null;

  // Handed straight to the snapshot rather than cloned: this action's own map was created fresh at
  // the top of this call and the next `evaluate()` on this slot replaces it rather than clearing
  // it, so nothing can write to it again — the same immutability the old clone bought, without the
  // copy. Every scope matching this action is already folded in (see `pushStat`), so reading a
  // stat is one lookup rather than a re-sum across three freshly-built key strings.
  const effective = slot.effective;
  const stat = (k: Stat | EnemyStat) => effective[k]!;
  // atk/hp/def stay unscoped, matching the old engine — only formula-facing stats scope.
  // BaseAtk/BaseHp/BaseDef are themselves summed entries (a resonator's own kit-base value plus
  // a weapon's own base line), not a fixed per-slot number, matching the old engine's total().
  const base = effective[Stat.BaseAtk]!, baseHp = effective[Stat.BaseHp]!, baseDef = effective[Stat.BaseDef]!;

  // bank this action's own declared energy/concerto/offtune (the resonator's own baseline for
  // performing it) plus whatever AddEnergy/AddConcerto/AddOfftune a held buff contributed, into
  // the real running totals — no kit ever touches these directly, same as forte.
  const energyGain = action.energy + effective[Stat.AddEnergy]!;
  slot.energy = Math.max(0, slot.energy + energyGain);
  slot.concerto = Math.max(0, slot.concerto + action.concerto + effective[Stat.AddConcerto]!);
  // Off-Tune Buildup Rate scales what an action *builds*, never what lands on the bar directly:
  // DirectOfftune (a Tune Break's own drain, Denia's half-bar surge) is already the amount the bar
  // moves, so it goes on untouched. A declared negative would come off in full for the same reason.
  // Unclamped, unlike energy/concerto: a break can leave the bar below empty (see tunebreak.ts).
  const built = action.offtune + effective[Stat.AddOfftune]!;
  state.offtune += (built < 0 ? built : built * (effective[Stat.OfftuneBuildup]! / 100)) + effective[Stat.DirectOfftune]!;


  // RealEnergy (TeamMember.realEnergy): the same gain as the real Energy bar above, each holder
  // capped at their own maxEnergy, plus half of it shared to every *other* member — a standing
  // assumption for the ER-requirement estimate, not a real game mechanic. Captured before this
  // action's own gain lands, so a resetEnergy-marked Liberation's "before" value excludes its own
  // contribution — exactly the "banked coming into this cast" figure the ER requirement wants.
  const realEnergyBefore = slot.realEnergy;
  slot.realEnergy = capEnergy(slot, slot.realEnergy + energyGain);
  const shared = energyGain / 2;
  for (const other of state.slots) {
    if (other !== slot) other.realEnergy = capEnergy(other, other.realEnergy + shared);
  }
  if (action.resetEnergy) slot.realEnergy = 0;

  // An outro spends the whole concerto bar to fire, and the liberation that precedes it spends
  // the energy — so a resonator always leaves the field empty and starts their next turn
  // rebuilding from zero. Both bars are simply reset here, with no trace row standing for the
  // spend: the outro row reports 0 for both, which is the point, and its two cells carry no hover
  // panel at all (display.ts's own rowValues()). What the concerto bar held on the way in is kept
  // for the report's underfull-outro flag. Off-tune is the enemy's, not theirs, and carries over.
  let concertoSpent = 0;
  if (casting(Cast.Outro)) {
    concertoSpent = slot.concerto;
    slot.energy = 0;
    slot.concerto = 0;
  }

  // same shape, for whichever forte gauges this action declares a delta on — a kit assigns its
  // own meaning onto whichever slot fits (Jingran's Qi is forte1, his Mingfire is forte2) — plus
  // whatever AddForte1-5 a held buff contributed (Jingran's Fire of Life refunding Qi off its own
  // Mingfire spend, rather than reaching for setForte1 directly and leaving no trace of who paid
  // it). Unconditional now, not gated on the action's own declared amount being nonzero — a buff
  // can contribute here even on an action that declares nothing itself.
  const forte = slot.forte;
  forte[0] += action.forte1 + effective[Stat.AddForte1]!;
  forte[1] += action.forte2 + effective[Stat.AddForte2]!;
  forte[2] += action.forte3 + effective[Stat.AddForte3]!;
  forte[3] += action.forte4 + effective[Stat.AddForte4]!;
  forte[4] += action.forte5 + effective[Stat.AddForte5]!;

  // Everything this action banks is now banked, so afterAction() is the one phase that can read a
  // gauge as the action actually leaves it — and the last chance to spend one back down before the
  // snapshot below reports it. Same frozen roster the stat phases just ran on.
  //
  // The variants' own afterAction runs first, dry, so each sees the roster and gauges exactly as
  // the real build's is about to — and each variant's damage is read here, off its own totals.
  let variantAvg: number[] | null = null;
  const variantHash: number[] = [];
  if (variantEff !== null && snapshots !== null) {
    variantAvg = [];
    const banked = snapshots[2];
    banked.take(state);
    dryRun = true;
    for (let v = 0; v < variantEff.length; v++) {
      const eff = variantEff[v]!;
      slot.effective = eff;
      mutHash = 0;
      currentStacks = -1;
      actionHook(action.afterActionFn);
      runPhase(5, false);
      variantHash.push(mutHash);
      banked.restore(state);
      const b = eff[Stat.BaseAtk]!, bh = eff[Stat.BaseHp]!, bd = eff[Stat.BaseDef]!;
      variantAvg.push(damage({
        action, stat: (k) => eff[k]!, stats: eff,
        atk: b + eff[Stat.BonusAtk]! / 100 * b + eff[Stat.FlatAtk]!,
        hp: bh + eff[Stat.BonusHp]! / 100 * bh + eff[Stat.FlatHp]!,
        def: bd + eff[Stat.BonusDef]! / 100 * bd + eff[Stat.FlatDef]!,
        amp: eff[Stat.Amp]!, type2Amp: eff[TYPE2_AMP_INDEX]!, dmgBonus: eff[Stat.DmgBonus]!,
        enemyRes: enemyRes(), enemyDef: enemyDef(),
      }).avg);
    }
    dryRun = false;
    guarded = false;
    slot.effective = effective;
  }
  mutHash = 0;
  actionHook(action.afterActionFn);
  runPhase(5, false);
  currentBuff = null;
  for (let v = 0; v < variantHash.length; v++) if (variantHash[v] !== mutHash) slot.variantUnsafe[v] = true;

  const snapshot: ResolvedSnapshot = {
    action,
    type: overrideType1 ?? action.type,   // the effective type — see ResolvedSnapshot.type
    member: slot.name,
    slot: action.slot ?? slot.name,
    stat,
    stats: effective,
    atk: base + effective[Stat.BonusAtk]! / 100 * base + effective[Stat.FlatAtk]!,
    hp: baseHp + effective[Stat.BonusHp]! / 100 * baseHp + effective[Stat.FlatHp]!,
    def: baseDef + effective[Stat.BonusDef]! / 100 * baseDef + effective[Stat.FlatDef]!,
    amp: effective[Stat.Amp]!,
    type2Amp: effective[TYPE2_AMP_INDEX]!,
    dmgBonus: effective[Stat.DmgBonus]!,
    enemyRes: enemyRes(),
    enemyDef: enemyDef(),
    entries: slot.entries,
    triggered,
    // report-only, so copied only when something will actually read it (display.ts's gauge columns)
    forte: tracing ? [...slot.forte] : EMPTY_FORTE,
    energy: slot.energy, concerto: slot.concerto, offtune: state.offtune,
    concertoSpent,
    realEnergyBefore,
    heldLocal, heldGlobal, heldEnemy,
    variantAvg,
  };

  if (casting(Cast.Outro)) {
    const n = state.slots.length;
    state.active = (state.active + state.outroDir + n) % n;
  }
  return snapshot;
}

/** Run a rotation across `state`, splicing in anything queue()d right after the action that
 *  queued it — each member's own action sequence, concatenated in turn order; Outro/Intro
 *  handoff and active-slot advancement happen automatically inside evaluate(). A queued
 *  follow-up runs on its own caller's slot even if the active slot has since moved on (e.g. an
 *  Outro evaluated between the queue() call and the follow-up actually running); a plain
 *  rotation entry always runs on whichever slot is active when its turn comes. */
export function run(state: State, rotation: Action[]): ResolvedSnapshot[] {
  const out: ResolvedSnapshot[] = [];
  // Two parallel arrays walked by index rather than a list of `{action, slot}` objects drained
  // with shift(): shift() is O(n) per step (and splice-at-front the same again), so a rotation
  // that queues follow-ups was quadratic in its own length for no reason. `slots` holds -1 for an
  // ordinary rotation entry — "run on whoever is active when its turn comes".
  const actions: Action[] = rotation.slice();
  const slots: number[] = new Array<number>(rotation.length).fill(-1);
  let i = 0, guard = 0;
  while (i < actions.length) {
    if (++guard > 10000) throw new Error("action queue did not drain");
    const stepAction = actions[i]!, stepSlot = slots[i]!;
    i++;
    const before = state.active;
    if (stepSlot >= 0) state.active = stepSlot;
    let action = stepAction;
    if (action.resolveFn) {
      // a marker reads state via the "current" pointers, same as any other kit logic — evaluate()
      // sets them again immediately after anyway, so no save/restore needed here
      currentState = state;
      currentSlot = state.slot;
      action = action.resolveFn();
    }
    pendingQueue.length = 0;
    // "not really this resonator's own turn" rows the report dims: a follow-up the engine itself
    // queued (Phrolova's Hecate procs, Cantarella's Jolt, ...), a rotation marker that declares
    // itself one (rotation.ts's ECHO_CAST and swap markers), and an outro (a handoff, not an
    // attack).
    // ...and an engine-level event, which reports under its own bucket rather than any member's
    // (`ActionDef.slot`) precisely because it is nobody's turn — see `queueEvent`.
    // Handed to evaluate() rather than stamped on the snapshot after: gear reacting mid-action
    // needs it too (tunebreak.ts's own watcher won't auto-fire off one) — see triggeredAction().
    const triggered = stepSlot >= 0 || stepAction.triggered || action.slot !== null || isCast(action, Cast.Outro);
    const snapshot = evaluate(state, action, triggered);
    out.push(snapshot);
    // a queued follow-up's own turn doesn't stick — restore whoever was actually active,
    // unless the follow-up was itself an outro (genuinely advances the team)
    if (stepSlot >= 0 && state.active === stepSlot) state.active = before;

    if (pendingQueue.length) {
      // spliced in right after the action that queued them — i.e. at the read cursor, which is
      // exactly where the old shift()-based list spliced at its own front
      const qa: Action[] = [], qs: number[] = [];
      for (const p of pendingQueue) { qa.push(p.action); qs.push(p.slot); }
      actions.splice(i, 0, ...qa);
      slots.splice(i, 0, ...qs);
    }
  }
  return out;
}
