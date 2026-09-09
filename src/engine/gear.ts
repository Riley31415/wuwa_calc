/**
 * Every equippable thing and the containers that name a build: the `Gear` class tree
 * (`Buff`/`Debuff`/`Talent`/`Inherent`/`Sequence`/`ResonanceMode`/the sonata sets/`Mainslot`/
 * `Weapon`/`Resonator`), plus `EchoLoadout` and `Loadout`. Definitions only — what a piece
 * *does* is the hooks it declares, which `evaluate.ts` runs.
 */
import { Stat, EnemyStat, Attribute, WeaponType, Tier, Type1, Type2, Cast, Node, Scaling, scopedStat, tagBand, STAT_COUNT, TYPE2_BITS } from "./stats.js";
import type { Tag, StatKey } from "./stats.js";
import type { Rotation, Action, ActionGroup, ActionDef, ActionField } from "./rotation.js";
import { ctx } from "./runtime.js";
// the one edge back up the stack: a Resonator's own combatStart banks its base stats through
// the ordinary API. Both names are function declarations, so the import cycle is inert at load.
import { addStat, frozenStacks, casting, currentAction, applyCurrent, applyTeam, applyEnemy, queueOutro, revokeCurrent } from "./context.js";

/** One stat line as a kit writes it: `[stat, value]`, or `[stat, value, tag]` scoped to an
 *  element or damage type. On a piece of gear these are its constant stats; on a `Buff` they are
 *  what it contributes while held (see `BuffDef.stats`). */
export type StatLine = readonly [Stat | EnemyStat, number] | readonly [Stat | EnemyStat, number, Tag];
/** A condition read off the action being evaluated — `onCast(Cast.Skill)`, `onType(Type1.Basic)`,
 *  `onInflict(STATUS)` (context.ts), or any predicate over the kit API. */
export type Trigger = () => boolean;
/** "On `on`, grant `stacks` of `buff`": to the wielder (`self`, the default), the team, the enemy
 *  (a `Debuff`), or `next` — published for whoever intros next (`queueOutro`). `stacks` may read
 *  the action (`() => applied(SHIELD)`). `buff` left out means the declaring Buff itself — a buff
 *  that stacks itself up on a trigger; a thunk (`() => LATER_BUFF`) reaches one declared further
 *  down the file. */
export interface Grant { on: Trigger; buff?: Buff | (() => Buff); stacks?: number | (() => number); to?: "self" | "team" | "enemy" | "next" }

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
  /** Flat, unconditional stat lines — the data form of `constantStats` (on a `Buff`, of
   *  `applyStats`, since a buff comes and goes). Both may be given; the lines land first. */
  stats?: StatLine[];
  /** What this Gear grants, and when — the data form of `updateBuffs`. Runs after any closure
   *  `updateBuffs` the same def declares. */
  grants?: Grant[];
}

/** The six per-action phases a `Pool` sorts a held Gear's hooks into, in the order
 *  `evaluate()` runs them (updateGlobal is not one: it walks every slot's `globalHooks` instead). */
const PHASE_DEBUFFS = 1, PHASE_BUFFS = 2, PHASE_APPLY = 4, PHASE_CONVERT = 8, PHASE_LATE = 16, PHASE_AFTER = 32;
/** Not a phase of its own: constantStats contributes inside the applyStats phase, but it is
 *  listed like one so a `Pool` can hand `evaluate()` exactly the Gear that declares it. */
const PHASE_CONST = 64;
export const PHASE_COUNT = 7;

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
  hookMask = 0;
  /** A small integer unique to this Gear — what a variant dry run hashes a mutation by, to tell
   *  whether it would have changed the fight (see `noteMutation()`). */
  id: number;
  /** The same six hooks by phase index (bit order of `PHASE_*`), for `runPhase()` to call one
   *  phase's hook without naming the field — only the phases set in `hookMask` are ever read. */
  hookFns: ((() => void) | undefined)[] = [];

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
    this.decl = { stats: def.stats ?? [], grants: def.grants ?? [] };
    // the data half compiles into the same hook slots the closures use, so the engine runs both alike
    if (def.stats?.length && !(this instanceof Buff)) {
      const lines = def.stats, own = def.constantStats;
      this.constantStatsFn = () => { for (const line of lines) addStat(line[0] as Stat, line[1], line[2]); own?.(); };
    }
    if (def.grants?.length) {
      const grants = def.grants, own = def.updateBuffs;
      this.updateBuffsFn = () => {
        own?.();
        for (const g of grants) {
          if (!g.on()) continue;
          const n = typeof g.stacks === "function" ? g.stacks() : g.stacks ?? 1;
          if (n <= 0) continue;
          const buff = typeof g.buff === "function" ? g.buff() : g.buff ?? (this as Buff);
          if (g.to === "team") applyTeam(buff, n);
          else if (g.to === "enemy") applyEnemy(buff as Debuff, n);
          else if (g.to === "next") queueOutro(buff);
          else applyCurrent(buff, n);
        }
      };
    }
    this.wire();
  }
  /** What the data half of this Gear's def declared — kept for the engine to introspect. */
  decl: { stats: StatLine[]; grants: Grant[] };
  /** `hookMask`/`hookFns` off whatever hooks stand now — called once every compiled hook is in place. */
  protected wire(): void {
    this.hookMask = (this.updateDebuffsFn ? PHASE_DEBUFFS : 0) | (this.updateBuffsFn ? PHASE_BUFFS : 0)
      | (this.applyStatsFn ? PHASE_APPLY : 0) | (this.convertStatsFn ? PHASE_CONVERT : 0)
      | (this.lateConvertStatsFn ? PHASE_LATE : 0) | (this.afterActionFn ? PHASE_AFTER : 0)
      | (this.constantStatsFn ? PHASE_CONST : 0);
    this.hookFns = [this.updateDebuffsFn, this.updateBuffsFn, this.applyStatsFn, this.convertStatsFn, this.lateConvertStatsFn, this.afterActionFn, this.constantStatsFn];
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
  /** `stats` multiplied by the held stack count. */
  perStack?: boolean;
  /** `stats` pay only while this holds (`() => isActive()`, say). */
  when?: Trigger;
  /** `stats` pay in the updateBuffs phase, off the stack count held *coming into* the action —
   *  so the cast that grants stacks pays for those it held already, not the ones it just added.
   *  The default (applyStats) pays the count after this action's grants. */
  early?: boolean;
  /** When the buff goes: `outro` — revoked on the holder's Outro after paying on it (the usual
   *  "short self buff, lost after the outro"); `swap` — revoked on the action that takes the holder
   *  off field, before it pays ("lost on switching out"); `afterSwap` — the same action, after it
   *  pays (a handoff that still counts on the leaving row). Unset is permanent. */
  until?: "outro" | "swap" | "afterSwap";
}

export class Buff extends Gear {
  constructor(def: BuffDef) {
    super(def);
    this.maxStacks = def.maxStacks ?? 1;
    if (def.stats?.length) {
      const lines = def.stats, when = def.when, perStack = def.perStack;
      const pay = (): void => {
        if (when && !when()) return;
        const n = perStack ? frozenStacks() : 1;
        for (const line of lines) addStat(line[0] as Stat, perStack ? line[1] * n : line[1], line[2]);
      };
      if (def.early) { const own = this.updateBuffsFn; this.updateBuffsFn = () => { pay(); own?.(); }; }
      else { const own = def.applyStats; this.applyStatsFn = () => { pay(); own?.(); }; }
    }
    if (def.until === "outro") {
      const own = def.convertStats;
      this.convertStatsFn = () => { own?.(); if (casting(Cast.Outro)) revokeCurrent(this); };
    } else if (def.until === "swap") {
      const own = this.updateBuffsFn;
      this.updateBuffsFn = () => { if (currentAction().swapOut) revokeCurrent(this); own?.(); };
    } else if (def.until === "afterSwap") {
      const own = def.convertStats;
      this.convertStatsFn = () => { own?.(); if (currentAction().swapOut) revokeCurrent(this); };
    }
    this.wire();
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
  ({ [Tier.Limited]: 0, [Tier.Standard]: 0, [Tier.Free]: 6 })[r.tier];

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
  /** Each entry is either a weapon's whole five-refinement list (see `refinements()`) — run at R1
   *  unless that resonator's Refines are compared, when every rank gets a row — or one rank
   *  picked out of it (`MARCATO[4]`), which is then the only rank the build ever runs. */
  weapons: (Weapon | Weapon[])[];
  echoLoadouts: EchoLoadout[];
  mainstats: Buff[];
  substat: Buff;
  /** Worn instead of `substat` when that role's High Invest Substats box is on. */
  highSubstat: Buff;
  /** One rotation for every sequence level, or a list of up to seven where the nth is the one the
   *  build runs at S(n-1); a shorter list's last entry covers every level above it. */
  rotation: Rotation | Rotation[];
  sequences?: Sequence[];
  mode?: ResonanceMode;
}

/** A resonator's real build — every resonator file's own `_LOADOUT` export is one of these, not a
 *  loose array, so a loadout has to actually name every viable weapon and echo choice, not just
 *  hand over "some Gear" (see `LoadoutDef`). Forte Circuit logic lives directly on each
 *  resonator's own Resonator definition, not a separate loadout slot — and so do the stat-tree
 *  Talents and both Inherent Skills, which are the kit itself rather than anything a build picks.
 *  Mainstat/substat rolls stay plain `Buff` (`mainstats()`/`substats()`'s own return type) — no
 *  dedicated class was asked for those.
 *
 *  `weapons`/`echoLoadouts`/`mainstats` are lists, not a single pick: the comparison table runs every
 *  combination of them (crossed with every other member's own combinations too — see index.ts's
 *  own `runTeam()`), one row per combo, rather than this file committing to just one. The
 *  `rotation` lives here too now, not a separate export — the scheduler reads its chains and
 *  decides whose turn it is (rotation.ts). */
export class Loadout {
  resonator: Resonator;
  /** The rank of each listed weapon this build runs by default — the first of its `refinements`
   *  entry: R1 for a whole list, the one rank given for a single weapon. */
  weapons: Weapon[];
  /** Per listed weapon, every rank a Refines compare may run it at (`LoadoutDef.weapons`). */
  refinements: Weapon[][];
  echoLoadouts: EchoLoadout[];
  /** Every main-stat build this loadout is willing to run (see mainstats.ts's own
   *  `mainstatOptions()`) — a list for the same reason `weapons`/`echoLoadouts` are, the table
   *  runs one row per combination. A pure support names just the one. */
  mainstats: Buff[];
  substat: Buff;
  highSubstat: Buff;
  /** This build's whole rotation, already compiled into the up-to-three action chains the
   *  scheduler schedules — start of combat, opener, and the Intro chain every visit after
   *  (rotation.ts). One field, not an opener/loop pair: the chains share a body, so splitting
   *  them across two lists only ever duplicated it. Indexed by sequence level, S0 first — see
   *  `rotationAt()`. */
  rotations: Rotation[];
  /** This loadout's own resonance-chain nodes, S1 first — as many as it actually declares, which
   *  is six for anything a build is costed above S0 at (see `Tier`) and none for most
   *  limited kits. */
  sequences: Sequence[];
  mode?: ResonanceMode;

  constructor(def: LoadoutDef) {
    this.resonator = def.resonator;
    this.refinements = def.weapons.map((w) => (Array.isArray(w) ? w : [w]));
    this.weapons = this.refinements.map((w) => w[0]!);
    this.echoLoadouts = def.echoLoadouts;
    this.mainstats = def.mainstats;
    this.substat = def.substat;
    this.highSubstat = def.highSubstat;
    this.rotations = Array.isArray(def.rotation) ? def.rotation : [def.rotation];
    if (this.rotations.length < 1 || this.rotations.length > 7) throw new Error(`${def.resonator.name}: a loadout lists 1-7 rotations, one per sequence level`);
    this.sequences = def.sequences ?? [];
    this.mode = def.mode;
  }

  /** The rotation a build at `sequenceLevel` runs: its own entry where the list reaches that
   *  far, else the last one listed. */
  rotationAt(sequenceLevel: number): Rotation {
    return this.rotations[Math.min(sequenceLevel, this.rotations.length - 1)]!;
  }

  /** Every piece for one specific weapon/echo/main-stat/sequence-level combo, flattened into the
   *  plain array `equip()` actually walks — the order matches how each resonator file's own loadout
   *  comment already reads (resonator, talent, both inherents, weapon, echoes, mainstat/substat,
   *  sequences, mode). `sequenceLevel` is how many nodes are actually held, S1 up: 0 for a build at
   *  S0, 6 for the full chain — the comparison table runs one row per level so the gain from each
   *  can be read off (see index.ts's own combos). `matrix` is whether Matrix Mode is on — the
   *  piece only goes on when it is *and* this resonator has one. `highSubs` swaps the substat
   *  piece for the high-investment one (that role's own box). */
  pieces(weapon: Weapon, echo: EchoLoadout, mainstat: Buff, sequenceLevel: number, matrix = false, highSubs = false): Gear[] {
    const r = this.resonator;
    return [
      r, r.talent, r.inherent1, r.inherent2,
      weapon, ...echo.pieces(), mainstat, highSubs ? this.highSubstat : this.substat,
      ...this.sequences.slice(0, sequenceLevel),
      this.mode,
      matrix ? r.matrix : undefined,
    ].filter((g): g is Gear => g != null);
  }
}

export interface ResonatorDef extends GearDef {
  matrix?: Matrix;
  element: Attribute;
  /** This kit's own stat-tree Talents bonus and both Inherent Skills — part of the resonator
   *  rather than of any one build, since every build runs the same three. Each stays its own piece
   *  of Gear so the report can trace a stat back to which of them granted it. Optional only for
   *  the enemy dummy (`enemy` below), which is no kit; every real resonator names all three, and
   *  the constructor throws if one is missing. */
  talent?: Talent;
  inherent1?: Inherent;
  inherent2?: Inherent;
  /** Which of the five weapon categories this resonator wields — decides which weapon files
   *  (src/weapons/) their loadout can actually equip. */
  weapon: WeaponType;
  /** Liberation always spends everything a resonator has banked, so the cost only needs
   *  declaring once, here — not repeated as a `-12500` (or whatever) on the Liberation action
   *  itself (TODO_ENGINE.md). 0, the default, is for a kit whose Liberation genuinely costs no
   *  Resonance Energy at all (Phrolova, Lucilla), not "not yet filled in". */
  maxEnergy?: number;
  /** The cap on each forte gauge — Suoming's 800 Delusion, Hsin's 100 Answering Heart — declared
   *  once here, like `maxEnergy`. A gauge banks past it freely; the cap only bites when a cast
   *  spends from it, which starts from the cap rather than the overrun (evaluate.ts). Below 0
   *  after a spend is flagged red in the report. Every gauge a kit uses declares one. */
  maxForte1?: number;
  maxForte2?: number;
  maxForte3?: number;
  maxForte4?: number;
  maxForte5?: number;
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
 *  name/element/weapon type/colour/intro-choice, and the three pieces every build of it runs
 *  regardless — the stat-tree Talents (e.g. `"Phrolova: Talents"`) and both Inherent Skills. Each
 *  of those stays a separate piece of Gear rather than being folded into this one's own
 *  `constantStats`, so the report still names which of them a stat came from. */
export class Resonator extends Gear {
  element: Attribute;
  weapon: WeaponType;
  /** Undefined only on the enemy dummy — see `ResonatorDef`. */
  talent?: Talent;
  inherent1?: Inherent;
  inherent2?: Inherent;
  /** This kit's Matrix, if it has one — worn only when the table's Matrix Mode box is on
   *  (`Loadout.pieces()`), and the resonator's own the way their Talents are. */
  matrix?: Matrix;
  maxEnergy: number;
  /** `maxForte1`-`maxForte5` as one array, indexed the way `TeamMember.forte` is. */
  maxForte: [number, number, number, number, number];
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
        ctx.slot!.resonator = this;
        // the enemy member is nameless until its resonator lands: the bucket the break's damage
        // reports under, and the hue it wears, are read off it from then on
        if (def.enemy) ctx.slot!.name = this.name;
        // RealEnergy (see ActionDef.resetEnergy) starts a fight already filled, unlike the real
        // Energy bar, which starts empty — it's tracking "energy banked since the last reset",
        // and nothing has spent it yet.
        ctx.slot!.realEnergy = this.maxEnergy;
        def.combatStart?.();
      },
    });
    this.element = def.element;
    this.weapon = def.weapon;
    if (!def.enemy && (!def.talent || !def.inherent1 || !def.inherent2)) {
      throw new Error(`${def.name}: a resonator names its Talents and both Inherent Skills`);
    }
    this.talent = def.talent;
    this.matrix = def.matrix;
    this.inherent1 = def.inherent1;
    this.inherent2 = def.inherent2;
    this.maxEnergy = def.maxEnergy ?? 0;
    this.maxForte = [def.maxForte1 ?? 0, def.maxForte2 ?? 0, def.maxForte3 ?? 0, def.maxForte4 ?? 0, def.maxForte5 ?? 0];
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
  /** How the weapon is come by, the same three tiers a resonator has (stats.ts's own `Tier`):
   *  `Limited` a signature, `Standard` one of the permanent 5-stars (Stormy Resolution and the
   *  new standard set), `Free` a 4-star anyone can craft — Ceaseless Aria, Bloodpact's Pledge.
   *  Every tier runs at R1 unless a loadout names a higher rank outright (`LoadoutDef.weapons`).
   *  Unset means `Tier.Limited`.
   *  The comparison table's own Allow R1 MDPS/Supports checkboxes key off it: unchecked restricts
   *  that role to the non-limited tiers, on the assumption a signature is only ever owned at R1. */
  tier?: Tier;
}

/** All five refinements of one weapon, R1 first. `build` is called once per rank with `r` 0-4 and
 *  reads its own numbers off five-entry lists (`[12, 15, 18, 21, 24][r]`); every buff the weapon
 *  grants is built inside the same call, so each rank carries its own instances and a team buff
 *  pays the applier's rank. `rank` is the " R3" every name in that call ends with, weapon and
 *  buffs alike, so the table and the buff lists say which rank is being run. */
export function refinements(build: (r: number, rank: string) => Weapon): Weapon[] {
  return [0, 1, 2, 3, 4].map((r) => { const w = build(r, ` R${r + 1}`); w.refinement = r + 1; return w; });
}

/** A weapon: gear that also carries which of the five categories it belongs to. Every top-level
 *  weapon export in src/weapons/ is one of these, not a plain Gear — the secondary proc buffs a
 *  weapon grants (Ad Veritatem, Panorama, etc.) stay plain Buff. */
export class Weapon extends Gear {
  weaponType: WeaponType;
  tier: Tier;
  /** Which rank this instance is, 1-5 — stamped by `refinements()`. */
  refinement = 1;
  constructor(def: WeaponDef) {
    super(def);
    this.weaponType = def.weaponType;
    this.tier = def.tier ?? Tier.Limited;
  }
}

/** An Action is a Gear (see the class below), so every hook `GearDef` declares is available here
 *  too — an action that *does* something declares it directly instead of a held Gear branching on
 *  `currentAction() === X`. The one that doesn't apply is `combatStart`: an Action is cast, never
 *  equipped, so nothing ever fires it. */
/* Action/ActionGroup/ActionDef live in rotation.ts, beside the markers and the rotation-flavoured
 * forms (`cancel()`, `swap()`). This module names them through `import type` only — that erased
 * import is what keeps it free of any runtime edge back into rotation.ts, so rotation.ts (whose
 * markers construct Actions, whose Action extends Gear) always evaluates after this one. */
