/**
 * The engine's gear as the UI sees it: plain mirrors of what the WebAssembly engine built, one
 * object per Gear id so identity holds wherever a piece turns up (a loadout's pieces, a traced
 * stat's source, a granted-by root). Only what the page reads is here — every hook lives in rust/.
 */
import { Tier } from "../engine/stats.js";
import type { Stat, EnemyStat, Tag, WeaponType, Attribute } from "../engine/stats.js";
import { call } from "../engine/wasm.js";

/** One stat line: `[stat, value]`, or `[stat, value, tag]` scoped to an element or damage type. */
export type StatLine = readonly [Stat | EnemyStat, number] | readonly [Stat | EnemyStat, number, Tag];

export interface GearJson {
  id: number; name: string; kind: string; hidden: boolean; maxStacks: number; lines: StatLine[];
  sonata2pc?: number;
  weapon?: { weaponType: WeaponType; tier: Tier; refinement: number };
  resonator?: {
    element: Attribute; color: string; tier: Tier; weapon: WeaponType; maxEnergy: number; maxForte: [number, number, number, number, number];
    talent: number | null; inherent1: number | null; inherent2: number | null; matrix: number | null;
  };
  breakdown?: [string, StatLine[]][];
}

/** Any engine Gear: its name, its constant stat lines, and what kind of piece it is. */
export class Gear {
  readonly id: number;
  readonly name: string;
  readonly kind: string;
  readonly hidden: boolean;
  readonly maxStacks: number;
  /** Its constant stat lines (a piece's `stats` and `constantStats`), in the order they add. */
  readonly lines: StatLine[];
  /** What the TS def declared: its stat lines (the loadout hovers read these). */
  readonly decl: { stats: StatLine[] };
  constructor(j: GearJson) {
    this.id = j.id;
    this.name = j.name;
    this.kind = j.kind;
    this.hidden = j.hidden;
    this.maxStacks = j.maxStacks;
    this.lines = j.lines;
    this.decl = { stats: j.lines };
  }
  toString(): string { return this.name; }
}
export class Buff extends Gear {}
export class Weapon extends Gear {
  readonly weaponType: WeaponType;
  readonly tier: Tier;
  readonly refinement: number;
  constructor(j: GearJson) {
    super(j);
    this.weaponType = j.weapon!.weaponType;
    this.tier = j.weapon!.tier;
    this.refinement = j.weapon!.refinement;
  }
}
export class Sonata extends Gear {
  private readonly sonata2pcId: number;
  constructor(j: GearJson) {
    super(j);
    this.sonata2pcId = j.sonata2pc!;
  }
  get sonata2pc(): Gear { return gearById(this.sonata2pcId); }
}
export class Mainslot extends Gear {}
export class Matrix extends Gear {}
export class Sequence extends Gear {}
export class ResonanceMode extends Gear {}
export class Resonator extends Gear {
  readonly element: Attribute;
  readonly color: string;
  readonly tier: Tier;
  readonly weapon: WeaponType;
  readonly maxEnergy: number;
  readonly maxForte: [number, number, number, number, number];
  private readonly ids: { talent: number | null; inherent1: number | null; inherent2: number | null; matrix: number | null };
  constructor(j: GearJson) {
    super(j);
    const r = j.resonator!;
    this.element = r.element;
    this.color = r.color;
    this.tier = r.tier;
    this.weapon = r.weapon;
    this.maxEnergy = r.maxEnergy;
    this.maxForte = r.maxForte;
    this.ids = { talent: r.talent, inherent1: r.inherent1, inherent2: r.inherent2, matrix: r.matrix };
  }
  get talent(): Gear | undefined { return this.ids.talent === null ? undefined : gearById(this.ids.talent); }
  get inherent1(): Gear | undefined { return this.ids.inherent1 === null ? undefined : gearById(this.ids.inherent1); }
  get inherent2(): Gear | undefined { return this.ids.inherent2 === null ? undefined : gearById(this.ids.inherent2); }
  get matrix(): Matrix | undefined { return this.ids.matrix === null ? undefined : (gearById(this.ids.matrix) as Matrix); }
}

const GEARS = new Map<number, Gear>();
/** The per-roll / per-echo breakdown of a main-stat or substat piece, for the loadout hover. */
const BREAKDOWNS = new Map<number, Buff[]>();

/** The one mirror of a Gear id, made the first time any reply names it. */
export function addGear(j: GearJson): Gear {
  const seen = GEARS.get(j.id);
  if (seen) return seen;
  const make = (): Gear => {
    switch (j.kind) {
      case "Weapon": return new Weapon(j);
      case "Sonata": return new Sonata(j);
      case "Mainslot": return new Mainslot(j);
      case "Matrix": return new Matrix(j);
      case "Sequence": return new Sequence(j);
      case "ResonanceMode": return new ResonanceMode(j);
      case "Resonator": return new Resonator(j);
      case "Buff": case "Debuff": return new Buff(j);
      default: return new Gear(j);
    }
  };
  const g = make();
  GEARS.set(j.id, g);
  if (j.breakdown) {
    BREAKDOWNS.set(j.id, j.breakdown.map(([name, stats], k) => new Buff({ id: -1 - k, name, kind: "Buff", hidden: false, maxStacks: 1, lines: stats })));
  }
  return g;
}
export function gearById(id: number): Gear {
  const g = GEARS.get(id);
  if (!g) throw new Error(`no Gear #${id} mirrored`);
  return g;
}
export const breakdownOf = (piece: Gear): Buff[] => BREAKDOWNS.get(piece.id) ?? [];

/** The resonance-chain level a build is costed at with its Sequences box shut (gear.ts's own). */
export const baseSequence = (r: Resonator): number =>
  ({ [Tier.Limited]: 0, [Tier.Standard]: 0, [Tier.Free]: 6, [Tier.FreeS2]: 2 })[r.tier];

/** One echo choice: a mainslot plus the sets it wears. */
export class EchoLoadout {
  readonly mainslot: Gear;
  readonly sonata: Gear;
  readonly sets: Gear[];
  constructor(j: { mainslot: number; sonata: number; sets: number[] }) {
    this.mainslot = gearById(j.mainslot);
    this.sonata = gearById(j.sonata);
    this.sets = j.sets.map(gearById);
  }
  pieces(): Gear[] {
    return [this.mainslot, ...this.sets, ...(this.sonata instanceof Sonata ? [this.sonata.sonata2pc] : [])];
  }
}

/** A ChemX32 (or high-investment) spread at each ER tier it comes in. */
export class ErSpread {
  readonly tiers: { rolls: number; piece: Buff }[];
  readonly noEr: Buff | null;
  constructor(j: { tiers: [number, number][]; noEr: number | null }) {
    this.tiers = j.tiers.map(([rolls, piece]) => ({ rolls, piece: gearById(piece) as Buff }));
    this.noEr = j.noEr === null ? null : (gearById(j.noEr) as Buff);
  }
  at(rolls: number): Buff {
    return (this.tiers.find((t) => t.rolls >= rolls) ?? this.tiers[this.tiers.length - 1]!).piece;
  }
}

export interface LoadoutJson {
  export: string; resonator: number; refinements: number[][]; echoLoadouts: { mainslot: number; sonata: number; sets: number[] }[];
  mainstats: number[]; substat: { tiers: [number, number][]; noEr: number | null }; highSubstat: { tiers: [number, number][]; noEr: number | null };
  sequences: number[]; minSequence: number; mode: number | null;
}

/** A resonator's real build: every weapon, echo choice and main stat its loadout may run. */
export class Loadout {
  /** The TS export this loadout was (`SHOREKEEPER`): what the roster and the engine name it by. */
  readonly export: string;
  readonly resonator: Resonator;
  readonly weapons: Weapon[];
  readonly refinements: Weapon[][];
  readonly echoLoadouts: EchoLoadout[];
  readonly mainstats: Buff[];
  readonly substat: ErSpread;
  readonly highSubstat: ErSpread;
  readonly sequences: Gear[];
  readonly minSequence: number;
  readonly mode?: Gear;
  constructor(j: LoadoutJson) {
    this.export = j.export;
    this.resonator = gearById(j.resonator) as Resonator;
    this.refinements = j.refinements.map((w) => w.map((g) => gearById(g) as Weapon));
    this.weapons = this.refinements.map((w) => w[0]!);
    this.echoLoadouts = j.echoLoadouts.map((e) => new EchoLoadout(e));
    this.mainstats = j.mainstats.map((g) => gearById(g) as Buff);
    this.substat = new ErSpread(j.substat);
    this.highSubstat = new ErSpread(j.highSubstat);
    this.sequences = j.sequences.map(gearById);
    this.minSequence = j.minSequence;
    this.mode = j.mode === null ? undefined : gearById(j.mode);
  }
  /** The substat piece this build wears at `erRolls` ER rolls. */
  spread(highSubs: boolean, erRolls: number): Buff {
    if (!highSubs) return this.substat.at(erRolls);
    return this.resonator.maxEnergy ? this.highSubstat.at(erRolls) : (this.highSubstat.noEr ?? this.highSubstat.at(0));
  }
  /** Every piece one combo equips, in equip order. */
  pieces(weapon: Weapon, echo: EchoLoadout, mainstat: Buff, sequenceLevel: number, matrix = false, highSubs = false, erRolls = 1): Gear[] {
    const r = this.resonator;
    return [
      r, r.talent, r.inherent1, r.inherent2,
      weapon, ...echo.pieces(), mainstat, this.spread(highSubs, erRolls),
      ...this.sequences.slice(0, sequenceLevel),
      this.mode,
      matrix ? r.matrix : undefined,
    ].filter((g): g is Gear => g != null);
  }
}

interface MetaJson { gears: GearJson[]; loadouts: LoadoutJson[]; enemy: number; baseResistance: number; pending: string[] }
const META = call<MetaJson>({ op: "meta" });
for (const j of META.gears) addGear(j);

/** Every loadout the engine carries, by the TS export it stood for. */
export const LOADOUTS: Record<string, Loadout> = Object.fromEntries(META.loadouts.map((j) => [j.export, new Loadout(j)]));
/** The Tune Break enemy and its Base Resistance, which the report names. */
export const ENEMY = gearById(META.enemy) as Resonator;
export const BASE_RESISTANCE_GEAR = gearById(META.baseResistance);
/** Gear a loadout lists that the engine has not ported yet (a statless stand-in). */
export const PENDING: string[] = META.pending;
