/**
 * The whole website, restored to the old rich comparison-table UI (see git history at
 * `40ee581:index.ts` for the original, ~30-team version this is rebuilt from) but wired to the
 * new engine and scoped to the two ported teams: Qiuyuan/Cantarella/Phrolova, and the shield
 * team Shorekeeper/Iuno/Jingran.
 *
 * display.ts is unmodified — kit.ts now exports `ResolvedSnapshot`/`StatEntry`/`ChainGroup` so
 * `buildReport()` compiles and runs against this engine exactly as it did the old one (see
 * kit.ts's own header on those types and on `addStat()`'s automatic source/owner tagging).
 *
 * Two things the old page had that this one doesn't, because the new engine doesn't track them
 * yet: a resource/counter system (Energy, Concerto, Off-tune, the forte gauges all read 0 here,
 * so `buildReport()`'s own "drop an all-zero column" rule hides them), and a buff event log
 * (`state.log` doesn't exist on the new `State`, so the detail page has no Event Log section).
 * There's also no weapon optimizer — each member runs their own file's hardcoded loadout, not
 * whichever weapon scores highest.
 *
 * What lives where, since the build search no longer lives here: this file owns the `TEAMS` table,
 * the filter state, the routing and every last piece of rendering. The search itself and the engine
 * run that scores it are solver.ts, which is DOM-free precisely so a pool of Workers can run it —
 * that pass is ~97% of a cold load and every team in it is independent, so it goes wide (see
 * `ensureBestPicks()` and worker.ts). Only the handful of rows the table actually shows are run
 * back here, because a `TeamRun` carries a whole `State` for the detail page and none of that can
 * cross a postMessage.
 */
import { Gear, Action, Stat } from "./src/kit.js";
import { TUNE_BREAK_SLOT } from "./src/tunebreak.js";
import type { ChainGroup, HeldBuff, ResolvedSnapshot } from "./src/kit.js";
import { buildReport, totalsBySlot } from "./src/display.js";
import type { Report, Column, ReportRow, ReportPart, TraceEntry, InfoEntry } from "./src/display.js";
import { isPercent, statLabel } from "./src/stats.js";
import { member, comboOf, runTeam, eligibleWeapons, sequenceLevels, variationsOf, solveTeam } from "./src/solver.js";
import type { Member, Combo, Pick, Filters, Variation, TeamRun, SolvedVariation, SolveRequest, SolveResponse } from "./src/solver.js";
// Every loadout, from the one registry that also lets a worker resolve a team by name
// (loadouts.ts). The list is deliberately the whole roster rather than only what `TEAMS` currently
// uses, so adding a team below never needs an import edit first.
import { loadoutName, LOADOUTS,
  QY_LOADOUT,
  CANTA_LOADOUT,
  FROLO_LOADOUT,
  SK_LOADOUT,
  UNO_LOADOUT,
  JINGOAT_LOADOUT,
  ZZ_LOADOUT,
  LOTTA_LOADOUT,
  GEEK_LOADOUT,
  VERINA_LOADOUT,
  SANHUA_LOADOUT,
  HROVER_LOADOUT,
  EROVER_LOADOUT,
  AROVER_LOADOUT,
  SROVER_LOADOUT,
  CIA_LOADOUT,
  ROCCIA_LOADOUT,
  AUGUGU_LOADOUT,
  LOPA_LOADOUT,
  GLOB_LOADOUT,
  GLOB_LOADOUT_ECHO_FOCUS,
  BRANT_LOADOUT,
  ENCORE_LOADOUT,
  CHANGLI_LOADOUT,
  DANJIN_LOADOUT,
  CAMMY_LOADOUT,
  MORT_LOADOUT,
  BULING_LOADOUT,
  LUCILLA_LOADOUT,
  JIYAN_LOADOUT,
  YINLIN_LOADOUT,
  XLY_LOADOUT,
} from "./src/loadouts.js";


/* ------------------------------------------------------------------------------------ teams */

const TEAMS: Record<string, Member[]> = {
  froloQyCanta: [member(FROLO_LOADOUT), member(QY_LOADOUT), member(CANTA_LOADOUT)],
  skIunoJingran: [member(SK_LOADOUT), member(UNO_LOADOUT), member(JINGOAT_LOADOUT)],
  skZzCarlotta: [member(SK_LOADOUT), member(ZZ_LOADOUT), member(LOTTA_LOADOUT)],
  skQiuyuanSigrika: [member(SK_LOADOUT), member(QY_LOADOUT), member(GEEK_LOADOUT)],
  froloRoverVerina: [member(FROLO_LOADOUT), member(HROVER_LOADOUT), member(VERINA_LOADOUT)],
  froloSkCanta: [member(FROLO_LOADOUT), member(SK_LOADOUT), member(CANTA_LOADOUT)],
  froloRocciaCanta: [member(FROLO_LOADOUT), member(ROCCIA_LOADOUT), member(CANTA_LOADOUT)],
  skIunoAugusta: [member(SK_LOADOUT), member(UNO_LOADOUT), member(AUGUGU_LOADOUT)],
  skQyGalbrena: [
    member(SK_LOADOUT), member(QY_LOADOUT),
    // the echo-focus variant — the one that actually casts Echo Skills for Shorekeeper's own
    // Echo Skill DMG buffs to land on
    member(GLOB_LOADOUT_ECHO_FOCUS),
  ],
  skLupaEncore: [member(SK_LOADOUT), member(LOPA_LOADOUT), member(ENCORE_LOADOUT)],
  lupaBrantGalbrena: [member(LOPA_LOADOUT), member(BRANT_LOADOUT), member(GLOB_LOADOUT)],
  lupaBrantChangli: [member(LOPA_LOADOUT), member(BRANT_LOADOUT), member(CHANGLI_LOADOUT)],
  froloDanjinCanta: [member(FROLO_LOADOUT), member(DANJIN_LOADOUT), member(CANTA_LOADOUT)],
  froloVerinaDanjin: [member(FROLO_LOADOUT), member(VERINA_LOADOUT), member(DANJIN_LOADOUT)],
  froloSkDanjin: [member(FROLO_LOADOUT), member(SK_LOADOUT), member(DANJIN_LOADOUT)],
  froloBulingDanjin: [member(FROLO_LOADOUT), member(BULING_LOADOUT), member(DANJIN_LOADOUT)],
  skRocciaCamellya: [member(SK_LOADOUT), member(ROCCIA_LOADOUT), member(CAMMY_LOADOUT)],
  skSanhuaCamellya: [member(SK_LOADOUT), member(SANHUA_LOADOUT), member(CAMMY_LOADOUT)],
  lupaMortefiJingran: [member(LOPA_LOADOUT), member(MORT_LOADOUT), member(JINGOAT_LOADOUT)],
  skMortefiAugusta: [member(SK_LOADOUT), member(MORT_LOADOUT), member(AUGUGU_LOADOUT)],
  froloBulingCanta: [member(FROLO_LOADOUT), member(BULING_LOADOUT), member(CANTA_LOADOUT)],
  bulingZzCarlotta: [member(BULING_LOADOUT), member(ZZ_LOADOUT), member(LOTTA_LOADOUT)],
  froloQyLucillaEcho: [member(FROLO_LOADOUT), member(QY_LOADOUT), member(LUCILLA_LOADOUT)],
  skLucillaSigrika: [member(SK_LOADOUT), member(LUCILLA_LOADOUT), member(GEEK_LOADOUT)],
  skLucillaGalbrena: [
    member(SK_LOADOUT), member(LUCILLA_LOADOUT),
    // the echo-focus variant, same as skQyGalbrena — the one that actually casts Echo Skills for
    // Shorekeeper/Lucilla's own Echo Skill DMG buffs to land on
    member(GLOB_LOADOUT_ECHO_FOCUS),
  ],
  lupaIunoJingran: [member(LOPA_LOADOUT), member(UNO_LOADOUT), member(JINGOAT_LOADOUT)],

  // Sanhua behind a Basic Attack dealer, Roccia behind a Havoc one.
  skSanhuaEncore: [member(SK_LOADOUT), member(SANHUA_LOADOUT), member(ENCORE_LOADOUT)],
  verinaRocciaCamellya: [member(VERINA_LOADOUT), member(ROCCIA_LOADOUT), member(CAMMY_LOADOUT)],
  verinaSanhuaCamellya: [member(VERINA_LOADOUT), member(SANHUA_LOADOUT), member(CAMMY_LOADOUT)],
  verinaSanhuaEncore: [member(VERINA_LOADOUT), member(SANHUA_LOADOUT), member(ENCORE_LOADOUT)],
  // Zhezhi (behind Carlotta only) and Brant, the other 2nd slot Carlotta takes.
  skBrantCarlotta: [member(SK_LOADOUT), member(BRANT_LOADOUT), member(LOTTA_LOADOUT)],
  verinaBrantCarlotta: [member(VERINA_LOADOUT), member(BRANT_LOADOUT), member(LOTTA_LOADOUT)],
  bulingBrantCarlotta: [member(BULING_LOADOUT), member(BRANT_LOADOUT), member(LOTTA_LOADOUT)],
  verinaZzCarlotta: [member(VERINA_LOADOUT), member(ZZ_LOADOUT), member(LOTTA_LOADOUT)],
  // Aero Rover behind the one Aero dealer, from the 2nd slot or the 3rd.
  aroverLucillaSigrika: [member(AROVER_LOADOUT), member(LUCILLA_LOADOUT), member(GEEK_LOADOUT)],
  aroverQySigrika: [member(AROVER_LOADOUT), member(QY_LOADOUT), member(GEEK_LOADOUT)],
  aroverCantaSigrika: [member(AROVER_LOADOUT), member(CANTA_LOADOUT), member(GEEK_LOADOUT)],
  skARoverSigrika: [member(SK_LOADOUT), member(AROVER_LOADOUT), member(GEEK_LOADOUT)],
  verinaARoverSigrika: [member(VERINA_LOADOUT), member(AROVER_LOADOUT), member(GEEK_LOADOUT)],
  // Ciaccona, the other Aero buffer, in front of the same dealer.
  aroverCiacconaSigrika: [member(CIA_LOADOUT), member(AROVER_LOADOUT), member(GEEK_LOADOUT)],
  ciaQYSigrika: [member(CIA_LOADOUT), member(QY_LOADOUT), member(GEEK_LOADOUT)],
  skCiaSigrika: [member(SK_LOADOUT), member(CIA_LOADOUT), member(GEEK_LOADOUT)],
  ArciaSigrika: [member(AROVER_LOADOUT), member(CIA_LOADOUT), member(GEEK_LOADOUT)],
  qyLucillaSigrika: [member(QY_LOADOUT), member(LUCILLA_LOADOUT), member(GEEK_LOADOUT)],
  qyLucillaGalb: [member(QY_LOADOUT), member(LUCILLA_LOADOUT), member(GLOB_LOADOUT)],
  ciacconaLucillaSigrika: [member(CIA_LOADOUT), member(LUCILLA_LOADOUT), member(GEEK_LOADOUT)],
  // Iuno/Mortefi behind a Heavy Attack dealer.
  skIunoGalbrena: [member(SK_LOADOUT), member(UNO_LOADOUT), member(GLOB_LOADOUT)],
  skMortefiGalbrena: [member(SK_LOADOUT), member(MORT_LOADOUT), member(GLOB_LOADOUT)],
  skMortefiJingran: [member(SK_LOADOUT), member(MORT_LOADOUT), member(JINGOAT_LOADOUT)],
  verinaIunoAugusta: [member(VERINA_LOADOUT), member(UNO_LOADOUT), member(AUGUGU_LOADOUT)],
  verinaIunoGalbrena: [member(VERINA_LOADOUT), member(UNO_LOADOUT), member(GLOB_LOADOUT)],
  verinaIunoJingran: [member(VERINA_LOADOUT), member(UNO_LOADOUT), member(JINGOAT_LOADOUT)],
  verinaMortefiAugusta: [member(VERINA_LOADOUT), member(MORT_LOADOUT), member(AUGUGU_LOADOUT)],
  verinaMortefiGalbrena: [member(VERINA_LOADOUT), member(MORT_LOADOUT), member(GLOB_LOADOUT)],
  verinaMortefiJingran: [member(VERINA_LOADOUT), member(MORT_LOADOUT), member(JINGOAT_LOADOUT)],
  // Lupa in the 2nd slot: a normal sustain 3rd, a Fusion dealer 1st.
  skLupaGalbrena: [member(SK_LOADOUT), member(LOPA_LOADOUT), member(GLOB_LOADOUT)],
  skLupaJingran: [member(SK_LOADOUT), member(LOPA_LOADOUT), member(JINGOAT_LOADOUT)],
  verinaLupaEncore: [member(VERINA_LOADOUT), member(LOPA_LOADOUT), member(ENCORE_LOADOUT)],
  verinaLupaGalbrena: [member(VERINA_LOADOUT), member(LOPA_LOADOUT), member(GLOB_LOADOUT)],
  verinaLupaJingran: [member(VERINA_LOADOUT), member(LOPA_LOADOUT), member(JINGOAT_LOADOUT)],
  // Lupa in the 3rd slot: Brant or Mortefi 2nd, a Fusion dealer (or Changli) 1st.
  lupaBrantEncore: [member(LOPA_LOADOUT), member(BRANT_LOADOUT), member(ENCORE_LOADOUT)],
  lupaBrantJingran: [member(LOPA_LOADOUT), member(BRANT_LOADOUT), member(JINGOAT_LOADOUT)],
  lupaMortefiEncore: [member(LOPA_LOADOUT), member(MORT_LOADOUT), member(ENCORE_LOADOUT)],
  lupaMortefiGalbrena: [member(LOPA_LOADOUT), member(MORT_LOADOUT), member(GLOB_LOADOUT)],
  // Galbrena/Sigrika, who take an echo caster in the 2nd slot (Roccia excepted).
  skCantaGalbrena: [member(SK_LOADOUT), member(CANTA_LOADOUT), member(GLOB_LOADOUT_ECHO_FOCUS)],
  verinaLucillaGalbrena: [member(VERINA_LOADOUT), member(LUCILLA_LOADOUT), member(GLOB_LOADOUT_ECHO_FOCUS)],
  verinaQyGalbrena: [member(VERINA_LOADOUT), member(QY_LOADOUT), member(GLOB_LOADOUT_ECHO_FOCUS)],
  verinaCantaGalbrena: [member(VERINA_LOADOUT), member(CANTA_LOADOUT), member(GLOB_LOADOUT_ECHO_FOCUS)],
  skCantaSigrika: [member(SK_LOADOUT), member(CANTA_LOADOUT), member(GEEK_LOADOUT)],
  verinaLucillaSigrika: [member(VERINA_LOADOUT), member(LUCILLA_LOADOUT), member(GEEK_LOADOUT)],
  verinaQySigrika: [member(VERINA_LOADOUT), member(QY_LOADOUT), member(GEEK_LOADOUT)],
  verinaCantaSigrika: [member(VERINA_LOADOUT), member(CANTA_LOADOUT), member(GEEK_LOADOUT)],
  // Phrolova, who sits in the 3rd slot herself and pushes her two supports up a slot each.
  froloSkQy: [member(FROLO_LOADOUT), member(SK_LOADOUT), member(QY_LOADOUT)],
  froloSkLucilla: [member(FROLO_LOADOUT), member(SK_LOADOUT), member(LUCILLA_LOADOUT)],
  froloBulingQy: [member(FROLO_LOADOUT), member(BULING_LOADOUT), member(QY_LOADOUT)],
  froloBulingLucilla: [member(FROLO_LOADOUT), member(BULING_LOADOUT), member(LUCILLA_LOADOUT)],
  froloLucillaCanta: [member(FROLO_LOADOUT), member(LUCILLA_LOADOUT), member(CANTA_LOADOUT)],
  froloVerinaCanta: [member(FROLO_LOADOUT), member(VERINA_LOADOUT), member(CANTA_LOADOUT)],
  froloQySk: [member(FROLO_LOADOUT), member(QY_LOADOUT), member(SK_LOADOUT)],
  froloLucillaSk: [member(FROLO_LOADOUT), member(LUCILLA_LOADOUT), member(SK_LOADOUT)],
  froloQyVerina: [member(FROLO_LOADOUT), member(VERINA_LOADOUT), member(QY_LOADOUT)],
  froloLucillaVerina: [member(FROLO_LOADOUT), member(VERINA_LOADOUT), member(LUCILLA_LOADOUT)],
  froloDanjinVerina: [member(FROLO_LOADOUT), member(DANJIN_LOADOUT), member(VERINA_LOADOUT)],
  froloDanjinSk: [member(FROLO_LOADOUT), member(DANJIN_LOADOUT), member(SK_LOADOUT)],

  // Yinlin's Judgment Strikes coordinate behind Xiangli Yao, with either sustain up front.
  skYinlinXly: [member(SK_LOADOUT), member(YINLIN_LOADOUT), member(XLY_LOADOUT)],
  verinaYinlinXly: [member(VERINA_LOADOUT), member(YINLIN_LOADOUT), member(XLY_LOADOUT)],
  // Jiyan behind a Heavy Attack buffer (Mortefi/Iuno) or Ciaccona, sustain or an Aero buffer 1st.
  skMortefiJiyan: [member(SK_LOADOUT), member(MORT_LOADOUT), member(JIYAN_LOADOUT)],
  skIunoJiyan: [member(SK_LOADOUT), member(UNO_LOADOUT), member(JIYAN_LOADOUT)],
  skCiaJiyan: [member(SK_LOADOUT), member(CIA_LOADOUT), member(JIYAN_LOADOUT)],
  verinaMortefiJiyan: [member(VERINA_LOADOUT), member(MORT_LOADOUT), member(JIYAN_LOADOUT)],
  verinaIunoJiyan: [member(VERINA_LOADOUT), member(UNO_LOADOUT), member(JIYAN_LOADOUT)],
  verinaCiaJiyan: [member(VERINA_LOADOUT), member(CIA_LOADOUT), member(JIYAN_LOADOUT)],
  aroverMortefiJiyan: [member(AROVER_LOADOUT), member(MORT_LOADOUT), member(JIYAN_LOADOUT)],
  aroverIunoJiyan: [member(AROVER_LOADOUT), member(UNO_LOADOUT), member(JIYAN_LOADOUT)],
  aroverCiaJiyan: [member(AROVER_LOADOUT), member(CIA_LOADOUT), member(JIYAN_LOADOUT)],
  ciaMortefiJiyan: [member(CIA_LOADOUT), member(MORT_LOADOUT), member(JIYAN_LOADOUT)],
  ciaIunoJiyan: [member(CIA_LOADOUT), member(UNO_LOADOUT), member(JIYAN_LOADOUT)],
  // Iuno/Qiuyuan in front of an Aero-adjacent 3rd.
  iunoQySigrika: [member(UNO_LOADOUT), member(QY_LOADOUT), member(GEEK_LOADOUT)],
  iunoQyGalbrena: [member(UNO_LOADOUT), member(QY_LOADOUT), member(GLOB_LOADOUT)],
};

/** Which way a resonator has been filtered: `include` keeps only the teams that field them,
 *  `exclude` drops every team that does. */
type ResonatorFilter = "include" | "exclude";

/** Resonators filtered by name, set from their own name cell in the comparison table — left click
 *  to require one, right click to bar one (see the handlers in `boot()`) — and cleared again by
 *  clicking that name's own chip above the table (`resonatorChips()`). Like the filter boxes,
 *  this decides which rows are built rather than hiding rows afterwards, so a narrowed table
 *  never optimizes and runs teams nobody asked to see. Module-level so it survives a re-render.
 *
 *  Verina starts barred: she's a legal 3rd slot on most of the table, so her rows roughly double
 *  it while rarely being the pick anyone is actually comparing. Clicking her chip brings her back. */
const resonatorFilters = new Map<string, ResonatorFilter>([["Verina", "exclude"]]);

const filters: Filters = {
  mdpsSequences: false, supportSequences: false,
  mdpsWeapons: false, supportWeapons: false,
  mdpsEchoes: false, supportEchoes: false,
  mdpsMainstats: false, supportMainstats: false,
  allowR1Mdps: true, allowR1Supports: false,
};

const bestPicks = new Map<string, Pick[]>();
const bestKey = (teamKey: string): string => `${teamKey}|${filters.allowR1Mdps}|${filters.allowR1Supports}`;

/** The re-optimized main stat for one variation, memoized across filter flips — same cache key
 *  shape as `bestPicks`, so an R1 change (which moves the build everything is measured against)
 *  starts fresh. */
const variantMainstats = new Map<string, number>();
const variantKey = (teamKey: string, v: Variation): string =>
  `${bestKey(teamKey)}|${v.member}|${v.axis}${v.option}`;

/** File one solved team away into the two caches the table reads — whether it was solved in a
 *  worker or on this thread, the answer is the same plain indices either way (see solver.ts's own
 *  `SolveResponse`). */
function storeSolved(teamKey: string, solved: { picks: Pick[]; variants: SolvedVariation[] }): void {
  bestPicks.set(bestKey(teamKey), solved.picks);
  for (const v of solved.variants) variantMainstats.set(variantKey(teamKey, v), v.mainstat);
}

/** One team, run under one specific combo for every member — the comparison table's own row unit
 *  (see the "one row per combo" spec). `key` stays plain alphanumerics/dots/dashes so it drops
 *  straight into `location.hash` with no encoding. */
interface TeamRow { key: string; teamKey: string; members: Member[]; combo: Combo[]; }

/**
 * One team's own rows: the build `optimizeTeam()` settled on, plus — for every axis whose box is
 * open — one row per alternative, that member alone moved off the best while the rest of the team
 * stays on it. A team whose own best picks were never found (its weapon list is empty under the
 * current R1 rule) has no rows at all.
 *
 * One member at a time, deliberately, rather than every member's options crossed against every
 * other's: crossed, a team with two damage dealers on 51 and 9 main-stat builds is 51 × 9 = 459
 * rows; varied one at a time it's 51 + 9. The rows that disappear are the ones pairing one
 * member's third-best pick with another's seventh, which is a question nobody asks — every row
 * here answers the one that gets asked, "what does moving *this* pick cost me", against a team
 * that's otherwise at its best. For main stats those crossed rows are redundant outright: a
 * member's own ranking doesn't shift with what anyone else wears (see `optimizeTeam()`).
 */
/** Whether a team survives the resonator filters: it must field every included name — requiring
 *  two asks for teams that play both together, not teams that play either — and none of the
 *  excluded ones. Nothing filtered lets every team through. */
const teamWanted = (members: Member[]): boolean =>
  [...resonatorFilters].every(([name, mode]) =>
    members.some((m) => m.name === name) === (mode === "include"));

function expandTeam(teamKey: string, members: Member[]): TeamRow[] {
  const best = bestPicks.get(bestKey(teamKey));
  if (!best || !teamWanted(members)) return [];
  const baseline = members.map((m, i) => comboOf(m.loadout, best[i]!));

  // keyed, because the baseline pick shows up again in every axis it isn't varying
  const rows = new Map<string, TeamRow>();
  const add = (i: number, pick: Pick): void => {
    const combo = [...baseline];
    combo[i] = comboOf(members[i]!.loadout, pick);
    const key = `${teamKey}-${combo.map((c) => c.key).join("-")}`;
    if (!rows.has(key)) rows.set(key, { key, teamKey, members, combo });
  };
  const baseKey = `${teamKey}-${baseline.map((c) => c.key).join("-")}`;
  rows.set(baseKey, { key: baseKey, teamKey, members, combo: baseline });

  // a weapon or echo alternative wears the main stat that's best *for it* (see `variationsOf()`)
  for (const v of variationsOf(members, best, filters)) {
    const home = best[v.member]!;
    const mainstat = variantMainstats.get(variantKey(teamKey, v)) ?? home.mainstat;
    add(v.member, { ...home, [v.axis]: v.option, mainstat });
  }

  members.forEach((m, i) => {
    const home = best[i]!;
    const mdps = m.loadout.mainDps;
    // the main stat is the axis being varied here, so the rest of the build stays at its best
    if (mdps ? filters.mdpsMainstats : filters.supportMainstats) {
      m.loadout.mainstats.forEach((_, mainstat) => add(i, { ...home, mainstat }));
    }
    for (const sequence of sequenceLevels(m.loadout, filters)) add(i, { ...home, sequence });
  });
  return [...rows.values()];
}

/** Every row the table should show right now, across every team. */
const teamRows = (): TeamRow[] => Object.entries(TEAMS).flatMap(([key, members]) => expandTeam(key, members));

/**
 * Rebuild one row straight from its own key, with no optimizer pass behind it. `expandTeam()`
 * names a row after its team plus every member's own gear indices (see `comboOf()`), and those
 * indices are the whole of what running it takes — so a `#team=...` link can open its detail page
 * without the table's own "optimize every team, then run every row that opened" pass, which is
 * answering a question a direct link never asked. A team key is a plain identifier with no dash
 * in it, so splitting on dashes separates it from the per-member combo keys cleanly.
 *
 * `null` if the key names a team, member count or gear index that isn't there any more, so a
 * stale bookmark falls back to the table instead of throwing.
 */
function rowFromKey(key: string): TeamRow | null {
  const [teamKey, ...comboKeys] = key.split("-");
  if (!teamKey) return null;
  const members = TEAMS[teamKey];
  if (!members || comboKeys.length !== members.length) return null;

  const combo: Combo[] = [];
  for (let i = 0; i < members.length; i++) {
    const parsed = /^(\d+)\.(\d+)\.(\d+)\.s(\d+)$/.exec(comboKeys[i]!);
    if (!parsed) return null;
    const l = members[i]!.loadout;
    const pick: Pick = { weapon: +parsed[1]!, echo: +parsed[2]!, mainstat: +parsed[3]!, sequence: +parsed[4]! };
    if (!l.weapons[pick.weapon] || !l.echoLoadouts[pick.echo] || !l.mainstats[pick.mainstat]) return null;
    combo.push(comboOf(l, pick));
  }
  return { key, teamKey, members, combo };
}

/** Every resonator's own colour, by name — read off the loadout registry so a chip can be painted
 *  for anyone on the roster, not just whoever a currently-visible team happens to field. */
const RESONATOR_HUE = new Map(
  Object.values(LOADOUTS).map((l) => [l.resonator.name, l.resonator.color] as const),
);

/** The bucket a tune break's damage lands in — the engine's own label (kit.ts's `TUNE_BREAK_SLOT`),
 *  aliased here because the whole table refers to it by this short name. */
const MISC = TUNE_BREAK_SLOT;
const MISC_HUE = "#8a94a3";
const FALLBACK_HUE = "#5b9cff";

/** Kill switch for the resonator popover's "Gear" section — off for now, kept as a single flag
 *  rather than ripping the section's own code out, so turning it back on later is a one-line
 *  flip (see `buffsPopover`'s own use of this). */
const GEAR_SECTION_ENABLED = false;

/** How many leading columns stay put while the table scrolls sideways: `member` and `action`. */
const STICK = 2;

/* ------------------------------------------------------------------ the engine */

/** The detail page's own rich report, built only the first time a team is actually opened and
 *  cached on `run` so revisiting it is free.
 *
 *  The comparison table's own pass runs untraced and keeps no lines (see `TeamRun.rotationLines`),
 *  which is what makes thousands of combos affordable — so opening one re-runs that single team
 *  with tracing on to get them back. One team run costs a couple of milliseconds against the
 *  thousands the table already did, and it is deterministic: same loadouts, same rotations, same
 *  numbers. */
function detailFor(run: TeamRun): { report: Report; rotationReports: Report[] } {
  if (run.detail) return run.detail;
  const lines = run.rotationLines
    ?? runTeam(run.teamKey, run.members, run.combo, true).rotationLines!;
  run.rotationLines = lines;
  const rotationReports = lines.map((l) => buildReport(l));
  const report = buildReport(lines.flat());
  run.detail = { report, rotationReports };
  return run.detail;
}

/* --------------------------------------------------------------------- helpers */

const esc = (s: unknown): string => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const fmt = (v: number | string | null | undefined, digits = 0, pad = false): string =>
  typeof v === "number"
    ? v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: pad ? digits : 0 })
    : String(v ?? "");

// energy/concerto/offtune always show their own column's full digit count in the action table
// (2/2/4) rather than trimming trailing zeros the way every other column does.
const PAD_DIGITS_COLUMNS = new Set(["energy", "concerto", "offtune"]);

// mv and the three running resources get a dotted underline when a stat buff actually moved them
// this action, not just carried/declared their own usual trace (see ReportRow.buffed).
const BUFF_UNDERLINE_COLUMNS = new Set(["mv", "energy", "concerto", "offtune"]);

/**
 * One table cell. Columns carry a character `width` (the report also prints to a terminal), so
 * a sticky column's offset is the character widths to its left, scaled by the CSS --cw.
 */
const colWidth = (c: Column, i: number): string => {
  const base = `var(--cw) * ${c.width} + var(--cpad)`;
  return i === 0 ? `calc(${base} + var(--lead))` : `calc(${base})`;
};

function cell(columns: Column[], index: number, { cls = [], html = "", style = "" }: { cls?: string[]; html?: string; style?: string }): string {
  const col = columns[index]!;
  const stick = index < STICK;
  const before = columns.slice(0, index);
  // one per-character metric for every column (see index.css's own --cw), so this offset is
  // computed exactly the way the grid tracks colWidth() emits are
  const span = before.reduce((n, c) => n + (c.width ?? 0), 0);
  const left = `calc(var(--cw) * ${span}`
    + ` + var(--cpad) * ${before.length}`
    + `${before.length ? " + var(--lead)" : ""})`;
  const classes = [
    "c",
    col.align === "left" ? "" : "num",
    ...cls,
    stick ? "stick" : "",
  ].filter(Boolean).join(" ");
  const styleAttr = [stick ? `left:${left}` : "", style].filter(Boolean).join(";");
  return `<span class="${classes}"${styleAttr ? ` style="${styleAttr}"` : ""}>${html}</span>`;
}

/** Every source that fed one value, revealed on hover. */
const unit = (r: TraceEntry): string => ((r.percent ?? (r.stat ? isPercent(r.stat) : false)) ? "%" : "");

const SCALING_LABEL: Record<string, string> = { atk: "ATK", hp: "HP", def: "DEF", dot: "Dot", tune: "Tune" };

const SECTION_ORDER = ["base", "bonus", "flat"];
const SECTION_RANK = (key: string | null): number => {
  if (key === null) return -1;
  const word = key.split(" ")[0]!.toLowerCase();
  const i = SECTION_ORDER.indexOf(word);
  return i === -1 ? SECTION_ORDER.length + 1 : i;
};

const panelRow = (r: TraceEntry, slotHue: Map<string, string>, { noSource = false }: { noSource?: boolean } = {}): string => {
  const own = r.owner !== undefined ? (slotHue.get(r.owner ?? "") ?? MISC_HUE) : null;
  return `<tr>${noSource ? "" : `<td class="s"${own ? ` style="--own:${own}"` : ""}>${esc(r.source)}</td>`}`
  + `<td class="k">${esc(r.label ?? (r.stat ? statLabel(r.stat) : ""))}</td>`
  + `<td class="v">${r.mult ? `&times;${fmt(r.value, r.digits ?? 4)}` : `${fmt(r.value, r.digits ?? 4)}${unit(r)}`}</td>`
  + `</tr>`;
};

function popover(col: Column, rows: TraceEntry[] | undefined, total: number | string | null | undefined, slotHue: Map<string, string>, suffix = ""): string {
  if (!rows?.length) return "";
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

  const body = sections.map(({ key, rows: group }) => {
    const head = key ? `<tr class="sec"><td colspan="3">${esc(key)}</td></tr>` : "";
    const sub = key
      ? `<tr class="sub">${noSource ? "" : `<td class="s"></td>`}<td class="k">Total</td>`
        + `<td class="v">`
        + `${fmt(group.reduce((n, r) => n + r.value, 0), 4)}${unit(group[0]!)}</td></tr>`
      : "";
    return head + group.map(row).join("") + sub;
  }).join("");

  return `<span class="pop"><table>${body}${before.map(row).join("")}`
    + `<tr class="sum">${noSource ? "" : `<td class="s"></td>`}<td class="k">Total</td>`
    + `<td class="v">${fmt(total, col.digits ?? 0)}${col.percent ? "%" : ""}${esc(suffix)}</td>`
    + `</tr>${after.map(row).join("")}</table></span>`;
}

function infoPopover(info: InfoEntry[] | undefined): string {
  if (!info?.length) return "";
  const rows = info.map((e) => `<tr><td class="k">${esc(e.label)}</td><td class="v">${esc(e.value)}</td></tr>`).join("");
  return `<span class="pop info"><table>${rows}</table></span>`;
}

/** The hover on a resonator's own name, in the rotation table: every buff actually held once
 *  this action resolved — local (this member's own), global (team-wide), and enemy (debuffs on
 *  the target) kept in their own sections, since that's a real distinction (kit.ts's own
 *  `heldLocal`/`heldGlobal`/`heldEnemy`), not just a formatting choice. Buffs only: equipped gear
 *  is filtered out engine-side (see kit.ts's own `TeamMember.equipped`) and named by the loadout
 *  popover instead.
 *
 *  Sorted and coloured by source — whose kit each buff came from, tracked by the engine as it's
 *  granted (`State.sourceOf`) rather than guessed from the buff's own name, so a buff one kit
 *  puts up on another member (or on the enemy) still groups under the kit that granted it. Team
 *  order first (the order `slotHue` lists them, which is the order they act), then alphabetical
 *  within a source.
 *
 *  Gear gets its own section above all three — equipped gear has no "source" the way a buff does
 *  (it isn't granted by anything, it's just worn), so every row there is coloured this member's
 *  own hue rather than looked up per row. */
function buffsPopover(member: string, gear: Gear[], local: HeldBuff[], global: HeldBuff[], enemy: HeldBuff[], slotHue: Map<string, string>): string {
  // Gear section disabled for now (its own code below kept, not deleted) — flip GEAR_SECTION_ENABLED
  // back on when it's ready to ship again.
  const showGear = GEAR_SECTION_ENABLED && gear.length > 0;
  if (!showGear && !local.length && !global.length && !enemy.length) return "";
  const order = [...slotHue.keys()];
  const rank = (b: HeldBuff) => { const i = order.indexOf(b.source); return i === -1 ? order.length : i; };
  const sorted = (buffs: HeldBuff[]) => [...buffs]
    .sort((a, b) => rank(a) - rank(b) || a.source.localeCompare(b.source) || a.name.localeCompare(b.name));

  // the name goes in the `.s` cell — the same left-aligned, full-strength, colour-barred column
  // every stat panel puts its own source in, rather than the right-aligned `.v` value column
  const row = (name: string, hue: string) => `<tr><td class="s" style="--own:${hue}">${esc(name)}</td></tr>`;
  const own = slotHue.get(member) ?? FALLBACK_HUE;
  const gearSection = showGear
    ? `<tr class="sec"><td>Gear</td></tr>` + gear.map((g) => row(g.name, own)).join("")
    : "";
  const section = (heading: string, buffs: HeldBuff[]) => (buffs.length
    ? `<tr class="sec"><td>${esc(heading)}</td></tr>`
      + sorted(buffs).map((b) => row(b.name, slotHue.get(b.source) ?? MISC_HUE)).join("")
    : "");
  return `<span class="pop buffs"><table>`
    + `${gearSection}${section("Local buffs", local)}${section("Global buffs", global)}${section("Enemy debuffs", enemy)}</table></span>`;
}

/* -------------------------------------------------------------- comparison table */

/** Sum one slot's own damage, grouped by whatever tag `keyOf` reads off each hit's own action —
 *  `slot: null` includes every slot instead (the DPR table's own Total row, which has no one
 *  member to filter to). Every line here is a single action (this engine has no chain concept —
 *  see kit.ts's own `ChainGroup`), so it reads `line.snap` directly rather than iterating `parts`.
 *  `divisor` scales every bucket down after summing — an Avg-column hover passes the full
 *  4-section total and divides by 4, so each bucket reads as the same per-section average
 *  `total`/`grandTotal` already are, not a 4-section sum. */
function sumByTag(
  lines: ChainGroup[], slot: string | null, keyOf: (a: Action) => string | null, divisor = 1,
): Map<string, number> {
  const by = new Map<string, number>();
  for (const line of lines) {
    const snap = line.snap;
    if (slot != null && snap.slot !== slot) continue;
    const key = keyOf(snap.action);
    if (key == null) continue;
    by.set(key, (by.get(key) ?? 0) + line.avg);
  }
  if (divisor !== 1) for (const [k, v] of by) by.set(k, v / divisor);
  return by;
}

function breakdownSection(heading: string, by: Map<string, number>, total: number): string {
  if (!by.size) return "";
  const rows = [...by].sort((a, b) => b[1] - a[1]);
  const label = (k: string) => k.charAt(0).toUpperCase() + k.slice(1);
  const body = rows.map(([k, v]) => {
    const pct = total ? Math.round((v / total) * 100) : 0;
    return `<tr><td class="k">${esc(label(k))}</td><td class="v">${fmt(v)} <span class="pct">(${pct}%)</span></td></tr>`;
  }).join("");
  return `<tr class="sec"><td colspan="2">${esc(heading)}</td></tr>${body}`;
}

/** Node/Type/Type2 breakdown for one damage value — `slot: null` for a row with no one member to
 *  filter to (a Misc or Total row). */
function damagePopover(
  lines: ChainGroup[], slot: string | null, total: number, grandTotal: number, divisor = 1,
): string {
  const body = breakdownSection("Node", sumByTag(lines, slot, (a) => a.node, divisor), total)
    + breakdownSection("Type", sumByTag(lines, slot, (a) => a.type, divisor), total)
    + breakdownSection("Type 2", sumByTag(lines, slot, (a) => a.type2, divisor), total);
  const pct = grandTotal ? Math.round((total / grandTotal) * 100) : 0;
  return `<span class="pop breakdown"><table>${body}`
    + `<tr class="sum"><td class="k">Total</td><td class="v">${fmt(total)} <span class="pct">(${pct}% of team)</span></td></tr>`
    + `</table></span>`;
}

const SECTION_LABELS = ["Opener", "Loop 1", "Loop 2", "Loop 3"];

/** The hover behind any Avg DPR cell: each of the 4 sections' own raw total, then their raw sum
 *  (Total, over the full 2-minute rotation) and the mean the cell itself displays (Avg) — same
 *  `.pop.breakdown` shell `damagePopover()` uses, just flat rows with no sections. `slot: null`
 *  for the whole team's own Total column; otherwise that one member's (or Misc's) own share, read
 *  off `sectionBySlot` so a member cell breaks down exactly the way the team cell beside it does.
 *
 *  `loadout` prepends that member's own equipped gear as a section above the rotation rows,
 *  closed off by a dotted rule the CSS draws for itself (see index.css's own `.pop .gear + tr`)
 *  — a real member's cell is the only hover they have now, so both readings of their column live
 *  in the one panel. Misc and the team Total pass nothing: neither is a loadout. */
function sectionBreakdownPopover(run: TeamRun, slot: string | null, loadout?: { member: Member; combo: Combo }): string {
  const sections = slot == null ? run.sectionTotals : run.sectionBySlot.map((by) => by.get(slot) ?? 0);
  const avg = slot == null ? run.total : (run.bySlot.get(slot) ?? 0);
  const gear = loadout ? gearRows(loadout.member, loadout.combo) : "";
  const body = sections
    .map((v, i) => `<tr><td class="k">${esc(SECTION_LABELS[i])}</td><td class="v">${fmt(v)}</td></tr>`)
    .join("");
  const total = sections.reduce((a, b) => a + b, 0);
  return `<span class="pop breakdown"><table>${gear}${body}`
    + `<tr class="sum"><td class="k">Total</td><td class="v">${fmt(total)}</td></tr>`
    + `<tr class="sum"><td class="k">Avg</td><td class="v">${fmt(avg)}</td></tr>`
    + `</table></span>`;
}

/** A member's own equipped gear for the one weapon/echo combo this row actually ran: both
 *  Inherent Skills, that combo's own weapon and mainslot echo/sonata/2pc, mainstat/substat rolls
 *  — everything but the resonator itself and its talents buff, which aren't "equipped gear" in
 *  the sense either popover below is showing. Shared so the comparison table's own gear popover
 *  and the rotation table's resonator popover (its own "Gear" section) read off the same list.
 *  Fixed order, one entry per `GEAR_LABELS` slot below. */
function equippedGear(member: Member, combo: Combo): Gear[] {
  const l = member.loadout;
  return [l.inherent1, l.inherent2, combo.weapon, combo.echo.mainslot, combo.echo.sonata, combo.echo.sonata2pc, combo.mainstat, l.substat];
}
const GEAR_LABELS = ["Inherent", "Inherent", "Weapon", "Mainslot", "Sonata", "2pc", "Mainstats", "Substats"];

/** The resonance chain nodes this row actually holds — S1 up to whatever level its own combo
 *  runs at (see `sequenceLevels()`), each named "<name> S<N>: <title>", listed in their own
 *  section below. */
function equippedSequences(member: Member, combo: Combo): Gear[] {
  return member.loadout.sequences().slice(0, combo.sequence);
}

/** Every piece of gear a member's loadout equips, each labelled by slot, with any sequence nodes
 *  listed the same way — full name, no splitting — after the core six, under a single "Sequences"
 *  label shared by the whole group: it sits in the first sequence row's own `.k` cell (S1's), and
 *  every row after it (S2-S6) leaves `.k` blank, same shape the core six's own label column
 *  already uses. `.k`/`.v` reused wholesale from the stat-trace panels (see index.css's own note
 *  by `.pop .gear`) — the label column's gray already matches those, and the browser's own table
 *  layout sizes both columns to their own longest cell with no extra CSS. Every row carries
 *  `.gear`, which is what left-aligns the name column: these are names, not numbers, and the
 *  panel this shares with the rotation breakdown (`sectionBreakdownPopover`) has right-aligned
 *  numeric rows sitting directly underneath them. */
function gearRows(member: Member, combo: Combo): string {
  const core = equippedGear(member, combo);
  const sequences = equippedSequences(member, combo);
  // A kit with a resonance mode runs one loadout per mode (Lucilla's Echo and Glacio Chafe builds
  // are two `Loadout`s, see lucilla.ts), so which one a row is on is a real build fact and belongs
  // here. Kept out of `equippedGear()` because that list is paired index-for-index with
  // `GEAR_LABELS`, and most kits have no mode at all.
  const mode = member.loadout.mode;
  return core
    .map((g, i) => `<tr class="gear"><td class="k">${esc(GEAR_LABELS[i] ?? "")}</td><td class="v">${esc(g.name)}</td></tr>`)
    .join("")
    + (mode ? `<tr class="gear"><td class="k">Mode</td><td class="v">${esc(mode.name)}</td></tr>` : "")
    + sequences
      .map((g, i) => `<tr class="gear"><td class="k">${i === 0 ? "Sequences" : ""}</td><td class="v">${esc(g.name)}</td></tr>`)
      .join("");
}

/** The loadout on its own, for the detail page's own member-name hovers — the comparison table
 *  folds the same rows into its Avg DPR panel instead (`sectionBreakdownPopover`). */
function gearPopover(member: Member, combo: Combo): string {
  return `<span class="pop gear"><table>${gearRows(member, combo)}</table></span>`;
}

/** What a member cell is called, which is a read-out of everything that actually varies from row
 *  to row for that member. Always the resonator, then their sequence level and weapon rank as one
 *  token (`S0R1`): this project never implements S1-S6, so that's S6 for a `standardCharacter`
 *  whose loadout equips its own nodes and S0 for everyone else, and R1 when this row's weapon is
 *  a signature/limited one rather than a standard (see kit.ts's own `Weapon.standard`).
 *
 *  Then, only for an axis whose Show ... Options box is actually open for this member's own role:
 *  their echo set, and their main-stat build. A closed axis is the same pick on every row, so
 *  naming it would just be noise. Both read off `abbreviation` (kit.ts's own `Gear`), which is
 *  the only way they fit in a table cell — and a mainslot without one is left out entirely rather
 *  than printed long, since most of them are damage echoes whose name says nothing about a build. */
function memberLabel(m: Member, combo: Combo): string {
  const l = m.loadout;
  const mdps = l.mainDps;
  // A standard character's own sequence comes with the character, so it's always worth naming; a
  // limited one's is a build choice, which only exists at all while that role's Sequences box is
  // open — and once it is, this is the one thing telling that member's own seven rows apart (see
  // `sequenceLevels()`). And a standard weapon's "R0" says nothing about a build — only a
  // signature earns a rank marker, and only the weapon's own name earns the space R0 wasn't
  // taking (weapons have no abbreviation; the real name is short enough).
  const seq = l.resonator.standardCharacter || (mdps ? filters.mdpsSequences : filters.supportSequences)
    ? `S${combo.sequence}`
    : "";
  // R1 only stands in for a weapon that isn't being named: once the weapon itself is on the row
  // the marker is just saying twice what the name already says.
  const weapons = mdps ? filters.mdpsWeapons : filters.supportWeapons;
  const rank = weapons || combo.weapon.standard ? "" : "R1";

  const options: string[] = [];
  if (weapons) options.push(combo.weapon.name);
  if (mdps ? filters.mdpsEchoes : filters.supportEchoes) {
    const set = [combo.echo.sonata, combo.echo.mainslot].map((g) => g.abbreviation).filter(Boolean).join(" + ");
    // a weapon name is several words with spaces of its own, so the sonata set beside it needs a
    // plus to read as a separate thing — everything else is spaced like the rest of the label
    if (weapons) options[options.length - 1] += ` + ${set}`;
    else options.push(set);
  }
  if (mdps ? filters.mdpsMainstats : filters.supportMainstats) options.push(combo.mainstat.abbreviation ?? "");

  return [l.resonator.name, `${seq}${rank}`, ...options].filter(Boolean).join(" ");
}

/** The filter checkboxes above the comparison table, one row per role: MDPS on top, supports
 *  below, each row the same four axes plus that role's own R1 allowance.
 *
 *  Sequences: with no sequence system for limited resonators (this project never implements
 *  S1-S6 for them — every such build is sequence 0) and a `standardCharacter`'s own S1-S6
 *  unconditionally equipped whatever these say, both boxes are kept for parity with the old
 *  page's own dropdown but hide nothing today. They're scoped to non-standard resonators on
 *  purpose: a standard character being S6 isn't a build choice anyone makes.
 *
 *  Weapons/Echoes/Mainstats: unchecked, that role's own members each run their loadout's own
 *  first-listed pick on that axis and nothing else is even simulated; checked, the axis opens to
 *  every pick the loadout offers and the newly reachable rows are run right then (see
 *  `Filters`/`refresh()`). Allow R1 restricts that role to `standard` weapons only
 *  (weapons/standard.ts, every generation — see kit.ts's own `Weapon.standard`) when unchecked,
 *  on the assumption a signature is only ever owned at R1.
 *
 *  Every id here is a `Filters` key, which is what the change handler in `boot()` keys off to
 *  update it — no id-to-field mapping table in between. The sequence pair opens no new rows the
 *  way the other three axes do (it drops whole teams instead, see `sequenceLevels()`), but it does
 *  change what every member cell is called, so it belongs to the same state and the same redraw. */
function comparisonFilters(): string {
  const filter = (id: keyof Filters, label: string) =>
    `<label>${esc(label)}<input type="checkbox" id="${id}"${filters[id] ? " checked" : ""}></label>`;
  return `<div class="tcfilters">
    <div class="tcfilter-row">
      ${filter("allowR1Mdps", "Allow R1 MDPS")}
      ${filter("mdpsWeapons", "Show MDPS Weapon Options")}
      ${filter("mdpsEchoes", "Show MDPS Echo Options")}
      ${filter("mdpsMainstats", "Show MDPS Mainstat Options")}
      ${filter("mdpsSequences", "Allow MDPS Sequences")}
    </div>
    <div class="tcfilter-row">
      ${filter("allowR1Supports", "Allow R1 Supports")}
      ${filter("supportWeapons", "Show Support Weapon Options")}
      ${filter("supportEchoes", "Show Support Echo Options")}
      ${filter("supportMainstats", "Show Support Mainstat Options")}
      ${filter("supportSequences", "Allow Support Sequences")}
    </div>
    ${resonatorChips()}
  </div>`;
}

/** The resonator filters currently set, one chip apiece under the filter boxes: the name, and a
 *  box saying which way it's filtered — a green tick for "every team must field them", a red
 *  cross for "no team may". Clicking one clears that name (see `boot()`), which is the only way
 *  out other than clicking the name again in the table the same way it was set.
 *
 *  A `<button>`, not a div: it's a real control, so it gets keyboard focus and Enter/Space for
 *  free. Nothing renders at all when no filter is set, rather than an empty row holding open the
 *  gap `.tcfilters` puts between its rows. */
function resonatorChips(): string {
  if (!resonatorFilters.size) return "";
  const chips = [...resonatorFilters].map(([name, mode]) => {
    const included = mode === "include";
    // The pill wears that resonator's own hue the way their name cell in the table does; the
    // tick/cross inside it stays green/red whoever the chip is for, since that's the half that
    // says which way the filter runs (see index.css's own `.rchip`).
    return `<button type="button" class="rchip ${included ? "inc" : "exc"}" data-resonator="${esc(name)}"`
      + ` style="--mem:${RESONATOR_HUE.get(name) ?? MISC_HUE}"`
      + ` title="${esc(name)} — ${included ? "only teams fielding them" : "no team fielding them"}. Click to clear.">`
      + `${esc(name)}<span class="box">${included ? "✓" : "✕"}</span></button>`;
  }).join("");
  return `<div class="tcchips">${chips}</div>`;
}

/** Every row the current filters opened, sorted by team damage — each one's own run read out of
 *  the `results` cache, which `refresh()` has already filled for exactly this row set. */
function comparisonTable(rows: TeamRow[]): string {
  const sorted = rows.map((row) => [row.key, results.get(row.key)!] as const)
    .sort((a, b) => b[1].total - a[1].total);

  const body = sorted.map(([key, run]) => {
    const grand = run.total;
    const memberNames = run.members.map((m) => m.name).join("|");

    // Left click requires this resonator, right click bars them — see the handlers in boot() and
    // `resonatorFilters`. Nothing is drawn in the cell either way; the chips above the table are
    // where a set filter shows. `data-resonator` stays the resonator's own full name, since that's
    // what the filter keys off; only the visible label is the abbreviated build line. No hover of
    // its own: the loadout it used to show is a section of the DPR cell's own panel now.
    const memberCell = (m: Member, combo: Combo) =>
      `<div class="c name res" data-resonator="${esc(m.name)}" style="--mem:${m.color};color:${m.color}">`
      + `<span class="res-label">${esc(memberLabel(m, combo))}</span>`
      + `</div>`;
    // The DPR cell beside a member's own name carries that same member's colour wash (`.memdpr`,
    // same trick `.name` uses, just its own class so it doesn't inherit the name column's left
    // bar/full-strength text) and the whole of that member's own panel: their loadout, then their
    // Opener/Loop breakdown — the same breakdown the Team DPR cell at the end of the row shows
    // for the whole team.
    const dmgCell = (slot: string, hue: string, loadout?: { member: Member; combo: Combo }) => {
      const total = run.bySlot.get(slot) ?? 0;
      return `<div class="c num memdpr has" style="--mem:${hue}">${fmt(total)}`
        + `${sectionBreakdownPopover(run, slot, loadout)}</div>`;
    };

    const memberPairs = run.members
      .map((m, i) => memberCell(m, run.combo[i]!) + dmgCell(m.name, m.color, { member: m, combo: run.combo[i]! }))
      .join("");

    return `<div class="trow" data-team="${esc(key)}" data-team-key="${esc(run.teamKey)}"`
      + ` data-members="${esc(memberNames)}" data-total="${grand}">`
      + memberPairs
      + dmgCell(MISC, MISC_HUE)
      + `<div class="c num total teamdpr gotodetail" data-team="${esc(key)}">${fmt(grand)}<span class="arrow">›</span>${sectionBreakdownPopover(run, null)}</div>`
      // both the heat tint (`--ratio`, on the row) and the percentage itself are written by
      // rankRows() — they're relative to the lowest team *currently on the page*, which
      // this render doesn't know
      + `<div class="c num total baseline"></div>`
      + `</div>`;
  }).join("");

  const head = `<div class="trow thead">`
    + `<div class="c">Member 1</div><div class="c num">Avg DPR 1</div>`
    + `<div class="c">Member 2</div><div class="c num">Avg DPR 2</div>`
    + `<div class="c">Member 3</div><div class="c num">Avg DPR 3</div>`
    + `<div class="c num">Avg DPR Misc</div>`
    + `<div class="c num">Avg Total DPR</div>`
    + `<div class="c num">% of Baseline</div>`
    + `</div>`;

  // the count itself is written by `rankRows()`, which is what actually knows how many
  // rows survive the resonator checkboxes — it runs immediately after every render
  return `<main>${comparisonFilters()}<h2 class="summary-label" id="teamCount"></h2><div class="tcwrap"><div class="tgrid">${head}${body}</div></div></main>`;
}

/** No filtering left at the DOM level — every axis, the resonator checkboxes included, decides
 *  which rows *exist* rather than which are hidden, so nothing off-screen is ever optimized, run
 *  or rendered. What's left is the two things that can only be known once the rows are on the
 *  page and is the same either way: how many there are, and how they rank against each other. */
function rankRows(): void {
  const rows = [...document.querySelectorAll<HTMLElement>(".trow:not(.thead)")];
  const label = document.getElementById("teamCount");
  if (label) label.textContent = `${fmt(rows.length)} teams`;
  rankVisible(rows);
}

/** The baseline column and the heat tint it shares with Team DPR, both measured against the
 *  weakest team *currently on screen* rather than the weakest ever built — filtering the table
 *  down to a few teams re-bases both, so the comparison is always between the rows actually being
 *  looked at. The percentage is that ratio outright (the weakest visible row reads 100.00%); the
 *  tint spreads it across the visible spread, so the weakest lands red and the strongest green
 *  however narrow or wide that spread happens to be. */
function rankVisible(rows: HTMLElement[]): void {
  const totals = rows.map((row) => Number(row.dataset.total));
  const minTotal = Math.min(...totals);
  const maxRatio = Math.max(...totals.map((t) => (minTotal ? t / minTotal : 1)));
  rows.forEach((row, i) => {
    const ratio = minTotal ? totals[i]! / minTotal : 1;
    // the tint spreads the *log* of the ratio, not the ratio: damage differences are
    // multiplicative, so a linear spread bunches most of the table into the low end behind one
    // runaway team. In log space every equal-sized *relative* gap gets an equal-sized step of
    // colour, which is what makes the gradient read smoothly however far the top row is out.
    row.style.setProperty("--ratio", String(maxRatio > 1 ? Math.log(ratio) / Math.log(maxRatio) : 1));
    const cell = row.querySelector<HTMLElement>(".c.baseline");
    if (cell) cell.textContent = `${fmt(ratio * 100, 2, true)}%`;
  });
}

/* --------------------------------------------------------------------- table */

function stepRow(
  columns: Column[], row: ReportRow | ReportPart, slotHue: Map<string, string>, gearByMember: Map<string, Gear[]>,
  { part = false }: { part?: boolean } = {},
): string {
  return columns.map((col, i) => {
    const v = row.raw[col.key];
    const sources = row.sources[col.key];
    const cls: string[] = [];
    if (col.key === "action") cls.push(part ? "name" : "action");
    if (col.key === "avg") cls.push("avg");
    if (col.key === "member") cls.push("member");
    // a genuine stat buff moved this cell's own value, not just its usual carried/declared trace
    // (see display.ts's own ReportRow.buffed) — mv, and the three running resources
    if (BUFF_UNDERLINE_COLUMNS.has(col.key) && row.buffed.has(col.key)) cls.push("buffed");
    // an outro fired without a full 100-point concerto bar banked — never true off a non-outro
    // row, concertoSpent only ever moves on one (see display.ts's own rowValues())
    if (col.key === "concerto" && Number(row.raw.isOutro) && Number(row.raw.concertoSpent) < 100) {
      cls.push("underspent");
    }
    // a forte gauge that's gone negative — kit.ts's own forte gauges have no floor, so a kit
    // whose declared spend outruns what's actually held really can dip below 0 (see e.g.
    // Galbrena's own Purging Flame)
    if (col.key.startsWith("gauge:") && typeof v === "number" && v < 0) cls.push("negative");

    const text = esc(fmt(v, col.digits ?? 0, PAD_DIGITS_COLUMNS.has(col.key)))
      + (col.percent && typeof v === "number" ? "%" : "");
    let html = sources ? `<span class="has">${text}</span>` : text;
    if (col.key === "action" && !part && "parts" in row && row.parts.length) {
      html = `${html}<span class="caret">▸</span>`;
    }
    const suffix = col.key === "mv" && row.scaling
      ? ` ${SCALING_LABEL[row.scaling] ?? row.scaling}` : "";
    if (col.key === "action") {
      html += infoPopover("info" in row ? row.info : undefined);
    } else if (col.key === "member" && "line" in row) {
      const gear = gearByMember.get(row.line.snap.member) ?? [];
      html += buffsPopover(row.line.snap.member, gear, row.line.snap.heldLocal, row.line.snap.heldGlobal, row.line.snap.heldEnemy, slotHue);
    } else {
      html += popover(col, sources, v, slotHue, suffix);
    }

    const mem = slotHue.get(String(v)) ?? FALLBACK_HUE;
    const style = col.key === "member" ? `--mem:${mem};color:${mem}` : "";

    return cell(columns, i, { cls, html, style });
  }).join("");
}

function partRows(columns: Column[], parts: ReportPart[], slotHue: Map<string, string>, gearByMember: Map<string, Gear[]>): string {
  return parts
    .map((p) => `<div class="r${p.short ? " short" : ""}">${stepRow(columns, p, slotHue, gearByMember, { part: true })}</div>`)
    .join("");
}

/** The whole team's rotation as one table, in the order they act. A row's own wash is whoever
 *  acted's colour, always — an echo-cast row (the rotation marker standing in for whichever
 *  mainslot echo is equipped, see kit.ts's own `run()`) still belongs to whoever's turn it was
 *  and is still shown at full strength here; only its dimmed/short treatment marks it as not a
 *  kit's own button press (`triggered`, from `run()`). */
function rotationTable(report: Report, slotHue: Map<string, string>, gearByMember: Map<string, Gear[]>): string {
  const columns = report.columns;
  const cols = columns.map((c, i) => colWidth(c, i)).join(" ");

  const head = columns
    .map((c, i) => cell(columns, i, { html: esc(c.label) }))
    .join("");

  const steps = report.rows.map((row, i) => {
    const snap = row.line.snap;
    const hue = slotHue.get(snap.member) ?? FALLBACK_HUE;
    const style = ` style="--m:${hue}"`;
    const cells = stepRow(columns, row, slotHue, gearByMember);
    const shortCls = row.short ? " short" : "";
    if (!row.parts.length) {
      return `<div class="step"${style}><div class="r${shortCls}">${cells}</div></div>`;
    }
    const id = `x${i}`;
    return `<div class="step chain"${style}>`
      + `<input class="tgl" type="checkbox" id="${id}">`
      + `<label class="r${shortCls}" for="${id}">${cells}</label>`
      + `<div class="parts">${partRows(columns, row.parts, slotHue, gearByMember)}</div>`
      + `</div>`;
  }).join("");

  const totalRow = columns.map((c, i) => cell(columns, i, {
    html: i === 0 ? "team total" : c.key === "avg" ? fmt(report.total) : "",
  })).join("");

  return `<div class="gridwrap"><div class="grid" style="--cols:${cols}">
    <div class="r head">${head}</div>
    ${steps}
    <div class="r totalrow">${totalRow}</div>
  </div></div>`;
}

/* ----------------------------------------------------------------- page pieces */

/** Damage per rotation: one row per member (loadout hover on the name cell), then Misc and a
 *  Total row (plain name, nothing to hover — neither is a real loadout). Every damage value in
 *  the table carries its own Node/Type/Type2 breakdown instead (`damagePopover()`, moved here
 *  from the comparison page's own per-member DPR cell) — `slot: null` on the Total row, which has
 *  no one member/Misc to filter to. Opener/Loop 1-3 read each section's own report; Total (2min)
 *  reads the combined 4-section report built by `detailFor()`; Avg is that same total divided
 *  across the 4 sections, matching the comparison page's own Avg Total DPR. */
function dprTable(run: TeamRun, lines: ChainGroup[][], report: Report, rotationReports: Report[]): string {
  const sections = rotationReports.map((r) => totalsBySlot(r));
  const combined = totalsBySlot(report);
  const flat = lines.flat();
  const n = rotationReports.length;

  const head = `<div class="rtrow rthead">`
    + `<div class="c"></div>`
    + `<div class="c num">Opener</div><div class="c num">Loop 1</div>`
    + `<div class="c num">Loop 2</div><div class="c num">Loop 3</div>`
    + `<div class="c num">Total</div><div class="c num">Avg</div>`
    + `</div>`;

  const valueCell = (lines: ChainGroup[], slot: string | null, value: number, grand: number, divisor = 1): string =>
    `<div class="c num has">${fmt(value)}${damagePopover(lines, slot, value, grand, divisor)}</div>`;

  const dataRow = (slot: string, color: string, hover: string): string => `<div class="rtrow">`
    + `<div class="c name" style="--mem:${color}">${esc(slot)}${hover}</div>`
    + lines.map((sec, i) => valueCell(sec, slot, sections[i]!.get(slot) ?? 0, rotationReports[i]!.total)).join("")
    + valueCell(flat, slot, combined.get(slot) ?? 0, report.total)
    + valueCell(flat, slot, (combined.get(slot) ?? 0) / n, report.total / n, n)
    + `</div>`;

  const memberRows = run.members.map((m, i) => dataRow(m.name, m.color, gearPopover(m, run.combo[i]!))).join("");
  // Misc gets the tune-break hue and the same bar/wash as a real member — it isn't a loadout, so
  // it has no gear hover, but it is a damage source and reads as one.
  const miscRow = dataRow(MISC, MISC_HUE, "");
  const totalRow = `<div class="rtrow total">`
    + `<div class="c name">Total</div>`
    + lines.map((sec, i) => valueCell(sec, null, rotationReports[i]!.total, rotationReports[i]!.total)).join("")
    + valueCell(flat, null, report.total, report.total)
    + valueCell(flat, null, report.total / n, report.total / n, n)
    + `</div>`;

  return `<div class="rtable dpr">${head}${memberRows}${miscRow}${totalRow}</div>`;
}

/** Index of the first `resetEnergy`-marked action `member` casts within `flat[from, to)` — null
 *  if they never cast one in that span (see kit.ts's own `ActionDef.resetEnergy`). */
function findResetIndex(flat: ChainGroup[], from: number, to: number, member: string): number | null {
  for (let i = from; i < to; i++) {
    const snap = flat[i]!.snap as ResolvedSnapshot;
    if (snap.member === member && snap.action.resetEnergy) return i;
  }
  return null;
}

/** How much more ER (as a % of the 100% baseline every declared energy figure already assumes)
 *  this member would need for their build to actually have Resonance Liberation up by that loop's
 *  own first cast — maxEnergy ÷ RealEnergy right before it, see kit.ts's own realEnergyBefore.
 *
 *  A Liberation that costs no Resonance Energy at all (`maxEnergy: 0` — Phrolova and Lucilla) has
 *  nothing to bank, so it is up regardless of the build: that's a requirement of 0, a real answer,
 *  not the absent one a `—` reads as. Null is kept for the case that genuinely has no answer —
 *  a loop whose own marked cast is never reached. */
function erRequirementValue(maxEnergy: number, before: number | null): number | null {
  if (!maxEnergy) return 0;
  if (before == null || before <= 0) return null;
  return (maxEnergy / before) * 100;
}

/** Whether `member`'s own real ER stat ever fell short of `requirement` on one of *their own*
 *  actions since their last RealEnergy reset (a teammate's action in between doesn't count — it
 *  only ever moves RealEnergy via the flat team-share, never this member's own ER) — walking
 *  backward from `targetIdx` (this loop's own reset cast, included) and stopping at the previous
 *  occurrence of member's own `resetEnergy` cast (excluded — that one belongs to the prior window). */
function erFallsShort(flat: ChainGroup[], targetIdx: number, member: string, requirement: number): boolean {
  for (let i = targetIdx; i >= 0; i--) {
    const snap = flat[i]!.snap as ResolvedSnapshot;
    if (snap.member !== member) continue;
    if (i !== targetIdx && snap.action.resetEnergy) break;
    if (snap.stat(Stat.Er) < requirement) return true;
  }
  return false;
}

/** Energy Requirements: one row per member (same gear-loadout hover as the DPR table above), one
 *  column per loop — the opener has no column since its own requirement is always 0 (RealEnergy
 *  starts a fight already filled, see kit.ts). A cell gets a red underline when the member's own
 *  ER stat dipped below the shown requirement on any of their own actions since their last reset —
 *  see `erFallsShort()`. */
function energyTable(run: TeamRun, lines: ChainGroup[][]): string {
  const flat = lines.flat();
  // cumulative start index of each of the 4 sections within `flat` — offsets[i] is where section
  // i begins, so section i's own lines span flat[offsets[i], offsets[i + 1])
  const offsets = [0];
  for (const sec of lines) offsets.push(offsets[offsets.length - 1]! + sec.length);

  const head = `<div class="rtrow rthead">`
    + `<div class="c"></div>`
    + `<div class="c num">Loop 1</div><div class="c num">Loop 2</div><div class="c num">Loop 3</div>`
    + `</div>`;

  const rows = run.members.map((m, idx) => {
    const maxEnergy = run.state.slots.find((s) => s.name === m.name)?.resonator?.maxEnergy ?? 0;
    const cells = [1, 2, 3].map((i) => {
      const resetIdx = findResetIndex(flat, offsets[i]!, offsets[i + 1]!, m.name);
      const before = resetIdx == null ? null : (flat[resetIdx]!.snap as ResolvedSnapshot).realEnergyBefore;
      const req = erRequirementValue(maxEnergy, before);
      const warn = req != null && resetIdx != null && erFallsShort(flat, resetIdx, m.name, req);
      const text = req == null ? "—" : `${fmt(req, 1)}%`;
      return `<div class="c num${warn ? " er-under" : ""}">${text}</div>`;
    }).join("");
    return `<div class="rtrow">`
      + `<div class="c name" style="--mem:${m.color}">${esc(m.name)}${gearPopover(m, run.combo[idx]!)}</div>`
      + cells
      + `</div>`;
  }).join("");

  return `<div class="rtable energy">${head}${rows}</div>`;
}

function page(run: TeamRun): string {
  const { report, rotationReports } = detailFor(run);
  // detailFor() has just guaranteed these exist (re-running the team traced if need be)
  const lines = run.rotationLines!;
  const { members } = run;
  const slotHue = new Map([...members.map((m): [string, string] => [m.name, m.color]), [MISC, MISC_HUE]]);
  const gearByMember = new Map(members.map((m, i): [string, Gear[]] => [m.name, equippedGear(m, run.combo[i]!)]));

  return `<main>
  <div class="rtables">
    <div class="rtable-block">
      <h2 class="summary-label">damage per rotation</h2>
      ${dprTable(run, lines, report, rotationReports)}
    </div>
    <div class="rtable-block">
      <h2 class="summary-label">energy requirements</h2>
      ${energyTable(run, lines)}
    </div>
  </div>
  <h2 class="summary-label">action log</h2>
  ${rotationTable(report, slotHue, gearByMember)}
</main>`;
}

function errorPage(err: unknown): string {
  const looksLikeFileUrl = location.protocol === "file:";
  const hint = looksLikeFileUrl
    ? `This page was opened straight off disk. Browsers refuse to load ES modules or
       <code>fetch()</code> data over <code>file://</code>, so it has to be served — run
       <code>python -m http.server 8000</code> in this directory and open
       <code>http://localhost:8000/</code>.`
    : `The engine threw while running the team. The stack below points at the file to look at.`;

  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  return `<div class="error">
  <h2>Could not run the team</h2>
  <p>${hint}</p>
  <pre>${esc(message)}</pre>
</div>`;
}

/* ------------------------------------------------------------- source panels */

/** Show the panel listing every buff that fed a value, when its cell is hovered. Pure DOM
 *  wiring — no engine dependency, so this is unchanged from the old page. */
function wireSourcePanels(root: HTMLElement): void {
  const GAP = 4, EDGE = 6;
  let open: HTMLElement | null = null;
  let openHome: Element | null = null;

  document.body.querySelectorAll(":scope > .pop").forEach((el) => el.remove());

  const close = (): void => {
    if (open) {
      open.style.display = "";
      if (openHome && open.parentElement !== openHome) openHome.appendChild(open);
    }
    open = null;
    openHome = null;
  };

  const place = (cell: Element, pop: HTMLElement): void => {
    if (pop.parentElement !== document.body) document.body.appendChild(pop);
    pop.style.visibility = "hidden";
    pop.style.display = "block";
    const c = cell.getBoundingClientRect();
    const p = pop.getBoundingClientRect();

    // Every panel is anchored by its own left edge to the cell's, so it opens rightward into the
    // page. `.num` cells used to anchor their right edge to the cell's instead — lining the panel
    // up under a right-aligned number — but these panels are wide (a loadout's gear names) and
    // that threw them leftward off the columns they belong to, and off the page entirely on the
    // leftmost ones. Growing rightward from a fixed left edge keeps them over the table.
    const natural = c.left;
    // Clamped to the table's own box, not just the viewport — `EDGE` alone let a panel opened on
    // a narrow leftmost column (the member column) bleed out past the table's own left edge and
    // into the page's margin, since a viewport-relative clamp has no idea where the table itself
    // starts.
    const tableLeft = (cell.closest(".gridwrap, .tcwrap")?.getBoundingClientRect().left ?? EDGE);
    const minLeft = Math.max(EDGE, tableLeft);
    const left = Math.max(minLeft, Math.min(natural, innerWidth - p.width - EDGE));
    const below = c.bottom + GAP;
    const top = below + p.height > innerHeight - EDGE
      ? Math.max(EDGE, c.top - p.height - GAP)
      : below;

    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
    pop.style.visibility = "";
    open = pop;
    openHome = cell;
  };

  const panelIn = (target: EventTarget | null): { cell: Element | null; pop: HTMLElement | null } => {
    const cell = (target as Element | null)?.closest?.(".c") ?? null;
    if (!cell) return { cell: null, pop: null };
    const pop = (open && openHome === cell) ? open : cell.querySelector<HTMLElement>(":scope > .pop");
    return { cell, pop };
  };

  document.addEventListener("mouseover", (e) => {
    if (open && open.contains(e.target as Node)) return;
    const { cell, pop } = panelIn(e.target);
    if (pop === open) return;
    close();
    if (pop) place(cell!, pop);
  });

  document.addEventListener("mouseout", (e) => {
    const to = e.relatedTarget as Node | null;
    if (to && (root.contains(to) || (open && open.contains(to)))) return;
    close();
  });

  // A caret click expands or collapses rows underneath the panel, which leaves it floating over
  // whatever has moved into that spot — drop it and let the next mouseover re-place it. Nothing
  // else here is click-driven any more: a panel is purely a hover now, never pinned open.
  addEventListener("click", (e) => {
    const { cell } = panelIn(e.target);
    if (cell?.querySelector(":scope > .caret")) close();
  });

  addEventListener("scroll", close, true);
  addEventListener("resize", close);
}

/* ----------------------------------------------------------------------- mount */

const app = document.getElementById("app")!;
const backLink = document.getElementById("backLink")!;

/** Every combo ever run this session, keyed by its own `TeamRow.key` — the cache the whole lazy
 *  scheme rests on. A row is simulated the first time some checkbox opens it and never again, and
 *  a detail-page hash stays valid for as long as the page lives even after its own row has been
 *  filtered back out of the table. */
const results = new Map<string, TeamRun>();

/** The rows the current filters open, i.e. exactly what the comparison table renders. */
let visibleRows: TeamRow[] = [];

/* --------------------------------------------------------------- state in the URL */

/**
 * The whole page state lives in the hash, so a refresh — or the dev server's own hot reload —
 * comes back to the same table: every filter box, every checked resonator, and whichever detail
 * page was open. It's a query string once the leading `#` is off, so `URLSearchParams` reads it.
 *
 * `f` lists the filter keys that are *on*, by name rather than as a bit per box, so an old link
 * survives a `Filters` key being added, removed or reordered: an unrecognised name is ignored and
 * a missing one simply reads as off. Present-but-empty (`f=`) is every box unchecked, which is a
 * different thing from absent — absent means the URL carries no state at all and the defaults
 * stand, which is what makes an old bare `#team=...` link still work.
 */
const hashParams = (): URLSearchParams => new URLSearchParams(location.hash.replace(/^#/, ""));

const FILTER_KEYS = Object.keys(filters) as (keyof Filters)[];

/** Pull the hash's own state into `filters`/`resonatorFilters`, and say whether either actually
 *  moved — both decide which rows *exist* (see `expandTeam()`/`teamWanted()`), so a caller that
 *  gets `true` owes a full `refresh()` rather than just a re-route. */
function applyHash(): boolean {
  const params = hashParams();
  let changed = false;

  const f = params.get("f");
  if (f !== null) {
    const on = new Set(f.split(",").filter(Boolean));
    for (const key of FILTER_KEYS) {
      if (filters[key] === on.has(key)) continue;
      filters[key] = on.has(key);
      changed = true;
    }
  }

  // `f` is written on every sync, so its presence is what marks a URL as one this page wrote —
  // which makes a missing `r`/`x` there mean "nothing filtered" rather than "say nothing about it".
  // Without it (an old bare `#team=...` link) the defaults stand, Verina's bar included.
  if (params.has("f")) {
    const named = (v: string | null, mode: ResonatorFilter): [string, ResonatorFilter][] =>
      (v ?? "").split(",").filter(Boolean).map((name) => [name, mode]);
    const next = new Map([...named(params.get("x"), "exclude"), ...named(params.get("r"), "include")]);
    if (next.size !== resonatorFilters.size || [...next].some(([n, m]) => resonatorFilters.get(n) !== m)) {
      resonatorFilters.clear();
      for (const [name, mode] of next) resonatorFilters.set(name, mode);
      changed = true;
    }
  }
  return changed;
}

/** Write the current state back into the URL. `team` defaults to whatever detail route is already
 *  open, so flipping a filter keeps the page you're on; pass a key to navigate to one, `null` to
 *  leave for the table. Only resonator names need encoding — they carry spaces ("Aero Rover") —
 *  since filter keys are identifiers and a row key is plain by construction (see `TeamRow`).
 *
 *  `replaceState`, not an assignment to `location.hash`: the page holds one history entry and
 *  keeps rewriting it, so ticking six boxes doesn't bury the page the user arrived from under six
 *  Back presses. It also fires no `hashchange` at all, which is why every caller here routes for
 *  itself — see the handler in `boot()`, which now only ever sees a real navigation. */
function syncHash(team: string | null = hashParams().get("team")): void {
  const named = (mode: ResonatorFilter): string => [...resonatorFilters]
    .filter(([, m]) => m === mode).map(([name]) => encodeURIComponent(name)).join(",");
  const parts = [`f=${FILTER_KEYS.filter((k) => filters[k]).join(",")}`];
  if (named("include")) parts.push(`r=${named("include")}`);
  if (named("exclude")) parts.push(`x=${named("exclude")}`);
  if (team) parts.push(`team=${team}`);
  const next = `#${parts.join("&")}`;
  if (next === location.hash) return;
  history.replaceState(null, "", next);
}

/** `TEAMS` only names team compositions, not the individual combo rows the table actually renders
 *  (a row's own combo indices aren't known until `expandTeam()` runs), so a route is valid iff
 *  `results` has actually run it. */
const routeTeam = (): string | null => {
  const key = hashParams().get("team");
  return key && results.has(key) ? key : null;
};

function renderComparison(): void {
  backLink.hidden = true;
  app.innerHTML = comparisonTable(visibleRows);
  app.className = "";
  rankRows();
}

function renderDetail(key: string): void {
  backLink.hidden = false;
  app.innerHTML = page(results.get(key)!);
  app.className = "";
}

/** Whether the comparison table's own rows have been asked for yet. A `#team=...` cold load never
 *  asks (see `bootDetail()`), so the first trip to the table — the back link, or a hashchange off
 *  the detail route — is what triggers the build. Set the moment `refresh()` commits rather than
 *  when it finishes, so the `route()` inside it doesn't re-enter. */
let tableRequested = false;

const route = (): void => {
  const key = routeTeam();
  if (key) { renderDetail(key); return; }
  if (!tableRequested) { void refresh(); return; }
  renderComparison();
};

/** Wait for the browser to actually paint.
 *
 *  Two frames, not one: inside a `requestAnimationFrame` callback the frame is still being built,
 *  so resolving there would hand the thread straight back to a blocking team run and the width
 *  set a moment ago would never reach the screen. The second callback only fires once the first
 *  frame has been committed. A bare `setTimeout` can't promise that. */
const paint = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

/** The loading overlay (index.html's own `#loading`) and the three things inside it this file
 *  writes to. It floats over `#app` and blurs it rather than replacing it, so the table's own
 *  filters and header stay on screen — and stay legible — for the whole run. */
const overlay = document.getElementById("loading")!;
const overlayStatus = overlay.querySelector<HTMLElement>(".status-text")!;
const overlayCount = overlay.querySelector<HTMLElement>(".progress-count")!;
const overlayFill = overlay.querySelector<HTMLElement>(".progress-fill")!;

/** Put the overlay up (or move it to a new phase) and show one line of status under the bar's own
 *  progress. `paint()`ing after is the caller's job — a phase label that never reaches the screen
 *  before the blocking work starts is the same as not setting it. */
function overlayPhase(text: string, count = ""): void {
  overlayStatus.textContent = text;
  overlayCount.textContent = count;
  overlay.hidden = false;
}

/**
 * Run every row the filters have opened that hasn't been run before, and nothing else — the whole
 * point of keying rows by combo index (see `Filters`). A first load with every Show ... Options
 * box unchecked is one row per team; ticking a box runs only the rows that box newly reached,
 * since everything else is already in `results`.
 *
 * `runTeam()` is synchronous and blocks the main thread for its whole run, so the progress bar can
 * only move if this loop yields a frame — without that, every width assignment would be collapsed
 * into one repaint after the last row finished, which is the same as having no bar at all. The
 * yield is throttled to roughly every 50ms of wall-clock work rather than one per row: a row costs
 * a couple of milliseconds (`runTeam()` computes only the comparison table's own cheap numbers —
 * see its own comment), so yielding unconditionally would let paint()'s own two-frame wait
 * (~33ms) dominate the whole loop.
 */
async function runMissing(rows: TeamRow[]): Promise<void> {
  const missing = rows.filter((row) => !results.has(row.key));
  if (!missing.length) return;

  // "Initializing…" is what's on screen at parse time (see index.html); swap to the real status
  // text only once team runs are actually about to start, not a moment before.
  overlayPhase("Running Rotations…");

  // The bar measures the whole table, not just the part of it being run: rows already cached from
  // an earlier filter state start it partly filled rather than counting up to a total that turns
  // out to be smaller than the table it lands on. Only the missing rows are actually run.
  const cached = rows.length - missing.length;
  const progress = (done: number): void => {
    overlayFill.style.width = `${(done / rows.length) * 100}%`;
    overlayCount.textContent = `${fmt(done)} / ${fmt(rows.length)}`;
  };

  progress(cached);
  let lastPaint = performance.now();
  for (let i = 0; i < missing.length; i++) {
    const row = missing[i]!;
    results.set(row.key, runTeam(row.teamKey, row.members, row.combo));
    progress(cached + i + 1);
    if (performance.now() - lastPaint > 50) {
      await paint();
      lastPaint = performance.now();
    }
  }
  await paint(); // the finished bar, before the render phase takes the thread again
}

/** The one yield the main-thread fallback needs: `solveTeam()` blocks for a whole team, so the
 *  progress bar can only move if this lets go between them. Throttled, since a team is ~25ms and
 *  `paint()`'s own two-frame wait is ~33ms — yielding after every one would double the run. */
let lastPaint = performance.now();
async function breathe(): Promise<void> {
  if (performance.now() - lastPaint <= 50) return;
  await paint();
  lastPaint = performance.now();
}

/* ------------------------------------------------------------------- the worker pool */

/**
 * The build search runs off the main thread, one team per message.
 *
 * Teams are the natural unit: each is a completely independent search over its own three loadouts
 * (see solver.ts), nothing is shared but the immutable loadout definitions every worker imports
 * its own copy of, and one team is ~25ms of work — big enough that the message round trip
 * disappears, small enough that the pool stays evenly fed to the end.
 *
 * Workers are created once and kept for the session: spinning one up means fetching and parsing
 * the whole engine module graph, which costs more than most single filter flips would save.
 */
const WORKER_LIMIT = 8;

/** `null` once construction has failed — no Workers here (an old browser, a `file://` page, a
 *  Content-Security-Policy that forbids them), so `ensureBestPicks()` solves on this thread
 *  instead. Never a silent difference in results: both paths call the same `solveTeam()`. */
let pool: Worker[] | null = null;
let poolTried = false;

function workerPool(): Worker[] | null {
  if (poolTried) return pool;
  poolTried = true;
  // one per core, less the one this thread is using, capped — past a handful the run is bounded by
  // how fast the main thread can hand out work and file away the answers, not by the search
  const want = Math.max(1, Math.min(WORKER_LIMIT, (navigator.hardwareConcurrency || 4) - 1));
  try {
    pool = Array.from({ length: want }, () =>
      new Worker(new URL("./src/worker.js", import.meta.url), { type: "module" }));
  } catch (err) {
    console.warn("Workers unavailable, optimizing on the main thread instead:", err);
    pool = null;
  }
  return pool;
}

/**
 * Hand `teams` out across the pool, at most one team in flight per worker, and file each answer
 * away as it lands. Resolves once every team has come back.
 *
 * A worker that throws is not fatal: that team is solved on this thread instead, so the table is
 * always complete. `onmessage`/`onerror` are re-pointed per task rather than accumulating
 * listeners, since a worker only ever has one task at a time.
 */
function solveOnWorkers(
  workers: Worker[], teams: [string, Member[]][], onDone: () => void,
): Promise<void> {
  return new Promise((resolve) => {
    let next = 0, live = 0, id = 0;
    const pump = (w: Worker): void => {
      if (next >= teams.length) {
        if (--live === 0) resolve();
        return;
      }
      const [key, members] = teams[next++]!;
      const finish = (solved: { picks: Pick[]; variants: SolvedVariation[] }): void => {
        storeSolved(key, solved);
        onDone();
        pump(w);
      };
      w.onmessage = ({ data }: MessageEvent<SolveResponse>) => finish(data);
      w.onerror = (e) => {
        console.warn(`worker failed on ${key}, solving it here:`, e.message);
        e.preventDefault();
        finish(solveTeam(key, members, filters));
      };
      const request: SolveRequest = {
        id: id++, teamKey: key, loadouts: members.map((m) => loadoutName(m.loadout)), filters,
      };
      w.postMessage(request);
    };
    // one task per worker to start; each completion pulls the next, so a slow team can't leave the
    // rest of the pool idle waiting on a fixed-size slice
    for (const w of workers.slice(0, teams.length)) { live++; pump(w); }
    if (live === 0) resolve();
  });
}

/** Find every team's own best build for the R1 allowances currently set, unless that's already
 *  been done — the phase that has to finish before a row set even exists, since a closed axis
 *  collapses to a member's own best pick. Cached per team, so this only runs on a cold load or
 *  after an R1 box changes which weapons a role may hold. */
async function ensureBestPicks(): Promise<void> {
  const inPlay = Object.entries(TEAMS).filter(([, members]) => teamWanted(members));
  const teams = inPlay.filter(([key, members]) => {
    const best = bestPicks.get(bestKey(key));
    if (!best) return true;
    // already optimized, but a newly opened box may want alternatives costed that never were
    return variationsOf(members, best, filters).some((v) => !variantMainstats.has(variantKey(key, v)));
  });
  if (!teams.length) return;

  overlayPhase("Optimizing Echoes...");
  // Same as `runMissing()`: the bar measures every team the table will show, not just the ones
  // with work left, so teams optimized under an earlier filter state start it partly filled
  // rather than counting up to a total smaller than the table it lands on.
  let done = inPlay.length - teams.length;
  const progress = (): void => {
    overlayFill.style.width = `${(done / inPlay.length) * 100}%`;
    overlayCount.textContent = `${fmt(done)} / ${fmt(inPlay.length)}`;
  };
  progress();

  // a role with no weapon it may hold has no build at all, and its teams drop out of the table
  const solvable = teams.filter(([, members]) => members.every((m) => eligibleWeapons(m.loadout, filters).length));
  done += teams.length - solvable.length;

  const pool = workerPool();
  if (pool) await solveOnWorkers(pool, solvable, () => { done++; progress(); });
  else {
    for (const [key, members] of solvable) {
      storeSolved(key, solveTeam(key, members, filters));
      done++;
      progress();
      // no worker to hand this to, so the bar can only move if this thread lets go between teams
      await breathe();
    }
  }
  await paint();
}

/**
 * Re-expand every team under the current filters, run whatever that newly opened, and redraw.
 *
 * Three phases, each one visible: the rows already cached are drawn first (nothing at all on a
 * cold load — an empty table, which is the point: filters and header on screen immediately), then
 * the missing rows run under the progress bar, then the full table is built. That last phase gets
 * its own status line because it isn't free — building thousands of rows of markup blocks the
 * thread for a noticeable beat after the bar has already filled, which otherwise reads as a hang.
 */
async function refresh(): Promise<void> {
  tableRequested = true; // committed, so route()'s own lazy build below doesn't re-enter
  try {
    // kicked off before the first render, not after: each worker fetches and parses its own copy of
    // the engine module graph on the way up, and that overlaps with drawing the empty table
    workerPool();
    if (!visibleRows.length) route(); // cold load: the empty table under the overlay, filters and all
    await ensureBestPicks();
    const rows = teamRows();
    const cached = rows.filter((row) => results.has(row.key));
    visibleRows = cached;
    route();
    await runMissing(rows);
    // nothing was missing — the draw above was already the whole table, so don't build it twice
    if (cached.length !== rows.length) {
      overlayPhase("Rendering Table…");
      await paint();
      visibleRows = rows;
      route();
    }
  } catch (err) {
    console.error(err);
    app.innerHTML = errorPage(err);
    app.className = "";
  }
  overlay.hidden = true;
}

/**
 * A `#team=...` load, served without touching the rest of the table: the row is rebuilt from its
 * own key (`rowFromKey()`) and run on its own, so a direct link — or a hot reload sitting on one —
 * costs a single team run rather than optimizing every team and running every row they open.
 *
 * Run traced from the start, since `detailFor()` needs the resolved lines anyway and would
 * otherwise re-run the same team a second time to get them.
 *
 * `false` if there's no detail route to serve, or the key is stale — the caller then builds the
 * table as usual and `route()` lands on it.
 */
async function bootDetail(): Promise<boolean> {
  const key = hashParams().get("team");
  if (!key || results.has(key)) return false;
  const row = rowFromKey(key);
  if (!row) return false;

  overlayPhase("Running Rotation…");
  await paint();
  results.set(key, runTeam(row.teamKey, row.members, row.combo, true));
  renderDetail(key);
  overlay.hidden = true;
  return true;
}

async function boot(): Promise<void> {
  // before the first run, not after: the filters decide which rows even exist, so a reloaded URL
  // has to be read while there is still nothing built
  applyHash();
  if (!await bootDetail()) await refresh();
  // and back out again, so a bare URL (or an old `#team=...` link) picks up the defaults it ran under
  syncHash();

  // Only a real navigation gets here — a hand-edited URL, or a Back press onto a hash left in the
  // history from before. `syncHash()` writes fire nothing (see there). Filters that moved need the
  // whole row set re-expanded; anything else is just a different detail route.
  addEventListener("hashchange", () => {
    if (applyHash()) { void refresh(); return; }
    // a detail route this session hasn't run — a URL pasted into an already-open tab — is worth
    // the one team run `bootDetail()` does, the same as it would be on a cold load, rather than
    // the whole table build `route()` would otherwise fall through to
    const key = hashParams().get("team");
    if (key && !results.has(key) && rowFromKey(key)) { void bootDetail(); return; }
    route();
  });
  wireSourcePanels(app);
  // routed by hand: `syncHash()` only rewrites the URL, it never navigates
  document.addEventListener("click", (e) => {
    const el = (e.target as Element).closest<HTMLElement>(".gotodetail");
    if (el?.dataset.team) { syncHash(el.dataset.team); route(); }
  });
  // Every filter checkbox but Sequences is a `Filters` key (see `comparisonFilters()`): flip it,
  // then re-expand — which axes are open changes which rows exist, not just which are visible.
  document.addEventListener("change", (e) => {
    const input = e.target as HTMLInputElement;
    if (!(input.id in filters)) return;
    filters[input.id as keyof Filters] = input.checked;
    syncHash();
    void refresh();
  });
  // A resonator's own name, anywhere in the comparison table: left click requires them, right
  // click bars them, and either one clicked again clears it. The filter is by name, so it applies
  // everywhere that name appears rather than only to the row clicked.
  const resonatorName = (e: Event): string | undefined =>
    (e.target as Element).closest<HTMLElement>(".c.name.res")?.dataset.resonator;
  document.addEventListener("click", (e) => {
    const name = resonatorName(e);
    if (name) setResonatorFilter(name, "include");
  });
  document.addEventListener("contextmenu", (e) => {
    const name = resonatorName(e);
    if (!name) return;
    e.preventDefault(); // the browser menu would bury the table under itself otherwise
    setResonatorFilter(name, "exclude");
  });
  // A chip above the table: clicking it clears that name's own filter, whichever way it was set.
  document.addEventListener("click", (e) => {
    const name = (e.target as Element).closest<HTMLElement>(".rchip")?.dataset.resonator;
    if (!name || !resonatorFilters.delete(name)) return;
    syncHash();
    void refresh();
  });
}

/** Set one resonator's own filter, or clear it if that's already the way it's filtered — so the
 *  same click that set it undoes it, and the chip above the table is the other way out. */
function setResonatorFilter(name: string, mode: ResonatorFilter): void {
  if (resonatorFilters.get(name) === mode) resonatorFilters.delete(name);
  else resonatorFilters.set(name, mode);
  syncHash();
  void refresh();
}

// back to the table, keeping the filters that got you to this page in the URL
backLink.addEventListener("click", (e) => { e.preventDefault(); syncHash(null); route(); });

// async now (it yields a frame between teams so the progress bar can move), so anything thrown
// after its own try/catch — wiring up the page, the first render — would otherwise surface as an
// unhandled rejection in the console and a blank page with no explanation
boot().catch((err: unknown) => {
  console.error(err);
  app.innerHTML = errorPage(err);
  app.className = "";
});
