/**
 * Phoebe — a limited 5-star Spectro Rectifier with two exclusive stances and one loadout each:
 * PHOEBE_ABSOLUTION (her own damage) and PHOEBE_CONFESSION (the Spectro Frazzle support every
 * Frazzle team runs).
 *
 * Both are the same Forte Circuit spent two ways. The stance cast restores Divine Voice (forte2,
 * 0-60) to full: hold Basic for Heavy Attack Absolution Litany and she is in Absolution, hold
 * Skill for Resonance Skill Utter Confession and she is in Confession. Neither can be cast while
 * Divine Voice remains, and once it runs dry the stance no longer ends — so a loop spends the
 * whole bar on Heavy Attack: Starflash (30 a cast, 15 in Absolution, opened by a Stage 3 or a
 * Dodge Counter) and re-casts the stance at the end of the visit. The stance is whatever that
 * cast put up and nothing a build equips: she enters combat in neither, and each loadout differs
 * only in which of the two casts its rotation names.
 *
 * Prayer is deliberately not modelled. It holds 120 and fills itself at 5 a second with nothing
 * else feeding it, so it is only ever a 24-second cooldown on entering a stance — and the
 * rotations below enter one exactly once a visit, which no 24s cooldown would ever block. A gauge
 * for it would be a bar that fills and empties on schedule and gates nothing.
 *
 * What the two stances change: Absolution multiplies — Starflash gains 256% amplification against
 * a Frazzled target, and the Liberation and Outro run at 3.55x. Confession applies — Starflash
 * lays 5 Spectro Frazzle, the Liberation 8, and her Outro hands the incoming resonator Silent
 * Prayer: 10% Spectro RES off the target, 100% amplification on its Spectro Frazzle DMG, and the
 * status's own tick interval stretched by half (shared/status.ts's FRAZZLE_SLOWED).
 *
 * The Ring of Mirrors is not modelled as a buff, only as rotation order: her Skill summons it and
 * the Chamuel's Star chain below is her Basic Attack while she stands inside it, so a rotation
 * that means to be in the ring casts the Skill first and then names those presses. Refracted Holy
 * Light, which only fires while she is *outside* the ring, is declared and unused for the same
 * reason. Mid-air Heavy Attack is pure traversal and carries no motion value at all.
 *
 * Motion values, energy, concerto and off-tune off nanoka.cc (character 1506, CDN 3.7.3), each
 * action summed from its own Skill Attributes row plus the flat "Concerto Regen" rows beside it.
 * The Outro is the one row nanoka's own damage entries do not reconcile — its text states 528.41%
 * of ATK, and wuwalab's frame data resolves that into the eight 66.06% hits used here. The stance
 * multipliers are read off nanoka's own S-chain twin rows: 401.60% x 3.55 is the Absolution
 * Liberation, x 5.8 that same cast at S1, so each "increase the DMG Multiplier by N%" is a
 * multiplier on the row rather than points added to it. Base stats from the same nanoka file.
 */
import { Stat, EnemyStat, Attribute, WeaponType, Type1, Type2, Cast, Node, Scaling, LifeTime, BuffTarget } from "../../engine/stats.js";
import { Buff, Debuff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout } from "../../engine/gear.js";
import {
  addStat,
  addEnemyStat,
  applyCurrent,
  applyEnemy,
  applyTeam,
  currentTeam,
  isHeld,
  onAction,
  queue,
  revokeCurrent,
  runningAction,
  setForte2,
  stacksOfEnemy,
} from "../../engine/context.js";
import { Action, ActionGroup, Rotation, ECHO_SWAP, INTRO, OUTRO, DODGE, NOINTRO } from "../../engine/rotation.js";
import { FRAZZLE_SLOWED, SPECTRO_FRAZZLE } from "../../shared/status.js";
import { LUMINOUS_HYMN, STRINGMASTER } from "../../weapons/rectifier.js";
import { NEW_STD_RECTIFIER, COSMIC_RIPPLES } from "../../weapons/standard.js";
import { NM_MOURNING_AIX, ETERNAL_RADIANCE_5PC, CAPITANEUS } from "../../echoes/rinascita.js";
import { CELESTIAL_LIGHT_5PC, HERON, MOONLIT_CLOUDS_5PC } from "../../echoes/jinzhou.js";
import { JUE } from "../../echoes/jinzhou.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function phoebeAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Spectro, scaling: Scaling.Atk, ...def });
}

// --- O Come Divine Light: her chain outside the Ring of Mirrors.
const BA1 = phoebeAction("Basic - O Come Divine Light 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 29.53, energy: 1.00, concerto: 1.99, offtune: 3184 });
const BA2 = phoebeAction("Basic - O Come Divine Light 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 49.71, energy: 1.34, concerto: 2.67, offtune: 4267 });
const BA3 = phoebeAction("Basic - O Come Divine Light 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 113.92, energy: 2.96, concerto: 5.84, offtune: 9312 });
const DC = phoebeAction("Dodge Counter - O Come Divine Light", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 172.64, energy: 4.48, concerto: 8.88 + 10, offtune: 14112 });
const MA = phoebeAction("Mid-air - O Come Divine Light", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 92.46, energy: 3.00, concerto: 6.00, offtune: 9600 });
const HA = phoebeAction("Heavy - O Come Divine Light", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 165.40, energy: 2.80, concerto: 5.56, offtune: 8872 });

// --- Chamuel's Star: the same chain while she stands inside the Ring of Mirrors. Basic Attack
//     DMG, and the presses a rotation names after summoning the ring.
const CBA1 = phoebeAction("Basic - Chamuel's Star 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 59.35, energy: 1.00, concerto: 1.99, offtune: 3184 });
const CBA2 = phoebeAction("Basic - Chamuel's Star 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 79.54, energy: 1.34, concerto: 2.68, offtune: 4268 });
const CBA3 = phoebeAction("Basic - Chamuel's Star 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 173.58, energy: 2.94, concerto: 5.82, offtune: 9312 });
const CDC = phoebeAction("Dodge Counter - Chamuel's Star", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 263.04, energy: 4.44, concerto: 8.82 + 10, offtune: 14112 });
const CBA123 = new ActionGroup("Basic - Chamuel's Star 123", [CBA1, CBA2, CBA3]);

// --- To Where Light Shines: the ring itself, the re-press that teleports her to it, and the
//     refraction a Basic or Dodge Counter causes while she is outside it.
const Skill = phoebeAction("Skill - To Where Light Shines", {
  node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 125.26, energy: 1.14, concerto: 2.28, offtune: 6720,
});
const SkillTeleport = phoebeAction("Skill - To Where Light Shines (Teleport)", {
  node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 125.26, energy: 1.14, concerto: 2.28, offtune: 6720,
});
const Refracted = phoebeAction("Skill - Ring of Mirrors: Refracted Holy Light", {
  node: Node.Skill, type: Type1.Basic, mv: 29.84,
});

// --- Radiant Invocation: the two stance casts, and the Starflash that spends what they restore.
const HeavyAbs = phoebeAction("Forte Heavy - Absolution Litany", {
  node: Node.Forte, cast: Cast.Heavy, type: Type1.Heavy, mv: 638.19, energy: 10.00, concerto: 10, offtune: 32872,
  forte2: 60,
  updateDebuffs: () => applyEnemy(SPECTRO_FRAZZLE, 1),
  updateBuffs: () => {
    revokeCurrent(CONFESSION);
    applyCurrent(ABSOLUTION, 1);
  },
});
const SkillConf = phoebeAction("Forte Skill - Utter Confession", {
  node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, mv: 187.88, energy: 18.00, concerto: 40, offtune: 24720,
  forte2: 60,
  updateDebuffs: () => applyEnemy(SPECTRO_FRAZZLE, 1),
  updateBuffs: () => {
    revokeCurrent(ABSOLUTION);
    applyCurrent(CONFESSION, 1);
  },
});

/** Heavy Attack: Starflash — 30 Divine Voice, which Absolution refunds half of (ABSOLUTION
 *  below, through AddForte2 rather than a second action). Confession lays five Spectro Frazzle
 *  with it; Absolution amplifies it instead. */
const FHA = phoebeAction("Forte Heavy - Starflash", {
  node: Node.Forte, cast: Cast.Heavy, type: Type1.Heavy, mv: 248.07, energy: 4.59, concerto: 4.14, offtune: 19401,
  forte2: -30,
  updateDebuffs: () => { if (isHeld(CONFESSION)) applyEnemy(SPECTRO_FRAZZLE, 5); },
});
/** S6's extra Starflash at the ring's location: no Divine Voice, and not a Heavy Attack cast —
 *  so it can never open or close anything that counts her presses. */
const StarflashFree = FHA.variant("Forte Heavy - Starflash (Ring of Mirrors)", {
  cast: null, forte2: 0, triggered: true,
});

const Liberation = phoebeAction("Liberation - Dawn of Enlightenment", {
  node: Node.Liberation, cast: Cast.Liberation, type: Type1.Liberation, cutscene: true,
  mv: 401.60, concerto: 20, offtune: 48000, resetEnergy: true,
  updateDebuffs: () => {
    if (!isHeld(CONFESSION)) return;
    // S1 puts on the most the target can hold instead of the flat eight
    applyEnemy(SPECTRO_FRAZZLE, isHeld(PHOEBE_S1) ? currentTeam().enemyMax(SPECTRO_FRAZZLE) : 8);
  },
  applyStats: () => {
    if (isHeld(ABSOLUTION)) addStat(Stat.MulMv, isHeld(PHOEBE_S1) ? 480 : 255);
    else if (isHeld(CONFESSION) && isHeld(PHOEBE_S1)) addStat(Stat.MulMv, 90);
  },
});

const Intro = phoebeAction("Intro - Golden Grace", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 198.81, energy: 10.00, concerto: 10, offtune: 8000,
});

/** Attentive Heart: 528.41% of ATK, x3.55 in Absolution, and in Confession Silent Prayer onto the
 *  whole team, with the slowed tick interval onto the target. */
const Outro = phoebeAction("Outro - Attentive Heart", {
  cast: Cast.Outro, type: Type1.Outro, mv: 528.48, concerto: -100, swapOut: true,
  applyStats: () => {
    if (isHeld(ABSOLUTION)) addStat(Stat.MulMv, 255);
    if (isHeld(PHOEBE_S2) && isHeld(ABSOLUTION) && stacksOfEnemy(SPECTRO_FRAZZLE) > 0) addStat(Stat.Amp, 120);
  },
  updateBuffs: () => {
    if (!isHeld(CONFESSION)) return;
    applyTeam(SILENT_PRAYER, 1);
    if (isHeld(PHOEBE_S2)) applyTeam(SILENT_PRAYER_S2, 1);
    applyEnemy(FRAZZLE_SLOWED, 1);
  },
});

/* ------------------------------------------------------------------------------------ buffs */

/** The two stances. Neither is equipped — the forte cast that enters one puts it up and ends the
 *  other, which is the kit's own wording ("Absolution and Confession cannot coexist. Entering into
 *  one will end the other"). Once up a stance is permanent: only the opposite cast replaces it,
 *  and a loop exhausts Divine Voice before every stance cast, which is the condition the kit says
 *  keeps a stance standing. So she is in neither until her first stance cast lands, her opening
 *  visit included — the rotations below put that cast at the end of the visit, so it is the second
 *  visit on that runs fully in stance.
 *
 *  Absolution is the only place the two differ in numbers: half of Starflash's Divine Voice back,
 *  and its 256% against a Frazzled target. */
const ABSOLUTION = new Buff({
  name: "Phoebe: Absolution",
  applyStats: () => {
    if (runningAction(FHA)) addStat(Stat.AddForte2, 15);
    const starflash = runningAction(FHA) || runningAction(StarflashFree);
    if (starflash && stacksOfEnemy(SPECTRO_FRAZZLE) > 0) addStat(Stat.Amp, 256);
  },
});
const CONFESSION = new Buff({ name: "Phoebe: Confession" });

/** Presence (Inherent Skill): one more Mid-air Heavy Attack, which is traversal — a no-op held
 *  for the name. */
const PHOEBE_INHERENT_1 = new Inherent({ name: "Inherent: Presence" });

/** Revelation (Inherent Skill): +12% Spectro DMG Bonus in either stance. */
const PHOEBE_INHERENT_2 = new Inherent({
  name: "Inherent: Revelation",
  applyStats: () => {
    if (isHeld(ABSOLUTION) || isHeld(CONFESSION)) addStat(Stat.DmgBonus, 12, Attribute.Spectro);
  },
});

/** Silent Prayer: 30s, so permanent once it lands. Team-wide rather than the "Resonator on the
 *  field" handoff its own text describes, because what it amplifies is Spectro Frazzle DMG — and a
 *  status's rungs fire on whoever *applied* it, which is rarely whoever received the handoff. In a
 *  Zani team that is the whole of it: every Heliacal Ember row lands on Phoebe's or Spectro
 *  Rover's slot while Zani is the one who intro'd behind the Outro, so a single-holder buff would
 *  have amplified none of the damage it exists to amplify. Phoebe is not excluded for the same
 *  reason — she is one of the appliers those rows are filed under. The Spectro RES shred is
 *  target-side anyway and reaches every attacker once any member holds this. */
const SILENT_PRAYER = new Buff({
  name: "Phoebe: Silent Prayer",
  stats: [[Stat.Amp, 100, Type2.SpectroFrazzle]],
  applyStats: () => addEnemyStat(EnemyStat.ResReduce, 10, Attribute.Spectro),
});

/** S2's Confession half: another 120% on Silent Prayer's own amplification, granted the same way
 *  rather than the buff above having to know which sequence level put it up. */
const SILENT_PRAYER_S2 = new Buff({
  name: "Phoebe S2: A Boat Adrift in Tears",
  stats: [[Stat.Amp, 120, Type2.SpectroFrazzle]],
});

/* -------------------------------------------------------------------------------- sequences */

/** S1: the Liberation's own multipliers and the Confession Frazzle cap — paid out on the cast
 *  itself, which is where both halves are read. */
const PHOEBE_S1 = new Sequence({ name: "Phoebe S1: Warm Light and Bedside Wishes" });

/** S2: Absolution amplifies her Outro against a Frazzled target; Confession pays into Silent
 *  Prayer. Both halves live on the casts that grant them (the Outro above). */
const PHOEBE_S2 = new Sequence({ name: "Phoebe S2: A Boat Adrift in Tears" });

/** S3: Starflash's multiplier, x1.91 in Absolution and x3.49 in Confession — nanoka's own twin
 *  rows for that hit (82.69% -> 157.92% and 288.56%). */
const PHOEBE_S3 = new Sequence({
  name: "Phoebe S3: Daisy Wreaths and Dreams",
  applyStats: () => {
    if (!runningAction(FHA) && !runningAction(StarflashFree)) return;
    if (isHeld(ABSOLUTION)) addStat(Stat.MulMv, 91);
    else if (isHeld(CONFESSION)) addStat(Stat.MulMv, 249);
  },
});

/** S4: any of her four Basic-chain presses landing takes 10% Spectro RES off the target for 30s
 *  — permanent once it lands, so a plain debuff nothing revokes. */
const S4_SPECTRO_RES = new Debuff({
  name: "Phoebe S4: Ringing Bells on Wings Aloft",
  applyStats: () => addEnemyStat(EnemyStat.ResReduce, 10, Attribute.Spectro),
});
const PHOEBE_S4 = new Sequence({
  name: "Phoebe S4: Ringing Bells on Wings Aloft",
  grants: [{ on: onAction(BA1, BA2, BA3, DC, CBA1, CBA2, CBA3, CDC), buff: () => S4_SPECTRO_RES, to: BuffTarget.Enemy }],
});

/** S5: +12% Spectro DMG Bonus for 15s off Intro Skill Golden Grace — a short self window, lost
 *  after her outro. */
const S5_SPECTRO = new Buff({
  name: "Phoebe S5: Prayer to the Distant Light",
  stats: [[Stat.DmgBonus, 12, Attribute.Spectro]], until: LifeTime.Outro,
});
const PHOEBE_S5 = new Sequence({
  name: "Phoebe S5: Prayer to the Distant Light",
  grants: [{ on: onAction(Intro), buff: S5_SPECTRO }],
});

/** S6: summoning the ring in either stance grants +10% ATK for 20s and fires a free Starflash at
 *  it. The extra stagnation the node also grants is nothing this engine models. */
const S6_ATK = new Buff({
  name: "Phoebe S6: Whispering Chirps in Silence",
  stats: [[Stat.BonusAtk, 10]], until: LifeTime.Outro,
});
const PHOEBE_S6 = new Sequence({
  name: "Phoebe S6: Whispering Chirps in Silence",
  updateBuffs: () => {
    if (!runningAction(Skill) || !(isHeld(ABSOLUTION) || isHeld(CONFESSION))) return;
    applyCurrent(S6_ATK, 1);
    queue(StarflashFree);
  },
});

const PHOEBE_SEQUENCES = [PHOEBE_S1, PHOEBE_S2, PHOEBE_S3, PHOEBE_S4, PHOEBE_S5, PHOEBE_S6];

const PHOEBE_TALENTS = new Talent({
  name: "Phoebe: Talents",
  stats: [[Stat.BonusAtk, 12], [Stat.CritDmg, 16]],
});

/** Her, as a Resonator. Divine Voice (forte2) is her only gauge here — see the header for why
 *  Prayer is not one. */
const PHOEBE_RESONATOR = new Resonator({
  name: "Phoebe",
  talent: PHOEBE_TALENTS,
  inherent1: PHOEBE_INHERENT_1,
  inherent2: PHOEBE_INHERENT_2,
  element: Attribute.Spectro,
  weapon: WeaponType.Rectifier,
  intro: () => Intro,
  outro: () => Outro,
  color: "#f2e5c0",
  maxEnergy: 125,
  maxForte2: 60,

  stats: [[Stat.BaseHp, 10825], [Stat.BaseAtk, 412.5], [Stat.BaseDef, 1258.8866]],
  // the stance cast sits at the end of her visit, so steady state has her arriving on the Divine
  // Voice it restored — she walks into the fight on that same full bar
  combatStart: () => setForte2(60),
});

/* --------------------------------------------------------------------------------- rotations */

/** Confession, the support visit: the ring, then two Chamuel's Star chains each opening a
 *  Starflash (5 Spectro Frazzle, 30 Divine Voice) — which empties the bar exactly — then Utter
 *  Confession to refill it and re-enter the stance, the Liberation's eight stacks, and the Outro
 *  that hands Silent Prayer on. 101.5 Concerto over the visit, so the Outro fires. */
const PHOEBE_CONFESSION_ROTATION = new Rotation([
  INTRO, SkillConf, Liberation, Skill,
  CBA123, DODGE, FHA,
  CBA123, DODGE, FHA,
  ECHO_SWAP, OUTRO,
]);

/** Absolution: Starflash costs 15 instead of 30, so the same bar pays for four of them, and it is
 *  those four the stance is built around. Absolution Litany banks only 10 Concerto against Utter
 *  Confession's 40, which is exactly why this loop needs the two extra chains to reach 100. */
const PHOEBE_ABSOLUTION_ROTATION = new Rotation([
  INTRO, HeavyAbs, Liberation, Skill,
  CBA123, DODGE, FHA,
  CBA123, DODGE, FHA,
  CBA123, DODGE, FHA,
  CBA123, DODGE, FHA,
  ECHO_SWAP, OUTRO,
]);

/* ---------------------------------------------------------------------------------- loadouts */

const PHOEBE_BUILD = {
  resonator: PHOEBE_RESONATOR,
  weapons: [LUMINOUS_HYMN, COSMIC_RIPPLES, NEW_STD_RECTIFIER, STRINGMASTER],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Spectro3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.AtkPct, Substat.Heavy, Substat.Basic, Substat.FlatAtk),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Heavy, Substat.Basic, Substat.FlatAtk),
  sequences: PHOEBE_SEQUENCES,
};
const PEEB_ECHOES_CONF = [
  new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
  new EchoLoadout(CAPITANEUS, ETERNAL_RADIANCE_5PC),
];
const PEEB_ECHOES_ABS = [
  new EchoLoadout(CAPITANEUS, ETERNAL_RADIANCE_5PC),
];
export const PHOEBE_CONFESSION = new Loadout({ ...PHOEBE_BUILD, rotation: PHOEBE_CONFESSION_ROTATION, echoLoadouts: PEEB_ECHOES_CONF });
export const PHOEBE_ABSOLUTION = new Loadout({ ...PHOEBE_BUILD, rotation: PHOEBE_ABSOLUTION_ROTATION, echoLoadouts: PEEB_ECHOES_ABS });
