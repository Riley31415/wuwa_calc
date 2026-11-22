/**
 * The filter aside: the option/help boxes, the chips, and the search bar with its own UI state.
 * Filter *actions* (what a search hit or chip does) live in table.ts beside the table's handlers.
 */
import { iconNamed, iconOf, weaponIconByName, echoLabelHtml } from "./icons.js";
import { README } from "./readme.js";
import { costBox, matrixBox } from "./options.js";
import { TUNE_BREAK_ENEMY } from "../resonators/tunebreak.js";
import { eligibleWeapons, sequenceLevels, scopedKey, axisUsed, weaponBase, echoLabel, echoPicks, axisOpen, AXES } from "../solve/solver.js";
import type { Axis, TeamCost, ScopedCompare } from "../solve/solver.js";
import { TEAMS, RESONATOR_HUE, filters, resonatorFilters, OPTION_FILTER_MAPS, tagOwner, weaponTag, weaponOwner, comparable, pinnedRows, rowFromKey, resonatorLabel, memberLevels, visibleRows } from "./model.js";
import type { ResonatorFilter, OptionKind } from "./model.js";
import { esc, CLICK } from "./panels.js";

const app = document.getElementById("app")!;

/* ---------------------------------------------------------------------------------- search */

let searchText = "";
/** Which hit the keys have walked to, an index into `searchHits()` — -1 while the bar itself holds
 *  the highlight, where the first hit is what Enter takes anyway. Reset by every keystroke, since
 *  the list is rebuilt. */
let searchAt = -1;
export type SearchKind = "resonator" | OptionKind | "compare";
/** One offer in the list. `axis`/`resonator` are the compares' own — what `setCompare` needs, since
 *  their `value` is the chip's wording ("Qingxiao Sequences") rather than anything to filter on. */
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
      // each level they can run, named as the table names it
      for (const level of memberLevels(m)) add("resonator", resonatorLabel(m.name, level));
      // a weapon always by its rank: every rank while refines are compared, else the ones on screen
      if (axisOpen(m, filters, "weapons") && axisUsed(m, filters, "refines")) {
        for (const level of memberLevels(m)) for (const i of eligibleWeapons(m, filters)) {
          for (const w of m.loadout.refinements[i]!) add("weapon", weaponTag(m, level, w.name));
        }
      }
      if (axisUsed(m, filters, "refines")) for (const i of eligibleWeapons(m, filters)) for (const w of m.loadout.refinements[i]!) add("refine", `${m.name} R${w.refinement}`);
      if (axisOpen(m, filters, "echoes")) for (const e of echoPicks(m, members)) add("echo", echoLabel(m.loadout, m.loadout.echoLoadouts[e]!));
    }
  }
  for (const row of visibleRows) {
    row.members.forEach((m, i) => {
      if (axisOpen(m, filters, "weapons")) add("weapon", weaponTag(m, row.combo[i]!.sequence, row.combo[i]!.weapon.name));
    });
  }
  // a shown resonator also offers every compare their own name menu would, worded as the chip it
  // makes ("Qingxiao Sequences") — one already open is left to that chip to close
  for (const name of new Set([...resonatorFilters].filter(([, mode]) => mode === "include").map(([key]) => tagOwner(key)))) {
    for (const axis of AXES) {
      // refines are the Weapon column's own, opened from a weapon cell rather than by name
      if (axis === "refines" || filters[axis].includes(name) || !comparable(name, axis)) continue;
      add("compare", `${name} ${AXIS_LABEL[axis]}`, { axis, resonator: name });
    }
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

/** Walk the highlight `step` places and redraw. The bar itself is the place before the first hit,
 *  so walking past either end lands back on it with nothing highlighted, and one more step on
 *  comes round to the other end of the list. */
export function cycleSearch(step: number): void {
  const n = searchHits().length;
  if (!n) return;
  searchAt = (searchAt + 1 + step + n + 1) % (n + 1) - 1;
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
    resonator: "Resonator", weapon: "Weapon", echo: "Echo", refine: "Refine",
    compare: "Compare",
  };
  const hits = searchHits();
  if (!hits.length) return `<div class="sresult none">no matches</div>`;
  return hits.map(({ kind, value, axis, resonator }, i) => {
    const hue = (kind === "resonator" ? RESONATOR_HUE.get(tagOwner(value))
      : kind === "compare" ? RESONATOR_HUE.get(resonator ?? "")
      : kind === "weapon" ? RESONATOR_HUE.get(weaponOwner(value)) : undefined) ?? TUNE_BREAK_ENEMY.color;
    // one target, not two halves: a result is only ever added to the pool, and the chip it makes
    // is where it is taken back off
    return `<button type="button" class="sresult${i === searchAt ? " sel" : ""}" data-kind="${kind}" data-value="${esc(value)}"`
      + (axis ? ` data-axis="${axis}"` : "")
      + (resonator ? ` data-resonator="${esc(resonator)}"` : "")
      + ` style="--mem:${hue}"`
      + ` title="${kind === "compare" ? `Compare ${esc(resonator ?? "")}'s ${esc(AXIS_LABEL[axis!].toLowerCase())}`
        : `Add ${esc(value)} to the filters`}. The chip it makes is where it comes back off.">`
      + `<span class="sact inc"><span class="sname">${filterHtml(kind, value, resonator)}<span class="skind">${KIND_LABEL[kind]}</span></span></span></button>`;
  }).join("");
}


/* ---------------------------------------------------------------------------- filter aside */

/* ---------------------------------------------------------------------------- filter aside */

/** Which boxes show their description; survives redraws. The README starts open. */
const openHelp = new Set<string>(["readme"]);

export function comparisonFilters(): string {
  // `extra` is markup of its own at the end of the list, which only the README has: the line that
  // starts the tutorial over (page/tutorial.ts listens for it)
  const note = (id: string, label: string, lines: string[], extra = "") => {
    const open = openHelp.has(id);
    return `<div class="tcopt note${open ? " open" : ""}" data-note="${id}"><div class="tcopt-head">`
      + `<button type="button" class="tcopt-name" data-help="${id}" aria-expanded="${open}">`
      + `${esc(label)}<span class="arrow">›</span></button></div>`
      + `<div class="tcopt-desc"${open ? "" : " hidden"}>`
      + `<ul>${lines.map((l) => `<li>${l}</li>`).join("")}${extra}</ul></div></div>`;
  };
  return `<div class="tcfilters">
    <div class="tcfilter-row note">
      ${note("readme", "README", README, `<li><button type="button" class="tutstart">How do I use this website? ${CLICK} here.</button></li>`)}
      ${matrixBox(filters.matrix.length > 0, openHelp.has("matrix"))}
      ${costBox(filters.cost, openHelp.has("cost"))}
      <div class="tcsearchrow">
        <div class="tcsearch">
          <input id="optionSearch" type="search" placeholder="Add resonator or comparison..."
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

/** A filter as the table shows it: the resonator behind their portrait, at their level ("Qiuyuan
 *  S2"), and a weapon behind its art at its rank. */
function filterHtml(kind: SearchKind, value: string, resonator = ""): string {
  if (kind === "echo") return echoLabelHtml(value, esc);
  if (kind === "compare") return iconNamed(resonator) + esc(value);
  if (kind !== "weapon") return iconNamed(tagOwner(value)) + esc(value);
  const owner = weaponOwner(value);
  const [, level = "", weapon = value] = /^( S\d+)? (.*)$/.exec(value.slice(owner.length)) ?? [];
  return `${iconNamed(owner)}${esc(owner + level)}${weaponIconByName(value)}${esc(weapon)}`;
}

/** One chip per filter set and per compare, in Shown/Hidden sections, plus Clear Filters — then
 *  the pinned rows under it, with a Clear Pins of their own. */
function resonatorChips(): string {
  const inc: string[] = [], exc: string[] = [];
  const bucket = (mode: ResonatorFilter): string[] => (mode === "include" ? inc : exc);
  const MODE_TITLE: Record<ResonatorFilter, string> = { include: "these", exclude: "none of these" };
  for (const [name, mode] of resonatorFilters) {
    bucket(mode).push(`<button type="button" class="rchip" data-resonator="${esc(name)}"`
      + ` style="--mem:${RESONATOR_HUE.get(tagOwner(name)) ?? TUNE_BREAK_ENEMY.color}"`
      + ` title="${esc(name)} — teams fielding ${MODE_TITLE[mode]}. ${CLICK} to remove.">`
      + `${filterHtml("resonator", name)}</button>`);
  }
  for (const [kind, map] of Object.entries(OPTION_FILTER_MAPS) as [OptionKind, Map<string, ResonatorFilter>][]) {
    for (const [name, mode] of map) {
      const hue = kind === "refine" ? RESONATOR_HUE.get(tagOwner(name))
        : kind === "weapon" ? RESONATOR_HUE.get(weaponOwner(name)) : undefined;
      bucket(mode).push(`<button type="button" class="rchip" data-kind="${kind}" data-value="${esc(name)}"`
        + (hue ? ` style="--mem:${hue}"` : "")
        + ` title="${esc(name)} — rows using ${MODE_TITLE[mode]}. ${CLICK} to remove.">`
        + `${filterHtml(kind, name)}</button>`);
    }
  }
  for (const s of filters.scoped) {
    if (s.on === "rank") {
      inc.push(`<button type="button" class="rchip" data-scoped="${esc(scopedKey(s))}"`
        + ` style="--mem:${RESONATOR_HUE.get(s.resonator) ?? TUNE_BREAK_ENEMY.color}"`
        + ` title="Showing ${esc(s.resonator)} ${esc(s.value)} beside their own rank. ${CLICK} to remove.">`
        + `${filterHtml("weapon", `${s.resonator} ${s.value}`)}</button>`);
      continue;
    }
    inc.push(`<button type="button" class="rchip" data-scoped="${esc(scopedKey(s))}"`
      + ` style="--mem:${RESONATOR_HUE.get(s.resonator) ?? TUNE_BREAK_ENEMY.color}"`
      + ` title="Comparing ${esc(scopedLabel(s))}'s ${AXIS_LABEL[s.axis].toLowerCase()}. ${CLICK} to remove.">`
      + `${iconNamed(s.resonator)}${esc(scopedLabel(s))} ${AXIS_LABEL[s.axis]}</button>`);
  }
  for (const axis of AXES) {
    for (const name of filters[axis]) {
      inc.push(`<button type="button" class="rchip" data-axis="${axis}" data-resonator="${esc(name)}"`
        + ` style="--mem:${RESONATOR_HUE.get(name) ?? TUNE_BREAK_ENEMY.color}"`
        + ` title="Comparing ${esc(name)}'s ${AXIS_LABEL[axis].toLowerCase()}. ${CLICK} to remove.">`
        + `${iconNamed(name)}${esc(name)} ${AXIS_LABEL[axis]}</button>`);
    }
  }
  // a pin is one exact row, worded by its members and built out in full on the hover
  const pins: string[] = [];
  for (const key of pinnedRows) {
    const row = rowFromKey(key);
    if (!row) continue;
    const lead = row.members.find((m) => m.mainDps) ?? row.members[0]!;
    const builds = row.members.map((m, i) => {
      const c = row.combo[i]!;
      return `${m.name} S${c.sequence}: ${weaponBase(c.weapon)} R${c.weapon.refinement}, ${echoLabel(m.loadout, c.echo)}`;
    });
    pins.push(`<button type="button" class="rchip" data-pin="${esc(key)}" style="--mem:${lead.color}"`
      + ` title="${esc(builds.join("\n"))}\nShown whatever the other filters say. ${CLICK} to unpin.">`
      + `${row.members.map((m) => iconOf(m.loadout.resonator) + esc(m.name)).join(" / ")}</button>`);
  }
  const section = (label: string, chips: string[]): string =>
    (chips.length ? `<div class="chipsec"><span class="chiplabel">${label}</span><div class="chiprow">${chips.join("")}</div></div>` : "");
  const chips = section("Shown", inc) + section("Hidden", exc);
  return (chips ? `<div class="tcchips">${chips}<button type="button" class="clearall"><span>Clear Filters</span></button></div>` : "")
    + (pins.length ? `<div class="tcpins">${section("Pinned", pins)}<button type="button" class="clearpins"><span>Clear Pins</span></button></div>` : "");
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
