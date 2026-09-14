/**
 * Hover panels: the markup every popover is built from (stat traces, action info, held buffs,
 * damage breakdowns, loadouts, the DPR table) and `wireSourcePanels`, which opens them.
 */
import { Stat, Attribute, Type1, Type2, scopedStat, splitStat, isPercent, statLabel, TAG_NAME, NODE_NAME } from "../engine/stats.js";
import type { StatKey, Tag } from "../engine/stats.js";
import type { StatEntry } from "../engine/state.js";
import { Sonata } from "../engine/gear.js";
import type { Buff, Gear } from "../engine/gear.js";
import { menuStats } from "../engine/context.js";
import { substatRollBuffs, litStats } from "../shared/substats.js";
import { erRollsFor } from "../teamrun.js";
import { mainstatSlotBuffs } from "../shared/mainstats.js";
import { TUNE_BREAK_ENEMY } from "../shared/tunebreak.js";
import type { HeldBuff } from "../engine/state.js";
import type { ChainGroup, ResolvedSnapshot } from "../engine/evaluate.js";
import { fmt } from "../display.js";
import type { Column, TraceEntry, InfoEntry } from "../display.js";
import type { Member, Combo } from "../solver.js";
import { hitsOf } from "../teamrun.js";
import type { TeamRun } from "../teamrun.js";
import { results, FALLBACK_HUE } from "./model.js";

export const esc = (s: unknown): string => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A touch screen has no click, so nothing the page asks for is spelt as one there. The two
 *  wordings every such line is built from, settled once: the pointer cannot change mid-session. */
const coarse = matchMedia("(pointer: coarse)").matches;
export const CLICK = coarse ? "Tap" : "Click";
export const CLICKING = coarse ? "tapping" : "clicking";

/** A panel parked as its cell's `data-pop` attribute — a string the parser scans but never builds;
 *  `wireSourcePanels` parses it on first hover. Single-quoted so the markup's own `"` stay raw. */
export const lazyPop = (html: string): string => (html
  ? ` data-pop='${html.replace(/&/g, "&amp;").replace(/'/g, "&#39;")}'` : "");

/** A panel not even *built* until first hover — `buildPop()` gets the kind and key then. */
export const deferredPop = (kind: string, key: string): string => ` data-pop-kind="${kind}" data-pop-key="${esc(key)}"`;

function buildPop(kind: string, key: string): string {
  if (kind === "dpr") {
    const run = results.get(key);
    return run ? `<span class="pop dpr">${dprTable(run)}</span>` : "";
  }
  return "";
}

/** How many viewport px one page px is: under a `zoom` on `html`, rects are viewport px while
 *  clientWidth/scrollTop/style px are page px. Measured, so a zoom put back needs no change here. */
export const zoom = (): number => {
  const w = document.body.clientWidth;
  return w ? document.body.getBoundingClientRect().width / w : 1;
};
/** `getBoundingClientRect()` in page px. */
export const rect = (el: Element): DOMRect => {
  const r = el.getBoundingClientRect(), z = zoom();
  return z === 1 ? r : new DOMRect(r.x / z, r.y / z, r.width / z, r.height / z);
};

/** Open panels are parked in <body> and outlive the page they belong to. */
export const clearPops = (): void => { document.body.querySelectorAll(":scope > .pop").forEach((el) => el.remove()); };

const unit = (r: TraceEntry): string => ((r.percent ?? (r.stat !== undefined ? isPercent(r.stat) : false)) ? "%" : "");

const SECTION_ORDER = ["base", "bonus", "flat", "final"];
const SECTION_RANK = (key: string | null): number => {
  if (key === null) return -1;
  const word = key.split(" ")[0]!.toLowerCase();
  const i = SECTION_ORDER.indexOf(word);
  return i === -1 ? SECTION_ORDER.length + 1 : i;
};

export const panelRow = (r: TraceEntry, slotHue: Map<string, string>, { noSource = false }: { noSource?: boolean } = {}): string => {
  const own = r.owner !== undefined ? (slotHue.get(r.owner ?? "") ?? TUNE_BREAK_ENEMY.color) : null;
  const label = r.label ?? (r.stat !== undefined ? statLabel(r.stat) : "");
  const source = (r.count ?? 1) > 1 ? `${r.source} x${r.count}` : r.source;
  const value = `<td class="v">${r.text !== undefined ? esc(r.text)
    : r.mult ? `&times;${fmt(r.value, r.digits ?? 4)}` : `${fmt(r.value, r.digits ?? 4)}${unit(r)}`}</td>`;
  if (r.summary) return `<tr class="sum"><td class="k">${esc(label)}</td>${value}</tr>`;
  return noSource
    ? `<tr><td class="k">${esc(label)}</td>${value}</tr>`
    : `<tr><td class="s"${own ? ` style="--own:${own}"` : ""}>${esc(source || label)}</td>${value}</tr>`;
};

/** A stat column's panel: rows grouped by section, then the Total. An empty list is still a panel;
 *  only `undefined` (never traced) has none. */
export function popover(col: Column, rows: TraceEntry[] | undefined, total: number | string | null | undefined, slotHue: Map<string, string>, suffix = ""): string {
  if (!rows) return "";
  const noSource = col.key === "avg";
  const row = (r: TraceEntry) => panelRow(r, slotHue, { noSource });

  const before = rows.filter((r) => r.place === "beforeTotal");
  const after = rows.filter((r) => r.place === "afterTotal");
  const listed = rows.filter((r) => !r.place);

  const bySection = new Map<string | null, TraceEntry[]>();
  for (const r of listed) {
    const key = r.section ?? null;
    if (!bySection.has(key)) bySection.set(key, []);
    bySection.get(key)!.push(r);
  }
  const sections = [...bySection]
    .map(([key, group]) => ({ key, rows: group }))
    .sort((a, b) => SECTION_RANK(a.key) - SECTION_RANK(b.key));

  const body = sections.map(({ key, rows: group }) =>
    `<tr class="sec"><td colspan="2">${esc(key ?? col.full ?? col.label)}</td></tr>`
    + group.map(row).join("")).join("");
  const titled = sections.length ? body
    : `<tr class="sec"><td colspan="2">${esc(col.fullEmpty ?? col.full ?? col.label)}</td></tr>`;
  const sum = col.noTotal ? "" : `<tr class="sum"><td class="k">Total</td>`
    + `<td class="v">${fmt(total, col.digits ?? 0)}${col.percent ? "%" : ""}${esc(suffix)}</td></tr>`;
  return lazyPop(`<span class="pop stat${col.key === "avg" ? " damage" : ""}"><table>${titled}`
    + `${before.map(row).join("")}${sum}${after.map(row).join("")}</table></span>`);
}

export function infoPopover(info: InfoEntry[] | undefined, slotHue: Map<string, string>): string {
  if (!info?.length) return "";
  const rows = info.map((e) => {
    if (e.source !== undefined) {
      const hue = slotHue.get(e.source) ?? TUNE_BREAK_ENEMY.color;
      return `<tr><td class="s" colspan="2" style="--own:${hue}">${esc(e.label)}</td></tr>`;
    }
    return `<tr><td class="k">${esc(e.label)}</td><td class="v">${esc(e.value)}</td></tr>`;
  }).join("");
  return lazyPop(`<span class="pop info"><table>${rows}</table></span>`);
}

/** Kill switch for the Gear section of the buffs popover — code kept for a one-line flip back. */
const GEAR_SECTION_ENABLED = false;

/** The resonator-name hover in the action log: every buff held once the action resolved, in
 *  local/global/enemy columns, coloured by the kit that granted it (`State.sourceOf`). */
export function buffsPopover(member: string, gear: Gear[], local: HeldBuff[], global: HeldBuff[], enemy: HeldBuff[], slotHue: Map<string, string>): string {
  const showGear = GEAR_SECTION_ENABLED && gear.length > 0;
  if (!showGear && !local.length && !global.length && !enemy.length) {
    return lazyPop(`<span class="pop buffs"><table><tr class="sec"><td>No buffs</td></tr></table></span>`);
  }
  const order = [...slotHue.keys()];
  const rank = (b: HeldBuff) => { const i = order.indexOf(b.source); return i === -1 ? order.length : i; };
  const sorted = (buffs: HeldBuff[]) => [...buffs]
    .sort((a, b) => rank(a) - rank(b) || a.source.localeCompare(b.source) || a.name.localeCompare(b.name));
  const row = (name: string, hue: string) => `<tr><td class="s" style="--own:${hue}">${esc(name)}</td></tr>`;
  const own = slotHue.get(member) ?? FALLBACK_HUE;
  const gearSection = showGear
    ? `<tr class="sec"><td>Gear</td></tr>` + gear.map((g) => row(g.name, own)).join("")
    : "";
  const section = (heading: string, buffs: HeldBuff[]) => (buffs.length
    ? `<tr class="sec"><td>${esc(heading)}</td></tr>`
      + sorted(buffs).map((b) => row(b.name, slotHue.get(b.source) ?? TUNE_BREAK_ENEMY.color)).join("")
    : "");
  const columns = [
    gearSection + section("Local buffs", local),
    section("Global buffs", global),
    section("Enemy debuffs", enemy),
  ].filter(Boolean).map((rows) => `<table>${rows}</table>`).join("");
  return lazyPop(`<span class="pop buffs"><div class="cols">${columns}</div></span>`);
}

/* ------------------------------------------------------------------------ damage breakdown */

/** Every real hit on `slot`: a folded row is walked through its members (its own snapshot is only
 *  the last cast), spill follow-ups are lines of their own, an `aggregate` summary is skipped. */
function eachHit(lines: ChainGroup[], slot: string | null, fn: (snap: ResolvedSnapshot, avg: number) => void): void {
  const mine = (snap: ResolvedSnapshot) => slot === null || snap.slot === slot;
  for (const line of lines) {
    if (line.aggregate) continue;
    if (!line.isChain) { if (mine(line.snap)) fn(line.snap, line.avg); continue; }
    const members = new Set(line.members ?? []);
    for (const p of line.parts) if (members.has(p.snap) && mine(p.snap)) fn(p.snap, p.dmg.avg);
  }
}

/* ---------------------------------------------------------------------------------- loadout */

/** A member's equipped gear for one combo, labelled by slot — inherents, weapon, mainslot, sets,
 *  mainstat, substats. Matrix is left out: it is a filter on the resonator, not a build pick. */
export function equippedGear(member: Member, combo: Combo, erRolls = 1): [string, Gear][] {
  const l = member.loadout;
  const r = l.resonator;
  return [...(r.inherent1 ? [["Inherent", r.inherent1] as [string, Gear]] : []),
    ...(r.inherent2 ? [["Inherent", r.inherent2] as [string, Gear]] : []),
    ["Weapon", combo.weapon], ["Mainslot", combo.echo.mainslot],
    ...combo.echo.sets.map((g, i): [string, Gear] => [i === 0 ? "Sonata" : "", g]),
    ["Mainstats", combo.mainstat], ["Substats", l.spread(combo.highSubs, erRolls)]];
}

/** Dmg Bonus scope buckets for the menu stats — each keeps only its biggest line. */
const ATTRIBUTE_SCOPES = [
  Attribute.Aero, Attribute.Electro, Attribute.Fusion, Attribute.Glacio,
  Attribute.Spectro, Attribute.Havoc, Attribute.Physical,
];
const CORE_TYPE1_SCOPES = [Type1.Basic, Type1.Heavy, Type1.Skill, Type1.Liberation];
const OTHER_SCOPES = [
  Type1.Intro, Type1.Outro, Type1.Echo, Type1.Status, Type1.Break, Type1.Rupture,
  Type1.Hack, Type1.Utility,
  Type2.Coordinated, Type2.SpectroFrazzle, Type2.AeroErosion, Type2.FusionBurst,
  Type2.GlacioChafe, Type2.ElectroFlare,
];

/** The build's constant stats as the game's character screen shows them (`menuStats()`), zeros dropped. */
function menuStatRows(member: Member, combo: Combo, erRolls: number): { label: string; value: string }[] {
  const l = member.loadout;
  const entries = menuStats(l.pieces(combo.weapon, combo.echo, combo.mainstat, combo.sequence, combo.matrix !== null, combo.highSubs, erRolls));
  const totals = new Map<number, number>();
  for (const e of entries) totals.set(e.stat, (totals.get(e.stat) ?? 0) + e.value);
  const get = (key: number) => totals.get(key) ?? 0;
  const fold = (base: Stat, bonus: Stat, flat: Stat) => get(base) * (1 + get(bonus) / 100) + get(flat);

  const rows: { label: string; value: string }[] = [];
  const push = (label: string, value: number, percent: boolean) => {
    if (!value) return;
    rows.push({ label, value: `${fmt(value, percent ? 1 : 0, percent)}${percent ? "%" : ""}` });
  };
  const pushBest = (scopes: (Attribute | Type1 | Type2)[]) => {
    let bestTag: Attribute | Type1 | Type2 | null = null, bestValue = 0;
    for (const tag of scopes) {
      const v = get(scopedStat(tag, Stat.DmgBonus));
      if (v > bestValue) { bestValue = v; bestTag = tag; }
    }
    if (bestTag !== null) push(statLabel(scopedStat(bestTag, Stat.DmgBonus)), bestValue, true);
  };

  push("HP", fold(Stat.BaseHp, Stat.BonusHp, Stat.FlatHp), false);
  push("ATK", fold(Stat.BaseAtk, Stat.BonusAtk, Stat.FlatAtk), false);
  push("DEF", fold(Stat.BaseDef, Stat.BonusDef, Stat.FlatDef), false);
  push(statLabel(Stat.Er), get(Stat.Er), true);
  push(statLabel(Stat.CritRate), get(Stat.CritRate), true);
  push(statLabel(Stat.CritDmg), get(Stat.CritDmg), true);
  // Tune Break Boost is a count of points, not a percentage
  push(statLabel(Stat.Tbb), get(Stat.Tbb), false);
  pushBest(ATTRIBUTE_SCOPES);
  pushBest(CORE_TYPE1_SCOPES);
  pushBest(OTHER_SCOPES);
  return rows;
}

export const subsLabel = (combo: Combo): string => (combo.highSubs ? "High Invest" : "ChemX32");

/**
 * The display-only buffs a spread carries — one per substat roll, one per main-stat echo (see
 * shared/substats.ts and shared/mainstats.ts) — as panel rows, one per stat each declares.
 * `fold` merges identical names into an `xN` line, which is what a substat spread wants: twenty-
 * five one-stat rolls, five of them Crit Rate. A main-stat build reads echo by echo instead, so
 * two 3-cost Fusion slots stay two lines apiece.
 */
function declaredRows(buffs: Buff[], owner: string, fold: boolean, lit: StatKey[] = []): PanelRow[] {
  const rowsOf = (b: Buff): StatEntry[] => b.decl.stats.map((line) => {
    const [stat, value, tag] = line as readonly [Stat, number, Tag?];
    return { stat: tag === undefined ? stat : scopedStat(tag, stat), value, source: b.name, owner, gear: b };
  });
  if (!fold) return buffs.flatMap(rowsOf);
  // on the stats as well as the name — nothing guarantees one name is one stat, and two rolls
  // reading as one line would lose whichever of them came second
  const by = new Map<string, { rows: StatEntry[]; n: number }>();
  for (const b of buffs) {
    const rows = rowsOf(b);
    const key = `${b.name} ${rows.map((e) => e.stat).join(",")}`;
    const seen = by.get(key);
    if (seen) seen.n++;
    else by.set(key, { rows, n: 1 });
  }
  // a folded line reads what the whole spread put into that stat, the count saying how it got
  // there, and a lone roll dims as the spread's small change — except the ones the build asked for
  // at a single roll, which `lit` names (shared/substats.ts's `litStats`)
  return [...by.values()].flatMap(({ rows, n }) => rows.map((e): PanelRow =>
    ({ ...e, value: e.value * n, source: `${e.source} x${n}`,
       dim: n === 1 && !lit.includes(e.stat) })));
}

/**
 * What the buffs `pieces` put up over the run are worth, each taken at the most it ever gave.
 * Measured off the run's own trace rather than declared: a buff that stacks reads at the stacks
 * the fight actually reached, and one that never landed doesn't read at all. `State.grantedBy` is
 * what ties a buff back to the piece behind it, however many grants deep it sits.
 */
function buffStats(run: TeamRun, keep: (root: Gear, e: StatEntry, slot: string) => boolean): StatEntry[] {
  const grantedBy = run.state?.grantedBy;
  if (!grantedBy || !run.rotationLines) return [];
  // a piece that pays out of its own applyStats() — Starfield Calibrator's Skill Concerto — is
  // its own source, so it stands in for the root nothing granted it
  const rootOf = (g: Gear): Gear => grantedBy.get(g) ?? g;
  // per buff, per stat, the entry that gave the most — Map order is first-seen, so the rows come
  // out in the order the fight put the buffs up
  const peak = new Map<Gear, Map<StatKey, StatEntry>>();
  for (const section of run.rotationLines) {
    for (const line of section) {
      for (const snap of hitsOf(line)) {
        for (const e of snap.entries) {
          if (!e.gear || e.value === 0 || !keep(rootOf(e.gear), e, snap.slot)) continue;
          let byStat = peak.get(e.gear!);
          if (!byStat) peak.set(e.gear!, byStat = new Map());
          if (e.value > (byStat.get(e.stat)?.value ?? 0)) byStat.set(e.stat, e);
        }
      }
    }
  }
  return [...peak.values()].flatMap((byStat) => [...byStat.values()]);
}

/** The Stats section is what a piece grants unconditionally (`menuStats()`), so the Buffs section
 *  must not print those same lines a second time — a resonator's own base stats, a weapon's flat
 *  ATK. Keyed on the value as well, so a piece that also adds to that stat mid-fight (a threshold,
 *  a Concerto on a cast) keeps the part the Stats section never showed. */
const lineKey = (e: StatEntry): string => `${e.gear?.id} ${e.stat} ${e.value}`;
const constantKeys = (stats: StatEntry[]): Set<string> => new Set(stats.map(lineKey));

/** A panel line — a trace entry, plus `dim` for the ones a spread only rolled once. */
type PanelRow = StatEntry & { dim?: boolean };

/** One line of a loadout panel: what granted it, in that kit's own colour and left bar (the same
 *  reading a concerto or energy source gets in the action log), then the stat and the value. */
const statRow = (e: PanelRow, owner: string, slotHue: Map<string, string>, noStat = false): string => {
  const percent = isPercent(e.stat);
  // energy and concerto are fed in fractions of a point — the same two decimals their own columns
  // print in the action log, rather than a whole number that reads 31 for 30.51
  const stat = splitStat(e.stat)[0];
  const resource = stat === Stat.AddEnergy || stat === Stat.AddConcerto;
  // the cell's own member, not the entry's `owner`: every panel here is one member's piece and is
  // filtered to what that member put up, while `owner` is `State.sourceOf` — one entry per Gear, so
  // a sonata two of them wear reads as whoever equipped it last
  return `<tr class="stat${e.dim ? " one" : ""}"><td class="s" style="--own:${slotHue.get(owner) ?? FALLBACK_HUE}">${esc(e.source)}</td>`
    + (noStat ? "" : `<td class="k">${esc(statLabel(e.stat))}</td>`)
    + `<td class="v">${fmt(e.value, percent ? 1 : resource ? 2 : 0)}${percent ? "%" : ""}</td></tr>`;
};

/** A loadout cell's hover: what the pieces grant the character screen (`menuStats()`), and under
 *  it what their buffs are worth at their peak. Nothing of either — a chain node that only changes
 *  a cast — gets no panel at all. */
function piecePopover(run: TeamRun, pieces: Gear[], owner: string, slotHue: Map<string, string>): string {
  const own = new Set(pieces);
  const stats = menuStats(pieces);
  const constant = constantKeys(stats);
  const grantedOn = run.state?.grantedOn;
  const grantedBy = run.state?.grantedBy;
  // a panel over several pieces reads in their own order rather than in the order the fight
  // happened to put them up — a chain's nodes S1 first, then S2. `menuStats` already walks
  // `pieces`, so only the buffs need it; the sort is stable, so one piece's own keep fight order
  const order = new Map(pieces.map((g, i): [Gear, number] => [g, i]));
  const rank = (e: StatEntry) => order.get((e.gear ? grantedBy?.get(e.gear) : undefined) ?? e.gear!) ?? 0;
  // whose copy of the piece this is: two members wearing one sonata share the Gear, so a branch
  // written for the other one (Song of Feathered Trace's two feathers) would otherwise read on
  // both cells. A piece paying out of its own hook grants nothing, so that falls back to the slot
  // the line was actually recorded on.
  const mine = (e: StatEntry, slot: string) => (grantedOn?.get(e.gear!) ?? slot) === owner;
  const buffs = buffStats(run, (root, e, slot) => own.has(root) && !constant.has(lineKey(e)) && mine(e, slot));
  return statsPanel(stats, buffs.sort((a, b) => rank(a) - rank(b)), owner, slotHue);
}

/** The resonator's own hover, under her name: her kit's flat stats, and the buffs the kit itself
 *  brings — the ones her talents and inherents put up, plus everything her own casts do, a cast
 *  belonging to no equipped piece. Anything rooted in a piece somebody equipped is that piece's,
 *  and reads on its own cell (or on its owner's column) rather than twice. */
function resonatorPopover(run: TeamRun, kit: Set<Gear>, equipped: Set<Gear>, owner: string, slotHue: Map<string, string>): string {
  const stats = menuStats([...kit]);
  const constant = constantKeys(stats);
  // a forte gain is the kit spending its own gauge, not a stat it holds — the log's gauge columns
  // are where that is read
  const forte = (e: StatEntry) => e.stat >= Stat.AddForte1 && e.stat <= Stat.AddForte5;
  const mine = (root: Gear, e: StatEntry) =>
    e.owner === owner && (kit.has(root) || !equipped.has(root)) && !constant.has(lineKey(e)) && !forte(e);
  return statsPanel(stats, buffStats(run, mine), owner, slotHue);
}

/** `noStat` drops the middle column, for a list whose sources already name their own stat (a
 *  substat spread: "ChemX32 - Crit Dmg" beside a Crit Dmg column said it twice). */
function statsPanel(stats: PanelRow[], buffs: PanelRow[], owner: string, slotHue: Map<string, string>, heading = "Stats", noStat = false): string {
  const row = (e: PanelRow) => statRow(e, owner, slotHue, noStat);
  const cols = noStat ? 2 : 3;
  if (!stats.length && !buffs.length) return "";
  return lazyPop(`<span class="pop gear"><table>`
    + (stats.length ? `<tr class="sec"><td colspan="${cols}">${esc(heading)}</td></tr>${stats.map(row).join("")}` : "")
    + (buffs.length ? `<tr class="sec"><td colspan="${cols}">Buffs</td></tr>${buffs.map(row).join("")}` : "")
    + `</table></span>`);
}

/**
 * Loadouts: a column per member, the pieces a build is made of down the side. Each gear cell
 * hovers what that piece grants and Substats its roll spread; the Resonance Mode row carries
 * neither. The menu stats are a footer row that opens one member's whole list at a time — a
 * dozen rows of their own crowded out the pieces, and three builds rarely show the same ones.
 */
export function loadoutTable(run: TeamRun, erReq?: Map<string, string>): string {
  const erRolls = erRollsFor(run.teamKey, run.members, run.combo);
  const builds = run.members.map((m, i) => ({ member: m, combo: run.combo[i]!, erRolls: erRolls[i]! }));
  const slotHue = new Map([...run.members.map((m): [string, string] => [m.name, m.color]),
    [TUNE_BREAK_ENEMY.name, TUNE_BREAK_ENEMY.color]]);
  const kitOf = ({ member, combo }: typeof builds[number]): Set<Gear> => {
    const r = member.loadout.resonator;
    return new Set([r, r.talent, r.inherent1, r.inherent2, combo.matrix].filter((g): g is Gear => g != null));
  };
  // everything anybody on the team holds — what tells a kit's own buff (put up by a cast, which
  // nobody equips) apart from a piece's
  const equipped = new Set(builds.flatMap(({ member, combo, erRolls: n }) =>
    member.loadout.pieces(combo.weapon, combo.echo, combo.mainstat, combo.sequence, combo.matrix !== null, combo.highSubs, n)));

  // the resonator herself, under her own name: her kit's own pieces, which are every piece she
  // holds that isn't one of the build picks the rows below already list
  const head = `<div class="rtrow rthead"><div class="c lbl">Resonator</div>`
    + builds.map((b) => {
      const hover = resonatorPopover(run, kitOf(b), equipped, b.member.name, slotHue);
      return `<div class="c mem${hover ? " has" : ""}"${hover} style="--mem:${b.member.color}">${esc(b.member.name)}</div>`;
    }).join("")
    + `</div>`;
  const row = (label: string, cells: string[]): string =>
    `<div class="rtrow"><div class="c lbl">${esc(label)}</div>${cells.join("")}</div>`;
  const gearCell = (owner: string, g: Gear | null, pieces?: Gear[]): string => {
    if (!g) return `<div class="c"></div>`;
    const hover = piecePopover(run, pieces ?? [g], owner, slotHue);
    return `<div class="c${hover ? " has" : ""}"${hover}>${esc(g.name)}</div>`;
  };

  const rows: string[] = [];
  rows.push(row("Weapon", builds.map((b) => gearCell(b.member.name, b.combo.weapon))));
  rows.push(row("Mainslot", builds.map((b) => gearCell(b.member.name, b.combo.echo.mainslot))));
  // Every sonata piece the build wears, a row each — a 5pc's own 2pc half included, since
  // `EchoLoadout.pieces()` equips it separately and it carries stats of its own. As many rows as
  // the widest member needs; a member with fewer leaves the extra ones blank.
  const sonataOf = builds.map(({ combo }) => {
    const echo = combo.echo;
    return [...echo.sets, ...(echo.sonata instanceof Sonata ? [echo.sonata.sonata2pc] : [])];
  });
  const sonatas = Math.max(...sonataOf.map((list) => list.length));
  for (let i = 0; i < sonatas; i++) {
    rows.push(row(i === 0 ? "Sonata" : "", builds.map((b, k) => gearCell(b.member.name, sonataOf[k]![i] ?? null))));
  }
  // Both spreads are their own list rather than a piece plus what it granted: five echoes' own
  // main and secondary stats, and the twenty-five rolls folded by stat. All Stats — nothing here
  // is granted mid-fight — and no collapsed totals above them, which only said the same sums twice.
  const spreadCell = (piece: Buff, owner: string, stats: PanelRow[], heading: string, noStat = false): string => {
    const hover = statsPanel(stats, [], owner, slotHue, heading, noStat);
    return `<div class="c has"${hover}>${esc(piece.name)}</div>`;
  };
  rows.push(row("Mainstats", builds.map((b) =>
    spreadCell(b.combo.mainstat, b.member.name,
      declaredRows(mainstatSlotBuffs(b.combo.mainstat), b.member.name, false), "Mainstats & Secondary Stats"))));
  rows.push(row("Substats", builds.map((b) => {
    const l = b.member.loadout;
    const piece = l.spread(b.combo.highSubs, b.erRolls);
    const rolls = substatRollBuffs(piece);
    const lit = litStats(l.resonator.maxEnergy);
    return spreadCell(piece, b.member.name, declaredRows(rolls, b.member.name, true, lit),
      `Substats (${rolls.length} lines)`, true);
  })));
  // S0 is the absence of a chain, not a pick — the row only appears once somebody holds a node
  if (builds.some((b) => b.combo.sequence > 0)) {
    rows.push(row("Sequences", builds.map((b) => {
      if (!b.combo.sequence) return `<div class="c"></div>`;
      const held = b.member.loadout.sequences.slice(0, b.combo.sequence);
      const hover = piecePopover(run, held, b.member.name, slotHue);
      return `<div class="c${hover ? " has" : ""}"${hover}>${held.map((_, i) => `S${i + 1}`).join(", ")}</div>`;
    })));
  }

  if (builds.some((b) => b.member.loadout.mode)) {
    rows.push(row("Mode", builds.map((b) => gearCell(b.member.name, b.member.loadout.mode ?? null))));
  }
  // the menu stats are the row, not a hover off it: one member's whole list per cell
  rows.push(row("Menu Stats", builds.map((b) => {
    // Energy Regen says in its own label what the rotation asked of it — detail.ts renders that
    // figure, since the requirement is the run's and not the build's
    const req = erReq?.get(b.member.name);
    const stats = menuStatRows(b.member, b.combo, b.erRolls)
      .map((r) => {
        const label = r.label === statLabel(Stat.Er) && req ? `${esc(r.label)} ${req}` : esc(r.label);
        return `<tr><td class="k">${label}</td><td class="v">${esc(r.value)}</td></tr>`;
      }).join("");
    return `<div class="c menustats"><table>${stats}</table></div>`;
  })));

  return `<div class="rtable loadout" style="--cols:${builds.length}">${head}${rows.join("")}</div>`;
}

/* -------------------------------------------------------------------------------- DPR table */

/** Damage per rotation: a row per member, Tune Break and Total, over the four sections the run
 *  keeps. With `lines` (the detail page) a member's cell hovers its breakdown and the Total row's
 *  the team's top actions; the comparison table's Total DPR hover passes none (no hover inside a
 *  hover). */
export function dprTable(run: TeamRun, lines?: ChainGroup[][]): string {
  const grand = run.sectionTotals.reduce((a, b) => a + b, 0);
  const flat = lines?.flat();
  const slots = [...run.members.map((m) => m.name), TUNE_BREAK_ENEMY.name];
  const slotHue = new Map([...run.members.map((m): [string, string] => [m.name, m.color]),
    [TUNE_BREAK_ENEMY.name, TUNE_BREAK_ENEMY.color]]);
  // the four rotation sections, named once over for both the column headings and the pies' titles
  const sections = ["Opener", "Loop 1", "Loop 2", "Loop 3"];
  const ownTotal = (slot: string): number => run.sectionBySlot.reduce((a, by) => a + (by.get(slot) ?? 0), 0);
  // the row opens on the team's own Total, which is the figure the table is read for
  const selected = flat ? `${TEAM_ROW}|4` : "";
  if (lines) distCells = new Map([
    ...slots.flatMap((slot) => [...lines, lines.flat()]
      .map((sec, i): [string, DistCell] => [`${slot}|${i}`,
        distCell(sec, slot, sections[i] ?? "", slotHue.get(slot) ?? TUNE_BREAK_ENEMY.color)])),
    // the team's own row reads the rotation itself rather than one slot's share of it: one section
    // for each of the four loop columns, all four in order for the Total
    ...[...lines.map((sec) => [sec]), lines]
      .map((secs, i): [string, DistCell] => [`${TEAM_ROW}|${i}`, teamCell(secs, sections[i] ?? "", slotHue)]),
  ]);
  const head = `<div class="rtrow rthead">`
    + `<div class="c"></div>`
    + sections.map((n) => `<div class="c num">${n}</div>`).join("")
    + `<div class="c num">Total</div>`
    + `</div>`;

  // A figure is a distribution cell only on the detail page, where there is a rotation to break
  // down: `<slot>|<section>`, section 4 being the Total column. No hover panel of its own — the
  // breakdown it used to carry is the Distribution row, which a click on it opens.
  const valueCell = (sec: ChainGroup[] | undefined, value: number, key: string): string =>
    (sec
      ? `<div class="c num dist-cell${key === selected ? " sel" : ""}" data-dist="${key}">${fmt(value)}</div>`
      : `<div class="c num">${fmt(value)}</div>`);

  // a row's own label opens the same figure its Total column does, so a row can be read by its name
  const rowLabel = (slot: string, mem: string): string =>
    `<div class="c name"${mem}${lines ? ` data-dist-row="${esc(slot)}"` : ""}>${esc(slot)}</div>`;

  const dataRow = (slot: string, color: string): string => {
    const own = ownTotal(slot);
    return `<div class="rtrow">`
      + rowLabel(slot, ` style="--mem:${color}"`)
      + run.sectionBySlot.map((by, i) => valueCell(lines?.[i], by.get(slot) ?? 0, `${slot}|${i}`)).join("")
      + valueCell(flat, own, `${slot}|4`)
      + `</div>`;
  };

  const memberRows = run.members.map((m) => dataRow(m.name, m.color)).join("");
  const tuneBreakRow = dataRow(TUNE_BREAK_ENEMY.name, TUNE_BREAK_ENEMY.color);
  // the team's own figures are distribution cells like everyone else's, keyed on the row's label
  const totalRow = `<div class="rtrow total">`
    + rowLabel(TEAM_ROW, "")
    + run.sectionTotals.map((v, i) => valueCell(lines?.[i], v, `${TEAM_ROW}|${i}`)).join("")
    + valueCell(flat, grand, `${TEAM_ROW}|4`)
    + `</div>`;

  const distRow = lines ? distributionRow(selected) : "";
  // every row but the pies' to its own content, the pies to whatever height is left over — which is
  // what finishes this table level with Equipment beside it
  const tracks = lines ? ` style="grid-template-rows:repeat(${run.members.length + 3}, max-content) 1fr"` : "";
  return `<div class="rtable dpr"${tracks}>`
    + `${head}${memberRows}${tuneBreakRow}${totalRow}${distRow}</div>`;
}

/* ----------------------------------------------------------------------------- wiring */

/** The one panel the page drives itself rather than leaving to the click: the action log's
 *  avg-cell sum, shown while a block of them is dragged over (detail.ts's `wireCellSelect`).
 *  Installed by `wireSourcePanels`, which owns the placing and the single open panel. */
let driver: { show: (cell: Element, html: string) => void; hide: () => void; hold: (on: boolean) => void } | null = null;

/** Show `html` over `cell` in place of whatever that cell carries, until `dropPanel()` or the next
 *  click anywhere. Safe to call on every pointer move: it rebuilds and re-places, which is how the
 *  sum keeps up with the drag. */
export const drivePanel = (cell: Element, html: string): void => driver?.show(cell, html);
export const dropPanel = (): void => driver?.hide();
/** Shut the panels for as long as a press is down — nothing the pointer crosses mid-drag opens one
 *  (detail.ts's `wireCellSelect`), and a driven panel is still free to stand. */
export const holdPanels = (on: boolean): void => driver?.hold(on);

/**
 * Open a cell's panel on hover. A closed panel is detached and kept in `built` (only the open one
 * is ever in the document — hundreds of parked panels were re-styled on every pass). The action
 * log's cells and the Team Avg DPR cell open on a click instead, and stay open until the next
 * click elsewhere (`clickOpen`).
 */
export function wireSourcePanels(root: HTMLElement): void {
  const GAP = 4, EDGE = 6;
  let open: HTMLElement | null = null;
  let openHome: Element | null = null;
  let pinned = false;

  clearPops();
  const built = new WeakMap<Element, HTMLElement>();

  const close = (): void => {
    open?.remove();
    open = null;
    openHome = null;
    pinned = false;
  };

  const place = (cell: Element, pop: HTMLElement): void => {
    if (pop.parentElement !== document.body) document.body.appendChild(pop);
    pop.style.visibility = "hidden";
    pop.style.display = "block";
    const c = rect(cell);
    const p = rect(pop);
    const winW = innerWidth / zoom(), winH = innerHeight / zoom();
    // comparison table: off the cell's left edge, viewport-bounded. Detail page: numeric columns
    // hang off the right edge, text columns the left, clamped to the table's own left edge.
    const onTable = !!cell.closest(".tcwrap");
    const natural = !onTable && cell.classList.contains("num") ? c.right - p.width : c.left;
    const wrap = onTable ? null : cell.closest(".gridwrap");
    const tableLeft = wrap ? rect(wrap).left : EDGE;
    const minLeft = Math.max(EDGE, tableLeft);
    const left = Math.max(minLeft, Math.min(natural, winW - p.width - EDGE));
    const above = c.top - p.height - GAP;
    const below = c.bottom + GAP;
    const fitsBelow = below + p.height <= winH - EDGE;
    const top = fitsBelow ? below : Math.max(EDGE, above);
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
    pop.style.visibility = "";
    open = pop;
    openHome = cell;
  };

  /** What inside the hovered cell owns a panel: the cell itself for nearly everything, but a panel
   *  can hang off one part of a cell instead (the Energy Regen label's own figure), and then that
   *  part is what the panel is placed against. `built` is checked on the way up as well as the
   *  attributes, since building a panel takes its `data-pop` off again. */
  const homeIn = (target: Element, cell: Element): Element => {
    for (let el: Element | null = target; el && el !== cell; el = el.parentElement) {
      const data = (el as HTMLElement).dataset;
      if (built.has(el) || data?.pop !== undefined || data?.popKind !== undefined) return el;
    }
    return cell;
  };

  const panelIn = (target: EventTarget | null): { cell: Element | null; pop: HTMLElement | null } => {
    const cell = (target as Element | null)?.closest?.(".c") ?? null;
    if (!cell) return { cell: null, pop: null };
    const home = homeIn(target as Element, cell);
    if (open && openHome === home) return { cell: home, pop: open };
    const kept = built.get(home);
    if (kept) return { cell: home, pop: kept };
    const data = (home as HTMLElement).dataset;
    const markup = data?.pop ?? (data?.popKind ? buildPop(data.popKind, data.popKey ?? "") : undefined);
    if (!markup) return { cell: home, pop: null };
    const box = document.createElement("div");
    box.innerHTML = markup;
    home.removeAttribute("data-pop");
    const pop = box.firstElementChild as HTMLElement | null;
    if (pop) built.set(home, pop);
    return { cell: home, pop };
  };

  // while a driven panel stands it is the only one: the hover handlers below all stand down, and
  // nothing but `dropPanel()` or the next click takes it off the screen. `held` is the press's own
  // shutter — no panel of any kind while the pointer is down.
  let driven = false;
  let held = false;
  driver = {
    show: (cell, html) => {
      close();
      driven = true;
      const box = document.createElement("div");
      box.innerHTML = html;
      const pop = box.firstElementChild as HTMLElement | null;
      if (pop) place(cell, pop);
    },
    hide: () => {
      driven = false;
      close();
    },
    hold: (on) => {
      held = on;
      if (on) close();
    },
  };

  /** Cells whose panel waits for a click and then stays put. The whole action log reads this way:
   *  its cells are pressed and dragged over to pick a block out (detail.ts's `wireCellSelect`), and
   *  a panel opening under the pointer on the way would fight that. */
  const clickOpen = (cell: Element): boolean => !!cell.closest(".grid") || cell.classList.contains("teamdpr");

  document.addEventListener("mouseover", (e) => {
    if (driven || held || pinned) return;
    if (open && open.contains(e.target as Node)) return;
    const hovered = (e.target as Element | null)?.closest?.(".c") ?? null;
    if (hovered && clickOpen(hovered)) { if (openHome !== hovered) close(); return; }
    const { cell, pop } = panelIn(e.target);
    if (pop === open) return;
    close();
    if (pop) place(cell!, pop);
  });

  document.addEventListener("mouseout", (e) => {
    if (driven || held || pinned) return;
    const to = e.relatedTarget as Node | null;
    if (to && (root.contains(to) || (open && open.contains(to)))) return;
    close();
  });

  addEventListener("click", (e) => {
    if (held) return;
    // a driven panel (the block's sum) is read, not clicked: any click takes it off and goes no
    // further, the same way a pinned one swallows the click that closes it
    if (driven) {
      driven = false;
      close();
      return;
    }
    if (pinned) {
      if (open?.contains(e.target as Node)) return;
      const onHome = !!openHome?.contains(e.target as Node);
      close();
      if (onHome) return;
    }
    const { cell, pop } = panelIn(e.target);
    if (!cell) return;
    const onCaret = !!(e.target as Element | null)?.closest?.(".caret");
    // a group's name has no panel, so its click falls through to the row's label and expands it
    if (clickOpen(cell) && !onCaret && pop) {
      e.preventDefault();
      const same = openHome === cell;
      close();
      if (!same) { place(cell, pop); pinned = true; }
      return;
    }
    if (cell.querySelector(":scope > .caret")) close();
  });

  addEventListener("scroll", () => { if (!driven) close(); }, true);
  addEventListener("resize", () => { if (!driven) close(); });
}

/* --------------------------------------------------------------------- damage distribution */

/** One wedge of a pie. `color: null` draws no wedge at all — the node pie's own share of damage
 *  that carries no node, left as a gap in the circle rather than a slice of its own. */
interface Slice { label: string; value: number; color: string | null }
/** What one figure in the table opens under it. A resonator's own figure opens its two pies; the
 *  team's opens the rotation itself — every hit on a time axis, and the actions that led it.
 *  `section` is the loop column it stands in, empty in the Total column, which covers all four. */
type DistCell =
  | { kind: "slices"; slot: string; section: string; total: number; types: Slice[]; nodes: Slice[] }
  | { kind: "team"; section: string; total: number; bars: Bar[]; roster: Caster[]; top: TopAction[] };
/** One hit of the rotation, in the order it was cast. */
interface Bar { dmg: number; color: string }
/** One action's whole contribution to a figure, folded over every cast of it. */
interface TopAction { name: string; color: string; dmg: number; casts: number }
/** A name in the chart's own key, in the colour its bars are drawn in. */
interface Caster { name: string; color: string }
/** The label the team's own row wears, and the slot its distribution cells are keyed on — no
 *  resonator answers to it, so it can't collide with one. */
const TEAM_ROW = "Team Total";

/**
 * A slice's colour, struck off the resonator's own rather than out of a table: the biggest slice
 * wears their colour exactly, and each one after it — that is, each step round the pie — is turned
 * an even share of the wheel further on, so no two are alike however many there are. The lift
 * alternates the lightness either side of theirs on top of that, which keeps neighbours apart even
 * where the turn is small (a pie of ten) or the colour too grey for a turn to show (the enemy's).
 *
 * Full strength, the resonator's own saturation: what takes the wedges back off the page is the
 * opacity index.css draws them at — as far down as the ranking's own bands are mixed, so the two
 * panes carry one weight — which leaves the leader pointing at each one at full strength.
 */
function sliceColor(base: string, i: number, n: number): string {
  const [h, sat, l] = toHsl(base);
  const lift = i === 0 ? 0 : (i % 2 ? 8 : -8);
  return `hsl(${((h + (i * 360) / n) % 360).toFixed(1)} ${sat.toFixed(1)}%`
    + ` ${Math.min(92, Math.max(22, l + lift)).toFixed(1)}%)`;
}

/** `#rrggbb` as `[hue, saturation, lightness]` — the resonator colours are all written as hex. */
function toHsl(hex: string): [number, number, number] {
  const word = parseInt(hex.slice(1), 16);
  const r = ((word >> 16) & 255) / 255, g = ((word >> 8) & 255) / 255, b = (word & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), spread = max - min;
  const l = (max + min) / 2;
  if (!spread) return [0, 0, l * 100];
  const h = max === r ? (g - b) / spread + (g < b ? 6 : 0)
    : max === g ? (b - r) / spread + 2
      : (r - g) / spread + 4;
  return [h * 60, (spread / (1 - Math.abs(2 * l - 1))) * 100, l * 100];
}

/** Type 2 first, so a coordinated Liberation reads "Coordinated Liberation" — the Type 2 qualifies
 *  the Type 1 the way an adjective qualifies its noun, not the other way round. */
const typeLabel = (type1: Type1 | null, type2: Type2 | null): string =>
  [type2, type1].filter((t): t is Type1 | Type2 => t !== null).map((t) => TAG_NAME[t]).join(" ") || "Untyped";

/** One figure's two breakdowns. The type key is the Type 1 and Type 2 bits in one word, which is
 *  what they already are (stats.ts's tag bands) — the effective Type 1 an override left, since
 *  that is the type the hit was actually paid as. */
function distCell(lines: ChainGroup[], slot: string, section: string, hue: string): DistCell {
  const types = new Map<number, Slice>();
  const nodes = new Map<number, Slice>();
  let total = 0;
  let nodeless = 0;
  eachHit(lines, slot, (snap, avg) => {
    total += avg;
    // A status ladder carries Status on top of its own Type 2 — the Type 2 is the whole name anyone
    // reads it by, so Status drops out and the hit wears that status's own alone shade.
    const type2 = snap.action.type2;
    const type1 = snap.type === Type1.Status && type2 !== null ? null : snap.type;
    const key = (type1 ?? 0) | (type2 ?? 0);
    const type = types.get(key);
    if (type) type.value += avg;
    else types.set(key, { label: typeLabel(type1, type2), value: avg, color: "" });

    const node = snap.action.node;
    if (node === null) { nodeless += avg; return; }
    const cur = nodes.get(node);
    if (cur) cur.value += avg;
    else nodes.set(node, { label: NODE_NAME[node], value: avg, color: "" });
  });

  // a rotation marker — a swap, a start-of-combat, an intro placeholder — is a line of the log with
  // no damage and no type of its own, and has no wedge to show for it
  // biggest first, which is both the order they are drawn in and the order they are coloured in
  const ranked = (by: Map<number, Slice>): Slice[] => {
    const out = [...by.values()].filter((v) => v.value > 0).sort((a, b) => b.value - a.value);
    for (const [i, slice] of out.entries()) slice.color = sliceColor(hue, i, out.length);
    return out;
  };
  const gap: Slice[] = nodeless > 0 ? [{ label: "None", value: nodeless, color: null }] : [];
  return { kind: "slices", slot, section, types: ranked(types), nodes: [...ranked(nodes), ...gap], total };
}

/**
 * Wedges anticlockwise from twelve o'clock, colour alone dividing them, every one named off a
 * leader that runs out at the wedge's own angle and turns horizontal at the rail. The biggest is
 * drawn first, so it is the one that opens to the left. Swept over the cell's
 * whole total rather than over the slices, so a node pie whose slices fall short of it leaves the
 * rest of the circle unpainted — and that open share is led out and named like any other.
 *
 * A wedge and its own leader are one group: hovering the wedge slides the wedge out, and the
 * leader redraws with only its rim end following — the far end stays pinned to its label, so the
 * line stretches rather than sliding off the words it points at.
 */
function pieSvg(slices: Slice[], total: number): string {
  // Sized to the half of the row it gets, so it draws at very near 1:1 rather than being scaled
  // down into it — wide enough that a leader's label clears the pie beside it (index.css pays for
  // that width by holding the row to a minimum, which is what sets the table's own width).
  // One frame for every pie on the team, not one sized to each member's own labels: a frame that
  // grew with the longest label drew the same pie at anything from 77 to 126 real pixels depending
  // on who was selected, and moved its title with it. `rail` is the room each side is given for a
  // label — enough for the longest that can't be wrapped ("Liberation (74.9%)") — and the rest of
  // the frame is the pie, which is therefore the same size for everyone.
  // The share drops under its own name rather than running on after it, which is what keeps the
  // frame near the shape of the space it is drawn into: a rail wide enough for "Liberation (78.6%)"
  // on one line made the frame twice as wide as it was tall, so it scaled to the pane's width and
  // left the height under it empty. Stacked, the frame is about 8:5 like the pane, and the same
  // pane draws it half again as big.
  // The label type is the svg's own, so the rail below is measured in the size the labels are
  // actually set in — sans runs about 0.515em a glyph, the mono share about 0.6 — rather than
  // against a size index.css could drift away from.
  const font = 20, glyph = font * 0.515, mono = font * 0.6;
  // the rail holds the longest line a wrap can leave standing, and the share under it
  const rail = Math.ceil(Math.max(11 * glyph, 8 * mono));
  const r = 120, lead = 28, lh = Math.round(font * 1.06), pitch = lh + 4;
  const width = 2 * (rail + r + lead + 19);
  // Cut to the shape of the half-row it is drawn into (about 8:5), not to the tallest label stack
  // that could ever turn up: sized off the stack the frame came out twice as deep as the pane and
  // the row grew to hold the empty part. At this depth a column still takes seven labels, where the
  // most any figure has actually shown is four.
  const height = Math.max(2 * r + 34, Math.round(width * 0.6));
  const cx = width / 2;
  const cy = height / 2;
  const f = (n: number): string => n.toFixed(2);
  const pct = (s: Slice): string => `(${(s.value / total * 100).toFixed(1)}%)`;

  // A label long enough to widen the frame reads on two lines instead of one long rail — the rail
  // is the whole of what the frame has to be wide enough for, so wrapping "Coordinated Liberation"
  // is what buys the pie beside it its own room. Split where the longer of the two lines comes out
  // shortest; a single word has nowhere to break and stays as it is.
  const wrapAt = 11;
  const linesOf = (label: string): string[] => {
    const words = label.split(" ");
    if (label.length <= wrapAt || words.length < 2) return [label];
    let best: string[] = [label], widest = Infinity;
    for (let i = 1; i < words.length; i++) {
      const pair = [words.slice(0, i).join(" "), words.slice(i).join(" ")];
      const longest = Math.max(...pair.map((t) => t.length));
      if (longest < widest) { widest = longest; best = pair; }
    }
    return best;
  };

  // Where a wedge that far round the pie sits: twelve o'clock turned an eighth of a turn — 45° —
  // clockwise, and anticlockwise from there, so the biggest wedge opens to the left of it.
  const angle = (turn: number): number => (1 / 8 - 0.25 - turn) * Math.PI * 2;

  // where each wedge starts, and the angle its own leader runs out at
  let turn = 0;
  const arcs = slices.map((s) => {
    const from = turn;
    const share = s.value / total;
    turn += share;
    const a = angle(from + share / 2);
    // how far out of the circle this one slides when it is hovered, straight down its own angle
    return { s, from, share, a, ox: Math.cos(a) * 7, oy: Math.sin(a) * 7, side: Math.cos(a) >= 0 ? 1 : -1, y: 0 };
  });

  // a label's own lines: its name, wrapped where it has to be, and its share under it
  const linesFor = (s: Slice): string[] => [...linesOf(s.label), pct(s)];
  const boxH = (l: (typeof arcs)[number]): number => linesFor(l.s).length * lh;
  const point = (a: number, rad: number): [number, number] => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];

  // labels down each side in the order their wedges stand, pushed apart to the pitch off the top
  // and then held off the floor — so a run of thin slices spreads rather than piling up
  for (const side of [1, -1]) {
    const column = arcs.filter((l) => l.side === side).sort((a, b) => Math.sin(a.a) - Math.sin(b.a));
    // `y` is the middle of the label's own box, one line tall or two, so each pass walks the box's
    // near edge and leaves `pitch - lh` of air between one box and the next
    let ceiling = 10;
    for (const l of column) {
      const half = boxH(l) / 2;
      l.y = Math.max(cy + (r + lead - 10) * Math.sin(l.a), ceiling + half);
      ceiling = l.y + half + (pitch - lh);
    }
    let floor = height - 10;
    for (const l of [...column].reverse()) {
      const half = boxH(l) / 2;
      l.y = Math.min(l.y, floor - half);
      floor = l.y - half - (pitch - lh);
    }
  }

  const wedge = ({ s, from, share }: (typeof arcs)[number]): string => {
    if (s.color === null) return "";
    // stroked in its own colour as well as filled: the fill is faint, and index.css lights that
    // stroke up when the wedge is hovered
    const paint = ` fill="${s.color}" stroke="${s.color}"`;
    if (share > 0.999) return `<circle class="wedge" cx="${cx}" cy="${f(cy)}" r="${r}"${paint}/>`;
    const [x0, y0] = point(angle(from), r);
    const [x1, y1] = point(angle(from + share), r);
    // sweep 0: the arc runs the way the angles do, which here is anticlockwise
    return `<path class="wedge" d="M${cx},${f(cy)} L${f(x0)},${f(y0)}`
      + ` A${r},${r} 0 ${share > 0.5 ? 1 : 0},0 ${f(x1)},${f(y1)} Z"${paint}/>`;
  };

  // One curve rather than a bend: it leaves the rim at the wedge's own angle and eases round to
  // meet the rail level, so a label pushed well off its natural line still reads as pointing at its
  // own slice. The two handles are what hold those two tangents.
  //
  // `--d-out` is the same curve with its rim end — and the handle holding that end's tangent —
  // moved out by the wedge's own offset; index.css swaps to it on hover, and the two interpolate
  // because they are the same two commands either way.
  const leader = ({ s, a, side, y, ox, oy }: (typeof arcs)[number]): string => {
    const [px, py] = point(a, r);
    const [bx, by] = point(a, r + lead - 14);
    const out = cx + side * (r + lead);
    const tail = `${f(out - side * 30)},${f(y)} ${f(out)},${f(y)}`;
    const curve = (dx: number, dy: number): string =>
      `M${f(px + dx)},${f(py + dy)} C${f(bx + dx)},${f(by + dy)} ${tail}`;
    return `<path class="leader" d="${curve(0, 0)}" style="--d-out:path('${curve(ox, oy)}')"`
      + ` fill="none" stroke="${s.color ?? "var(--faint)"}" stroke-width="2" stroke-linecap="round"/>`;
  };

  const groups = arcs.map((arc) => `<g class="slice" style="--ox:${f(arc.ox)}px;--oy:${f(arc.oy)}px">`
    + `${wedge(arc)}${leader(arc)}</g>`).join("");

  // Every line carries the rail's own `x`, which is what starts it as a chunk of its own — without
  // it a second line would run on from where the first ended rather than sitting under it.
  const labels = arcs.map(({ s, side, y }) => {
    const at = cx + side * (r + lead);
    const x = f(at + side * 7);
    const lines = linesFor(s);
    const last = lines.length - 1;
    const top = y - (last * lh) / 2;
    return `<text text-anchor="${side > 0 ? "start" : "end"}" dominant-baseline="middle">`
      + lines.map((t, i) => `<tspan class="${i === last ? "pc" : "nm"}" x="${x}"`
        + ` y="${f(top + i * lh)}">${esc(t)}</tspan>`).join("")
      + `</text>`;
  }).join("");

  return `<svg class="pie" viewBox="0 0 ${width} ${f(height)}" font-size="${font}" role="img">${groups}${labels}</svg>`;
}

const pieFigure = (heading: string, slices: Slice[], total: number): string =>
  `<figure class="piefig"><figcaption>${esc(heading)}</figcaption>${pieSvg(slices, total)}</figure>`;

/**
 * The team's own figure: every hit of the sections it covers, in cast order and in its caster's
 * colour, plus the same hits ranked by the action they came from.
 */
function teamCell(sections: ChainGroup[][], section: string, slotHue: Map<string, string>): DistCell {
  const bars: Bar[] = [];
  const by = new Map<string, TopAction>();
  let total = 0;
  sections.forEach((lines) => {
    eachHit(lines, null, (snap, avg) => {
      // A swap, a start of combat, a field going up, a triggered line that lands nothing: an action
      // of the log with no damage to show. It takes no slot on the axis either — a run of them is
      // what used to read as a hole in the chart.
      if (avg <= 0) return;
      total += avg;
      const color = slotHue.get(snap.slot) ?? TUNE_BREAK_ENEMY.color;
      bars.push({ dmg: avg, color });
      // a dash-cancel, a swap-out and a Unison outro are the same press as the cast they came from,
      // so they rank with it rather than as a form of their own
      let act = snap.action;
      while (act.cancelOf ?? act.formOf) act = act.cancelOf ?? act.formOf!;
      const key = `${snap.slot} ${act.name}`;
      const cur = by.get(key) ?? { name: act.name, color, dmg: 0, casts: 0 };
      cur.dmg += avg;
      cur.casts++;
      by.set(key, cur);
    });
  });
  const top = [...by.values()].sort((a, b) => b.dmg - a.dmg);
  // the whole roster, not just who happened to land a hit here — the key reads the same either way
  const roster = [...slotHue].map(([name, color]): Caster => ({ name, color }));
  return { kind: "team", section, total, bars, roster, top };
}

/** Every hit in the order it was cast, one bar each — the shape of the rotation rather than a
 *  total. Nothing is named on it: the bars are read against each other and against the key under
 *  them, not off a scale. */
function barChart(bars: Bar[]): string {
  const width = 480, height = 210, left = 2, right = 2, top = 10, foot = 12;
  const plotW = width - left - right, plotH = height - top - foot;
  const f = (n: number): string => n.toFixed(2);
  const peak = Math.max(...bars.map((b) => b.dmg));
  const slot = plotW / bars.length;
  const rects = bars.map((b, i) => {
    const h = (b.dmg / peak) * plotH;
    return `<rect x="${f(left + i * slot)}" y="${f(top + plotH - h)}"`
      + ` width="${f(Math.max(slot * 0.9, 0.6))}" height="${f(h)}" fill="${b.color}"/>`;
  }).join("");
  // Drawn to whatever box the pane leaves rather than to its own ratio — the key is pinned under
  // it, and a chart held to 480:210 left the gap between the two empty. Nothing here is a shape
  // that stretching would lie about: the bars are the figures, and the axis holds its own weight
  // (`non-scaling-stroke`) instead of thickening with the box.
  return `<svg class="bars" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img">`
    + `<line class="axis" vector-effect="non-scaling-stroke" x1="${left}" y1="${top + plotH}" x2="${width - right}" y2="${top + plotH}"/>`
    + rects
    + `</svg>`;
}

/** Who each colour in the chart is, spread evenly under it — `--keys` is how many columns the row
 *  is split into, since a two-member team is two rather than four. */
const barKey = (roster: Caster[]): string => `<ul class="barkey" style="--keys:${roster.length}">`
  + `${roster.map((c) => `<li><span class="dot" style="background:${c.color}"></span>${esc(c.name)}</li>`).join("")}</ul>`;

/** The whole ranking, every action of it. Each row's band runs `--fill` of the way across, its
 *  damage against the leader's — so the top action's band is the full width and the rest read off
 *  it. How much of the list is actually shown is the row's own height to decide: `fitTopActions`
 *  cuts it to what fits once the page has laid it out, and it is laid out absolutely inside
 *  `.topwrap` (index.css) so its own length never sets that height. */
const topActions = (top: TopAction[], total: number): string => `<div class="topwrap"><ol class="topacts">${top.map((a) =>
  `<li style="--own:${a.color};--fill:${((a.dmg / (top[0]?.dmg ?? a.dmg)) * 100).toFixed(2)}%">`
  + `<span class="nm">${esc(a.name)}${a.casts > 1 ? ` x${a.casts}` : ""}</span>`
  + `<span class="v">${fmt(a.dmg)} <span class="pct">(${Math.round((a.dmg / total) * 100)}%)</span></span></li>`,
).join("")}</ol></div>`;

function distBody(cell: DistCell | undefined): string {
  if (!cell || cell.total <= 0) return `<div class="pies"><p class="nodist">No damage in this section.</p></div>`;
  const section = cell.section ? ` (${cell.section})` : "";
  if (cell.kind === "team") {
    return `<div class="teampanes">`
      + `<figure class="piefig"><figcaption>Damage Over Time${section}</figcaption>`
      + `${barChart(cell.bars)}${barKey(cell.roster)}</figure>`
      + `<figure class="piefig"><figcaption>Strongest Actions${section}</figcaption>`
      + `${topActions(cell.top, cell.total)}</figure></div>`;
  }
  return `<div class="pies">${pieFigure(`${cell.slot} Damage Distribution${section}`, cell.types, cell.total)}`
    + `${pieFigure(`${cell.slot} Node Priority${section}`, cell.nodes, cell.total)}</div>`;
}

/** Every figure's breakdown, keyed `<slot>|<section>` with section 4 the Total column. Filled in by
 *  the last `dprTable` that had a rotation to read — the detail page's own, the comparison table's
 *  hover passing none — and read back by `wireDistribution` when a figure is clicked. */
let distCells = new Map<string, DistCell>();

/** The row itself, already showing the figure `selected` names — one cell across the whole table,
 *  the two pies splitting it down the middle. */
const distributionRow = (selected: string): string =>
  `<div class="rtrow dist"><div class="c distbody">${distBody(distCells.get(selected))}</div></div>`;

/** Strongest Actions is rendered whole and then cut to the rows the row's own height has space for,
 *  so none of them is ever left half-clipped. Every bottom is measured before anything is hidden —
 *  hiding one closes the gap under it, which would move the next one back inside the floor. */
function fitTopActions(body: HTMLElement): void {
  const list = body.querySelector<HTMLElement>(".topacts");
  if (!list) return;
  const items = [...list.children] as HTMLElement[];
  for (const li of items) li.hidden = false;
  const floor = list.getBoundingClientRect().bottom;
  for (const li of items.filter((el) => el.getBoundingClientRect().bottom > floor + 0.5)) li.hidden = true;
}

/** Watches the Distribution row so the ranking is re-cut when Equipment beside it changes what
 *  height the row has. One observer, re-pointed on every render rather than stacked up. */
let rowObserver: ResizeObserver | null = null;

/** Clicking any figure in the table swaps the row to it; the selected one keeps the outline. */
export function wireDistribution(root: HTMLElement): void {
  const table = root.querySelector<HTMLElement>(".rtable.dpr");
  const body = root.querySelector<HTMLElement>(".c.distbody");
  if (!table || !body) return;
  table.addEventListener("click", (e) => {
    const hit = (e.target as Element | null)?.closest<HTMLElement>(".c[data-dist], .c[data-dist-row]");
    if (!hit) return;
    // a row's label carries no figure of its own — it stands for that row's Total, and the outline
    // goes on the Total cell, exactly as if that were what had been clicked
    const key = hit.dataset.dist ?? `${hit.dataset.distRow}|4`;
    const cell = table.querySelector(`.c[data-dist="${key}"]`);
    for (const c of table.querySelectorAll(".c[data-dist]")) c.classList.toggle("sel", c === cell);
    body.innerHTML = distBody(distCells.get(key));
    fitTopActions(body);
  });
  rowObserver?.disconnect();
  rowObserver = new ResizeObserver(() => fitTopActions(body));
  rowObserver.observe(body);
}
