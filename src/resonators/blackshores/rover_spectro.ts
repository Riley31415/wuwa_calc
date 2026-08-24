/**
 * Rover: Spectro, ported to the new engine — a standard/permanent-banner 5-star
 * (`standardCharacter: true`), all six sequence nodes folded into the loadout unconditionally,
 * each owning its own trigger. Diminutive Sound (forte1, 0-100) is banked by Normal Attacks,
 * Heavy Attack Aftertune and the Intro, and spent 50 at a time on Resonating Spin — the enhanced
 * Resonance Skill that also opens the Resonating Echoes follow-up.
 *
 * MVs off nanoka.cc (character 1502, https://ww.nanoka.cc/character/1502), summed from each
 * skill's own Skill Attributes row; energy/concerto/offtune/forte off the migrated sheet's own
 * SRover rows (offtune x10000 into this engine's units). Rotation is the sheet's own "srover 3nf".
 */
import {
  Buff, Debuff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout, Action, ECHO_CAST, INTRO, Stat, EnemyStat, Attribute, WeaponType, Type1, Cast, Node, Scaling,
  applySelf, applyEnemy, revokeEnemy, isHeld, revoke, casting, currentAction, addStat, addEnemyStat, queue,
} from "../../kit.js";
import { EMERALD_OF_GENESIS } from "../../weapons/standard.js";
import { BLAZING_BRILLIANCE, RED_SPRING } from "../../weapons/sword.js";
import { REJUV_5PC, REJUV_2PC, HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC } from "../../echoes/jinzhou.js";
import { FALLACY } from "../../echoes/jinzhou.js";
import { mainstatOptions } from "../../mainstats.js";
import { chem } from "../../substats.js";

/* ----------------------------------------------------------------------------------- actions */

function roverAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Spectro, scaling: Scaling.Atk, ...def });
}

// --- basics, heavies, mid-air, dodge counter. Every Normal Attack banks a little Diminutive
//     Sound (forte1); Heavy Attack Aftertune is the big one at 45.
export const BA1 = roverAction("Basic - Vibration Manifestation 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 59.15, energy: 0.5, concerto: 2, offtune: 2800, forte1: 3 });
export const BA2 = roverAction("Basic - Vibration Manifestation 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 76.05, energy: 1, concerto: 4, offtune: 3600, forte1: 5 });
export const BA3 = roverAction("Basic - Vibration Manifestation 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 76.05, energy: 1.5, concerto: 4, offtune: 3600, forte1: 5 });
export const BA4 = roverAction("Basic - Vibration Manifestation 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 130.13, energy: 2, concerto: 6, offtune: 6160, forte1: 7 });
export const MA = roverAction("Basic - Mid-air Attack", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 104.78, energy: 0.51, concerto: 1, offtune: 4960 });
export const DC = roverAction("Basic - Dodge Counter", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 195.34, energy: 2.62, concerto: 13.6, offtune: 3600 });

export const HA = roverAction("Heavy - Attack", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 96.35, energy: 1.4, concerto: 4.55, offtune: 22800, forte1: 5 });
export const HAResonance = roverAction("Heavy - Resonance", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 76.05, energy: 1.12, concerto: 3.6, offtune: 3600 });
export const HAAftertune = roverAction("Heavy - Aftertune", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 126.75, energy: 1.87, concerto: 6, offtune: 6000, forte1: 45 });

// --- resonance skill, and the forte circuit that replaces it at 50 Diminutive Sound: Resonating
//     Spin (two hits, plus the 39.77% Resonating Whirl tick the page lists without describing —
//     the sheet's own FSkill row is all three together, so Whirl is queued off the Spin) into the
//     Resonating Echoes follow-up, whose two stages the sheet keeps as one row.
export const Skill = roverAction("Skill - Resonating Slashes", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 236.19, energy: 10, concerto: 10, offtune: 4800 });
export const ResonatingSpin = roverAction("Forte Skill - Resonating Spin", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, mv: 258.16, energy: 10, concerto: 20, offtune: 21840, forte1: -50, frazzle: 2 });
export const ResonatingWhirl = roverAction("Forte Skill - Resonating Whirl", { node: Node.Forte, type: Type1.Skill, mv: 39.77, energy: 2 });
export const ResonatingEchoes = roverAction("Forte Basic - Resonating Echoes", { node: Node.Forte, cast: Cast.Basic, type: Type1.Skill, mv: 238.58, energy: 2.5, concerto: 8, offtune: 7200 });

// --- liberation / intro / outro. Instant is a stasis field only — no damage, no stat.
export const Liberation = roverAction("Liberation - Echoing Orchestra", { node: Node.Liberation, cast: Cast.Liberation, type: Type1.Liberation, mv: 874.77, concerto: 20, offtune: 61441, frazzle: 6, resetEnergy: true, heals: true });
export const Intro = roverAction("Intro - Waveshock", { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 168.99, energy: 10, concerto: 10, offtune: 4880, forte1: 50 });
export const Outro = roverAction("Outro - Instant", { cast: Cast.Outro, active: false });

/* ------------------------------------------------------------------------------------ buffs */

/** Reticence (Inherent Skill): Resonating Echoes deals 60% more DMG — always on, so it pays
 *  straight out of the piece rather than through a buff. */
export const SPR_INHERENT_1 = new Inherent({
  name: "Spectro Rover: Reticence",
  apply: () => { if (currentAction() === ResonatingEchoes) addStat(Stat.DmgBonus, 60); }, // TODO unsure if dmg bonus
});

/** Silent Listener (Inherent Skill): +15% ATK for 5s off Heavy Attack Resonance. */
export const SILENT_LISTENER = new Buff({
  name: "Spectro Rover: Silent Listener",
  apply: () => addStat(Stat.BonusAtk, 15),
  convert: () => { if (casting(Cast.Outro)) revoke(SILENT_LISTENER); },
});
export const SPR_INHERENT_2 = new Inherent({
  name: "Spectro Rover: Silent Listener",
  update: () => { if (currentAction() === HAResonance) applySelf(SILENT_LISTENER, 1); },
});

/** S1 Odyssey of Beginnings: +15% Crit Rate for 7s off either Resonance Skill. Trigger in SPR_S1. */
export const S1_CRIT = new Buff({
  name: "Spectro Rover S1: Odyssey of Beginnings",
  apply: () => addStat(Stat.CritRate, 15),
  convert: () => { if (casting(Cast.Outro)) revoke(S1_CRIT); },
});

/** S6 Echoes of Wanderlust: a real target-side Spectro RES shred, not a personal ignore — lost on
 *  his own next Intro rather than tracked as permanent, same shape as Havoc Rover's own S4. */
export const S6_RES_SHRED = new Debuff({
  name: "Spectro Rover S6: Echoes of Wanderlust",
  apply: () => addEnemyStat(EnemyStat.ResShred, 10, Attribute.Spectro),
  convert: () => { if (casting(Cast.Intro) && isHeld(ROVER_SPECTRO)) revokeEnemy(S6_RES_SHRED); },
});

/* -------------------------------------------------------------------------------- sequences */
// All six live here as their own always-equipped gear pieces (standardCharacter), each owning its
// own trigger rather than the central Resonator update() below.

export const SPR_S1 = new Sequence({
  name: "Spectro Rover S1: Odyssey of Beginnings",
  update: () => {
    const a = currentAction();
    if (a === Skill || a === ResonatingSpin) applySelf(S1_CRIT, 1);
  },
});

export const SPR_S2 = new Sequence({
  name: "Spectro Rover S2: Microcosmic Murmurs",
  apply: () => addStat(Stat.DmgBonus, 20, Attribute.Spectro),
});

export const SPR_S3 = new Sequence({
  name: "Spectro Rover S3: Visages of Dust",
  apply: () => addStat(Stat.Er, 20),
});

// S4 Resonating Lamella: a heal over time off Liberation — out of scope, a no-op held for the name
export const SPR_S4 = new Sequence({ name: "Spectro Rover S4: Resonating Lamella" });

export const SPR_S5 = new Sequence({
  name: "Spectro Rover S5: Temporal Virtuoso",
  apply: () => addStat(Stat.DmgBonus, 40, Type1.Liberation),
});

// S6 Echoes of Wanderlust's own trigger — payout lives in S6_RES_SHRED above
export const SPR_S6 = new Sequence({
  name: "Spectro Rover S6: Echoes of Wanderlust",
  update: () => {
    const a = currentAction();
    if (a === Skill || a === ResonatingSpin) applyEnemy(S6_RES_SHRED, 1);
  },
});

/** Them, as a Resonator: name/element/weapon, every grant/spend/queue rule their kit needs, and
 *  their own base stat line. `standardCharacter: true` — see the file header. */
export const ROVER_SPECTRO = new Resonator({
  name: "Spectro Rover",
  abbreviation: "SRover",
  element: Attribute.Spectro,
  weapon: WeaponType.Sword,
  intro: () => Intro,
  color: "#e8d98f",
  maxEnergy: 125,
  standardCharacter: true,

  apply: () => {
    addStat(Stat.BaseHp, 11400); addStat(Stat.BaseAtk, 375); addStat(Stat.BaseDef, 1369);
    addStat(Stat.Er, 100); addStat(Stat.CritRate, 5); addStat(Stat.CritDmg, 150);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from their kit
export const ROVER_SPECTRO_TALENTS = new Talent({
  name: "Spectro Rover: Talents",
  apply: () => { addStat(Stat.BonusAtk, 12); addStat(Stat.DmgBonus, 12, Attribute.Spectro); },
});

// the migrated sheet's own "srover 3nf": the Intro's own 50 Diminutive Sound pays for the first
// Resonating Spin outright, then Basic 2-3 and the Heavy Resonance/Aftertune pair bank the 50 the
// second one spends. They're never the team's own lead, so this covers opener and loop both.
export const SPR_ROTATION = [
  INTRO,
  ResonatingSpin, ResonatingEchoes, BA2, BA3, HAResonance, HAAftertune,
  Liberation,
  ResonatingSpin, ResonatingEchoes, BA2, BA3, HAResonance, HAAftertune,
  ECHO_CAST, Outro,
];

/* ----------------------------------------------------------------------------------- loadout */

// their real build: resonator + talents + both Inherent Skills + every sequence node
// (standardCharacter — see file header), weapon, mainslot echo, sonata pieces, mainstat/substat
export const SROVER_LOADOUT = new Loadout(
  ROVER_SPECTRO,
  false,
  ROVER_SPECTRO_TALENTS,
  SPR_INHERENT_1,
  SPR_INHERENT_2,
  [EMERALD_OF_GENESIS, BLAZING_BRILLIANCE, RED_SPRING],
  [
    new EchoLoadout(FALLACY, REJUV_5PC, REJUV_2PC),
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC),
  ],
  mainstatOptions(["CR", "CD"], ["atk", "spectro"], ["atk"]),
  chem("atk", "liberation"),
  SPR_ROTATION, SPR_ROTATION,
  SPR_S1,
  SPR_S2,
  SPR_S3,
  SPR_S4,
  SPR_S5,
  SPR_S6,
);
