/**
 * Sigrika, ported to the new engine — an aero gauntlets DPS built around Echo Skill DMG: most of
 * her real kit tags `type: Echo` even though most casts (Elucidated, BIG BOOMY BOOM!, etc.) aren't
 * literal Echo casts.
 * Her Runes are a real store (RUNES below, Phrolova's Volatile Notes shape): four two-bit slots
 * oldest-first, 1 Trust and 2 Answer — two of them without Full Stop, all four from 50. A Rune
 * gained at capacity shifts the rest left and drops the leftmost. Elucidated and Dodge Counter -
 * Decipher hits bank Trust, BIG BOOMY BOOM! and Soliskin to the Aid hits bank Answer; Convergent
 * (Intro) doubles the next gain and Divergent (Liberation) mirrors it, neither at 100 Full Stop.
 * Schemata of Runes is one press: it spends the two leftmost and its follow-up is theirs — Trust
 * and Answer for Runic Outburst, two Trusts for Chain Whip, two Answers for Soliskin. forte1 is
 * the count the store holds (cap 4), so a Schemata pressed without a pair reads red; Full Stop is
 * forte2 (cap 100, +50 a Schemata, all of it for Learn My True Name), and Soliskin Vitality a real
 * 0-60 gauge fed by any team member's Echo cast.
 */
import { Stat, Attribute, WeaponType, Type1, Cast, Node, Scaling } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout } from "../../engine/gear.js";
import {
  applyCurrent,
  applyTeam,
  isHeld,
  stacksOfTeam,
  removeStack,
  revokeCurrent,
  casting,
  currentAction,
  addStat,
  frozenStacks,
  getStat,
  queue,
  isActive,
  setStacksSelf,
  stacksOf,
  forte2,
} from "../../engine/context.js";
import { lostOnSwap } from "../../shared/helpers.js";
import { ActionGroup, Action, Rotation, INTRO, ECHO_CANCEL, OUTRO, START_3, SWAP, ECHO_ONFIELD, ECHO_SWAP } from "../../engine/rotation.js";
import { SOLSWORN_CIPHERS } from "../../weapons/gauntlet.js";
import { NEW_STD_GAUNTLET, ABYSS_SURGES } from "../../weapons/standard.js";
import { NAMELESS_EXPLORER, SOUND_OF_TRUE_NAME_5PC } from "../../echoes/lahairoi.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function sigrikaAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Aero, scaling: Scaling.Atk, ...def });
}

// a hit that banks a Rune (gainRune() below): the store takes the kind, forte1 the count
const RUNE_TRUST = { updateBuffs: () => gainRune(1) };
const RUNE_ANSWER = { updateBuffs: () => gainRune(2) };

// --- basics, mid-air, dodge counter (One, Two, Three) — Stage 4 opens Decipher
const BA1 = sigrikaAction("Basic - One, Two, Three 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 52.97, energy: 0.84, concerto: 1.67, offtune: 2664 });
const BA2 = sigrikaAction("Basic - One, Two, Three 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 100.68, energy: 1.6, concerto: 3.18, offtune: 5064 });
const BA3 = sigrikaAction("Basic - One, Two, Three 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 111.36, energy: 1.76, concerto: 3.5, offtune: 5600 });
const BA4 = sigrikaAction("Basic - One, Two, Three 4", {
  node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 206.79, energy: 3.27, concerto: 6.51, offtune: 10400,
  updateBuffs: () => applyCurrent(DECIPHER, 1),
});
const MA = sigrikaAction("Mid-air - One, Two, Three", { node: Node.Normal, cast: Cast.MidAir, type: Type1.Basic, mv: 104.78, energy: 1.55, concerto: 3.1, offtune: 4960 });
const MDC = sigrikaAction("Dodge Counter - One, Two, Three (Mid-Air)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 206.17, energy: 3.05, concerto: 16.1, offtune: 9920 });
const DC = sigrikaAction("Dodge Counter - One, Two, Three", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 219.70, energy: 3.26, concerto: 16.5, offtune: 10026 });
const HA = sigrikaAction("Heavy - One, Two, Three", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 116.28, offtune: 5848, concerto: 3.66, energy: 1.84 });

// --- Decipher-gated finishers: both grant a Rune: Trust and exit Decipher, both Echo Skill DMG
//     (the migrated sheet only carries one row for the pair — same numbers used for both here)
const EBA = sigrikaAction("Basic - Elucidated", { node: Node.Normal, cast: Cast.Basic, type: Type1.Echo, mv: 307.79, offtune: 8259, energy: 2.6, concerto: 5.19, ...RUNE_TRUST });
const EDC = sigrikaAction("Dodge Counter - Decipher", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Echo, mv: 307.79, offtune: 8259, energy: 2.6, concerto: 15.19, ...RUNE_TRUST });

// --- resonance skill: BOOMY BOOM! (base), or — while in Decipher — BIG BOOMY BOOM! / Soliskin to
//     the Aid (the latter needs 50 Full Stop held, spends none), both banking a Rune: Answer
const Skill = sigrikaAction("Skill - BOOMY BOOM!", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 143.15, offtune: 7200, energy: 2.25, concerto: 4.5 });
const ESkill = sigrikaAction("Skill - BIG BOOMY BOOM!", { node: Node.Skill, cast: Cast.Skill, type: Type1.Echo, mv: 288.09, offtune: 7729, energy: 2.45, concerto: 4.86, ...RUNE_ANSWER });
const ESkill50 = sigrikaAction("Skill - Soliskin to the Aid", { node: Node.Skill, cast: Cast.Skill, type: Type1.Echo, mv: 278.26, offtune: 7466, energy: 2.36, concerto: 4.68, ...RUNE_ANSWER });

// --- forte circuit: Schemata of Runes lands its own hit and banks 50 Full Stop, spends the two
//     leftmost Runes, and its follow-up is whichever pair they were (spendRunes() below)
const RunicOutburst = sigrikaAction("Forte - Runic Outburst", { node: Node.Forte, type: Type1.Echo, mv: 117.67 + 205.92 + 264.75, energy: 10, concerto: 7, offtune: 24800 });
const RunicChainWhip = sigrikaAction("Forte - Runic Chain Whip", { node: Node.Forte, type: Type1.Echo, mv: 397.58, energy: 10.01, concerto: 7.03, offtune: 24802 });
const RunicSoliskin = sigrikaAction("Forte - Runic Soliskin", { node: Node.Forte, type: Type1.Echo, mv: 397.54, energy: 10, concerto: 7, offtune: 24800 });
const FHA = sigrikaAction("Forte Heavy - Schemata of Runes", {
  node: Node.Forte, cast: Cast.Heavy, type: Type1.Echo, mv: 132.51, energy: 3.34, concerto: 0.5, offtune: 2664, forte1: -2, forte2: 50,
  updateBuffs: spendRunes,
});

/** Learn My True Name: at 100 Full Stop, spends it all. */
const FSkill = sigrikaAction("Forte Skill - Learn My True Name", { node: Node.Forte, cast: Cast.Skill, type: Type1.Echo, mv: 1211.48, energy: 5.43, concerto: 30, offtune: 101336, forte2: -100 });

const Liberation = sigrikaAction("Liberation - Where Trust Leads Me!", {
  node: Node.Liberation, cast: Cast.Liberation, cutscene: true, type: Type1.Echo, mv: 861.43, concerto: 20, offtune: 50400, resetEnergy: true,
  updateBuffs: () => applyCurrent(DIVERGENT),
});

const Intro = sigrikaAction("Intro - Solsworn Etymology", { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 163.42, energy: 10, concerto: 10, offtune: 7736 });
/** In This Very Moment carries no team buff on her own page (unlike most other kits' outros). */
const Outro = sigrikaAction("Outro - In This Very Moment", { cast: Cast.Outro, type: Type1.Outro, mv: 795, concerto: -100, swapOut: true });

/* ------------------------------------------------------------------------------------ buffs */

/** True Names Aligned (Inherent Skill): a teammate's Echo Skill cast grants the whole team a stack
 *  of Blessing of Runes (up to 6) — +3% Aero/Echo Skill DMG a stack to whoever's active, +30%/+30%
 *  flat more at the full 6 for Sigrika specifically. Granted via `SIGRIKA_RESONATOR`'s own `updateGlobal()`
 *  (not this buff's own updateBuffs()) since a global buff's updateBuffs() can't fire before it's held once. */
const BLESSING_OF_RUNES = new Buff({
  name: "Sigrika: Blessing of Runes", maxStacks: 6,
  applyStats: () => {
    const held = stacksOfTeam(BLESSING_OF_RUNES);
    if (held >= 6 && isHeld(SIGRIKA_RESONATOR)) { addStat(Stat.DmgBonus, 30, Attribute.Aero); addStat(Stat.DmgBonus, 30, Type1.Echo); }

    if (isActive()) {
        addStat(Stat.DmgBonus, 3 * held, Attribute.Aero);
        addStat(Stat.DmgBonus, 3 * held, Type1.Echo);
    }
  },
});

/** True Names Aligned, in full: the ER-to-Echo-DMG conversion above, plus (via updateGlobal(), so
 *  it reacts to any team member's Echo cast) the Blessing of Runes grant that mechanic feeds. */
const SR_INHERENT_2 = new Inherent({
  name: "Inherent: True Names Aligned",
  updateGlobal: () => { if (casting(Cast.Echo)) applyTeam(BLESSING_OF_RUNES, 1); },
  convertStats: () => addStat(Stat.DmgBonus, Math.min(50, 2 * Math.max(0, Math.floor(getStat(Stat.Er)) - 125)), Type1.Echo),
});
/** True Names Invoked (Inherent Skill): casting Intro grants Convergent — the only source of it. */
const SR_INHERENT_1 = new Inherent({
  name: "Inherent: True Names Invoked",
  updateBuffs: () => { if (currentAction() === Intro) applyCurrent(CONVERGENT, 1); },
});

/** Whether the current action grants Sigrika a Rune — Elucidated/Decipher's own Dodge Counter
 *  variant (Trust), or BIG BOOMY BOOM!/Soliskin to the Aid (Answer). */
function gainsRune(): boolean {
  const a = currentAction();
  return a === EBA || a === EDC || a === ESkill || a === ESkill50;
}

/** Decipher: opened by Basic Attack Stage 4, closed by whichever finisher next grants a Rune.
 *  While up, Basic Attack becomes Elucidated and Dodge Counter its own Decipher variant. */
const DECIPHER = new Buff({
  name: "Sigrika: Decipher",
  updateBuffs: () =>  {
    lostOnSwap();
  },
  convertStats: () => { if (gainsRune()) revokeCurrent(DECIPHER); },
});

/** Convergent (Intro, 20s) doubles the next Rune gained, Divergent (Liberation, 20s) adds one of
 *  the opposite kind; Convergent takes priority when both stand, and neither takes effect at 100
 *  Full Stop. Both are read and spent by gainRune() below. */
const CONVERGENT = new Buff({ name: "Sigrika: Convergent" });
const DIVERGENT = new Buff({ name: "Sigrika: Divergent" });

/** The Rune store, one packed word: bits 0-7 are four two-bit slots oldest-first (1 Trust,
 *  2 Answer), bit 8 always set so an empty store is still a held buff. Hers from combat start;
 *  the display reads the slots off as she stands. */
const RUNES = new Buff({
  name: "Sigrika: Runes", maxStacks: 0x1ff,
  display: (): string => {
    let slots = "";
    for (let shift = 0; shift < 8; shift += 2) slots += "-TA"[(frozenStacks() >> shift) & 3]!;
    return `Sigrika: Runes [${slots}]`;
  },
});

/** Bank one Rune — 1 Trust, 2 Answer — into the store's first empty slot, and the count into
 *  forte1. Gated on a landed hit ("hitting a target directly with..."). Capacity is two Runes
 *  without Full Stop and four from 50: a gain at capacity shifts every Rune left, dropping the
 *  leftmost, and takes the last slot — the count stands. Convergent/Divergent, unless Full Stop is
 *  at 100, make the gain two: the same kind again, or the opposite. */
function gainRune(kind: number): void {
  if (!currentAction().mv) return;
  let extra = 0;
  if (forte2() < 100) {
    if (isHeld(CONVERGENT)) { extra = kind; revokeCurrent(CONVERGENT); }
    else if (isHeld(DIVERGENT)) { extra = 3 - kind; revokeCurrent(DIVERGENT); }
  }
  pushRune(kind);
  if (extra) pushRune(extra);
}
function pushRune(kind: number): void {
  const cap = forte2() >= 50 ? 4 : 2;
  const word = stacksOf(RUNES);
  let runes = word & 0xff, n = 0;
  while (n < 4 && (runes >> (2 * n)) & 3) n++;
  if (n >= cap) { runes >>= 2; n--; } else addStat(Stat.AddForte1, 1);
  setStacksSelf(RUNES, (word & ~0xff) | runes | (kind << (2 * n)));
}

/** Schemata of Runes spends the two leftmost Runes and plays the follow-up they make: Trust and
 *  Answer for Runic Outburst, two Trusts for Chain Whip, two Answers for Soliskin. Without a pair
 *  nothing follows, and the action's own -2 leaves forte1 red. */
function spendRunes(): void {
  const word = stacksOf(RUNES), a = word & 3, b = (word >> 2) & 3;
  setStacksSelf(RUNES, (word & ~0xff) | ((word & 0xff) >> 4));
  if (!a || !b) return;
  queue(a !== b ? RunicOutburst : a === 1 ? RunicChainWhip : RunicSoliskin);
}

/** Innate Gift?: up to 2 frozenStacks, each +30% Echo Skill DMG Amplification — granted when a Runic
 *  follow-up spends a full 30 Soliskin Vitality. Ends after Learn My True Name, or on swap-off. */
const INNATE_GIFT = new Buff({
  name: "Sigrika: Innate Gift?", maxStacks: 2,
  applyStats: () => {
    const a = currentAction();
    if (a === RunicChainWhip || a === RunicOutburst || a === RunicSoliskin || a === FSkill) {
        addStat(Stat.Amp, 30 * frozenStacks(), Type1.Echo);
        if (a === FSkill) revokeCurrent(INNATE_GIFT);
    }
  },
  updateBuffs: () => lostOnSwap(),
});

/** Soliskin Vitality: a genuine 0-60 gauge, +10 whenever any team member casts an Echo Skill
 *  (granted via `SIGRIKA_RESONATOR`'s own updateGlobal(), same reasoning as Blessing of Runes above). Spent
 *  by whichever Runic follow-up fires: 30+ points spends exactly 30 for +50% DMG Multiplier and a
 *  stack of Innate Gift?; under 30 spends everything held for +15% DMG Amplification per 10 points. */
const SOLISKIN_VITALITY = new Buff({
  name: "Sigrika: Soliskin Vitality", maxStacks: 60,
  updateBuffs: () => {
    const a = currentAction();
    if (a !== RunicOutburst && a !== RunicChainWhip && a !== RunicSoliskin) return;
    const held = frozenStacks();
    if (held >= 30) { applyCurrent(INNATE_GIFT, 1); }
  },
  applyStats: () => {
    const a = currentAction();
    if (a !== RunicOutburst && a !== RunicChainWhip && a !== RunicSoliskin) return;
    const held = frozenStacks();
    if (held >= 30) { addStat(Stat.MulMv, 50); }
    else if (held > 0) addStat(Stat.Amp, 15 * Math.floor(held / 10));
  },
  convertStats: () => {
    const a = currentAction();
    if (a === RunicOutburst || a === RunicChainWhip || a === RunicSoliskin) {
      removeStack(SOLISKIN_VITALITY, Math.min(frozenStacks(), 30));
    }
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
const SIGRIKA_TALENTS = new Talent({
  name: "Talents: Sigrika",
  constantStats: () => { addStat(Stat.CritRate, 8); addStat(Stat.BonusAtk, 12); },
});

/** Her, as a Resonator: name/element/weapon, every grant/spend/queue rule her kit needs, and her
 *  own base stat line. */
const SIGRIKA_RESONATOR = new Resonator({
  name: "Sigrika",
  talent: SIGRIKA_TALENTS,
  inherent1: SR_INHERENT_1,
  inherent2: SR_INHERENT_2,
  element: Attribute.Aero,
  weapon: WeaponType.Gauntlets,
  intro: () => Intro,
  outro: () => Outro,
  color: "#7ee0c9",
  maxEnergy: 125,
  maxForte1: 4,
  maxForte2: 100,

  // the Rune store, empty (its always-set bit alone; see RUNES)
  combatStart: () => applyCurrent(RUNES, 1 << 8),
  // Soliskin Vitality's own gain — any team member's Echo cast
  updateGlobal: () => { if (casting(Cast.Echo)) applyCurrent(SOLISKIN_VITALITY, 10); },

  constantStats: () => {
    addStat(Stat.BaseHp, 10775); addStat(Stat.BaseAtk, 437.5); addStat(Stat.BaseDef, 1137);
  },
});

/** The kit-valid line: the Intro's Convergent makes the first Elucidated two Trusts, which the
 *  first Schemata spends for Chain Whip and 50 Full Stop; the Liberation's Divergent makes the
 *  second Elucidated a Trust and an Answer, which the second Schemata spends for Runic Outburst
 *  and the 100 Full Stop Learn My True Name takes. She's never the team's own lead, so this same
 *  rotation covers both. */

const BA234 = new ActionGroup("Basic - One, Two, Three 234", [BA2, BA3, BA4]);

const SR_ROTATION = new Rotation([
  INTRO, ECHO_ONFIELD, 
  BA234, EBA, FHA, Liberation,
  BA234, EBA, FHA, FSkill,
  Skill, BA3, BA4, EBA,
  OUTRO,
]);

const SR_ROTATION_FAST = new Rotation([
  INTRO, ECHO_ONFIELD, 
  BA234, EBA, FHA, Liberation,
  BA234, EBA, FHA, FSkill,
  OUTRO,
]);

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills + Forte Circuit, weapon,
// mainslot echo, sonata pieces, mainstat/substat
export const SIGRIKA = new Loadout({
  resonator: SIGRIKA_RESONATOR,
  weapons: [SOLSWORN_CIPHERS, NEW_STD_GAUNTLET, ABYSS_SURGES],
  echoLoadouts: [new EchoLoadout(NAMELESS_EXPLORER, SOUND_OF_TRUE_NAME_5PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Aero3, Mainstat.ER3, Mainstat.ATK1),
  substat: substats(Substat.AtkPct, Substat.Basic, Substat.FlatAtk),
  highSubstat: highSubs(Substat.Er, Substat.FlatAtk, Substat.AtkPct, Substat.FlatAtk),
    rotation: SR_ROTATION,
});

// her real 43311 build: resonator + talents + both Inherent Skills + Forte Circuit, weapon,
// mainslot echo, sonata pieces, mainstat/substat
export const SIGRIKA_FAST = new Loadout({
  resonator: SIGRIKA_RESONATOR,
  weapons: [SOLSWORN_CIPHERS, NEW_STD_GAUNTLET, ABYSS_SURGES],
  echoLoadouts: [new EchoLoadout(NAMELESS_EXPLORER, SOUND_OF_TRUE_NAME_5PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Aero3, Mainstat.ER3, Mainstat.ATK1),
  substat: substats(Substat.AtkPct, Substat.Basic, Substat.FlatAtk),
  highSubstat: highSubs(Substat.Er, Substat.FlatAtk, Substat.AtkPct, Substat.FlatAtk),
    rotation: SR_ROTATION_FAST,
});
