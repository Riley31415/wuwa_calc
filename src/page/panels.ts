/**
 * Hover panels: the markup every popover is built from (stat traces, action info, held buffs,
 * damage breakdowns, loadouts, the DPR table) and `wireSourcePanels`, which opens them.
 */
import { Stat, Attribute, Type1, Type2, scopedStat, isPercent, statLabel, TAG_NAME, NODE_NAME } from "../engine/stats.js";
import type { StatKey, Tag } from "../engine/stats.js";
import type { StatEntry } from "../engine/state.js";
import { Sonata } from "../engine/gear.js";
import type { Buff, Gear } from "../engine/gear.js";
import { menuStats } from "../engine/context.js";
import { substatRollBuffs } from "../shared/substats.js";
import { mainstatSlotBuffs } from "../shared/mainstats.js";
import type { Action } from "../engine/rotation.js";
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

function sumByTag(lines: ChainGroup[], slot: string, keyOf: (a: Action) => number | null): Map<number, number> {
  const by = new Map<number, number>();
  eachHit(lines, slot, (snap, avg) => {
    const key = keyOf(snap.action);
    if (key != null) by.set(key, (by.get(key) ?? 0) + avg);
  });
  return by;
}

function breakdownSection(heading: string, by: Map<number, number>, total: number, label: (k: number) => string): string {
  if (!by.size) return "";
  const rows = [...by].sort((a, b) => b[1] - a[1]);
  const body = rows.map(([k, v]) => {
    const pct = total ? Math.round((v / total) * 100) : 0;
    return `<tr><td class="k">${esc(label(k))}</td><td class="v">${fmt(v)} <span class="pct">(${pct}%)</span></td></tr>`;
  }).join("");
  return `<tr class="sec"><td colspan="2">${esc(heading)}</td></tr>${body}`;
}

/** The Total row's hover: the ten actions that contributed most across the whole team, with cast
 *  counts. Each row wears its caster's colour and left bar, the way a concerto or energy source
 *  reads in the action log (`panelRow`) — one ranking rather than a per-member seven each. */
function teamActionPopover(lines: ChainGroup[], total: number, slotHue: Map<string, string>): string {
  const by = new Map<string, { dmg: number; n: number; slot: string; name: string }>();
  eachHit(lines, null, (snap, avg) => {
    // a dash-cancel, a swap-out and a Unison outro are the same press as the cast they came from,
    // so they rank with it rather than as a form of their own
    let act = snap.action;
    while (act.cancelOf ?? act.formOf) act = act.cancelOf ?? act.formOf!;
    const key = `${snap.slot} ${act.name}`;
    const cur = by.get(key) ?? { dmg: 0, n: 0, slot: snap.slot, name: act.name };
    cur.dmg += avg; cur.n++;
    by.set(key, cur);
  });
  if (!by.size) return "";
  const rows = [...by.values()].sort((a, b) => b.dmg - a.dmg).slice(0, 10).map((v) => {
    const pct = total ? Math.round((v.dmg / total) * 100) : 0;
    const hue = slotHue.get(v.slot) ?? TUNE_BREAK_ENEMY.color;
    return `<tr><td class="s" style="--own:${hue}">${esc(v.name)}${v.n > 1 ? ` x${v.n}` : ""}</td>`
      + `<td class="v">${fmt(v.dmg)} <span class="pct">(${pct}%)</span></td></tr>`;
  }).join("");
  return lazyPop(`<span class="pop breakdown"><table>`
    + `<tr class="sec"><td colspan="2">Top Actions</td></tr>${rows}</table></span>`);
}

function damagePopover(lines: ChainGroup[], slot: string, total: number, grandTotal: number): string {
  const tagName = (k: number) => TAG_NAME[k as keyof typeof TAG_NAME];
  const body = breakdownSection("Node", sumByTag(lines, slot, (a) => a.node), total, (k) => NODE_NAME[k as keyof typeof NODE_NAME])
    + breakdownSection("Type 1", sumByTag(lines, slot, (a) => a.type1), total, tagName)
    + breakdownSection("Type 2", sumByTag(lines, slot, (a) => a.type2), total, tagName);
  const pct = grandTotal ? Math.round((total / grandTotal) * 100) : 0;
  return lazyPop(`<span class="pop breakdown"><table>${body}`
    + `<tr class="sum"><td class="k">Total</td><td class="v">${fmt(total)} <span class="pct">(${pct}% of team)</span></td></tr>`
    + `</table></span>`);
}

/* ---------------------------------------------------------------------------------- loadout */

/** A member's equipped gear for one combo, labelled by slot — inherents, weapon, mainslot, sets,
 *  mainstat, substats. Matrix is left out: it is a filter on the resonator, not a build pick. */
export function equippedGear(member: Member, combo: Combo): [string, Gear][] {
  const l = member.loadout;
  const r = l.resonator;
  return [...(r.inherent1 ? [["Inherent", r.inherent1] as [string, Gear]] : []),
    ...(r.inherent2 ? [["Inherent", r.inherent2] as [string, Gear]] : []),
    ["Weapon", combo.weapon], ["Mainslot", combo.echo.mainslot],
    ...combo.echo.sets.map((g, i): [string, Gear] => [i === 0 ? "Sonata" : "", g]),
    ["Mainstats", combo.mainstat], ["Substats", combo.highSubs ? l.highSubstat : l.substat]];
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
function menuStatRows(member: Member, combo: Combo): { label: string; value: string }[] {
  const l = member.loadout;
  const entries = menuStats(l.pieces(combo.weapon, combo.echo, combo.mainstat, combo.sequence, combo.matrix !== null, combo.highSubs));
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
function declaredRows(buffs: Buff[], owner: string, fold: boolean): PanelRow[] {
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
  // a folded line reads what the whole spread put into that stat, the count saying how it got there
  return [...by.values()].flatMap(({ rows, n }) => rows.map((e): PanelRow =>
    ({ ...e, value: e.value * n, source: n > 1 ? `${e.source} x${n}` : e.source, dim: n === 1 })));
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
const statRow = (e: PanelRow, owner: string, slotHue: Map<string, string>, noStat = false): string =>
  // the cell's own member, not the entry's `owner`: every panel here is one member's piece and is
  // filtered to what that member put up, while `owner` is `State.sourceOf` — one entry per Gear, so
  // a sonata two of them wear reads as whoever equipped it last
  `<tr class="stat${e.dim ? " one" : ""}"><td class="s" style="--own:${slotHue.get(owner) ?? FALLBACK_HUE}">${esc(e.source)}</td>`
  + (noStat ? "" : `<td class="k">${esc(statLabel(e.stat))}</td>`)
  + `<td class="v">${fmt(e.value, isPercent(e.stat) ? 1 : 0)}${isPercent(e.stat) ? "%" : ""}</td></tr>`;

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
export function loadoutTable(run: TeamRun): string {
  const builds = run.members.map((m, i) => ({ member: m, combo: run.combo[i]! }));
  const slotHue = new Map([...run.members.map((m): [string, string] => [m.name, m.color]),
    [TUNE_BREAK_ENEMY.name, TUNE_BREAK_ENEMY.color]]);
  const kitOf = ({ member, combo }: typeof builds[number]): Set<Gear> => {
    const r = member.loadout.resonator;
    return new Set([r, r.talent, r.inherent1, r.inherent2, combo.matrix].filter((g): g is Gear => g != null));
  };
  // everything anybody on the team holds — what tells a kit's own buff (put up by a cast, which
  // nobody equips) apart from a piece's
  const equipped = new Set(builds.flatMap(({ member, combo }) =>
    member.loadout.pieces(combo.weapon, combo.echo, combo.mainstat, combo.sequence, combo.matrix !== null, combo.highSubs)));

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
    const piece = b.combo.highSubs ? b.member.loadout.highSubstat : b.member.loadout.substat;
    const rolls = substatRollBuffs(piece);
    return spreadCell(piece, b.member.name, declaredRows(rolls, b.member.name, true), `Substats (${rolls.length} lines)`, true);
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
    const stats = menuStatRows(b.member, b.combo)
      .map((r) => `<tr><td class="k">${esc(r.label)}</td><td class="v">${esc(r.value)}</td></tr>`).join("");
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

  const head = `<div class="rtrow rthead">`
    + `<div class="c"></div>`
    + `<div class="c num">Opener</div><div class="c num">Loop 1</div>`
    + `<div class="c num">Loop 2</div><div class="c num">Loop 3</div>`
    + `<div class="c num">Total</div>`
    + `</div>`;

  const valueCell = (sec: ChainGroup[] | undefined, slot: string, value: number, total: number): string =>
    (sec
      ? `<div class="c num has"${damagePopover(sec, slot, value, total)}>${fmt(value)}</div>`
      : `<div class="c num">${fmt(value)}</div>`);

  const dataRow = (slot: string, color: string): string => {
    const own = run.sectionBySlot.reduce((a, by) => a + (by.get(slot) ?? 0), 0);
    return `<div class="rtrow">`
      + `<div class="c name" style="--mem:${color}">${esc(slot)}</div>`
      + run.sectionBySlot.map((by, i) => valueCell(lines?.[i], slot, by.get(slot) ?? 0, run.sectionTotals[i]!)).join("")
      + valueCell(flat, slot, own, grand)
      + `</div>`;
  };

  const memberRows = run.members.map((m) => dataRow(m.name, m.color)).join("");
  const tuneBreakRow = dataRow(TUNE_BREAK_ENEMY.name, TUNE_BREAK_ENEMY.color);
  const slotHue = new Map([...run.members.map((m): [string, string] => [m.name, m.color]),
    [TUNE_BREAK_ENEMY.name, TUNE_BREAK_ENEMY.color]]);
  const totalCell = (sec: ChainGroup[] | undefined, value: number): string => {
    const hover = sec ? teamActionPopover(sec, value, slotHue) : "";
    return `<div class="c num${hover ? " has" : ""}"${hover}>${fmt(value)}</div>`;
  };
  const totalRow = `<div class="rtrow total">`
    + `<div class="c name">Total</div>`
    + run.sectionTotals.map((v, i) => totalCell(lines?.[i], v)).join("")
    + totalCell(flat, grand)
    + `</div>`;

  return `<div class="rtable dpr">${head}${memberRows}${tuneBreakRow}${totalRow}</div>`;
}

/* ----------------------------------------------------------------------------- wiring */

/**
 * Open a cell's panel on hover. A closed panel is detached and kept in `built` (only the open one
 * is ever in the document — hundreds of parked panels were re-styled on every pass). Action names
 * and the Team Avg DPR cell open on click instead; the DPR one stays pinned until a click elsewhere.
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

  const panelIn = (target: EventTarget | null): { cell: Element | null; pop: HTMLElement | null } => {
    const cell = (target as Element | null)?.closest?.(".c") ?? null;
    if (!cell) return { cell: null, pop: null };
    if (open && openHome === cell) return { cell, pop: open };
    const kept = built.get(cell);
    if (kept) return { cell, pop: kept };
    const data = (cell as HTMLElement).dataset;
    const markup = data?.pop ?? (data?.popKind ? buildPop(data.popKind, data.popKey ?? "") : undefined);
    if (!markup) return { cell, pop: null };
    const box = document.createElement("div");
    box.innerHTML = markup;
    cell.removeAttribute("data-pop");
    const pop = box.firstElementChild as HTMLElement | null;
    if (pop) built.set(cell, pop);
    return { cell, pop };
  };

  const isAction = (cell: Element): boolean => (!!cell.closest(".grid")
    && (cell.classList.contains("action") || cell.classList.contains("name")))
    || cell.classList.contains("teamdpr");

  document.addEventListener("mouseover", (e) => {
    if (pinned) return;
    if (open && open.contains(e.target as Node)) return;
    const hovered = (e.target as Element | null)?.closest?.(".c") ?? null;
    if (hovered && isAction(hovered)) { if (openHome !== hovered) close(); return; }
    const { cell, pop } = panelIn(e.target);
    if (pop === open) return;
    close();
    if (pop) place(cell!, pop);
  });

  document.addEventListener("mouseout", (e) => {
    if (pinned) return;
    const to = e.relatedTarget as Node | null;
    if (to && (root.contains(to) || (open && open.contains(to)))) return;
    close();
  });

  addEventListener("click", (e) => {
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
    if (isAction(cell) && !onCaret && pop) {
      e.preventDefault();
      const same = openHome === cell;
      close();
      if (!same) { place(cell, pop); pinned = cell.classList.contains("teamdpr"); }
      return;
    }
    if (cell.querySelector(":scope > .caret")) close();
  });

  addEventListener("scroll", close, true);
  addEventListener("resize", close);
}
