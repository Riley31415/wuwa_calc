/**
 * Cantarella, ported to the new engine. Sequence-0 core loop. Healing is out of scope, same as
 * the old engine — "Cure" and Trance-consuming heals are left out entirely.
 *
 * Trance (forte1) and Shiver (forte2) are genuine forte gauges — every action that moves either
 * declares its own delta directly. Perception Drain (FSkill) requires a full 3 Shiver, so its own
 * `forte2: -3` (maxForte2 below) is the whole cost: the engine clamps an overrun back to that cap
 * before the spend lands, same as Electro Rover's own Overshock.
 */
import { Stat, Attribute, WeaponType, Type, Subtype, Cast, Node, Scaling, BuffTarget, Position } from "../../engine/stats.js";
import { Buff, Debuff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Sequence, coordinatedBuff, matrix } from "../../engine/gear.js";
import {
  asSource,
  isType,
  stacksOfEnemy,
  applyEnemy,
  revokeEnemy,
  isHeld,
  applyCurrent,
  applyTeam,
  currentCast,
  currentHit,
  onAction,
  runningAction,
  runningAnyOf,
  casting,
  queue,
  queueQTE,
  removeStack,
  revokeCurrent,
  addStat,
  frozenStacks,
  forte1,
  currentTeam,
  currentMember,
  concerto,
  setConcerto,
  onCast,
  addGain,
} from "../../engine/context.js";
import { ActionGroup, Action, Rotation, ECHO, ActionField, ActionTag, INTRO, OUTRO } from "../../engine/rotation.js";
import { HEALS } from "../../shared/status.js";
import { HECATE_ACTIONS } from "./phrolova.js";
import { LETHEAN_ELEGY, RIME_DRAPED_SPROUTS, STRINGMASTER, WHISPERS_OF_SIRENS } from "../../weapons/rectifier.js";
import { NEW_STD_RECTIFIER, COSMIC_RIPPLES } from "../../weapons/standard.js";
import { HERON, MOONLIT_CLOUDS_5PC, REJUV_5PC, NM_CROWNLESS, HAVOC_ECLIPSE_5PC } from "../../echoes/jinzhou.js";
import { FALLACY } from "../../echoes/jinzhou.js";
import { MIDNIGHT_VEIL_5PC, EMPYREAN_ANTHEM_5PC, NM_HERON, HECATE } from "../../echoes/rinascita.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function cantaAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Havoc, scaling: Scaling.Atk, ...def });
}

// opened by Delusive Dive (and the Liberation from S3); lasts 8s or until Trance depletes, read
// once the press that spent the last of it is over. S4's Healing Bonus rides on it.
const MIRAGE: Buff = new Buff({
  name: "Cantarella: Mirage",
  duration: 60 * 8,
  applyStats: () => { if (isHeld(CA_S4)) asSource(CA_S4, () => addStat(Stat.HealingBonus, 25)); },
  afterAction: () => { if (forte1() <= 0) revokeCurrent(MIRAGE); },
});

const BA1 = cantaAction("Basic - Illusion Collapse 1", { animFrames: 27, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 14, mv: 7953, energy: 100, concerto: 200, offtune: 3200 }]});
const BA2 = cantaAction("Basic - Illusion Collapse 2", { chains: [BA1], animFrames: 45, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 16, mv: 3644, energy: 46, concerto: 92, offtune: 1466 },
    { hitFrame: 23, mv: 3644, energy: 46, concerto: 92, offtune: 1466 },
    { hitFrame: 29, mv: 3644, energy: 46, concerto: 92, offtune: 1466 },
    { hitFrame: 35, mv: 3644, energy: 46, concerto: 92, offtune: 1466 },
  ]}); // 36.44%x4
// Ripple: "Press Normal Attack shortly after casting this skill to start the Basic Attack combo from Basic Attack Stage 3"
const BA3 = cantaAction("Basic - Illusion Collapse 3", { chains: () => [BA2, Intro], animFrames: 50, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 4, mv: 7257, energy: 92, concerto: 183, offtune: 2920, forte1: 1 },
    { hitFrame: 19, mv: 7257, energy: 92, concerto: 183, offtune: 2920 },
  ]}); // 72.57%x2

// custom single hit with different frames
const BA3hit1 = cantaAction("Basic - Illusion Collapse 3", { chains: () => [BA2, Intro], animFrames: 50, castPriority: 2, bullets: [{ hitFrame: 4, mv: 14514/2, energy: 184/2, concerto: 366/2, offtune: 5840/2, forte1: 1 }], node: Node.Normal, cast: Cast.Basic, type: Type.Basic}); // 72.57%x2

// "When Cantarella has Trance, Heavy Attack becomes Delusive Dive"
const EHA = cantaAction("Heavy - Delusive Dive", {
  minForte1: 1, animFrames: 43, animPriority: { 43: 1 }, castPriority: 5,
  node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 10, mv: 5305, energy: 84, concerto: 167, offtune: 2668 },
    { hitFrame: 20, mv: 5305, energy: 84, concerto: 167, offtune: 2668 },
  ], // 53.05%x2
  updateBuffs: () => applyCurrent(MIRAGE, 1),
});

const FBA1 = cantaAction("Forte Basic - Phantom Sting 1", { minForte1: 1, requireBuff: MIRAGE, animFrames: 47, animPriority: { 0: 5, 34: 4, 37: 2 }, castPriority: 2, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 10, mv: 3533, energy: 45, concerto: 89, offtune: 1422, forte2: 1, updateDebuffs: () => applyCurrent(HEALS, 1), forte1: -1 },
    { hitFrame: 21, mv: 3533, energy: 45, concerto: 89, offtune: 1422 },
    { hitFrame: 28, mv: 3533, energy: 45, concerto: 89, offtune: 1422 },
  ]}); // 35.33%x3
const FBA2 = cantaAction("Forte Basic - Phantom Sting 2", { chains: [FBA1], minForte1: 1, requireBuff: MIRAGE, animFrames: 41, animPriority: { 0: 5, 24: 4, 30: 2 }, castPriority: 2, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 16, mv: 6293, energy: 80, concerto: 159, offtune: 2532, forte2: 1, updateDebuffs: () => applyCurrent(HEALS, 1), forte1: -1 },
    { hitFrame: 32, mv: 6293, energy: 80, concerto: 159, offtune: 2532 },
  ]}); // 62.93%x2
const FBA3 = cantaAction("Forte Basic - Phantom Sting 3", { chains: [FBA2], minForte1: 1, requireBuff: MIRAGE, animFrames: 82, animPriority: { 0: 5, 48: 2 }, castPriority: 2, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 19, commitFrame: 0, mv: 6462, energy: 82, concerto: 163, offtune: 2600, forte2: 1, subtype: Subtype.Coordinated, updateDebuffs: () => applyCurrent(HEALS, 1), forte1: -1 },
    { hitFrame: 25, commitFrame: 8, mv: 6462, energy: 82, concerto: 163, offtune: 2600, subtype: Subtype.Coordinated },
    { hitFrame: 27, commitFrame: 15, mv: 6462, energy: 82, concerto: 163, offtune: 2600, subtype: Subtype.Coordinated },
    { hitFrame: 45, mv: 6462, energy: 82, concerto: 163, offtune: 2600, subtype: null },
  ],
  updateBuffs: () => dreamweavers(StingDreamweaver),
}); // 64.62%x4

const Skill = cantaAction("Skill - Graceful Step", { animFrames: 38, animPriority: { 37: 1 }, castPriority: 3, cooldown: 60 * 6, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [{ hitFrame: 14, mv: 7360, energy: 78, offtune: 2468 }, { hitFrame: 22, mv: 7360, energy: 78, offtune: 2468 }], castConcerto: 1000, castForte1: 1}); // 73.60%x2
const ESkill = cantaAction("Skill - Flickering Reverie", {
  requireBuff: MIRAGE, animFrames: 28, animPriority: { 28: 2 }, castPriority: 4, cooldown: 60 * 12,
  node: Node.Skill, cast: Cast.Skill, subcast: Cast.Echo, type: Type.Skill, bullets: [{ hitFrame: 12, mv: 19623, energy: 165, offtune: 5264 }], castConcerto: 1000,
  // laid behind its own hit, which Jolts any Hazy Dream already standing
  afterAction: () => applyEnemy(HAZY_DREAM, 1),
});
/** At 3 Shiver, spending all of it. */
const FSkill = cantaAction("Forte Skill - Perception Drain", { minForte2: 3, requireBuff: MIRAGE,
  animFrames: 80, animPriority: { 0: 5 }, castPriority: 8, cooldown: 60 * 18,
  node: Node.Forte, cast: Cast.Skill, subcast: Cast.Echo, type: Type.Basic, bullets: [
    { hitFrame: 41, mv: 66799, energy: 1055, offtune: 28932 },
    { hitFrame: 53, mv: 66799, energy: 1055, offtune: 28932 },
  ], castConcerto: 1200, castForte2: -3, // 667.99%x2
  // its team heal lands on the cast itself (wuwalab 0f)
  updateBuffs: () => applyCurrent(HEALS, 1),
  afterAction: () => applyEnemy(HAZY_DREAM, 1),
});

const Liberation = cantaAction("Liberation - Beneath the Sea", {
  animFrames: 214, castPriority: 10, timestop: [0, 214], motionStop: [0, 170], cooldown: 60 * 25, // Flowing Suffocation Cooldown
  node: Node.Liberation, cast: Cast.Liberation, subcast: Cast.Echo, type: Type.Basic, bullets: [{ hitFrame: 170, mv: 37600, offtune: 48000 }], castConcerto: 2000, castForte1: 3, resetEnergy: true,
  updateBuffs: () => applyTeam(DIFFUSION_WINDOW, isHeld(CA_S5) ? 26 : 21), // S5: five more Dreamweavers
});
/** One Diffusion tick — a real Coordinated Attack, summoned one per qualifying action by
 *  DIFFUSION_WINDOW below, always on her own slot however far the field has moved on. */
const DIFFUSION_FIELD = new ActionField("Cantarella: Diffusion");
const ACTION_DIFFUSION = cantaAction("Liberation - Diffusion", { node: Node.Liberation, type: Type.Basic, subtype: Subtype.Coordinated, bullets: [{ hitFrame: 0, mv: 1454 }], field: DIFFUSION_FIELD }); // no energy/concerto/off-tune of its own

/** The three Coordinated Attacks Tidal Surge and Phantom Sting Stage 3 each set off on hit — one
 *  Dreamweaver apiece, the same 14.54% the Liberation's own Diffusion summons. They are her own
 *  press's follow-up rather than that window's, so they carry neither its field nor its stacks;
 *  one action per trigger, so the report names each run after the cast it came off. */
const DREAMWEAVER = { tag: ActionTag.OffField, type: Type.Basic, subtype: Subtype.Coordinated };
const IntroDreamweaver = cantaAction("Intro - Dreamweaver", { animFrames: 5, node: Node.Liberation, ...DREAMWEAVER, bullets: [{ hitFrame: 5, commitFrame: 0, mv: 1454 }] });
const StingDreamweaver = cantaAction("Basic - Dreamweaver", { animFrames: 5, node: Node.Liberation, ...DREAMWEAVER, bullets: [{ hitFrame: 5, commitFrame: 0, mv: 1454 }] });
function dreamweavers(tick: Action): void { for (let i = 0; i < 3; i++) queue(tick); }

const Intro = cantaAction("Intro - Ripple", {
  endPosition: Position.Grounded, qteFrames: 33, animFrames: 76, noSwapFrames: 80, animPriority: { 76: 2 }, castPriority: 11, motionStop: [4, 30],
  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [
    { hitFrame: 36, mv: 4225, energy: 250, offtune: 2528 },
    { hitFrame: 42, mv: 4225, energy: 250, offtune: 2528 },
    { hitFrame: 48, mv: 4225, energy: 250, offtune: 2528 },
    { hitFrame: 54, mv: 4225, energy: 250, offtune: 2528 },
  ], castConcerto: 1000, castForte1: 1, // 42.25%x4
  updateBuffs: () => applyCurrent(ABYSSAL_REBIRTH, 6),
});
/** Tidal Surge: the Intro she casts while Mirage still stands. Same motion value as Ripple, and
 *  three Coordinated Attacks on top. Her Mirage runs 8s and is gone by her own outro, so nothing
 *  in the loop below actually reaches this — it is what a quicker swap back in would cast. */
const EIntro = cantaAction("Intro - Tidal Surge", { endPosition: Position.Grounded, qteFrames: 36,
  requireBuff: MIRAGE, animFrames: 83, noSwapFrames: 80, animPriority: { 83: 2 }, castPriority: 11, motionStop: [4, 49],
  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [
    { hitFrame: 26, mv: 1690, energy: 100, offtune: 1064, subtype: Subtype.Coordinated },
    { hitFrame: 32, mv: 1690, energy: 100, offtune: 1064, subtype: Subtype.Coordinated },
    { hitFrame: 35, mv: 1690, energy: 100, offtune: 1064, subtype: Subtype.Coordinated },
    { hitFrame: 48, mv: 11830, energy: 700, offtune: 7448, subtype: null },
  ], castConcerto: 1000, castForte1: 1, // 16.90%x3+118.30%
  updateBuffs: () => { applyCurrent(ABYSSAL_REBIRTH, 6); dreamweavers(IntroDreamweaver); },
});
const Outro = cantaAction("Outro - Gentle Tentacles", {
  animFrames: 0,
  cast: Cast.Outro, minConcerto: 10000, castConcerto: -10000,
  updateBuffs: () => queueQTE(CANTARELLA_OUTRO),
});

const ESKILL_JOLT = new Action("Jolt", { animFrames: 0, node: Node.Skill, element: Attribute.Havoc, scaling: Scaling.Atk, type: Type.Basic, bullets: [{ hitFrame: 0, mv: 19881 }]});

/* ------------------------------------------------------------------------------------ buffs */

/** Diffusion: Beneath the Sea banks 21 team-wide (26 from S5 — the cap sized for it), one tick
 *  summoned per qualifying action. */
const DIFFUSION_WINDOW = coordinatedBuff("Cantarella: Diffusion", 26, () => CANTARELLA_RESONATOR, ACTION_DIFFUSION);

const POISON = new Buff({
  name: "Inherent: Poison", maxStacks: 2, duration: 60 * 10,
  stats: [[Stat.DmgBonus, 6, Attribute.Havoc]], perStack: true,
});

/** Abyssal Rebirth: her Intro opens a window in which *any* team member's own Echo Skill cast
 *  hands **her** 6 Concerto Energy, six times over. Self-held but watched from updateGlobal(),
 *  which sees everyone's turn with `currentMember()` pinned to her: on her own cast the 6 goes
 *  through `addGain()` so the action's row credits it, off-field it's written to her bar
 *  directly. The six charges are the stack count, spent as they fire. 25s window on a 25s
 *  cooldown, so it never lapses mid-rotation. */
const ABYSSAL_REBIRTH = new Buff({
  name: "Cantarella: Abyssal Rebirth", maxStacks: 6, duration: 60 * 25,
  updateGlobal: () => {
    if (!casting(Cast.Echo) || frozenStacks() <= 0) return;
    removeStack(ABYSSAL_REBIRTH, 1);
    if (currentTeam().slot === currentMember()) addGain({ concerto: 600 });
    else setConcerto(concerto() + 6);
  },
});

/** Hazy Dream, on the target: 6.5s, and the next instance of damage it takes clears it. Hers
 *  triggers Jolt on the way; a teammate's clears it and no Jolt, and a Coordinated Attack or
 *  Utility damage is neither. Checked from hitGlobal (every member's hit), and laid after its
 *  applier's own hit, so that hit still Jolts the one already on it — the Flickering Reverie
 *  behind a Flowing Suffocation, S2's own line. S6's 1.2s
 *  window is no clock here: the ticks it guards against are Coordinated Attacks, which never Jolt. */
const HAZY_DREAM = new Debuff({
  name: "Cantarella: Hazy Dream",
  duration: 60 * 6.5,
  hitGlobal: () => {
    if (stacksOfEnemy(HAZY_DREAM) <= 0) return;
    // never the Jolt's own damage, a Coordinated Attack, a Utility's, or a summon firing from a
    // field beside the fight; nor Hecate's, which her own kit exempts by name
    if (runningAction(ESKILL_JOLT) || currentCast().field || isType(Subtype.Coordinated) || isType(Type.Utility) || !currentHit().mv) return;
    if (runningAnyOf(HECATE_ACTIONS)) return;
    revokeEnemy(HAZY_DREAM);
    if (currentTeam().slot.resonator === CANTARELLA_RESONATOR) queue(ESKILL_JOLT);
  },
});

const CANTARELLA_OUTRO = new Buff({
  name: "Cantarella: Outro",
  duration: 60 * 14,
  stats: [[Stat.Amp, 20, Attribute.Havoc], [Stat.Amp, 25, Type.Skill]],
  lostOnSwap: true,
});

// her kit page doesn't name either passive — Poison's own proc (any Echo Skill) and Mirage's own
// (Delusive Dive) are her two Inherent Skills, each its own trigger piece
const CA_INHERENT_1 = new Inherent({
  name: "Inherent: \"Cure\"",
  stats: [[Stat.HealingBonus, 20]],
});
const CA_INHERENT_2 = new Inherent({
  name: "Inherent: \"Poison\"",
  grants: [{ on: onCast(Cast.Echo), buff: POISON }],
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
const CANTARELLA_TALENTS = new Talent({
  name: "Cantarella: Talents",
  stats: [[Stat.CritRate, 8], [Stat.BonusAtk, 12]],
});

const CANTARELLA_RESONATOR = new Resonator({
  name: "Cantarella",
  stats: [[Stat.BaseHp, 11600], [Stat.BaseAtk, 400], [Stat.BaseDef, 1099.998]],
  matrix: matrix("Cantarella", 25),
  talent: CANTARELLA_TALENTS,
  inherent1: CA_INHERENT_1,
  inherent2: CA_INHERENT_2,
  element: Attribute.Havoc,
  weapon: WeaponType.Rectifier,
  color: "#896fd6",
  // resolved when its row is reached: whichever Intro the kit's state calls for there
  intro: () => (isHeld(MIRAGE) ? EIntro : Intro),
  outro: Outro,
  // Mirage makes Basic Attack Phantom Sting; no Plunging Attack is modelled for a swapInAir
  swapIn: () => (isHeld(MIRAGE) ? FBA1 : BA1),
  maxEnergy: 12500,
  maxForte1: 5,
  maxForte2: 3,

});

/* --------------------------------------------------------------------------------- sequences */

/** S1: every Resonance Skill cast banks a Trance, and Graceful Step, Flickering Reverie and
 *  Perception Drain hit at x1.5 — nanoka's second rows (110.40/294.34/1001.99%), multiplicative.
 *  The interrupt immunity is no stat. */
const CA_S1 = new Sequence({
  name: "Cantarella S1: Embrace the Endless Waves",
  updateBuffs: () => {
    if (runningAction(Skill) || runningAction(ESkill) || runningAction(FSkill)) addGain({ forte1: 1 }); // TODO all skills gain 1 forte?
  },
  applyStats: () => {
    if (runningAction(Skill) || runningAction(ESkill) || runningAction(FSkill)) addStat(Stat.MulMv, 50);
  },
});

/** S2: Flowing Suffocation lays Hazy Dream too — her next own hit Jolts — and Jolt hits at x3.45
 *  (row 685.90% against 198.81%, multiplicative). */
const CA_S2 = new Sequence({
  name: "Cantarella S2: Surrender to the Illusive Reverie",
  grants: [{ on: onAction(Liberation), buff: HAZY_DREAM, to: BuffTarget.Enemy, onHit: true }],
  applyStats: () => { if (runningAction(ESKILL_JOLT)) addStat(Stat.MulMv, 245); },
});

/** S3: Flowing Suffocation at x4.7 (row 1767.20%, multiplicative) and it opens Mirage — Delusive
 *  Dive after it then just re-holds the same window. */
const CA_S3 = new Sequence({
  name: "Cantarella S3: Gaze into the Abyss",
  applyStats: () => { if (runningAction(Liberation)) addStat(Stat.MulMv, 370); },
  grants: [{ on: onAction(Liberation), buff: MIRAGE }],
});

/** S4: +25% Healing Bonus in Mirage — paid by Mirage itself; healing is out of scope here. */
const CA_S4 = new Sequence({ name: "Cantarella S4: Behold Your Own Soul" });

/** S5: Diffusion summons up to 26 Dreamweavers — read off this node by the Liberation's grant. */
const CA_S5 = new Sequence({ name: "Cantarella S5: Rest in Your Reflection" });

/** S6: Phantom Sting +80% of its multiplier (no sequence row on nanoka, taken multiplicative), and
 *  Flowing Suffocation has her ignore 30% DEF for 10s — until her Outro. A 2.2 kit, the old ignore.
 *  The 1.2s Jolt guard is already how Hazy Dream is read here. */
const FALL_DEEPER = new Buff({
  name: "Cantarella S6: Fall, Fall... and Fall Deeper into the Dream",
  duration: 60 * 10,
  stats: [[Stat.DefIgnoreOld, 30]],
});
const CA_S6 = new Sequence({
  name: "Cantarella S6: Fall, Fall... and Fall Deeper into the Dream",
  applyStats: () => { if (runningAction(FBA1) || runningAction(FBA2) || runningAction(FBA3)) addStat(Stat.MulMv, 80); },
  grants: [{ on: onAction(Liberation), buff: FALL_DEEPER }],
});

const CA_SEQUENCES = [CA_S1, CA_S2, CA_S3, CA_S4, CA_S5, CA_S6];

/* ---------------------------------------------------------------------------------- rotation */

const FBA123 = new ActionGroup("Forte Basic - Phantom Sting 123", [FBA1, FBA2, FBA3]);
const BA123 = new ActionGroup("Basic - Illusion Collapse 123", [BA1, BA2, BA3]);

// Delusive Dive opens Mirage before the Liberation rather than after it, so Flickering Reverie is
// the first of her own hits behind Beneath the Sea: from S2 that Jolts on the Hazy Dream the
// Liberation lays and leaves its own for Phantom Sting, two Jolts a loop

const CA_ROTATION = new Rotation([
  INTRO, BA3hit1.instaCancel(), Skill.instaCancel(), ECHO.instaDodge(), Liberation, 
  EHA, FBA1.cancel(), ESkill, FBA1, FBA2.mashCancel(), FSkill, FBA1, FBA2.instaSwap(), OUTRO,
]);

const CA_ROTATION_MDPS = new Rotation([
  INTRO, BA3hit1.instaCancel(), Skill.instaCancel(), ECHO, Liberation,
  EHA, FBA123.cancel(), FSkill, ECHO, ESkill, // TODO check if fskill cancelled by echo
  FBA1, FBA2, BA123.cancel(), Skill.instaSwap(), OUTRO,
]);


/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills, viable weapons, and three real
// echo choices sharing Impermanence Heron as mainslot — Midnight Veil, Rejuvenating Glow, Moonlit
// Clouds — all automatically iterated (see gear.ts's own EchoLoadout)
export const CANTARELLA = new Loadout({
  resonator: CANTARELLA_RESONATOR,
  weapons: [WHISPERS_OF_SIRENS, COSMIC_RIPPLES, NEW_STD_RECTIFIER, STRINGMASTER, LETHEAN_ELEGY, RIME_DRAPED_SPROUTS],
  echoLoadouts: [
    new EchoLoadout(NM_HERON, MIDNIGHT_VEIL_5PC),
    new EchoLoadout(FALLACY, REJUV_5PC),
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
    new EchoLoadout(HECATE, EMPYREAN_ANTHEM_5PC),
        new EchoLoadout(NM_CROWNLESS, HAVOC_ECLIPSE_5PC),
  ],
  // an ER 3-cost is on the table as a support: her Liberation is what the team is waiting on, and
  // the rolls it frees off the spread often outweigh the elemental bonus it gives up
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ER3, Mainstat.ATK3, Mainstat.Havoc3, Mainstat.ATK1),
  substat: substats(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Basic, Substat.FlatAtk, Substat.Skill),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Basic, Substat.FlatAtk, Substat.Skill, Substat.Heavy),
  rotation: CA_ROTATION,
  sequences: CA_SEQUENCES,
});


// her real 43311 build: resonator + talents + both Inherent Skills, viable weapons, and three real
// echo choices sharing Impermanence Heron as mainslot — Midnight Veil, Rejuvenating Glow, Moonlit
// Clouds — all automatically iterated (see gear.ts's own EchoLoadout)
export const CANTARELLA_MDPS = new Loadout({
  resonator: CANTARELLA_RESONATOR,
  weapons: [WHISPERS_OF_SIRENS, COSMIC_RIPPLES, NEW_STD_RECTIFIER, STRINGMASTER, LETHEAN_ELEGY, RIME_DRAPED_SPROUTS],
  echoLoadouts: [
    new EchoLoadout(NM_CROWNLESS, HAVOC_ECLIPSE_5PC),
  ],
  // same ER 3-cost her support build carries: her own bar wants more than a spread holds
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ER3, Mainstat.ATK3, Mainstat.Havoc3, Mainstat.ATK1),
  substat: substats(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Basic, Substat.FlatAtk, Substat.Skill),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Basic, Substat.FlatAtk, Substat.Skill, Substat.Heavy),
  rotation: CA_ROTATION_MDPS,
  sequences: CA_SEQUENCES,
});
