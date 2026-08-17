/**
 * Zhezhi — a glacio Coordinated-Attack support/sub-DPS, similar shape to Cantarella: her
 * Liberation (Living Canvas) opens a passive 30s window where Inklit Spirits perform
 * Coordinated Attacks off the *active* resonator's own hits — one lump action for the whole
 * 21-hit window (`ACTION_LIB_COORDS`), same treatment as Cantarella's Diffusion.
 *
 * Afflatus (forte1, up to 90) gates her forte chain: at 60+, Resonance Skill (Manifestation)
 * summons Phantasmic Imprint - Left/Right (spending 60); at 30+, the Heavy Attack - Conjuration
 * follow-up summons Phantasmic Imprint - Middle (spending 30). With an Imprint nearby, Resonance
 * Skill is replaced by Stroke of Genius (removes one, grants a Painter's Delight stack, up to 2);
 * at 2 stacks, it's replaced again by Creation's Zenith (removes one, spends every stack). Live
 * Imprint tracking isn't simulated — same as Buling's Trigram queue — the rotation below just
 * places Skill, then the Heavy Attack follow-up, then Stroke of Genius twice, then Creation's
 * Zenith by hand, in the order that's actually kit-valid (opens exactly 3 Imprints, spends
 * exactly 3). Painter's Delight itself carries no stat of its own — pure gating, nothing here
 * reads it — so it isn't modelled as a buff at all, only what it gates (Creation's Zenith's own
 * cast) is.
 *
 * Calligrapher's Touch (Inherent Skill): +6% ATK a stack, up to 3, on casting Stroke of Genius
 * or Creation's Zenith — both share Resonance Skill's own `cast` tag, so one check covers every
 * form. Flourish (Inherent Skill): her Outro restores 15 Energy to the incoming resonator
 * directly (`nextSlot()`), not a buff.
 *
 * The migrated sheet's own `zz` rotation opens with three basics *before* Intro and places Intro
 * mid-sequence — an artifact of however it was authored, not real cast order (you can't attack
 * before intro-ing in) — so the actual order below is reconstructed from the kit text instead:
 * Intro (auto-triggered, not placed) grants ~45 Afflatus, three basics push it to 90+, Skill
 * spends 60 for the first two Imprints, the Heavy Attack follow-up spends the remaining 30 for
 * the third, two Strokes of Genius spend two of them, Creation's Zenith spends the last.
 *
 * "Zhezhi Matrix" (a `Mode`-category migration entry, ~25% self DMG Dealt / 30% team Skill DMG
 * Bonus) has no corresponding mechanic anywhere on her current nanoka.cc page — no resonance
 * mode, no chain-gated stance, nothing — so it reads as a stale/deprecated sheet entry rather
 * than a real kit piece, and is skipped entirely rather than copied in unconfirmed.
 *
 * Numbers from nanoka.cc (character 1105, echo 6000105, weapon 21050026) for every named hit's
 * MV — cross-checked against the migrated sheet's own multi-hit totals, all agreeing exactly.
 * Energy/concerto/offtune/Afflatus deltas aren't cleanly exposed on the page itself, so those
 * come from the migrated sheet directly, same gap other kits (Sanhua, Brant) have.
 */
import { Buff, GlobalBuff, Gear, Mainslot, Action, Chain, PRIORITY, WHITE, ECHO_CAST } from "../kit.js";
import type { ActionDef } from "../kit.js";
import { Resonator, Loadout, isOutro } from "../state.js";
import type { ResonatorFactory } from "../state.js";
import { Stat, Element, DamageType, Node, Cast, Resource, Type2, Scaling } from "../stats.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";
import { EMPYREAN_ANTHEM_2PC, EMPYREAN_ANTHEM_5PC } from "../shared/echoes.js";

/** This resonator's own color — every action from the wrapper below defaults to it. */
export const COLOR = "#8fd3e8";

/** The gauge the game shows — up to 90, spent 60/30 by the forte chain (see file header). */
export const ZHEZHI_AFFLATUS = Resource.Forte1;

/* --------------------------------------------------------------- resonator */

/** Calligrapher's Touch: +6% ATK a stack, up to 3, on Stroke of Genius or Creation's Zenith —
 *  both share Resonance Skill's own `cast` tag. 27s, so per the standing duration rule this is
 *  permanent uptime once granted, never revoked. */
export const CALLIGRAPHERS_TOUCH = new Buff(PRIORITY.BUFF_STATS, (ctx, stacks) => {
  ctx.add(6 * stacks, Stat.BonusAtk);
  return `Zhezhi: Calligrapher's Touch x${stacks}`;
}, 3);

/* ------------------------------------------------------------------ weapon */

/** Rime-Draped Sprouts, R1. +12% ATK flat. While on field, casting Resonance Skill (any of its
 *  forms) grants +12% Basic Attack DMG Bonus a stack, up to 3, 6s — short enough that only the
 *  standing outro-loss rule matters. At 3+ stacks, her own Outro spends them all for +52% Basic
 *  Attack DMG Bonus, 27s — permanent uptime once granted, and explicitly still up off-field per
 *  the weapon's own text, so no active check on the stat itself, only on gaining the first buff. */
export const RIME_DRAPED_SPROUTS = new Gear("Rime-Draped Sprouts", (ctx) => {
  const a = ctx.action!;
  ctx.add(500, Stat.BaseAtk);
  ctx.add(72, Stat.CritDmg);
  ctx.add(12, Stat.BonusAtk);
  if (a.active && a.cast === DamageType.Skill) ctx.grantSelf(PANORAMA_STACKS);
});
export const PANORAMA_STACKS = new Buff(PRIORITY.BUFF_STATS, (ctx, stacks) => {
  ctx.add(12 * stacks, DamageType.Basic, Stat.DmgBonus);
  if (isOutro(ctx.action!)) ctx.revoke(PANORAMA_STACKS);
  return `Rime-Draped Sprouts: Panorama x${stacks}`;
}, 3);
export const PANORAMA_OFFIELD = new Buff(PRIORITY.BUFF_STATS,
  (ctx) => { ctx.add(52, DamageType.Basic, Stat.DmgBonus); return "Rime-Draped Sprouts: Panorama"; });

/* -------------------------------------------------------------- echo, sonata */

export const ACTION_NM_LAMPY = new Action("Echo: Nightmare Lampylumen Myriad", {
  color: WHITE,
  cast: DamageType.Echo,
  element: Element.Glacio,
  scaling: Scaling.Atk,
  type: DamageType.Echo,
  mv: 273.6,
  energy: 380,
});

/** Nightmare: Lampylumen Myriad, her own mainslot echo — she's the only glacio Coordinated
 *  Attack character, so it lives here rather than shared/echoes.js. Flat Glacio/Coordinated
 *  Attack DMG Bonus for whoever wears it, no trigger. */
export const NM_LAMPY = new Mainslot("Nightmare: Lampylumen Myriad", ACTION_NM_LAMPY, (ctx) => {
  ctx.add(12, Element.Glacio, Stat.DmgBonus);
  ctx.add(30, Type2.Coordinated, Stat.DmgBonus);
});

/** Her echoes: Nightmare: Lampylumen Myriad mainslot, full 5pc Empyrean Anthem (both bonuses,
 *  shared/echoes.js). 43311 crit-rate build. */
const ZHEZHI_LOADOUT = new Loadout(
  RIME_DRAPED_SPROUTS, NM_LAMPY, EMPYREAN_ANTHEM_5PC, EMPYREAN_ANTHEM_2PC,
  mainstats("CR", "glacio glacio", "atk atk"), chem("atk", "basic"),
);

export class Zhezhi extends Resonator {
  constructor(loadout: Loadout) {
    super(
      "Zhezhi",
      Element.Glacio,
      () => Intro,
      loadout,
      (ctx) => {
        ctx.add(12250, Stat.BaseHp);
        ctx.add(375, Stat.BaseAtk);
        ctx.add(1198, Stat.BaseDef);
      },
      (ctx) => {
        ctx.add(8, Stat.CritRate);
        ctx.add(12, Stat.BonusAtk);
      },
    );
  }
}
export const LOADOUT: ResonatorFactory = () => new Zhezhi(ZHEZHI_LOADOUT);

/* ----------------------------------------------------------------- actions */

function zhezhiAction(name: string, def: ActionDef): Action {
  return new Action(name, {
    element: Element.Glacio,
    color: COLOR,
    scaling: Scaling.Atk,
    ...def,
  });
}

// --- basics, mid-air, dodge counter (Dimming Brush)
const BA1 = zhezhiAction("Basic 1", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 83.52, energy: 150, concerto: 480, offtune: 4800, forte1: 10 });
const BA2 = zhezhiAction("Basic 2", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 102.75, energy: 185, concerto: 595, offtune: 5905, forte1: 15 });
const BA3 = zhezhiAction("Basic 3", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 133.61, energy: 240, concerto: 768, offtune: 7680, forte1: 25 });
export const BA123 = new Chain("Basic 123", [BA1, BA2, BA3]);

export const MA = zhezhiAction("Mid-air Attack", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 229.53, energy: 340, concerto: 1091, offtune: 10865, forte1: 25 });
export const DC = zhezhiAction("Dodge Counter", { node: Node.Normal, cast: Cast.DodgeCounter, type: DamageType.Basic, mv: 145.35, energy: 215, concerto: 2000, offtune: 6880 });
const HA = zhezhiAction("Heavy", { node: Node.Normal, cast: DamageType.Heavy, type: DamageType.Heavy, mv: 112.72, energy: 167, concerto: 534, offtune: 5336, forte1: 15 });

// --- resonance skill: Manifestation, base cast — spends 60 Afflatus for a pair of Imprints
//     once it's actually banked (hand-placed after Intro + BA123, see file header)
const Skill = zhezhiAction("Skill", {
  node: Node.Skill, cast: DamageType.Skill, type: DamageType.Skill, mv: 295.26, energy: 792, concerto: 800, offtune: 4737, forte1: -60,
});

// --- forte circuit: Heavy Attack - Conjuration (spends the remaining 30 Afflatus for a third
//     Imprint), then Stroke of Genius (twice — two of the three Imprints), then Creation's
//     Zenith (the last Imprint, plus both Painter's Delight stacks it never tracks directly)
const FHA = zhezhiAction("Forte Heavy", {
  node: Node.Forte, cast: DamageType.Heavy, type: DamageType.Heavy, mv: 249.03, energy: 210, concerto: 669, offtune: 6681, forte1: -30,
});
export const FSkill = zhezhiAction("Skill: Stroke of Genius", {
  node: Node.Forte, cast: DamageType.Skill, type: DamageType.Basic, mv: 298.22, energy: 700, concerto: 1300, offtune: 7736,
  priority: PRIORITY.BUFF_STATS,
  apply(ctx) { ctx.grantSelf(CALLIGRAPHERS_TOUCH); },
});
export const FSkill3 = zhezhiAction("Skill: Creation's Zenith", {
  node: Node.Forte, cast: DamageType.Skill, type: DamageType.Basic, mv: 357.87, energy: 702, concerto: 1300, offtune: 10401,
  priority: PRIORITY.BUFF_STATS,
  apply(ctx) { ctx.grantSelf(CALLIGRAPHERS_TOUCH); },
});

// --- liberation: Living Canvas — opens the Inklit Spirit window, no damage of its own
const Liberation = zhezhiAction("Liberation", {
  node: Node.Liberation, cast: DamageType.Liberation, type: DamageType.Basic, mv: 0, energy: -12500, concerto: 2000, offtune: 0,
});
/** Inklit Spirit: up to 21 Coordinated Attack hits over 30s, one per second the active
 *  resonator lands a hit — lumped into one action, same treatment as Cantarella's Diffusion.
 *  Not queued off Liberation itself since the real window spans everyone else's own actions
 *  too; placed directly, same as Phrolova's Hecate auto-cycle. */
export const ACTION_LIB_COORDS = zhezhiAction("Liberation: Inklit Spirits x21", {
  node: Node.Liberation, type: DamageType.Basic, type2: Type2.Coordinated, mv: 1369.41, active: false,
});

// --- intro / outro
const Intro = zhezhiAction("Intro", {
  node: Node.Intro, cast: DamageType.Intro, type: DamageType.Intro, mv: 258.48, energy: 1002, concerto: 1000, offtune: 10401, forte1: 45,
});
/** Carve and Draw: hands the incoming resonator +20% Glacio DMG Amp / +25% Skill DMG Amp for
 *  14s (short — lost after the outro action gains stats). Flourish restores the incoming
 *  resonator's own Energy directly, not through a buff. Her own Panorama stacks (if 3+) also
 *  convert here — see the weapon above. */
const Outro = zhezhiAction("Outro", {
  cast: DamageType.Outro, type: DamageType.Outro, mv: 0, concerto: -10000, active: false,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) {
    ctx.outro(ZHEZHI_OUTRO);
    const next = ctx.nextSlot();
    next.setCounter(Resource.Energy, next.counter(Resource.Energy) + 1500, ctx.source);
    if (ctx.stacksOf(PANORAMA_STACKS) >= 3) { ctx.revoke(PANORAMA_STACKS); ctx.grantSelf(PANORAMA_OFFIELD); }
  },
});
export const ZHEZHI_OUTRO = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  if (isOutro(ctx.action!)) ctx.revoke(ZHEZHI_OUTRO);
  ctx.add(20, Element.Glacio, Stat.Amp);
  ctx.add(25, DamageType.Skill, Stat.Amp);
  return "Zhezhi: Outro";
});

/** The kit-valid line reconstructed from the file header: Intro (auto) + basics bank Afflatus,
 *  Skill opens two Imprints, the forte Heavy Attack opens the third, two Strokes of Genius and
 *  a Creation's Zenith spend all three, Liberation opens the Coordinated Attack window before
 *  Outro closes the loop out. */
export const ROTATION = [
  ECHO_CAST, BA123,
  Skill, FHA, FSkill, FSkill, FSkill3,
  Liberation, ACTION_LIB_COORDS,
  Outro,
];
