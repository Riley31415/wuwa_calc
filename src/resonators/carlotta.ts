/**
 * Carlotta, ported to the new engine — sequence-0 core loop only. A glacio pistols main DPS,
 * almost everything she does "considered Resonance Skill DMG": Chromatic Splendor, Death Knell,
 * Fatal Finale and Imminent Oblivion all carry `type: Skill` for that reason, even though only
 * two of them are literal Resonance Skill button presses.
 *
 * Substance (forte2, 0-120) gates Heavy Attack - Containment Tactics and Forte Circuit -
 * Imminent Oblivion (both spend it all) and Final Bow: if it's still full the instant Liberation
 * (Era of New Wave) is cast, that hit and the whole Twilight Tango that follows (Death Knell,
 * Fatal Finale) get +80% DMG Multiplier, tracked by its own `TWILIGHT_TANGO` state marker so
 * Final Bow ends exactly when Twilight Tango does (Fatal Finale) or the instant she's switched
 * off field while it's still open (the standing "lost on inactive action" rule). Read live off
 * forte2() at the Liberation cast, same threshold-check shape as Qiuyuan's Bamboo's Shade/
 * Quietude Within — the rotation below is built to actually land on 120 there (see CL_ROTATION's
 * own comment); Imminent Oblivion is left off it entirely since spending Substance right before
 * Liberation would forfeit Final Bow for a single Heavy Attack hit.
 *
 * Meta Vector (forte3): each Death Knell grants 1, Fatal Finale requires and spends all 4 — a
 * declarative forte3 delta on those two actions (+1/-4), same shape as every other forte gauge.
 *
 * Moldable Crystal (forte1, 0-6): restored by Intro, Art of Violence, Basic Attack Stage 2, Heavy
 * Attack, Mid-air Attack - Customary Greetings (+3 each, declared on the action same as any other
 * forte delta) and spent 1 a strike by Necessary Measures/Dodge Counter (also declarative). The
 * one genuinely dynamic spend is Chromatic Splendor, which consumes *every* crystal currently
 * held and converts each into 10 Substance — that ratio can't be a fixed per-action number, so
 * it's `CHROMATIC_SPLENDOR_SPEND` below, a tiny self-applied Buff whose own convert() reads
 * forte1() before zeroing it, same shape as Jingran's Fire of Life. Cannot gain Substance or
 * Moldable Crystal while in Twilight Tango, per the kit page — not modelled as an explicit gate
 * since the fixed rotation below never casts a crystal/Substance-granting action between
 * Liberation and Fatal Finale in the first place.
 *
 * Deconstruction (Ars Gratia Artis, Inherent Skill, always assumed known): Intro, Chromatic
 * Splendor, Liberation, Death Knell and Imminent Oblivion all inflict it. The kit page itself
 * reads it as DEF ignore for any attacker, but it's modelled here as a genuine enemy debuff (not
 * a team buff) whose 18% DEF Shred — a real reduction to the target's own effective DEF, not a
 * per-attacker ignore — only takes effect while Carlotta herself is the active member, by
 * explicit instruction. Lost after her own outro action gains stats (convert(), not update()),
 * by explicit instruction — not permanent uptime.
 *
 * Numbers from nanoka.cc (character 1107, https://ww.nanoka.cc/character/1107) — base stats
 * (12,450 HP / 463 ATK / 1,198 DEF) confirmed there directly; every action's own MV/energy/
 * concerto/offtune/forte1 delta ported from the migrated (old-engine) sheet, which already cites
 * the same character page and cross-checks its own multi-hit totals — one exception: the sheet's
 * own Intro Substance gain (+60) disagreed with the page's explicit "restore 30 points of
 * Substance upon casting Intro Skill", so the page's own 30 is what's used here. Her own page
 * describes no Outro handoff buff at all (unlike every other kit implemented so far) — Closing
 * Remark is left as a plain damage hit, nothing invented.
 */
import {
  Buff, Resonator, Action, ECHO_CAST, INTRO, Stat, Element, WeaponType, Type1, Cast, Node, Scaling,
  applySelf, applyEnemy, revokeEnemy, isHeld, currentAction, casting, revoke, addStat,
  forte1, forte2, setForte2, AddForte1, AddForte2,
} from "../kit.js";
import { THE_LAST_DANCE } from "../weapons/pistol.js";
import { FROSTY_RESOLVE_2PC, FROSTY_RESOLVE_5PC, SENTRY_CONSTRUCT } from "../echoes/rinascita.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";

/* ------------------------------------------------------------------------------------ buffs */

/** Deconstruction: a genuine debuff on the enemy (see file header) — permanent uptime once
 *  inflicted. Its 18% DEF Shred only lands while Carlotta herself is the active member, checked
 *  by `isHeld(CARLOTTA)`: this buff's own apply() runs on every member's turn (it's held by the
 *  enemy, not any one slot), same as a team buff, but `currentSlot` during that call is always
 *  whoever's actually acting — so this is exactly "is Carlotta the one dealing this hit". */
export const DECONSTRUCTION = new Buff({
  name: "Carlotta: Deconstruction",
  apply: () => { if (isHeld(CARLOTTA)) addStat(Stat.DefShred, 18); },
  // lost after her own outro action gains stats — convert() runs after apply() already paid out
  convert: () => { if (casting(Cast.Outro) && isHeld(CARLOTTA)) revokeEnemy(DECONSTRUCTION); },
});

/** Chromatic Splendor's own Moldable Crystal spend: consumes every crystal currently held and
 *  converts each into 10 Substance — a ratio, not a fixed per-action number, so it can't be a
 *  plain declarative forte1/forte2 delta on the action itself. Self-applied by her own update()
 *  the instant Skill2 is cast; its own convert() runs this same action and reads forte1() before
 *  zeroing it, same shape as Jingran's Fire of Life, so both the spend and the grant trace to
 *  this buff's own name in the forte hover instead of an unexplained gauge change. */
export const CHROMATIC_SPLENDOR_SPEND = new Buff({
  name: "Carlotta: Chromatic Splendor",
  convert: () => {
    const crystals = forte1();
    addStat(AddForte1, -crystals);
    addStat(AddForte2, 10 * crystals);
    revoke(CHROMATIC_SPLENDOR_SPEND);
  },
});

/** Twilight Tango: a pure state marker, no stat of its own — Carlotta enters it on Era of New
 *  Wave and leaves it once Fatal Finale resolves. Exists purely so Final Bow (below) can read
 *  whether it's still open. Revoked in convert(), not update(), so a buff that reads
 *  `isHeld(TWILIGHT_TANGO)` from its own convert() this same action still sees it held — apply()
 *  has already run for everything by the time either buff's convert() fires. */
export const TWILIGHT_TANGO = new Buff({
  name: "Carlotta: Twilight Tango",
  convert: () => {
    if (currentAction() === FatalFinale) revoke(TWILIGHT_TANGO);
  },
});

/** Final Bow: +80% DMG Multiplier on Era of New Wave, Death Knell and Fatal Finale — granted at
 *  the Liberation cast if Substance was full then (see her own update() below), spent by
 *  identity check since these three all share `type: Skill` with several of her other hits that
 *  shouldn't get it. Ends when Twilight Tango itself ends (Fatal Finale — `!isHeld(TWILIGHT_TANGO)`,
 *  so it can't drift out of sync with when Twilight Tango actually closes), or the standing "lost
 *  on swap = lost on inactive action" rule the instant she's switched off field while Twilight
 *  Tango is still open (her own outro is itself an inactive action, so this alone covers it — no
 *  separate `casting(Cast.Outro)` check needed). Still pays out on the action that closes it:
 *  convert() only revokes after apply() already ran this same action. */
export const FINAL_BOW = new Buff({
  name: "Carlotta: Final Bow",
  apply: () => {
    const a = currentAction();
    if (a === Lib1 || a === DeathKnell || a === FatalFinale) addStat(Stat.MulMv, 80);
  },
  convert: () => {
    if (!isHeld(TWILIGHT_TANGO) || !currentAction().active) revoke(FINAL_BOW);
  },
});

/* ----------------------------------------------------------------------------------- actions */

function carlottaAction(id: string, def: object): Action {
  return new Action(id, { element: Element.Glacio, scaling: Scaling.Atk, ...def });
}

// energy/concerto/offtune are her own kit's real generation per cast — Liberation/Outro's own
// old declared "spend the bar" costs aren't repeated here (TODO_ENGINE.md: that's what
// Resonator.maxEnergy and the engine's own outro handling are for).
// --- basics, mid-air, dodge counter (Silent Execution)
export const BA1 = carlottaAction("Basic - Silent Execution 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 54.08, energy: 80, concerto: 160, offtune: 2560 });
export const BA2 = carlottaAction("Basic - Silent Execution 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 131.83, energy: 196, concerto: 390, offtune: 6240, forte1: 3 });
export const MA1 = carlottaAction("Basic - Silent Execution (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 104.78, energy: 300, concerto: 600, offtune: 9600 });
export const MA2 = carlottaAction("Basic - Silent Execution: Customary Greetings", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 239.98, energy: 211, concerto: 420, offtune: 6720, forte1: 3 });
export const DC = carlottaAction("Basic - Silent Execution (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 241.32, energy: 358, concerto: 715, offtune: 11426, forte2: 10, forte1: -1 });

// --- Necessary Measures: Basic Attack replaced while holding Moldable Crystals, each stage
//     spending one. Not placed in the rotation below (see file header), kept for completeness.
export const NM1 = carlottaAction("Basic - Silent Execution: Necessary Measures 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 65.91, energy: 98, concerto: 195, offtune: 3120, forte2: 10, forte1: -1 });
export const NM2 = carlottaAction("Basic - Silent Execution: Necessary Measures 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 133.51, energy: 198, concerto: 396, offtune: 5320, forte2: 10, forte1: -1 });
export const NM3 = carlottaAction("Basic - Silent Execution: Necessary Measures 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 233.25, energy: 347, concerto: 690, offtune: 11040, forte2: 10, forte1: -1 });

// --- heavy attack: base cast, and Containment Tactics once Substance is full
export const HA = carlottaAction("Heavy - Silent Execution", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 152.12, energy: 226, concerto: 452, offtune: 7200, forte1: 3 });
export const EHA = carlottaAction("Heavy - Silent Execution: Containment Tactics", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 228.18, energy: 226, concerto: 1500, offtune: 7200, forte2: -120 });

// --- resonance skill: Art of Violence, then Chromatic Splendor (press again shortly after) —
//     Chromatic Splendor's own Substance gain/crystal spend is dynamic (see CHROMATIC_SPLENDOR_SPEND
//     above), not a declared forte1/forte2 field here
export const Skill1 = carlottaAction("Skill - Art of Violence", {
  node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 288.22, energy: 200, concerto: 500, offtune: 6136, forte1: 3,
});
export const Skill2 = carlottaAction("Skill - Chromatic Splendor", {
  node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 563.64, energy: 300, concerto: 500, offtune: 6136,
});

// --- forte circuit: Imminent Oblivion, considered Resonance Skill DMG, spends all Substance
export const FHA = carlottaAction("Heavy - Imminent Oblivion", {
  node: Node.Forte, cast: Cast.Heavy, type: Type1.Skill, mv: 835.36, energy: 1700, concerto: 1500, offtune: 97361, forte2: -120,
});

// --- liberation: Era of New Wave opens Twilight Tango; Death Knell (press Normal/Liberation, up
//     to 4 times, each granting 1 Meta Vector) then Fatal Finale (requires and spends all 4) close
//     it out — the rotation below places exactly 4 Death Knells then one Fatal Finale, matching
//     both the kit text and the forte3 deltas declared here.
export const Lib1 = carlottaAction("Liberation - Era of New Wave", {
  node: Node.Liberation, cast: Cast.Liberation, type: Type1.Skill, mv: 402.71, concerto: 2000, offtune: 33600,
});
export const DeathKnell = carlottaAction("Liberation - Death Knell", {
  node: Node.Liberation, cast: Cast.Liberation, type: Type1.Skill, mv: 241.64, energy: 500, concerto: 700, offtune: 9600, forte3: 1,
});
export const FatalFinale = carlottaAction("Liberation - Fatal Finale", {
  node: Node.Liberation, cast: Cast.Liberation, type: Type1.Skill, mv: 644.33, concerto: 1000, offtune: 50400, forte3: -4,
});

// --- intro / outro
export const Intro = carlottaAction("Intro - Wintertime Aria", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 298.23, energy: 1000, concerto: 1000, offtune: 9335, forte2: 30, forte1: 3,
});
/** Closing Remark — no handoff buff of any kind is described on her own kit page, unlike every
 *  other kit implemented so far; left as a plain damage hit rather than inventing one. */
export const Outro = carlottaAction("Outro - Closing Remark", { cast: Cast.Outro, type: Type1.Outro, mv: 794.2, active: false });

/** Her, as a Resonator: name/element/weapon, every grant/spend/queue rule her kit needs, and her
 *  own base stat line. The stat-tree talent bonus lives in its own `CARLOTTA_TALENTS` buff below
 *  — just another piece of her loadout, not special-cased on the Resonator itself. */
export const CARLOTTA = new Resonator({
  name: "Carlotta",
  element: Element.Glacio,
  weapon: WeaponType.Pistols,
  intro: () => Intro,
  color: "#4f74c2",
  maxEnergy: 12500,

  update: () => {
    const a = currentAction();
    if (a === Intro || a === Skill2 || a === Lib1 || a === DeathKnell || a === FHA) applyEnemy(DECONSTRUCTION, 1);
    if (a === Skill2) applySelf(CHROMATIC_SPLENDOR_SPEND, 1);
    if (a === Lib1) {
      applySelf(TWILIGHT_TANGO, 1);
      if (forte2() >= 120) applySelf(FINAL_BOW, 1);
      setForte2(0); // Twilight Tango removes all Substance on opening
    }
  },

  apply: () => {
    addStat(Stat.BaseHp, 12450); addStat(Stat.BaseAtk, 463); addStat(Stat.BaseDef, 1198);
    addStat(Stat.Er, 100); addStat(Stat.CritRate, 5); addStat(Stat.CritDmg, 150);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
export const CARLOTTA_TALENTS = new Buff({
  name: "Carlotta: Talents",
  apply: () => { addStat(Stat.CritRate, 8); addStat(Stat.BonusAtk, 12); },
});

/** Reconstructed to actually reach Final Bow rather than spend around it: Intro (+30 Substance)
 *  into one Art of Violence/Chromatic Splendor pair (+60, 6 crystals) and a second (+30, 3 more
 *  crystals) lands exactly on 120 before Liberation opens Twilight Tango — Imminent Oblivion is
 *  DPS-negative here (one Heavy Attack hit costs the whole 80% Multiplier across Era of New Wave
 *  plus all of Twilight Tango) so it's left off this line entirely, same "kept for completeness,
 *  not placed" treatment as Necessary Measures/Containment Tactics/Dodge Counter above. Four
 *  Death Knells and a Fatal Finale close Twilight Tango out, then a third Art of Violence/
 *  Chromatic Splendor pair, her own echo cast, and Outro. She's never the team's own lead, so
 *  unlike a first-position member's own opener, this same rotation covers both. */
export const CL_ROTATION = [
  INTRO, Skill1, Skill2, MA1, Skill1, Skill2,
  Lib1, DeathKnell, DeathKnell, DeathKnell, DeathKnell, FatalFinale,
  Skill1, Skill2, ECHO_CAST, Outro,
];

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents, weapon, mainslot echo, sonata pieces, mainstat/substat
export const CL_LOADOUT = [
  CARLOTTA, CARLOTTA_TALENTS,
  THE_LAST_DANCE,
  SENTRY_CONSTRUCT, FROSTY_RESOLVE_5PC, FROSTY_RESOLVE_2PC,
  mainstats("CR", "glacio glacio", "atk atk"), chem("atk", "skill"),
];
