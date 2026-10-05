/**
 * Augusta, ported to the new engine — Sequences 1-6 in their own block below, a limited 5-star
 * (`Tier.Limited`). An electro broadblade DPS. Three forte gauges gate her chained forms:
 * Prowess (forte1, 0-660) lets a full-gauge Heavy Attack - Steelclash become the Thunderoar
 * Backstep -> Spinslash chain instead; Ascendancy (forte2, 0-4000) lets a full-gauge Resonance
 * Skill - Warrior's Blade become the Undying Sunlight Strike -> Leap -> Plunge chain instead;
 * Majesty (forte3, 0-2) — off her Plunge's last hit, her entering combat, or a teammate's Outro
 * cast while under her own Outro buff — unlocks a second Liberation: Sublime is the Sun (Sunborne
 * x9, then Everbright Protector), which spends both. The rotation places both liberations and both
 * chains by hand; each gate is a cast condition (minForte1-3, a follow-up window) that reads red
 * when missed.
 *
 * Numbers from nanoka.cc (character 1306) for every named hit's MV, cross-checked against the
 * migrated (old-engine) sheet's own multi-hit totals. Energy/concerto/offtune/Prowess/Ascendancy
 * deltas aren't exposed on the page itself, so those come off the migrated sheet directly.
 *
 * Sublime is the Sun is one press of 21 hits, as wuwalab has it: nine Sunborne, then Everbright
 * Protector's twelve. The migrated sheet gave Everbright energy -125, but the page is explicit it
 * costs no Resonance Energy at all — trusted here. Everbright's own cross-kit special (ending
 * Phrolova's own Maestro instantly) calls phrolova.ts's `endMaestro()` on its first hit — a no-op on
 * any team that isn't running her.
 *
 * Glory's Favor (Inherent Skill): a shield on every damaging hit, 0.5s ICD — `gainShield()` per
 * action, which spaces them 30 frames apart. Ruler's Realm's own shield (any team member's
 * Intro while it's up) rides the realm buff itself, see RULERS_REALM.
 */
import { Stat, Attribute, WeaponType, Type, Cast, Node, Scaling, BuffTarget } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Sequence } from "../../engine/gear.js";
import {
  asSource,
  applyCurrent,
  applyTeam,
  revokeCurrent,
  casting,
  onAction,
  runningAction,
  currentTeam,
  addStat,
  queue,
  queueOutro,
  removeStack,
  addForte3,
  frozenStacks,
  getStat,
  isHeld,
  stacksOf,
  runningAnyOf,
} from "../../engine/context.js";
import { Action, Rotation, ECHO, INTRO, OUTRO } from "../../engine/rotation.js";
import { gainShield } from "../../shared/status.js";
import { THUNDERFLARE_DOMINION, VERDANT_SUMMIT } from "../../weapons/broadblade.js";
import { NEW_STD_BRAUDBLADE, LUSTROUS_RAZOR } from "../../weapons/standard.js";
import { FALSE_SOVEREIGN, COV_3PC } from "../../echoes/septimont.js";
import { VOID_THUNDER_2PC } from "../../echoes/jinzhou.js";
import { endMaestro } from "../havoc/phrolova.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function augustaAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Electro, scaling: Scaling.Atk, ...def });
}


/** Follow-up windows: each opens on the press it follows ("while in action, press ... to perform")
 *  and is spent by the follow-up itself. */
const SPINSLASH_WINDOW = new Buff({ name: "Augusta: Thunderoar: Spinslash Window" });
const LEAP_WINDOW = new Buff({ name: "Augusta: Undying Sunlight: Leap Window" });
const PLUNGE_WINDOW = new Buff({ name: "Augusta: Undying Sunlight: Plunge Window" });

// --- basics, mid-air, dodge counter (Hunter's Path)
const BA1 = augustaAction("Basic - Hunter's Path 1", { animFrames: 26, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 12, mv: 5746, energy: 73, concerto: 145, offtune: 2312, forte1: 99, forte2: 74 }]});
const BA2 = augustaAction("Basic - Hunter's Path 2", { animFrames: 51, animPriority: { 0: 2 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 14, mv: 6700, energy: 85, concerto: 169, offtune: 2696, forte1: 115, forte2: 86 },
    { hitFrame: 33, mv: 6700, energy: 85, concerto: 169, offtune: 2696, forte1: 115, forte2: 86 },
  ]});
const BA3 = augustaAction("Basic - Hunter's Path 3", { animFrames: 62, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 14, mv: 6561, energy: 83, concerto: 165, offtune: 2640, forte1: 112, forte2: 84 },
    { hitFrame: 25, mv: 6561, energy: 83, concerto: 165, offtune: 2640, forte1: 112, forte2: 84 },
    { hitFrame: 54, mv: 6561, energy: 83, concerto: 165, offtune: 2640, forte1: 112, forte2: 84 },
  ]});
const BA4 = augustaAction("Basic - Hunter's Path 4", { animFrames: 62, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 37, mv: 6463, energy: 82, concerto: 163, offtune: 2601, forte1: 111, forte2: 83 },
    { hitFrame: 42, mv: 6463, energy: 82, concerto: 163, offtune: 2601, forte1: 111, forte2: 83 },
    { hitFrame: 44, mv: 6463, energy: 82, concerto: 163, offtune: 2601, forte1: 111, forte2: 83 },
  ]});
const MA = augustaAction("Mid-air - Hunter's Path Plunge", { animFrames: 66, animPriority: { 0: 6, 66: 2 }, castPriority: 4, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 26, mv: 5965, energy: 75, concerto: 150, offtune: 2400, forte1: 25, forte2: 77 },
    { hitFrame: 45, mv: 5965, energy: 75, concerto: 150, offtune: 2400, forte1: 25, forte2: 77 },
  ]});
const DC = augustaAction("Dodge Counter - Hunter's Path 2", { animFrames: 51, animPriority: { 0: 2 }, castPriority: 2, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 14, mv: 6700, energy: 85, concerto: 169, offtune: 2696, forte1: 115, forte2: 86 },
    { hitFrame: 33, mv: 6700, energy: 85, concerto: 169, offtune: 2696, forte1: 115, forte2: 86 },
  ], castConcerto: 1000});
const MDC = augustaAction("Dodge Counter - Hunter's Path (Mid-Air)", { castPriority: 8, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [{ hitFrame: 0, mv: 11930, energy: 150, concerto: 1200, offtune: 7200, forte1: 50, forte2: 154 }] });

// heavy attack: Steelclash, base cast; at full Prowess it's replaced by Backstep -> Spinslash
const HA = augustaAction("Heavy - Hunter's Path", { animFrames: 45, animPriority: { 0: 4, 45: 2 }, castPriority: 2, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 22, mv: 4639, energy: 59, concerto: 117, offtune: 1867, forte1: 114, forte2: 85 },
    { hitFrame: 31, mv: 4639, energy: 59, concerto: 117, offtune: 1867, forte1: 114, forte2: 85 },
    { hitFrame: 36, commitFrame: 31, mv: 4639, energy: 59, concerto: 117, offtune: 1867, forte1: 114, forte2: 85 },
  ]});
const FHA1 = augustaAction("Heavy - Thunderoar: Backstep", { minForte1: 660, animFrames: 34, animPriority: { 0: 4, 34: 2 }, castPriority: 4, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [{ hitFrame: 16, mv: 5368, energy: 50, concerto: 100, offtune: 1600, forte2: 50 }], resetForte1: true,
  updateBuffs: () => applyCurrent(SPINSLASH_WINDOW, 1),
});
const FHA2 = augustaAction("Heavy - Thunderoar: Spinslash", { requireBuff: SPINSLASH_WINDOW, animFrames: 67, animPriority: { 0: 4, 67: 2 }, castPriority: 4, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 24, mv: 14172, energy: 149, concerto: 297, offtune: 4752, forte2: 248 },
    { hitFrame: 45, mv: 14172, energy: 149, concerto: 297, offtune: 4752, forte2: 248 },
    { hitFrame: 53, commitFrame: 45, mv: 14172, energy: 149, concerto: 297, offtune: 4752, forte2: 248 },
  ], updateBuffs: () => revokeCurrent(SPINSLASH_WINDOW) });
const FJump = augustaAction("Heavy - Thunderoar: Uppercut", { minForte1: 660, animFrames: 46, animPriority: { 45: 2 }, castPriority: 4, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 6, mv: 17893, energy: 188, concerto: 375, offtune: 6000, forte2: 191 },
    { hitFrame: 30, mv: 17893, energy: 188, concerto: 375, offtune: 6000, forte2: 191 },
  ], resetForte1: true});

// resonance skill: Warrior's Blade, base cast; at full Ascendancy it's replaced by the Undying
// Sunlight Strike -> Leap -> Plunge chain instead
const Skill = augustaAction("Skill - Warrior's Blade", { animFrames: 43, animPriority: { 49: 2 }, castPriority: 4, cooldown: 60 * 15, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 24, mv: 21870, energy: 300, offtune: 1497, forte1: 220 },
    { hitFrame: 31, mv: 21870, energy: 300, offtune: 1497, forte1: 220 },
    { hitFrame: 43, mv: 21870, energy: 300, offtune: 1497, forte1: 220 },
  ], castConcerto: 1000, castForte2: 500});
/** Needs full Ascendancy, and spends none of it: the chain's Plunge does. */
const FSkill1 = augustaAction("Forte Skill - Undying Sunlight: Strike", { minForte2: 4000, animFrames: 48, animPriority: { 0: 6 }, castPriority: 6, node: Node.Forte, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 27, mv: 13917, energy: 250, concerto: 350, offtune: 9120 },
    { hitFrame: 39, mv: 13917, energy: 250, concerto: 350, offtune: 9120 },
  ], updateBuffs: () => applyCurrent(LEAP_WINDOW, 1) });
const FSkill2 = augustaAction("Forte Skill - Undying Sunlight: Leap", { requireBuff: LEAP_WINDOW, animFrames: 66, animPriority: { 66: 4 }, castPriority: 6, node: Node.Forte, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 6, mv: 22267, energy: 400, concerto: 560, offtune: 8960 },
    { hitFrame: 17, mv: 2784, energy: 50, concerto: 70, offtune: 1120 },
    { hitFrame: 58, mv: 2784, energy: 50, concerto: 70, offtune: 1120 },
  ],
  updateBuffs: () => {
    revokeCurrent(LEAP_WINDOW);
    applyCurrent(PLUNGE_WINDOW, 1);
  },
});
/** Consumes all Ascendancy, counts as Heavy Attack DMG; its last hit grants a stack of Majesty. */
const FSkill3 = augustaAction("Forte Skill - Undying Sunlight: Plunge", {
  animFrames: 80, castPriority: 6, requireBuff: PLUNGE_WINDOW,
  node: Node.Forte, cast: Cast.Skill, type: Type.Heavy, bullets: [{ hitFrame: 38, mv: 8659, energy: 110, offtune: 2400 }, { hitFrame: 69, mv: 77924, energy: 990, offtune: 21600, forte3: 1 }], castConcerto: 700, resetForte2: true,
  updateBuffs: () => revokeCurrent(PLUNGE_WINDOW),
});

// liberation: Sword of Eternal Oath, the plain press-and-release cast
const Lib1 = augustaAction("Liberation - Sword of Eternal Oath", { animFrames: 106, castPriority: 8, cooldown: 60 * 25, node: Node.Liberation, cast: Cast.Liberation, type: Type.Heavy, bullets: [
    { hitFrame: 4, mv: 3299, energy: 15, offtune: 881 },
    { hitFrame: 10, commitFrame: 4, mv: 3299, energy: 15, offtune: 881 },
    { hitFrame: 22, mv: 13194, energy: 57, offtune: 3521 },
    { hitFrame: 28, commitFrame: 22, mv: 13194, energy: 57, offtune: 3521 },
    { hitFrame: 34, commitFrame: 22, mv: 13194, energy: 57, offtune: 3521 },
    { hitFrame: 62, mv: 3299, energy: 15, offtune: 881 },
    { hitFrame: 68, commitFrame: 62, mv: 3299, energy: 15, offtune: 881 },
    { hitFrame: 85, mv: 57170, energy: 243, offtune: 15255 },
  ], castConcerto: 2000, castForte2: 2000, resetEnergy: true });
/** Held instead of released once Majesty reaches 2 stacks — costs both rather than Energy. Nine
 *  Sunborne hits, then Everbright Protector from 389: the finisher ends Sworn Allegiance and spends
 *  every stack of Crown of Wills. */
const Lib2 = augustaAction("Liberation - Sublime is the Sun", {
  animFrames: 503, castPriority: 10, timestop: [0, 503], motionStop: [0, 503], cooldown: 60 * 25, minForte3: 2, castForte3: -2,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Heavy, bullets: [
    { hitFrame: 100, mv: 11929, concerto: 200, offtune: 7200 },
    { hitFrame: 116, mv: 11929, concerto: 200, offtune: 7200 },
    { hitFrame: 141, mv: 11929, concerto: 200, offtune: 7200 },
    { hitFrame: 161, mv: 11929, concerto: 200, offtune: 7200 },
    { hitFrame: 178, mv: 11929, concerto: 200, offtune: 7200 },
    { hitFrame: 204, mv: 11929, concerto: 200, offtune: 7200 },
    { hitFrame: 225, mv: 11929, concerto: 200, offtune: 7200 },
    { hitFrame: 241, mv: 11929, concerto: 200, offtune: 7200 },
    { hitFrame: 268, mv: 11929, concerto: 200, offtune: 7200 },
    // ends Phrolova's Maestro, Hecate and all — a no-op on a team without her
    { hitFrame: 389, mv: 23858, concerto: 200, offtune: 10080, updateDebuffs: () => endMaestro() },
    { hitFrame: 425, mv: 89465, concerto: 750, offtune: 37800 },
    { hitFrame: 435, mv: 597, concerto: 5, offtune: 252 },
    { hitFrame: 440, commitFrame: 435, mv: 597, concerto: 5, offtune: 252 },
    { hitFrame: 444, commitFrame: 435, mv: 597, concerto: 5, offtune: 252 },
    { hitFrame: 449, commitFrame: 435, mv: 597, concerto: 5, offtune: 252 },
    { hitFrame: 454, commitFrame: 435, mv: 597, concerto: 5, offtune: 252 },
    { hitFrame: 458, commitFrame: 435, mv: 597, concerto: 5, offtune: 252 },
    { hitFrame: 463, commitFrame: 435, mv: 597, concerto: 5, offtune: 252 },
    { hitFrame: 468, commitFrame: 435, mv: 597, concerto: 5, offtune: 252 },
    { hitFrame: 472, commitFrame: 435, mv: 597, concerto: 5, offtune: 252 },
    { hitFrame: 477, commitFrame: 435, mv: 597, concerto: 5, offtune: 252 },
  ],
  updateBuffs: () => applyTeam(RULERS_REALM, 1),
});

/** S6's Thunder Rage: two instances of 100% of her ATK at the spot, Heavy Attack DMG, whenever she
 *  casts Spinslash or Uppercut. Not a row on the kit page, so no energy, concerto or off-tune. */
const ThunderRage = augustaAction("Heavy - Thunder Rage (S6)", { node: Node.Forte, type: Type.Heavy, bullets: [{ hitFrame: 0, mv: 20000 }] });

const Intro = augustaAction("Intro - Stride of Goldenflare", { animFrames: 73, noSwapFrames: 68, animPriority: { 73: 2 }, castPriority: 11, motionStop: [6, 15], node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [{ hitFrame: 46, mv: 9941, energy: 500, offtune: 4800 }, { hitFrame: 63, mv: 9941, energy: 500, offtune: 4800 }], castConcerto: 1000, castForte1: 660, castForte2: 1000});
/** No damage of its own, just the outro handoff (BATTLESONG) — her own Majesty/Crown of Wills
 *  grant is earned later, off the recipient's own Outro. */
const Outro = augustaAction("Outro - Battlesong of the Unyielding", {
  animFrames: 0,
  cast: Cast.Outro, minConcerto: 10000, castConcerto: -10000,
  updateBuffs: () => queueOutro(BATTLESONG),
});

/* ------------------------------------------------------------------------------------ buffs */

/** +15% Electro DMG Bonus a stack — granted alongside Majesty's own second stack, spent entirely
 *  when Everbright Protector ends Sworn Allegiance. One stack until S1 lifts the cap to 2 and S6 to
 *  4; S1 adds Crit. DMG a stack on top and S2 Crit. Rate. */
const CROWN_OF_WILLS = new Buff({
  name: "Augusta: Crown of Wills", maxStacks: 4,
  stats: [[Stat.DmgBonus, 15, Attribute.Electro]], perStack: true,
  applyStats: () => {
    const n = frozenStacks();
    if (isHeld(AG_S1)) asSource(AG_S1, () => addStat(Stat.CritDmg, 15 * n));
    if (isHeld(AG_S2)) asSource(AG_S2, () => addStat(Stat.CritRate, 20 * n));
  },
  afterAction: () => { if (runningAction(Lib2)) revokeCurrent(CROWN_OF_WILLS); },
});
/** A gain against the cap her nodes set, since the buff's own is the highest of the three. */
function gainCrown(n: number): void {
  const room = (isHeld(AG_S6) ? 4 : isHeld(AG_S1) ? 2 : 1) - stacksOf(CROWN_OF_WILLS);
  if (room > 0) applyCurrent(CROWN_OF_WILLS, Math.min(n, room));
}

/** Opens alongside Sublime is the Sun, 30s — permanent uptime once granted. While it's up, any
 *  team member's Intro grants them a shield (650 + 5% of her Max HP, 10s, unstackable) on the
 *  cast itself; the Intro's own on-hit shields then wait out the 30f cooldown. */
const RULERS_REALM = new Buff({
  name: "Augusta: Ruler's Realm",
  duration: 60 * 30,
  updateBuffs: () => { if (casting(Cast.Intro)) gainShield(); },
});

/** Hands the incoming resonator +15% DMG Amplification (all attributes) for 14s. */
const BATTLESONG = new Buff({
  name: "Augusta: Outro",
  duration: 60 * 14,
  lostOnSwap: true,
  stats: [[Stat.Amp, 15]],
});

/** A shield on every damaging hit of her casts, at the shield's 0.5s cooldown. Shields are not a
 *  stat, so the marker is all this piece adds. */
const SHIELDS = new Set<Action>([BA1, BA2, BA3, BA4, MA, DC, MDC, HA, FHA1, FHA2, FJump, Skill, FSkill1, FSkill2, FSkill3, Lib1, Lib2, Intro]);
const AG_INHERENT_1 = new Inherent({
  name: "Inherent: Glory's Favor",
  updateDebuffs: () => {
    if (runningAnyOf(SHIELDS)) gainShield();
  },
});

/** No combat-formula effect this engine models either, same "still equipped, no stat" treatment. */
const AG_INHERENT_2 = new Inherent({
  name: "Inherent: Blazing Valor",
  combatStart: () => {
    addForte3(1);
    gainCrown(4); // "fully restore Crown of Wills" — to whatever cap her nodes allow
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
const AUGUSTA_TALENTS = new Talent({
  name: "Augusta: Talents",
  stats: [[Stat.CritRate, 8], [Stat.BonusAtk, 12]],
});

const AUGUSTA_RESONATOR = new Resonator({
  name: "Augusta",
  stats: [[Stat.BaseHp, 10300], [Stat.BaseAtk, 462.5], [Stat.BaseDef, 1112.2202]],
  talent: AUGUSTA_TALENTS,
  inherent1: AG_INHERENT_1,
  inherent2: AG_INHERENT_2,
  element: Attribute.Electro,
  weapon: WeaponType.Broadblade,
  color: "#e8734f",
  intro: Intro,
  outro: Outro,
  maxEnergy: 12500,
  maxForte1: 660,
  maxForte2: 4000,
  maxForte3: 2,

  // reacts to *any* team member's own Outro, not just her own — currentSlot is forced to her own
  // holder for this call, so the real actor's own held gear comes off currentTeam().slot instead
  updateGlobal: () => {
    if (casting(Cast.Outro) && currentTeam().slot.isHeld(BATTLESONG)) {
      addForte3(1);
      gainCrown(1);
    }
  },

});

/* --------------------------------------------------------------------------------- sequences */

/** S1: Crown of Wills holds 2 and pays +15% Crit. DMG a stack (both in the buff itself), and her
 *  Intro banks one. The Undying Sunlight interrupt immunity is no stat. */
const AG_S1 = new Sequence({
  name: "Augusta S1: Stained in Scorched Earth",
  updateBuffs: () => { if (runningAction(Intro)) gainCrown(1); },
});

/** S2: +20% Crit. Rate a stack of Crown of Wills (in the buff), and every point of Crit. Rate past
 *  100 turned into 2 points of Crit. DMG, up to 100 — read late, once every source has landed,
 *  since it is the build's finished Crit. Rate the node converts. */
const AG_S2 = new Sequence({
  name: "Augusta S2: Cleansed in Crimson War",
  lateConvertStats: () => addStat(Stat.CritDmg, Math.min(100, Math.max(0, (getStat(Stat.CritRate) - 100) * 2))),
});

/** S3: the four Thunderoar hits, Undying Sunlight's Plunge, Sunborne and Everbright Protector at
 *  x1.25 — multiplicative, nanoka's own S3 rows (Backstep 67.1% against 53.68%, Sunborne 149.11%
 *  against 119.29%). */
const AG_S3_HITS = new Set<Action>([FHA1, FHA2, FJump, FSkill3, Lib2]);
const AG_S3 = new Sequence({
  name: "Augusta S3: Forged in Rot and Ruin",
  applyStats: () => { if (runningAnyOf(AG_S3_HITS)) addStat(Stat.MulMv, 25); },
});

/** S4: her Intro hands the team +20% ATK for 30s — every visit casts one, so it never lapses. */
const STRIDE_OF_GOLDENFLARE = new Buff({ name: "Augusta S4: Ascent in Sun and Glory", duration: 60 * 30, stats: [[Stat.BonusAtk, 20]] });
const AG_S4 = new Sequence({
  name: "Augusta S4: Ascent in Sun and Glory",
  grants: [{ on: onAction(Intro), buff: STRIDE_OF_GOLDENFLARE, to: BuffTarget.Team }],
});

/** S5: Glory's Favor shields for half as much again — shields are no stat here. */
const AG_S5 = new Sequence({ name: "Augusta S5: Unshaken in Wrathful Tides" });

/** S6: Crown of Wills holds 4 (`gainCrown()`), Spinslash and Uppercut bank 2 of them and fire
 *  Thunder Rage, and a second conversion band picks up where S2's leaves off — every point of Crit.
 *  Rate past 150 for 2 more Crit. DMG, up to 50. The 1s gate on the Crown gain is no clock here;
 *  neither cast comes round twice in a second. */
const AG_S6 = new Sequence({
  name: "Augusta S6: Engraved in Radiant Light",
  updateBuffs: () => {
    if (!runningAction(FHA2) && !runningAction(FJump)) return;
    gainCrown(2);
    queue(ThunderRage);
  },
  lateConvertStats: () => addStat(Stat.CritDmg, Math.min(50, Math.max(0, (getStat(Stat.CritRate) - 150) * 2))),
});

const AG_SEQUENCES = [AG_S1, AG_S2, AG_S3, AG_S4, AG_S5, AG_S6];

// the migrated rotation: the Steelclash->Thunderoar chain twice, Sword of Eternal Oath, the
// Undying Sunlight chain. She's never the team's own lead, so this covers both opener and loop.

const AG_ROTATION = new Rotation([
  INTRO, FHA1, FHA2, Skill, FHA1, FHA2, HA.cancel(), Lib1, HA.cancel(),
  FSkill1, FSkill2, FSkill3.holdCancel(), Lib2, FJump, ECHO.instaSwap(), OUTRO,
]);

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills, viable weapons, mainslot echo,
// sonata pieces, mainstat/substat
export const AUGUSTA = new Loadout({
  resonator: AUGUSTA_RESONATOR,
  weapons: [THUNDERFLARE_DOMINION, NEW_STD_BRAUDBLADE, LUSTROUS_RAZOR, VERDANT_SUMMIT],
  echoLoadouts: [new EchoLoadout(FALSE_SOVEREIGN, COV_3PC, VOID_THUNDER_2PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Electro3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.Heavy, Substat.AtkPct, Substat.FlatAtk, Substat.Skill),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.Heavy, Substat.AtkPct, Substat.FlatAtk, Substat.Skill, Substat.Basic),
  rotation: AG_ROTATION,
  sequences: AG_SEQUENCES,
});
