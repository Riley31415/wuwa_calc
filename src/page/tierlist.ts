/**
 * The Tier List page (tierlist.html): every resonator at the best team DPR they reach, in three
 * blocks — Main DPS (the team's main DPS), Sub DPS (not its main DPS, 1 vigor) and Support (not its
 * main DPS, 2 vigor), at the link's Team Cost and with Matrix Buffs on or off as the link says.
 * Rows are banded into tiers of roughly equal size, cut per Team Cost on the solves without Matrix.
 */
import { portraitNamed } from "./icons.js";
import { fmt } from "./display.js";
import { defaultFilters, hasBuild, bestKey } from "../solve/solver.js";
import type { Filters, TeamCost } from "../solve/solver.js";
import { TEAMS, RESONATOR_HUE, FALLBACK_HUE, bestPicks, loadSolves, saveSolves, filters, MATRIX_RESONATORS, applyHash, syncHash, weaponPart } from "./model.js";
import { costBox, matrixBox } from "./options.js";
import { paint } from "./pool.js";
import { overlay, overlayPhase, showError, ensureBestPicks } from "./loading.js";
import { TWO_VIGOR, esc, dprOf, pageOf, buildOf, drawPage, wireHelp, openHelp, clearBuilds } from "./roster.js";

const app = document.getElementById("app")!;

/** A resonator's best team in one block: its Team Avg DPR and the team, for the card and the link. */
interface Entry { name: string; dpr: number; teamKey: string }
/** The step every tier cut lands on: 100k DPR. */
const CUT_STEP = 100_000;
const BLOCKS = ["Main DPS", "Sub DPS", "Support"] as const;
/** The tiers, best first. Where each starts is worked out per Team Cost (`cutsOf`). */
const TIERS = [
  { name: "T0", color: "#e5484d" },
  { name: "T1", color: "#f0883e" },
  { name: "T2", color: "#f0b444" },
  { name: "T3", color: "#45d6a4" },
  { name: "T4", color: "#5b9cff" },
];
/** The lowest figure each tier but the last takes, best first: always a multiple of `CUT_STEP`. */
let cuts: number[] = [];
const tierOf = (dpr: number): number => {
  const at = cuts.findIndex((from) => dpr >= from);
  return at < 0 ? TIERS.length - 1 : at;
};

/**
 * Cut points splitting `entries` into tiers of roughly equal size: each falls at its share of the
 * ranking, halfway in log between the last entry above it and the first below, then moved to the
 * multiple of 100k DPR either side of that whose count above comes nearer the even share — a
 * threshold, so a team's three members (who share a DPR) never split.
 */
function cutsOf(entries: Entry[]): number[] {
  const dprs = entries.map((e) => e.dpr).sort((a, b) => b - a);
  const out: number[] = [];
  for (let t = 1; t < TIERS.length; t++) {
    const share = (dprs.length * t) / TIERS.length;
    const at = Math.min(dprs.length - 1, Math.max(1, Math.round(share)));
    const step = CUT_STEP;
    const mid = Math.sqrt(dprs[at - 1]! * dprs[at]!) / step;
    const off = (cut: number): number => Math.abs(dprs.filter((d) => d >= cut).length - share);
    const [down, up] = [Math.floor(mid) * step, Math.ceil(mid) * step];
    let cut = off(up) <= off(down) ? up : down;
    // two cuts rounding to one leave a tier empty: each sits at least a step under the last
    if (out.length && cut >= out[out.length - 1]!) cut = out[out.length - 1]! - step;
    out.push(cut);
  }
  return out;
}
let blocks: Entry[][] = [];

/** The page's filter state: the reader's Team Cost, and every Matrix or none. */
const tierFilters = (): Filters => ({ ...defaultFilters(), cost: filters.cost, matrix: [...filters.matrix] });
/** The same with no Matrix: what the tiers are cut on. */
const plainFilters = (): Filters => ({ ...defaultFilters(), cost: filters.cost });

/** Each block's resonators at their best team under `f`, best first. */
function blocksOf(f: Filters): Entry[][] {
  const best = BLOCKS.map(() => new Map<string, Entry>());
  for (const [teamKey, members] of Object.entries(TEAMS)) {
    if (!members.every((m) => hasBuild(m, f))) continue;
    const score = bestPicks.get(bestKey(teamKey, members, f))?.scores[0];
    if (!score) continue;
    const dpr = dprOf(score.sectionTotals);
    for (const m of members) {
      const block = best[m.mainDps ? 0 : TWO_VIGOR.has(m.name) ? 2 : 1]!;
      if ((block.get(m.name)?.dpr ?? -1) < dpr) block.set(m.name, { name: m.name, dpr, teamKey });
    }
  }
  return best.map((block) => [...block.values()].sort((a, b) => b.dpr - a.dpr || a.name.localeCompare(b.name)));
}

/** The table under the page's filters, tiered by the cuts its Team Cost gives without Matrix Buffs —
 *  the same cuts either way, so turning the Matrix on shows who it lifts a tier. */
function compute(): void {
  cuts = cutsOf(blocksOf(plainFilters()).flat());
  blocks = blocksOf(tierFilters());
}

/** What a member costs in their best team: chain level and their signature's rank, "S0" at S0 on
 *  anything else ("S0", "R1", "S2R1", "S6"). */
function costOf(e: Entry): string {
  const row = buildOf(e.teamKey);
  const at = row ? row.members.findIndex((m) => m.name === e.name) : -1;
  if (!row || at < 0) return "";
  const combo = row.combo[at]!, part = weaponPart(row.members[at]!, combo.weapon);
  return ((combo.sequence ? `S${combo.sequence}` : "") + (/^R\d$/.test(part) ? part : "")) || "S0";
}

function render(): void {
  // a card: the portrait on the resonator's colour with its bar under it, their cost over its corner, and
  // the best team's figure centred beneath, linking to that team, with a green arrow where Matrix Buffs
  // are on and their kit has one
  const matrixOn = filters.matrix.length > 0;
  const card = (e: Entry): string => {
    const href = pageOf(e.teamKey);
    const hue = RESONATOR_HUE.get(e.name) ?? FALLBACK_HUE;
    const cost = costOf(e);
    const mx = matrixOn && MATRIX_RESONATORS.has(e.name) ? `<span class="tcard-up" title="Matrix Buff">▲</span>` : "";
    const tag = href ? "a" : "div";
    return `<${tag} class="tcard"${href ? ` href="${esc(href)}"` : ""} style="--mem:${hue}" title="${esc(e.name)}${cost ? ` ${cost}` : ""}">`
      + `<span class="tcard-art">${portraitNamed(e.name, "tcard-img")}${cost ? `<span class="tcard-cost">${esc(cost)}</span>` : ""}</span>`
      + `<span class="tcard-dpr">${fmt(e.dpr)}${mx}</span></${tag}>`;
  };
  // a row per tier: its name down the first column, then each block's cards wrapping in its own column
  const body = TIERS.map((tier, t) => {
    const inTier = blocks.map((b) => b.filter((e) => tierOf(e.dpr) === t));
    if (!inTier.some((b) => b.length)) return "";
    const band = t > 0 ? " bandstart" : "";
    return `<div class="trow"><div class="c tier${band}" style="--tier:${tier.color}">${tier.name}</div>`
      + inTier.map((b) => `<div class="c tiergap${band}"></div><div class="c tiercards${band}">${b.map(card).join("")}</div>`).join("")
      + `</div>`;
  }).join("");
  const head = `<div class="c"></div>` + BLOCKS.map((title) => `<div class="c tiergap"></div><div class="c tierhead">${title}</div>`).join("");
  const boxes = matrixBox(filters.matrix.length > 0, openHelp.has("matrix")) + costBox(filters.cost, openHelp.has("cost"));
  drawPage(app, boxes, "", BLOCKS.length * 2 + 1, head, body);
}

wireHelp(app, render);

// both options live in the link, as the main page's do (`tc=`, `mx=`)
app.addEventListener("change", (e) => {
  const el = e.target as HTMLInputElement | HTMLSelectElement;
  if (el.id === "cost") filters.cost = el.value as TeamCost;
  else if (el.id === "matrixToggle") filters.matrix = (el as HTMLInputElement).checked ? [...MATRIX_RESONATORS] : [];
  else return;
  syncHash(null);
  clearBuilds();
  load().catch(showError);
});

/** Which `load()` is the live one: an option changed while the last is still solving takes over. */
let generation = 0;

/** Solve whatever the filters need that isn't in hand, then rank and draw. */
async function load(): Promise<void> {
  const gen = ++generation;
  // the plain solves as well as the page's own: the tiers are cut on those
  for (const f of filters.matrix.length ? [plainFilters(), tierFilters()] : [plainFilters()]) {
    const teams = Object.entries(TEAMS).filter(([, members]) => members.every((m) => hasBuild(m, f)));
    await ensureBestPicks(teams, f, () => gen !== generation);
    if (gen !== generation) return;
  }
  saveSolves();
  await paint();
  compute();
  render();
  overlay.hidden = true;
}

async function boot(): Promise<void> {
  overlayPhase("Initializing…", true);
  // the options from the link as the main page reads them (`tc=`, `mx=`; s0r1 and no Matrix without
  // them), written back as they read; the team pages its links open run the same
  applyHash();
  syncHash(null);
  // a link typed in over the page is a page of its own
  addEventListener("hashchange", () => location.reload());
  await loadSolves();
  await load();
}

boot().catch(showError);
