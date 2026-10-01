/**
 * Rover: Spectro, ported to the new engine — a standard/permanent-banner 5-star
 * (`Tier.Free`), all six sequence nodes folded into the loadout unconditionally,
 * each owning its own trigger. Diminutive Sound (forte1, 0-100) is banked by Normal Attacks,
 * Heavy Attack Aftertune and the Intro, and spent 50 at a time on Resonating Spin — the enhanced
 * Resonance Skill that also opens the Resonating Echoes follow-up.
 *
 * MVs off nanoka.cc (character 1502, https://ww.nanoka.cc/character/1502), summed from each
 * skill's own Skill Attributes row; energy/concerto/offtune/forte off the migrated sheet's own
 * SRover rows (offtune x10000 into this engine's units). Rotation is the sheet's own "srover 3nf".
 */
import { Tier, Stat, EnemyStat, Attribute, WeaponType, Type, Cast, Node, Scaling } from "../../engine/stats.js";
import { Buff, Debuff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout } from "../../engine/gear.js";
import {
  applyCurrent,
  applyEnemy,
  revokeEnemy,
  isHeld,
  casting,
  onAction,
  runningAction,
  addStat,
  addEnemyStat,
  queue,
} from "../../engine/context.js";
import { Action, Rotation, NOINTRO, ECHO, ActionGroup, START_2, START_1, INTRO, Cooldown } from "../../engine/rotation.js";
import { tuneBreak, SWORD_BREAK } from "../../shared/tunebreak.js";
import { SPECTRO_FRAZZLE, SHIMMER, HEALS } from "../../shared/status.js";
import { EMERALD_OF_GENESIS } from "../../weapons/standard.js";
import { BLAZING_BRILLIANCE, RED_SPRING } from "../../weapons/sword.js";
import { REJUV_5PC, HERON, MOONLIT_CLOUDS_5PC } from "../../echoes/jinzhou.js";
import { FALLACY } from "../../echoes/jinzhou.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";
import { ACTION_ADAM_SMASHER_LUCY } from "../../echoes/lahairoi.js";

/* ----------------------------------------------------------------------------------- actions */

function roverAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Spectro, scaling: Scaling.Atk, ...def });
}

// --- basics, heavies, mid-air, dodge counter. Every Normal Attack banks a little Diminutive
//     Sound (forte1); Heavy Attack Aftertune is the big one at 45.
const BA1 = roverAction("Basic - Vibration Manifestation 1", { animFrames: 21, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 10, mv: 59.15, energy: 0.5, concerto: 2, offtune: 2800, forte1: 3 }]});
const BA2 = roverAction("Basic - Vibration Manifestation 2", { animFrames: 25, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 12, mv: 76.05, energy: 1, concerto: 4, offtune: 3600, forte1: 5 }]});
const BA3 = roverAction("Basic - Vibration Manifestation 3", { animFrames: 24, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 14, mv: 15.21, energy: 0.3, concerto: 0.8, offtune: 720, forte1: 1 },
    { hitFrame: 20, commitFrame: 14, mv: 15.21, energy: 0.3, concerto: 0.8, offtune: 720, forte1: 1 },
    { hitFrame: 26, commitFrame: 14, mv: 15.21, energy: 0.3, concerto: 0.8, offtune: 720, forte1: 1 },
    { hitFrame: 32, commitFrame: 14, mv: 15.21, energy: 0.3, concerto: 0.8, offtune: 720, forte1: 1 },
    { hitFrame: 38, commitFrame: 14, mv: 15.21, energy: 0.3, concerto: 0.8, offtune: 720, forte1: 1 },
  ]});
const BA4 = roverAction("Basic - Vibration Manifestation 4", { animFrames: 49, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 20, mv: 130.13, energy: 2, concerto: 6, offtune: 6160, forte1: 7 }]});
const MA = roverAction("Mid-air - Vibration Manifestation Plunge", { animFrames: 54, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 39, mv: 104.78, energy: 0.51, concerto: 1, offtune: 4960 }]});
const DC = roverAction("Dodge Counter - Vibration Manifestation", { animFrames: 27, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [{ hitFrame: 17, mv: 195.34, energy: 2.62, concerto: 13.6, offtune: 3600 }]});

const HA1 = roverAction("Heavy - Vibration Manifestation", { animFrames: 33, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 12, mv: 19.27, energy: 0.28, concerto: 0.91, offtune: 4560, forte1: 1 },
    { hitFrame: 18, commitFrame: 12, mv: 19.27, energy: 0.28, concerto: 0.91, offtune: 4560, forte1: 1 },
    { hitFrame: 24, commitFrame: 12, mv: 19.27, energy: 0.28, concerto: 0.91, offtune: 4560, forte1: 1 },
    { hitFrame: 30, commitFrame: 12, mv: 19.27, energy: 0.28, concerto: 0.91, offtune: 4560, forte1: 1 },
    { hitFrame: 36, commitFrame: 12, mv: 19.27, energy: 0.28, concerto: 0.91, offtune: 4560, forte1: 1 },
  ]});
const HA2 = roverAction("Heavy - Resonance", { animFrames: 27, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [{ hitFrame: 17, mv: 76.05, energy: 1.12, concerto: 3.6, offtune: 3600 }]});
const HA3 = roverAction("Heavy - Aftertune", { animFrames: 41, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [{ hitFrame: 12, commitFrame: 0, mv: 126.75, energy: 1.87, concerto: 6, offtune: 6000, forte1: 45 }]});
const HA123 = new ActionGroup("Heavy - Attack + Resonance + Aftertune", [HA1, HA2, HA3]);

// --- resonance skill, and the forte circuit that replaces it at 50 Diminutive Sound: Resonating
//     Spin (two hits, plus the 39.77% Resonating Whirl tick the page lists without describing —
//     the sheet's own FSkill row is all three together, so Whirl is queued off the Spin) into the
//     Resonating Echoes follow-up, whose two stages the sheet keeps as one row.
/** Resonating Spin is the same Skill button, enhanced: one 6s cooldown between them. */
const SKILL_CD = new Cooldown({ frames: 60 * 6 });
const Skill = roverAction("Skill - Resonating Slashes", { animFrames: 41, cooldown: SKILL_CD, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [{ hitFrame: 16, mv: 236.19, energy: 10, offtune: 4800 }], castConcerto: 10});
const FSkill1 = roverAction("Forte Skill - Resonating Spin", {
  cooldown: SKILL_CD,
  animFrames: 58,
  node: Node.Forte, cast: Cast.Skill, type: Type.Skill, bullets: [
    {
      hitFrame: 19, mv: 129.08, energy: 5, offtune: 10920,
      // Shimmer rides along with the two stacks, and holds every Frazzle stack on the target for its
      // own 9s rather than letting the ticks eat them (shared/status.ts)
      updateDebuffs: () => {
        applyEnemy(SPECTRO_FRAZZLE, 2);
        applyEnemy(SHIMMER, 1);
        queue(ResonatingWhirl);
      },
    },
    { hitFrame: 31, mv: 129.08, energy: 5, offtune: 10920 },
  ], castConcerto: 20, castForte1: -50,
});
const ResonatingWhirl = roverAction("Forte Skill - Resonating Whirl", { node: Node.Forte, type: Type.Skill, mv: 39.77, energy: 2 });
const FBA = roverAction("Basic - Resonating Echoes", { animFrames: 60, node: Node.Forte, cast: Cast.Basic, type: Type.Skill, bullets: [
    { hitFrame: 9, mv: 79.53, energy: 0.5, concerto: 3, offtune: 2400 },
    { hitFrame: 36, mv: 159.05, energy: 2, concerto: 5, offtune: 4800 },
  ]});

// --- liberation / intro / outro. Instant is a stasis field only — no damage, no stat.
// HEALS is her own healing marker, read by every healing sonata and weapon (statuses.ts) —
// applied to the healer alone, never the team
const Liberation = roverAction("Liberation - Echoing Orchestra", {
  animFrames: 129, timestop: 129, motionStop: 79, cooldown: 60 * 20,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, bullets: [
    {
      hitFrame: 78, mv: 198.81, offtune: 13964,
      updateDebuffs: () => {
        applyCurrent(HEALS, 1);
        applyEnemy(SPECTRO_FRAZZLE, 6);
      },
    },
    { hitFrame: 123, mv: 675.96, offtune: 47477 },
  ], castConcerto: 20, resetEnergy: true,
});
const Intro = roverAction("Intro - Waveshock", { animFrames: 72, prioFrames: 72, motionStop: 48, node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [{ hitFrame: 56, mv: 168.99, energy: 10, offtune: 4880 }], castConcerto: 10, castForte1: 50});
const Outro = roverAction("Outro - Instant", { animFrames: 0, cast: Cast.Outro, castConcerto: -100});

/* ------------------------------------------------------------------------------------ buffs */

/** Reticence (Inherent Skill): Resonating Echoes deals 60% more DMG — always on, so it pays
 *  straight out of the piece rather than through a buff. */
const SPR_INHERENT_1 = new Inherent({
  name: "Inherent: Reticence",
  applyStats: () => { if (runningAction(FBA)) addStat(Stat.DmgBonus, 60); }, // TODO unsure if dmg bonus
});

/** Silent Listener (Inherent Skill): +15% ATK for 5s off Heavy Attack Resonance. */
const SILENT_LISTENER = new Buff({
  name: "Inherent: Silent Listener",
  duration: 60 * 5,
  stats: [[Stat.BonusAtk, 15]],
});
const SPR_INHERENT_2 = new Inherent({
  name: "Inherent: Silent Listener",
  grants: [{ on: onAction(HA2), buff: SILENT_LISTENER }],
});

/** S1 Odyssey of Beginnings: +15% Crit Rate for 7s off either Resonance Skill. Trigger in SPR_S1. */
const S1_CRIT = new Buff({
  name: "Spectro Rover S1: Odyssey of Beginnings",
  duration: 60 * 7,
  stats: [[Stat.CritRate, 15]],
});

/** S6 Echoes of Wanderlust: a real target-side Spectro RES shred, not a personal ignore — lost on
 *  his own next Intro rather than tracked as permanent, same shape as Havoc Rover's own S4. */
const S6_RES_SHRED = new Debuff({
  name: "Spectro Rover S6: Echoes of Wanderlust",
  duration: 60 * 20,
  applyStats: () => addEnemyStat(EnemyStat.ResReduce, 10, Attribute.Spectro),
  afterAction: () => { if (casting(Cast.Intro) && isHeld(ROVER_SPECTRO_RESONATOR)) revokeEnemy(S6_RES_SHRED); },
});

/* -------------------------------------------------------------------------------- sequences */
// All six live here as their own always-equipped gear pieces (Tier.Free), each owning its
// own trigger rather than the central Resonator updateBuffs() below.

const SPR_S1 = new Sequence({
  name: "Spectro Rover S1: Odyssey of Beginnings",
  updateBuffs: () => {
    if (runningAction(Skill) || runningAction(FSkill1)) applyCurrent(S1_CRIT, 1);
  },
});

const SPR_S2 = new Sequence({
  name: "Spectro Rover S2: Microcosmic Murmurs",
  stats: [[Stat.DmgBonus, 20, Attribute.Spectro]],
});

const SPR_S3 = new Sequence({
  name: "Spectro Rover S3: Visages of Dust",
  stats: [[Stat.Er, 20]],
});

// S4 Resonating Lamella: a heal over time off Liberation — out of scope, a no-op held for the name
const SPR_S4 = new Sequence({ name: "Spectro Rover S4: Resonating Lamella" });

const SPR_S5 = new Sequence({
  name: "Spectro Rover S5: Temporal Virtuoso",
  stats: [[Stat.DmgBonus, 40, Type.Liberation]],
});

// S6 Echoes of Wanderlust's own trigger — payout lives in S6_RES_SHRED above
const SPR_S6 = new Sequence({
  name: "Spectro Rover S6: Echoes of Wanderlust",
  afterAction: () => {
    if (runningAction(Skill) || runningAction(FSkill1)) applyEnemy(S6_RES_SHRED, 1);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from their kit
const ROVER_SPECTRO_TALENTS = new Talent({
  name: "Spectro Rover: Talents",
  stats: [[Stat.BonusAtk, 12], [Stat.DmgBonus, 12, Attribute.Spectro]],
});

/** Them, as a Resonator: name/element/weapon, every grant/spend/queue rule their kit needs, and
 *  their own base stat line. `Tier.Free` — see the file header. */
const ROVER_SPECTRO_RESONATOR = new Resonator({
  name: "Spectro Rover",
  talent: ROVER_SPECTRO_TALENTS,
  inherent1: SPR_INHERENT_1,
  inherent2: SPR_INHERENT_2,
  element: Attribute.Spectro,
  weapon: WeaponType.Sword,
  color: "#e8d98f",
  intro: Intro,
  tuneBreak: tuneBreak(91, 91, 70, SWORD_BREAK),
  maxEnergy: 125,
  maxForte1: 100,
  tier: Tier.Free,

  stats: [[Stat.BaseHp, 11400], [Stat.BaseAtk, 375], [Stat.BaseDef, 1368.8864]],
});

/** The no-Intro chain runs straight through the INTRO marker into the same body, so leading the
 *  team costs him only the Intro's own 50 Diminutive Sound — the first Heavy chain banks the 50
 *  that Resonating Spin needs either way. */
const SPR_ROTATION = new Rotation([
  NOINTRO, HA123, FSkill1, Liberation, 
  HA123, HA123, FSkill1,
  ECHO.instaSwap(), Outro,

  INTRO, FSkill1, FBA.cancel(), Liberation, 
  HA123, HA123, FSkill1,
  ECHO.instaSwap(), Outro,
]);

/* ----------------------------------------------------------------------------------- loadout */

// their real build: resonator + talents + both Inherent Skills + every sequence node
// (Tier.Free — see file header), weapon, mainslot echo, sonata pieces, mainstat/substat
export const ROVER_SPECTRO = new Loadout({
  resonator: ROVER_SPECTRO_RESONATOR,
  weapons: [BLAZING_BRILLIANCE, EMERALD_OF_GENESIS, RED_SPRING],
  echoLoadouts: [
    new EchoLoadout(FALLACY, REJUV_5PC),
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Spectro3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.AtkPct, Substat.Liberation, Substat.FlatAtk, Substat.Skill),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Liberation, Substat.FlatAtk, Substat.Skill),
    rotation: SPR_ROTATION,
  sequences: [SPR_S1, SPR_S2, SPR_S3, SPR_S4, SPR_S5, SPR_S6],
});
