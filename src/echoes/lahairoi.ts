/** Mainslot echoes and sonatas from Lahairoi (versions 2.8-3.4), plus the 3.5-3.6 pieces that
 *  have no region file of their own yet (Hyvatia, Reactor Husk, Spacetrek Explorer, and the four
 *  sonatas at the bottom) — split them out when that region gets a name. Buling and Lucilla, also
 *  Lahairoi-era, own no mainslot echo/sonata of their own — Lucilla reuses Bell-Borne
 *  Geochelone/Moonlit Clouds from jinzhou.ts and Dream of the Lost from septimont.ts. */
import {
  Buff, Sonata, Sonata2pc, Mainslot, Action, Stat, Attribute, Type1, Cast, Scaling,
  addStat, applySelf, applyTeam, casting, currentAction, getStat, queueOutro, revoke, revokeTeam,
  stacks, stacksOf,
  lostOnSwap,
} from "../kit.js";

/* ------------------------------------------------------------------------------ Sigrika, 3.2 */

/** Nameless Explorer, Sigrika's own mainslot echo — flat Aero/Echo Skill DMG Bonus for whoever
 *  wears it, no trigger. */
export const ACTION_NAMELESS_EXPLORER = new Action("Echo - Nameless Explorer", {
  cast: Cast.Echo, element: Attribute.Aero, scaling: Scaling.Atk, type: Type1.Echo, mv: 273.6, energy: 3.8,
});
export const NAMELESS_EXPLORER = new Mainslot({
  name: "Nameless Explorer",
  action: ACTION_NAMELESS_EXPLORER,
  apply: () => { addStat(Stat.DmgBonus, 12, Attribute.Aero); addStat(Stat.DmgBonus, 20, Type1.Echo); },
});

/** Sound of True Name, Sigrika's own sonata (paired directly with Nameless Explorer above).
 *  2pc: +10% Aero DMG Bonus flat. 5pc: dealing Echo Skill DMG grants +20% Echo Skill Crit Rate
 *  and +15% Aero DMG Bonus for 5s — short window, lost after the outro action gains stats. */
export const SOUND_OF_TRUE_NAME_2PC = new Sonata2pc({ name: "Sound of True Name 2pc", apply: () => addStat(Stat.DmgBonus, 10, Attribute.Aero) });
export const SOUND_OF_TRUE_NAME_BUFF = new Buff({
  name: "Sound of True Name 5pc",
  apply: () => { addStat(Stat.CritRate, 20, Type1.Echo); addStat(Stat.DmgBonus, 15, Attribute.Aero); },
  convert: () => { if (casting(Cast.Outro)) revoke(SOUND_OF_TRUE_NAME_BUFF); },
});
export const SOUND_OF_TRUE_NAME_5PC = new Sonata({
  name: "Sound of True Name 5pc",
  abbreviation: "SoTN",
  update: () => { if (currentAction().type === Type1.Echo) applySelf(SOUND_OF_TRUE_NAME_BUFF, 1); },
});

/* -------------------------------------------------------------------------------- Lynae, 3.6 */

/** Hyvatia: ten lasers at 27.36% apiece. */
export const ACTION_HYVATIA = new Action("Echo - Hyvatia", {
  cast: Cast.Echo, element: Attribute.Spectro, scaling: Scaling.Atk, type: Type1.Echo,
  mv: 27.36 * 10,
});

/** Its own handoff: an Outro within 15s of the summon hands the next resonator's Intro +10%
 *  All-Attribute DMG Bonus for 15s. Modelled the way every other echo handoff here is — queued
 *  onto the outro rather than tracking the 15s window, which a rotation never misses. */
export const HYVATIA_HANDOFF = new Buff({
  name: "Hyvatia: Outro",
  apply: () => addStat(Stat.DmgBonus, 10),
  convert: () => { if (casting(Cast.Outro)) revoke(HYVATIA_HANDOFF); },
});

export const HYVATIA = new Mainslot({
  name: "Hyvatia",
  abbreviation: "Hyvatia",
  action: ACTION_HYVATIA,
  update: () => { if (currentAction() === ACTION_HYVATIA) queueOutro(HYVATIA_HANDOFF); },
});

/* ------------------------------------------------------------------------------- Mornye, 3.6 */

/** Reactor Husk: one heavy slash at 351%, and a flat +10% Energy Regen for whoever wears it —
 *  which is the reason Mornye wants it, her Liberation turning every point of ER past 100% into
 *  crit. */
export const ACTION_REACTOR_HUSK = new Action("Echo - Reactor Husk", {
  cast: Cast.Echo, element: Attribute.Fusion, scaling: Scaling.Atk, type: Type1.Echo, mv: 351,
});
export const REACTOR_HUSK = new Mainslot({
  name: "Reactor Husk",
  abbreviation: "Reactor",
  action: ACTION_REACTOR_HUSK,
  apply: () => addStat(Stat.Er, 10),
});

/** Spacetrek Explorer: a 10%-of-Max-HP team shield and nothing else — no damage of its own, so
 *  only the cast exists here. Kept because it is a real mainslot option for a sustain build. */
export const ACTION_SPACETREK = new Action("Echo - Spacetrek Explorer", {
  cast: Cast.Echo, element: Attribute.Fusion, scaling: Scaling.Atk, type: Type1.Echo, mv: 0, shields: 1,
});
export const SPACETREK_EXPLORER = new Mainslot({
  name: "Spacetrek Explorer",
  abbreviation: "Spacetrek",
  action: ACTION_SPACETREK,
});

/* --------------------------------------------------------------------------- 3.5-3.6 sonatas */

/** Pact of Neonlight Leap. 2pc: +10% Spectro DMG Bonus flat. 5pc: the classic Outro→Intro
 *  handoff — the incoming resonator gets +15% ATK, plus 0.3% more per point of their own Tune
 *  Break Boost, capped at another +15% (50 points), for 15s or until switched out — the
 *  receiver's own outro is both, so it's the Moonlit Clouds shape. */
export const NEONLIGHT_LEAP_2PC = new Sonata2pc({ name: "Pact of Neonlight Leap 2pc", apply: () => addStat(Stat.DmgBonus, 10, Attribute.Spectro) });
export const NEONLIGHT_LEAP_5PC = new Sonata({
  name: "Pact of Neonlight Leap 5pc",
  abbreviation: "Neon",
  update: () => { if (casting(Cast.Outro)) queueOutro(NEONLIGHT_LEAP_HANDOFF); },
});
export const NEONLIGHT_LEAP_HANDOFF = new Buff({
  name: "Pact of Neonlight Leap (outro)",
  update: () => lostOnSwap(),
  apply: () => addStat(Stat.BonusAtk, 15),
  // the TBB half is read in convert() so every contribution has landed this action — the era's
  // flat 10, plus anything like Lynae's own Spectral Analysis +40 (which alone hits the cap)
  convert: () => {
    addStat(Stat.BonusAtk, Math.min(15, 0.3 * getStat(Stat.Tbb)));
  },
});

/** Halo of Starry Radiance, Mornye's own sonata. 2pc: +10% Healing Bonus flat. 5pc: healing a
 *  teammate grants the whole team ATK, 0.2% per 1% of the healer's own Off-Tune Buildup Rate —
 *  taken at the 25% cap per CLAUDE.md's own-stats rule (125% needed; base 100% plus Mornye's
 *  field's +50 clears it). 4s team window, so lost on the wearer's next intro. */
export const STARRY_RADIANCE_2PC = new Sonata2pc({ name: "Halo of Starry Radiance 2pc", apply: () => addStat(Stat.HealingBonus, 10) });
export const STARRY_RADIANCE_5PC = new Sonata({
  name: "Halo of Starry Radiance 5pc",
  abbreviation: "Halo",
  update: () => {
    if (currentAction().heals) applyTeam(STARRY_RADIANCE_TEAM, 1);
  },
});
export const STARRY_RADIANCE_TEAM = new Buff({
  name: "Halo of Starry Radiance (team)",
  convert: () => {
    addStat(Stat.BonusAtk, Math.min(25, 0.2 * (100 + getStat(Stat.OfftuneBuildup))));
  }
});

/** Chromatic Foam. 2pc: +10% Fusion DMG Bonus flat. 5pc: inflicting Fusion Burst grants +10%
 *  Fusion DMG Bonus for 15s; while that window is up, the wearer's Outro hands the incoming
 *  resonator +25% Fusion DMG Bonus for 15s. */
export const CHROMATIC_FOAM_2PC = new Sonata2pc({ name: "Chromatic Foam 2pc", apply: () => addStat(Stat.DmgBonus, 10, Attribute.Fusion) });
export const CHROMATIC_FOAM_5PC = new Sonata({
  name: "Chromatic Foam 5pc",
  abbreviation: "Foam",
  update: () => { if (currentAction().burst > 0) applySelf(CHROMATIC_FOAM_BUFF, 1); },
});
export const CHROMATIC_FOAM_BUFF = new Buff({
  name: "Chromatic Foam",
  apply: () => addStat(Stat.DmgBonus, 10, Attribute.Fusion),
  update: () => { if (casting(Cast.Outro)) queueOutro(CHROMATIC_FOAM_HANDOFF); },
  convert: () => { if (casting(Cast.Outro)) revoke(CHROMATIC_FOAM_BUFF); }, // TODO last a bit longer for denia
});
export const CHROMATIC_FOAM_HANDOFF = new Buff({
  name: "Chromatic Foam (outro)",
  apply: () => addStat(Stat.DmgBonus, 25, Attribute.Fusion),
  convert: () => { if (casting(Cast.Outro)) revoke(CHROMATIC_FOAM_HANDOFF); },
});

/** Rite of Gilded Revelation. 2pc: +10% Spectro DMG Bonus flat. 5pc: dealing Basic Attack DMG
 *  grants +10% Spectro DMG Bonus a stack, up to 3, 5s each — short windows, lost after the outro.
 *  At 3 stacks, casting Resonance Liberation grants +40% Basic Attack DMG Bonus, paying into the
 *  liberation itself when it deals Basic DMG. */
export const GILDED_REVELATION_2PC = new Sonata2pc({ name: "Rite of Gilded Revelation 2pc", apply: () => addStat(Stat.DmgBonus, 10, Attribute.Spectro) });
export const GILDED_REVELATION_5PC = new Sonata({
  name: "Rite of Gilded Revelation 5pc",
  abbreviation: "Gilded",
  update: () => {
    if (currentAction().type === Type1.Basic) applySelf(GILDED_REVELATION_STACKS, 1);
  },
});
export const GILDED_REVELATION_STACKS = new Buff({
  name: "Rite of Gilded Revelation", maxStacks: 3,
  apply: () => {
    addStat(Stat.DmgBonus, 10 * stacks(), Attribute.Spectro);
    if (casting(Cast.Liberation) && stacks() >= 3) addStat(Stat.DmgBonus, 40, Type1.Basic);
  },
  convert: () => { if (casting(Cast.Outro)) revoke(GILDED_REVELATION_STACKS); },
});
