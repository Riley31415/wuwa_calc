/**
 * Carlotta, ported to the new engine — sequence-0 core loop only. A glacio pistols main DPS,
 * almost everything she does "considered Resonance Skill DMG": Chromatic Splendor, Death Knell,
 * Fatal Finale and Imminent Oblivion all carry `type: Skill` for that reason, even though only
 * two of them are literal Resonance Skill button presses.
 *
 * Substance (forte2, 0-120) gates Heavy Attack - Containment Tactics and Forte Circuit -
 * Imminent Oblivion (both spend it all) and Final Bow: a state entered the moment it fills, held
 * through any spend after, and ended only by a swap-out while Twilight Tango is up — so Era of
 * New Wave and the whole Tango that follows (Death Knell, Fatal Finale) get +80% DMG Multiplier.
 * The rotation below fills it, spends it on Imminent Oblivion, then casts the Liberation.
 *
 * Meta Vector (forte3): each Death Knell grants 1, Fatal Finale requires and spends all 4 — a
 * declarative forte3 delta on those two actions.
 *
 * Moldable Crystal (forte1, 0-6): restored by several actions (+3 each, declarative) and spent 1
 * a strike by Necessary Measures/Dodge Counter (also declarative). The one genuinely dynamic
 * spend is Chromatic Splendor, which consumes *every* crystal held and converts each into 10
 * Substance — a ratio, not a fixed number, so its 70f marker bullet reads forte1() and spends it.
 *
 * Deconstruction (Ars Gratia Artis, Inherent Skill, always assumed known): several actions
 * inflict it. Modelled as a genuine enemy debuff (not a team buff) whose 18% DEF Shred only
 * takes effect while Carlotta herself is the active member, by explicit instruction. Lost after
 * her own outro action gains stats, by explicit instruction — not permanent uptime.
 *
 * Numbers from nanoka.cc (character 1107) — base stats confirmed there directly; every action's
 * own MV/energy/concerto/offtune/forte1 delta ported from the migrated (old-engine) sheet, with
 * one exception: the sheet's own Intro Substance gain (+60) disagreed with the page's explicit
 * "restore 30 points of Substance," so the page's own 30 is used. No Outro handoff buff is
 * described on her own page (unlike every other kit so far) — Closing Remark is left as a plain
 * damage hit, nothing invented.
 */
import { Stat, Attribute, WeaponType, Type, Cast, Node, Scaling } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout, Debuff, matrix } from "../../engine/gear.js";
import {
  applyCurrent,
  applyTeam,
  applyEnemy,
  stacksOfEnemy,
  queue,
  isHeld,
  lostOnSwap,
  runningAction,
  revokeCurrent,
  addStat,
  forte1,
  forte2,
  reduceCooldown,
  addGain,
  runningBullet,
} from "../../engine/context.js";
import { ActionGroup, Action, Rotation, ECHO, INTRO, OUTRO, START } from "../../engine/rotation.js";
import { THE_LAST_DANCE } from "../../weapons/pistol.js";
import { NEW_STD_PISTOL, STATIC_MIST } from "../../weapons/standard.js";
import { FROSTY_RESOLVE_5PC, SENTRY_CONSTRUCT } from "../../echoes/rinascita.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function carlottaAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Glacio, scaling: Scaling.Atk, ...def });
}

/** "Press Resonance Skill again shortly after to cast Chromatic Splendor": opened by Art of
 *  Violence, spent by Chromatic Splendor, and gone if she is switched off the field first. */
const CHROMATIC_SPLENDOR_READY = new Buff({ name: "Carlotta: Chromatic Splendor Ready", lostOnSwap: true });

/** "Using Basic Attack shortly after the landing will cast Customary Greetings": the plunge's
 *  landing opens it, and whatever she presses next closes it. */
const CUSTOMARY_GREETINGS_READY: Buff = new Buff({
  name: "Carlotta: Customary Greetings Ready",
  updateBuffs: () => {
    if (!runningAction(MA1)) revokeCurrent(CUSTOMARY_GREETINGS_READY);
  },
});

/** A pure state marker — entered on Era of New Wave, left once Fatal Finale resolves, so Final
 *  Bow can read whether it's still open. Revoked at the press's end, so a same-action reader still
 *  sees it held. */
const TWILIGHT_TANGO = new Buff({
  name: "Carlotta: Twilight Tango", duration: 60 * 10,
  afterAction: () => {
    if (runningAction(FatalFinale) || runningAction(FatalFinaleS2)) revokeCurrent(TWILIGHT_TANGO);
  },
});

/** Deconstruction on hit: Era of New Wave and the four casts Ars Gratia Artis names, each on
 *  the hits wuwalab lands it. */
const DECONSTRUCT = { updateDebuffs: () => applyEnemy(DECONSTRUCTION, 1) };
/** Dispersion on hit: both of Art of Violence's strikes. */
const DISPERSE = { updateDebuffs: () => applyEnemy(DISPERSION, 1) };

// --- basics, mid-air, dodge counter (Silent Execution)
const BA1 = carlottaAction("Basic - Silent Execution 1", { maxForte1: 0, animFrames: 16, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 13, mv: 5408, energy: 80, concerto: 160, offtune: 2560 }]});
const BA2 = carlottaAction("Basic - Silent Execution 2", { maxForte1: 0, animFrames: 44, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 16, mv: 3955, energy: 59, concerto: 117, offtune: 1872, forte1: 3 },
    { hitFrame: 30, mv: 3955, energy: 59, concerto: 117, offtune: 1872 },
    { hitFrame: 38, mv: 5273, energy: 78, concerto: 156, offtune: 2496 },
  ]});
// the landing opens Customary Greetings
const MA1 = carlottaAction("Mid-air - Silent Execution Plunge", { animFrames: 47, animPriority: { 41: 2 }, castPriority: 6, bullets: [
    { hitFrame: 36, mv: 10478, energy: 300, concerto: 600, offtune: 9600, updateDebuffs: () => applyCurrent(CUSTOMARY_GREETINGS_READY, 1) },
  ], node: Node.Normal, cast: Cast.Basic, type: Type.Basic});
const MA2 = carlottaAction("Basic - Silent Execution: Customary Greetings", { requireBuff: CUSTOMARY_GREETINGS_READY, animFrames: 56, castPriority: 2, bullets: [
    { hitFrame: 8, mv: 10799, energy: 95, concerto: 189, offtune: 3024 },
    { hitFrame: 46, mv: 13199, energy: 116, concerto: 231, offtune: 3696 },
  ], node: Node.Normal, cast: Cast.Basic, type: Type.Basic, castForte1: 3,
  updateBuffs: () => revokeCurrent(CUSTOMARY_GREETINGS_READY),
});
const DC = carlottaAction("Dodge Counter - Silent Execution", { minForte1: 1, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 12, mv: 10377, energy: 154, concerto: 308, offtune: 4913, forte1: -1 },
    { hitFrame: 42, mv: 13755, energy: 204, concerto: 407, offtune: 6512, forte2: 10 },
  ], animFrames: 50, castPriority: 8, castConcerto: 1000});

// Necessary Measures: Basic Attack replaced while holding Moldable Crystals, each stage spending
// one. Not placed in the rotation below (see file header), kept for completeness.
const NM1 = carlottaAction("Basic - Silent Execution: Necessary Measures 1", { minForte1: 1, animFrames: 24, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 12, mv: 6591, energy: 98, concerto: 195, offtune: 3120, forte1: -1, forte2: 10 },
  ]});
const NM2 = carlottaAction("Basic - Silent Execution: Necessary Measures 2", { minForte1: 1, animFrames: 46, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 16, mv: 6008, energy: 89, concerto: 178, offtune: 2844, forte1: -1 },
    { hitFrame: 36, mv: 7343, energy: 109, concerto: 218, offtune: 3476, forte2: 10 },
  ]});
const NM3 = carlottaAction("Basic - Silent Execution: Necessary Measures 3", { minForte1: 1, animFrames: 80, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 6, mv: 2333, energy: 35, concerto: 69, offtune: 1104 },
    { hitFrame: 8, mv: 2333, energy: 35, concerto: 69, offtune: 1104 },
    { hitFrame: 12, mv: 2333, energy: 35, concerto: 69, offtune: 1104 },
    { hitFrame: 14, mv: 2333, energy: 35, concerto: 69, offtune: 1104 },
    { hitFrame: 46, element: null, type: null, subtype: null, forte1: -1 },
    { hitFrame: 58, mv: 13993, energy: 207, concerto: 414, offtune: 6624, forte2: 10 },
  ]});

// base cast, and Containment Tactics once Substance is full
const HA = carlottaAction("Heavy - Silent Execution", { maxForte2: 119, animFrames: 54, castPriority: 2, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 15, mv: 2282, energy: 34, concerto: 68, offtune: 1080 },
    { hitFrame: 16, mv: 2282, energy: 34, concerto: 68, offtune: 1080 },
    { hitFrame: 18, mv: 2282, energy: 34, concerto: 68, offtune: 1080 },
    { hitFrame: 19, mv: 2282, energy: 34, concerto: 68, offtune: 1080 },
    { hitFrame: 38, mv: 6084, energy: 90, concerto: 180, offtune: 2880 },
  ], castForte1: 3});
const EHA = carlottaAction("Heavy - Silent Execution: Containment Tactics", { minForte2: 120,
  animFrames: 54, castPriority: 6, bullets: [
    { hitFrame: 15, mv: 3423, energy: 34, offtune: 1080 },
    { hitFrame: 16, mv: 3423, energy: 34, offtune: 1080 },
    { hitFrame: 18, mv: 3423, energy: 34, offtune: 1080 },
    { hitFrame: 19, mv: 3423, energy: 34, offtune: 1080 },
    { hitFrame: 38, mv: 9126, energy: 90, offtune: 2880 },
  ], castConcerto: 1500,
  node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, castForte2: -120,
  updateBuffs: () => reduceCooldown(Skill1, 60 * 6),
});

// Art of Violence, then Chromatic Splendor (press again shortly after) — Chromatic Splendor's
// own Substance gain/crystal spend is dynamic (its 70f bullet)
const Skill1 = carlottaAction("Skill - Art of Violence", {
  animFrames: 46, animPriority: { 46: 2 }, castPriority: 4, cooldown: 60 * 14,
  node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 8, mv: 14411, energy: 100, offtune: 3068, ...DISPERSE },
    { hitFrame: 35, mv: 14411, energy: 100, offtune: 3068, ...DISPERSE },
  ], castConcerto: 500, castForte1: 3,
  updateBuffs: () => applyCurrent(CHROMATIC_SPLENDOR_READY, 1),
});
const Skill2 = carlottaAction("Skill - Chromatic Splendor", { // CHANGED PRIO TO 5 to enforce ingame echo cant cancell
  animFrames: 121, animPriority: { 0: 5, 101: 2 }, castPriority: 4, requireBuff: CHROMATIC_SPLENDOR_READY,
  node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 40, mv: 11273, energy: 60, offtune: 2400 },
    { hitFrame: 53, mv: 11273, energy: 60, offtune: 2400 },
    // every crystal held becomes 10 Substance, where wuwalab spends them
    { hitFrame: 70, element: null, type: null, subtype: null, updateDebuffs: () => {
      const crystals = Math.min(6, forte1());
      addGain({ forte1: -crystals, forte2: 10 * crystals });
    } },
    { hitFrame: 82, mv: 33818, energy: 180, offtune: 7200, ...DECONSTRUCT },
  ], castConcerto: 500,
  updateBuffs: () => revokeCurrent(CHROMATIC_SPLENDOR_READY),
});

// considered Resonance Skill DMG, spends all Substance; Tinted Crystal's 22s cooldown is this cast's
const FHA = carlottaAction("Forte Heavy - Imminent Oblivion", { minForte2: 120,
  animFrames: 124, animPriority: { 104: 4, 122: 2 }, castPriority: 6, cooldown: 60 * 22,
  node: Node.Forte, cast: Cast.Heavy, type: Type.Skill, bullets: [
    { hitFrame: 18, mv: 6683, energy: 136, offtune: 7789 },
    { hitFrame: 25, mv: 6683, energy: 136, offtune: 7789 },
    { hitFrame: 31, mv: 6683, energy: 136, offtune: 7789 },
    { hitFrame: 38, mv: 6683, energy: 136, offtune: 7789 },
    { hitFrame: 42, mv: 6683, energy: 136, offtune: 7789 },
    { hitFrame: 92, mv: 50121, energy: 1020, offtune: 58416, ...DECONSTRUCT },
  ], castConcerto: 1500, castForte2: -120,
  updateBuffs: () => reduceCooldown(Skill1, 60 * 6),
});

// Era of New Wave opens Twilight Tango; Death Knell (up to 4, each granting 1 Meta Vector) then
// Fatal Finale (requires and spends all 4) close it out. Death Knell's shots are real presses of
// about a second each, not a frozen-world cinematic, so they carry no time stop and count as time
const Lib1 = carlottaAction("Liberation - Era of New Wave", {
  animFrames: 182, animPriority: { 181: 2 }, castPriority: 10, timestop: [0, 182], motionStop: [0, 138],
  cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Skill, bullets: [{ hitFrame: 130, mv: 40271, offtune: 33600, ...DECONSTRUCT }], castConcerto: 2000, resetEnergy: true,
  resetForte2: true, // Twilight Tango removes all Substance on opening
  updateBuffs: () => applyCurrent(TWILIGHT_TANGO, 1),
  resetForte3: true,
});
const DeathKnell = carlottaAction("Liberation - Death Knell", {
  animFrames: 70, animPriority: { 68: 2 }, castPriority: 2, requireBuff: TWILIGHT_TANGO,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Skill, bullets: [
    { hitFrame: 40, mv: 18364, energy: 500, offtune: 9600, ...DECONSTRUCT },
    { hitFrame: 81, commitFrame: 50, mv: 1450 },
    { hitFrame: 81, commitFrame: 50, mv: 1450 },
    { hitFrame: 83, commitFrame: 52, mv: 1450 },
    { hitFrame: 83, commitFrame: 52, mv: 1450 },
  ], castConcerto: 700, castForte3: 1,
});
/** S6's Death Knell: nanoka's own twin row (576.61% + 14.50%*8) — a harder shot and twice the
 *  shards, the S6 node's "+186.6% in total" as real hits. */
const DeathKnellS6 = DeathKnell.variant("Liberation - Death Knell (S6)", { bullets: [
    { hitFrame: 40, mv: 57661, energy: 500, offtune: 9600, ...DECONSTRUCT },
    { hitFrame: 81, commitFrame: 50, mv: 1450 },
    { hitFrame: 81, commitFrame: 50, mv: 1450 },
    { hitFrame: 83, commitFrame: 52, mv: 1450 },
    { hitFrame: 83, commitFrame: 52, mv: 1450 },
    { hitFrame: 89, commitFrame: 54, mv: 1450 },
    { hitFrame: 89, commitFrame: 54, mv: 1450 },
    { hitFrame: 91, commitFrame: 56, mv: 1450 },
    { hitFrame: 91, commitFrame: 56, mv: 1450 },
  ]});
/** The Death Knell a rotation writes: the S6 form once S6 is held. */
const DeathKnellResolver = new Action("Death Knell Resolver", { resolve: () => (isHeld(CL_S6) ? DeathKnellS6 : DeathKnell) });
const FatalFinale = carlottaAction("Liberation - Fatal Finale", { minForte3: 4, requireBuff: TWILIGHT_TANGO,
  animFrames: 170, animPriority: { 160: 2 }, castPriority: 2, timestop: [0, 170], motionStop: [0, 140],
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Skill, bullets: [{ hitFrame: 138, mv: 64433, offtune: 50400 }], castConcerto: 1000, castForte3: -4, resetForte2: true
});
/** S2's Fatal Finale: nanoka's own S2 row (1456.17%, the base's +126%), which Final Bow's +80%
 *  then scales like any other row. */
const FatalFinaleS2 = FatalFinale.variant("Liberation - Fatal Finale (S2)", { bullets: [{ hitFrame: 138, mv: 145617, offtune: 50400 }] });
/** The Fatal Finale a rotation writes: the S2 form once S2 is held. */
const FatalFinaleResolver = new Action("Fatal Finale Resolver", { resolve: () => (isHeld(CL_S2) ? FatalFinaleS2 : FatalFinale) });

const Intro = carlottaAction("Intro - Wintertime Aria", {
  qteFrames: 58, animFrames: 84, noSwapFrames: 70, animPriority: { 70: 2 }, castPriority: 11, motionStop: [0, 84],
  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [
    { hitFrame: 28, element: null, type: null, subtype: null, forte1: 3 },
    { hitFrame: 56, mv: 17893, energy: 600, offtune: 5601, ...DECONSTRUCT },
    { hitFrame: 65, commitFrame: 56, mv: 5965, energy: 200, offtune: 1867, ...DECONSTRUCT },
    { hitFrame: 80, commitFrame: 56, mv: 5965, energy: 200, offtune: 1867, ...DECONSTRUCT },
  ], castConcerto: 1000, castForte2: 30
});
/** "Restore 3 Moldable Crystals upon a successful Dodge" — a perfect dodge, so a press a rotation
 *  writes before a Dodge Counter rather than every dash. */
const SuccessfulDodge = carlottaAction("Dodge - Successful Dodge", { cast: Cast.Dodge, animFrames: 25, animPriority: { 25: 2 }, castPriority: 8, castForte1: 3 });
/** No handoff buff of any kind is described on her own kit page — left as a plain damage hit. */
const Outro = carlottaAction("Outro - Closing Remark", { animFrames: 0, cast: Cast.Outro, type: Type.Outro, bullets: [
    { hitFrame: 0, mv: 79420 },
    // S3's Kaleidoscope Sparks, queued where wuwalab sets it off
    { hitFrame: 9, commitFrame: 0, element: null, type: null, subtype: null, updateDebuffs: () => { if (isHeld(CL_S3)) queue(Sparks); } },
  ], minConcerto: 10000, castConcerto: -10000});

/* ------------------------------------------------------------------------------------ buffs */

/** A genuine debuff on the enemy — permanent uptime once inflicted. Its 18% DEF Shred only lands
 *  while Carlotta herself is the active member, checked by `isHeld(CARLOTTA_RESONATOR)`: this buff's own
 *  applyStats() runs on every member's turn, but `currentSlot` there is always whoever's acting. */
const DECONSTRUCTION = new Debuff({
  name: "Carlotta: Deconstruction", duration: 60 * 4,
  applyStats: () => { if (isHeld(CARLOTTA_RESONATOR)) addStat(Stat.DefIgnoreOld, 18); },
});

/** Art of Violence's immobilize, 1.5s: all it does here is what S1's Chromatic Splendor reads. */
const DISPERSION = new Debuff({ name: "Carlotta: Dispersion", duration: 90 });

const CL_INHERENT_1 = new Inherent({
  name: "Inherent: Flawless Purity",
  // interrupt immune
});

// Deconstruction is laid by the hits that inflict it (Intro x3, Chromatic Splendor's last, Death
// Knell's shot, Imminent Oblivion's last) — inherents are always held, so no isHeld gate
const CL_INHERENT_2 = new Inherent({
  name: "Inherent: Ars Gratia Artis",
});

/** +80% DMG Multiplier on Era of New Wave, Death Knell and Fatal Finale — entered the moment
 *  Substance fills (CARLOTTA_RESONATOR's own afterAction), whatever action did it, and spending
 *  it again (Imminent Oblivion, Containment Tactics) does not end it: only being switched off
 *  field while Twilight Tango is up does. Identity check since these three share `type: Skill`
 *  with other hits that shouldn't get it. */
const FINAL_BOW = new Buff({
  name: "Carlotta: Final Bow",
  applyStats: () => {
    if (runningAction(Lib1) || runningAction(DeathKnell) || runningAction(DeathKnellS6) || runningAction(FatalFinale) || runningAction(FatalFinaleS2)) {
      addStat(Stat.MulMv, 80);
    }
  },
  updateBuffs: () => {
    if (isHeld(TWILIGHT_TANGO)) lostOnSwap();
  },
});

/* --------------------------------------------------------------------------- resonance chain */

/** S1: +12.5% Crit Rate on any hit into a Deconstruction target, and Chromatic Splendor's first hit
 *  (wuwalab's trigger_s2_dispersion) restores 30 more Substance on a target still under Dispersion. */
const CL_S1 = new Sequence({
  name: "Carlotta S1: Beauty Blazes Brightest Before It Fades",
  applyStats: () => {
    if (stacksOfEnemy(DECONSTRUCTION) > 0) addStat(Stat.CritRate, 12.5);
  },
  updateDebuffs: () => {
    if (runningBullet(Skill2, 0) && stacksOfEnemy(DISPERSION) > 0) addGain({ forte2: 30 });
  },
});

/** S2: Fatal Finale's multiplier +126% — FatalFinaleS2, which the rotation's resolver plays. */
const CL_S2 = new Sequence({ name: "Carlotta S2: Fallen Petals Give Life to New Blooms" });

/** S3: one more strike at the end of Closing Remark — 1032.18% ATK, queued by the outro's own late
 *  bullet on her slot — and +93% multiplier on Art of Violence and Chromatic Splendor. */
const Sparks = carlottaAction("Outro - Kaleidoscope Sparks", { animFrames: 0, type: Type.Outro, bullets: [{ hitFrame: 0, mv: 103218 }]});
const CL_S3 = new Sequence({
  name: "Carlotta S3: Adelante, Cortado, Spinning in Grace",
  applyStats: () => { if (runningAction(Skill1) || runningAction(Skill2)) addStat(Stat.MulMv, 93); },
});

/** S4: any of her three Heavy Attacks gives the whole team +25% Resonance Skill DMG Bonus for 30s —
 *  "all Resonators in the team", so it pays off-field too, and long enough to be permanent. */
const FINEST_WINE = new Buff({
  name: "Carlotta S4: Yesterday's Raindrops Make Finest Wine",
  duration: 60 * 30,
  stats: [[Stat.DmgBonus, 25, Type.Skill]],
});
const CL_S4 = new Sequence({
  name: "Carlotta S4: Yesterday's Raindrops Make Finest Wine",
  updateBuffs: () => { if (runningAction(HA) || runningAction(EHA) || runningAction(FHA)) applyTeam(FINEST_WINE, 1); },
});

/** S5: Imminent Oblivion's multiplier +47%. */
const CL_S5 = new Sequence({
  name: "Carlotta S5: Toast to Past, Today, and Every Day to Come",
  applyStats: () => { if (runningAction(FHA)) addStat(Stat.MulMv, 47); },
});

/** S6: Death Knell's shots hit harder and double up — DeathKnellS6, which the rotation's Death
 *  Knell resolves to while this is held. Scattering's immobilize is nothing this engine models. */
const CL_S6 = new Sequence({ name: "Carlotta S6: As the Curtain Falls, I Remain What I Am" });

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
const CARLOTTA_TALENTS = new Talent({
  name: "Carlotta: Talents",
  stats: [[Stat.CritRate, 8], [Stat.BonusAtk, 12]],
});

const CARLOTTA_RESONATOR = new Resonator({
  name: "Carlotta",
  stats: [[Stat.BaseHp, 12450], [Stat.BaseAtk, 462.5], [Stat.BaseDef, 1197.7756]],
  matrix: matrix("Carlotta", 25),
  talent: CARLOTTA_TALENTS,
  inherent1: CL_INHERENT_1,
  inherent2: CL_INHERENT_2,
  element: Attribute.Glacio,
  weapon: WeaponType.Pistols,
  color: "#8fb3d9",
  intro: Intro,
  outro: Outro,
  maxEnergy: 12500,
  maxForte1: 6,
  maxForte2: 120,
  maxForte3: 4,

  // Final Bow is a state entered on the gauge filling, so it is read off the gauge as each
  // action leaves it — the only phase that sees Chromatic Splendor's own conversion banked
  afterAction: () => { if (forte2() >= 120) applyCurrent(FINAL_BOW, 1); },

});

// Intro (+30 Substance, on the 30 the last Chromatic Splendor left) into Art of Violence/Chromatic
// Splendor (six crystals, +60) fills the gauge — Final Bow — which Imminent Oblivion then spends
// before Liberation opens Twilight Tango with the state still up.
// She's never the team's own lead, so this covers both opener and loop.

const DeathKnellx4 = new ActionGroup("Liberation - Death Knell x4", [DeathKnellResolver, DeathKnellResolver, DeathKnellResolver, DeathKnellResolver]);
const Skill12 = new ActionGroup("Skill - Art of Violence + Chromatic Splendor", [Skill1, Skill2]);
const NM123 = new ActionGroup("Silent Execution: Necessary Measures 123", [NM1, NM2, NM3]);

const CL_ROTATION = new Rotation([
  START, Skill12.instaSwap(),
  INTRO, Skill12, MA1.holdCancel(), FHA.cancel(),
  Lib1, DeathKnellx4, FatalFinaleResolver,
  Skill12.mashCancel(), ECHO.instaSwap(), OUTRO,
]);
const CL_ROTATION_FAST = new Rotation([
  START, Skill12.instaSwap(),
  INTRO, Skill12, MA1.holdCancel(), FHA.cancel(),
  Lib1, DeathKnellx4, FatalFinaleResolver,
  Skill12.instaSwap(), OUTRO,
]);

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills, weapon, mainslot echo,
// sonata pieces, mainstat/substat
export const CARLOTTA = new Loadout({
  resonator: CARLOTTA_RESONATOR,
  sequences: [CL_S1, CL_S2, CL_S3, CL_S4, CL_S5, CL_S6],
  weapons: [THE_LAST_DANCE, NEW_STD_PISTOL, STATIC_MIST],
  echoLoadouts: [new EchoLoadout(SENTRY_CONSTRUCT, FROSTY_RESOLVE_5PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Glacio3, Mainstat.ATK1),
  substat: substats(Substat.CritRate, Substat.CritDmg, Substat.Skill, Substat.AtkPct, Substat.FlatAtk, Substat.Basic),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Skill, Substat.FlatAtk, Substat.Basic, Substat.Heavy),
    rotation: CL_ROTATION,
});
export const CARLOTTA_FAST = new Loadout({
  resonator: CARLOTTA_RESONATOR,
  sequences: [CL_S1, CL_S2, CL_S3, CL_S4, CL_S5, CL_S6],
  weapons: [THE_LAST_DANCE, NEW_STD_PISTOL, STATIC_MIST],
  echoLoadouts: [new EchoLoadout(SENTRY_CONSTRUCT, FROSTY_RESOLVE_5PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Glacio3, Mainstat.ATK1),
  substat: substats(Substat.CritRate, Substat.CritDmg, Substat.Skill, Substat.AtkPct, Substat.FlatAtk, Substat.Basic),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Skill, Substat.FlatAtk, Substat.Basic, Substat.Heavy),
    rotation: CL_ROTATION_FAST,
});
