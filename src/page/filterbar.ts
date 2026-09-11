/**
 * The filter aside: the option/help boxes, the chips, and the search bar with its own UI state.
 * Filter *actions* (what a search hit or chip does) live in table.ts beside the table's handlers.
 */
import { TUNE_BREAK_ENEMY } from "../shared/tunebreak.js";
import { eligibleWeapons, scopedKey, axisUsed, weaponBase, echoLabel, axisOpen, AXES } from "../solver.js";
import type { Axis, TeamCost, ScopedCompare } from "../solver.js";
import { TEAMS, RESONATOR_HUE, filters, resonatorFilters, OPTION_FILTER_MAPS, sequenceTagsOf, tagOwner, comparable, MATRIX_RESONATORS } from "./model.js";
import type { ResonatorFilter, OptionKind } from "./model.js";
import { esc } from "./panels.js";

const app = document.getElementById("app")!;

/* ---------------------------------------------------------------------------------- search */

let searchText = "";
/** Which hit Tab has walked to, an index into `searchHits()` — -1 while none has been, where the
 *  first is what Enter takes anyway. Reset by every keystroke, since the list is rebuilt. */
let searchAt = -1;
export type SearchKind = "resonator" | OptionKind | "compare" | "matrix";
/** One offer in the list. `axis`/`resonator` are the compares' own — what `setCompare` needs, since
 *  their `value` is the chip's wording ("Qingxiao Sequences") rather than anything to filter on. A
 *  `matrix` offer carries the `resonator` alone, its value being that bubble's wording the same way. */
export interface SearchHit { kind: SearchKind; value: string; axis?: Axis; resonator?: string }

export function focusSearch(): void {
  const search = document.querySelector<HTMLInputElement>("#optionSearch");
  if (!search) return;
  search.focus({ preventScroll: true });
  search.setSelectionRange(search.value.length, search.value.length);
}

export function clearSearch(): void {
  searchText = "";
  searchAt = -1;
  const input = document.querySelector<HTMLInputElement>("#optionSearch");
  if (input) input.value = "";
  const box = document.getElementById("searchResults");
  if (box) box.innerHTML = "";
}

/** Every name the search can offer — picks a table cell could also set, plus the compares a name
 *  menu would open for whoever is already shown. */
function searchCandidates(): SearchHit[] {
  const seen = new Set<string>();
  const out: SearchHit[] = [];
  const add = (kind: SearchKind, value: string, rest: Partial<SearchHit> = {}): void => {
    if (value && !seen.has(`${kind}|${value}`)) { seen.add(`${kind}|${value}`); out.push({ kind, value, ...rest }); }
  };
  for (const members of Object.values(TEAMS)) {
    for (const m of members) {
      add("resonator", m.name);
      // the ranked names only while a rank is what the rows differ by — with refines closed every
      // row runs R1 and no cell reads "Emerald of Genesis R3" for the search to be filtering on
      if (axisOpen(m, filters, "weapons")) {
        for (const i of eligibleWeapons(m, filters)) {
          add("weapon", weaponBase(m.loadout.weapons[i]!));
          if (axisUsed(m, filters, "refines")) for (const w of m.loadout.refinements[i]!) add("weapon", w.name);
        }
      }
      if (axisUsed(m, filters, "refines")) for (const i of eligibleWeapons(m, filters)) for (const w of m.loadout.refinements[i]!) add("refine", `${m.name} R${w.refinement}`);
      if (axisOpen(m, filters, "echoes")) for (const e of m.loadout.echoLoadouts) add("echo", echoLabel(m.loadout, e));
      // every level the open compare shows, the baseline and the max-rank row included; nothing
      // at all when closed
      for (const tag of sequenceTagsOf(m, filters)) if (tag) add("sequence", tag);
    }
  }
  // a shown resonator also offers every compare their own name menu would, worded as the chip it
  // makes ("Qingxiao Sequences") — one already open is left to that chip to close
  for (const [name, mode] of resonatorFilters) {
    if (mode !== "include") continue;
    for (const axis of AXES) {
      // refines are the Weapon column's own, opened from a weapon cell rather than by name
      if (axis === "refines" || filters[axis].includes(name) || !comparable(name, axis)) continue;
      add("compare", `${name} ${AXIS_LABEL[axis]}`, { axis, resonator: name });
    }
    // and their Matrix, on the same terms: only a kit that has one, and only while it is off
    if (MATRIX_RESONATORS.has(name) && !filters.matrix.includes(name)) add("matrix", `${name} Matrix`, { resonator: name });
  }
  return out;
}

/** How well a name answers what has been typed, as the key the hits sort on — lower is better,
 *  null for no match at all. A run of the text outright is the close match, ranked by where the
 *  run starts. Failing that the letters are taken one at a time, in order but anywhere in the
 *  name and with the ones it hasn't got skipped over: two that land is a match ("qy" for Qiuyuan,
 *  "sk" for Shorekeeper, "fro" for Phrolova on its r and o), ranked after every close one, by how
 *  many landed and then how tightly they sit. Two is the floor because one letter alone would
 *  name half the roster. */
function searchRank(value: string, text: string): [number, number, number] | null {
  const name = value.toLowerCase();
  const at = name.indexOf(text);
  if (at !== -1) return [0, 0, at];
  let hit = 0, i = -1, from = -1, to = -1;
  for (const ch of text) {
    const found = name.indexOf(ch, i + 1);
    if (found < 0) continue;
    [i, to, hit] = [found, found, hit + 1];
    if (from < 0) from = found;
  }
  return hit < 2 ? null : [1, text.length - hit, to - from];
}

export function searchHits(): SearchHit[] {
  const text = searchText.trim().toLowerCase();
  if (!text) return [];
  return searchCandidates()
    .map((c) => ({ ...c, rank: searchRank(c.value, text) }))
    .filter((c): c is typeof c & { rank: [number, number, number] } => c.rank !== null)
    .sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || a.rank[2] - b.rank[2]
      || a.value.localeCompare(b.value))
    .slice(0, 10);
}

/** Walk the highlight `step` places, wrapping at both ends, and redraw. */
export function cycleSearch(step: number): void {
  const n = searchHits().length;
  if (!n) return;
  // the first Tab lands on an end, every one after walks and wraps
  searchAt = searchAt < 0 ? (step > 0 ? 0 : n - 1) : (searchAt + step + n) % n;
  drawSearch();
  document.querySelector(".sresult.sel")?.scrollIntoView({ block: "nearest" });
}

/** The hit Enter acts on: whichever Tab walked to, else the first. */
export const searchChoice = (): SearchHit | undefined =>
  searchHits()[searchAt < 0 ? 0 : searchAt];

export function drawSearch(): void {
  const box = document.getElementById("searchResults");
  if (box) box.innerHTML = searchResults();
}

function searchResults(): string {
  if (!searchText.trim()) return "";
  const KIND_LABEL: Record<SearchKind, string> = {
    resonator: "Resonator", weapon: "Weapon", echo: "Echo", sequence: "Sequence", refine: "Refine",
    compare: "Compare", matrix: "Matrix",
  };
  const hits = searchHits();
  if (!hits.length) return `<div class="sresult none">no matches</div>`;
  return hits.map(({ kind, value, axis, resonator }, i) => {
    const hue = (kind === "resonator" ? RESONATOR_HUE.get(value)
      : kind === "compare" || kind === "matrix" ? RESONATOR_HUE.get(resonator ?? "")
      : kind === "sequence" ? RESONATOR_HUE.get(tagOwner(value)) : undefined) ?? TUNE_BREAK_ENEMY.color;
    // one target, not two halves: a result is only ever added to the pool, and the chip it makes
    // is where it is taken back off
    return `<button type="button" class="sresult${i === searchAt ? " sel" : ""}" data-kind="${kind}" data-value="${esc(value)}"`
      + (axis ? ` data-axis="${axis}"` : "")
      + (resonator ? ` data-resonator="${esc(resonator)}"` : "")
      + ` style="--mem:${hue}"`
      + ` title="${kind === "compare" ? `Compare ${esc(resonator ?? "")}'s ${esc(AXIS_LABEL[axis!].toLowerCase())}`
        : kind === "matrix" ? `Run ${esc(resonator ?? "")}'s Matrix in every team they field`
        : `Add ${esc(value)} to the filters`}. The chip it makes is where it comes back off.">`
      + `<span class="sact inc"><span class="sname">${esc(value)}<span class="skind">${KIND_LABEL[kind]}</span></span></span></button>`;
  }).join("");
}


/* ---------------------------------------------------------------------------- filter aside */

/* ---------------------------------------------------------------------------- filter aside */

const COST_HELP = [
  "Full S0R0 - Limited resonators are S0 and use the best standard or 4* weapon available at R1. Rover and 4* resonators are S6.",
  "S0R1 mdps - Each team gets a single signature weapon at R1 that gives the best DPR increase, in most cases the team's main DPS. Dual DPS teams still only get one signature weapon.",
  "S0R1 all - All limited resonators get their best signature weapon, while Rover and 4* supports may still use standard or 4* weapons.",
  "S1R1 / S2R1 / S3R1 / S6R1 mdps - One resonator per team runs that many sequence nodes, whichever gives the best DPR increase, in most cases the team's main DPS. Everyone else stays S0R1.",
  "S6R5 mdps - That one resonator is S6 and runs their weapon at R5; everyone else is still S0R1.",
  "Full S6R5 - Every resonator is S6 with their best weapon at R5.",
];
/** Shown on the Matrix bubble and on the name menu's own line — the box this used to describe is
 *  gone, the option is per resonator now. */
export const MATRIX_HELP = "Enables matrix exclusive buffs for older characters, scaled down to a neutral environment. Lucy also activates 1 stack of her boss kill inherent.";
const STANDARDS = [
  "Rotations are 123, 1323, or 12323 for double intro and unison (jinhsi, brant, hsin, etc).",
  "A resonator may use their liberation at the start of the fight for free damage or buffs.",
  "Each rotation is achievable in 25-28 seconds, and we assume 4 rotations in 2 minutes.",
  "Combat is performed against a single level 100 boss with 20% resistance to all attributes.",
  "Resonators and weapons are level 90, with all skill nodes at level 10.",
];
const README = [
  "All beta calculations are subject to change!",
  "If you find an issue in rotations, buffs, stats, builds, or abnormal damage ping me on discord @rileyy._.",
];

/** Which boxes show their description; survives redraws. The README starts open. */
const openHelp = new Set<string>(["readme"]);

export function comparisonFilters(): string {
  const costBox = (): string => {
    const open = openHelp.has("cost");
    const option = (value: TeamCost, label: string) => `<option value="${value}"${filters.cost === value ? " selected" : ""}>${label}</option>`;
    return `<div class="tcopt${open ? " open" : ""}">`
      + `<div class="tcopt-head">`
      + `<button type="button" class="tcopt-name" data-help="cost" aria-expanded="${open}">Team Cost<span class="arrow">›</span></button>`
      + `<select id="cost" class="tcselect" aria-label="Team Cost" title="Team Cost">`
      + option("s0r0", "Full S0R0") + option("s0r1mdps", "S0R1 mdps only") + option("s0r1", "Full S0R1")
      + option("s1r1mdps", "S1R1 mdps") + option("s2r1mdps", "S2R1 mdps") + option("s3r1mdps", "S3R1 mdps")
      + option("s6r1mdps", "S6R1 mdps") + option("s6r5mdps", "S6R5 mdps") + option("s6r5", "Full S6R5")
      + `</select></div>`
      + `<div class="tcopt-desc"${open ? "" : " hidden"}><ul>${COST_HELP.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></div>`
      + `</div>`;
  };
  const note = (id: string, label: string, lines: string[]) => {
    const open = openHelp.has(id);
    return `<div class="tcopt note${open ? " open" : ""}"><div class="tcopt-head">`
      + `<button type="button" class="tcopt-name" data-help="${id}" aria-expanded="${open}">`
      + `${esc(label)}<span class="arrow">›</span></button></div>`
      + `<div class="tcopt-desc"${open ? "" : " hidden"}>`
      + `<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></div></div>`;
  };
  return `<div class="tcfilters">
    <div class="tcfilter-row note">
      ${note("readme", "README", README)}
      ${note("standards", "Standards and Assumptions", STANDARDS)}
      ${costBox()}
      <div class="tcsearchrow">
        <div class="tcsearch">
          <input id="optionSearch" type="search" placeholder="Add resonators..."
            autocomplete="off" spellcheck="false" value="${esc(searchText)}">
          <div class="tcsearch-results" id="searchResults">${searchResults()}</div>
        </div>
        ${resonatorChips()}
      </div>
    </div>
  </div>`;
}

export const AXIS_LABEL: Record<Axis, string> = {
  weapons: "Weapons", echoes: "Sonatas", mainstats: "Mainstats", substats: "Substat Investment",
  sequences: "Sequences", refines: "Weapon Refines",
};

export const scopedLabel = (s: ScopedCompare): string =>
  s.on === "sequence" ? `${s.resonator} S${s.value}` : s.on === "refine" ? `${s.resonator} R${s.value}` : s.value;

/** One chip per filter set and per compare, in Shown/Hidden sections, plus Clear Filters. */
function resonatorChips(): string {
  const inc: string[] = [], exc: string[] = [];
  const bucket = (mode: ResonatorFilter): string[] => (mode === "include" ? inc : exc);
  const MODE_TITLE: Record<ResonatorFilter, string> = { include: "these", exclude: "none of these" };
  for (const [name, mode] of resonatorFilters) {
    bucket(mode).push(`<button type="button" class="rchip" data-resonator="${esc(name)}"`
      + ` style="--mem:${RESONATOR_HUE.get(name) ?? TUNE_BREAK_ENEMY.color}"`
      + ` title="${esc(name)} — teams fielding ${MODE_TITLE[mode]}. Click to remove.">`
      + `${esc(name)}</button>`);
  }
  for (const [kind, map] of Object.entries(OPTION_FILTER_MAPS) as [OptionKind, Map<string, ResonatorFilter>][]) {
    for (const [name, mode] of map) {
      const hue = kind === "sequence" || kind === "refine" ? RESONATOR_HUE.get(tagOwner(name)) : undefined;
      bucket(mode).push(`<button type="button" class="rchip" data-kind="${kind}" data-value="${esc(name)}"`
        + (hue ? ` style="--mem:${hue}"` : "")
        + ` title="${esc(name)} — rows using ${MODE_TITLE[mode]}. Click to remove.">`
        + `${esc(name)}</button>`);
    }
  }
  for (const s of filters.scoped) {
    inc.push(`<button type="button" class="rchip" data-scoped="${esc(scopedKey(s))}"`
      + ` style="--mem:${RESONATOR_HUE.get(s.resonator) ?? TUNE_BREAK_ENEMY.color}"`
      + ` title="Comparing ${esc(scopedLabel(s))}'s ${AXIS_LABEL[s.axis].toLowerCase()}. Click to remove.">`
      + `${esc(scopedLabel(s))} ${AXIS_LABEL[s.axis]}</button>`);
  }
  for (const name of filters.matrix) {
    inc.push(`<button type="button" class="rchip" data-matrix="${esc(name)}"`
      + ` style="--mem:${RESONATOR_HUE.get(name) ?? TUNE_BREAK_ENEMY.color}"`
      + ` title="${esc(name)} runs their Matrix in every team. ${esc(MATRIX_HELP)} Click to remove.">`
      + `${esc(name)} Matrix</button>`);
  }
  for (const axis of AXES) {
    for (const name of filters[axis]) {
      inc.push(`<button type="button" class="rchip" data-axis="${axis}" data-resonator="${esc(name)}"`
        + ` style="--mem:${RESONATOR_HUE.get(name) ?? TUNE_BREAK_ENEMY.color}"`
        + ` title="Comparing ${esc(name)}'s ${AXIS_LABEL[axis].toLowerCase()}. Click to remove.">`
        + `${esc(name)} ${AXIS_LABEL[axis]}</button>`);
    }
  }
  const section = (label: string, chips: string[]): string =>
    (chips.length ? `<div class="chipsec"><span class="chiplabel">${label}</span><div class="chiprow">${chips.join("")}</div></div>` : "");
  const chips = section("Shown", inc) + section("Hidden", exc);
  return chips ? `<div class="tcchips">${chips}<button type="button" class="clearall"><span>Clear Filters</span></button></div>` : "";
}

/* ------------------------------------------------------------------------------- handlers */

// a box's description toggles in place — a redraw would drop the scroll and every open panel
document.addEventListener("click", (e) => {
  const btn = (e.target as Element).closest<HTMLElement>(".tcopt-name");
  const id = btn?.dataset.help;
  if (!btn || !id) return;
  const box = btn.closest<HTMLElement>(".tcopt")!;
  const open = !openHelp.has(id);
  if (open) openHelp.add(id);
  else openHelp.delete(id);
  box.classList.toggle("open", open);
  btn.setAttribute("aria-expanded", String(open));
  box.querySelector<HTMLElement>(".tcopt-desc")!.hidden = !open;
});
// the search bar: typing redraws only its results
document.addEventListener("input", (e) => {
  const input = e.target as HTMLInputElement;
  if (input.id !== "optionSearch") return;
  searchText = input.value;
  searchAt = -1;
  drawSearch();
});
// the results list hides on focus/click outside `.tcsearch`; a pointer press leaves it to the click
// (not every browser focuses a pressed button, and a hidden list would swallow the release)
document.addEventListener("focusin", (e) => {
  if (!(e.target as Element).closest?.(".tcsearch")) return;
  const box = document.getElementById("searchResults");
  if (box) box.hidden = false;
});
let pressing = false;
document.addEventListener("pointerdown", () => { pressing = true; }, true);
document.addEventListener("pointerup", () => { pressing = false; }, true);
document.addEventListener("click", (e) => {
  if ((e.target as Element).closest?.(".tcsearch")) return;
  const box = document.getElementById("searchResults");
  if (box) box.hidden = true;
}, true);
app.addEventListener("scroll", (e) => {
  if (!(e.target as Element).classList?.contains("tcside")) return;
  const box = document.getElementById("searchResults");
  if (box) box.hidden = true;
}, true);
document.addEventListener("focusout", (e) => {
  if (!(e.target as Element).closest?.(".tcsearch")) return;
  if ((e.relatedTarget as Element | null)?.closest?.(".tcsearch")) return;
  if (pressing) return;
  const box = document.getElementById("searchResults");
  if (box) box.hidden = true;
});
