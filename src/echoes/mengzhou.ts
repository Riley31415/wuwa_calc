/** Mainslot echoes and sonatas from Mengzhou (versions 3.5-3.8) — see echoes/jinzhou.ts for the
 *  region split's own rationale. Each resonator's own file picks which of these its loadout
 *  equips. */
import { Buff, Gear, Mainslot, Action, PRIORITY } from "../kit.js";
import { DamageType, Cast, Element, Scaling, Stat } from "../stats.js";
const { Echo } = DamageType;
const { Fusion } = Element;
const { DmgBonus, BonusHp, CritRate } = Stat;

/* ------------------------------------------------------------------------------ Jingran, 3.6 */

/** Myriad Snare, Jingran's own mainslot echo — flat Fusion/Heavy Attack DMG Bonus for whoever
 *  wears it, no trigger. Jingran, released 3.6 (his own nanoka.cc character page still reads
 *  "Stay tuned" as of this writing — no numeric character ID cited here for that reason, see
 *  jingran.ts). */
export const ACTION_MYRIAD_SNARE = new Action("Echo: Myriad Snare", {
  cast: Cast.Echo, element: Fusion, scaling: Scaling.Hp, type: Echo, mv: 17.23, energy: 380,
});
export const MYRIAD_SNARE = new Mainslot("Myriad Snare", ACTION_MYRIAD_SNARE, (ctx) => {
  ctx.add(12, Fusion, DmgBonus);
  ctx.add(12, DamageType.Heavy, DmgBonus);
});

/** Lamp of Nether Road, Jingran's own sonata (paired directly with Myriad Snare above). 5pc: a
 *  shield grants 5% crit rate, four stacks, full four pay 15% fusion damage on top. 2pc: +10%
 *  Bonus HP flat. */
export const LAMP_5PC = new Gear("Lamp of Nether Road 5pc", (ctx) => {
  if (ctx.shields) ctx.grantSelf(LAMP_STACKS, ctx.shields);
});
export const LAMP_STACKS = new Buff(PRIORITY.BUFF_STATS, (ctx, stacks) => {
  ctx.add(5 * stacks, CritRate);
  if (stacks >= 4) ctx.add(15, Fusion, DmgBonus);
  return `Lamp of Nether Road x${stacks}`;
}, 4);
export const LAMP_2PC = new Gear("Lamp of Nether Road 2pc", (ctx) => { ctx.add(10, BonusHp); });
