/** Mainslot echoes and sonatas from Rinascita (versions 2.0-2.4) — see echoes/jinzhou.ts for
 *  the region split's own rationale. Each resonator's own file picks which of these its loadout
 *  equips. */
import { isOutro, isSkill, isLiberation } from "../state.js";
import { Buff, GlobalBuff, Gear, Mainslot, Action, PRIORITY } from "../kit.js";
import { DamageType, Cast, Element, Scaling, Stat } from "../stats.js";
const { Echo } = DamageType;
const { Glacio, Havoc, Fusion } = Element;
const { Atk } = Scaling;
const { DmgBonus, BonusAtk, Er } = Stat;

/* ----------------------------------------------------------------------------- Carlotta, 2.0 */

/** Sentry Construct, Carlotta's own mainslot echo — she's the only glacio pistols Resonance-
 *  Skill character, so it lives here rather than as a truly generic piece. Flat Glacio/
 *  Resonance Skill DMG Bonus for whoever wears it, no trigger. Carlotta, character 1107,
 *  released 2.0 — https://ww.nanoka.cc/character/1107, https://ww.nanoka.cc/echo/6000083 */
export const ACTION_SENTRY_CONSTRUCT = new Action("Echo: Sentry Construct", {
  cast: Cast.Echo,
  element: Glacio,
  scaling: Atk,
  type: Echo,
  mv: 405,
  energy: 562,
});
export const SENTRY_CONSTRUCT = new Mainslot("Sentry Construct", ACTION_SENTRY_CONSTRUCT, (ctx) => {
  ctx.add(12, Glacio, DmgBonus);
  ctx.add(12, DamageType.Skill, DmgBonus);
});

/** Frosty Resolve, Carlotta's own sonata (the same Overlord Class echo as Empyrean Anthem —
 *  Nightmare: Lampylumen Myriad/Sentry Construct, both cost-4 Overlords, can carry either set).
 *  2pc: +12% Resonance Skill DMG Bonus flat. 5pc: a Resonance Skill cast (either form) grants
 *  +22.5% Glacio DMG Bonus for 15s (short window, standard outro-loss handling); a Resonance
 *  Liberation cast separately grants +18% Resonance Skill DMG Bonus for 5s, up to 2 stacks. */
export const FROSTY_RESOLVE_2PC = new Gear("Frosty Resolve 2pc", (ctx) => { ctx.add(12, DamageType.Skill, DmgBonus); });
export const FROSTY_RESOLVE_5PC = new Gear("Frosty Resolve 5pc", (ctx) => {
  if (isSkill(ctx.action!)) ctx.grantSelf(FROSTY_RESOLVE_GLACIO);
  if (isLiberation(ctx.action!)) ctx.grantSelf(FROSTY_RESOLVE_SKILL_DMG);
});
export const FROSTY_RESOLVE_GLACIO = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(22.5, Glacio, DmgBonus);
  if (isOutro(ctx.action!)) ctx.revoke(FROSTY_RESOLVE_GLACIO);
  return "Frosty Resolve 5pc";
});
export const FROSTY_RESOLVE_SKILL_DMG = new Buff(PRIORITY.BUFF_STATS, (ctx, stacks) => {
  ctx.add(18 * stacks, DamageType.Skill, DmgBonus);
  if (isOutro(ctx.action!)) ctx.revoke(FROSTY_RESOLVE_SKILL_DMG);
  return `Frosty Resolve 5pc x${stacks}`;
}, 2);

/* ------------------------------------------------------------------------------- Roccia, 2.0 */

/** Nightmare: Impermanence Heron, Roccia's own mainslot echo — a 10-hit combo (lumped into one
 *  action, same treatment as every other multi-hit echo/summon elsewhere), flat Havoc/Heavy
 *  Attack DMG Bonus for whoever wears it, no trigger. Roccia, character 1606, released 2.0 —
 *  https://ww.nanoka.cc/character/1606, https://ww.nanoka.cc/echo/6000087 */
export const ACTION_NM_HERON = new Action("Echo: Nightmare: Impermanence Heron", {
  cast: Cast.Echo,
  element: Havoc,
  scaling: Atk,
  type: Echo,
  mv: 405,
  energy: 560,
});
export const NM_HERON = new Mainslot("Nightmare: Impermanence Heron", ACTION_NM_HERON, (ctx) => {
  ctx.add(12, Havoc, DmgBonus);
  ctx.add(12, DamageType.Heavy, DmgBonus);
});

/* ---------------------------------------------------------------------------- Cantarella, 2.2 */

/** Lorelei, Cantarella's own mainslot echo — flat Havoc/Basic DMG Bonus for whoever wears it,
 *  no trigger. Cantarella, character 1607, released 2.2 — https://ww.nanoka.cc/character/1607,
 *  https://ww.nanoka.cc/echo/6000082 */
export const ACTION_LORELEI = new Action("Echo: Lorelei", {
  cast: Cast.Echo,
  element: Havoc,
  scaling: Atk,
  type: Echo,
  mv: 405,
  energy: 562,
});
export const LORELEI = new Mainslot("Lorelei", ACTION_LORELEI, (ctx) => {
  ctx.add(12, Havoc, DmgBonus);
  ctx.add(12, DamageType.Basic, DmgBonus);
});

/** Midnight Veil, Cantarella's own sonata — also reused by Roccia and Phrolova (both havoc,
 *  both happy to lean on the 2pc alone). 2pc: +10% Havoc DMG Bonus flat. 5pc: her own outro
 *  also fires a 480% Havoc burst (its own follow-up action, queued the way a resonator's own
 *  Lib follow-ups are) and hands the incoming resonator +15% Havoc DMG Bonus for 15s via the
 *  same outro-queue handoff every other outro buff uses. */
export const MIDNIGHT_VEIL_2PC = new Gear("Midnight Veil 2pc", (ctx) => { ctx.add(10, Havoc, DmgBonus); });
export const MIDNIGHT_VEIL_5PC = new Gear("Midnight Veil 5pc", (ctx) => {
  if (isOutro(ctx.action!)) {
    ctx.queue(ACTION_MIDNIGHT_VEIL_BURST);
    ctx.outro(MIDNIGHT_VEIL_HANDOFF);
  }
});
export const ACTION_MIDNIGHT_VEIL_BURST = new Action("Midnight Veil 5pc: Outro", {
  element: Havoc, scaling: Atk, type: DamageType.Outro, mv: 480,
});
export const MIDNIGHT_VEIL_HANDOFF = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(15, Havoc, DmgBonus);
  if (isOutro(ctx.action!)) ctx.revoke(MIDNIGHT_VEIL_HANDOFF);
  return "Midnight Veil 5pc: Outro";
});

/* ---------------------------------------------------------------------------------- Brant, 2.1 */

/** Dragon of Dirge, Brant's own mainslot echo — flat Fusion/Basic Attack DMG Bonus for whoever
 *  wears it, no trigger. The echo's own cast (Grief Rift) is a 5s/25s-cooldown periodic zone
 *  with no real per-second clock here, so this is just the one tick nanoka gives a number for.
 *  Brant, character 1206, released 2.1 — https://ww.nanoka.cc/character/1206,
 *  https://ww.nanoka.cc/echo/6000084 */
export const ACTION_DRAGON_OF_DIRGE = new Action("Echo: Dragon of Dirge", {
  cast: Cast.Echo, element: Fusion, scaling: Atk, type: Echo, mv: 36.81, energy: 51,
});
export const DRAGON_OF_DIRGE = new Mainslot("Dragon of Dirge", ACTION_DRAGON_OF_DIRGE, (ctx) => {
  ctx.add(12, Fusion, DmgBonus);
  ctx.add(12, DamageType.Basic, DmgBonus);
});

export const TIDEBREAKING_2PC = new Gear("Tidebreaking Courage 2pc", (ctx) => { ctx.add(10, Er); });

/** Tidebreaking Courage 5pc: +15% ATK flat, and +30% (unscoped) DMG Bonus once Energy Regen
 *  actually reaches 250% — a real threshold read off the total, not assumed. EARLY_CONVERSION
 *  (overriding Gear's default GEAR_STATS) so every other ER contribution — the 2pc, mainstats,
 *  substats, all listed after this piece in the loadout — has already landed before it reads
 *  `get(ER)`. */
export const TIDEBREAKING_5PC = new Gear("Tidebreaking Courage 5pc", (ctx) => {
  ctx.add(15, BonusAtk);
  if (ctx.get(Er) >= 250) ctx.add(30, DmgBonus);
}, null, null, null, PRIORITY.EARLY_CONVERSION);

/* ----------------------------------------------------------------------------------- Lupa, 2.4 */

/** Lioness of Glory, Lupa's own mainslot echo — flat Resonance Liberation/Fusion DMG Bonus for
 *  whoever wears it, no trigger. Lupa, character 1207, released 2.4 —
 *  https://ww.nanoka.cc/character/1207 */
export const ACTION_LIONESS = new Action("Echo: Lioness of Glory", {
  cast: Cast.Echo, element: Fusion, scaling: Atk, type: Echo, mv: 273.6, energy: 380,
});
export const LIONESS_OF_GLORY = new Mainslot("Lioness of Glory", ACTION_LIONESS, (ctx) => {
  ctx.add(12, DamageType.Liberation, DmgBonus);
  ctx.add(12, Fusion, DmgBonus);
});

/** Flaming Clawprint, Lupa's own sonata — also reused by Galbrena (echoes/septimont.ts, both
 *  fusion). 5pc: +20% Resonance Liberation DMG Bonus self, +15% Fusion DMG Bonus team-wide.
 *  2pc: +10% Fusion DMG Bonus flat. */
export const CLAWPRINT_TEAM = new GlobalBuff(PRIORITY.BUFF_STATS,
  (ctx) => { ctx.add(15, Fusion, DmgBonus); return "Flaming Clawprint"; });
export const CLAWPRINT_5PC = new Gear("Flaming Clawprint 5pc", (ctx) => {
  ctx.add(20, DamageType.Liberation, DmgBonus);
  ctx.grantGlobal(CLAWPRINT_TEAM);
});
export const CLAWPRINT_2PC = new Gear("Flaming Clawprint 2pc", (ctx) => { ctx.add(10, Fusion, DmgBonus); });
