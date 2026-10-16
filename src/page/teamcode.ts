/**
 * A team's id: its three members' resonators and loadouts, sequences, weapons and ranks, each
 * member's high substats and the matrix, then up to three chunks of gear — a member's mainslot,
 * sonata sets and main-stat build, each naming the slot it is for — in base64. The team is the first
 * 12 digits, so 12 is the team alone (its gear left to the solver), and the gear, one number of
 * the chunks, follows it: 19, 26 or 32 digits carry one, two or three. Every part is read
 * straight off the game's own ids, so the widths below are the format.
 */
import type { Loadout, Weapon, EchoLoadout } from "../engine/gear.js";
import { Mainstat } from "../shared/mainstats.js";
import type { MainstatBuild } from "../shared/mainstats.js";

/** The digits a code is written in — base64url (RFC 4648), YouTube's: six bits a digit, so a 12-digit
 *  code is exactly 9 bytes any base64url decoder reads. Case matters: copied, never typed. */
export const TAG_DIGITS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** A resonator's id is `1ESS` (element 1-6, serial to 21), and a loadout's that times ten plus its
 *  place among that kit's loadouts (1-4): 504 slots. A weapon's is `210T0SSQ` (type 1-5, serial to
 *  16, and a last digit of 4-7 — the four- and five-stars, no lower rarity being worn): 320 slots. */
const ELEMENTS = 6n, SERIALS = 21n, LOADOUTS = 4n, SEQUENCES = 7n;
const WEAPON_TYPES = 5n, WEAPON_SERIALS = 16n, WEAPON_DIGITS = 4n, REFINES = 5n;
const LOADOUT_SPAN = ELEMENTS * SERIALS * LOADOUTS;
const WEAPON_SPAN = WEAPON_TYPES * WEAPON_SERIALS * WEAPON_DIGITS;
const MEMBER_SPAN = LOADOUT_SPAN * SEQUENCES * WEAPON_SPAN * REFINES;
/** The members, then the matrix bit and each member's high substats — held in 72 bits of their own,
 *  so a gear part that doesn't read never touches the team's. */
const TEAM_SPAN = MEMBER_SPAN ** 3n * 16n, TEAM_BITS = 72n;

/** A member's gear: the mainslot by its game id (`MAINSLOT_SERIES`, 640 slots); the sonata sets by their
 *  game ids (1-64) — one for a 5pc, a 3pc and its 2pc, or a 1pc and its two 2pcs; and the main-stat
 *  build as its layout and the stats of each cost as a multiset (1,875 builds). A chunk is that
 *  times three plus the slot it is for. */
const SETS = 64n;
/** The runs of echo ids a mainslot's can fall in: the 6000xxx series, then the two the 1.0 echoes
 *  kept (Heron's 3900770xx, the Overlords' 3900800xx). */
const MAINSLOT_SERIES = [[6000000, 512], [390077000, 64], [390080000, 64]] as const;
const MAINSLOTS = BigInt(MAINSLOT_SERIES.reduce((n, [, size]) => n + size, 0));
const SONATA_SPAN = SETS + SETS ** 2n + SETS ** 3n;
/** `Mainstat` by cost, in its own order: the 4-costs, the 3-costs, the 1-costs. */
const COSTS = [{ from: Mainstat.CR4, n: 5 }, { from: Mainstat.ER3, n: 10 }, { from: Mainstat.ATK1, n: 3 }];
/** The layouts a build comes in (mainstats.ts's `mainstatOptions()`), as counts of 4-, 3- and 1-costs. */
const LAYOUTS = [[1, 2, 2], [2, 0, 3], [1, 0, 4]];
const choose = (n: number, k: number): number => {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return k > n ? 0 : Math.round(r);
};
/** How many ways `k` of a cost's `n` stats can be picked, repeats allowed and order not. */
const multisets = (c: number, k: number): number => choose(COSTS[c]!.n + k - 1, k);
const LAYOUT_SPANS = LAYOUTS.map((l) => l.reduce((n, k, c) => n * multisets(c, k), 1));
const MAINSTAT_SPAN = BigInt(LAYOUT_SPANS.reduce((a, b) => a + b, 0));
const GEAR_SPAN = MAINSLOTS * SONATA_SPAN * MAINSTAT_SPAN;
const CHUNK_SPAN = GEAR_SPAN * 3n;

/** A code's length by how many chunks it carries: the team's 12 digits and the fewest holding the gear. */
const LENGTHS = [0, 1, 2, 3].map((k) => {
  let d = 0;
  while (64n ** BigInt(d) < CHUNK_SPAN ** BigInt(k)) d++;
  return Number(TEAM_BITS / 6n) + d;
});

/** One member as a code reads it: the build's own pieces, and its gear where it is named. */
export interface CodeMember {
  loadout: Loadout;
  sequence: number;
  /** The rank worn — the weapon's own `refinement`, 1-5. */
  weapon: Weapon;
  highSubs: boolean;
  gear?: { echo: EchoLoadout; mainstat: MainstatBuild } | null;
}

/** A member read back: the resonator and weapon by their game ids, the loadout by its place in the
 *  resonator's own loadouts (1-4, the last digit of `LoadoutDef.id`), and the gear where the code
 *  names it — null for the solver to pick, as it is for every member where the gear part is bad. */
export interface DecodedMember {
  resonator: number;
  loadout: number;
  sequence: number;
  weapon: number;
  refinement: number;
  highSubs: boolean;
  gear: DecodedGear | null;
}
/** The mainslot's and the sets' game ids — the 5pc, 3pc or 1pc first, then any 2pcs — and the main
 *  stats, highest cost first. */
export interface DecodedGear { mainslot: number; sets: number[]; mainstats: Mainstat[] }

/** `n` as `count` base64 digits, the highest first. */
const digits = (n: bigint, count: number): string => {
  let out = "";
  for (let i = 0; i < count; i++) {
    out = TAG_DIGITS[Number(n & 63n)] + out;
    n >>= 6n;
  }
  return out;
};

/** `v`'s place in `lo..hi` as one digit of the code, throwing where it falls outside. */
const fits = (what: string, v: number, lo: number, hi: number): bigint => {
  if (!Number.isInteger(v) || v < lo || v > hi) throw new Error(`team code: ${what} ${v} is outside ${lo}-${hi}`);
  return BigInt(v - lo);
};

/** A sorted multiset's rank among all of its size: its values made strictly rising, then summed as
 *  a combinatorial number. */
const rankOf = (vs: number[]): number => vs.reduce((r, v, i) => r + choose(v + i, i + 1), 0);
const unrank = (r: number, k: number): number[] => {
  const out: number[] = [];
  for (let i = k - 1; i >= 0; i--) {
    let w = i;
    while (choose(w + 1, i + 1) <= r) w++;
    r -= choose(w, i + 1);
    out.unshift(w - i);
  }
  return out;
};

function gearOf(echo: EchoLoadout, build: MainstatBuild): bigint {
  const id = echo.mainslot.id;
  let mainslot = 0n, series = 0;
  for (; series < MAINSLOT_SERIES.length; series++) {
    const [base, size] = MAINSLOT_SERIES[series]!;
    if (id >= base && id < base + size) break;
    mainslot += BigInt(size);
  }
  if (series === MAINSLOT_SERIES.length) throw new Error(`team code: ${echo.mainslot.name}'s id ${id} is in no echo series`);
  mainslot += BigInt(id - MAINSLOT_SERIES[series]![0]);
  const [a, b, c] = echo.sets.map((s) => fits(`${s.name}'s set`, s.id, 1, 64));
  const sonata = c !== undefined ? SETS + SETS ** 2n + (a! * SETS + b!) * SETS + c
    : b !== undefined ? SETS + a! * SETS + b : a!;
  const byCost = COSTS.map((cost) => build.slots.filter((s) => s >= cost.from && s < cost.from + cost.n)
    .map((s) => s - cost.from).sort((x, y) => x - y));
  const layout = LAYOUTS.findIndex((l) => l.every((k, i) => k === byCost[i]!.length));
  if (layout < 0) throw new Error(`team code: ${build.name} is no 43311, 44111 or 41111 build`);
  const inLayout = byCost.reduce((r, vs, i) => r * multisets(i, vs.length) + rankOf(vs), 0);
  const mainstat = LAYOUT_SPANS.slice(0, layout).reduce((a, b) => a + b, 0) + inLayout;
  return (mainslot * SONATA_SPAN + sonata) * MAINSTAT_SPAN + BigInt(mainstat);
}

function readGear(g: bigint): DecodedGear {
  let mainstat = Number(g % MAINSTAT_SPAN);
  g /= MAINSTAT_SPAN;
  let sonata = g % SONATA_SPAN;
  let mainslot = Number(g / SONATA_SPAN), series = 0;
  while (mainslot >= MAINSLOT_SERIES[series]![1]) mainslot -= MAINSLOT_SERIES[series++]![1];
  mainslot += MAINSLOT_SERIES[series]![0];
  // one set below SETS, two in the SETS² after, three past those
  let sets: bigint[];
  if (sonata < SETS) sets = [sonata];
  else if (sonata < SETS + SETS ** 2n) {
    sonata -= SETS;
    sets = [sonata / SETS, sonata % SETS];
  } else {
    sonata -= SETS + SETS ** 2n;
    sets = [sonata / SETS ** 2n, (sonata / SETS) % SETS, sonata % SETS];
  }
  let layout = 0;
  while (mainstat >= LAYOUT_SPANS[layout]!) mainstat -= LAYOUT_SPANS[layout++]!;
  const mainstats: Mainstat[] = [];
  for (let i = COSTS.length - 1; i >= 0; i--) {
    const k = LAYOUTS[layout]![i]!, span = multisets(i, k);
    mainstats.unshift(...unrank(mainstat % span, k).map((v) => (v + COSTS[i]!.from) as Mainstat));
    mainstat = Math.floor(mainstat / span);
  }
  return { mainslot, sets: sets.map((s) => Number(s) + 1), mainstats };
}

/** The team's code: members in slot order, their flags, then a chunk for each member naming its
 *  gear. Throws on a piece the widths can't hold. */
export function teamCode(members: readonly CodeMember[], matrix: boolean): string {
  if (members.length !== 3) throw new Error(`team code: ${members.length} members, expected 3`);
  let team = 0n, flags = matrix ? 1n : 0n;
  members.forEach(({ loadout, sequence, weapon, highSubs }, i) => {
    const r = loadout.resonator.id, w = weapon.id;
    const element = fits(`${loadout.resonator.name}'s element`, Math.floor(r / 100) % 10, 1, 6);
    const serial = fits(`${loadout.resonator.name}'s serial`, r % 100, 1, 21);
    const place = fits(`loadout ${loadout.id}'s place`, loadout.id - r * 10, 1, 4);
    const slot = (element * SERIALS + serial) * LOADOUTS + place;
    const type = fits(`${weapon.name}'s type`, Math.floor(w / 10000) % 10, 1, 5);
    const wSerial = fits(`${weapon.name}'s serial`, Math.floor(w / 10) % 100, 1, 16);
    const digit = fits(`${weapon.name}'s last digit`, w % 10, 4, 7);
    const wSlot = (type * WEAPON_SERIALS + wSerial) * WEAPON_DIGITS + digit;
    const member = ((slot * SEQUENCES + fits("sequence", sequence, 0, 6)) * WEAPON_SPAN + wSlot) * REFINES
      + fits(`${weapon.name}'s rank`, weapon.refinement, 1, 5);
    team = team * MEMBER_SPAN + member;
    if (highSubs) flags |= 2n << BigInt(i);
  });
  const chunks = members.flatMap(({ gear }, slot) => (gear ? [gearOf(gear.echo, gear.mainstat) * 3n + BigInt(slot)] : []));
  const gear = chunks.reduceRight((rest, chunk) => rest * CHUNK_SPAN + chunk, 0n);
  return digits(team * 16n + flags, Number(TEAM_BITS / 6n)) + digits(gear, LENGTHS[chunks.length]! - Number(TEAM_BITS / 6n));
}

/** A `teamCode()` read back — null where its team part isn't one. A gear part that doesn't read (a
 *  length no chunk count makes, a stray digit, a chunk past its span, two for one slot) leaves every
 *  member's gear to the solver, the team still read. */
export function readTeamCode(text: string): { members: DecodedMember[]; matrix: boolean } | null {
  const teamDigits = Number(TEAM_BITS / 6n), valid = /^[A-Za-z0-9_-]*$/;
  if (text.length < teamDigits || !valid.test(text.slice(0, teamDigits))) return null;
  const found = LENGTHS.indexOf(text.length);
  const chunks = found < 0 || !valid.test(text.slice(teamDigits)) ? 0 : found;
  const read = (part: string): bigint => [...part].reduce((n, c) => (n << 6n) | BigInt(TAG_DIGITS.indexOf(c)), 0n);
  let team = read(text.slice(0, teamDigits)), rest = chunks ? read(text.slice(teamDigits)) : 0n;
  if (team >= TEAM_SPAN) return null;
  const flags = team % 16n;
  team /= 16n;
  const members: DecodedMember[] = [];
  for (let i = 2; i >= 0; i--) {
    let m = team % MEMBER_SPAN;
    team /= MEMBER_SPAN;
    const refinement = Number(m % REFINES) + 1;
    m /= REFINES;
    const wSlot = m % WEAPON_SPAN;
    m /= WEAPON_SPAN;
    const sequence = Number(m % SEQUENCES);
    const slot = m / SEQUENCES;
    const place = Number(slot % LOADOUTS) + 1, rSlot = slot / LOADOUTS;
    const resonator = 1000 + Number(rSlot / SERIALS + 1n) * 100 + Number(rSlot % SERIALS + 1n);
    const weapon = 21000000 + Number(wSlot / (WEAPON_SERIALS * WEAPON_DIGITS) + 1n) * 10000
      + Number((wSlot / WEAPON_DIGITS) % WEAPON_SERIALS + 1n) * 10 + Number(wSlot % WEAPON_DIGITS + 4n);
    members.unshift({ resonator, loadout: place, sequence, weapon, refinement, highSubs: (flags & (2n << BigInt(i))) !== 0n, gear: null });
  }
  const gear: (DecodedGear | null)[] = [null, null, null];
  for (let k = 0; k < chunks; k++) {
    const chunk = rest % CHUNK_SPAN;
    rest /= CHUNK_SPAN;
    const slot = Number(chunk % 3n);
    if (gear[slot]) return { members, matrix: (flags & 1n) !== 0n };
    gear[slot] = readGear(chunk / 3n);
  }
  if (rest !== 0n) return { members, matrix: (flags & 1n) !== 0n };
  for (let i = 0; i < 3; i++) members[i]!.gear = gear[i]!;
  return { members, matrix: (flags & 1n) !== 0n };
}
