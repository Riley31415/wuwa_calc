/** Signature Broadblade weapons, ported to the new engine. Each section is the character it's
 *  signature to; every piece works if equipped on any resonator, not just its own. */
import {
  Buff, Weapon, WeaponType, Stat, Element, Type1, Cast,
  addStat, stacks, casting, currentAction, revoke, applySelf, applyTeam, removeStack, lostOnSwap,
} from "../kit.js";

/** Jiyan's sig, R1: Swordsworn. +12% Attribute DMG Bonus flat (unscoped). Every Intro Skill or
 *  Resonance Liberation cast grants +24% Heavy Attack DMG Bonus, up to 2 stacks, 14s. */
export const VERDANT_SUMMIT = new Weapon({
  weaponType: WeaponType.Broadblade,
  name: "Verdant Summit",
  apply: () => {
    addStat(Stat.BaseAtk, 587.5);
    addStat(Stat.CritDmg, 48.6);
    addStat(Stat.DmgBonus, 12);
  },
  update: () => { if (casting(Cast.Intro) || casting(Cast.Liberation)) applySelf(SWORDSWORN_STACKS); },
});
export const SWORDSWORN_STACKS = new Buff({
  name: "Verdant Summit: Swordsworn", maxStacks: 2,
  update: () => {
    addStat(Stat.DmgBonus, 24 * stacks(), Type1.Heavy);
    if (casting(Cast.Outro)) revoke(SWORDSWORN_STACKS);
  },
});

/** Jinhsi's sig, R1: Divine Blessing. +12% Attribute DMG Bonus flat (unscoped). Casting Intro
 *  Skill gives Ageless Marking (+24% Resonance Skill DMG, 12s); casting Resonance Skill gives
 *  Ethereal Endowment (+24% Resonance Skill DMG, 12s) — independently stackable, up to +48%. */
export const AGES_OF_HARVEST = new Weapon({
  weaponType: WeaponType.Broadblade,
  name: "Ages of Harvest",
  apply: () => {
    addStat(Stat.BaseAtk, 587.5);
    addStat(Stat.CritDmg, 48.6);
    addStat(Stat.DmgBonus, 12);
  },
  update: () => {
    if (casting(Cast.Intro)) applySelf(AGELESS_MARKING);
    if (casting(Cast.Skill)) applySelf(ETHEREAL_ENDOWMENT);
  },
});
export const AGELESS_MARKING = new Buff({
  name: "Ages of Harvest: Ageless Marking",
  apply: () => addStat(Stat.DmgBonus, 24, Type1.Skill),
  // 12s window, so it still counts on the wearer's own outro (see jinzhou.ts's HERON_HANDOFF)
  convert: () => { if (casting(Cast.Outro)) revoke(AGELESS_MARKING); },
});
export const ETHEREAL_ENDOWMENT = new Buff({
  name: "Ages of Harvest: Ethereal Endowment",
  apply: () => addStat(Stat.DmgBonus, 24, Type1.Skill),
  convert: () => { if (casting(Cast.Outro)) revoke(ETHEREAL_ENDOWMENT); },
});

/** Augusta's sig, R1. +12% ATK flat. Intro/Skill cast grants +20% Heavy Attack DMG Bonus for
 *  15s; gaining a shield grants a stack (up to 5) of +7.2% Heavy Attack DEF ignore, 7s. */
export const THUNDERFLARE_DOMINION = new Weapon({
  weaponType: WeaponType.Broadblade,
  name: "Thunderflare Dominion",
  apply: () => {
    addStat(Stat.BaseAtk, 675);
    addStat(Stat.CritRate, 12.15);
    addStat(Stat.BonusAtk, 12);
  },
  update: () => {
    const a = currentAction();
    if (a.cast === Cast.Intro || a.cast === Cast.Skill) applySelf(THUNDERBLAZE_DMG);
    if (a.shields) applySelf(THUNDERBLAZE_DEF, a.shields);
  },
});
export const THUNDERBLAZE_DMG = new Buff({
  name: "Thunderflare Dominion: Thunderblaze Eminence (heavy)",
  apply: () => addStat(Stat.DmgBonus, 20, Type1.Heavy),
  // 15s window, so it still counts on the wearer's own outro (see jinzhou.ts's HERON_HANDOFF)
  convert: () => { if (casting(Cast.Outro)) revoke(THUNDERBLAZE_DMG); },
});
export const THUNDERBLAZE_DEF = new Buff({
  name: "Thunderflare Dominion: Thunderblaze Eminence (def ignore)", maxStacks: 5,
  update: () => {
    addStat(Stat.DefIgnore, 7.2 * stacks(), Type1.Heavy);
    if (casting(Cast.Outro)) revoke(THUNDERBLAZE_DEF);
  },
});

/** Lupa's sig, R1: Wildfire Mark. Chain of three, only the last reaches the team: 12% ATK flat;
 *  Intro/Liberation gives her own 24% Resonance Liberation DMG for 6s (modelled as permanently
 *  up — she opens every rotation with intro -> liberation); dealing Heavy Attack DMG once extends
 *  that and hands the whole team +24% Fusion DMG Bonus for 30s — a real gate, nothing pays the
 *  team until Heavy Attack DMG lands. "Heavy Attack DMG" is the damage type, not the cast. */
export const WILDFIRE_TEAM = new Buff({
  name: "Wildfire Mark: Blazing Starfire",
  apply: () => addStat(Stat.DmgBonus, 24, Element.Fusion),
});
export const WILDFIRE_MARK = new Weapon({
  weaponType: WeaponType.Broadblade,
  name: "Wildfire Mark",
  apply: () => {
    addStat(Stat.BaseAtk, 587.5);
    addStat(Stat.CritDmg, 48.6);
    addStat(Stat.BonusAtk, 12);
    addStat(Stat.DmgBonus, 24, Type1.Liberation);
  },
  update: () => { if (currentAction().type === Type1.Heavy) applyTeam(WILDFIRE_TEAM); },
});

/** Jingran's sig, R1: Thousandfold Deliverance. Nature's Order stacks on intro/shield, 6x 4%
 *  crit damage, full six sharpens heavy attacks with 12% crit rate. Cradle of Life stacks the
 *  same way, spent by a heavy attack for defence ignore. Both end on switching resonator. Intro
 *  is its own flat +1 trigger rather than also counting its own declared shield, so the one
 *  action doesn't double-stack. */
export const JINGRAN_SIG = new Weapon({
  weaponType: WeaponType.Broadblade,
  name: "Thousandfold Deliverance",
  apply: () => {
    addStat(Stat.BaseAtk, 413);
    addStat(Stat.BonusHp, 72.2);
    addStat(Stat.DmgBonus, 12);
  },
  update: () => {
    const a = currentAction();
    if (a.cast === Cast.Intro) { applySelf(NATURES_ORDER); applySelf(CRADLE_OF_LIFE); }
    else if (a.shields) { applySelf(NATURES_ORDER, a.shields); applySelf(CRADLE_OF_LIFE, a.shields); }
  },
});
export const NATURES_ORDER = new Buff({
  name: "Thousandfold Deliverance: Nature's Order", maxStacks: 6,
  // switching resonator ends it immediately — whoever is wielding the weapon, not just Jingran —
  // so this is a genuine "lost on swap" case, not a duration approximation
  update: () => lostOnSwap(),
  apply: () => {
    addStat(Stat.CritDmg, 4 * stacks());
    if (stacks() >= 6) addStat(Stat.CritRate, 12, Type1.Heavy);
  },
});
/** Spent by a heavy attack: up to two stacks, each piercing 15% defence. "Heavy attack" is the
 *  cast, not the damage type (basic stages 3/4 deal Heavy Attack DMG without being heavy-attack
 *  casts). Also ends on switching resonator, same as Nature's Order — lost before the outro's
 *  own stats, so both the spend-gate and the revoke-gate live in update() together. */
export const CRADLE_OF_LIFE = new Buff({
  name: "Thousandfold Deliverance: Cradle of Life", maxStacks: 6,
  update: () => {
    lostOnSwap();
    if (!casting(Cast.Heavy)) return;
    const spent = Math.min(stacks(), 2);
    addStat(Stat.DefIgnore, 15 * spent, Type1.Heavy);
    removeStack(CRADLE_OF_LIFE, spent);
  },
});
