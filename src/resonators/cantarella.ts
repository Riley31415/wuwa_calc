/**
 * Cantarella — a havoc support/healer. Trance (forte1, gained by Intro/Basic 3/Skill/Lib)
 * gates a Heavy Attack into Delusive Dive, opening Mirage: Basic becomes Phantom Sting, Mid-air
 * becomes Abysmal Vortex, Dodge Counter becomes Shadowy Sweep, Skill becomes Flickering Reverie
 * — each of those hits spends 1 Trance for 1 Shiver (forte2). At 3 Shiver, Skill becomes
 * Perception Drain instead, spending all of it. Healing is out of scope for this calculator —
 * "Cure" and the Trance-consuming heals are left out entirely.
 *
 * Numbers from nanoka.cc (character 1607, weapon 21050056, echo 6000082); cross-checked
 * against the migrated sheet's rows. Two deliberate departures from the sheet:
 *
 * - Its `FSkill` row (Perception Drain) is placed twice in the rotation, once before any
 *   Shiver could exist. The first press can only be Flickering Reverie (`ESkill`) — swapped
 *   in below, since the sheet's own Shiver math doesn't support Perception Drain that early.
 * - Phantom Sting stage 3's own multiplier disagrees with the page (145.86% vs the page's
 *   258.48%, 64.62%*4) — the page is trusted per the standing rule, and the "3 Coordinated
 *   Attacks" it separately triggers are folded into that same total rather than split out,
 *   since the page gives no separate number for them.
 *
 * Diffusion (21 Dreamweaver hits over 30s) has no real per-second clock here, so — matching
 * the sheet's own approach — it's one lump action carrying all 21 hits, tagged `type2:
 * COORDINATED` rather than modelled as a live summon queue.
 */
import { Buff, GlobalBuff, Gear, Action, Chain, PRIORITY } from "../kit.js";
import type { ActionDef } from "../kit.js";
import {
  add, action, counter, grantSelf, setStacksGlobal, stacksOf, revoke, removeStack,
  outro, queue, slotsWith,
  isOutro, isEcho,
} from "../state.js";
import { Stat, Element, DamageType, Type2, Node, Resource, Cast, Scaling } from "../stats.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";
import { HERON, ACTION_HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC } from "../shared/echoes.js";

/* --------------------------------------------------------------- resonator */

export const CANTARELLA = new Gear(() => {
  add(100, Stat.Er);
  add(5, Stat.CritRate);
  add(150, Stat.CritDmg);

  add(11600, Stat.BaseHp);
  add(400, Stat.BaseAtk);
  add(1100, Stat.BaseDef);
  add(8, Stat.CritRate);
  add(12, Stat.BonusAtk);

  if (isEcho(action()!)) grantSelf(POISON);
  return "Cantarella";
}, null, Element.Havoc, () => (stacksOf(MIRAGE) ? EIntro : Intro));

/** "Poison" (Inherent Skill): Echo Skill cast stacks Havoc DMG Bonus twice over (6% a stack,
 *  10s) — lost after the outro action gains stats. */
export const POISON = new Buff(PRIORITY.BUFF_STATS, (stacks) => {
  add(6 * stacks, Element.Havoc, Stat.DmgBonus);
  if (isOutro(action()!)) revoke(POISON);
  return `Cantarella: "Poison" x${stacks}`;
}, 2);

/** Abyssal Rebirth: after her Intro, up to 6 times, any team member's Echo Skill cast restores
 *  her 6 Concerto — echoes are assumed unique, so every Echo Skill cast counts, no per-name
 *  tracking. Global, so it can react no matter whose turn the Echo cast lands on — only
 *  Cantarella's own Concerto actually moves. 25s duration, ≥20s, so per the standing rule it's
 *  never lost once granted; the 6-charge cap is what actually bounds it. */
export const ABYSSAL_REBIRTH = new GlobalBuff(PRIORITY.UPDATE_BUFFS, () => {
  if (!isEcho(action()!)) return;
  const [cantarella] = slotsWith(CANTARELLA);
  if (cantarella) cantarella.setCounter(Resource.Concerto, cantarella.counter(Resource.Concerto) + 6);
  removeStack(ABYSSAL_REBIRTH, 1);
  return "Cantarella: Abyssal Rebirth";
}, 6);

/* ------------------------------------------------------------------ weapon */

/**
 * Whispers of Sirens, R1: From the Deep. +12% ATK flat. Gentle Dream: an Echo Skill cast
 * within 10s of an Intro/Basic grants a stack, up to two (echoes are assumed unique, so no
 * per-name tracking) — same "stays ready" approximation as Qiuyuan's Bamboo Cleaver, and the
 * same one-buff-three-levels shape (1 ready, 2/3 the real stacks). Stack 1 pays +40% Basic
 * Attack DMG Bonus, stack 2 also ignores 12% Havoc RES. Lost entirely if she's switched off
 * field.
 */
export const WHISPERS_OF_SIRENS = new Gear((stacks, a) => {
  add(500, Stat.BaseAtk);
  add(72, Stat.CritDmg);
  add(12, Stat.BonusAtk);

  const gentle = stacksOf(GENTLE_DREAM);
  if (a.cast === DamageType.Intro || a.cast === DamageType.Basic) {
    if (!gentle) grantSelf(GENTLE_DREAM);
  }
  return "Whispers of Sirens";
});

export const GENTLE_DREAM = new Buff(PRIORITY.BUFF_STATS, (stacks, a) => {
  if (!a.active) { revoke(GENTLE_DREAM); return; }
  if (isEcho(a)) grantSelf(GENTLE_DREAM);
  const held = stacksOf(GENTLE_DREAM);
  if (held < 2) return;
  add(40, DamageType.Basic, Stat.DmgBonus);
  if (held >= 3) add(12, Element.Havoc, Stat.ResIgnore);
  return `Whispers of Sirens: Gentle Dream x${held - 1}`;
}, 3);

/* -------------------------------------------------------------- echo, sonata */

/** Lorelei, her mainslot echo — flat Havoc/Basic DMG Bonus for whoever wears it, no trigger. */
export const LORELEI = new Gear(() => {
  add(12, Element.Havoc, Stat.DmgBonus);
  add(12, DamageType.Basic, Stat.DmgBonus);
  return "Lorelei";
});

export const ACTION_LORELEI = new Action("Echo: Lorelei", {
  cast: DamageType.Echo,
  element: Element.Havoc,
  scaling: Scaling.Atk,
  type: DamageType.Echo,
  mv: 405,
  energy: 5.62,
});

export const MIDNIGHT_VEIL_2PC = new Gear(() => { add(10, Element.Havoc, Stat.DmgBonus); return "Midnight Veil 2pc"; });

/** Midnight Veil 5pc: her own outro also fires a 480% Havoc burst (its own follow-up action,
 *  queued the way a resonator's own Lib follow-ups are) and hands the incoming resonator +15%
 *  Havoc DMG Bonus for 15s via the same outro-queue handoff every other outro buff uses. */
export const MIDNIGHT_VEIL_5PC = new Gear(() => {
  if (isOutro(action()!)) {
    queue(ACTION_MIDNIGHT_VEIL_BURST);
    outro(MIDNIGHT_VEIL_HANDOFF);
  }
  return "Midnight Veil 5pc";
});

export const ACTION_MIDNIGHT_VEIL_BURST = new Action("Midnight Veil 5pc: Outro", {
  element: Element.Havoc, scaling: Scaling.Atk, type: DamageType.Outro, mv: 480,
});

export const MIDNIGHT_VEIL_HANDOFF = new Buff(PRIORITY.BUFF_STATS, (stacks, a) => {
  add(15, Element.Havoc, Stat.DmgBonus);
  if (isOutro(a)) revoke(MIDNIGHT_VEIL_HANDOFF);
  return "Midnight Veil 5pc: Outro";
});

/** Her echoes: Heron mainslot, full 5pc Moonlit Clouds (both its 2pc and 5pc bonuses, same as
 *  Sanhua's own loadout) — both generic gear, reused as-is. 43311 crit-rate build; she scales
 *  off ATK like everything else here. */
export const LOADOUT = [
  CANTARELLA, WHISPERS_OF_SIRENS, HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC,
  mainstats("CR", "havoc havoc", "atk atk"),
  chem("atk", "basic"),
];

/* ----------------------------------------------------------------- actions */

function cantaAction(name: string, def: ActionDef): Action {
  return new Action(`Cantarella: ${name}`, {
    element: Element.Havoc,
    scaling: Scaling.Atk,
    ...def,
  });
}

// --- basics, mid-air, dodge counter — outside Mirage
const BA1 = cantaAction("Basic 1", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 79.53, energy: 1, concerto: 3.2 });
const BA2 = cantaAction("Basic 2", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 145.76, energy: 1.84, concerto: 3.68 });
const BA3 = cantaAction("Basic 3", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 145.14, energy: 1.84, concerto: 3.66, forte1: 1 });
const MA = cantaAction("Midair", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 104.98, energy: 1.32, concerto: 2.64 });
const HA = cantaAction("Heavy", { node: Node.Normal, cast: DamageType.Heavy, type: DamageType.Heavy, mv: 114.36, energy: 1.44, concerto: 2.88 });
const DC = cantaAction("Dodge Counter", { node: Node.Normal, cast: Cast.DodgeCounter, type: DamageType.Heavy, mv: 212.04, energy: 2.65, concerto: 5.31 });

export const BA123 = new Chain("Cantarella: Basic 123", [BA1, BA2, BA3]);

/** Mirage: opened by Delusive Dive (below), not just holding Trance — Intro/Basic 3/Skill/Lib
 *  all bank Trance without it. Ends when Trance depletes, or on the 8s real duration this
 *  engine has no clock for — approximated the same way as her other short states, lost after
 *  the outro action gains stats. */
export const MIRAGE = new Buff(PRIORITY.BUFF_STATS, () => {
  if (!counter(Resource.Forte1) || isOutro(action()!)) { revoke(MIRAGE); return; }
  return "Cantarella: Mirage";
});

// --- Mirage: Delusive Dive (Heavy) opens it; Phantom Sting/Abysmal Vortex/Shadowy Sweep each
//     spend 1 Trance for 1 Shiver
const EHA = cantaAction("Mirage Heavy", {
  node: Node.Normal, cast: DamageType.Heavy, type: DamageType.Heavy, mv: 106.1, energy: 1.68, concerto: 3.34,
  priority: PRIORITY.UPDATE_BUFFS,
  apply() { grantSelf(MIRAGE); },
});
export const FBA1 = cantaAction("Mirage Basic 1", { node: Node.Forte, cast: DamageType.Basic, type: DamageType.Basic, mv: 105.99, energy: 1.35, concerto: 2.67, forte1: -1, forte2: 1 });
export const FBA2 = cantaAction("Mirage Basic 2", { node: Node.Forte, cast: DamageType.Basic, type: DamageType.Basic, mv: 125.86, energy: 1.6, concerto: 3.18, forte1: -1, forte2: 1 });
export const FBA3 = cantaAction("Mirage Basic 3", { node: Node.Forte, cast: DamageType.Basic, type: DamageType.Basic, type2: Type2.Coordinated, mv: 258.48, energy: 3.28, concerto: 6.52, forte1: -1, forte2: 1 });
const FMA = cantaAction("Mirage Plunge", { node: Node.Forte, cast: DamageType.Basic, type: DamageType.Basic, mv: 104.98, energy: 1.32, concerto: 2.64, forte1: -1, forte2: 1 });
const FDC = cantaAction("Mirage Dodge Counter", { node: Node.Forte, cast: Cast.DodgeCounter, type: DamageType.Heavy, mv: 225.27, energy: 2.82, concerto: 5.65, forte1: -1, forte2: 1 });

export const FBA123 = new Chain("Cantarella: Mirage Basic 123", [FBA1, FBA2, FBA3]);

// --- resonance skill: Graceful Step outside Mirage, Flickering Reverie in it (also counts as
//     an Echo Skill cast), Perception Drain at 3 Shiver (spends it all, also counts as Echo)
const Skill = cantaAction("Skill", { node: Node.Skill, cast: DamageType.Skill, type: DamageType.Skill, mv: 147.2, energy: 1.56, concerto: 10, forte1: 1 });
const ESkill = cantaAction("Mirage Skill", {
  node: Node.Skill, cast: DamageType.Skill, cast2: DamageType.Echo, type: DamageType.Skill, mv: 196.23, energy: 1.65, concerto: 10,
  priority: PRIORITY.UPDATE_BUFFS,
  apply() { grantSelf(HAZY_DREAM); },
});
export const ESKILL_JOLT = cantaAction("Jolt", { node: Node.Skill, type: DamageType.Basic, mv: 198.81 });

/** Hazy Dream: whichever of her own hits lands next removes it and triggers Jolt — except a
 *  Coordinated Attack, which the kit says can't Jolt, so it's left standing for the next real
 *  hit. Skips the Flickering Reverie cast that applied it, in case draining runs it same-turn. */
export const HAZY_DREAM = new Buff(PRIORITY.UPDATE_BUFFS, (stacks, a) => {
  if (a === ESkill || a.type2 === Type2.Coordinated) return;
  revoke(HAZY_DREAM);
  queue(ESKILL_JOLT);
  return "Cantarella: Hazy Dream (watcher)";
});
const FSkill = cantaAction("Forte Skill", { node: Node.Forte, cast: DamageType.Skill, cast2: DamageType.Echo, type: DamageType.Basic, mv: 1335.98, energy: 21.1, concerto: 12, forte2: -3 });

// --- liberation: Flowing Suffocation, also counts as an Echo Skill cast; Diffusion follows as
//     one lump action for all 21 Dreamweaver hits, tagged type2: COORDINATED
const Liberation = cantaAction("Liberation", {
  node: Node.Liberation, cast: DamageType.Liberation, cast2: DamageType.Echo, type: DamageType.Basic, mv: 376, energy: -125, concerto: 20, forte1: 3,
});
/** Diffusion's 21 Dreamweaver hits, lumped into one action (see the file header) and cashed
 *  in on her outro rather than placed mid-rotation — off-screen summons, not her own strike,
 *  hence inactive. */
export const ACTION_DIFFUSION = cantaAction("Coordinated Attacks x21", {
  node: Node.Liberation, type: DamageType.Basic, type2: Type2.Coordinated, mv: 305.34, active: false,
});

// --- intro / outro
const Intro = cantaAction("Intro", {
  node: Node.Intro, cast: DamageType.Intro, type: DamageType.Intro, mv: 169, energy: 3.16, concerto: 10, forte1: 1,
  priority: PRIORITY.UPDATE_BUFFS,
  // a fresh Intro tops the charge count back up to 6 rather than adding to whatever's left
  apply() { setStacksGlobal(ABYSSAL_REBIRTH, 6); },
});
const EIntro = cantaAction("Tidal Surge", {
  node: Node.Intro, cast: DamageType.Intro, type: DamageType.Intro, mv: 169, energy: 3.35, concerto: 10, forte1: 1,
});
const Outro = cantaAction("Outro", {
  cast: DamageType.Outro, type: DamageType.Outro, mv: 0, concerto: -100, active: false,
  priority: PRIORITY.UPDATE_BUFFS,
  apply() { queue(ACTION_DIFFUSION); outro(CANTARELLA_OUTRO); },
});
export const CANTARELLA_OUTRO = new Buff(PRIORITY.BUFF_STATS, (stacks, a) => {
  if (isOutro(a)) revoke(CANTARELLA_OUTRO);
  add(20, Element.Havoc, Stat.Amp);
  add(25, DamageType.Skill, Stat.Amp);
  return "Cantarella: Outro";
});

/** The sheet's `canta mv` rotation, with the first Mirage Skill press corrected to Flickering
 *  Reverie (see the file header) — Perception Drain only becomes valid once Phantom Sting 123
 *  has actually banked 3 Shiver. Jolt and Diffusion are both queued by their own triggers
 *  (Hazy Dream and the outro), not placed here. Intro is no longer placed here either — the
 *  preceding member's outro triggers it, plain or Tidal Surge (see `onIntro`). */
export const ROTATION = [
  Skill, EHA, ESkill, ACTION_HERON, Liberation,
  FBA123, FSkill, Outro,
];
