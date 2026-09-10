/**
 * Cantarella, ported to the new engine. Sequence-0 core loop. Healing is out of scope, same as
 * the old engine — "Cure" and Trance-consuming heals are left out entirely.
 *
 * Trance (forte1) and Shiver (forte2) are genuine forte gauges — every action that moves either
 * declares its own delta directly. Perception Drain (FSkill) requires a full 3 Shiver, so its own
 * `forte2: -3` (maxForte2 below) is the whole cost: the engine clamps an overrun back to that cap
 * before the spend lands, same as Electro Rover's own Overshock.
 */
import { Stat, Attribute, WeaponType, Type1, Type2, Cast, Node, Scaling, LifeTime } from "../../engine/stats.js";
import { Buff, Debuff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Sequence } from "../../engine/gear.js";
import {
  asSource,
  isType,
  stacksOfEnemy,
  applyEnemy,
  revokeEnemy,
  isHeld,
  applyCurrent,
  applyTeam,
  currentAction,
  runningAction,
  casting,
  queue,
  queueOutro,
  removeStack,
  revokeCurrent,
  addStat,
  frozenStacks,
  forte1,
  currentTeam,
  currentMember,
  concerto,
  setConcerto,
} from "../../engine/context.js";
import { coordinatedBuff, lostOnSwap, matrix } from "../../shared/helpers.js";
import { ActionGroup, Action, Rotation, INTRO, ECHO_CANCEL, OUTRO, ActionField, ECHO_SWAP, ECHO_ONFIELD } from "../../engine/rotation.js";
import { HEALS } from "../../shared/status.js";
import { HECATE_ACTIONS } from "./phrolova.js";
import { LETHEAN_ELEGY, RIME_DRAPED_SPROUTS, STRINGMASTER, WHISPERS_OF_SIRENS } from "../../weapons/rectifier.js";
import { NEW_STD_RECTIFIER, COSMIC_RIPPLES } from "../../weapons/standard.js";
import { HERON, MOONLIT_CLOUDS_5PC, REJUV_5PC, NM_CROWNLESS, HAVOC_ECLIPSE_5PC } from "../../echoes/jinzhou.js";
import { FALLACY } from "../../echoes/jinzhou.js";
import { MIDNIGHT_VEIL_5PC, NM_HECATE, EMPYREAN_ANTHEM_5PC, NM_HERON, HECATE } from "../../echoes/rinascita.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function cantaAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Havoc, scaling: Scaling.Atk, ...def });
}

const BA1 = cantaAction("Basic - Illusion Collapse 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 79.53, energy: 1, concerto: 2, offtune: 3200 });
const BA2 = cantaAction("Basic - Illusion Collapse 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 145.76, energy: 1.84, concerto: 3.68, offtune: 5864 }); // 36.44%x4
const BA3 = cantaAction("Basic - Illusion Collapse 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 145.14, energy: 1.84, concerto: 3.66, offtune: 5840, forte1: 1 }); // 72.57%x2

const EHA = cantaAction("Heavy - Delusive Dive", {
  node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 106.1, energy: 1.68, concerto: 3.34, offtune: 5336, // 53.05%x2
  updateBuffs: () => applyCurrent(MIRAGE, 1),
});

const FBA1 = cantaAction("Forte Basic - Phantom Sting 1", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 105.99, energy: 1.35, concerto: 2.67, offtune: 4266, forte1: -1, forte2: 1 }); // 35.33%x3
const FBA2 = cantaAction("Forte Basic - Phantom Sting 2", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 125.86, energy: 1.6, concerto: 3.18, offtune: 5064, forte1: -1, forte2: 1 }); // 62.93%x2
const FBA3 = cantaAction("Forte Basic - Phantom Sting 3", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 258.48, energy: 3.28, concerto: 6.52, offtune: 10400, forte1: -1, forte2: 1,
  updateBuffs: () => dreamweavers(StingDreamweaver),
}); // 64.62%x4

const Skill = cantaAction("Skill - Graceful Step", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 147.2, energy: 1.56, concerto: 10, offtune: 4936, forte1: 1 }); // 73.60%x2
const ESkill = cantaAction("Skill - Flickering Reverie", {
  node: Node.Skill, cast: Cast.Skill, cast2: Cast.Echo, type: Type1.Skill, mv: 196.23, energy: 1.65, concerto: 10, offtune: 5264,
  updateBuffs: () => applyEnemy(HAZY_DREAM, 1),
});
/** At 3 Shiver, spending all of it. */
const FSkill = cantaAction("Forte Skill - Perception Drain", {
  node: Node.Forte, cast: Cast.Skill, cast2: Cast.Echo, type: Type1.Basic, mv: 1335.98, energy: 21.1, concerto: 12, offtune: 57864, forte2: -3, // 667.99%x2
  updateBuffs: () => applyEnemy(HAZY_DREAM, 1),
});

const Liberation = cantaAction("Liberation - Beneath the Sea", {
  node: Node.Liberation, cast: Cast.Liberation, cutscene: true, cast2: Cast.Echo, type: Type1.Basic, mv: 376, concerto: 20, offtune: 48000, forte1: 3, resetEnergy: true,
  updateBuffs: () => applyTeam(DIFFUSION_WINDOW, isHeld(CA_S5) ? 26 : 21), // S5: five more Dreamweavers
});
/** One Diffusion tick — a real Coordinated Attack, summoned one per qualifying action by
 *  DIFFUSION_WINDOW below, always on her own slot however far the field has moved on. */
const DIFFUSION_FIELD = new ActionField("Cantarella: Diffusion");
const ACTION_DIFFUSION = cantaAction("Liberation - Diffusion", { node: Node.Liberation, type: Type1.Basic, type2: Type2.Coordinated, mv: 14.54, field: DIFFUSION_FIELD }); // no energy/concerto/off-tune of its own

/** The three Coordinated Attacks Tidal Surge and Phantom Sting Stage 3 each set off on hit — one
 *  Dreamweaver apiece, the same 14.54% the Liberation's own Diffusion summons. They are her own
 *  press's follow-up rather than that window's, so they carry neither its field nor its stacks;
 *  one action per trigger, so the report names each run after the cast it came off. */
const DREAMWEAVER = { type: Type1.Basic, type2: Type2.Coordinated, mv: 14.54 };
const IntroDreamweaver = cantaAction("Intro - Dreamweaver", { node: Node.Liberation, ...DREAMWEAVER });
const StingDreamweaver = cantaAction("Basic - Dreamweaver", { node: Node.Liberation, ...DREAMWEAVER });
function dreamweavers(tick: Action): void { for (let i = 0; i < 3; i++) queue(tick); }

const Intro = cantaAction("Intro - Ripple", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 169, energy: 3.16, concerto: 10, offtune: 10120, forte1: 1, // 42.25%x4
  updateBuffs: () => applyCurrent(ABYSSAL_REBIRTH, 6),
});
/** Tidal Surge: the Intro she casts while Mirage still stands. Same motion value as Ripple, and
 *  three Coordinated Attacks on top. Her Mirage runs 8s and is gone by her own outro, so nothing
 *  in the loop below actually reaches this — it is what a quicker swap back in would cast. */
const EIntro = cantaAction("Intro - Tidal Surge", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 169, energy: 3.16, concerto: 10, offtune: 10640, forte1: 1, // 16.90%x3+118.30%
  updateBuffs: () => { applyCurrent(ABYSSAL_REBIRTH, 6); dreamweavers(IntroDreamweaver); },
});
const Outro = cantaAction("Outro - Gentle Tentacles", {
  cast: Cast.Outro, concerto: -100, swapOut: true,
  updateBuffs: () => queueOutro(CANTARELLA_OUTRO),
});

const ESKILL_JOLT = new Action("Jolt", { node: Node.Skill, element: Attribute.Havoc, scaling: Scaling.Atk, type: Type1.Basic, mv: 198.81 });

/* ------------------------------------------------------------------------------------ buffs */

/** Diffusion: Beneath the Sea banks 21 team-wide (26 from S5 — the cap sized for it), one tick
 *  summoned per qualifying action. */
const DIFFUSION_WINDOW = coordinatedBuff("Cantarella: Diffusion", 26, () => CANTARELLA_RESONATOR, ACTION_DIFFUSION);

const POISON = new Buff({
  name: "Inherent: Poison", maxStacks: 2,
  stats: [[Stat.DmgBonus, 6, Attribute.Havoc]], perStack: true,
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(POISON); },
});

/** Abyssal Rebirth: her Intro opens a window in which *any* team member's own Echo Skill cast
 *  hands **her** 6 Concerto Energy, six times over. Self-held but watched from updateGlobal(),
 *  which sees everyone's turn with `currentMember()` pinned to her: on her own cast the 6 goes
 *  through `Stat.AddConcerto` so the action's row credits it, off-field it's written to her bar
 *  directly. The six charges are the stack count, spent as they fire. 25s window on a 25s
 *  cooldown, so it never lapses mid-rotation. */
const ABYSSAL_REBIRTH = new Buff({
  name: "Cantarella: Abyssal Rebirth", maxStacks: 6,
  updateGlobal: () => {
    if (!casting(Cast.Echo) || frozenStacks() <= 0) return;
    removeStack(ABYSSAL_REBIRTH, 1);
    if (currentTeam().slot === currentMember()) addStat(Stat.AddConcerto, 6);
    else setConcerto(concerto() + 6);
  },
});

// opened by Delusive Dive (and the Liberation from S3); auto-closes once Trance depletes or on
// her own outro. S4's Healing Bonus rides on it.
const MIRAGE = new Buff({
  name: "Cantarella: Mirage",
  applyStats: () => { if (isHeld(CA_S4)) asSource(CA_S4, () => addStat(Stat.HealingBonus, 25)); },
  updateBuffs: () => { if (forte1() <= 0 || casting(Cast.Outro)) revokeCurrent(MIRAGE); },
});

/** Hazy Dream, on the target: 6.5s, and the next instance of damage it takes clears it. Hers
 *  triggers Jolt on the way; a teammate's clears it and no Jolt, and a Coordinated Attack or
 *  Utility damage is neither. Checked from updateGlobal (which runs for every member's action, and
 *  ahead of every updateBuffs) so a cast that sends the target into Hazy Dream still Jolts the one
 *  already on it — the Flickering Reverie behind a Flowing Suffocation, S2's own line. S6's 1.2s
 *  window is no clock here: the ticks it guards against are Coordinated Attacks, which never Jolt. */
const HAZY_DREAM = new Debuff({
  name: "Cantarella: Hazy Dream",
  updateGlobal: () => {
    const a = currentAction();
    if (stacksOfEnemy(HAZY_DREAM) <= 0 || !a.mv) return;
    // never the Jolt's own damage, a Coordinated Attack, a Utility's, or a summon firing from a
    // field beside the fight; nor Hecate's, which her own kit exempts by name
    if (runningAction(ESKILL_JOLT) || a.field || isType(Type2.Coordinated) || isType(Type1.Utility)) return;
    if (HECATE_ACTIONS.has(a)) return;
    revokeEnemy(HAZY_DREAM);
    if (currentTeam().slot.resonator === CANTARELLA_RESONATOR) queue(ESKILL_JOLT);
  },
});

const CANTARELLA_OUTRO = new Buff({
  name: "Cantarella: Outro",
  stats: [[Stat.Amp, 20, Attribute.Havoc], [Stat.Amp, 25, Type1.Skill]],
  updateBuffs: () => { lostOnSwap(); },
});

// her kit page doesn't name either passive — Poison's own proc (any Echo Skill) and Mirage's own
// (Delusive Dive) are her two Inherent Skills, each its own trigger piece
const CA_INHERENT_1 = new Inherent({
  name: "Inherent: \"Cure\"",
  constantStats: () => { addStat(Stat.HealingBonus, 20) }
});
const CA_INHERENT_2 = new Inherent({
  name: "Inherent: \"Poison\"",
  updateBuffs: () => { if (casting(Cast.Echo)) applyCurrent(POISON, 1); },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
const CANTARELLA_TALENTS = new Talent({
  name: "Cantarella: Talents",
  stats: [[Stat.CritRate, 8], [Stat.BonusAtk, 12]],
});

const CANTARELLA_RESONATOR = new Resonator({
  name: "Cantarella",
  matrix: matrix("Cantarella", 25),
  talent: CANTARELLA_TALENTS,
  inherent1: CA_INHERENT_1,
  inherent2: CA_INHERENT_2,
  element: Attribute.Havoc,
  weapon: WeaponType.Rectifier,
  intro: () => (isHeld(MIRAGE) ? EIntro : Intro),
  outro: () => Outro,
  color: "#896fd6",
  maxEnergy: 125,
  maxForte1: 15,
  maxForte2: 3,

  updateDebuffs: () => {
    // her own healing marker, read by every healing sonata and weapon (statuses.ts) —
    // applied to the healer alone, never the team
    if (runningAction(FBA1) || runningAction(FBA2) || runningAction(FBA3) || runningAction(FSkill)) applyCurrent(HEALS, 1);
  },

  constantStats: () => {
    addStat(Stat.BaseHp, 11600); addStat(Stat.BaseAtk, 400); addStat(Stat.BaseDef, 1100);
  },
});

/* --------------------------------------------------------------------------------- sequences */

/** S1: every Resonance Skill cast banks a Trance, and Graceful Step, Flickering Reverie and
 *  Perception Drain hit at x1.5 — nanoka's second rows (110.40/294.34/1001.99%), multiplicative.
 *  The interrupt immunity is no stat. */
const CA_S1 = new Sequence({
  name: "Cantarella S1: Embrace the Endless Waves",
  applyStats: () => {
    if (runningAction(Skill) || runningAction(ESkill) || runningAction(FSkill)) { 
      addStat(Stat.AddForte1, 1);
      addStat(Stat.MulMv, 50); 
    } // TODO all skills gain 1 forte?
  },
});

/** S2: Flowing Suffocation lays Hazy Dream too — her next own hit Jolts — and Jolt hits at x3.45
 *  (row 685.90% against 198.81%, multiplicative). */
const CA_S2 = new Sequence({
  name: "Cantarella S2: Surrender to the Illusive Reverie",
  updateBuffs: () => { if (runningAction(Liberation)) applyEnemy(HAZY_DREAM, 1); },
  applyStats: () => { if (runningAction(ESKILL_JOLT)) addStat(Stat.MulMv, 245); },
});

/** S3: Flowing Suffocation at x4.7 (row 1767.20%, multiplicative) and it opens Mirage — Delusive
 *  Dive after it then just re-holds the same window. */
const CA_S3 = new Sequence({
  name: "Cantarella S3: Gaze into the Abyss",
  applyStats: () => { if (runningAction(Liberation)) addStat(Stat.MulMv, 370); },
  updateBuffs: () => { if (runningAction(Liberation)) applyCurrent(MIRAGE, 1); },
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
  stats: [[Stat.DefIgnoreOld, 30]], until: LifeTime.Outro,
});
const CA_S6 = new Sequence({
  name: "Cantarella S6: Fall, Fall... and Fall Deeper into the Dream",
  applyStats: () => { if (runningAction(FBA1) || runningAction(FBA2) || runningAction(FBA3)) addStat(Stat.MulMv, 80); },
  updateBuffs: () => { if (runningAction(Liberation)) applyCurrent(FALL_DEEPER, 1); },
});

const CA_SEQUENCES = [CA_S1, CA_S2, CA_S3, CA_S4, CA_S5, CA_S6];

/* ---------------------------------------------------------------------------------- rotation */

const FBA123 = new ActionGroup("Forte Basic - Phantom Sting 123", [FBA1, FBA2, FBA3]);

// Delusive Dive opens Mirage before the Liberation rather than after it, so Flickering Reverie is
// the first of her own hits behind Beneath the Sea: from S2 that Jolts on the Hazy Dream the
// Liberation lays and leaves its own for Phantom Sting, two Jolts a loop
const CA_ROTATION = new Rotation([
  INTRO, BA3, Skill, ECHO_CANCEL, Liberation, 
  EHA, FBA1, ESkill, FBA1, FBA2, FSkill, OUTRO,
]);

const CA_ROTATION_MDPS = new Rotation([
  INTRO, BA3, Skill, ECHO_ONFIELD, Liberation,
  EHA, ESkill, FBA123, FSkill, ECHO_ONFIELD, 
  FBA123, OUTRO,
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
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Havoc3, Mainstat.ATK1),
  substat: substats(Substat.AtkPct, Substat.Basic, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Basic, Substat.FlatAtk, Substat.Basic),
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
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Havoc3, Mainstat.ATK1),
  substat: substats(Substat.AtkPct, Substat.Basic, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Basic, Substat.FlatAtk, Substat.Basic),
  rotation: CA_ROTATION_MDPS,
  sequences: CA_SEQUENCES,
});
