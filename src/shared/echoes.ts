/**
 * A loadout's echoes: the set picks (a mainslot and its sonatas), the main-stat builds and both
 * substat spreads, and the five echoes one combination of them makes. Each echo is a piece of gear
 * of its own wearing its main stat, its secondary and the substats dealt to it, so its ATK%/HP%/DEF%
 * is one panel entry, floored once (context.ts's `panelEntry`).
 */
import { Gear, EchoLoadout, Mainslot } from "../engine/gear.js";
import type { StatLine } from "../engine/gear.js";
import { addStat, asSource, panelEntry } from "../engine/context.js";
import { scopedStat } from "../engine/stats.js";
import type { Stat, StatKey, Tag } from "../engine/stats.js";
import { MainstatBuild, costOf, mainLines, slotName } from "./mainstats.js";
import { ErSpread, Spread, rollLine } from "./substats.js";

/** One echo of a build: constant stats only, each line traced to the piece it belongs to — its main
 *  stat to the build, its substats to the spread, the mainslot's own to the mainslot. */
export class Echo extends Gear {
  /** The build's and the spread's own source pieces (`sourceOf`): never equipped, only traced to. */
  sources: Gear[] = [];
}

/** The piece a build's main stats or a spread's substats trace to, under its own name — one apiece. */
const SOURCES = new WeakMap<MainstatBuild | Spread, Gear>();
function sourceOf(of: MainstatBuild | Spread): Gear {
  let gear = SOURCES.get(of);
  if (!gear) SOURCES.set(of, (gear = new Gear({ name: of.name })));
  return gear;
}

export interface EchoesDef {
  /** Every set pick the loadout may wear, a mainslot apiece. */
  sets: EchoLoadout[];
  /** Every main-stat build (mainstats.ts's `mainstatOptions()`). */
  mainstats: MainstatBuild[];
  /** Every ER tier of the ChemX32 spread (substats.ts's `substats()`). */
  substats: ErSpread;
  /** Worn instead of `substats` when that role's High Invest Substats box is on. */
  highSubstats: ErSpread;
}

export class Echoes {
  sets: EchoLoadout[];
  mainstats: MainstatBuild[];
  substat: ErSpread;
  highSubstat: ErSpread;
  constructor(def: EchoesDef) {
    this.sets = def.sets;
    this.mainstats = def.mainstats;
    this.substat = def.substats;
    this.highSubstat = def.highSubstats;
  }

  /** Whether `build` can be worn on `set`: it has an echo of the mainslot's cost for the mainslot to
   *  be, and no more 4-cost echoes than the sets have distinct 4-costs between them. */
  fits(set: EchoLoadout, build: MainstatBuild): boolean {
    let bySet = this.fitMade.get(set);
    if (!bySet) this.fitMade.set(set, (bySet = new Map()));
    let fit = bySet.get(build);
    if (fit === undefined) {
      fit = build.slots.some((key) => costOf(key) === set.mainslot.cost)
        && build.slots.filter((key) => costOf(key) === 4).length <= set.fours;
      bySet.set(build, fit);
    }
    return fit;
  }
  /** `fits()` answers, made once per pair. */
  private readonly fitMade = new Map<EchoLoadout, Map<MainstatBuild, boolean>>();

  /** Everything `set` worn over `build` and `spread` equips: the mainslot, the sonatas, five echoes. */
  pieces(set: EchoLoadout, build: MainstatBuild, spread: Spread): Gear[] {
    return [...set.pieces(), ...this.worn(set, build, spread)];
  }

  /** The five echoes alone, highest cost first. */
  worn(set: EchoLoadout, build: MainstatBuild, spread: Spread): Echo[] {
    return echoesOf(build, spread, set.mainslot);
  }
}

/** Per build, spread and mainslot, its five echoes — made once, so every run wears the same pieces. */
const ECHOES = new WeakMap<MainstatBuild, WeakMap<Spread, Map<Mainslot, Echo[]>>>();
function echoesOf(build: MainstatBuild, spread: Spread, mainslot: Mainslot): Echo[] {
  let bySpread = ECHOES.get(build);
  if (!bySpread) ECHOES.set(build, (bySpread = new WeakMap()));
  let bySlot = bySpread.get(spread);
  if (!bySlot) bySpread.set(spread, (bySlot = new Map()));
  let made = bySlot.get(mainslot);
  if (made) return made;

  const at = build.slots.findIndex((key) => costOf(key) === mainslot.cost);
  if (at < 0) throw new Error(`${mainslot.name} is a ${mainslot.cost}-cost and ${build.name} has no slot for it`);
  // the rolls dealt round the five in order, a stat's together: no echo holds two of one stat
  const subs: StatLine[][] = build.slots.map(() => []);
  const order = [...new Set(spread.rolls.map(([s]) => s))];
  let next = 0;
  for (const s of order) {
    const rolls = spread.rolls.filter(([r]) => r === s);
    if (rolls.length > subs.length) throw new Error(`${spread.name}: ${rolls.length} rolls of one substat over ${subs.length} echoes`);
    for (const [, value] of rolls) subs[next++ % subs.length]!.push(rollLine(s, value));
  }
  const asMain = sourceOf(build), asSubs = sourceOf(spread);
  made = build.slots.map((key, i) => {
    const main = summed(mainLines(key)), rolled = summed(subs[i]!);
    const own = i === at ? mainslot.echoStatsFn : undefined;
    const add = (lines: StatLine[]) => () => {
      for (const [stat, value, tag] of lines) addStat(stat as Stat, value, tag);
    };
    const echo = new Echo({
      name: slotName(key),
      constantStats: () => panelEntry(() => {
        asSource(asMain, add(main));
        asSource(asSubs, add(rolled));
        if (own) asSource(mainslot, own);
      }),
    });
    echo.sources = [asMain, asSubs];
    return echo;
  });
  bySlot.set(mainslot, made);
  return made;
}

/** Lines of one stat and scope added together, in first-seen order. */
function summed(lines: StatLine[]): StatLine[] {
  const by = new Map<StatKey, [Stat, number, Tag | undefined]>();
  for (const [stat, value, tag] of lines) {
    const key = tag === undefined ? stat : scopedStat(tag, stat);
    const seen = by.get(key);
    if (seen) seen[1] += value;
    else by.set(key, [stat as Stat, value, tag]);
  }
  return [...by.values()].map(([stat, value, tag]) => (tag === undefined ? [stat, value] : [stat, value, tag]));
}
