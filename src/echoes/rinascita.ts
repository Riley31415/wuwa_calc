/**
 * Mainslot echoes and sonatas from Rinascita (versions 2.0-2.4), ported to the new engine. See
 * src/echoes/rinascita.ts for the original — each resonator's own file picks which of these its
 * loadout equips.
 */
import {
  Buff, Mainslot, Action, Stat, Element, Type1, Cast, Scaling,
  addStat, stacks, applySelf, applyTeam, casting, revoke, get, queue, queueOutro,
} from "../kit.js";

/* ----------------------------------------------------------------------------- Carlotta, 2.0 */

/** Sentry Construct, Carlotta's own mainslot echo — flat Glacio/Resonance Skill DMG Bonus for
 *  whoever wears it, no trigger. */
export const ACTION_SENTRY_CONSTRUCT = new Action("Echo - Sentry Construct", {
  cast: Cast.Echo, element: Element.Glacio, scaling: Scaling.Atk, type: Type1.Echo, mv: 405,
});
export const SENTRY_CONSTRUCT = new Mainslot({
  name: "Sentry Construct",
  action: ACTION_SENTRY_CONSTRUCT,
  apply: () => { addStat(Stat.DmgBonus, 12, Element.Glacio); addStat(Stat.DmgBonus, 12, Type1.Skill); },
});

/** Frosty Resolve, Carlotta's own sonata (also carried by Empyrean Anthem's Overlord-class
 *  echoes). 2pc: +12% Resonance Skill DMG Bonus flat. 5pc: a Resonance Skill cast grants +22.5%
 *  Glacio DMG Bonus for 15s; a Resonance Liberation cast grants +18% Resonance Skill DMG Bonus
 *  for 5s, up to 2 stacks — both short windows, lost after the outro action gains stats. */
export const FROSTY_RESOLVE_2PC = new Buff({
  name: "Frosty Resolve 2pc", apply: () => addStat(Stat.DmgBonus, 12, Type1.Skill),
});
export const FROSTY_RESOLVE_GLACIO = new Buff({
  name: "Frosty Resolve 5pc: Glacio",
  apply: () => addStat(Stat.DmgBonus, 22.5, Element.Glacio),
  convert: () => { if (casting(Cast.Outro)) revoke(FROSTY_RESOLVE_GLACIO); },
});
export const FROSTY_RESOLVE_SKILL_DMG = new Buff({
  name: "Frosty Resolve 5pc: Resonance Skill", maxStacks: 2,
  apply: () => addStat(Stat.DmgBonus, 18 * stacks(), Type1.Skill),
  convert: () => { if (casting(Cast.Outro)) revoke(FROSTY_RESOLVE_SKILL_DMG); },
});
export const FROSTY_RESOLVE_5PC = new Buff({
  name: "Frosty Resolve 5pc",
  update: () => {
    if (casting(Cast.Skill)) applySelf(FROSTY_RESOLVE_GLACIO, 1);
    if (casting(Cast.Liberation)) applySelf(FROSTY_RESOLVE_SKILL_DMG, 1);
  },
});

/* ------------------------------------------------------------------------------- Roccia, 2.0 */

/** Nightmare: Impermanence Heron, Roccia's own mainslot echo — flat Havoc/Heavy Attack DMG
 *  Bonus for whoever wears it, no trigger. */
export const ACTION_NM_HERON = new Action("Echo - Nightmare: Impermanence Heron", {
  cast: Cast.Echo, element: Element.Havoc, scaling: Scaling.Atk, type: Type1.Echo, mv: 405,
});
export const NM_HERON = new Buff({
  name: "Nightmare: Impermanence Heron",
  apply: () => { addStat(Stat.DmgBonus, 12, Element.Havoc); addStat(Stat.DmgBonus, 12, Type1.Heavy); },
});

/* ---------------------------------------------------------------------------- Cantarella, 2.2 */

/** Lorelei, Cantarella's own mainslot echo — flat Havoc/Basic DMG Bonus for whoever wears it,
 *  no trigger. */
export const ACTION_LORELEI = new Action("Echo - Lorelei", {
  cast: Cast.Echo, element: Element.Havoc, scaling: Scaling.Atk, type: Type1.Echo, mv: 405,
});
export const LORELEI = new Buff({
  name: "Lorelei",
  apply: () => { addStat(Stat.DmgBonus, 12, Element.Havoc); addStat(Stat.DmgBonus, 12, Type1.Basic); },
});

/** Midnight Veil, Cantarella's own sonata — also reused by Roccia and Phrolova. 2pc: +10% Havoc
 *  DMG Bonus flat. 5pc: her own outro also fires a 480% Havoc burst (queued like any other outro
 *  follow-up) and hands the incoming resonator +15% Havoc DMG Bonus for 15s via the outro-queue
 *  handoff. */
export const MIDNIGHT_VEIL_2PC = new Buff({
  name: "Midnight Veil 2pc", apply: () => addStat(Stat.DmgBonus, 10, Element.Havoc),
});
export const ACTION_MIDNIGHT_VEIL_BURST = new Action("Midnight Veil 5pc - Outro", {
  element: Element.Havoc, scaling: Scaling.Atk, type: Type1.Outro, mv: 480,
});
export const MIDNIGHT_VEIL_HANDOFF = new Buff({
  name: "Midnight Veil 5pc: Outro",
  apply: () => addStat(Stat.DmgBonus, 15, Element.Havoc),
  // plain 15s window, so it still counts on the wearer's own outro (see jinzhou.ts's
  // HERON_HANDOFF for the same shape)
  convert: () => { if (casting(Cast.Outro)) revoke(MIDNIGHT_VEIL_HANDOFF); },
});
export const MIDNIGHT_VEIL_5PC = new Buff({
  name: "Midnight Veil 5pc",
  update: () => {
    if (casting(Cast.Outro)) { queue(ACTION_MIDNIGHT_VEIL_BURST); queueOutro(MIDNIGHT_VEIL_HANDOFF); }
  },
});

/* ---------------------------------------------------------------------------------- Brant, 2.1 */

/** Dragon of Dirge, Brant's own mainslot echo — flat Fusion/Basic Attack DMG Bonus for whoever
 *  wears it, no trigger. */
export const ACTION_DRAGON_OF_DIRGE = new Action("Echo - Dragon of Dirge", {
  cast: Cast.Echo, element: Element.Fusion, scaling: Scaling.Atk, type: Type1.Echo, mv: 36.81,
});
export const DRAGON_OF_DIRGE = new Buff({
  name: "Dragon of Dirge",
  apply: () => { addStat(Stat.DmgBonus, 12, Element.Fusion); addStat(Stat.DmgBonus, 12, Type1.Basic); },
});

export const TIDEBREAKING_2PC = new Buff({ name: "Tidebreaking Courage 2pc", apply: () => addStat(Stat.Er, 10) });

/** Tidebreaking Courage 5pc: +15% ATK flat, and +30% (unscoped) DMG Bonus once Energy Regen
 *  actually reaches 250% — a real threshold read off the total via convert(), so every other ER
 *  contribution (the 2pc, mainstats, substats) has already landed this action before it reads it. */
export const TIDEBREAKING_5PC = new Buff({
  name: "Tidebreaking Courage 5pc",
  apply: () => addStat(Stat.BonusAtk, 15),
  convert: () => { if (get(Stat.Er) >= 250) addStat(Stat.DmgBonus, 30); },
});

/* ----------------------------------------------------------------------------------- Lupa, 2.4 */

/** Lioness of Glory, Lupa's own mainslot echo — flat Resonance Liberation/Fusion DMG Bonus for
 *  whoever wears it, no trigger. */
export const ACTION_LIONESS = new Action("Echo - Lioness of Glory", {
  cast: Cast.Echo, element: Element.Fusion, scaling: Scaling.Atk, type: Type1.Echo, mv: 273.6,
});
export const LIONESS_OF_GLORY = new Buff({
  name: "Lioness of Glory",
  apply: () => { addStat(Stat.DmgBonus, 12, Type1.Liberation); addStat(Stat.DmgBonus, 12, Element.Fusion); },
});

/** Flaming Clawprint, Lupa's own sonata — also reused by Galbrena. 5pc: +20% Resonance
 *  Liberation DMG Bonus self, +15% Fusion DMG Bonus team-wide. 2pc: +10% Fusion DMG Bonus flat. */
export const CLAWPRINT_TEAM = new Buff({
  name: "Flaming Clawprint", apply: () => addStat(Stat.DmgBonus, 15, Element.Fusion),
});
export const CLAWPRINT_5PC = new Buff({
  name: "Flaming Clawprint 5pc",
  update: () => applyTeam(CLAWPRINT_TEAM, 1),
  apply: () => addStat(Stat.DmgBonus, 20, Type1.Liberation),
});
export const CLAWPRINT_2PC = new Buff({ name: "Flaming Clawprint 2pc", apply: () => addStat(Stat.DmgBonus, 10, Element.Fusion) });
