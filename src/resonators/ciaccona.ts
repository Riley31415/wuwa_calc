/**
 * Ciaccona, ported to the new engine — a limited 5-star, so sequence 0, no chain nodes.
 * Musical Essence (forte1, 0-3 segments) is banked one at a time by Basic Attack Stage 4 and the
 * Intro, and spent all three at once on Heavy Attack - Quadruple Downbeat. Nearly everything she
 * casts inflicts a stack of Aero Erosion, which is what her set and her weapon both key off.
 *
 * Numbers from nanoka.cc (character 1407, https://ww.nanoka.cc/character/1407) — no migrated-sheet
 * row exists for her, so MVs are the Skill Attributes tables and energy/concerto/offtune come off
 * Damage Data's own Energy/Elemental DMG/Weakness Break columns (the last x10000), except where a
 * skill states its own Concerto Regen outright, which wins.
 */
import {
  Buff, Debuff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Action, ECHO_CAST, INTRO, Stat, Attribute, WeaponType, Type1, Cast, Node, Scaling,
  applySelf, applyTeam, applyEnemy, revokeTeam, isHeld, revoke, casting, currentAction, addStat, queue,
  Type2,
} from "../kit.js";
import { WOODLAND_ARIA } from "../weapons/pistol.js";
import { NM_KELPIE } from "../echoes/rinascita.js";
import { GUSTS_OF_WELKIN_5PC, GUSTS_OF_WELKIN_2PC } from "../echoes/rinascita.js";
import { mainstatOptions } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";
import { NEW_STD_PISTOL, STATIC_MIST } from "../weapons/standard.js";
import { HERON, MOONLIT_CLOUDS_2PC, MOONLIT_CLOUDS_5PC } from "../echoes/jinzhou.js";

/* ----------------------------------------------------------------------------------- actions */

function ciacconaAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Aero, scaling: Scaling.Atk, ...def });
}

// --- basics, heavy/aimed, mid-air, dodge counter. Stage 4 is the one that matters: it banks a
//     segment of Musical Essence (forte1), inflicts Aero Erosion, and opens the Solo Concert.
export const BA1 = ciacconaAction("Basic - Quadruple Time Steps 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 57.06, energy: 0.88, concerto: 2.8, offtune: 2800 });
export const BA2 = ciacconaAction("Basic - Quadruple Time Steps 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 163.04, energy: 2.51, concerto: 8, offtune: 8000 });
export const BA3 = ciacconaAction("Basic - Quadruple Time Steps 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 132.08, energy: 2.04, concerto: 6.48, offtune: 6480 });
export const BA4 = ciacconaAction("Basic - Quadruple Time Steps 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 244.56, energy: 3.76, concerto: 12, offtune: 12000, forte1: 1, erosion: 1 });

export const HA = ciacconaAction("Heavy - Attack", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 107.60, energy: 1.65, concerto: 5.28, offtune: 5280 });
export const AimedShot = ciacconaAction("Heavy - Aimed Shot", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 32.61, energy: 0.5, concerto: 1.6, offtune: 1600 });
export const ChargedShot = ciacconaAction("Heavy - Fully Charged Aimed Shot", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 73.37, energy: 1.13, concerto: 3.6, offtune: 3600 });
export const MA1 = ciacconaAction("Basic - Mid-air Attack 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 110.86, energy: 1.7, concerto: 5.44, offtune: 5440 });
export const MA2 = ciacconaAction("Basic - Mid-air Attack 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 97.84, energy: 1.52, concerto: 4.8, offtune: 4800 });
export const DC = ciacconaAction("Basic - Dodge Counter", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 228.68, energy: 2.04, concerto: 16.48, offtune: 6480 });

export const Skill = ciacconaAction("Skill - Harmonic Allegro", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 161.56, energy: 9.6, concerto: 15, offtune: 5000, erosion: 1 });

/** Forte Circuit: replaces the Heavy Attack at 3 segments and spends all of them. */
export const Downbeat = ciacconaAction("Forte Heavy - Quadruple Downbeat", { node: Node.Forte, cast: Cast.Heavy, type: Type1.Heavy, mv: 628.13, energy: 14.97, concerto: 25, offtune: 9360, forte1: -3, erosion: 1 });

// --- liberation / intro / outro. The Liberation opens Recital; switching out during Recital
//     generates a Symphonic Poem Tonic on its own, green by default (see her update() below).
export const Liberation = ciacconaAction("Liberation - Singer's Triple Cadenza", { node: Node.Liberation, cast: Cast.Liberation, type: Type1.Liberation, mv: 1100.42, concerto: 20, offtune: 48000, shields: 1, resetEnergy: true });
export const GreenTonic = ciacconaAction("Liberation - Symphonic Poem: Tonic (green)", { node: Node.Liberation, type: Type1.Liberation, mv: 122.40, concerto: 10, offtune: 43640, erosion: 20, active: false });
export const Intro = ciacconaAction("Intro - Roaming with the Wind", { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 189.11, energy: 10, concerto: 10, offtune: 9280, forte1: 1, erosion: 1 });
export const Outro = ciacconaAction("Outro - Windcalling Tune", { cast: Cast.Outro, active: false });

/* ------------------------------------------------------------------------------------ buffs */

/** Solo Concert: opened by Basic Attack Stage 4 (Ciaccona's own, or an Ensemble Sylph finishing it
 *  for her), +24% Aero DMG Bonus to the whole team, not stackable. No stated duration, so it's
 *  lost on her own next Intro like every other team buff here. */
export const SOLO_CONCERT = new Buff({
  name: "Ciaccona: Solo Concert",
  apply: () => addStat(Stat.DmgBonus, 24, Attribute.Aero),
});

/** Recital: opened by the Liberation, held until she's switched back in. Carries no stat of its
 *  own — it's what makes the Outro generate a Tonic. */
export const RECITAL = new Buff({
  name: "Ciaccona: Recital",
  update: () => { if (casting(Cast.Intro)) revoke(RECITAL); }, // TODO swap in cancels it
});

/** Interlude Tune (Inherent Skill): a shield off the Liberation, declared as `shields: 1` on that
 *  action — shields are not a stat, so this piece is held for the name. */
export const CI_INHERENT_1 = new Inherent({ name: "Ciaccona: Interlude Tune" });

/** Winds of Rinascita (Inherent Skill): Quadruple Downbeat deals 30% more DMG — always on, so it
 *  pays straight out of the piece rather than through a buff. */
export const CI_INHERENT_2 = new Inherent({
  name: "Ciaccona: Winds of Rinascita",
  apply: () => { if (currentAction() === Downbeat) addStat(Stat.DmgBonus, 30); },
});

/** Windcalling Tune (Outro): Aero Erosion DMG on targets near the active resonator is amplified
 *  100% for 30s, so permanent uptime. Nothing reads Aero Erosion's own damage yet (same as Electro
 *  Flare and Spectro Frazzle), so this is the marker it is, carrying no stat for now. */
export const WINDCALLING_TUNE = new Debuff({ 
  name: "Ciaccona: Outro",
  apply: () => { addStat(Stat.Amp, 100, Type2.AeroErosion)}
});

/** Her, as a Resonator: name/element/weapon, every grant/spend/queue rule her kit needs, and her
 *  own base stat line. */
export const CIACCONA = new Resonator({
  name: "Ciaccona",
  abbreviation: "Cia",
  element: Attribute.Aero,
  weapon: WeaponType.Pistols,
  intro: () => Intro,
  color: "#5ac46b",
  maxEnergy: 125,

  update: () => {
    const a = currentAction();
    if (a === BA4) applyTeam(SOLO_CONCERT, 1);
    if (a === Liberation) applySelf(RECITAL, 1);
    if (a === Outro) {
      applyEnemy(WINDCALLING_TUNE, 1);
      if (isHeld(RECITAL)) queue(GreenTonic); // switching out during Recital generates one itself
    }
  },

  apply: () => {
    addStat(Stat.BaseHp, 12238); addStat(Stat.BaseAtk, 375); addStat(Stat.BaseDef, 1198);
    addStat(Stat.Er, 100); addStat(Stat.CritRate, 5); addStat(Stat.CritDmg, 150);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
export const CIACCONA_TALENTS = new Talent({
  name: "Ciaccona: Talents",
  apply: () => { addStat(Stat.BonusAtk, 12); addStat(Stat.CritDmg, 16); },
});

// Intro plus two Basic Stage 4s are the three Musical Essence Quadruple Downbeat spends; the Skill
// chains straight back into Basic Stage 2, which is how the second stage-4 comes around without
// restarting the string. She's never the team's own lead, so this covers opener and loop both.
export const CI_ROTATION = [ // TODO add opener
  INTRO, 
  BA3, BA4,
  Skill, BA2, BA3, BA4,
  Downbeat, ECHO_CAST,
  Liberation, Outro,
];

/* ----------------------------------------------------------------------------------- loadout */

// her real build: resonator + talents + both Inherent Skills, her own weapon, her own mainslot
// echo and the one sonata that pays for the Aero Erosion she stacks, mainstat/substat
export const CIA_LOADOUT = new Loadout(
  CIACCONA,
  false,
  CIACCONA_TALENTS,
  CI_INHERENT_1,
  CI_INHERENT_2,
  [WOODLAND_ARIA, STATIC_MIST, NEW_STD_PISTOL],
  [new EchoLoadout(NM_KELPIE, GUSTS_OF_WELKIN_5PC, GUSTS_OF_WELKIN_2PC),
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC)
  ],
  mainstatOptions(["CR", "CD"], ["atk", "aero"], ["atk"]),
  chem("atk", "liberation"),
  CI_ROTATION, CI_ROTATION,
);
