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
  Buff, Debuff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout, Action, Stat, EnemyStat, Attribute,
  WeaponType, Type1, Cast, Node, Scaling, applyCurrent, applyEnemy, revokeEnemy, isHeld, revokeSelf, casting,
  currentAction, addStat, addEnemyStat, queue,
} from "../../engine/kit.js";
import { Rotation, OPENER, INTRO, ECHO_CAST, OUTRO_NEXT } from "../../engine/rotation.js";
import { SPECTRO_FRAZZLE, HEALS } from "../../engine/status.js";
import { EMERALD_OF_GENESIS } from "../../weapons/standard.js";
import { BLAZING_BRILLIANCE, RED_SPRING } from "../../weapons/sword.js";
import { REJUV_5PC, REJUV_2PC, HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC } from "../../echoes/jinzhou.js";
import { FALLACY } from "../../echoes/jinzhou.js";
import { mainstatOptions, Mainstat } from "../../engine/mainstats.js";
import { chem } from "../../engine/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function roverAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Spectro, scaling: Scaling.Atk, ...def });
}

// --- basics, heavies, mid-air, dodge counter. Every Normal Attack banks a little Diminutive
//     Sound (forte1); Heavy Attack Aftertune is the big one at 45.
const BA1 = roverAction("Basic - Vibration Manifestation 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 59.15, energy: 0.5, concerto: 2, offtune: 2800, forte1: 3 });
const BA2 = roverAction("Basic - Vibration Manifestation 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 76.05, energy: 1, concerto: 4, offtune: 3600, forte1: 5 });
const BA3 = roverAction("Basic - Vibration Manifestation 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 76.05, energy: 1.5, concerto: 4, offtune: 3600, forte1: 5 });
const BA4 = roverAction("Basic - Vibration Manifestation 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 130.13, energy: 2, concerto: 6, offtune: 6160, forte1: 7 });
const MA = roverAction("Basic - Mid-air Attack", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 104.78, energy: 0.51, concerto: 1, offtune: 4960 });
const DC = roverAction("Basic - Dodge Counter", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 195.34, energy: 2.62, concerto: 13.6, offtune: 3600 });

const HA1 = roverAction("Heavy - Attack", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 96.35, energy: 1.4, concerto: 4.55, offtune: 22800, forte1: 5 });
const HA2 = roverAction("Heavy - Resonance", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 76.05, energy: 1.12, concerto: 3.6, offtune: 3600 });
const HA3 = roverAction("Heavy - Aftertune", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 126.75, energy: 1.87, concerto: 6, offtune: 6000, forte1: 45 });

// --- resonance skill, and the forte circuit that replaces it at 50 Diminutive Sound: Resonating
//     Spin (two hits, plus the 39.77% Resonating Whirl tick the page lists without describing —
//     the sheet's own FSkill row is all three together, so Whirl is queued off the Spin) into the
//     Resonating Echoes follow-up, whose two stages the sheet keeps as one row.
const Skill = roverAction("Skill - Resonating Slashes", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 236.19, energy: 10, concerto: 10, offtune: 4800 });
const FSkill1 = roverAction("Forte Skill - Resonating Spin", {
  node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, mv: 258.16, energy: 10, concerto: 20, offtune: 21840, forte1: -50,
  updateDebuffs: () => {applyEnemy(SPECTRO_FRAZZLE, 2); queue(ResonatingWhirl); }
});
const ResonatingWhirl = roverAction("Forte Skill - Resonating Whirl", { node: Node.Forte, type: Type1.Skill, mv: 39.77, energy: 2 });
const FBA = roverAction("Forte Basic - Resonating Echoes", { node: Node.Forte, cast: Cast.Basic, type: Type1.Skill, mv: 238.58, energy: 2.5, concerto: 8, offtune: 7200 });

// --- liberation / intro / outro. Instant is a stasis field only — no damage, no stat.
// HEALS is her own healing marker, read by every healing sonata and weapon (statuses.ts) —
// applied to the healer alone, never the team
const Liberation = roverAction("Liberation - Echoing Orchestra", {
  node: Node.Liberation, cast: Cast.Liberation, type: Type1.Liberation, mv: 874.77, concerto: 20, offtune: 61441, resetEnergy: true,
  updateDebuffs: () => { applyCurrent(HEALS, 1); applyEnemy(SPECTRO_FRAZZLE, 6); },
});
const Intro = roverAction("Intro - Waveshock", { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 168.99, energy: 10, concerto: 10, offtune: 4880, forte1: 50 });
const Outro = roverAction("Outro - Instant", { cast: Cast.Outro, active: false });

/* ------------------------------------------------------------------------------------ buffs */

/** Reticence (Inherent Skill): Resonating Echoes deals 60% more DMG — always on, so it pays
 *  straight out of the piece rather than through a buff. */
const SPR_INHERENT_1 = new Inherent({
  name: "Spectro Rover: Reticence",
  applyStats: () => { if (currentAction() === FBA) addStat(Stat.DmgBonus, 60); }, // TODO unsure if dmg bonus
});

/** Silent Listener (Inherent Skill): +15% ATK for 5s off Heavy Attack Resonance. */
const SILENT_LISTENER = new Buff({
  name: "Spectro Rover: Silent Listener",
  applyStats: () => addStat(Stat.BonusAtk, 15),
  convertStats: () => { if (casting(Cast.Outro)) revokeSelf(SILENT_LISTENER); },
});
const SPR_INHERENT_2 = new Inherent({
  name: "Spectro Rover: Silent Listener",
  updateBuffs: () => { if (currentAction() === HA2) applyCurrent(SILENT_LISTENER, 1); },
});

/** S1 Odyssey of Beginnings: +15% Crit Rate for 7s off either Resonance Skill. Trigger in SPR_S1. */
const S1_CRIT = new Buff({
  name: "Spectro Rover S1: Odyssey of Beginnings",
  applyStats: () => addStat(Stat.CritRate, 15),
  convertStats: () => { if (casting(Cast.Outro)) revokeSelf(S1_CRIT); },
});

/** S6 Echoes of Wanderlust: a real target-side Spectro RES shred, not a personal ignore — lost on
 *  his own next Intro rather than tracked as permanent, same shape as Havoc Rover's own S4. */
const S6_RES_SHRED = new Debuff({
  name: "Spectro Rover S6: Echoes of Wanderlust",
  applyStats: () => addEnemyStat(EnemyStat.ResShred, 10, Attribute.Spectro),
  convertStats: () => { if (casting(Cast.Intro) && isHeld(ROVER_SPECTRO)) revokeEnemy(S6_RES_SHRED); },
});

/* -------------------------------------------------------------------------------- sequences */
// All six live here as their own always-equipped gear pieces (standardCharacter), each owning its
// own trigger rather than the central Resonator updateBuffs() below.

const SPR_S1 = new Sequence({
  name: "Spectro Rover S1: Odyssey of Beginnings",
  updateBuffs: () => {
    const a = currentAction();
    if (a === Skill || a === FSkill1) applyCurrent(S1_CRIT, 1);
  },
});

const SPR_S2 = new Sequence({
  name: "Spectro Rover S2: Microcosmic Murmurs",
  applyStats: () => addStat(Stat.DmgBonus, 20, Attribute.Spectro),
});

const SPR_S3 = new Sequence({
  name: "Spectro Rover S3: Visages of Dust",
  applyStats: () => addStat(Stat.Er, 20),
});

// S4 Resonating Lamella: a heal over time off Liberation — out of scope, a no-op held for the name
const SPR_S4 = new Sequence({ name: "Spectro Rover S4: Resonating Lamella" });

const SPR_S5 = new Sequence({
  name: "Spectro Rover S5: Temporal Virtuoso",
  applyStats: () => addStat(Stat.DmgBonus, 40, Type1.Liberation),
});

// S6 Echoes of Wanderlust's own trigger — payout lives in S6_RES_SHRED above
const SPR_S6 = new Sequence({
  name: "Spectro Rover S6: Echoes of Wanderlust",
  updateBuffs: () => {
    const a = currentAction();
    if (a === Skill || a === FSkill1) applyEnemy(S6_RES_SHRED, 1);
  },
});

/** Them, as a Resonator: name/element/weapon, every grant/spend/queue rule their kit needs, and
 *  their own base stat line. `standardCharacter: true` — see the file header. */
const ROVER_SPECTRO = new Resonator({
  name: "Spectro Rover",
  element: Attribute.Spectro,
  weapon: WeaponType.Sword,
  intro: () => Intro,
  outro: () => Outro,
  color: "#e8d98f",
  maxEnergy: 125,
  standardCharacter: true,

  constantStats: () => {
    addStat(Stat.BaseHp, 11400); addStat(Stat.BaseAtk, 375); addStat(Stat.BaseDef, 1369);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from their kit
const ROVER_SPECTRO_TALENTS = new Talent({
  name: "Spectro Rover: Talents",
  constantStats: () => { addStat(Stat.BonusAtk, 12); addStat(Stat.DmgBonus, 12, Attribute.Spectro); },
});

const SPR_ROTATION = new Rotation([
  INTRO, 
  HA1, HA2, HA3, FSkill1, FBA,
  HA1, HA2, HA3, FSkill1, Liberation, ECHO_CAST,
  OUTRO_NEXT,
]);

/* ----------------------------------------------------------------------------------- loadout */

// their real build: resonator + talents + both Inherent Skills + every sequence node
// (standardCharacter — see file header), weapon, mainslot echo, sonata pieces, mainstat/substat
export const SROVER_LOADOUT = new Loadout({
  resonator: ROVER_SPECTRO,
  talent: ROVER_SPECTRO_TALENTS,
  inherent1: SPR_INHERENT_1,
  inherent2: SPR_INHERENT_2,
  weapons: [BLAZING_BRILLIANCE, EMERALD_OF_GENESIS, RED_SPRING],
  echoLoadouts: [
    new EchoLoadout(FALLACY, REJUV_5PC, REJUV_2PC),
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC),
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Spectro3, Mainstat.ATK1),
  substat: chem("atk", "liberation"),
    rotation: SPR_ROTATION,
  sequences: [SPR_S1, SPR_S2, SPR_S3, SPR_S4, SPR_S5, SPR_S6],
});
