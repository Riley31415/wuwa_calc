/** Signature Rectifier weapons, ported to the new engine — grouped by weapon type rather than
 *  version, same as the old src/weapons/rectifier.ts. Each section is the character it's
 *  signature to; Stringmaster (Encore's own, a standard/permanent-availability weapon) lives
 *  here too since it isn't part of any named tier. */
import {
  Buff, Weapon, WeaponType, Stat, Element, Type1, Cast, AddConcerto,
  addStat, stacks, stacksOf, applySelf, applyTeam, revoke, casting, currentAction, lostOnSwap,
} from "../kit.js";

/** Rime-Draped Sprouts, Zhezhi's signature, R1. +12% ATK flat. While on field, casting
 *  Resonance Skill (any of its forms) grants +12% Basic Attack DMG Bonus a stack, up to 3, 6s —
 *  short enough that only the standing outro-loss rule matters. At 3+ stacks, her own Outro
 *  spends them all for +52% Basic Attack DMG Bonus, 27s — permanent uptime once granted. Zhezhi,
 *  character 1105, released 1.2 — https://ww.nanoka.cc/character/1105,
 *  https://ww.nanoka.cc/weapon/21050026 */
export const RIME_DRAPED_SPROUTS = new Weapon({
  weaponType: WeaponType.Rectifier,
  name: "Rime-Draped Sprouts",
  update: () => { if (currentAction().cast === Cast.Skill) applySelf(PANORAMA_STACKS, 1); },
  apply: () => {
    addStat(Stat.BaseAtk, 500);
    addStat(Stat.CritDmg, 72);
    addStat(Stat.BonusAtk, 12);
  },
});
export const PANORAMA_STACKS = new Buff({
  name: "Rime-Draped Sprouts: Panorama", maxStacks: 3,
  apply: () => addStat(Stat.DmgBonus, 12 * stacks(), Type1.Basic),
  // On outro: 3+ stacks convert into the permanent off-field version below (spent, not carried),
  // short of 3 they're just lost — either way this copy is gone. Reads stacks() (this buff's own
  // frozen count, not a live stacksOf() re-read) before revoking, same "read the count you're
  // about to lose before you lose it" shape as every other stack-consuming buff in this codebase.
  update: () => {
    if (casting(Cast.Outro)) {
        if (stacks() >= 3) applySelf(PANORAMA_OFFIELD, 1);
        revoke(PANORAMA_STACKS);
    }
  },
});
export const PANORAMA_OFFIELD = new Buff({
  name: "Rime-Draped Sprouts: Panorama (off field)", apply: () => {
    if (!currentAction().active) {
        addStat(Stat.DmgBonus, 52, Type1.Basic);
    }
  }
});

/** Whispers of Sirens, Cantarella's signature, R1: From the Deep. +12% ATK flat. Gentle Dream:
 *  an Echo Skill cast within 10s of an Intro/Basic grants a stack, up to two (echoes are assumed
 *  unique, so no per-name tracking) — same "stays ready" approximation as Qiuyuan's Bamboo
 *  Cleaver, and the same one-buff-three-levels shape (1 ready, 2/3 the real stacks). Stack 1
 *  pays +40% Basic Attack DMG Bonus, stack 2 also ignores 12% Havoc RES. Lost entirely if she's
 *  switched off field. Cantarella, character 1607, released 2.2 —
 *  https://ww.nanoka.cc/character/1607, https://ww.nanoka.cc/weapon/21050056 */
export const WHISPERS_OF_SIRENS = new Weapon({
  weaponType: WeaponType.Rectifier,
  name: "Whispers of Sirens",
  update: () => {
    const a = currentAction();
    if ((a.cast === Cast.Intro || a.cast === Cast.Basic) && !stacksOf(GENTLE_DREAM)) applySelf(GENTLE_DREAM, 1);
  },
  apply: () => {
    addStat(Stat.BaseAtk, 500);
    addStat(Stat.CritDmg, 72);
    addStat(Stat.BonusAtk, 12);
  },
});
export const GENTLE_DREAM = new Buff({
  name: "Whispers of Sirens: Gentle Dream", maxStacks: 3,
  update: () => {
    lostOnSwap();
    if (casting(Cast.Echo)) applySelf(GENTLE_DREAM, 1);
  },
  apply: () => {
    const held = stacks();
    if (held < 2) return;
    addStat(Stat.DmgBonus, 40, Type1.Basic);
    if (held >= 3) addStat(Stat.ResIgnore, 12, Element.Havoc);
  },
});

/** Lethean Elegy, Phrolova's signature, R1: Underworld Requiem. +12% ATK flat. Dealing Echo
 *  Skill DMG (a damage-type hit, not just a cast that counts as one) grants +32% Skill DMG
 *  Bonus, +32% Echo Skill DMG Amplification and 8% DEF ignore for 12s. R5 (`LETHEAN_ELEGY_R5`,
 *  by explicit instruction alongside Phrolova's own S1-S6 loadout): base ATK/Crit Rate are the
 *  same at every refinement — only the passive's own numbers scale (+24% ATK flat; +64%/+64%/
 *  16% DEF ignore on the same trigger). Phrolova, character 1608, released 2.5 —
 *  https://ww.nanoka.cc/character/1608, https://ww.nanoka.cc/weapon/21050066 */
export const LETHEAN_ELEGY = new Weapon({
  weaponType: WeaponType.Rectifier,
  name: "Lethean Elegy",
  update: () => { if (currentAction().type === Type1.Echo) applySelf(UNDERWORLD_REQUIEM, 1); },
  apply: () => {
    addStat(Stat.BaseAtk, 587.5);
    addStat(Stat.CritRate, 24.3);
    addStat(Stat.BonusAtk, 12);
  },
});
export const UNDERWORLD_REQUIEM = new Buff({
  name: "Lethean Elegy: Underworld Requiem",
  apply: () => {
    addStat(Stat.DmgBonus, 32, Type1.Skill);
    addStat(Stat.Amp, 32, Type1.Echo);
    addStat(Stat.DefIgnore, 8);
  },
});
export const LETHEAN_ELEGY_R5 = new Weapon({
  weaponType: WeaponType.Rectifier,
  name: "Lethean Elegy R5",
  update: () => { if (currentAction().type === Type1.Echo) applySelf(UNDERWORLD_REQUIEM_R5, 1); },
  apply: () => {
    addStat(Stat.BaseAtk, 587.5);
    addStat(Stat.CritRate, 24.3);
    addStat(Stat.BonusAtk, 24);
  },
});
export const UNDERWORLD_REQUIEM_R5 = new Buff({
  name: "Lethean Elegy: Underworld Requiem R5",
  apply: () => {
    addStat(Stat.DmgBonus, 64, Type1.Skill);
    addStat(Stat.Amp, 64, Type1.Echo);
    addStat(Stat.DefIgnore, 16);
  },
});

/** Freeze Frame, Lucilla's signature (R1 "Light's Offering"): +12% ATK flat. After inflicting
 *  Glacio Chafe, the wielder gets +30% Glacio DMG Bonus for 12s (short window, lost after the
 *  outro action gains stats) and the whole team — wielder included — gets +24% ATK for 30s
 *  (permanent uptime). Reacts to the wielder's *own* chafe application (`a.chafe`), so it still
 *  works if someone other than Lucilla equips it. Lucilla, character 1109, released 3.4 —
 *  https://ww.nanoka.cc/character/1109, https://ww.nanoka.cc/weapon/21050086 */
export const FREEZE_FRAME = new Weapon({
  weaponType: WeaponType.Rectifier,
  name: "Freeze Frame",
  update: () => { if (currentAction().chafe > 0) { applySelf(FREEZE_FRAME_SELF, 1); applyTeam(FREEZE_FRAME_TEAM, 1); } },
  apply: () => {
    addStat(Stat.BaseAtk, 587.5);
    addStat(Stat.CritRate, 24.3);
    addStat(Stat.BonusAtk, 12);
  },
});
export const FREEZE_FRAME_SELF = new Buff({
  name: "Freeze Frame: Light's Offering",
  apply: () => addStat(Stat.DmgBonus, 30, Element.Glacio),
  convert: () => { if (casting(Cast.Outro)) revoke(FREEZE_FRAME_SELF); },
});
export const FREEZE_FRAME_TEAM = new Buff({
  name: "Freeze Frame: Light's Offering", apply: () => addStat(Stat.BonusAtk, 24),
});

/** Stellar Symphony, Shorekeeper's signature: 12% HP to herself, 14% attack to the team, and
 *  concerto back on any liberation or a Resonance Skill cast that heals (`currentAction().heals`
 *  — Chaos Theory, not every skill she has). R1, the rank the sheet's numbers describe.
 *  Shorekeeper, character 1505, released 1.3 — https://ww.nanoka.cc/character/1505 */
export const SK_SIG = new Weapon({
  weaponType: WeaponType.Rectifier,
  name: "Stellar Symphony",
  update: () => {
    if (casting(Cast.Skill) && currentAction().heals) {
        applyTeam(SK_SIG_TEAM, 1);
    }
  },
  apply: () => {
    addStat(Stat.BaseAtk, 412.5);
    addStat(Stat.Er, 77.04);  
    addStat(Stat.BonusHp, 12);
    if (casting(Cast.Liberation)) addStat(AddConcerto, 8);
  },
});
export const SK_SIG_TEAM = new Buff({
  name: "Stellar Symphony: Astral Evolvement", apply: () => addStat(Stat.BonusAtk, 14),
});

/** Stringmaster, R1: Electric Amplification. +12% Attribute DMG Bonus flat (unscoped — "all
 *  attribute" isn't the wielder's own element), +12% ATK on any inactive action. Skill DMG
 *  stacks ATK twice over (12% a stack), lost after the outro action gains stats. Encore's own
 *  weapon, by explicit instruction. */
export const STRINGMASTER = new Weapon({
  weaponType: WeaponType.Rectifier,
  name: "Stringmaster",
  update: () => { if (currentAction().type === Type1.Skill) applySelf(STRINGMASTER_STACKS, 1); },
  apply: () => {
    addStat(Stat.BaseAtk, 500);
    addStat(Stat.CritRate, 36);
    addStat(Stat.DmgBonus, 12);
  },
});
export const STRINGMASTER_STACKS = new Buff({
  name: "Stringmaster: Electric Amplification", maxStacks: 2,
  apply: () => {
    if (!currentAction().active) addStat(Stat.BonusAtk, 12);
    addStat(Stat.BonusAtk, 12 * stacks());
  },
  convert: () => { if (casting(Cast.Outro)) revoke(STRINGMASTER_STACKS); },
});
