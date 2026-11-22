/**
 * Resonator portraits and weapon art (wuwalab.com), echo previews and sonata emblems (nanoka.cc): each
 * Gear's image is images/<kind>/<its id>.webp, shown before a name everywhere but the action log. A piece
 * with no id, or no file under it (a custom kit or weapon), shows images/unknown.webp.
 */
import { Gear, Resonator, Weapon, Mainslot, Sonata, Sonata1pc, Sonata2pc, Sonata3pc } from "../engine/gear.js";
import { ALL_TEAMS } from "../resonators/teams.js";

const UNKNOWN = "./images/unknown.webp";

/** The images/ folder a Gear's kind keeps its pictures in, null for a kind with none. */
const dirOf = (g: Gear): string | null =>
  g instanceof Resonator ? "resonators" : g instanceof Weapon ? "weapons" : g instanceof Mainslot ? "echoes"
  : g instanceof Sonata || g instanceof Sonata1pc || g instanceof Sonata2pc || g instanceof Sonata3pc ? "sonatas" : null;

/** `g`'s image as an inline `<img class="icon">` — the question mark where it has none — or "" for a kind
 *  that has no pictures. */
export function iconOf(g: Gear | null | undefined): string {
  const dir = g ? dirOf(g) : null;
  if (!dir) return "";
  const src = g!.id ? `./images/${dir}/${g!.id}.webp` : UNKNOWN;
  return `<img class="icon" src="${src}" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${UNKNOWN}'">`;
}

/** Every resonator, weapon (each rank's name and the bare one), mainslot and set piece the roster
 *  fields, by name — for the cells and chips that carry only a name. Built on first use. */
let named: Map<string, Gear> | null = null;
function gearNamed(): Map<string, Gear> {
  if (named) return named;
  named = new Map();
  const add = (g: Gear | null | undefined, name = g?.name): void => {
    if (g && name && !named!.has(name)) named!.set(name, g);
  };
  for (const { loadouts } of ALL_TEAMS) for (const l of loadouts) {
    add(l.resonator);
    for (const w of l.refinements.flat()) {
      add(w);
      add(w, w.name.replace(/ R\d$/, ""));
    }
    for (const e of l.echoLoadouts) {
      add(e.mainslot);
      for (const g of e.sets) add(g);
    }
  }
  return named;
}

/** The image of whatever the roster fields under `name`, or "". */
export const iconNamed = (name: string): string => iconOf(gearNamed().get(name));
/** An icon's blank space, for a row that only sizes columns (table.ts's ghost row). */
export const ICON_SLOT = `<span class="icon"></span>`;
/** A weapon's art off a filter tag ("Changli S1 Blazing Brilliance R1"): the longest weapon name the
 *  tag ends on, its rank aside. */
export function weaponIconByName(tag: string): string {
  const bare = tag.replace(/ R\d$/, "");
  let best: Gear | undefined, len = 0;
  for (const [name, g] of gearNamed()) {
    if (g instanceof Weapon && name.length > len && (bare === name || bare.endsWith(` ${name}`))) {
      best = g;
      len = name.length;
    }
  }
  return iconOf(best);
}
/** An echo pick's label ("Set 5pc + Mainslot") escaped, each part behind its own image. */
export const echoLabelHtml = (label: string, esc: (s: string) => string): string =>
  label.split(" + ").map((part) => iconNamed(part) + esc(part)).join(" + ");
