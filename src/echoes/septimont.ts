/** Mainslot echoes and sonatas from Septimont (versions 2.5-2.7). */
import { isType,
  Buff, Sonata, Sonata2pc, Mainslot, Action, Stat, Attribute, Type1, Cast, Scaling,
  addStat, frozenStacks, stacksOf, stacksOfTeam, applyCurrent, applyTeam, casting, currentAction, revokeSelf, maxEnergy, queue,
} from "../engine/kit.js";
import { applied, appliedByMe } from "../engine/kit.js";
import { SHIELD, HAVOC_BANE } from "../engine/status.js";

/* --------------------------------------------------------------------------------- Phrolova, 2.5 */

/** Dream of the Lost 3pc, Phrolova's own sonata — also reused by Lucilla. "Holding 0 Resonance
 *  Energy" is checked for real off the wearer's own `maxEnergy()`. */
export const DREAM_OF_THE_LOST_3PC = new Sonata({
  name: "Dream of the Lost 3pc",
  applyStats: () => {
    if (maxEnergy() !== 0) return;
    addStat(Stat.CritRate, 20);
    addStat(Stat.DmgBonus, 35, Type1.Echo);
  },
});

/* ----------------------------------------------------------------------------- Augusta, 2.6 */

/** False Sovereign, Augusta's own mainslot echo — flat Electro/Heavy Attack DMG Bonus. Casting
 *  Intro also summons it for a bonus hit — the 2-charge/8s-CD gating isn't modelled, assumed
 *  available whenever an Intro lands. */
export const ACTION_FALSE_SOVEREIGN = new Action("Echo - False Sovereign", {
  cast: Cast.Echo, element: Attribute.Electro, scaling: Scaling.Atk, type: Type1.Echo, mv: 221.4, energy: 3.04,
});
export const ACTION_FALSE_SOVEREIGN_INTRO = new Action("Echo - False Sovereign (Intro)", {
  element: Attribute.Electro, scaling: Scaling.Atk, type: Type1.Echo, mv: 405,
});
export const FALSE_SOVEREIGN = new Mainslot({
  name: "False Sovereign",
  action: ACTION_FALSE_SOVEREIGN,
  updateBuffs: () => { if (casting(Cast.Intro)) queue(ACTION_FALSE_SOVEREIGN_INTRO); },
  constantStats: () => { addStat(Stat.DmgBonus, 12, Attribute.Electro); addStat(Stat.DmgBonus, 12, Type1.Heavy); },
});

/** Crown of Valor, Augusta's own sonata — also reused by Iuno. 3pc: a shield stacks +6% ATK /
 *  +4% Crit DMG, up to five. */
export const CROWN_STACKS = new Buff({
  name: "Crown of Valor", maxStacks: 5,
  applyStats: () => { addStat(Stat.BonusAtk, 6 * frozenStacks()); addStat(Stat.CritDmg, 4 * frozenStacks()); },
});
export const COV_3PC = new Sonata({
  name: "Crown of Valor 3pc",
  updateBuffs: () => { if (applied(SHIELD)) applyCurrent(CROWN_STACKS, applied(SHIELD)); },
});

/* ------------------------------------------------------------------------------- Iuno, 2.6 */

/** Lady of the Sea, Iuno's own mainslot echo. (Her own sonata pick, Sierra Gale, is a
 *  Jinzhou-era set — see jinzhou.ts — she just reuses it.) */
export const ACTION_MYA = new Action("Echo - Lady of the Sea", {
  cast: Cast.Echo, element: Attribute.Aero, scaling: Scaling.Atk, type: Type1.Echo, mv: 300.96, energy: 4.18,
});
export const MYA = new Mainslot({
  name: "Lady of the Sea",
  action: ACTION_MYA,
  constantStats: () => { addStat(Stat.DmgBonus, 12, Type1.Liberation); addStat(Stat.DmgBonus, 12, Attribute.Aero); },
});

/* ----------------------------------------------------------------------------------- Lupa, 2.4 */

/** Lioness of Glory, Lupa's own mainslot echo — flat Resonance Liberation/Fusion DMG Bonus, no trigger. */
export const ACTION_LIONESS = new Action("Echo - Lioness of Glory", {
  cast: Cast.Echo, element: Attribute.Fusion, scaling: Scaling.Atk, type: Type1.Echo, mv: 273.6, energy: 3.8,
});
export const LIONESS_OF_GLORY = new Mainslot({
  name: "Lioness of Glory",
  action: ACTION_LIONESS,
  constantStats: () => { addStat(Stat.DmgBonus, 12, Type1.Liberation); addStat(Stat.DmgBonus, 12, Attribute.Fusion); },
});

/** Flaming Clawprint, Lupa's own sonata — also reused by Galbrena. 5pc: Resonance Liberation
 *  grants the team +15% Fusion DMG Bonus and the caster +20% Liberation DMG Bonus, both 35s —
 *  permanent uptime once granted (≥21s), so a one-time grant on the first cast, never revoked.
 *  2pc: +10% Fusion DMG Bonus flat. */
export const CLAWPRINT_TEAM = new Buff({
  name: "Flaming Clawprint 5pc (team)", applyStats: () => addStat(Stat.DmgBonus, 15, Attribute.Fusion),
});
export const CLAWPRINT_LIBERATION = new Buff({
  name: "Flaming Clawprint 5pc", applyStats: () => addStat(Stat.DmgBonus, 20, Type1.Liberation),
});
export const CLAWPRINT_5PC = new Sonata({
  name: "Flaming Clawprint 5pc",
  updateBuffs: () => { if (casting(Cast.Liberation)) { applyTeam(CLAWPRINT_TEAM, 1); applyCurrent(CLAWPRINT_LIBERATION, 1); } },
});
export const CLAWPRINT_2PC = new Sonata2pc({ name: "Flaming Clawprint 2pc", constantStats: () => addStat(Stat.DmgBonus, 10, Attribute.Fusion) });

/* ----------------------------------------------------------------------------- Galbrena, 2.7 */

/** Corrosaurus, Galbrena's own mainslot echo — flat Fusion/Echo Skill DMG Bonus, no trigger. */
export const ACTION_CORROSAURUS = new Action("Echo - Corrosaurus", {
  cast: Cast.Echo, element: Attribute.Fusion, scaling: Scaling.Atk, type: Type1.Echo, mv: 273.6, energy: 3.8,
});
export const CORROSAURUS = new Mainslot({
  name: "Corrosaurus",
  action: ACTION_CORROSAURUS,
  constantStats: () => { addStat(Stat.DmgBonus, 12, Attribute.Fusion); addStat(Stat.DmgBonus, 20, Type1.Echo); },
});

/** Flamewing's Shadow 3pc, Galbrena's own sonata: Echo Skill DMG grants +20% Heavy Attack Crit
 *  Rate for 6s; Heavy Attack DMG grants +20% Echo Skill Crit Rate for 6s; while both up, +16%
 *  Fusion DMG Bonus. */
export const FLAMEWING_SHADOW_HEAVY = new Buff({
  name: "Flamewing's Shadow 3pc (heavy)",
  applyStats: () => addStat(Stat.CritRate, 20, Type1.Heavy),
  convertStats: () => { if (casting(Cast.Outro)) revokeSelf(FLAMEWING_SHADOW_HEAVY); },
});
export const FLAMEWING_SHADOW_ECHO = new Buff({
  name: "Flamewing's Shadow 3pc (echo)",
  applyStats: () => addStat(Stat.CritRate, 20, Type1.Echo),
  convertStats: () => { if (casting(Cast.Outro)) revokeSelf(FLAMEWING_SHADOW_ECHO); },
});
export const FLAMEWING_SHADOW_3PC = new Sonata({
  name: "Flamewing's Shadow 3pc",
  updateBuffs: () => {
    if (isType(Type1.Echo)) applyCurrent(FLAMEWING_SHADOW_HEAVY, 1);
    if (isType(Type1.Heavy)) applyCurrent(FLAMEWING_SHADOW_ECHO, 1);
  },
  applyStats: () => {
    if (stacksOf(FLAMEWING_SHADOW_HEAVY) && stacksOf(FLAMEWING_SHADOW_ECHO)) addStat(Stat.DmgBonus, 16, Attribute.Fusion);
  },
});

/* ------------------------------------------------------------------------------- Qiuyuan, 2.7 */

/** Reminiscence: Fenrico, Qiuyuan's own mainslot echo — flat Aero/Heavy DMG Bonus, no trigger. */
export const ACTION_FENRICO = new Action("Echo - Reminiscence: Fenrico", {
  cast: Cast.Echo, element: Attribute.Aero, scaling: Scaling.Atk, type: Type1.Echo, mv: 273.6, energy: 3.8,
});
export const FENRICO = new Mainslot({
  name: "Reminiscence: Fenrico",
  action: ACTION_FENRICO,
  constantStats: () => { addStat(Stat.DmgBonus, 12, Attribute.Aero); addStat(Stat.DmgBonus, 12, Type1.Heavy); },
});

/** Law of Harmony 3pc, Qiuyuan's own sonata: Echo Skill grants the caster +30% Heavy Attack DMG
 *  Bonus for 4s, and the whole team +4% Echo Skill DMG Bonus, up to 4 stacks — one stack per
 *  distinct named Echo (every cast assumed unique). */
export const LAW_OF_HARMONY_SELF = new Buff({
  name: "Law of Harmony",
  applyStats: () => addStat(Stat.DmgBonus, 30, Type1.Heavy),
  convertStats: () => { if (casting(Cast.Outro)) revokeSelf(LAW_OF_HARMONY_SELF); },
});
export const LAW_OF_HARMONY_TEAM = new Buff({
  name: "Law of Harmony", maxStacks: 4,
  applyStats: () => { addStat(Stat.DmgBonus, 4 * stacksOfTeam(LAW_OF_HARMONY_TEAM), Type1.Echo); },
});
export const LAW_OF_HARMONY_3PC = new Sonata({
  name: "Law of Harmony 3pc",
  updateBuffs: () => {
    if (casting(Cast.Echo)) { applyCurrent(LAW_OF_HARMONY_SELF, 1); applyTeam(LAW_OF_HARMONY_TEAM, 1); }
  },
});

/* -------------------------------------------------------------------------------- Chisa, 3.6 */

/** Reminiscence: Threnodian - Leviathan, Chisa's own mainslot echo: a Collapsing Horizon, two
 *  131.04% Havoc hits. The main-slot wearer also gets a flat +12% Havoc DMG Bonus and +12%
 *  Resonance Liberation DMG Bonus. Its own passive — Core of Collapse deals another 24.57% Havoc
 *  hit whenever the active resonator deals damage, on a 0.5s internal cooldown, up to 8 times over
 *  the summon's 15s — runs on a clock this engine has none of (same call as Wind Erosion/
 *  Electromagnetic in statuses.ts), so only the direct summon hit is modelled. */
export const ACTION_THRENODIAN_LEVIATHAN = new Action("Echo - Reminiscence: Threnodian - Leviathan", {
  cast: Cast.Echo, element: Attribute.Havoc, scaling: Scaling.Atk, type: Type1.Echo,
  mv: 131.04 * 2, energy: 0.91 * 2,
});
export const THRENODIAN_LEVIATHAN = new Mainslot({
  name: "Reminiscence: Threnodian - Leviathan",
  action: ACTION_THRENODIAN_LEVIATHAN,
  constantStats: () => { addStat(Stat.DmgBonus, 12, Attribute.Havoc); addStat(Stat.DmgBonus, 12, Type1.Liberation); },
});

/** Thread of Severed Fate, Chisa's own sonata — a 3pc-only set (no 5pc of its own), paired with a
 *  plain 2pc from elsewhere the way Galbrena's Flamewing's Shadow 3pc pairs with Clawprint 2pc.
 *  3pc: inflicting Havoc Bane grants +20% ATK and +30% Resonance Liberation DMG Bonus for 5s — a
 *  short self window, lost after the outro like every other one here.
 *
 *  updateGlobal rather than updateBuffs, so it still pays out while its wearer is *off* field: a
 *  marker that keeps inflicting Bane off teammates' casts (Chisa's Unseen Snare) is the wearer's
 *  own doing wherever they happen to be standing, and updateBuffs only ever runs on the wearer's
 *  own turn. `appliedByMe` is what keeps that honest — inside updateGlobal a locally-held gear runs
 *  with `currentSlot` aimed at its own holder, so it grants only when the Bane traces back to that
 *  holder, and a teammate wearing this set whose swing merely tripped somebody else's marker still
 *  reads 0. */
export const THREAD_OF_SEVERED_FATE_3PC = new Sonata({
  name: "Thread of Severed Fate 3pc",
  updateGlobal: () => { if (appliedByMe(HAVOC_BANE)) applyCurrent(THREAD_OF_SEVERED_FATE_BUFF, 1); },
});
export const THREAD_OF_SEVERED_FATE_BUFF = new Buff({
  name: "Thread of Severed Fate",
  applyStats: () => { addStat(Stat.BonusAtk, 20); addStat(Stat.DmgBonus, 30, Type1.Liberation); },
});
