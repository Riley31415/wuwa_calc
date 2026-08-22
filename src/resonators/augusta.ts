/**
 * Augusta — an electro broadblade DPS. Two gauges gate her chained forms: Prowess (0-660 here,
 * matching the migrated sheet's own internal scale rather than the kit text's "100 points") lets
 * a full-gauge Heavy Attack - Steelclash become the Thunderoar Backstep -> Spinslash chain
 * instead; Ascendancy (0-4000, same reasoning) lets a full-gauge Resonance Skill - Warrior's
 * Blade become the Undying Sunlight Strike -> Leap -> Plunge chain instead. Majesty (2 stacks)
 * — from her own Plunge, or a teammate's Outro cast while under her own Outro buff — unlocks a
 * second Liberation: Sublime is the Sun, which itself is two more hits (Sunborne x9, then
 * Everbright Protector).
 *
 * Numbers from nanoka.cc (character 1306, https://ww.nanoka.cc/character/1306) for every named hit's MV, cross-checked against every
 * multi-hit total the migrated sheet also gives (all agree to the hundredth of a percent).
 * Energy/concerto/offtune/Prowess/Ascendancy deltas aren't cleanly exposed on the page itself, so
 * those come from the migrated sheet directly, same gap other kits (Sanhua, Brant) have. Mid-air
 * Attack/Dodge Counter/Mid-air Dodge Counter are included for completeness (nanoka gives their MV)
 * but carry no energy/concerto/offtune yet — the migrated sheet's own rotation never uses them.
 * The Prowess/Ascendancy-gated Dodge Counter variants are skipped entirely: both deal exactly the
 * same numbers as Heavy Attack - Steelclash / Heavy Attack - Thunderoar: Backstep already do,
 * just from a different button, so they'd be a bare reskin rather than new data.
 *
 * Liberation - Sword of Eternal Oath (Lib1) and Liberation - Sublime is the Sun's own two phases
 * (Lib2 Sunborne x9, Lib3 Everbright Protector) are mutually exclusive presses in real play, but
 * the rotation below places both liberations by hand, same as every other kit's fixed valid line
 * — no live Majesty gate enforced. Sublime is the Sun's own opening press deals no damage of its
 * own (nothing on the page gives it one), so it isn't a separate action — Lib2 is placed directly,
 * and its own apply() queues Lib3 once the ninth Sunborne hit lands ("Everbright Protector is
 * automatically cast" when Sworn Allegiance ends, per the kit text). The migrated sheet gives
 * Lib3 energy -125 (Sword of Eternal Oath's own declared cost), but the page is explicit that
 * Sublime is the Sun costs no Resonance Energy at all — trusted over the sheet here, so Lib3
 * reads 0.
 *
 * Glory's Favor (Inherent Skill): a shield on every damaging hit, 0.5s ICD — same treatment as
 * Iuno/Jingran's own shield passives, `shields: 1` on every action rather than tracking the ICD.
 * Ruler's Realm's own shield (any team member's own Intro, while it's up) has no stat of its
 * own — the real 650 + 5% Max HP amount is out of scope, same as every other shield/heal in this
 * calculator — but the shield *event* itself is real and other kits react to it (Jingran's Ghost
 * Shroud, Iuno's Moongazer Sigil), so it's modelled as a `ctx.gainShields` add instead of
 * skipped outright — same shape as adding Concerto/Energy; see `RULERS_REALM` below.
 */
import { Buff, GlobalBuff, Action, Chain, PRIORITY } from "../kit.js";
import type { ActionDef } from "../kit.js";
import { Resonator, Loadout, isOutro, isIntro } from "../state.js";
import type { ResonatorFactory } from "../state.js";
import { Stat, Element, Type1, Node, Cast, Resource, Scaling } from "../stats.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";
import { VOID_THUNDER_2PC, FALSE_SOVEREIGN, COV_3PC } from "../echoes/septimont.js";
import { THUNDERFLARE_DOMINION } from "../weapons/broadblade.js";
import { endMaestro } from "./phrolova.js";

/** This resonator's own color — every action from the wrapper below defaults to it. */
export const COLOR = "#d7370f";

/** Prowess is the gauge the game shows; Ascendancy is the mid-air chained-skill equivalent. Both
 *  kept at the migrated sheet's own internal scale (Prowess 0-660, Ascendancy 0-4000) rather than
 *  the kit text's "100 points" — nothing here reads them against any number but each other. */
export const AUGUSTA_PROWESS = Resource.Forte1;
export const AUGUSTA_ASCENDANCY = Resource.Forte2;

/* --------------------------------------------------------------- resonator */

/** Majesty: up to 2 stacks — Undying Sunlight: Plunge grants one outright (see FSkill3 below);
 *  a teammate's own Outro cast, while Augusta's own Outro buff (BATTLESONG) is up on them,
 *  grants the other. Global so it can see any team member's Outro, not just Augusta's own. */
export const MAJESTY = new Buff(PRIORITY.BUFF_STATS, (ctx, stacks) => `Augusta: Majesty x${stacks}`, 2);

export const MAJESTY_WATCH = new GlobalBuff(PRIORITY.UPDATE_BUFFS, (ctx) => {
  if (isOutro(ctx.action!) && ctx.equipped(BATTLESONG)) {
    const [augusta] = ctx.slotsWith("Augusta");
    if (augusta) augusta.addStack(MAJESTY, 1, ctx.owner);
  }
  return "Augusta: Majesty (watcher)";
});

/** Crown of Wills: +15% Electro DMG Bonus, granted alongside Majesty on her own Outro cast,
 *  spent entirely (not just decremented) when Everbright Protector ends Sworn Allegiance. */
export const CROWN_OF_WILLS = new Buff(PRIORITY.BUFF_STATS,
  (ctx) => { ctx.add(15, Element.Electro, Stat.DmgBonus); return "Augusta: Crown of Wills"; });

/** Ruler's Realm: opens alongside Sublime is the Sun (see Lib2 below), 30s — permanent uptime
 *  once granted, per the standing duration rule. Any team member's own Intro cast, while it's
 *  up, gains a shield; the real 650 + 5% Max HP shield itself is out of scope (no stat of its
 *  own), but the shield *event* still matters to whoever's own kit reacts to `ctx.shields`
 *  (Jingran's Ghost Shroud, Iuno's Moongazer Sigil, Augusta's own weapon/Crown of Valor) — added
 *  via `ctx.gainShields`, same as Concerto/Energy. `UPDATE_BUFFS`, the same early priority
 *  Jingran's own Ghost Feed reads shields at, so this lands before that reads it. Global so it
 *  can see any team member's own Intro, not just Augusta's. */
export const RULERS_REALM = new GlobalBuff(PRIORITY.UPDATE_BUFFS, (ctx) => {
  if (isIntro(ctx.action!)) ctx.gainShields(1);
  return "Augusta: Ruler's Realm";
});

/** Her echoes: False Sovereign mainslot, Crown of Valor 3pc + Void Thunder 2pc — all shared
 *  gear from echoes/septimont.js reused as-is; Radiance Cleaver (weapons/standard.js) is her f2p alternative.
 *  Thunderflare Dominion (her own signature) lives in weapons/broadblade.js. 43311 crit-rate build. */
const AUGUSTA_LOADOUT = new Loadout(
  THUNDERFLARE_DOMINION, FALSE_SOVEREIGN, COV_3PC, VOID_THUNDER_2PC,
  mainstats("CR", "electro electro", "atk atk"), chem("atk", "heavy"),
);

export class Augusta extends Resonator {
  constructor(loadout: Loadout) {
    super(
      "Augusta",
      Element.Electro,
      () => Intro,
      loadout,
      (ctx) => {
        ctx.add(10300, Stat.BaseHp);
        ctx.add(463, Stat.BaseAtk);
        ctx.add(1112, Stat.BaseDef);
      },
      (ctx) => {
        ctx.add(8, Stat.CritRate);
        ctx.add(12, Stat.BonusAtk);
      },
      (ctx) => { ctx.grantGlobal(MAJESTY_WATCH); },
    );
  }
}
export const LOADOUT: ResonatorFactory = () => new Augusta(AUGUSTA_LOADOUT);

/* ----------------------------------------------------------------- actions */

function augustaAction(name: string, def: ActionDef): Action {
  return new Action(name, {
    element: Element.Electro,
    scaling: Scaling.Atk,
    shields: 1,   // Glory's Favor: every damaging hit shields her (ICD not modelled, see header)
    ...def,
  });
}

// --- basics, mid-air, dodge counter (Hunter's Path)
const BA1 = augustaAction("Basic: Hunter's Path 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 57.46, energy: 73, concerto: 145, offtune: 2300, forte1: 99, forte2: 74 });
const BA2 = augustaAction("Basic: Hunter's Path 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 134, energy: 170, concerto: 338, offtune: 5400, forte1: 230, forte2: 172 });
const BA3 = augustaAction("Basic: Hunter's Path 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 196.83, energy: 249, concerto: 495, offtune: 7900, forte1: 336, forte2: 252 });
const BA4 = augustaAction("Basic: Hunter's Path 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 193.89, energy: 246, concerto: 489, offtune: 7800, forte1: 333, forte2: 249 });
export const BA123 = new Chain("Basic: Hunter's Path 123", [BA1, BA2, BA3]);
export const BA1234 = new Chain("Basic: Hunter's Path 1234", [BA1, BA2, BA3, BA4]);

// --- mid-air, dodge counter — not in the migrated rotation, so only nanoka's own MV (see header)
export const MA = augustaAction("Basic: Hunter's Path (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 119.3 });
export const DC = augustaAction("Basic: Hunter's Path 2 (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 134 });
// no confident wuwalab match for this one (their list has only one, non-mid-air, Dodge Counter)
export const MDC = augustaAction("Mid-air Dodge Counter", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 119.3 });

// --- heavy attack: Steelclash, base cast; at full Prowess it's replaced by the Thunderoar
//     Backstep -> Spinslash chain instead (FHA1/FHA2), and Jump becomes Uppercut (FJump).
const HA = augustaAction("Heavy 1: Hunter's Path", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 139.17, energy: 177, concerto: 351, offtune: 5700, forte1: 342, forte2: 255 });

const FHA1 = augustaAction("Heavy 2: Thunderoar - Backstep", {
  node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 53.68, energy: 50, concerto: 100, offtune: 1600, forte1: -660, forte2: 50,
});
const FHA2 = augustaAction("Heavy 2: Thunderoar - Spinslash", {
  node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 425.16, energy: 447, concerto: 891, offtune: 14400, forte2: 744,
});

export const FJump = augustaAction("Heavy 3: Thunderoar - Uppercut", {
  node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 357.86, energy: 376, concerto: 750, offtune: 12000, forte1: -660, forte2: 382,
});

// --- resonance skill: Warrior's Blade, base cast; at full Ascendancy it's replaced by the
//     Undying Sunlight Strike -> Leap -> Plunge chain instead (FSkill1/FSkill2/FSkill3).
const Skill = augustaAction("Skill 1: Warrior's Blade", {
  node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 656.1, energy: 900, concerto: 1000, offtune: 4500, forte1: 660, forte2: 400,
});

const FSkill1 = augustaAction("Skill 2: Undying Sunlight - Strike", {
  node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, mv: 278.34, energy: 500, concerto: 700, offtune: 18200, forte2: -4000,
});
const FSkill2 = augustaAction("Skill 2: Undying Sunlight - Leap", {
  node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, mv: 278.35, energy: 500, concerto: 700, offtune: 11200, shields: 2,
});

/** Undying Sunlight: Plunge — consumes all Ascendancy, counts as Heavy Attack DMG, and grants
 *  a stack of Majesty. */
const FSkill3 = augustaAction("Skill 2: Undying Sunlight - Plunge", {
  node: Node.Forte, cast: Cast.Skill, type: Type1.Heavy, mv: 865.83, energy: 1100, concerto: 700, offtune: 24000, shields: 2,
  priority: PRIORITY.BUFF_STATS,
  apply(ctx) { ctx.grantSelf(MAJESTY); },
});

// --- liberation: Sword of Eternal Oath, the plain press-and-release cast — costs Energy like
//     any other liberation and restores 40% Ascendancy.
const Lib1 = augustaAction("Liberation 1: Sword of Eternal Oath", {
  node: Node.Liberation, cast: Cast.Liberation, type: Type1.Heavy, mv: 1099.48, shields: 2,
  energy: -12500, concerto: 2000, offtune: 29400, forte2: 1600,
});

/** Sublime is the Sun - Sunborne, held instead of released once Majesty reaches 2 — costs 2
 *  Majesty rather than Energy (see file header). Nine hits lumped into one action, same
 *  treatment as Cantarella's Diffusion / Phrolova's Hecate cycle. Queues Everbright Protector
 *  itself once the ninth lands — "When Sworn Allegiance ends, Everbright Protector is
 *  automatically cast", per the kit text. wuwalab lumps both phases under one "Liberation 2:
 *  Sublime is the Sun" total (2266.54% = this hit's 1073.61% + Lib3's own 1192.93%) rather than
 *  naming the two phases apart, so the "- Sunborne x9"/"- Everbright Protector" suffixes below
 *  are the kit text's own wording, not wuwalab's. */
const Lib2 = augustaAction("Liberation 2: Sublime is the Sun - Sunborne x9", {
  node: Node.Liberation, type: Type1.Heavy, mv: 1073.61, concerto: 1800, offtune: 64800,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) {
    ctx.queue(Lib3);
    ctx.grantGlobal(RULERS_REALM);
    // special: ends Phrolova's own Maestro instantly, same as her own EIntro would
    const [phrolova] = ctx.slotsWith("Phrolova");
    if (phrolova) endMaestro(ctx, phrolova);
  },
});
/** Sublime is the Sun - Everbright Protector, the finisher — ends Sworn Allegiance and spends
 *  every stack of Crown of Wills. */
const Lib3 = augustaAction("Liberation 2: Sublime is the Sun - Everbright Protector", {
  node: Node.Liberation, type: Type1.Heavy, mv: 1192.93, concerto: 1000, offtune: 49800,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.revoke(CROWN_OF_WILLS); },
});

// --- intro / outro
const Intro = augustaAction("Intro: Stride of Goldenflare", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 198.82,
  energy: 1000, concerto: 1000, offtune: 4800, forte1: 660, forte2: 800,
});
/** Battlesong of the Unyielding: hands the incoming resonator +15% DMG Amplification (all
 *  attributes) for 14s, and grants Augusta herself a stack each of Majesty and Crown of Wills. */
const Outro = augustaAction("Outro: Battlesong of the Unyielding", {
  cast: Cast.Outro, mv: 0, concerto: -10000, active: false,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) {
    ctx.outro(BATTLESONG);
    ctx.grantSelf(MAJESTY);
    ctx.grantSelf(CROWN_OF_WILLS);
  },
});
export const BATTLESONG = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  if (isOutro(ctx.action!)) ctx.revoke(BATTLESONG);
  ctx.add(15, Stat.Amp);
  return "Augusta: Battlesong of the Unyielding";
});

/** The migrated `augusta` rotation: the Steelclash->Thunderoar chain twice (Intro tops Prowess,
 *  Warrior's Blade also does per the sheet), Sword of Eternal Oath, the Undying Sunlight chain
 *  (Plunge grants the Majesty stack Sublime is the Sun then spends). Everbright Protector is no
 *  longer placed here — Lib2's own apply() queues it once Sunborne's ninth hit lands. Intro is
 *  no longer placed here either — the preceding member's outro triggers it (see `onIntro`). */
export const ROTATION = [
  FHA1, FHA2, Skill, FHA1, FHA2, Lib1, 
  FSkill1, FSkill2, FSkill3, Lib2,
  Outro,
];
