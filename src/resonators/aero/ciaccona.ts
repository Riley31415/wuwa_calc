/**
 * Ciaccona, ported to the new engine — a limited 5-star; Sequences 1-6 have their own block below.
 * Musical Essence (forte1, 0-3 segments) is banked one at a time by Basic Attack Stage 4 and the
 * Intro, and spent all three at once on Heavy Attack - Quadruple Downbeat. Nearly everything she
 * casts inflicts a stack of Aero Erosion, which is what her set and her weapon both key off.
 *
 * Recital, off the Liberation, is her field: a Symphonic Poem: Tonic every 1.63s (wuwalab's own
 * frame data — 98 frames apart, twenty of them, ~33s) for 6.12% ATK and one Aero Erosion each,
 * green by default since nothing is pressed while she is off field. Ended by her own next Intro
 * (switching back in) or a fresh Liberation. The manual Tonic's own +10 Concerto needs a press
 * she never makes here, so no Tonic banks any.
 *
 * Numbers from nanoka.cc (character 1407, https://ww.nanoka.cc/character/1407) — no migrated-sheet
 * row exists for her, so MVs are the Skill Attributes tables and energy/concerto/offtune come off
 * Damage Data's own Energy/Elemental DMG/Weakness Break columns (the last x10000), except where a
 * skill states its own Concerto Regen outright, which wins.
 */
import { Stat, Attribute, WeaponType, Type, Cast, Node, Scaling, Subtype } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Sequence, coordinatedBuff } from "../../engine/gear.js";
import {
  asSource,
  applyCurrent,
  applyTeam,
  applyEnemy,
  revokeTeam,
  runningAction,
  currentTeam,
  addStat,
  queue,
  onCast,
  isHeld,
  addToCast,
} from "../../engine/context.js";
import { ActionGroup, Action, ActionField, Cooldown, Rotation, NOINTRO, ECHO, INTRO } from "../../engine/rotation.js";
import { tuneBreak } from "../../shared/tunebreak.js";
import { AERO_EROSION, SHIELD, gainShield } from "../../shared/status.js";
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
const BA1 = ciacconaAction("Basic - Quadruple Time Steps 1", { animFrames: 18, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 10, mv: 5706, energy: 88, concerto: 280, offtune: 2800 }]});
const BA2 = ciacconaAction("Basic - Quadruple Time Steps 2", { animFrames: 63, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 19, mv: 4891, energy: 75, concerto: 240, offtune: 2400 },
    { hitFrame: 41, mv: 2446, energy: 38, concerto: 120, offtune: 1200 },
    { hitFrame: 47, mv: 2446, energy: 38, concerto: 120, offtune: 1200 },
    { hitFrame: 56, mv: 6521, energy: 100, concerto: 320, offtune: 3200 },
  ]});
const BA3 = ciacconaAction("Basic - Quadruple Time Steps 3", { animFrames: 42, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 14, mv: 3302, energy: 51, concerto: 162, offtune: 1620 },
    { hitFrame: 28, mv: 3302, energy: 51, concerto: 162, offtune: 1620 },
    { hitFrame: 34, commitFrame: 30, mv: 3302, energy: 51, concerto: 162, offtune: 1620 },
    { hitFrame: 36, commitFrame: 30, mv: 3302, energy: 51, concerto: 162, offtune: 1620 },
  ]});
// Stage 4, Harmonic Allegro, Quadruple Downbeat and the Intro each lay one Aero Erosion
const EROSION = { updateDebuffs: () => applyEnemy(AERO_EROSION, 1) };
const BA4 = ciacconaAction("Basic - Quadruple Time Steps 4", {
  animFrames: 90,
  node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 18, commitFrame: 0, mv: 6114, energy: 94, concerto: 300, offtune: 3000,
      ...EROSION },
    { hitFrame: 26, commitFrame: 0, mv: 6114, energy: 94, concerto: 300, offtune: 3000 },
    { hitFrame: 34, commitFrame: 0, mv: 6114, energy: 94, concerto: 300, offtune: 3000 },
    { hitFrame: 67, commitFrame: 0, mv: 6114, energy: 94, concerto: 300, offtune: 3000 },
  ], castForte1: 1,
  updateBuffs: () => applyTeam(SOLO_CONCERT, 1),
});

/** S6: one 220% hit as the Solo Concert opens, counted as Resonance Liberation DMG — not a row on
 *  the kit page, so it banks no energy, concerto or off-tune. */
const SoloConcertS6 = ciacconaAction("Basic - Solo Concert (S6)", { node: Node.Normal, type: Type.Liberation, bullets: [{ hitFrame: 0, mv: 22000 }] });

const HA = ciacconaAction("Heavy - Attack", { node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [{ hitFrame: 0, mv: 10760, energy: 165, concerto: 528, offtune: 5280 }] });
const AimedShot = ciacconaAction("Heavy - Aimed Shot", { node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [{ hitFrame: 0, mv: 3261, energy: 50, concerto: 160, offtune: 1600 }] });
const ChargedShot = ciacconaAction("Heavy - Fully Charged Aimed Shot", { node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [{ hitFrame: 0, mv: 7337, energy: 113, concerto: 360, offtune: 3600 }] });
const MA1 = ciacconaAction("Mid-air - Attack 1", { node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 0, mv: 11086, energy: 170, concerto: 544, offtune: 5440 }] });
const MA2 = ciacconaAction("Mid-air - Attack 2", { animFrames: 60, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 60, mv: 9784, energy: 152, concerto: 480, offtune: 4800 }] });
const DC = ciacconaAction("Dodge Counter - Quadruple Time Steps", { animFrames: 42, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 14, mv: 5717, energy: 51, concerto: 162, offtune: 1620 },
    { hitFrame: 28, mv: 5717, energy: 51, concerto: 162, offtune: 1620 },
    { hitFrame: 28, mv: 5717, energy: 51, concerto: 162, offtune: 1620 },
    { hitFrame: 30, mv: 5717, energy: 51, concerto: 162, offtune: 1620 },
  ], castConcerto: 1000});

// S3 "gains 1 more charge" on the 10s cooldown
const SKILL_CD = new Cooldown({ frames: 60 * 10, charges: () => (isHeld(CI_S3) ? 2 : 1) });
const Skill = ciacconaAction("Skill - Harmonic Allegro", { animFrames: 39, cooldown: SKILL_CD, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 12, mv: 4039, energy: 240, offtune: 1250,
      ...EROSION },
    { hitFrame: 12, mv: 4039, energy: 240, offtune: 1250 },
    { hitFrame: 24, mv: 4039, energy: 240, offtune: 1250 },
    { hitFrame: 36, mv: 4039, energy: 240, offtune: 1250 },
  ], castConcerto: 1500});

/** Forte Circuit: replaces the Heavy Attack at 3 segments and spends all of them. */
const Downbeat = ciacconaAction("Forte Heavy - Quadruple Downbeat", { minForte1: 3, animFrames: 75, node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 45, mv: 3141, energy: 75, offtune: 468,
      ...EROSION },
    { hitFrame: 57, commitFrame: 45, mv: 3141, energy: 75, offtune: 468 },
    { hitFrame: 69, commitFrame: 45, mv: 3141, energy: 75, offtune: 468 },
    { hitFrame: 81, commitFrame: 45, mv: 3141, energy: 75, offtune: 468 },
    { hitFrame: 93, commitFrame: 45, mv: 3141, energy: 75, offtune: 468 },
    { hitFrame: 105, commitFrame: 45, mv: 3141, energy: 75, offtune: 468 },
    { hitFrame: 117, commitFrame: 45, mv: 3141, energy: 75, offtune: 468 },
    { hitFrame: 129, commitFrame: 45, mv: 3141, energy: 75, offtune: 468 },
    { hitFrame: 141, commitFrame: 45, mv: 3141, energy: 75, offtune: 468 },
    { hitFrame: 153, commitFrame: 45, mv: 3141, energy: 75, offtune: 468 },
    { hitFrame: 165, commitFrame: 45, mv: 31403, energy: 747, offtune: 4680 },
  ], castConcerto: 2500, castForte1: -3});

// --- liberation / intro / outro. The Liberation opens Recital (see file header); a fresh cast
//     starts it over, and switching her back in ends it.
const Liberation = ciacconaAction("Liberation - Singer's Triple Cadenza", {
  cooldown: 60 * 20,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, bullets: [{ hitFrame: 0, mv: 110042, offtune: 48000 }], castConcerto: 2000, resetEnergy: true,
  updateDebuffs: () => gainShield(), // Interlude Tune
  updateBuffs: () => { revokeTeam(RECITAL); applyTeam(RECITAL, RECITAL.maxStacks); },
});
/** One Tonic of the twenty (nanoka's "6.12%*20" is the whole Recital), on her own slot whoever
 *  is on field. Off-tune is the row's 43640 split the same way. */
const RECITAL_FIELD = new ActionField("Ciaccona: Recital");
const GreenTonic = ciacconaAction("Liberation - Symphonic Poem: Tonic (green)", {
  node: Node.Liberation, type: Type.Liberation, bullets: [{ hitFrame: 0, mv: 612, offtune: 2182 }], field: RECITAL_FIELD, ...EROSION,
});
const Intro = ciacconaAction("Intro - Roaming with the Wind", {
  animFrames: 54, prioFrames: 54, motionStop: 39,
  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [{ hitFrame: 40, mv: 18911, energy: 1000, offtune: 9280 }], castConcerto: 1000, castForte1: 1, ...EROSION,
  updateBuffs: () => revokeTeam(RECITAL), // switching back in exits Recital
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

/** Recital standing: 33 of the engine's seconds, a Tonic every 1.65 of them (gear.ts's `coordinatedBuff`
 *  field window), ticking onto her slot however far the field has moved on. */
const RECITAL = coordinatedBuff("Ciaccona: Recital", 33, () => CIACCONA_RESONATOR, GreenTonic, {
  every: 1.65,
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
const CIACCONA_RESONATOR = new Resonator({
  name: "Ciaccona",
  talent: CIACCONA_TALENTS,
  inherent1: CI_INHERENT_1,
  inherent2: CI_INHERENT_2,
  element: Attribute.Aero,
  weapon: WeaponType.Pistols,
  color: "#5ac46b",
  intro: Intro,
  tuneBreak: tuneBreak(97, 97, 70, [[72, 160000]]),
  maxEnergy: 12500,
  maxForte1: 3,

  stats: [[Stat.BaseHp, 12237.5], [Stat.BaseAtk, 375], [Stat.BaseDef, 1197.7756]],
});

// Intro plus two Basic Stage 4s are the three Musical Essence Quadruple Downbeat spends; the Skill
// chains straight back into Basic Stage 2, which is how the second stage-4 comes around without
// restarting the string. She's never the team's own lead, so this covers opener and loop both.

const MA12 = new ActionGroup("Mid-air - Attack 12", [MA1, MA2]);
const BA34 = new ActionGroup("Basic - Quadruple Time Steps 34", [BA3, BA4]);
const BA234 = new ActionGroup("Basic - Quadruple Time Steps 234", [BA2, BA3, BA4]);

const CI_ROTATION = new Rotation([
  NOINTRO, 
  Skill, BA234.instaJump(), MA12, BA4.instaJump(), MA12, BA4.instaCancel(), 
  Downbeat.cancel(), Liberation, ECHO.instaSwap(), Outro,

  INTRO, BA34.instaJump(),
  MA12, BA4.instaCancel(),
  Skill, Downbeat.cancel(), Liberation, ECHO.instaSwap(), Outro,
]);

/** From S3 on Harmonic Allegro has two charges, so both go before the Downbeat; the second
 *  segment Stage 4 banks changes nothing here, the Downbeat spends the capped three either way. */
const CI_ROTATION_S3 = new Rotation([
  NOINTRO,
  Skill, BA234.instaJump(), MA12, BA4.instaCancel(), 
  Skill, Downbeat.cancel(), Liberation, ECHO.instaSwap(), Outro,

  INTRO, BA34.instaCancel(),
  Skill, Downbeat.cancel(), Liberation, Skill, ECHO.instaSwap(), Outro,
]);

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
    if (runningAction(BA4)) addToCast({ forte1: 1 });
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

/** S6: the Solo Concert hit above, off every Stage 4 that opens one. */
const CI_S6 = new Sequence({
  name: "Ciaccona S6: Unending Cadence",
  updateBuffs: () => { if (runningAction(BA4)) queue(SoloConcertS6); },
});

const CI_SEQUENCES = [CI_S1, CI_S2, CI_S3, CI_S4, CI_S5, CI_S6];

/* ----------------------------------------------------------------------------------- loadout */

// her real build: resonator + talents + both Inherent Skills, her own weapon, her own mainslot
// echo and the one sonata that pays for the Aero Erosion she frozenStacks, mainstat/substat
export const CIACCONA = new Loadout({
  resonator: CIACCONA_RESONATOR,
  weapons: [WOODLAND_ARIA, NEW_STD_PISTOL, STATIC_MIST],
  echoLoadouts: [new EchoLoadout(NM_KELPIE, GUSTS_OF_WELKIN_5PC),
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC)
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Aero3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.AtkPct, Substat.Liberation, Substat.FlatAtk, Substat.Heavy),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Liberation, Substat.FlatAtk, Substat.Heavy),
  rotation: { 0: CI_ROTATION, // 3: CI_ROTATION_S3 disabled for er and extension issue
   },
  sequences: CI_SEQUENCES,
});
