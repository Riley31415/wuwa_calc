/**
 * The engine. Buffs/Gear/Actions are stateless singletons — every mutable fact about a held one
 * (stacks) lives in the engine's own `TeamMember.stacks`, keyed by identity, never on the object
 * itself. `frozenStacks()`/`addStat()`/etc. resolve against "whichever Gear and slot the engine is
 * mid-call for" — safe because evaluation is fully synchronous. Replaces the previous kit.ts/
 * state.ts pair; see TODO_ENGINE.md for the rework this came out of.
 */
import { Stat, EnemyStat, Attribute, WeaponType, Tier, Type1, Type2, Cast, Node, Scaling, scopedStat, tagBand, STAT_COUNT, TYPE2_BITS } from "./stats.js";
import type { Tag, StatKey } from "./stats.js";
// type-only, so nothing at runtime imports rotation.js from here — that module imports *this* one
// (for Gear/State/run, and its Action extends Gear), and a real import back would close the cycle.
import type { Rotation, Action, ActionGroup, ActionDef, ActionField } from "./rotation.js";
import { damage } from "./damage.js";
export { Stat, EnemyStat, Attribute, WeaponType, Tier, Type1, Type2, Cast, Node, Scaling, scopedStat };

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
  /** The field this Gear opens, for a Buff that *is* a field standing (rotation.ts's own
   *  `ActionField`): granting it is what puts the summon out, so the row that grants it is the row
   *  the report files the field's whole run of hits under. The hits name the same field on their
   *  own action. Nothing else in the engine reads it — a field is a report grouping, not a rule. */
  field?: ActionField | null;
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
  /** See `GearDef.field` — the field this Gear's own presence stands for, or null. */
  field: ActionField | null;
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
    this.field = def.field ?? null;
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

/** The resonance-chain level a resonator's build is costed at with that role's Sequences box shut
 *  — the baseline every other level is compared against. See `Tier` for why each is what it is.
 *  Capped by however many nodes the loadout actually declares. */
export const baseSequence = (r: Resonator): number =>
  ({ [Tier.Limited]: 0, [Tier.Standard]: 2, [Tier.Free]: 6 })[r.tier];

/** A resonator's own Resonance Mode — a fixed stance a loadout commits to for the whole fight
 *  (Lucilla's Echo/Glacio Chafe split), not something toggled mid-rotation. Other pieces of that
 *  kit read `isHeld()` on the specific mode equipped, same as checking a Sequence. */
export class ResonanceMode extends Gear {}
/** An echo sonata set's 2-piece bonus — worn on its own beside a 3pc/1pc set, or carried along by
 *  its own set's 5pc (see `Sonata`). The `size` literals below are what tell the set shapes apart
 *  for `EchoLoadout`'s constructor: structurally they would otherwise all be a bare Gear. */
export class Sonata2pc extends Gear { readonly size = 2 as const; }
export interface SonataDef extends GearDef {
  /** The set's own 2-piece bonus — five of a set is always two of it too, so the 5pc equips this
   *  alongside itself rather than a loadout having to name it separately. */
  sonata2pc: Sonata2pc;
}
/** An echo sonata set's 5-piece bonus, its own 2pc riding along. */
export class Sonata extends Gear {
  readonly size = 5 as const;
  sonata2pc: Sonata2pc;
  constructor(def: SonataDef) { super(def); this.sonata2pc = def.sonata2pc; }
}
/** A 3-piece set (Septimont's) — worn beside one ordinary 2pc. */
export class Sonata3pc extends Gear { readonly size = 3 as const; }
/** A 1-piece set (Shadow of Shattered Dreams) — worn beside two ordinary 2pcs. */
export class Sonata1pc extends Gear { readonly size = 1 as const; }
/** A resonator's own Matrix — equipped only in Matrix Mode (see shared/matrix.ts). */
export class Matrix extends Gear {}

/** One echo choice — a mainslot plus one of the three shapes five echoes can make: a 5pc (its
 *  2pc implied), a 3pc + 2pc, or a 1pc + 2pc + 2pc. `sets` is the shape as a build reads it, one
 *  entry per set actually named — what the comparison table and gear hover list, a line each —
 *  while `pieces()` is everything equipped, the 5pc's own 2pc included. A `Loadout` names a list
 *  of these (most kits just the one); the comparison table runs every weapon×echo combination its
 *  loadout allows (see index.ts's own team runner), not just one hardcoded pick. */
export class EchoLoadout {
  mainslot: Mainslot;
  sonata: Sonata | Sonata3pc | Sonata1pc;
  sets: Gear[];
  constructor(mainslot: Mainslot, sonata: Sonata);
  constructor(mainslot: Mainslot, sonata: Sonata3pc, pc2: Sonata2pc);
  constructor(mainslot: Mainslot, sonata: Sonata1pc, pc2a: Sonata2pc, pc2b: Sonata2pc);
  constructor(mainslot: Mainslot, sonata: Sonata | Sonata3pc | Sonata1pc, ...pc2: Sonata2pc[]) {
    this.mainslot = mainslot;
    this.sonata = sonata;
    this.sets = [sonata, ...pc2];
  }
  pieces(): Gear[] {
    return [this.mainslot, ...this.sets, ...(this.sonata instanceof Sonata ? [this.sonata.sonata2pc] : [])];
  }
}

/** Everything a `Loadout` is built from, labeled — see the class itself for what each field is.
 *  `sequences` is the resonance chain S1 up, as many nodes as the kit actually declares: six for
 *  anything that isn't a limited 5-star (see `Tier`), left unset for most limited kits. `mode` is
 *  for the rare kit built around a Resonance Mode (Lucilla, Lynae). */
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
  matrix?: Matrix;
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
   *  is six for anything a build is costed above S0 at (see `Tier`) and none for most
   *  limited kits. */
  sequences: Sequence[];
  mode?: ResonanceMode;
  /** This kit's Matrix, if it has one — worn only when the table's Matrix Mode box is on, and
   *  only by loadouts that declare one (see `pieces()`). */
  matrix?: Matrix;

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
    this.matrix = def.matrix;
  }

  /** Every piece for one specific weapon/echo/main-stat/sequence-level combo, flattened into the
   *  plain array `equip()` actually walks — the order matches how each resonator file's own loadout
   *  comment already reads (resonator, talent, both inherents, weapon, echoes, mainstat/substat,
   *  sequences, mode). `sequenceLevel` is how many nodes are actually held, S1 up: 0 for a build at
   *  S0, 6 for the full chain — the comparison table runs one row per level so the gain from each
   *  can be read off (see index.ts's own combos). `matrix` is whether Matrix Mode is on — the
   *  piece only goes on when it is *and* this loadout declares one. */
  pieces(weapon: Weapon, echo: EchoLoadout, mainstat: Buff, sequenceLevel: number, matrix = false): Gear[] {
    return [
      this.resonator, this.talent, this.inherent1, this.inherent2,
      weapon, ...echo.pieces(), mainstat, this.substat,
      ...this.sequences.slice(0, sequenceLevel),
      this.mode,
      matrix ? this.matrix : undefined,
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
   *  same way: a rotation holds an OUTRO marker rather than naming the cast, and
   *  the scheduler asks here when it reaches one. Almost every kit has exactly one, so this is
   *  just `() => Outro`. */
  outro: () => Action;
  /** How hard this resonator is to own, which is what sets the resonance-chain level their build
   *  is costed at — see stats.ts's own `Tier` and `baseSequence()`. Unset means `Tier.Limited`. */
  tier?: Tier;
  /** The one Resonator that is the enemy rather than a member (tunebreak.ts's Tune Break): it is
   *  `equipEnemy()`-ped onto `State.enemy`, and carries none of the four starting stats every real
   *  resonator gets — those would land in the enemy pool and pay into every action. */
  enemy?: boolean;
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
  tier: Tier;
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
        if (!def.enemy) {
          addStat(Stat.CritRate, 5);
          addStat(Stat.CritDmg, 150);
          addStat(Stat.Er, 100);
          addStat(Stat.OfftuneBuildup, 100);
        }
        def.constantStats?.();
      },
      combatStart: () => {
        currentSlot!.resonator = this;
        // the enemy member is nameless until its resonator lands: the bucket the break's damage
        // reports under, and the hue it wears, are read off it from then on
        if (def.enemy) currentSlot!.name = this.name;
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
    this.tier = def.tier ?? Tier.Limited;
  }
}

/** How a mainslot echo's skill plays out. A SUMMON calls the creature in beside the resonator,
 *  who carries on — its hit is a follow-up wherever it is pressed. A TRANSFORM turns the resonator
 *  *into* it — a press of their own, and one that can be dash-cancelled or finish after they've
 *  swapped out. rotation.ts's ECHO_ONFIELD/ECHO_CANCEL/ECHO_SWAP markers key off this. */
export const enum EchoType { SUMMON, TRANSFORM }

export interface MainslotDef extends GearDef {
  /** The cast this echo performs — what rotation.ts's ECHO_* markers place, in the form each
   *  calls for (see `Mainslot`). */
  action: Action;
  echoType: EchoType;
}

/** A mainslot echo: gear that also carries its own cast. Every build equips exactly one, so a
 *  rotation doesn't name the echo — it holds one of the ECHO_* markers, and `run()` swaps in
 *  whichever Mainslot the acting slot actually has equipped, in the form that marker asks for:
 *
 *  - `onfield`: the cast as declared. A SUMMON's is reported as a triggered row — the creature
 *    attacks, not the resonator — and is the one form a summon has, wherever it is pressed:
 *    always active, no special name, whichever marker placed it.
 *  - `outro`: what ECHO_SWAP lands, right where it stands. A TRANSFORM pressed on the way out
 *    finishes off field, so its copy is `Action.swap()`'s form — named "… (Swap)", inactive and
 *    triggered. A SUMMON's is just its one form again.
 *  - `cancel`: a TRANSFORM dash-cancelled the moment it is pressed — `Action.dodgeCancel()`'s form:
 *    the cast's own effects with none of its hit. */
export class Mainslot extends Gear {
  action: Action;
  echoType: EchoType;
  onfield: Action;
  outro: Action;
  cancel: Action;
  constructor(def: MainslotDef) {
    super(def);
    this.action = def.action;
    this.echoType = def.echoType;
    const a = def.action;
    if (def.echoType === EchoType.SUMMON) {
      this.onfield = this.cancel = this.outro = a.variant(a.name, { triggered: true });
      return;
    }
    this.onfield = a;
    this.outro = a.swap();
    this.cancel = a.dodgeCancel();
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
/* Action/ActionGroup/ActionDef live in rotation.ts now, beside the markers and the rotation-
 * flavoured forms (`cancel()`, `swap()`). Re-exported here as *types only* — that erased import
 * is what keeps kit.ts free of any runtime edge back into rotation.ts, so rotation.ts (whose
 * markers construct Actions, whose Action extends Gear) always evaluates after this module. */
export type { Action, ActionGroup, ActionDef } from "./rotation.js";

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
const EMPTY_FIELDS: ActionField[] = [];

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
   *  scanning this member's whole held set every time an ECHO_* marker comes up (see
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
   *  resonator in team order, -1 for the outro closing a DOUBLE_INTRO section (rotation.ts). The scheduler
   *  sets it right before the outro is evaluated and puts it back to +1 straight after, so a
   *  kit-queued outro — or any other path into `evaluate()` — always advances forward. */
  outroDir: 1 | -1 = 1;
  globalStacks = new Pool(); // use Buff here? how are maxstacks even handled?
  /** Debuffs placed on the enemy rather than held by any resonator — mechanically identical to
   *  `globalStacks` (ticks on every slot's own turn regardless of who's acting), kept as its own
   *  map purely so the resonator popover can bucket it into its own "Enemy debuffs" section
   *  instead of mixing it into "Global buffs" — a real distinction to the report, not just
   *  formatting (see `buffsPopover` in index.ts). */
  /** The enemy itself, as a member of nobody's team: the dummy Tune Break resonator, its Base
   *  Resistance and the break's own machinery are `equipEnemy()`-ped onto it at setup, the way a
   *  real member's kit and gear are `equip()`-ped. Its pool *is* `enemyStacks` below, so what is
   *  equipped here runs in the enemy phase beside every debuff a kit inflicts. */
  enemy = new TeamMember(""); // named by the enemy Resonator as it is equipped
  enemyStacks = this.enemy.stacks; // TODO change Gear to Debuff
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
  /** Casts waiting for the next Intro — queued behind it, on the slot that queued them, the
   *  moment an Intro-cast action is evaluated (see `queueOnIntro()`). */
  introQueue: { action: Action; slot: number; by: HeldBuff | null; event: boolean }[] = [];
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

// level-100 enemy. Its flat 20% resistance to every attribute is not a constant here any more —
// it is the Tune Break enemy's own Base Resistance gear (tunebreak.ts), seven scoped -20% RES
// Reduce entries, so the res column's own trace foots to the number the formula uses.
const ENEMY_RES = 0, ENEMY_DEF_LEVEL = 100;
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
  Stat.AddEnergy, Stat.AddConcerto, Stat.AddOfftune, Stat.DirectOfftune, Stat.OfftuneBuildup, Stat.EnergyRegenMult,
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
/** The same, split by whose kit is responsible for each stack — what `appliedByMe()` reads.
 *
 *  Kept per source rather than as a single "who did it last", because two kits genuinely do
 *  inflict the same status on one action: Chisa's Thread of Bane hands out Havoc Bane off whoever
 *  is hitting the marked target, on top of whatever that resonator's own cast just inflicted, and
 *  Lucilla's Film Roll adds two Glacio Chafe to anyone else's one. Enemy-pool gear runs last in
 *  `updateDebuffs`, so under last-writer-wins both of those silently took the credit for the
 *  actor's own stacks and every "when *you* inflict" passive on the actor stopped paying.
 *
 *  `sourceOf` is already correct by the time this runs — every grant path calls `attribute()`
 *  first (see the public `apply*` wrappers) — so the source is read off the Gear rather than
 *  passed down through six call sites. */
let appliedBy = new Map<Gear, Map<string, number>>();
const recordApplied = (gear: Gear, n: number): void => {
  if (n <= 0) return;
  appliedNow.set(gear, (appliedNow.get(gear) ?? 0) + n);
  const source = currentState!.sourceOf.get(gear);
  if (source === undefined) return;
  let per = appliedBy.get(gear);
  if (per === undefined) appliedBy.set(gear, (per = new Map()));
  per.set(source, (per.get(source) ?? 0) + n);
};

/** Everything *spent off the target* during the action being evaluated, and how many stacks of it
 *  — the mirror of `appliedNow` above, and the other half of the picture a kit needs: the stack
 *  pools record what a cast puts on and nothing at all about what a cast takes back, so before this
 *  there was no way for "when you consume a Negative Status stack" to be anything but assumed.
 *
 *  Filled only by `consume()`, never by `removeStackEnemy()`/`revokeEnemy()`. That is the point of
 *  the split: most removals are bookkeeping rather than a resonator spending anything — a status
 *  converting into another (Hiyuki's Chafe into Glacio Bite), a window counting itself down
 *  (tunebreak.ts's Interfered), a Negative Status paying for its own calculation off the stacks it
 *  had banked (every ladder in status.ts) — and none of those is a resonator consuming a stack. A
 *  kit says which it means by which function it calls, and only two do mean it: Xuanling's Sword
 *  Stance Flow spending a Havoc Bane, and Hiyuki's Frostbind spending ten Glacio Bite. */
let consumedNow = new Map<Gear, number>();
/** The same, split by the member who did the spending — what `consumedByMe()` reads. Keyed on the
 *  slot the consuming gear was running as (`currentSlot`), not on `sourceOf` the way `appliedBy` is:
 *  a debuff's *source* is whose kit put it on the target, which is exactly the wrong question here.
 *  What a "when you consume" passive means is who spent it, and that is whoever's hook called
 *  `consume()`. */
let consumedBy = new Map<Gear, Map<string, number>>();
const recordConsumed = (gear: Gear, n: number): void => {
  if (n <= 0) return;
  consumedNow.set(gear, (consumedNow.get(gear) ?? 0) + n);
  const by = currentSlot!.name;
  let per = consumedBy.get(gear);
  if (per === undefined) consumedBy.set(gear, (per = new Map()));
  per.set(by, (per.get(by) ?? 0) + n);
};

/** The three pools a phase reads — the acting slot's own, then team-wide, then enemy — as the
 *  arrays they held when `capture()` last ran. Three references apiece, nothing copied: a Pool's
 *  arrays are copy-on-write, so whatever a hook grants or spends mid-phase lands in new arrays and
 *  these keep describing the roster the phase started on. Module-level scratch rather than an
 *  object per capture — `evaluate()` is never re-entered, so one shared set is safe. */
const capList: Gear[][] = [[], [], []];
const capCounts: number[][] = [[], [], []];
const capHooks: number[][][] = [[], [], []];

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

/** True while the fight is part-way through an `ActionGroup` — set on every member but the last
 *  (see `run()`), and so still true across any follow-up queued off a mid-group cast. Only
 *  tunebreak.ts reads it: a group is one beat, so the bar may fill inside one but the break waits
 *  for the cast that ends it. Module state rather than a snapshot field because it has to answer
 *  for the action being evaluated *right now*, from inside a hook. */
let insideGroup = false;
export const midActionGroup = (): boolean => insideGroup;
/** Whether the action being evaluated was queued rather than played — an engine-spawned follow-up
 *  or event, a summon echo's own hit, or an outro handoff. The same answer the snapshot reports
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
 *  to its own holder rather than the actor, so this would ask about the holder: a passive watching
 *  the whole team from there wants plain `applied()` for "did this land at all", or
 *  `appliedByMember()` below against `currentTeam().slot` for "did the acting slot land it".
 *
 *  Returns the acting slot's *own share*, not the action's whole count: when a marker inflicts
 *  alongside the actor (see `appliedBy`), the two are genuinely different numbers, and the share
 *  is the one a "when you inflict" passive means. Every caller today only asks whether it is
 *  nonzero. */
export function appliedByMe(gear: Gear): number {
  return appliedByMember(gear, currentSlot!);
}

/** The same question about a *specific* member rather than whoever is current — how many stacks of
 *  this Gear that member is themselves responsible for on the action being evaluated.
 *
 *  `appliedByMe()` is this asked about `currentSlot`, which is the right slot everywhere except
 *  `updateGlobal`: there a locally-held gear runs as its own *holder* while some teammate is the
 *  one acting, so a passive watching the whole team for "each resonator who inflicts X" has to name
 *  the acting slot (`currentTeam().slot`) instead of asking about itself. Hiyuki's Fine Snow, which
 *  banks one stack of Snow Rust per resonator who lands a Negative Status, is that case. */
export function appliedByMember(gear: Gear, member: TeamMember): number {
  return appliedBy.get(gear)?.get(member.name) ?? 0;
}

/** How many stacks of this Gear were *spent off the target* on the action being evaluated, by
 *  anyone — `applied()`'s counterpart, and the same per-action lifetime: cleared at the top of
 *  every `evaluate()`, so it answers "did this cast consume any" and nothing longer.
 *
 *  Only counts a spend a kit actually declared as one, through `consume()` (see `consumedNow`).
 *  Note when in the action a consumption is visible: a cast that spends its stacks in `afterAction`
 *  — the usual place, so the cast itself still reads the full count — is invisible to any reader
 *  earlier in that same action, and a passive paying out for it wants `afterAction` too. */
export function consumed(gear: Gear): number { return consumedNow.get(gear) ?? 0; }

/** Same as `consumed()`, but only the share the member whose turn it is spent themselves. This is
 *  what a "when *you* consume X" passive means — Suisui's Ceaseless Landscape paying the resonator
 *  who spends Havoc Bane, not whoever happens to be watching. Same `currentSlot` caveat as
 *  `appliedByMe()`: inside `updateGlobal` that is the asking gear's own holder rather than the
 *  actor, so a team-wide watcher there wants `consumedByMember()` against `currentTeam().slot`. */
export function consumedByMe(gear: Gear): number {
  return consumedByMember(gear, currentSlot!);
}

/** The same question about a *specific* member rather than whoever is current. */
export function consumedByMember(gear: Gear, member: TeamMember): number {
  return consumedBy.get(gear)?.get(member.name) ?? 0;
}

/** How many stacks of *anything* were consumed on this action, across every Gear and member — for
 *  a passive whose text names no particular status ("when they consume Negative Status or Electro
 *  Rage stacks", Suisui's Undulating Mist). Every `consume()` call site is a Negative Status being
 *  spent, so the total needs no filtering; a caller wanting one specific status asks `consumed()`
 *  instead. */
export function consumedAny(): number {
  let total = 0;
  for (const n of consumedNow.values()) total += n;
  return total;
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
  Type1.Echo, Type1.Status, Type1.Break, Type1.Rupture, Type1.Hack, Type1.Utility,
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

/** `equip()` onto the enemy (`State.enemy`) rather than the acting slot — for the Tune Break
 *  resonator and its gear at team setup (solver.ts, as it builds a team). */
export function equipEnemy(gear: Gear, n = 1): number {
  const prev = currentSlot;
  currentSlot = currentState!.enemy;
  try { return equip(gear, n); } finally { currentSlot = prev; }
}

export function setStacksSelf(buff: Buff, n: number): number {
  attribute(buff);
  return currentSlot!.setStacks(buff, n);
}
export function removeStack(buff: Buff, n = 1): number { return currentSlot!.removeStack(buff, n); }
export function revokeCurrent(buff: Buff): void { currentSlot!.revoke(buff); }

/** The Gear whose hook is running right now. Exported for the kit-authoring shortcuts in
 *  shared/helpers.ts (`lostOnSwap()`), which are ordinary callers of this API rather than part of
 *  the engine; nothing inside a kit needs it, since a hook already knows which gear it belongs to. */
export function currentGear(): Gear { return currentBuff!; }

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
/** Spend stacks off the target *and say so*: `removeStackEnemy()` plus the record `consumed()` /
 *  `consumedByMe()` read (see `consumedNow`). Any kit whose text is "consumes N stacks of X" should
 *  reach for this rather than the plain remove, so a teammate's "when you consume" passive can see
 *  it — nothing else in the engine ever notices a stack leaving the target.
 *
 *  Logs what actually left, not what was asked for: spending ten off a target holding four records
 *  four. Returns the target's new count, same as `removeStackEnemy()`. */
export function consume(debuff: Debuff, n = 1): number {
  const before = currentState!.stacksOfEnemy(debuff);
  const after = currentState!.removeStackEnemy(debuff, n);
  if (!dryRun) recordConsumed(debuff, before - after);
  return after;
}
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
const pendingQueue: { action: Action; slot: number; by: HeldBuff | null; event: boolean }[] = [];
/** Whichever Gear's hook is running right now, as the same `{ name, source }` pair a held buff
 *  reports itself with — what a follow-up queued from it names as having triggered it
 *  (`ResolvedSnapshot.triggeredBy`). `currentBuff` is every kind of Gear at once here, which is
 *  exactly the point: the acting Action is one too, so a hit a cast spawns names that cast, a hit a
 *  buff spawns names the buff, and one a weapon or sonata spawns names the piece.
 *
 *  `.name`, not `toString()`: a stacking buff's "x3" is a fact about this instant, not about what
 *  did the triggering. `source` is whose kit it belongs to — `sourceOf` for anything that was
 *  granted, and otherwise the slot it ran on, which is what a plain cast or an equipped piece is
 *  “from”. Same value `HeldBuff.source` carries, so the report colours it the same way. */
const queuedBy = (): HeldBuff | null => {
  const gear = currentBuff;
  if (!gear?.name) return null;
  return { name: gear.name, source: currentState!.sourceOf.get(gear) ?? currentSlot!.name };
};
export function queue(action: Action): void {
  noteMutation(action.id, 4e6);
  if (dryRun) return;
  pendingQueue.push({ action, slot: currentState!.slots.indexOf(currentSlot!), by: queuedBy(), event: false });
}

/** Queue an action behind the *next Intro anyone casts* rather than behind this action — for a
 *  cast that outlives its own caster's visit (a transform echo pressed just before swapping out
 *  finishes on the incoming resonator's time). Pinned to the queuing slot the same way `queue()`
 *  is, so it lands on its own owner however far the field has moved on by then. */
export function queueOnIntro(action: Action): void {
  noteMutation(action.id, 7e6);
  if (dryRun) return;
  currentState!.introQueue.push({ action, slot: currentState!.slots.indexOf(currentSlot!), by: queuedBy(), event: false });
}

/** Queue an action that belongs to nobody — the two ways an engine-level event differs from a
 *  resonator's own follow-up, which is all the Tune Break needs to be one (tunebreak.ts):
 *
 *  - *behind* everything this action already queued, because a break resolves the press it went
 *    off on rather than interrupting it: every follow-up that press spawned lands first, banking
 *    its own off-tune onto the still-full bar, and the break drops the overshoot when it comes;
 *  - *unpinned* (slot -1, exactly like a rotation entry), so it runs on whoever is on field when it
 *    resolves rather than on whoever queued it. That's the difference on a break that goes off on
 *    an Outro: the handoff has landed by then, and the break is the incoming resonator's to eat. */
export function queueEvent(action: Action): void {
  noteMutation(action.id, 5e6);
  if (dryRun) return;
  pendingQueue.push({ action, slot: -1, by: queuedBy(), event: true });
}

/** Same as `queue()`, but attributed to one specific resonator's own slot regardless of whose
 *  turn it actually is or who's reacting — for a kit reacting through `updateGlobal()` (so
 *  `currentSlot` is its own holder, not the real actor) that still wants the follow-up to land on
 *  whoever it's actually for. Resolved via `State.memberOf()`, same "throws rather than silently
 *  no-opping" contract as `addBuff()`. */
export function queueOn(resonator: Resonator, action: Action): void {
  noteMutation(action.id, 6e6);
  if (dryRun) return;
  pendingQueue.push({ action, slot: currentState!.slots.indexOf(currentState!.memberOf(resonator)), by: queuedBy(), event: false });
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
  /** The ActionGroup this row was pressed as part of, and whether it is that group's last cast —
   *  stamped by `run()` as it expands a group, and read by nothing but the report, which folds a
   *  group's members into one row. Null/false on every action pressed on its own, and on every
   *  follow-up queued *during* a group: a follow-up is not one of the casts the group names, and
   *  the report keeps it as a row of its own (after the group when collapsed, back in place when
   *  opened). */
  group: ActionGroup | null;
  groupEnd: boolean;
  /** The ActionGroup a follow-up was queued *out of* — set on every cast the engine queued while a
   *  group was being pressed, the last member's own follow-ups included (they land after the group
   *  has ended, but they are still that beat's spill). Null on the group's members themselves, on
   *  anything a rotation placed, and on an engine event (`queueEvent()`, the Tune Break): an event
   *  belongs to nobody, so it ends the spill rather than joining it. The report tucks a group's
   *  spill under it while it is collapsed (solver.ts's own `toLines()`). */
  groupSpill: ActionGroup | null;
  /** What queued this action, when something did: the Gear whose hook called
   *  `queue()`/`queueOn()`/`queueEvent()` — a buff, a piece of gear, or the cast it followed (an
   *  Action is a Gear too) — named and attributed exactly like a held buff, so the report can give
   *  it the same source colour. Null on every action a rotation placed itself, and on the
   *  `triggered` rows nothing queued: an Outro (a handoff), and the rotation markers that declare
   *  themselves triggered (a summon echo's hit, the swaps). Trace-only — the action hover names it. */
  triggeredBy: HeldBuff | null;
  /** The damage type this action was actually evaluated as — its own `type`, unless a held Gear
   *  called `typeOverride()` on it (`action.type` off a snapshot is always the base type; this is
   *  the effective one, what `isType()` answered against). */
  type: Type1 | null;
  /** This slot's own forte gauges 1-5, as they stood once this action resolved. */
  forte: [number, number, number, number, number];
  /** The same five, as they stood *before* it — what the report compares against to decide whether
   *  a row actually moved a gauge (index.ts's own running-column blanking), which the traced deltas
   *  alone can't answer for a kit that sets one outright. Trace-only, same as `forte`. */
  forteBefore: [number, number, number, number, number];
  /** Running totals as they stood once this action resolved — energy/concerto are this slot's
   *  own (TeamMember.energy/concerto), offtune is the enemy's shared one (State.offtune). All
   *  three are banked automatically by evaluate() itself; see AddEnergy/AddConcerto/AddOfftune. */
  energy: number;
  concerto: number;
  offtune: number;
  /** The same three, as they stood *before* this action — what the report compares against to
   *  decide whether a row actually moved one (index.ts's own running-column blanking). Kept here
   *  rather than read off the previous row, so a row with no previous row of its own — a group's
   *  own opened members, a member's first cast — still answers it. Trace-only, same as `forte`. */
  energyBefore: number;
  concertoBefore: number;
  offtuneBefore: number;
  /** What this action's own outro had to spend: the bar it walked in on plus whatever concerto
   *  landed on it this same action — 0 on every action that isn't an outro. The added half is
   *  what pays for an outro a full bar didn't (Jinhsi's Unison, which hands the outro back the
   *  100 it costs), so a bar the cast never needed doesn't read as short. Not folded into
   *  `concerto` above (that is already the post-spend figure); it's what the report reads to flag
   *  an outro that fired on an underfull bar. */
  concertoSpent: number;
  /** Whether this action threw the Energy bar away — true on every outro but a double-Intro
   *  visit's own, which its owner comes straight back from (see `evaluate()`). What the report
   *  reads to blank the energy cell's own trace panel rather than credit a figure the same row
   *  discarded (display.ts's own `wiped`). */
  energyWiped: boolean;
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
  /** The fields this action put out — every `ActionField` whose own Buff was granted while it
   *  resolved (`applied()`, so an outro handoff adopted at an Intro counts there). This is what
   *  files a field's whole run of summons under the cast that created it, and what starts a fresh
   *  row each time one is opened again (solver.ts's `collapseFields`). Report-only. */
  opensFields: ActionField[];
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
  /** The parts whose columns actually fold into this row — an ActionGroup's own casts, or every
   *  repeat of one triggered hit. The rest of `parts` are rows in their own right that merely
   *  resolved inside the span (a follow-up queued mid-group), and contribute nothing to the folded
   *  row's motion value, damage or resource totals. Empty on an ordinary single-action line. */
  members?: ResolvedSnapshot[];
  /** A follow-up that fired *during* an ActionGroup, and so reads after it while the group is
   *  collapsed. Still a line of its own — its damage is its own and every total counts it here,
   *  once — but the report tucks it inside the group's own block so opening the group hides it and
   *  shows it back in its real place among the members instead (index.ts). */
  spill?: boolean;
  /** A field window's own summary row (solver.ts's `collapseFields`): the whole window read as one
   *  beat after the cast that opened it. Its motion value and damage are the hits' own, which stay
   *  lines of their own in the places they fired — so every total skips this row and only the
   *  display reads it. */
  aggregate?: boolean;
  /** Which field window this line belongs to — on the summary row, and on every hit it stands for,
   *  so the renderer can swap the one for the others (index.ts). */
  fieldKey?: string;
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
export function evaluate(state: State, action: Action, triggered = false, triggeredBy: HeldBuff | null = null): ResolvedSnapshot {
  // always whoever is on field. A Negative Status's own damage used to be diverted onto a
  // resonator-less slot of its own, which meant no attacker's gear reached it and the one
  // amplification a dot row does read (`Type2`-scoped, see damage.ts) could only ever be granted
  // team-wide. It now resolves on the acting slot exactly the way a Tune Break does — their stats,
  // their `Type2` amplification — and, unlike a break, reports in their damage column too: the
  // status is theirs. It is still not their *action*: it is an ordinary active cast all the same,
  // exactly like a Tune Break — the resonator really is on field for it — so no "lost on swap"
  // buff mistakes it for its holder leaving. What separates it from a real press is
  // `triggeredAction()`, which a passive counting those tests instead.
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
  appliedBy = new Map();
  consumedNow = new Map();
  consumedBy = new Map();
  // Replaced rather than cleared/copied: the snapshot below keeps whichever array this action built,
  // so handing it a fresh one here is what makes that snapshot immutable at zero copying cost (the
  // old code cleared these and then cloned `totals` at the end, paying an O(entries) copy per
  // action for the same guarantee).
  slot.effective = ZERO_STATS.slice();
  // What each gauge held coming into this action. The report needs it to tell a row that
  // moved a gauge from one that merely reports the same balance again, and it cannot be
  // inferred from the traced deltas: a kit that sets a gauge outright (`setForteN`) moves it
  // with no delta to trace. Captured here, ahead of every phase, since updateBuffs can already
  // have set one by the time the declared deltas bank. Trace-only, same as `forte` below.
  const forteBefore: [number, number, number, number, number] = tracing ? [...slot.forte] : EMPTY_FORTE;
  // and the same for the three running totals, for the same reason
  const energyBefore = slot.energy, concertoBefore = slot.concerto, offtuneBefore = state.offtune;
  if (tracing) { slot.entries = []; slot.totals = new Map(); }

  if (casting(Cast.Intro)) {
    for (const gear of state.outroQueue.splice(0)) slot.addStack(gear, 1);
    // ...and whatever was waiting on this Intro lands right behind it (see `queueOnIntro()`)
    pendingQueue.push(...state.introQueue.splice(0));
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
      // -1, not a captured count: this phase walks each slot's live hook set rather than a frozen
      // roster, so there is no "count at phase start" to hand over and `frozenStacks()` reads the
      // holder's own live one instead (its documented fallback). Without this it kept whatever the
      // *previous* phase's last gear happened to hold — a number belonging to another buff
      // entirely, which silently broke every `frozenStacks()` read in an updateGlobal.
      currentStacks = -1;
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
  // The popover's own roster, taken here rather than read off the live pools after the phases
  // below have run: what applyStats()/convertStats() pay out over *is* this action's finalized
  // buff set, and whatever those hooks then revoke only takes effect from the next action on.
  // Reading afterwards dropped exactly the gear that clears itself every action — the Shield and
  // Healed markers, which are revoked in their own convertStats() and so were never in the panel
  // for the cast that granted them. Counts come along, since a hookless Gear is in no phase list
  // and so in no `frozen` below.
  const heldPools = tracing
    ? [slot.stacks, state.globalStacks, state.enemyStacks]
      .map((pool) => pool.gears().map((g) => [g, pool.get(g) ?? 0] as const))
    : null;
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
  // The *roster* named is `heldPools`, taken before those hooks ran (see above); only the naming
  // happens here. `currentHeldStacks` is still the same frozen map applyStats()/convertStats() just used
  // (not re-frozen here), so a buff's own stack-count display still reports the count it actually held at
  // that point too, not whatever's left once convertStats() may have spent it down (Fire of Life again — 0
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
    // to the count captured alongside it in `heldPools` — its own pool's, at the same moment the
    // phases captured theirs. A live read would be wrong twice over now: a gear revoked in
    // convertStats() is out of every pool by here, and a global or enemy Gear is never in
    // `slot.stacks` to begin with.
    const describe = ([g, n]: readonly [Gear, number]): HeldBuff => {
      currentBuff = g;
      currentStacks = frozen.get(g) ?? n;
      return { name: g.toString(), source: state.sourceOf.get(g) ?? "" };
    };
    // nameless gear is engine machinery someone's setup put there, not a buff a kit put up
    // (tunebreak.ts's own watcher), so it belongs in no popover — same exclusion equipped gear gets
    const named = (b: HeldBuff): boolean => b.name !== "";
    heldLocal = heldPools![0]!.filter(([g]) => !slot.equipped.has(g)).map(describe).filter(named);
    heldGlobal = heldPools![1]!.map(describe).filter(named);
    heldEnemy = heldPools![2]!.filter(([g]) => !state.enemy.equipped.has(g)).map(describe).filter(named);
  }
  currentStacks = -1;
  currentBuff = null;

  // which fields this action put out — read off the same grant record `applied()` answers from,
  // so every path counts (a team grant, a mark on the enemy, an outro handoff adopted at an Intro)
  let opensFields: ActionField[] = EMPTY_FIELDS;
  if (tracing) {
    for (const [gear] of appliedNow) {
      if (!gear.field) continue;
      if (opensFields === EMPTY_FIELDS) opensFields = [];
      opensFields.push(gear.field);
    }
  }

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
  // Energy alone carries a multiplier: `(base + AddEnergy) x (1 + Energy Regen Multiplier)`.
  const energyGain = (action.energy + effective[Stat.AddEnergy]!) * (1 + effective[Stat.EnergyRegenMult]! / 100);
  slot.energy = Math.max(0, slot.energy + energyGain);
  // An outro spends a full Concerto bar to fire and leaves the field with no Energy at all. The
  // spend is the outro's own declared `concerto: -100` — every outro in the project carries it, so
  // it banks through the ordinary line below like any other cast's — which leaves only the ceiling
  // it spends against to settle here: a bar over 100 is capped back to it first, so the declared
  // -100 empties it exactly rather than leaving whatever it had overrun by. Energy is not a spend
  // of a known size, so it is simply set to 0. What the bar held on the way in is kept for the
  // report's underfull-outro flag. Off-tune is the enemy's, not theirs, and carries over.
  // ...except a double-Intro visit's own outro, which hands the field *backward* (rotation.ts's
  // own outroDir) and whose owner is coming straight back for their main Intro: that visit is half
  // of one loop, not the end of one, so the Energy column runs on across both halves and only the
  // outro that actually ends the loop wipes it. Jinhsi is the case — Unison pays for the first of
  // her two outros, and her banking is one figure across the pair.
  const outro = casting(Cast.Outro);
  // AddConcerto included: it lands on the bar in the same line the outro's own -100 does, so an
  // outro handed the 100 it costs (Unison again) was never short, whatever the bar itself held.
  const concertoSpent = outro ? slot.concerto + effective[Stat.AddConcerto]! : 0;
  const energyWiped = outro && state.outroDir > 0;
  if (outro) {
    if (energyWiped) slot.energy = 0;
    if (slot.concerto > 100) slot.concerto = 100;
  }
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
    triggeredBy,
    // stamped by run() the moment this returns — nothing mid-action reads either, unlike
    // `triggered`, so neither has to be threaded through this call
    group: null,
    groupEnd: false,
    groupSpill: null,
    // report-only, so copied only when something will actually read it (display.ts's gauge columns)
    forte: tracing ? [...slot.forte] : EMPTY_FORTE,
    forteBefore,
    energy: slot.energy, concerto: slot.concerto, offtune: state.offtune,
    energyBefore, concertoBefore, offtuneBefore,
    concertoSpent,
    energyWiped,
    realEnergyBefore,
    heldLocal, heldGlobal, heldEnemy,
    opensFields,
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
  // An ActionGroup is expanded here, before anything runs: from this point down the queue
  // machinery only ever sees real casts, and a group survives purely as the `groups`/`ends` tags
  // the report reads back off each snapshot.
  const actions: Action[] = [];
  const slots: number[] = [];
  // what queued each entry, parallel to `slots` — null for a rotation entry, which nothing did
  const bys: (HeldBuff | null)[] = [];
  const groups: (ActionGroup | null)[] = [];
  const ends: boolean[] = [];
  // which group's spill each entry is, parallel to the rest — null for everything a rotation placed
  const spills: (ActionGroup | null)[] = [];
  for (const entry of rotation) {
    // a duck-check rather than `instanceof ActionGroup`: the class lives in rotation.ts, which
    // this module may only reference as types (see the import note at the top)
    const group = (entry as ActionGroup).actions !== undefined ? (entry as ActionGroup) : null;
    const members = group ? group.actions : [entry];
    members.forEach((a, k) => {
      actions.push(a); slots.push(-1); bys.push(null); spills.push(null);
      groups.push(group); ends.push(group !== null && k === members.length - 1);
    });
  }
  insideGroup = false;
  // The group whose beat is still resolving — its own members, then the follow-ups they queued,
  // the last member's included. Every cast spliced in while this stands is that group's spill, and
  // the next rotation entry (or an engine event) clears it.
  let spillGroup: ActionGroup | null = null;
  let i = 0, guard = 0;
  while (i < actions.length) {
    if (++guard > 10000) throw new Error("action queue did not drain");
    const stepAction = actions[i]!, stepSlot = slots[i]!, stepBy = bys[i]!;
    const stepGroup = groups[i]!, stepEnd = ends[i]!, stepSpill = spills[i]!;
    i++;
    spillGroup = stepGroup ?? stepSpill;
    // A follow-up spliced in between two members is still *inside* the group, so this only moves on
    // a member's own row: set on every member but the last, cleared by the last. That is what lets
    // the bar fill part-way through a group and still break only on the cast that ends it.
    if (stepGroup) insideGroup = !stepEnd;
    const before = state.active;
    if (stepSlot >= 0) state.active = stepSlot;
    let action: Action | null = stepAction;
    if (stepAction.resolveFn) {
      // a marker reads state via the "current" pointers, same as any other kit logic — evaluate()
      // sets them again immediately after anyway, so no save/restore needed here
      currentState = state;
      currentSlot = state.slot;
      action = stepAction.resolveFn();
      // resolved to no cast at all this step (deferred onto a later one — see `queueOnIntro()`)
      if (!action) continue;
    }
    pendingQueue.length = 0;
    // "not really this resonator's own turn" rows the report dims: a follow-up the engine itself
    // queued (Phrolova's Hecate procs, Cantarella's Jolt, ...), a rotation marker or a cast that
    // declares itself one (rotation.ts's swap markers, a summon echo's own hit), and an outro (a
    // handoff, not an attack).
    // An engine-level event is *not* one, though it reports under its own bucket rather than any
    // member's (`ActionDef.slot`): a Tune Break is a beat of the fight's own, so it counts off
    // every per-action clock and stands as a row in its own right — see `queueEvent`.
    // Handed to evaluate() rather than stamped on the snapshot after: gear reacting mid-action
    // needs it too (tunebreak.ts's own watcher won't auto-fire off one) — see triggeredAction().
    const triggered = stepSlot >= 0 || stepAction.triggered || action.triggered || isCast(action, Cast.Outro);
    // A triggered echo form names the equipped mainslot itself as its trigger, so the row's hover
    // wears the gear's name in its owner's colour. Overrides whatever queueOnIntro() attributed —
    // during marker resolution `currentBuff` is stale, so the deferred swap copy carried garbage.
    const ms = state.slot.mainslot;
    const by = ms && action.triggered && (action === ms.onfield || action === ms.outro || action === ms.cancel)
      ? { name: ms.name, source: state.sourceOf.get(ms) ?? state.slot.name } : stepBy;
    const snapshot = evaluate(state, action, triggered, by);
    snapshot.group = stepGroup;
    snapshot.groupEnd = stepEnd;
    snapshot.groupSpill = stepSpill;
    out.push(snapshot);
    // a queued follow-up's own turn doesn't stick — restore whoever was actually active,
    // unless the follow-up was itself an outro (genuinely advances the team)
    if (stepSlot >= 0 && state.active === stepSlot) state.active = before;

    if (pendingQueue.length) {
      // spliced in right after the action that queued them — i.e. at the read cursor, which is
      // exactly where the old shift()-based list spliced at its own front
      const qa: Action[] = [], qs: number[] = [], qb: (HeldBuff | null)[] = [];
      for (const p of pendingQueue) { qa.push(p.action); qs.push(p.slot); qb.push(p.by); }
      actions.splice(i, 0, ...qa);
      slots.splice(i, 0, ...qs);
      bys.splice(i, 0, ...qb);
      // a follow-up is never one of the casts a group names, whatever it was queued from
      groups.splice(i, 0, ...qa.map(() => null));
      ends.splice(i, 0, ...qa.map(() => false));
      // a follow-up belongs to whatever beat spawned it — an engine event to nobody (`queueEvent`)
      spills.splice(i, 0, ...pendingQueue.map((p) => (p.event ? null : spillGroup)));
    }
  }
  return out;
}
