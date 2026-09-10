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
import { Stat, Attribute, WeaponType, Type1, Cast, Node, Scaling, Type2 } from "../../engine/stats.js";
import { Buff, Debuff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Sequence } from "../../engine/gear.js";
import {
  asSource,
  applyCurrent,
  applyTeam,
  applyEnemy,
  revokeTeam,
  runningAction,
  currentTeam,
  addStat,
  casting,
  revokeCurrent,
  queue,
} from "../../engine/context.js";
import { ActionGroup, Action, ActionField, Rotation, NOINTRO, INTRO, ECHO_SWAP, OUTRO, SWAP, JUMP } from "../../engine/rotation.js";
import { coordinatedBuff } from "../../shared/helpers.js";
import { AERO_EROSION, SHIELD } from "../../shared/status.js";
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
const BA1 = ciacconaAction("Basic - Quadruple Time Steps 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 57.06, energy: 0.88, concerto: 2.8, offtune: 2800 });
const BA2 = ciacconaAction("Basic - Quadruple Time Steps 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 163.04, energy: 2.51, concerto: 8, offtune: 8000 });
const BA3 = ciacconaAction("Basic - Quadruple Time Steps 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 132.08, energy: 2.04, concerto: 6.48, offtune: 6480 });
// Stage 4, Harmonic Allegro, Quadruple Downbeat and the Intro each lay one Aero Erosion
const EROSION = { updateDebuffs: () => applyEnemy(AERO_EROSION, 1) };
const BA4 = ciacconaAction("Basic - Quadruple Time Steps 4", {
  node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 244.56, energy: 3.76, concerto: 12, offtune: 12000, forte1: 1, ...EROSION,
  updateBuffs: () => applyTeam(SOLO_CONCERT, 1),
});

/** S6: one 220% hit as the Solo Concert opens, counted as Resonance Liberation DMG — not a row on
 *  the kit page, so it banks no energy, concerto or off-tune. */
const SoloConcertS6 = ciacconaAction("Basic - Solo Concert (S6)", { node: Node.Normal, type: Type1.Liberation, mv: 220 });

const HA = ciacconaAction("Heavy - Attack", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 107.60, energy: 1.65, concerto: 5.28, offtune: 5280 });
const AimedShot = ciacconaAction("Heavy - Aimed Shot", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 32.61, energy: 0.5, concerto: 1.6, offtune: 1600 });
const ChargedShot = ciacconaAction("Heavy - Fully Charged Aimed Shot", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 73.37, energy: 1.13, concerto: 3.6, offtune: 3600 });
const MA1 = ciacconaAction("Mid-air - Attack 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 110.86, energy: 1.7, concerto: 5.44, offtune: 5440 });
const MA2 = ciacconaAction("Mid-air - Attack 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 97.84, energy: 1.52, concerto: 4.8, offtune: 4800 });
const DC = ciacconaAction("Dodge Counter - Quadruple Time Steps", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 228.68, energy: 2.04, concerto: 16.48, offtune: 6480 });

const Skill = ciacconaAction("Skill - Harmonic Allegro", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 161.56, energy: 9.6, concerto: 15, offtune: 5000, ...EROSION });

/** Forte Circuit: replaces the Heavy Attack at 3 segments and spends all of them. */
const Downbeat = ciacconaAction("Forte Heavy - Quadruple Downbeat", { node: Node.Forte, cast: Cast.Heavy, type: Type1.Heavy, mv: 628.13, energy: 14.97, concerto: 25, offtune: 9360, forte1: -3, ...EROSION });

// --- liberation / intro / outro. The Liberation opens Recital (see file header); a fresh cast
//     starts it over, and switching her back in ends it.
const Liberation = ciacconaAction("Liberation - Singer's Triple Cadenza", {
  node: Node.Liberation, cast: Cast.Liberation, cutscene: true, type: Type1.Liberation, mv: 1100.42, concerto: 20, offtune: 48000, resetEnergy: true,
  updateDebuffs: () => applyCurrent(SHIELD, 1), // Interlude Tune
  updateBuffs: () => { revokeTeam(RECITAL); applyTeam(RECITAL, 33); },
});
/** One Tonic of the twenty (nanoka's "6.12%*20" is the whole Recital), on her own slot whoever
 *  is on field. Off-tune is the row's 43640 split the same way. */
const RECITAL_FIELD = new ActionField("Ciaccona: Recital");
const GreenTonic = ciacconaAction("Liberation - Symphonic Poem: Tonic (green)", {
  node: Node.Liberation, type: Type1.Liberation, mv: 6.12, offtune: 2182, field: RECITAL_FIELD, ...EROSION,
});
const Intro = ciacconaAction("Intro - Roaming with the Wind", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 189.11, energy: 10, concerto: 10, offtune: 9280, forte1: 1, ...EROSION,
  updateBuffs: () => revokeTeam(RECITAL), // switching back in exits Recital
});
const Outro = ciacconaAction("Outro - Windcalling Tune", {
  cast: Cast.Outro, concerto: -100, swapOut: true,
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

/** Recital standing: 33 of the engine's seconds, a Tonic every 1.65 of them (helpers.ts's own
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
  applyStats: () => { addStat(Stat.Amp, 100, Type2.AeroErosion)}
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
  intro: () => Intro,
  outro: () => Outro,
  color: "#5ac46b",
  maxEnergy: 125,
  maxForte1: 3,

  constantStats: () => {
    addStat(Stat.BaseHp, 12238); addStat(Stat.BaseAtk, 375); addStat(Stat.BaseDef, 1198);
  },
});

// Intro plus two Basic Stage 4s are the three Musical Essence Quadruple Downbeat spends; the Skill
// chains straight back into Basic Stage 2, which is how the second stage-4 comes around without
// restarting the string. She's never the team's own lead, so this covers opener and loop both.

const MA12 = new ActionGroup("Mid-air - Attack 12", [MA1, MA2]);
const BA34 = new ActionGroup("Basic - Quadruple Time Steps 34", [BA3, BA4]);

const CI_ROTATION = new Rotation([
  NOINTRO, 
  JUMP, MA12, BA4, 
  JUMP, MA12, BA4, 
  JUMP, MA12, BA4, 
  Skill, Downbeat, Liberation, ECHO_SWAP, OUTRO,

  INTRO, BA34, JUMP,
  MA12, BA4,
  Skill, Downbeat, Liberation, ECHO_SWAP, OUTRO,
]);

/** From S3 on Harmonic Allegro has two charges, so both go before the Downbeat; the second
 *  segment Stage 4 banks changes nothing here, the Downbeat spends the capped three either way. */
const CI_ROTATION_S3 = new Rotation([
  NOINTRO,
  JUMP, MA12, BA4,
  JUMP, MA12, BA4,
  Skill, Downbeat, Liberation, ECHO_SWAP, OUTRO,

  INTRO, BA34, JUMP,
  Skill, Downbeat, Liberation, Skill, ECHO_SWAP, OUTRO,
]);

/* --------------------------------------------------------------------------------- sequences */

/** S1: +35% ATK for 10s off any Basic Attack — mid-air presses included, as every kit here reads
 *  "casting Basic Attack" — so it stands until her Outro. The interrupt immunity is no stat. */
const WHERE_WIND_SINGS = new Buff({
  name: "Ciaccona S1: Where Wind Sings",
  stats: [[Stat.BonusAtk, 35]],
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(WHERE_WIND_SINGS); },
});
const CI_S1 = new Sequence({
  name: "Ciaccona S1: Where Wind Sings",
  updateBuffs: () => { if (casting(Cast.Basic)) applyCurrent(WHERE_WIND_SINGS, 1); },
});

/** S2: +40% Aero DMG Bonus to the team while the Cadenza plays — paid by the Recital itself (above),
 *  which is that window. */
const CI_S2 = new Sequence({ name: "Ciaccona S2: Song of the Four Seasons" });

/** S3: Stage 4 banks a second segment of Musical Essence, and Harmonic Allegro holds a second
 *  charge — which is the extra Skill the S3 rotation casts. */
const CI_S3 = new Sequence({
  name: "Ciaccona S3: Starlit Improv",
  applyStats: () => { if (runningAction(BA4)) addStat(Stat.AddForte1, 1); },
});

/** S4: 45% of the target's DEF ignored on Quadruple Downbeat and on every Resonance Liberation hit.
 *  The old ignore, hers being a 2.4 kit (stats.ts). */
const CI_S4 = new Sequence({
  name: "Ciaccona S4: Toccata and Fugue",
  applyStats: () => {
    if (runningAction(Downbeat)) addStat(Stat.DefIgnoreOld, 45);
    addStat(Stat.DefIgnoreOld, 45, Type1.Liberation);
  },
});

/** S5: +40% Resonance Liberation DMG Bonus. The damage reduction is out of scope. */
const CI_S5 = new Sequence({
  name: "Ciaccona S5: Eternal Idyll to Lasting Summer",
  stats: [[Stat.DmgBonus, 40, Type1.Liberation]],
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
  substat: substats(Substat.AtkPct, Substat.Liberation, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.FlatAtk, Substat.Liberation, Substat.Er),
  rotation: { 0: CI_ROTATION, 3: CI_ROTATION_S3 },
  sequences: CI_SEQUENCES,
});
