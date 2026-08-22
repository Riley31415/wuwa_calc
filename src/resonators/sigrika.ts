/**
 * Sigrika, ported to the new engine — sequence-0 core loop only. An aero gauntlets main DPS built
 * almost entirely around Echo Skill DMG: Elucidated, Decipher's own Dodge Counter variant, BIG
 * BOOMY BOOM!, Soliskin to the Aid, Schemata of Runes and its own Runic follow-ups, and Learn My
 * True Name all carry `type: Skill` — wait, `type: Echo` — even though most aren't literal Echo
 * casts.
 *
 * Runes (Trust/Answer, up to 4 held) gate which Runic follow-up Schemata of Runes triggers — this
 * engine doesn't track a live 4-slot rune queue (same "fixed valid line, no live queue" treatment
 * as Zhezhi's Imprints), so instead of one Schemata action that reads bank state, there are three
 * separate named variants below; only Runic Outburst (a Trust+Answer spend, the natural default
 * from an even mix of triggers) is placed in the rotation, the other two exported for
 * completeness. Convergent/Divergent (doubling the next Rune gained) carry no damage or stat of
 * their own, same reasoning — they're still created and cleared correctly (removed the instant
 * she next gains a Rune, `gainsRune()`), just with nothing for the missing rune queue to actually
 * double. Encapsulated (Outro) is a Stagnate-on-Echo-cast crowd-control effect, out of scope same
 * as every other CC-only mechanic elsewhere.
 *
 * Full Stop (forte1, gates Learn My True Name at 100) and Soliskin Vitality (0-60, +10 a stack on
 * any team member's Echo cast, spent 30 at a time by Schemata's own Runic follow-ups — its own
 * plain Buff, not a forte gauge, since forte1-5 only ever update on their own holder's own turn
 * and this one reacts to the whole team) are both real gauges with a real damage payout, unlike
 * the rune queue.
 *
 * Numbers from nanoka.cc (character 1412, https://ww.nanoka.cc/character/1412) — every action's
 * own MV/energy/concerto/offtune/forte1 delta ported from the migrated (old-engine) sheet, which
 * already cites the same character page.
 */
import {
  Buff, Resonator, Action, ECHO_CAST, INTRO, Stat, Element, WeaponType, Type1, Cast, Node, Scaling,
  applySelf, applyTeam, isHeld, stacksOfTeam, removeStack, revoke, casting, currentAction, addStat, stacks, get,
  queue, lostOnSwap,
} from "../kit.js";
import { SOLSWORN_CIPHERS } from "../weapons/gauntlet.js";
import { NAMELESS_EXPLORER, SOUND_OF_TRUE_NAME_5PC, SOUND_OF_TRUE_NAME_2PC } from "../echoes/lahairoi.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";

/* ------------------------------------------------------------------------------------ buffs */

/** True Names Aligned (Inherent Skill): a teammate's Echo Skill cast grants the whole team a
 *  stack of Blessing of Runes, up to 6 — +3% Aero/Echo Skill DMG Bonus a stack to whoever's
 *  active, +30%/+30% flat more at the full 6 for Sigrika specifically (her own personal payout,
 *  not a team-wide one — gated on `isHeld(SIGRIKA)` rather than `.active`, since it's still hers
 *  to keep even on someone else's turn, not conditioned on who's currently on field). Granted via
 *  `SIGRIKA`'s own `updateGlobal()` below (not this buff's own update()) — it needs to react to
 *  *any* team member's own Echo cast, and a global buff's own update() only runs once it's
 *  already held, which it isn't yet the very first time; the Resonator itself is always
 *  self-held from team setup, so its updateGlobal() has no such bootstrapping problem. */
export const BLESSING_OF_RUNES = new Buff({
  name: "Sigrika: Blessing of Runes", maxStacks: 6,
  apply: () => {
    const held = stacksOfTeam(BLESSING_OF_RUNES);
    if (held >= 6 && isHeld(SIGRIKA)) { addStat(Stat.DmgBonus, 30, Element.Aero); addStat(Stat.DmgBonus, 30, Type1.Echo); }

    if (currentAction().active) {
        addStat(Stat.DmgBonus, 3 * held, Element.Aero);
        addStat(Stat.DmgBonus, 3 * held, Type1.Echo);
    }
  },
});

/** Whole percent points of ER — the shared floor both the conversion's own bonus and its display
 *  read off, since it only pays out in discrete 1% ER = 2% Echo Skill DMG steps, not continuously
 *  (same "@Nk HP"-style shared-threshold shape as Jingran's own hpSteps()/hpThreshold() pair). */
function erSteps(): number { return Math.floor(get(Stat.Er)); }

/** The same passive's own Energy Regen conversion: +2% Echo Skill DMG Bonus per 1% ER over 125%,
 *  capped at 50%. Read in convert() so every ER contribution has already landed this action. */
export const SIGRIKA_ER_CONVERSION = new Buff({
  name: "Sigrika: True Names Aligned",
  display: () => `Sigrika: True Names Aligned @${erSteps()}% ER`,
  convert: () => addStat(Stat.DmgBonus, Math.min(50, 2 * Math.max(0, erSteps() - 125)), Type1.Echo),
});

/** Whether the current action is one of the four that grant Sigrika a Rune — Elucidated/Decipher's
 *  own Dodge Counter variant (Rune: Trust), or BIG BOOMY BOOM!/Soliskin to the Aid (Rune: Answer).
 *  Reused wherever a buff cares "did this cast just gain a rune" (Decipher's own exit condition,
 *  Convergent/Divergent's removal below) instead of repeating the same four-way check each time. */
function gainsRune(): boolean {
  const a = currentAction();
  return a === EBA || a === DodgeCounterDecipher || a === ESkill || a === ESkill50;
}

/** Decipher: opened by Basic Attack Stage 4, 5s real duration — short enough that only the
 *  standing outro-loss rule matters. While up, Basic Attack becomes Elucidated and Dodge Counter
 *  becomes its own Decipher variant; Resonance Skill also has its own Decipher-gated forms. */
export const DECIPHER = new Buff({
  name: "Sigrika: Decipher",
  update: () =>  {
    lostOnSwap();
  },
  convert: () => { if (gainsRune()) revoke(DECIPHER); },
});

/** Convergent: the next Rune gained also duplicates itself; Divergent: the next Rune gained is
 *  the opposite type instead. Both are pure future-generation bookkeeping — this engine doesn't
 *  track a live rune queue (see the file header), so neither has any stat or damage of its own;
 *  they exist so they display and clear correctly. Both end the instant she next gains a Rune
 *  (`gainsRune()` above) — Convergent is granted by her own Intro, 20s real duration, so the
 *  standing outro-loss rule is kept too for the rare case she leaves the field before gaining one.
 *  Divergent has no granted trigger in this kit yet, exported for completeness same as the Runic
 *  Chain Whip/Soliskin variants above. */
export const CONVERGENT = new Buff({
  name: "Sigrika: Convergent",
  convert: () => { if (gainsRune() || casting(Cast.Outro)) revoke(CONVERGENT); },
});
export const DIVERGENT = new Buff({
  name: "Sigrika: Divergent",
  convert: () => { if (gainsRune() || casting(Cast.Outro)) revoke(DIVERGENT); },
});

/** Innate Gift?: up to 2 stacks, each +30% Echo Skill DMG Amplification — granted when Schemata
 *  of Runes' own Runic follow-up spends a full 30 Soliskin Vitality (see `SOLISKIN_VITALITY`
 *  below). Ends after Learn My True Name resolves, or the instant she's switched off field. */
export const INNATE_GIFT = new Buff({
  name: "Sigrika: Innate Gift?", maxStacks: 2,
  apply: () => {
    const a = currentAction();
    if (a === RunicChainWhip || a === RunicOutburst || a === RunicSoliskin || a === FSkill) {
        addStat(Stat.Amp, 30 * stacks(), Type1.Echo);
        if (a === FSkill) revoke(INNATE_GIFT);
    }
  },
  update: () => lostOnSwap(),
});

/** Soliskin Vitality: a genuine 0-60 point gauge (nanoka's own wording, not a synthetic proxy) —
 *  +10 whenever *any* team member (Sigrika included) casts an Echo Skill, granted via `SIGRIKA`'s
 *  own `updateGlobal()` below alongside Blessing of Runes (same bootstrapping reasoning as that
 *  buff — see its own comment). Not a forte gauge like Full Stop: forte1-5 only ever update
 *  during their own holder's own actions, so a cross-member trigger like this one has to be a
 *  plain stacked Buff instead. Spent by whichever Runic follow-up Schemata of Runes queues (the
 *  ability text checks the Heavy Attack cast that queues it, but nothing else can happen in
 *  between, so reading it on the follow-up's own action lands on the identical number and keeps
 *  the whole spend in this one buff instead of splitting it across a one-shot carrier): 30+ points
 *  spends exactly 30 for a flat +50% DMG Multiplier and a stack of Innate Gift?; under 30 spends
 *  everything held, +15% DMG Amplification per 10 points. apply() reads the held count before
 *  convert() spends it, same order Jingran's Fire of Life/Carlotta's Chromatic Splendor use. */
export const SOLISKIN_VITALITY = new Buff({
  name: "Sigrika: Soliskin Vitality", maxStacks: 60,
  update: () => {
    const a = currentAction();
    if (a !== RunicOutburst && a !== RunicChainWhip && a !== RunicSoliskin) return;
    const held = stacks();
    if (held >= 30) { applySelf(INNATE_GIFT, 1); }
  },
  apply: () => {
    const a = currentAction();
    if (a !== RunicOutburst && a !== RunicChainWhip && a !== RunicSoliskin) return;
    const held = stacks();
    if (held >= 30) { addStat(Stat.MulMv, 50); }
    else if (held > 0) addStat(Stat.Amp, 15 * Math.floor(held / 10));
  },
  convert: () => {
    const a = currentAction();
    if (a === RunicOutburst || a === RunicChainWhip || a === RunicSoliskin) {
      removeStack(SOLISKIN_VITALITY, Math.min(stacks(), 30));
    }
  },
});

/* ----------------------------------------------------------------------------------- actions */

function sigrikaAction(id: string, def: object): Action {
  return new Action(id, { element: Element.Aero, scaling: Scaling.Atk, ...def });
}

// energy/concerto/offtune are her own kit's real generation per cast — Liberation/Outro's own
// old declared "spend the bar" costs aren't repeated here (TODO_ENGINE.md: that's what
// Resonator.maxEnergy and the engine's own outro handling are for).
// --- basics, mid-air, dodge counter (One, Two, Three) — Stage 4 opens Decipher
export const BA1 = sigrikaAction("Basic - One, Two, Three 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 52.97, energy: 0.84, concerto: 1.67, offtune: 2700 });
export const BA2 = sigrikaAction("Basic - One, Two, Three 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 100.68, energy: 1.6, concerto: 3.18, offtune: 5100 });
export const BA3 = sigrikaAction("Basic - One, Two, Three 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 111.36, energy: 1.76, concerto: 3.5, offtune: 5600 });
export const BA4 = sigrikaAction("Basic - One, Two, Three 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 206.79, energy: 3.27, concerto: 6.51, offtune: 10400 });
export const MA = sigrikaAction("Basic - One, Two, Three (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 104.78 });
export const MDC = sigrikaAction("Basic - One, Two, Three (Mid-Air Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 206.17 });
export const DC = sigrikaAction("Basic - One, Two, Three (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 219.70 });
export const HA = sigrikaAction("Heavy - One, Two, Three", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 116.28 });

// --- Decipher-gated finishers: both grant a Rune: Trust and exit Decipher, both Echo Skill DMG
//     (the migrated sheet only carries one row for the pair — same numbers used for both here)
export const EBA = sigrikaAction("Basic - Elucidated", { node: Node.Normal, cast: Cast.Basic, type: Type1.Echo, mv: 307.79, energy: 2.6, concerto: 5.2 });
export const DodgeCounterDecipher = sigrikaAction("Basic - Decipher (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Echo, mv: 307.79, energy: 2.6, concerto: 5.2 });

// --- resonance skill: BOOMY BOOM! (base), or — while in Decipher — BIG BOOMY BOOM! (grants
//     Rune: Answer) / Soliskin to the Aid (also spends 50+ Full Stop, likewise grants Rune: Answer)
export const Skill = sigrikaAction("Skill - BOOMY BOOM!", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 143.15, energy: 2.25, concerto: 4.5 });
export const ESkill = sigrikaAction("Skill - BIG BOOMY BOOM!", { node: Node.Skill, cast: Cast.Skill, type: Type1.Echo, mv: 288.09, energy: 2.45, concerto: 4.9 });
export const ESkill50 = sigrikaAction("Skill - Soliskin to the Aid", { node: Node.Skill, cast: Cast.Skill, type: Type1.Echo, mv: 278.26, energy: 2.36, concerto: 4.72 });

// --- forte circuit: Schemata of Runes always lands its own base hit (+50 Full Stop), then queues
//     one of three Runic follow-ups depending on which pair of Runes it spends — three base
//     variants rather than one that reads live rune state (see the file header); the rotation
//     below only places the Runic Outburst line.
export const RunicOutburst = sigrikaAction("Forte - Runic Outburst", { node: Node.Forte, type: Type1.Echo, mv: 117.67+205.92+264.75, energy: 10, concerto: 7, offtune: 24800 });
export const RunicChainWhip = sigrikaAction("Forte - Runic Chain Whip", { node: Node.Forte, type: Type1.Echo, mv: 397.58, energy: 10, concerto: 7.03, offtune: 24802 });
export const RunicSoliskin = sigrikaAction("Forte - Runic Soliskin", { node: Node.Forte, type: Type1.Echo, mv: 397.54, energy: 10, concerto: 7.03, offtune: 24802 });

export const FHAoutburst = sigrikaAction("Forte Heavy - Schemata of Runes", { node: Node.Forte, cast: Cast.Heavy, type: Type1.Echo, mv: 132.51, energy: 3.34, concerto: 7.5, offtune: 27500, forte1: 50 });
export const FHAchainwhip = sigrikaAction("Forte Heavy - Schemata of Runes", { node: Node.Forte, cast: Cast.Heavy, type: Type1.Echo, mv: 132.51, energy: 3.34, concerto: 7.5, offtune: 27500, forte1: 50 });
export const FHAsoliskin = sigrikaAction("Forte Heavy - Schemata of Runes", { node: Node.Forte, cast: Cast.Heavy, type: Type1.Echo, mv: 132.51, energy: 3.34, concerto: 7.5, offtune: 27500, forte1: 50 });

/** Learn My True Name: at 100 Full Stop, spends it all. */
export const FSkill = sigrikaAction("Forte Skill - Learn My True Name", { node: Node.Forte, cast: Cast.Skill, type: Type1.Echo, mv: 1211.48, energy: 5.43, concerto: 30, offtune: 101300, forte1: -100 });

// --- liberation: Where Trust Leads Me!
export const Liberation = sigrikaAction("Liberation - Where Trust Leads Me!", { node: Node.Liberation, cast: Cast.Liberation, type: Type1.Echo, mv: 861.43, concerto: 20, offtune: 50400 });

// --- intro / outro
export const Intro = sigrikaAction("Intro - Solsworn Etymology", { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 163.42, energy: 10, concerto: 10, offtune: 7700 });
/** In This Very Moment carries no team buff on her own page (unlike most other kits' outros) —
 *  a plain damage hit, nothing invented. */
export const Outro = sigrikaAction("Outro - In This Very Moment", { cast: Cast.Outro, type: Type1.Outro, mv: 795, active: false });

/** Her, as a Resonator: name/element/weapon, every grant/spend/queue rule her kit needs, and her
 *  own base stat line. The stat-tree talent bonus lives in its own `SIGRIKA_TALENTS` buff below —
 *  just another piece of her loadout, not special-cased on the Resonator itself. */
export const SIGRIKA = new Resonator({
  name: "Sigrika",
  element: Element.Aero,
  weapon: WeaponType.Gauntlets,
  intro: () => Intro,
  color: "#7ee0c9",
  maxEnergy: 12500,

  combatStart: () => {
    applySelf(SIGRIKA_ER_CONVERSION);
  },

  updateGlobal: () => { 
    if (casting(Cast.Echo)) { applyTeam(BLESSING_OF_RUNES, 1); applySelf(SOLISKIN_VITALITY, 10); }
  },

  update: () => {
    const a = currentAction();
    if (a === Intro) applySelf(CONVERGENT, 1);
    if (a === BA4) applySelf(DECIPHER, 1);
    if (a === FHAoutburst) queue(RunicOutburst);
    if (a === FHAchainwhip) queue(RunicChainWhip);
    if (a === FHAsoliskin) queue(RunicSoliskin);
  },

  apply: () => {
    addStat(Stat.BaseHp, 10775); addStat(Stat.BaseAtk, 437.5); addStat(Stat.BaseDef, 1137);
    addStat(Stat.Er, 100); addStat(Stat.CritRate, 5); addStat(Stat.CritDmg, 150);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
export const SIGRIKA_TALENTS = new Buff({
  name: "Sigrika: Talents",
  apply: () => { addStat(Stat.CritRate, 8); addStat(Stat.BonusAtk, 12); },
});

/** The kit-valid line reconstructed from the old sheet: Intro opens Decipher-free, the basics
 *  chain opens Decipher on Stage 4, Elucidated spends it for a Rune: Trust, BOOMY BOOM! into BIG
 *  BOOMY BOOM! banks a Rune: Answer (Decipher re-opened by another basics pass), Schemata of
 *  Runes spends the Trust+Answer pair for Runic Outburst, Learn My True Name closes the forte
 *  circuit once Full Stop is banked, Liberation closes the loop. She's never the team's own
 *  lead, so unlike a first-position member's own opener, this same rotation covers both. */
export const SR_ROTATION = [
  INTRO, ECHO_CAST, BA2, BA3, BA4, EBA, FHAchainwhip, Liberation,
  BA2, BA3, BA4, EBA, FHAoutburst, FSkill, 
  Skill, BA3, BA4, EBA,
  Outro,
];

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents, weapon, mainslot echo, sonata pieces, mainstat/substat
export const SR_LOADOUT = [
  SIGRIKA, SIGRIKA_TALENTS,
  SOLSWORN_CIPHERS,
  NAMELESS_EXPLORER, SOUND_OF_TRUE_NAME_5PC, SOUND_OF_TRUE_NAME_2PC,
  mainstats("CR", "ER atk", "atk atk"), chem("atk", "basic"),
];
