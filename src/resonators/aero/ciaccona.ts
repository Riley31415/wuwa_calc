/**
 * Ciaccona, ported to the new engine — a limited 5-star; Sequences 1-6 have their own block below.
 * Musical Essence (forte1, 0-3 segments) is banked one at a time by Basic Attack Stage 4 and the
 * Intro, and spent all three at once on Heavy Attack - Quadruple Downbeat. Nearly everything she
 * casts inflicts a stack of Aero Erosion, which is what her set and her weapon both key off.
 *
 * Recital is the Liberation's own 2240 frames (wuwalab): the big hit at 200, then twenty Symphonic
 * Poem: Tonics from 246 to 2090 for 6.12% ATK and one Aero Erosion each, green by default since
 * nothing is pressed while she is off field. She swap-cancels out where its time stop ends (the
 * Tonics commit there), and switching her back in cuts whatever is left. The manual Tonic's own
 * +10 Concerto needs a press she never makes here, so no Tonic banks any.
 *
 * Numbers from nanoka.cc (character 1407, https://ww.nanoka.cc/character/1407) — no migrated-sheet
 * row exists for her, so MVs are the Skill Attributes tables and energy/concerto/offtune come off
 * Damage Data's own Energy/Elemental DMG/Weakness Break columns (the last x10000), except where a
 * skill states its own Concerto Regen outright, which wins.
 */
import { Stat, Attribute, WeaponType, Type, Cast, Node, Scaling, Subtype } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Sequence } from "../../engine/gear.js";
import {
  asSource,
  applyTeam,
  applyEnemy,
  revokeTeam,
  cancelHits,
  runningAction,
  currentTeam,
  addStat,
  queue,
  onCast,
  isHeld,
  addGain,
} from "../../engine/context.js";
import { ActionGroup, Action, Cooldown, Rotation, NOINTRO, ECHO, INTRO, OUTRO } from "../../engine/rotation.js";
import { tuneBreak } from "../../shared/tunebreak.js";
import { AERO_EROSION, SPECTRO_FRAZZLE, gainShield } from "../../shared/status.js";
import { WOODLAND_ARIA } from "../../weapons/pistol.js";
import { NM_KELPIE } from "../../echoes/rinascita.js";
import { GUSTS_OF_WELKIN_5PC } from "../../echoes/rinascita.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";
import { NEW_STD_PISTOL, STATIC_MIST } from "../../weapons/standard.js";
import { HERON, MOONLIT_CLOUDS_5PC } from "../../echoes/jinzhou.js";

/* ----------------------------------------------------------------------------------- actions */

function ciacconaAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Aero, scaling: Scaling.Atk, ...def });
}

// --- basics, heavy/aimed, mid-air, dodge counter. Stage 4 is the one that matters: it banks a
//     segment of Musical Essence (forte1), inflicts Aero Erosion, and opens the Solo Concert.
const BA1 = ciacconaAction("Basic - Quadruple Time Steps 1", { animFrames: 18, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 10, mv: 5706, energy: 88, concerto: 280, offtune: 2800 }]});
const BA2 = ciacconaAction("Basic - Quadruple Time Steps 2", { animFrames: 63, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 19, mv: 4891, energy: 75, concerto: 240, offtune: 2400 },
    { hitFrame: 41, mv: 2446, energy: 38, concerto: 120, offtune: 1200 },
    { hitFrame: 47, mv: 2446, energy: 38, concerto: 120, offtune: 1200 },
    { hitFrame: 56, mv: 6521, energy: 100, concerto: 320, offtune: 3200 },
  ]});
const BA3 = ciacconaAction("Basic - Quadruple Time Steps 3", { animFrames: 42, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 14, mv: 3302, energy: 51, concerto: 162, offtune: 1620 },
    { hitFrame: 28, mv: 3302, energy: 51, concerto: 162, offtune: 1620 },
    { hitFrame: 34, commitFrame: 28, mv: 3302, energy: 51, concerto: 162, offtune: 1620 },
    { hitFrame: 36, commitFrame: 30, mv: 3302, energy: 51, concerto: 162, offtune: 1620 },
  ]});
// Stage 4, Harmonic Allegro, Quadruple Downbeat and the Intro each lay one Aero Erosion
const EROSION = { updateDebuffs: () => applyEnemy(AERO_EROSION, 1) };
const BA4 = ciacconaAction("Basic - Quadruple Time Steps 4", {
  animFrames: 90, animPriority: { 83: 0 }, castPriority: 2,
  node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 18, commitFrame: 0, mv: 6114, energy: 94, concerto: 300, offtune: 3000 },
    { hitFrame: 26, commitFrame: 0, mv: 6114, energy: 94, concerto: 300, offtune: 3000 },
    { hitFrame: 34, commitFrame: 0, mv: 6114, energy: 94, concerto: 300, offtune: 3000 },
    { hitFrame: 67, commitFrame: 0, mv: 6114, energy: 94, concerto: 300, offtune: 3000, ...EROSION },
    // the Solo Concert opens at 80 (wuwalab), the S6 hit with it
    { hitFrame: 80, commitFrame: 0, element: null, type: null, subtype: null, updateDebuffs: () => {
      applyTeam(SOLO_CONCERT, 1);
      if (isHeld(CI_S6)) queue(SoloConcertS6);
    } },
  ], castForte1: 1,
});

/** S6: one 220% hit as the Solo Concert opens (Stage 4's 80 bullet), counted as Resonance
 *  Liberation DMG — not a row on the kit page, so it banks no energy, concerto or off-tune. */
const SoloConcertS6 = ciacconaAction("Basic - Solo Concert (S6)", { node: Node.Normal, type: Type.Liberation, bullets: [{ hitFrame: 0, mv: 22000 }] });

const HA = ciacconaAction("Heavy - Attack", { castPriority: 2, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [{ hitFrame: 0, mv: 10760, energy: 165, concerto: 528, offtune: 5280 }] });
const AimedShot = ciacconaAction("Heavy - Aimed Shot", { castPriority: 2, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [{ hitFrame: 0, mv: 3261, energy: 50, concerto: 160, offtune: 1600 }] });
const ChargedShot = ciacconaAction("Heavy - Fully Charged Aimed Shot", { castPriority: 2, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [{ hitFrame: 0, mv: 7337, energy: 113, concerto: 360, offtune: 3600 }] });
const MA1 = ciacconaAction("Mid-air - Attack 1", { animFrames: 33, castPriority: 6, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 10, mv: 5543, energy: 85, concerto: 272, offtune: 2720 },
    { hitFrame: 26, mv: 5543, energy: 85, concerto: 272, offtune: 2720 },
  ] });
const MA2 = ciacconaAction("Mid-air - Attack 2", { animFrames: 43, animPriority: { 3: 2 }, castPriority: 6, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 36, mv: 2446, energy: 38, concerto: 120, offtune: 1200 },
    { hitFrame: 41, commitFrame: 36, mv: 2446, energy: 38, concerto: 120, offtune: 1200 },
    { hitFrame: 48, commitFrame: 36, mv: 2446, energy: 38, concerto: 120, offtune: 1200 },
    { hitFrame: 53, commitFrame: 36, mv: 2446, energy: 38, concerto: 120, offtune: 1200 },
  ] });
const DC = ciacconaAction("Dodge Counter - Quadruple Time Steps", { animFrames: 42, animPriority: { 66: 2 }, castPriority: 8, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 14, mv: 5717, energy: 51, concerto: 162, offtune: 1620 },
    { hitFrame: 28, mv: 5717, energy: 51, concerto: 162, offtune: 1620 },
    { hitFrame: 28, mv: 5717, energy: 51, concerto: 162, offtune: 1620 },
    { hitFrame: 30, mv: 5717, energy: 51, concerto: 162, offtune: 1620 },
  ], castConcerto: 1000});

// S3 "gains 1 more charge" on the 10s cooldown
const SKILL_CD = new Cooldown({ frames: 60 * 10, charges: () => (isHeld(CI_S3) ? 2 : 1) });
const Skill = ciacconaAction("Skill - Harmonic Allegro", { animFrames: 39, animPriority: { 39: 2 }, castPriority: 4, cooldown: SKILL_CD, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 12, mv: 4039, energy: 240, offtune: 1250,
      ...EROSION },
    { hitFrame: 12, mv: 4039, energy: 240, offtune: 1250 },
    { hitFrame: 24, mv: 4039, energy: 240, offtune: 1250 },
    { hitFrame: 36, mv: 4039, energy: 240, offtune: 1250 },
  ], castConcerto: 1500});

/** Forte Circuit: replaces the Heavy Attack at 3 segments and spends all of them. */
const Downbeat = ciacconaAction("Forte Heavy - Quadruple Downbeat", { minForte1: 3, animFrames: 75, animPriority: { 1: 4, 66: 2 }, castPriority: 7, node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 45, mv: 3141, energy: 75, offtune: 468 },
    { hitFrame: 57, commitFrame: 45, mv: 3141, energy: 75, offtune: 468 },
    { hitFrame: 69, commitFrame: 45, mv: 3141, energy: 75, offtune: 468 },
    { hitFrame: 81, commitFrame: 45, mv: 3141, energy: 75, offtune: 468 },
    { hitFrame: 93, commitFrame: 45, mv: 3141, energy: 75, offtune: 468 },
    { hitFrame: 105, commitFrame: 45, mv: 3141, energy: 75, offtune: 468 },
    { hitFrame: 117, commitFrame: 45, mv: 3141, energy: 75, offtune: 468 },
    { hitFrame: 129, commitFrame: 45, mv: 3141, energy: 75, offtune: 468 },
    { hitFrame: 141, commitFrame: 45, mv: 3141, energy: 75, offtune: 468 },
    { hitFrame: 153, commitFrame: 45, mv: 3141, energy: 75, offtune: 468 },
    { hitFrame: 165, commitFrame: 45, mv: 31403, energy: 747, offtune: 4680, ...EROSION },
  ], castConcerto: 2500, castForte1: -3});

// --- liberation / intro / outro. The Liberation is Recital (see file header): its Tonics are its
//     own bullets, committed where the time stop ends so she can swap out there.
/** Recital's whole press: the Improvised Symphonic Poem, then twenty Tonics of one colour, the last
 *  of which ends Recital (nanoka's "6.12%*20"; off-tune the row's split the same way). */
function cadenza(name: string, inflict: () => void): Action {
  const TONIC = { updateDebuffs: inflict };
  return ciacconaAction(name, {
    animFrames: 2240, castPriority: 10, timestop: [0, 220], motionStop: [0, 215], cooldown: 60 * 20,
    node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, bullets: [
      { hitFrame: 200, mv: 110042, offtune: 48000, updateDebuffs: () => gainShield() }, // Interlude Tune
      { hitFrame: 246, commitFrame: 220, mv: 612, offtune: 2182, ...TONIC },
      { hitFrame: 326, commitFrame: 220, mv: 612, offtune: 2182, ...TONIC },
      { hitFrame: 424, commitFrame: 220, mv: 612, offtune: 2182, ...TONIC },
      { hitFrame: 522, commitFrame: 220, mv: 612, offtune: 2182, ...TONIC },
      { hitFrame: 620, commitFrame: 220, mv: 612, offtune: 2182, ...TONIC },
      { hitFrame: 718, commitFrame: 220, mv: 612, offtune: 2182, ...TONIC },
      { hitFrame: 816, commitFrame: 220, mv: 612, offtune: 2182, ...TONIC },
      { hitFrame: 914, commitFrame: 220, mv: 612, offtune: 2182, ...TONIC },
      { hitFrame: 1012, commitFrame: 220, mv: 612, offtune: 2182, ...TONIC },
      { hitFrame: 1110, commitFrame: 220, mv: 612, offtune: 2182, ...TONIC },
      { hitFrame: 1208, commitFrame: 220, mv: 612, offtune: 2182, ...TONIC },
      { hitFrame: 1306, commitFrame: 220, mv: 612, offtune: 2182, ...TONIC },
      { hitFrame: 1404, commitFrame: 220, mv: 612, offtune: 2182, ...TONIC },
      { hitFrame: 1502, commitFrame: 220, mv: 612, offtune: 2182, ...TONIC },
      { hitFrame: 1600, commitFrame: 220, mv: 612, offtune: 2182, ...TONIC },
      { hitFrame: 1698, commitFrame: 220, mv: 612, offtune: 2182, ...TONIC },
      { hitFrame: 1796, commitFrame: 220, mv: 612, offtune: 2182, ...TONIC },
      { hitFrame: 1894, commitFrame: 220, mv: 612, offtune: 2182, ...TONIC },
      { hitFrame: 1992, commitFrame: 220, mv: 612, offtune: 2182, ...TONIC },
      {
        hitFrame: 2090, commitFrame: 220, mv: 612, offtune: 2182,
        updateDebuffs: () => {
          inflict();
          revokeTeam(RECITAL);
        },
      },
    ], castConcerto: 2000, resetEnergy: true,
    updateBuffs: () => applyTeam(RECITAL, 1),
  });
}
const Liberation = cadenza("Liberation - Singer's Triple Cadenza", () => applyEnemy(AERO_EROSION, 1));
/** The same cast with the yellow button pressed before she leaves: every Tonic after the swap
 *  matches it, so the whole Recital lays Spectro Frazzle instead (wuwalab's "Select Yellow Tonic"). */
const LiberationYellow = cadenza("Liberation - Singer's Triple Cadenza (Yellow Tonic)", () => applyEnemy(SPECTRO_FRAZZLE, 1));
const CADENZAS = new Set<Action>([Liberation, LiberationYellow]);
const Intro = ciacconaAction("Intro - Roaming with the Wind", {
  animFrames: 54, noSwapFrames: 61, animPriority: { 54: 2 }, castPriority: 11, motionStop: [6, 44],
  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [{ hitFrame: 40, mv: 18911, energy: 1000, offtune: 9280, ...EROSION }], castConcerto: 1000, castForte1: 1,
  // switching back in exits Recital, cutting whatever Tonics are left
  updateBuffs: () => {
    cancelHits(CADENZAS);
    revokeTeam(RECITAL);
  },
});
const Outro = ciacconaAction("Outro - Windcalling Tune", {
  animFrames: 0,
  cast: Cast.Outro, minConcerto: 10000, castConcerto: -10000,
  updateBuffs: () => applyTeam(WINDCALLING_TUNE, 1),
});

/* ------------------------------------------------------------------------------------ buffs */

/** Solo Concert: opened by Basic Attack Stage 4 (Ciaccona's own, or an Ensemble Sylph finishing it
 *  for her), +24% Aero DMG Bonus to the whole team, not stackable. No stated duration, so it's
 *  lost on her own next Intro like every other team buff here. */
const SOLO_CONCERT = new Buff({
  name: "Ciaccona: Solo Concert",
  stats: [[Stat.DmgBonus, 24, Attribute.Aero]],
});

/** Recital standing, from the Liberation's cast to its last Tonic or her next Intro. */
const RECITAL = new Buff({
  name: "Ciaccona: Recital",
  // S2: +40% Aero DMG Bonus to the team for as long as the Cadenza plays — read off her own slot,
  // since the node is her local gear and this buff pays whoever acts
  applyStats: () => {
    if (currentTeam().slots.find((m) => m.resonator === CIACCONA_RESONATOR)?.isHeld(CI_S2)) {
      asSource(CI_S2, () => addStat(Stat.DmgBonus, 40, Attribute.Aero));
    }
  },
});

/** Interlude Tune (Inherent Skill): a shield off the Liberation — put up as the shield marker from
 *  CIACCONA_RESONATOR's own updateDebuffs(); shields are not a stat, so this piece is held for the name. */
const CI_INHERENT_1 = new Inherent({ name: "Inherent: Interlude Tune" });

/** Winds of Rinascita (Inherent Skill): Quadruple Downbeat deals 30% more DMG — always on, so it
 *  pays straight out of the piece rather than through a buff. */
const CI_INHERENT_2 = new Inherent({
  name: "Inherent: Winds of Rinascita",
  applyStats: () => { if (runningAction(Downbeat)) addStat(Stat.DmgBonus, 30); },
});

/** Windcalling Tune (Outro): Aero Erosion DMG on targets near the active resonator is amplified
 *  100% for 30s, so permanent uptime. Scoped to Aero Erosion, which is the only amplification a
 *  dot row reads at all (see statuses.ts) — an unscoped one would pay nothing here. */
const WINDCALLING_TUNE = new Buff({ 
  name: "Ciaccona: Outro",
  duration: 60 * 30,
  stats: [[Stat.Amp, 100, Subtype.AeroErosion]],
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
const CIACCONA_TALENTS = new Talent({
  name: "Ciaccona: Talents",
  stats: [[Stat.BonusAtk, 12], [Stat.CritDmg, 16]],
});

/** Her, as a Resonator: name/element/weapon, every grant/spend/queue rule her kit needs, and her
 *  own base stat line. */
export const CIACCONA_RESONATOR = new Resonator({
  name: "Ciaccona",
  talent: CIACCONA_TALENTS,
  inherent1: CI_INHERENT_1,
  inherent2: CI_INHERENT_2,
  element: Attribute.Aero,
  weapon: WeaponType.Pistols,
  color: "#5ac46b",
  intro: Intro,
  outro: Outro,
  tuneBreak: tuneBreak(97, [0, 97], [0, 70], [[72, 160000]], { 0: 11, 97: 3 }),
  maxEnergy: 12500,
  maxForte1: 3,

  stats: [[Stat.BaseHp, 12237.5], [Stat.BaseAtk, 375], [Stat.BaseDef, 1197.7756]],
});

/* --------------------------------------------------------------------------------- sequences */

/** S1: +35% ATK for 10s off any Basic Attack — mid-air presses included, as every kit here reads
 *  "casting Basic Attack" — so it stands until her Outro. The interrupt immunity is no stat. */
const WHERE_WIND_SINGS = new Buff({
  name: "Ciaccona S1: Where Wind Sings",
  duration: 60 * 10,
  stats: [[Stat.BonusAtk, 35]],
});
const CI_S1 = new Sequence({
  name: "Ciaccona S1: Where Wind Sings",
  grants: [{ on: onCast(Cast.Basic), buff: WHERE_WIND_SINGS }],
});

/** S2: +40% Aero DMG Bonus to the team while the Cadenza plays — paid by the Recital itself (above),
 *  which is that window. */
const CI_S2 = new Sequence({ name: "Ciaccona S2: Song of the Four Seasons" });

/** S3: Stage 4 banks a second segment of Musical Essence, and Harmonic Allegro holds a second
 *  charge — which is the extra Skill the S3 rotation casts. */
const CI_S3 = new Sequence({
  name: "Ciaccona S3: Starlit Improv",
  updateBuffs: () => {
    if (runningAction(BA4)) addGain({ forte1: 1 });
  },
});

/** S4: 45% of the target's DEF ignored on Quadruple Downbeat and on every Resonance Liberation hit.
 *  The old ignore, hers being a 2.4 kit (stats.ts). */
const CI_S4 = new Sequence({
  name: "Ciaccona S4: Toccata and Fugue",
  applyStats: () => {
    if (runningAction(Downbeat)) addStat(Stat.DefIgnoreOld, 45);
    addStat(Stat.DefIgnoreOld, 45, Type.Liberation);
  },
});

/** S5: +40% Resonance Liberation DMG Bonus. The damage reduction is out of scope. */
const CI_S5 = new Sequence({
  name: "Ciaccona S5: Eternal Idyll to Lasting Summer",
  stats: [[Stat.DmgBonus, 40, Type.Liberation]],
});

/** S6: the Solo Concert hit above, queued by every Stage 4 that opens one. */
const CI_S6 = new Sequence({ name: "Ciaccona S6: Unending Cadence" });

const CI_SEQUENCES = [CI_S1, CI_S2, CI_S3, CI_S4, CI_S5, CI_S6];


// Intro plus two Basic Stage 4s are the three Musical Essence Quadruple Downbeat spends; the Skill
// chains straight back into Basic Stage 2, which is how the second stage-4 comes around without
// restarting the string. She's never the team's own lead, so this covers opener and loop both.

const MA12 = new ActionGroup("Mid-air - Attack 12", [MA1, MA2]);
const BA34 = new ActionGroup("Basic - Quadruple Time Steps 34", [BA3, BA4]);
const BA234 = new ActionGroup("Basic - Quadruple Time Steps 234", [BA2, BA3, BA4]);

const CI_ROTATION = new Rotation([
  NOINTRO, 
  Skill, BA234.instaJump(), MA12, BA4.instaJump(), MA12, BA4.instaCancel(), 
  Downbeat.cancel(), ECHO.instaDodge(), Liberation.swapCancel(), OUTRO,

  INTRO, BA34.instaJump(),
  MA12, BA4.instaCancel(),
  Skill, Downbeat.cancel(), ECHO.instaDodge(), Liberation.swapCancel(), OUTRO,
]);

/** The same loop with the yellow Tonic picked, for a Spectro Frazzle team. */
const CI_ROTATION_YELLOW = new Rotation([
  NOINTRO,
  Skill, BA234.instaJump(), MA12, BA4.instaJump(), MA12, BA4.instaCancel(),
  Downbeat.cancel(), ECHO.instaDodge(), LiberationYellow.swapCancel(), OUTRO,

  INTRO, BA34.instaJump(),
  MA12, BA4.instaCancel(),
  Skill, Downbeat.cancel(), ECHO.instaDodge(), LiberationYellow.swapCancel(), OUTRO,
]);

/** From S3 on Harmonic Allegro has two charges, so both go before the Downbeat; the second
 *  segment Stage 4 banks changes nothing here, the Downbeat spends the capped three either way. */
const CI_ROTATION_S3 = new Rotation([
  NOINTRO,
  Skill, BA234.instaJump(), MA12, BA4.instaCancel(), 
  Skill, Downbeat.cancel(), ECHO.instaDodge(), Liberation.swapCancel(), OUTRO,

  INTRO, BA34.instaCancel(),
  Skill, Downbeat.cancel(), Skill, ECHO.instaDodge(), Liberation.swapCancel(), OUTRO,
]);
/* ----------------------------------------------------------------------------------- loadout */

// her real build: resonator + talents + both Inherent Skills, her own weapon, her own mainslot
// echo and the one sonata that pays for the Aero Erosion she frozenStacks, mainstat/substat
const CIACCONA_BUILD = {
  resonator: CIACCONA_RESONATOR,
  weapons: [WOODLAND_ARIA, NEW_STD_PISTOL, STATIC_MIST],
  echoLoadouts: [new EchoLoadout(NM_KELPIE, GUSTS_OF_WELKIN_5PC),
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC)
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Aero3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.AtkPct, Substat.Liberation, Substat.FlatAtk, Substat.Heavy),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Liberation, Substat.FlatAtk, Substat.Basic, Substat.Heavy),
  sequences: CI_SEQUENCES,
};
export const CIACCONA = new Loadout({
  ...CIACCONA_BUILD,
  rotation: { 0: CI_ROTATION, // 3: CI_ROTATION_S3 disabled for er and extension issue
   },
});
/** Recital on the yellow Tonic: Spectro Frazzle instead of Aero Erosion off all twenty. */
export const CIACCONA_YELLOW = new Loadout({ ...CIACCONA_BUILD, rotation: { 0: CI_ROTATION_YELLOW } });
