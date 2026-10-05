/** Mainslot echoes and sonatas from Septimont (versions 2.5-2.7). */
import { Stat, Attribute, Type, Cast, Scaling, BuffTarget } from "../engine/stats.js";
import { Buff, Sonata, Sonata3pc, Sonata2pc, Mainslot } from "../engine/gear.js";
import {
  cancelHits,
  addStat, stacksOf, stacksOfEnemy, stacksOfTeam, applyCurrent, casting, maxEnergy, queue, applied, appliedByMe,
  onCast, onType, onApplied,
} from "../engine/context.js";
import { Action, Cooldown } from "../engine/rotation.js";
import { SHIELD, HAVOC_BANE } from "../shared/status.js";
import { PseudoTransformEcho, SummonEcho, TransformEcho } from "./echo.js";

/* --------------------------------------------------------------------------------- Phrolova, 2.5 */

/** Dream of the Lost 3pc, Phrolova's own sonata — also reused by Lucilla. "Holding 0 Resonance
 *  Energy" is checked for real off the wearer's own `maxEnergy()`. */
export const DREAM_OF_THE_LOST_3PC = new Sonata3pc({
  name: "Dream of the Lost 3pc",
  applyStats: () => {
    if (maxEnergy() !== 0) return;
    addStat(Stat.CritRate, 20);
    addStat(Stat.DmgBonus, 35, Type.Echo);
  },
});

/* ----------------------------------------------------------------------------- Augusta, 2.6 */

/** False Sovereign, Augusta's own mainslot echo — flat Electro/Heavy Attack DMG Bonus. Casting
 *  Intro also summons it for a bonus hit. The Echo Skill holds 2 charges, one back every 8s; the
 *  Intro summon is assumed to draw on none, available whenever an Intro lands. */
export const ACTION_FALSE_SOVEREIGN = new TransformEcho("Echo - False Sovereign", {
  bullets: [{ hitFrame: 46, mv: 22140, energy: 304 }],
  cooldown: new Cooldown({ frames: 60 * 8, charges: 2 }),
  element: Attribute.Electro, scaling: Scaling.Atk, type: Type.Echo,
});
// no energy: the Intro summon has its own damage row and, unlike the transform strike, pays none
export const ACTION_FALSE_SOVEREIGN_INTRO = new Action("Echo - False Sovereign (Intro)", {
  element: Attribute.Electro, scaling: Scaling.Atk, type: Type.Echo, bullets: [{ hitFrame: 0, mv: 40500 }],
});
export const FALSE_SOVEREIGN = new Mainslot({
  name: "False Sovereign",
  action: ACTION_FALSE_SOVEREIGN,
  updateBuffs: () => { if (casting(Cast.Intro)) queue(ACTION_FALSE_SOVEREIGN_INTRO); },
  stats: [[Stat.DmgBonus, 12, Attribute.Electro], [Stat.DmgBonus, 12, Type.Heavy]],
});

/** Crown of Valor, Augusta's own sonata — also reused by Iuno and Jingran. 3pc: a shield stacks
 *  +6% ATK / +4% Crit DMG, up to five. Its 4s is shorter still than Lamp of Nether Road's, so the
 *  same reading: the wearer's own outro keeps it, and nothing they built carries into their next
 *  visit. */
export const CROWN_STACKS = new Buff({
  name: "Crown of Valor", maxStacks: 5, duration: 60 * 4,
  stats: [[Stat.BonusAtk, 6], [Stat.CritDmg, 4]], perStack: true,
});
export const COV_3PC = new Sonata3pc({
  name: "Crown of Valor 3pc",
  grants: [{ on: onApplied(SHIELD), buff: CROWN_STACKS, stacks: () => applied(SHIELD) }],
});

/* ------------------------------------------------------------------------------- Iuno, 2.6 */

/** Lady of the Sea, Iuno's own mainslot echo. (Her own sonata pick, Sierra Gale, is a
 *  Jinzhou-era set — see jinzhou.ts — she just reuses it.) */
export const ACTION_MYA = new SummonEcho("Echo - Lady of the Sea", {
  cooldown: 60 * 20,
  element: Attribute.Aero, scaling: Scaling.Atk, type: Type.Echo, bullets: [{ hitFrame: 0, mv: 30096, energy: 418 }],
});
export const MYA = new Mainslot({
  name: "Lady of the Sea",
  action: ACTION_MYA,
  stats: [[Stat.DmgBonus, 12, Type.Liberation], [Stat.DmgBonus, 12, Attribute.Aero]],
});

/* ----------------------------------------------------------------------------------- Lupa, 2.4 */

/** Lioness of Glory, Lupa's own mainslot echo — flat Resonance Liberation/Fusion DMG Bonus, no trigger. */
export const ACTION_LIONESS = new SummonEcho("Echo - Lioness of Glory", {
  cooldown: 60 * 20,
  element: Attribute.Fusion, scaling: Scaling.Atk, type: Type.Echo, bullets: [{ hitFrame: 0, mv: 27360, energy: 380 }],
});
export const LIONESS_OF_GLORY = new Mainslot({
  name: "Lioness of Glory",
  action: ACTION_LIONESS,
  stats: [[Stat.DmgBonus, 12, Type.Liberation], [Stat.DmgBonus, 12, Attribute.Fusion]],
});

/** Flaming Clawprint, Lupa's own sonata — also reused by Galbrena. 5pc: Resonance Liberation
 *  grants the team +15% Fusion DMG Bonus and the caster +20% Liberation DMG Bonus, both 35s —
 *  permanent uptime once granted (≥21s), so a one-time grant on the first cast, never revoked.
 *  2pc: +10% Fusion DMG Bonus flat. */
export const CLAWPRINT_TEAM = new Buff({ name: "Flaming Clawprint 5pc (team)", duration: 60 * 35, stats: [[Stat.DmgBonus, 15, Attribute.Fusion]] });
export const CLAWPRINT_LIBERATION = new Buff({ name: "Flaming Clawprint 5pc", duration: 60 * 35, stats: [[Stat.DmgBonus, 20, Type.Liberation]] });
export const CLAWPRINT_2PC = new Sonata2pc({ name: "Flaming Clawprint 2pc", stats: [[Stat.DmgBonus, 10, Attribute.Fusion]] });
export const CLAWPRINT_5PC = new Sonata({
  name: "Flaming Clawprint 5pc",
  sonata2pc: CLAWPRINT_2PC,
  grants: [
    { on: onCast(Cast.Liberation), buff: CLAWPRINT_TEAM, to: BuffTarget.Team },
    { on: onCast(Cast.Liberation), buff: CLAWPRINT_LIBERATION },
  ],
});

/* ----------------------------------------------------------------------------- Galbrena, 2.7 */

/** Corrosaurus, Galbrena's own mainslot echo — flat Fusion/Echo Skill DMG Bonus, no trigger. */
export const ACTION_CORROSAURUS = new SummonEcho("Echo - Corrosaurus", {
  cooldown: 60 * 20,
  element: Attribute.Fusion, scaling: Scaling.Atk, type: Type.Echo, bullets: [{ hitFrame: 0, mv: 27360, energy: 380 }],
});
export const CORROSAURUS = new Mainslot({
  name: "Corrosaurus",
  action: ACTION_CORROSAURUS,
  stats: [[Stat.DmgBonus, 12, Attribute.Fusion], [Stat.DmgBonus, 20, Type.Echo]],
});

/** Flamewing's Shadow 3pc, Galbrena's own sonata: Echo Skill DMG grants +20% Heavy Attack Crit
 *  Rate for 6s; Heavy Attack DMG grants +20% Echo Skill Crit Rate for 6s; while both up, +16%
 *  Fusion DMG Bonus. */
export const FLAMEWING_SHADOW_ECHO = new Buff({
  name: "Flamewing's Shadow 3pc (echo)",
  duration: 60 * 6,
  stats: [[Stat.CritRate, 20, Type.Heavy]],
});
export const FLAMEWING_SHADOW_HEAVY = new Buff({
  name: "Flamewing's Shadow 3pc (heavy)",
  duration: 60 * 6,
  stats: [[Stat.CritRate, 20, Type.Echo]],
});
export const FLAMEWING_SHADOW_3PC = new Sonata3pc({
  name: "Flamewing's Shadow 3pc",
  grants: [
    { on: onType(Type.Echo), buff: FLAMEWING_SHADOW_ECHO, onHit: true },
    { on: onType(Type.Heavy), buff: FLAMEWING_SHADOW_HEAVY, onHit: true },
  ],
  applyStats: () => {
    if (stacksOf(FLAMEWING_SHADOW_ECHO) && stacksOf(FLAMEWING_SHADOW_HEAVY)) addStat(Stat.DmgBonus, 16, Attribute.Fusion);
  },
});

/* ------------------------------------------------------------------------------- Qiuyuan, 2.7 */

/** Reminiscence: Fenrico, Qiuyuan's own mainslot echo — flat Aero/Heavy DMG Bonus, no trigger. */
export const ACTION_FENRICO = new SummonEcho("Echo - Reminiscence: Fenrico", {
  cooldown: 60 * 20,
  element: Attribute.Aero, scaling: Scaling.Atk, type: Type.Echo, bullets: [{ hitFrame: 0, mv: 27360, energy: 380 }],
});
export const FENRICO = new Mainslot({
  name: "Reminiscence: Fenrico",
  action: ACTION_FENRICO,
  stats: [[Stat.DmgBonus, 12, Attribute.Aero], [Stat.DmgBonus, 12, Type.Heavy]],
});

/** Law of Harmony 3pc, Qiuyuan's own sonata: Echo Skill grants the caster +30% Heavy Attack DMG
 *  Bonus for 4s, and the whole team +4% Echo Skill DMG Bonus, up to 4 stacks — one stack per
 *  distinct named Echo (every cast assumed unique). */
export const LAW_OF_HARMONY_SELF = new Buff({
  name: "Law of Harmony",
  duration: 60 * 4,
  stats: [[Stat.DmgBonus, 30, Type.Heavy]],
});
export const LAW_OF_HARMONY_TEAM = new Buff({
  name: "Law of Harmony (team)", maxStacks: 4, duration: 60 * 30,
  applyStats: () => { addStat(Stat.DmgBonus, 4 * stacksOfTeam(LAW_OF_HARMONY_TEAM), Type.Echo); },
});
export const LAW_OF_HARMONY_3PC = new Sonata3pc({
  name: "Law of Harmony 3pc",
  grants: [
    { on: onCast(Cast.Echo), buff: LAW_OF_HARMONY_SELF },
    { on: onCast(Cast.Echo), buff: LAW_OF_HARMONY_TEAM, to: BuffTarget.Team },
  ],
});

/* -------------------------------------------------------------------------------- Chisa, 3.6 */

/** Reminiscence: Threnodian - Leviathan, Chisa's own mainslot echo: a Collapsing Horizon, two
 *  131.04% Havoc hits. The main-slot wearer also gets a flat +12% Havoc DMG Bonus and +12%
 *  Resonance Liberation DMG Bonus.
 *
 *  Its own passive is Core of Collapse: another 24.57% Havoc hit whenever the active resonator
 *  deals damage, 0.5s apart, up to 8 times over the summon's 15s, and doubled against a target
 *  carrying Havoc Bane — one action, its eight hits its own bullets 0.5s apart, queued off the
 *  summon's own hit and resolved on the wearer's own slot and stats. */
export const ACTION_THRENODIAN_LEVIATHAN = new PseudoTransformEcho("Echo - Reminiscence: Leviathan", {
  cooldown: 60 * 25,
  element: Attribute.Havoc, scaling: Scaling.Atk, type: Type.Echo,
  bullets: [{ hitFrame: 0, mv: 13104 * 2, energy: 91 * 2 }], 
  // one summon at a time: a fresh one cuts off whatever hits the last had left
  updateDebuffs: () => {
    cancelHits(CORES_OF_COLLAPSE);
    queue(ACTION_CORE_OF_COLLAPSE);
  },
});
/** The eight 24.57% hits, with the Havoc Bane doubling as its own Damage Taken ("Enemies with
 *  Havoc Bane take 100% more DMG from this effect") rather than folded into the motion value, so
 *  the report names what it is. Carries no energy or concerto — nanoka gives the summon one damage
 *  row and these hits none of their own. */
export const ACTION_CORE_OF_COLLAPSE = new Action("Echo - Core of Collapse", {
  element: Attribute.Havoc, scaling: Scaling.Atk, type: Type.Echo,
  bullets: Array.from({ length: 8 }, (_, k) => ({ hitFrame: 30 * (k + 1), mv: 2457 })),
  applyStats: () => { if (stacksOfEnemy(HAVOC_BANE) > 0) addStat(Stat.DamageTaken, 100); },
});
const CORES_OF_COLLAPSE = new Set<Action>([ACTION_CORE_OF_COLLAPSE]);

export const THRENODIAN_LEVIATHAN = new Mainslot({
  name: "Reminiscence: Threnodian - Leviathan", 
  action: ACTION_THRENODIAN_LEVIATHAN,
  stats: [[Stat.DmgBonus, 12, Attribute.Havoc], [Stat.DmgBonus, 12, Type.Liberation]],
});

/** Thread of Severed Fate, Chisa's own sonata — a 3pc-only set (no 5pc of its own), paired with a
 *  plain 2pc from elsewhere the way Galbrena's Flamewing's Shadow 3pc pairs with Clawprint 2pc.
 *  3pc: inflicting Havoc Bane grants +20% ATK and +30% Resonance Liberation DMG Bonus for 5s.
 *
 *  hitGlobal rather than a grant, so it still pays out while its wearer is *off* field: a
 *  marker that keeps inflicting Bane off teammates' hits (Chisa's Unseen Snare) is the wearer's
 *  own doing wherever they happen to be standing, and a grant only ever runs on the wearer's
 *  own turn. `appliedByMe` is what keeps that honest — inside hitGlobal a locally-held gear runs
 *  with `currentSlot` aimed at its own holder, so it grants only when the Bane traces back to that
 *  holder, and a teammate wearing this set whose swing merely tripped somebody else's marker still
 *  reads 0. */
export const THREAD_OF_SEVERED_FATE_3PC = new Sonata3pc({
  name: "Thread of Severed Fate 3pc",
  hitGlobal: () => { if (appliedByMe(HAVOC_BANE)) applyCurrent(THREAD_OF_SEVERED_FATE_BUFF, 1); },
});
export const THREAD_OF_SEVERED_FATE_BUFF = new Buff({
  name: "Thread of Severed Fate",
  duration: 60 * 5,
  stats: [[Stat.BonusAtk, 20], [Stat.DmgBonus, 30, Type.Liberation]],
});
