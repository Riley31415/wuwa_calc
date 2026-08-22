/**
 * Roccia — a havoc gauntlets support/sub-DPS. Imagination (forte1, max 300) builds off normal
 * attack hits; at 100+ a held Heavy Attack — or Resonance Skill: Acrobatic Trick, unconditionally
 * — launches her into Beyond Imagination, unlocking Basic Attack: Real Fantasy (a 3-stage Heavy
 * Attack DMG combo, spending the 100 Imagination on its own first hit). Liberation: Commedia
 * Improvviso! scales the whole team's ATK off Roccia's own Crit Rate past 50%.
 *
 * Super Attractive Magic Box (Inherent Skill): her Outro swaps the incoming resonator's own Echo
 * Skill for a flat, DMG-bonus-immune "Magic Box" hit for 14s — modifying a TEAMMATE's own kit
 * mid-rotation needs live per-resonator move-replacement state this engine's fixed-line rotations
 * don't have, so it's left unmodelled, same shape as every other conditional-replacement gap
 * elsewhere (Brant's Interlude Applause, etc) — flagged rather than faked.
 *
 * Numbers from nanoka.cc (character 1606, https://ww.nanoka.cc/character/1606, weapon 21040026, echo 6000087) for every named hit's
 * MV — she has no wuwalab.com entry yet (unreleased), so this is nanoka's own rendered "Skill
 * Attributes (Lv.10)" table. Energy/concerto/offtune/Imagination deltas aren't cleanly exposed on
 * nanoka's own page, but the migrated sheet already has her — same gap Brant/Sanhua/Buling/
 * Carlotta have, filled the same way. Dodge Counter has no sheet row at all, so it's still bare
 * (nanoka's own MV only).
 */
import { Buff, GlobalBuff, Action, Chain, PRIORITY, ECHO_CAST } from "../kit.js";
import type { ActionDef } from "../kit.js";
import { Resonator, Loadout, isOutro } from "../state.js";
import type { ResonatorFactory } from "../state.js";
import { Stat, Element, Type1, Node, Cast, Resource, Scaling } from "../stats.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";
import { MIDNIGHT_VEIL_2PC, MIDNIGHT_VEIL_5PC, NM_HERON } from "../echoes/rinascita.js";
import { TRAGICOMEDY } from "../weapons/gauntlet.js";

/** This resonator's own color — every action from the wrapper below defaults to it. */
export const COLOR = "#9634b2";

/** The gauge the game shows — up to 300, spent 100 a cast by Real Fantasy's own first hit. */
export const ROCCIA_IMAGINATION = Resource.Forte1;

/* --------------------------------------------------------------- resonator */

/** Immersive Performance (Inherent Skill): +20% ATK for 12s on casting Resonance Skill or the
 *  base Heavy Attack specifically — not Real Fantasy, which is a Basic Attack-button press even
 *  though it deals Heavy Attack DMG. Short window, lost after the outro action gains stats. */
export const IMMERSIVE_PERFORMANCE = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(20, Stat.BonusAtk);
  if (isOutro(ctx.action!)) ctx.revoke(IMMERSIVE_PERFORMANCE);
  return "Roccia: Immersive Performance";
});

/** Commedia Improvviso!'s own team ATK grant: 1 flat ATK point per 0.1% Crit Rate she holds over
 *  50%, capped at 200 — read live off her own Crit Rate at the Liberation cast. 30s, so per the
 *  standing duration rule this is permanent uptime once granted, never revoked. Global since the
 *  whole team gets it, not just Roccia. */
export const COMMEDIA_TEAM_ATK = new GlobalBuff(PRIORITY.BUFF_STATS,
  (ctx, stacks) => { ctx.add(stacks, Stat.FlatAtk); return `Roccia: Commedia Improvviso! +${stacks} ATK`; }, 200);

/** Applause, Please! — the window her outro hands the incoming resonator. */
export const ROCCIA_OUTRO = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  if (isOutro(ctx.action!)) ctx.revoke(ROCCIA_OUTRO);
  ctx.add(20, Element.Havoc, Stat.DmgBonus);
  ctx.add(25, Type1.Basic, Stat.DmgBonus);
  return "Roccia: Applause, Please!";
});

/** Her echoes: Nightmare: Impermanence Heron mainslot (echoes/rinascita.js), full 5pc Midnight Veil
 *  (echoes/rinascita.js, both bonuses, shared with Cantarella's own file); Tragicomedy (her own
 *  signature) lives in weapons/gauntlet.js. 43311 crit-rate build, opposite her own CD-heavy stat
 *  tree (see the constructor below). */
const ROCCIA_LOADOUT = new Loadout(
  TRAGICOMEDY, NM_HERON, MIDNIGHT_VEIL_5PC, MIDNIGHT_VEIL_2PC,
  mainstats("CR", "havoc havoc", "atk atk"), chem("atk", "heavy"),
);

export class Roccia extends Resonator {
  constructor(loadout: Loadout) {
    super(
      "Roccia",
      Element.Havoc,
      () => Intro,
      loadout,
      (ctx) => {
        ctx.add(12250, Stat.BaseHp);
        ctx.add(375, Stat.BaseAtk);
        ctx.add(1198, Stat.BaseDef);
      },
      (ctx) => {
        ctx.add(12, Stat.BonusAtk);
        ctx.add(16, Stat.CritDmg);
      },
    );
  }
}
export const LOADOUT: ResonatorFactory = () => new Roccia(ROCCIA_LOADOUT);

/* ----------------------------------------------------------------- actions */

function rocciaAction(name: string, def: ActionDef): Action {
  return new Action(name, {
    element: Element.Havoc,
    scaling: Scaling.Atk,
    ...def,
  });
}

// --- basics, mid-air, dodge counter (Pero, Easy). Energy/concerto/offtune/Imagination all come
//     from the migrated sheet now — nanoka's own page never gave them (see the file header) but
//     the sheet already had this character. Dodge Counter has no sheet row either, so it's still
//     bare (nanoka's own MV only).
const BA1 = rocciaAction("Basic: Pero, Easy 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 73.18, energy: 109, concerto: 347, offtune: 3464, forte1: 19 });
const BA2 = rocciaAction("Basic: Pero, Easy 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 114.42, energy: 171, concerto: 543, offtune: 5418, forte1: 33 });   // 38.14% x3
const BA3 = rocciaAction("Basic: Pero, Easy 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 169.00, energy: 250, concerto: 800, offtune: 8000, forte1: 49 });   // 33.80% x2 + 101.40%
const BA4 = rocciaAction("Basic: Pero, Easy 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 208.38, energy: 310, concerto: 988, offtune: 9920, forte1: 100 });   // 104.19% x2
const MA = rocciaAction("Basic: Pero, Easy (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 104.78, energy: 155, concerto: 496, offtune: 4960, forte1: 38 });
const DC = rocciaAction("Basic: Pero, Easy (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 206.70 });   // 68.90% x3

export const BA1234 = new Chain("Basic: Pero, Easy 1234", [BA1, BA2, BA3, BA4]);

// --- heavy attack: hitting with at least 100 Imagination also launches Beyond Imagination —
//     same trigger Acrobatic Trick has unconditionally, so this only matters as a second way in.
const HA = rocciaAction("Heavy: Pero, Easy", {
  node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 168.99,
  energy: 250, concerto: 800, offtune: 8000, forte1: 100,
  priority: PRIORITY.BUFF_STATS,
  apply(ctx) { ctx.grantSelf(IMMERSIVE_PERFORMANCE); },
});

// --- resonance skill: Acrobatic Trick — pulls in targets and always launches Beyond Imagination
const Skill = rocciaAction("Skill: Acrobatic Trick", {
  node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 491.76,   // 61.47% x8
  energy: 1400, concerto: 2000, offtune: 10992, forte1: 100,
  priority: PRIORITY.BUFF_STATS,
  apply(ctx) { ctx.grantSelf(IMMERSIVE_PERFORMANCE); },
});

// --- forte circuit: Real Fantasy, a 3-stage Heavy Attack DMG combo while in Beyond Imagination.
//     100 Imagination is spent once, on the first hit — the kit text's own "consume 100 to cast"
//     gate, not a per-stage cost.
const FBA1 = rocciaAction("Basic: Real Fantasy 1", { node: Node.Forte, cast: Cast.Basic, type: Type1.Heavy, mv: 322.08, energy: 800, concerto: 1000, offtune: 7200, forte1: -100 });
const FBA2 = rocciaAction("Basic: Real Fantasy 2", { node: Node.Forte, cast: Cast.Basic, type: Type1.Heavy, mv: 339.97, energy: 800, concerto: 1600, offtune: 7600 });
const FBA3 = rocciaAction("Basic: Real Fantasy 3", { node: Node.Forte, cast: Cast.Basic, type: Type1.Heavy, mv: 357.86, energy: 800, concerto: 2500, offtune: 8000 });
export const FBA123 = new Chain("Basic: Real Fantasy 123", [FBA1, FBA2, FBA3]);

// --- liberation: Commedia Improvviso! — team ATK scaled off her own Crit Rate past 50%. The
//     migrated sheet's own energy row reads 0 rather than the usual -12500 declared cost; nanoka's
//     page is explicit about a 125-point Resonance Cost (matching every other kit's declared-cost
//     shape), so that's trusted here instead — flagged since the two disagree outright.
const Liberation = rocciaAction("Liberation: Commedia Improvviso!", {
  node: Node.Liberation, cast: Cast.Liberation, type: Type1.Heavy, mv: 835.02,   // 278.34% x3
  energy: -12500, concerto: 2000, offtune: 96000,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) {
    const points = Math.min(200, Math.max(0, (ctx.get(Stat.CritRate) - 50) * 10));
    ctx.grantGlobal(COMMEDIA_TEAM_ATK, points);
  },
});

// --- intro / outro
const Intro = rocciaAction("Intro: Pero, Help", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 168.99,
  energy: 1000, concerto: 1000, offtune: 10824, forte1: 100,
});
const Outro = rocciaAction("Outro: Applause, Please!", {
  cast: Cast.Outro, mv: 0, concerto: -10000, active: false,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.outro(ROCCIA_OUTRO); },
});

/** A kit-valid line: Intro tops Imagination to 100, Acrobatic Trick launches Beyond Imagination
 *  (and restores Concerto), Real Fantasy spends the 100 on its own first hit, basics and the
 *  base Heavy Attack round it out, Liberation closes on her own high Crit Rate. Intro is no
 *  longer placed here — the preceding member's outro triggers it (see the standing convention). */
export const ROTATION = [
  Skill, FBA123, BA1234, HA,
  ECHO_CAST, Liberation, Outro,
];
