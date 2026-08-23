/**
 * The engine. Buffs/Gear/Actions are stateless singletons — every mutable fact about a held one
 * (stacks) lives in the engine's own `TeamMember.stacks`, keyed by identity, never on the object
 * itself. `stacks()`/`addStat()`/etc. resolve against "whichever Gear and slot the engine is
 * mid-call for" — safe because evaluation is fully synchronous. Replaces the previous kit.ts/
 * state.ts pair; see TODO_ENGINE.md for the rework this came out of.
 */
import { Stat, EnemyStat, Attribute, WeaponType, Type1, Type2, Cast, Node, Scaling, scopedStat, TAGS_MATCHED } from "./stats.js";
export { Stat, EnemyStat, Attribute, WeaponType, Type1, Type2, Cast, Node, Scaling, scopedStat };

/** Attribute/type/type2 only — matches stats.js's own TAGS_MATCHED. */
const tagsOf = (action: Action): string[] =>
  TAGS_MATCHED.map((k) => (action as unknown as Record<string, unknown>)[k])
    .filter((v): v is string => Boolean(v));


export interface GearDef {
  /** Optional only because `toString` can cover for it entirely — a Gear whose display name is
   *  always computed (Shorekeeper's Stellarealm, Jingran's HP folds) has no separate fixed name
   *  to also give here. Leaving both unset means this Gear reports as "" everywhere; that's a
   *  bug in whatever kit does it, not something worth a guard here. */
  name?: string;
  maxStacks?: number;
  /** Runs once, the moment this Gear is `equip()`-ped during team setup — never mid-fight.
   *  For anything that happens on entering combat, not on a specific cast (Phrolova's Octet:
   *  10 Aftersound the instant she's on the team, regardless of when she first acts). */
  combatStart?: () => void;
  /** Same shape as `update` below — grant/revoke/queue/spend, never a stat contribution — but
   *  runs first, one step ahead of it, and runs for this Gear no matter who actually took the
   *  action: every slot's own held gear gets its own `updateGlobal()` called every single action,
   *  not just when this Gear's own holder is the one acting. `update` still only runs when this
   *  Gear is actually in the acting slot's own held set (or global) — `updateGlobal` is what a
   *  self-held buff needs to react to a *teammate's* action without being promoted to a real
   *  team-wide buff just to be reachable from their turn (Jingran's Trace the Vestige/Fixation:
   *  both react to any team member's own shield, but pay out onto his slot specifically). */
  updateGlobal?: () => void;
  /** Grant/revoke/queue/spend — never a stat contribution. Runs first, across every held Gear. */
  update?: () => void;
  /** A flat stat contribution. Runs after every held Gear's own update(). */
  apply?: () => void;
  /** Reads a total apply() already built this action (an ER threshold, an HP fold). Runs last. */
  convert?: () => void;
  /** How this Gear names itself wherever the report shows it — the source on every stat entry it
   *  contributes, and its row in the resonator popover. Defaults to its `name`, plus " xN" once
   *  it stacks; override for a Gear whose useful name isn't fixed (Shorekeeper's Stellarealm
   *  naming its own stage: "Inner Stellarealm" rather than "Stellarealm x2"; Jingran's HP folds
   *  naming how many 1000-HP steps they converted). Called with this Gear current, so `stacks()`
   *  and the stat readers all work inside it.
   *  Named `display`, not `toString`: every plain object already inherits a `toString` from
   *  `Object.prototype`, so `def.toString` is never actually `undefined` when a kit leaves it
   *  unset — it silently reads as `Object.prototype.toString`, and Gear's own toString() below
   *  would call that instead of falling back to its default name, printing "[object Object]"
   *  everywhere. A same-named field can't tell "not provided" apart from "inherited". */
  display?: () => string;
}

/** Base for anything held/stacking/per-slot-tracked — kit passives, weapons, echoes, and
 *  eventually the resonator itself (TODO_ENGINE.md). `Buff` is a plain named subclass, same
 *  reasoning the old engine used for Debuff/GlobalBuff/Mode. */
export class Gear {
  name: string;
  maxStacks: number;
  combatStartFn?: () => void;
  updateGlobalFn?: () => void;
  updateFn?: () => void;
  applyFn?: () => void;
  convertFn?: () => void;
  displayFn?: () => string;

  constructor(def: GearDef) {
    this.name = def.name ?? "";
    this.maxStacks = def.maxStacks ?? 1;
    this.combatStartFn = def.combatStart;
    this.updateGlobalFn = def.updateGlobal;
    this.updateFn = def.update;
    this.applyFn = def.apply;
    this.convertFn = def.convert;
    this.displayFn = def.display;
  }
  toString(): string {
    if (this.displayFn) return this.displayFn();
    return this.maxStacks > 1 ? `${this.name} x${stacks()}` : this.name;
  }
}

export class Buff extends Gear {}
export class Debuff extends Buff {}
/** A resonator's own stat-tree Talents bonus — one per kit, always equipped. */
export class Talent extends Gear {}
/** One of a resonator's two Inherent Skill slots — an always-equipped piece. A flat unconditional
 *  stat it grants lives directly in its own apply(); a conditional/stacking payout it triggers
 *  stays a separate Buff, granted from this piece's own update(). */
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

/** A resonator's real build — every resonator file's own `_LOADOUT` export is one of these, not a
 *  loose array, so a loadout has to actually name its Talent/both Inherent Skills/weapon/mainslot/
 *  sonata pieces, not just hand over "some Gear". Every constructor argument is required except
 *  the six trailing sequence nodes: a limited 5-star's own loadout leaves all six unset, a
 *  `standardCharacter`'s own sets as many as its resonance chain actually has (see each resonator
 *  file's own `_S1`-`_S6`). Forte Circuit logic lives directly on each resonator's own Resonator
 *  definition, not a separate loadout slot. Mainstat/substat rolls stay plain `Buff`
 *  (`mainstats()`/`chem()`'s own return type) — no dedicated class was asked for those. `mode`, the
 *  last param, is for the rare kit built around a Resonance Mode (Lucilla) — every other loadout
 *  leaves it unset same as the sequence slots. */
export class Loadout {
  resonator: Resonator;
  talent: Talent;
  inherent1: Inherent;
  inherent2: Inherent;
  weapon: Weapon;
  mainslot: Mainslot;
  sonata: Sonata;
  sonata2pc: Sonata2pc;
  mainstat: Buff;
  substat: Buff;
  sequence1?: Sequence;
  sequence2?: Sequence;
  sequence3?: Sequence;
  sequence4?: Sequence;
  sequence5?: Sequence;
  sequence6?: Sequence;
  mode?: ResonanceMode;

  constructor(
    resonator: Resonator, talent: Talent, inherent1: Inherent, inherent2: Inherent,
    weapon: Weapon, mainslot: Mainslot, sonata: Sonata, sonata2pc: Sonata2pc, mainstat: Buff, substat: Buff,
    sequence1?: Sequence, sequence2?: Sequence, sequence3?: Sequence, sequence4?: Sequence, sequence5?: Sequence, sequence6?: Sequence,
    mode?: ResonanceMode,
  ) {
    this.resonator = resonator;
    this.talent = talent;
    this.inherent1 = inherent1;
    this.inherent2 = inherent2;
    this.weapon = weapon;
    this.mainslot = mainslot;
    this.sonata = sonata;
    this.sonata2pc = sonata2pc;
    this.mainstat = mainstat;
    this.substat = substat;
    this.sequence1 = sequence1;
    this.sequence2 = sequence2;
    this.sequence3 = sequence3;
    this.sequence4 = sequence4;
    this.sequence5 = sequence5;
    this.sequence6 = sequence6;
    this.mode = mode;
  }

  /** Every piece, flattened into the plain array `equip()` actually walks — the order matches how
   *  each resonator file's own loadout comment already reads (resonator, talent, both inherents,
   *  weapon, echoes, mainstat/substat, sequences, mode). */
  pieces(): Gear[] {
    return [
      this.resonator, this.talent, this.inherent1, this.inherent2,
      this.weapon, this.mainslot, this.sonata, this.sonata2pc, this.mainstat, this.substat,
      this.sequence1, this.sequence2, this.sequence3, this.sequence4, this.sequence5, this.sequence6,
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
  standardCharacter: boolean;
  constructor(def: ResonatorDef) {
    super({ ...def, combatStart: () => { currentSlot!.resonator = this; def.combatStart?.(); } });
    this.element = def.element;
    this.weapon = def.weapon;
    this.maxEnergy = def.maxEnergy ?? 0;
    this.color = def.color;
    this.introFn = def.intro;
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
}

/** A weapon: gear that also carries which of the five categories it belongs to. Every top-level
 *  weapon export in src/weapons/ is one of these, not a plain Gear — the secondary proc buffs a
 *  weapon grants (Ad Veritatem, Panorama, etc.) stay plain Buff. */
export class Weapon extends Gear {
  weaponType: WeaponType;
  constructor(def: WeaponDef) {
    super(def);
    this.weaponType = def.weaponType;
  }
}

export interface ActionDef {
  element?: Attribute | null;
  type?: Type1 | null;
  type2?: Type2 | null;
  cast?: Cast | null;
  cast2?: Cast | null;
  active?: boolean;
  node?: Node | null;
  scaling?: Scaling | null;
  mv?: number;
  /** How much of each element's own proc mechanic this cast inflicts on the enemy — Havoc Bane,
   *  Glacio Chafe, Electro Flare, Fusion Burst, Aero Erosion, Spectro Frazzle (see Type2 in
   *  stats.ts) — plus the Tune-side equivalents, Hack/Rupture/Strain. All the same shape as `mv`:
   *  a plain declared amount, read back off the action (`currentAction().chafe`, `.flare`, ...)
   *  by whoever's own kit reacts to it. Never modified once declared — no running total, no
   *  gain-style setter; a buff that cares just reads the number. */
  bane?: number;
  chafe?: number;
  flare?: number;
  burst?: number;
  erosion?: number;
  frazzle?: number;
  hack?: number;
  rupture?: number;
  strain?: number;
  /** How many shields this cast grants — same shape as `chafe` above. Shields are not a stat,
   *  see stats.ts. */
  shields?: number;
  /** Whether this cast heals at all — read back off the action (`currentAction().heals`) by a
   *  kit that reacts to "did a heal happen", never a modified/tracked value. Healing itself is
   *  out of scope for this calculator's own damage math (see stats.ts's own note on
   *  Stat.HealingBonus/HealingTaken), so this is a flag, not an amount, same as `active`. */
  heals?: boolean;
  /** How much Resonance Energy/Concerto/Off-tune this resonator's own cast generates — the
   *  baseline every action carries regardless of any buff, same declared-once shape as `mv`.
   *  evaluate() banks this into the running total automatically (TeamMember.energy/concerto,
   *  State.offtune) right alongside whatever AddEnergy/AddConcerto/AddOfftune a held buff
   *  contributed — a kit never touches these fields itself, only declares them per action. */
  energy?: number;
  concerto?: number;
  offtune?: number;
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
}

/** Pure data. Anything an action "does" is a `currentAction() === X` / `casting(Y)` check
 *  inside whichever held Gear's own update()/apply() cares. */
export class Action {
  id: string;
  element: Attribute | null;
  type: Type1 | null;
  type2: Type2 | null;
  cast: Cast | null;
  cast2: Cast | null;
  active: boolean;
  node: Node | null;
  scaling: Scaling | null;
  mv: number;
  bane: number;
  chafe: number;
  flare: number;
  burst: number;
  erosion: number;
  frazzle: number;
  hack: number;
  rupture: number;
  strain: number;
  shields: number;
  heals: boolean;
  energy: number;
  concerto: number;
  offtune: number;
  forte1: number;
  forte2: number;
  forte3: number;
  forte4: number;
  forte5: number;

  constructor(id: string, def: ActionDef = {}) {
    this.id = id;
    this.element = def.element ?? null;
    this.type = def.type ?? null;
    this.type2 = def.type2 ?? null;
    this.cast = def.cast ?? null;
    this.cast2 = def.cast2 ?? null;
    this.active = def.active ?? true;
    this.node = def.node ?? null;
    this.scaling = def.scaling ?? null;
    this.mv = def.mv ?? 0;
    this.bane = def.bane ?? 0;
    this.chafe = def.chafe ?? 0;
    this.flare = def.flare ?? 0;
    this.burst = def.burst ?? 0;
    this.erosion = def.erosion ?? 0;
    this.frazzle = def.frazzle ?? 0;
    this.hack = def.hack ?? 0;
    this.rupture = def.rupture ?? 0;
    this.strain = def.strain ?? 0;
    this.shields = def.shields ?? 0;
    this.heals = def.heals ?? false;
    this.energy = def.energy ?? 0;
    this.concerto = def.concerto ?? 0;
    this.offtune = def.offtune ?? 0;
    this.forte1 = def.forte1 ?? 0;
    this.forte2 = def.forte2 ?? 0;
    this.forte3 = def.forte3 ?? 0;
    this.forte4 = def.forte4 ?? 0;
    this.forte5 = def.forte5 ?? 0;
  }
  toString(): string { return this.id; }
}

/** Rotation marker: "cast the equipped mainslot echo here". Never evaluated itself — `run()`
 *  replaces it with the acting slot's own `Mainslot.action` before it reaches `evaluate()`. */
export const ECHO_CAST = new Action("Echo Cast");

/** Rotation marker: "cast whichever Intro this resonator's own kit calls for right now". Never
 *  evaluated itself — `run()` replaces it with the acting slot's own `Resonator.introFn()`
 *  before it reaches `evaluate()`, same shape as `ECHO_CAST` above. */
export const INTRO = new Action("Intro");

/* --------------------------------------------------------------- engine-owned per-slot state */

/** One stat contribution, tagged with what granted it and who was acting — `addStat()` fills
 *  `source`/`owner` in automatically from the "current" pointers, so no call site anywhere has
 *  to pass them. Feeds the report's own hover-trace panels (display.ts's `tracing()`/`explain()`). */
export interface StatEntry { stat: string; value: number; source: string; owner: string | null; }

/** One buff held on a member, as the report's own resonator popover shows it: its name (with a
 *  stack count where it stacks) and whose kit put it there (see `State.sourceOf`). */
export interface HeldBuff { name: string; source: string; }

/** Where every Gear's mutable facts actually live — never on the Gear itself. */
export class TeamMember {
  name: string;
  /** Whichever Resonator is actually equipped here — set once, by Resonator's own combatStart,
   *  the moment it's equip()-ped. Attribute/energy/name all live on it, not duplicated here; null
   *  only in the brief window between constructing a State (from bare names) and equip()ping
   *  each member's own Resonator. */
  resonator: Resonator | null = null;
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
  stacks = new Map<Gear, number>();
  /** Whatever was `equip()`-ped onto this member at team setup — their resonator and its talents,
   *  weapon, mainslot echo, sonata pieces, mainstat/substat rolls. Held in `stacks` like anything
   *  else (that's how their apply() runs), but it's gear, not a buff their kit put up, so the
   *  report's own "what's on this resonator" panel leaves it out (see `heldLocal` in evaluate()).
   *  `equip()` is the only thing that writes here, and it's the only way gear is ever granted. */
  equipped = new Set<Gear>();
  entries: StatEntry[] = [];
  /** Running sum per stat key, kept in lockstep with `entries` (same push site in `addStat()`,
   *  same reset in `evaluate()`) — so `total()` is a hash lookup instead of a re-scan of every
   *  entry, which matters once a kit's own `get()`/`pct()` calls start piling up mid-action. */
  totals = new Map<string, number>();

  constructor(name: string) { this.name = name; }

  stacksOf(gear: Gear): number { return this.stacks.get(gear) ?? 0; }
  isHeld(gear: Gear): boolean { return this.stacks.has(gear); }

  addStack(gear: Gear, n = 1): number {
    const next = Math.min(gear.maxStacks, this.stacksOf(gear) + n);
    this.stacks.set(gear, next);
    return next;
  }
  removeStack(gear: Gear, n = 1): number {
    const next = Math.max(0, this.stacksOf(gear) - n);
    if (next === 0) this.stacks.delete(gear); else this.stacks.set(gear, next);
    return next;
  }
  setStacks(gear: Gear, n: number): number {
    const next = Math.max(0, Math.min(gear.maxStacks, n));
    if (next === 0) this.stacks.delete(gear); else this.stacks.set(gear, next);
    return next;
  }
  revoke(gear: Gear): void { this.stacks.delete(gear); }

  total(stat: string): number {
    return this.totals.get(stat) ?? 0;
  }
}

/** A team: several Slots, one active at a time, plus team-wide (global) Gear held once rather
 *  than per-slot — the "ticks for whoever's acting" mechanism the old engine's GlobalBuff was. */
export class State {
  slots: TeamMember[];
  active = 0;
  globalStacks = new Map<Gear, number>();
  /** Debuffs placed on the enemy rather than held by any resonator — mechanically identical to
   *  `globalStacks` (ticks on every slot's own turn regardless of who's acting), kept as its own
   *  map purely so the resonator popover can bucket it into its own "Enemy debuffs" section
   *  instead of mixing it into "Global buffs" — a real distinction to the report, not just
   *  formatting (see `buffsPopover` in index.ts). */
  enemyStacks = new Map<Gear, number>();
  outroQueue: Buff[] = [];
  /** Off-tune buildup — the enemy's own bar, not any one member's, banked automatically by
   *  evaluate() off whichever held Gear contributed AddOfftune this action, same as
   *  TeamMember's own energy/concerto. */
  offtune = 0;
  /** Whose kit each piece of Gear ultimately came from, by member name.
   *
   *  Gear equipped at setup is sourced to whoever equipped it. Everything else inherits: a buff
   *  granted while another Gear's own update() is running is that Gear's doing, so it carries
   *  that Gear's source rather than the name of whichever member happened to be on field when it
   *  landed. Shorekeeper's echo granting "Fallacy of No Return" onto Iuno stays sourced to
   *  Shorekeeper; Iuno's domain stacking Blessing onto Jingran stays sourced to Iuno.
   *
   *  Lives on the State, not the Gear: a Gear is a module-level singleton shared by every team,
   *  so writing to it would leak one team's attribution into another's. */
  sourceOf = new Map<Gear, string>();

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
    const next = Math.min(gear.maxStacks, this.stacksOfGlobal(gear) + n);
    this.globalStacks.set(gear, next);
    return next;
  }
  removeStackGlobal(gear: Gear, n = 1): number {
    const next = Math.max(0, this.stacksOfGlobal(gear) - n);
    if (next === 0) this.globalStacks.delete(gear); else this.globalStacks.set(gear, next);
    return next;
  }
  setStacksGlobal(gear: Gear, n: number): number {
    const next = Math.max(0, Math.min(gear.maxStacks, n));
    if (next === 0) this.globalStacks.delete(gear); else this.globalStacks.set(gear, next);
    return next;
  }
  revokeGlobal(gear: Gear): void { this.globalStacks.delete(gear); }

  stacksOfEnemy(gear: Gear): number { return this.enemyStacks.get(gear) ?? 0; }
  addStackEnemy(gear: Gear, n = 1): number {
    const next = Math.min(gear.maxStacks, this.stacksOfEnemy(gear) + n);
    this.enemyStacks.set(gear, next);
    return next;
  }
  removeStackEnemy(gear: Gear, n = 1): number {
    const next = Math.max(0, this.stacksOfEnemy(gear) - n);
    if (next === 0) this.enemyStacks.delete(gear); else this.enemyStacks.set(gear, next);
    return next;
  }
  setStacksEnemy(gear: Gear, n: number): number {
    const next = Math.max(0, Math.min(gear.maxStacks, n));
    if (next === 0) this.enemyStacks.delete(gear); else this.enemyStacks.set(gear, next);
    return next;
  }
  revokeEnemy(gear: Gear): void { this.enemyStacks.delete(gear); }
}

// level-100 enemy at a flat 20% resistance — the project's own standing baseline
const ENEMY_RES = 20, ENEMY_DEF_LEVEL = 100;
export const enemyDef = () => 792 + 8 * ENEMY_DEF_LEVEL;
export const enemyRes = () => ENEMY_RES;

/* -------------------------------------------------------------------------- the "current" pointers */

let currentState: State | null = null;
let currentSlot: TeamMember | null = null;
let currentBuff: Gear | null = null;
let currentAct: Action | null = null;
let currentHeldStacks: Map<Gear, number> | null = null;

export const currentAction = (): Action => currentAct!;
export const currentTeam = (): State => currentState!;

/** Is the action being evaluated this cast type — checks both `cast` and `cast2`. */
export function casting(cast: Cast): boolean {
  const a = currentAct!;
  return a.cast === cast || a.cast2 === cast;
}

/** This buff's own stack count — frozen at the start of this action (see `evaluate()`'s own
 *  `heldStacks` snapshot), not a live re-read. A buff that revokes itself in `update()` still
 *  reports its true held count to its own `apply()` this same action, matching the old engine's
 *  `apply(ctx, stacks)` — `stacks` was a parameter bound once, never re-read mid-action either. */
export function stacks(): number { return currentHeldStacks?.get(currentBuff!) ?? currentSlot!.stacksOf(currentBuff!); }

/** Shared write path for addStat()/addEnemyStat() — pushes the trace entry and bumps the running
 *  total, keyed off whatever string the caller already resolved (plain or scoped). Source (which
 *  Gear) and owner (whose *kit* granted it — `State.sourceOf`, not whoever's turn it happens to
 *  be) are read off the "current" pointers, not passed in — every call site stays exactly as
 *  terse as before, but the report can still trace every value back to what granted it and colour
 *  it by that kit. Falls back to whoever's actually acting only if this Gear was somehow never
 *  attributed (shouldn't happen — every grant path calls `attribute()`). */
function pushStat(key: string, value: number): void {
  currentSlot!.entries.push({
    stat: key, value,
    // toString(), not .name directly — a maxStacks > 1 Gear reads "Name xN" (see Gear's own
    // toString()), so the report's own hover panels show the stack count behind every value.
    source: currentBuff?.toString() ?? "",
    owner: (currentBuff && currentState!.sourceOf.get(currentBuff)) ?? currentSlot?.name ?? null,
  });
  // kept alongside entries (see TeamMember.totals) so total()/get() don't have to re-scan the
  // whole entries array on every call.
  currentSlot!.totals.set(key, (currentSlot!.totals.get(key) ?? 0) + value);
}

/** Contribute a personal stat — optionally scoped (`addStat(Stat.DmgBonus, 12, Attribute.Havoc)`).
 *  For the attacker's own line only; a debuff that changes the *enemy's* own stat (Res Reduce,
 *  Def Reduce) is `addEnemyStat()` instead, below. */
export function addStat(stat: Stat, value: number, tag?: string): void {
  pushStat(tag ? scopedStat(tag, stat) : stat, value);
}

/** Contribute to an `EnemyStat` — a real debuff on the target (Res Reduce, Def Reduce) that every
 *  attacker reads identically, not a personal modifier. Its own function (not `addStat`) so a kit
 *  can't reach for `Stat.ResIgnore`-style attacker-side stats when it actually means a target-side
 *  one, or vice versa — same split as the two enums themselves (see `EnemyStat` in stats.ts). Still
 *  folds into the acting resonator's own running totals underneath, same as any other enemy
 *  debuff (`State.enemyStacks`'s own gear runs through this same acting slot every action, so
 *  every attacker ends up reading the identical number). */
export function addEnemyStat(stat: EnemyStat, value: number, tag?: string): void {
  pushStat(tag ? scopedStat(tag, stat) : stat, value);
}

/** Running total for the action being evaluated, including any scoped variant matching it. */
export function get(stat: Stat): number {
  const action = currentAct!;
  return tagsOf(action).reduce((n, tag) => n + currentSlot!.total(scopedStat(tag, stat)), currentSlot!.total(stat));
}
export function pct(stat: Stat): number { return get(stat) / 100; }

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
    set: (value: number): number => (currentSlot!.forte[i] = value),
    add: (delta: number): number => (currentSlot!.forte[i] = currentSlot!.forte[i] + delta),
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
export function setConcerto(value: number): number { return (currentSlot!.concerto = value); }

/** Record whose kit this Gear came from (see `State.sourceOf`). Called by every grant, so a buff
 *  is attributed the moment it lands rather than guessed at from its name later.
 *
 *  Whatever is granting right now is `currentBuff` — the Gear whose own update() is mid-run — so
 *  a buff a buff puts up inherits that buff's source. Outside any Gear's update (which is only
 *  ever `equip()` during team setup) there's nothing to inherit from, so it's sourced to the
 *  member being equipped. */
function attribute(gear: Gear): void {
  const inherited = currentBuff ? currentState!.sourceOf.get(currentBuff) : undefined;
  currentState!.sourceOf.set(gear, inherited ?? currentSlot!.name);
}

export function applySelf(buff: Buff, n = 1): number {
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
  gear.combatStartFn?.();
  return result;
}

export function setStacksSelf(buff: Buff, n: number): number {
  attribute(buff);
  return currentSlot!.setStacks(buff, n);
}
export function removeStack(buff: Buff, n = 1): number { return currentSlot!.removeStack(buff, n); }
export function revoke(buff: Buff): void { currentSlot!.revoke(buff); }

/** Shortcut for a buff whose own kit text says "lost on swap" — revokes itself the moment the
 *  action being evaluated is inactive (the project's own standing convention: lost on swap =
 *  lost on inactive action). Call it from `update()` if it should stop contributing before that
 *  same action's own stats apply, or from `convert()` if it should still pay out on it first —
 *  same choice as any other revoke, just this one condition spelled out once instead of copied at
 *  every call site. Only correct for a buff whose own holder has no *other* inactive action of
 *  their own (a queued coordinated-attack hit, say) that should leave it standing — one held by a
 *  resonator like that still needs its own explicit condition instead. */
export function lostOnSwap(): void {
  if (!currentAct!.active) revoke(currentBuff as Buff);
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

/** Grant/spend a Buff on one specific resonator's own local stacks, regardless of whose turn it
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
 *  action is evaluated, before that action's own update()/apply()/convert() run. */
export function queueOutro(buff: Buff): void {
  // attributed here, at the outro that publishes it — not when the next resonator adopts it,
  // which would credit the buff to whoever received it rather than whoever handed it over
  attribute(buff);
  currentState!.outroQueue.push(buff);
}

/** Captures which slot queued it — `currentSlot`, not `state.active`: they're the same slot in
 *  every ordinary update()/apply()/convert() call, but they can genuinely differ inside
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
  pendingQueue.push({ action, slot: currentState!.slots.indexOf(currentSlot!) });
}

/** Same as `queue()`, but attributed to one specific resonator's own slot regardless of whose
 *  turn it actually is or who's reacting — for a kit reacting through `updateGlobal()` (so
 *  `currentSlot` is its own holder, not the real actor) that still wants the follow-up to land on
 *  whoever it's actually for. Resolved via `State.memberOf()`, same "throws rather than silently
 *  no-opping" contract as `addBuff()`. */
export function queueOn(resonator: Resonator, action: Action): void {
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
  stat(key: string): number;
  atk: number; hp: number; def: number;
  amp: number; dmgBonus: number;
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
  /** This slot's own forte gauges 1-5, as they stood once this action resolved. */
  forte: [number, number, number, number, number];
  /** Running totals as they stood once this action resolved — energy/concerto are this slot's
   *  own (TeamMember.energy/concerto), offtune is the enemy's shared one (State.offtune). All
   *  three are banked automatically by evaluate() itself; see AddEnergy/AddConcerto/AddOfftune. */
  energy: number;
  concerto: number;
  offtune: number;
  /** How much this action's own outro-firing zeroed energy/concerto back out by — 0 on every
   *  action that isn't an outro. Not folded into `energy`/`concerto` above (those are already the
   *  post-reset 0); this is purely so display.ts can show the spend as a real trace row instead of
   *  the total just silently becoming 0. */
  energySpent: number;
  concertoSpent: number;
  /** Every Buff actually held once this action resolved — local (this slot's own), global
   *  (team-wide), and enemy (debuffs on the target — `State.enemyStacks`) kept apart, since
   *  that's a real distinction to a resonator popover, not just a formatting detail. Equipped
   *  gear is excluded (see `TeamMember.equipped`); each entry carries its own name (`toString()`,
   *  so "Name xN" where it stacks) and whose kit it came from (`State.sourceOf`). */
  heldLocal: HeldBuff[];
  heldGlobal: HeldBuff[];
  heldEnemy: HeldBuff[];
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
 *  first; then every held Gear's updateGlobal() runs (every slot's own gear, not just the acting
 *  one — see its own comment below), then every held Gear's update() runs — local (acting slot),
 *  global, and enemy together — then every apply(), then every convert(); an Outro-cast advances
 *  the active slot afterward. */
export function evaluate(state: State, action: Action): ResolvedSnapshot {
  const slot = state.slot;
  currentState = state;
  currentSlot = slot;
  currentAct = action;
  slot.entries = [];
  slot.totals.clear();

  if (casting(Cast.Intro) && state.outroQueue.length) {
    for (const gear of state.outroQueue.splice(0)) slot.addStack(gear, 1);
  }

  // A phase's own roster and stack counts are frozen before it runs, so nothing a gear does
  // mid-phase shifts the ground under whatever this engine iterates to next. One pass per pool
  // builds the roster and its counts together — a gear only ever lives in one pool at a time, so
  // "first pool it turns up in" matches the old roster()-then-three-relookups-per-gear exactly,
  // for one Map lookup per gear instead of three.
  const freeze = (): Map<Gear, number> => {
    const m = new Map<Gear, number>();
    for (const [g, n] of slot.stacks) m.set(g, n);
    for (const [g, n] of state.globalStacks) if (!m.has(g)) m.set(g, n);
    for (const [g, n] of state.enemyStacks) if (!m.has(g)) m.set(g, n);
    return m;
  };

  // updateGlobal() runs first, and runs for every slot's own held gear — not just the acting
  // slot's — plus global and enemy gear, regardless of whose turn this actually is. That's what
  // lets a kit react to "any team member's own action" through gear held locally (a self buff)
  // instead of needing the whole thing to live in globalStacks just to be reachable from someone
  // else's turn. For a locally-held gear, `currentSlot` is switched to *its own holder* for the
  // call (not the slot actually acting) — so `revoke()`/`applySelf()`/`stacksOf()` inside it
  // still resolve against whoever holds it, the same way they would if that holder were the one
  // acting. Global and enemy gear keep the ordinary convention instead: `currentSlot` stays the
  // real acting slot, matching every other global buff's own update().
  for (const s of state.slots) {
    for (const gear of s.stacks.keys()) {
      if (!gear.updateGlobalFn) continue;
      currentSlot = s;
      currentBuff = gear;
      gear.updateGlobalFn();
    }
  }
  currentSlot = slot;
  for (const gear of [...state.globalStacks.keys(), ...state.enemyStacks.keys()]) {
    if (!gear.updateGlobalFn) continue;
    currentBuff = gear;
    gear.updateGlobalFn();
  }
  currentBuff = null;

  // update() decides what's held; it runs over whatever this action started with.
  currentHeldStacks = freeze();
  const held = [...currentHeldStacks.keys()];
  for (const gear of held) { currentBuff = gear; gear.updateFn?.(); }

  // ...then apply()/convert() pay out over what's held *now*, not what was held a moment ago:
  // a buff update() just granted pays into this same action, and one update() just revoked pays
  // nothing. Re-frozen at post-update counts, so a buff that gained or spent stacks in update()
  // reports the count it actually ended on to its own apply().
  currentHeldStacks = freeze();
  const active = [...currentHeldStacks.keys()];

  // What belongs in the resonator popover is captured right here — what's actually held once
  // update() has finished, before apply()/convert() run — not re-derived after them. A buff that
  // spends/revokes itself inside its own convert() (Jingran's Fire of Life: does its one job,
  // then removes itself the same action) still counts as having been present and paid out, so it
  // still belongs in the list; deriving this after convert() would silently drop it. Buffs only:
  // everything this member `equip()`-ped is gear (see TeamMember.equipped), and the loadout
  // popover on their own name already names all of it. Globals need no such filter — equip() only
  // ever writes to a slot, so nothing equipped can reach globalStacks.
  const activeLocal = [...slot.stacks.keys()].filter((g) => !slot.equipped.has(g));
  const activeGlobal = [...state.globalStacks.keys()];
  const activeEnemy = [...state.enemyStacks.keys()];

  for (const gear of active) { currentBuff = gear; gear.applyFn?.(); }
  for (const gear of active) { currentBuff = gear; gear.convertFn?.(); }

  // Names are generated only now, after apply()/convert() have both run — a display() reading a
  // stat one of them just contributed (Jingran's HP-based step counts) needs the final number,
  // even though the roster above was captured before either ran. `currentHeldStacks` is still the
  // same frozen map apply()/convert() just used (not re-frozen here), so a buff's own stack-count
  // display still reports the count it actually held at that point too, not whatever's left once
  // convert() may have spent it down (Fire of Life again — 0 stacks by now, were this re-frozen).
  const describe = (g: Gear): HeldBuff => {
    currentBuff = g;
    return { name: g.toString(), source: state.sourceOf.get(g) ?? "" };
  };
  const heldLocal = activeLocal.map(describe);
  const heldGlobal = activeGlobal.map(describe);
  const heldEnemy = activeEnemy.map(describe);
  currentHeldStacks = null;
  currentBuff = null;

  // A clone, not a live reference: `stat`/`plain` are closed over by the returned snapshot, which
  // callers read well after this action (display.ts's own hover panels, damage() at the end of a
  // whole rotation) — by then `slot.totals` has been through this slot's next `evaluate()` call
  // and cleared/rebuilt for a different action entirely. Snapshotting it here is what the old
  // entries-rebuilt Map did implicitly (a fresh Map every action); this keeps that same
  // immutability while still letting mid-action `get()`/`pct()` calls read the live running map.
  const totals = new Map(slot.totals);
  const plain = (k: string) => totals.get(k) ?? 0;
  // atk/hp/def stay unscoped, matching the old engine — only formula-facing stats scope.
  // BaseAtk/BaseHp/BaseDef are themselves summed entries (a resonator's own kit-base value plus
  // a weapon's own base line), not a fixed per-slot number, matching the old engine's total().
  const tags = tagsOf(action);
  const stat = (k: string) => tags.reduce((n, tag) => n + plain(scopedStat(tag, k)), plain(k));
  const base = plain(Stat.BaseAtk), baseHp = plain(Stat.BaseHp), baseDef = plain(Stat.BaseDef);

  // bank this action's own declared energy/concerto/offtune (the resonator's own baseline for
  // performing it) plus whatever AddEnergy/AddConcerto/AddOfftune a held buff contributed, into
  // the real running totals — no kit ever touches these directly, same as forte.
  slot.energy = Math.max(0, slot.energy + action.energy + stat(Stat.AddEnergy));
  slot.concerto = Math.max(0, slot.concerto + action.concerto + stat(Stat.AddConcerto));
  state.offtune = Math.max(0, state.offtune + action.offtune + stat(Stat.AddOfftune));

  // An outro spends the whole concerto bar to fire, and the liberation that precedes it spends
  // the energy — so a resonator always leaves the field empty and starts their next turn
  // rebuilding from zero. The outro row itself therefore reports 0 for both, which is the point:
  // it's the row where the bars are spent. Off-tune is the enemy's, not theirs, and carries over.
  // The negative delta that does the zeroing is captured here rather than just discarded, so
  // display.ts's own hover panel has an actual "Outro: <name> -8,956" row to show for it instead
  // of the total silently becoming 0 with nothing in the trace to explain why.
  let energySpent = 0, concertoSpent = 0;
  if (casting(Cast.Outro)) {
    energySpent = slot.energy;
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
  addForte1(action.forte1 + stat(Stat.AddForte1));
  addForte2(action.forte2 + stat(Stat.AddForte2));
  addForte3(action.forte3 + stat(Stat.AddForte3));
  addForte4(action.forte4 + stat(Stat.AddForte4));
  addForte5(action.forte5 + stat(Stat.AddForte5));

  const snapshot: ResolvedSnapshot = {
    action,
    member: slot.name,
    slot: slot.name,
    stat,
    atk: base + plain(Stat.BonusAtk) / 100 * base + plain(Stat.FlatAtk),
    hp: baseHp + plain(Stat.BonusHp) / 100 * baseHp + plain(Stat.FlatHp),
    def: baseDef + plain(Stat.BonusDef) / 100 * baseDef + plain(Stat.FlatDef),
    amp: stat(Stat.Amp),
    dmgBonus: stat(Stat.DmgBonus),
    enemyRes: enemyRes(),
    enemyDef: enemyDef(),
    entries: slot.entries,
    triggered: false,
    forte: [...slot.forte],
    energy: slot.energy, concerto: slot.concerto, offtune: state.offtune,
    energySpent, concertoSpent,
    heldLocal, heldGlobal, heldEnemy,
  };

  if (casting(Cast.Outro)) state.active = (state.active + 1) % state.slots.length;
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
  const list: { action: Action; slot?: number }[] = rotation.map((action) => ({ action }));
  let guard = 0;
  while (list.length) {
    if (++guard > 10000) throw new Error("action queue did not drain");
    const step = list.shift()!;
    const before = state.active;
    if (step.slot != null) state.active = step.slot;
    const wasEchoCast = step.action === ECHO_CAST;
    let action = step.action;
    if (wasEchoCast) {
      const mainslot = [...state.slot.stacks.keys()].find((g): g is Mainslot => g instanceof Mainslot);
      if (!mainslot) throw new Error(`${state.slot.name} casts ECHO_CAST but has no Mainslot equipped`);
      action = mainslot.action;
    } else if (action === INTRO) {
      const resonator = state.slot.resonator;
      if (!resonator) throw new Error(`${state.slot.name} casts INTRO but has no Resonator equipped`);
      // introFn reads state via the "current" pointers, same as any other kit logic — evaluate()
      // sets them again immediately after anyway, so no save/restore needed here
      currentState = state;
      currentSlot = state.slot;
      action = resonator.introFn();
    }
    pendingQueue.length = 0;
    const snapshot = evaluate(state, action);
    // "not really this resonator's own turn" rows the report dims: a follow-up the engine itself
    // queued (Phrolova's Hecate procs, Cantarella's Jolt, ...), the rotation marker standing in
    // for whichever mainslot echo is actually equipped, and an outro (a handoff, not an attack).
    snapshot.triggered = step.slot != null || wasEchoCast || action.cast === Cast.Outro || action.cast2 === Cast.Outro;
    out.push(snapshot);
    // a queued follow-up's own turn doesn't stick — restore whoever was actually active,
    // unless the follow-up was itself an outro (genuinely advances the team)
    if (step.slot != null && state.active === step.slot) state.active = before;
    if (pendingQueue.length) list.splice(0, 0, ...pendingQueue.map((p) => ({ action: p.action, slot: p.slot })));
  }
  return out;
}
