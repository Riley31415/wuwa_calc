/**
 * Jingran, ported to the new engine — sequence-0 core loop only.
 *
 * Numbers from nanoka.cc (character 1512-ish family, Fusion broadblade).
 *
 *   Qi           forte1; a heavy attack costs 300, restored by basics/intro/skill follow-ups/
 *                dodge counters/liberation — every one of those declares its own delta straight
 *                on the action (`forte1: 50`/`100`/`200`/`-300`), no manual setForte1 anywhere in
 *                this file. No ceiling enforced (kit.ts's own addForte1 floors at 0, never caps).
 *   Mingfire     forte2; 100 from liberation (also a declared `forte2: 100`), 25 per heavy while
 *                lit — that spend, and the +200 Qi refund above 25, both go through
 *                `addStat(AddForte1/AddForte2, ...)` inside Fire of Life's own convert() (below)
 *                rather than a bare setForte1/setForte2 call, so both trace back to it in the
 *                forte columns' own hover instead of landing as an unexplained gauge change.
 *   Ghost Shroud stacking buff, max 50; his intro spends it all for Fortune in Disguise.
 *
 * Trace the Vestige and Fixation both react to *any* team member's shield, not just his own — via
 * updateGlobal(), which runs for every slot's own held gear every action regardless of whose turn
 * it actually is (kit.ts's own evaluate()), rather than needing to be genuinely team-wide buffs
 * just to be reachable from a teammate's turn. Trace the Vestige lives directly on the JINGRAN
 * Resonator itself below (it's unconditional the whole fight, nothing to hold separately);
 * Fixation is its own self-held Buff since it has real on/off state (granted, spent, re-granted).
 */
import {
  Buff, Resonator, Action, ECHO_CAST, INTRO, Stat, Element, WeaponType, Type1, Cast, Node, Scaling,
  applySelf, forte2, setForte2, stacksOf, currentAction, AddForte1, AddForte2,
  currentTeam, queue, revoke, addStat, get, stacks,
} from "../kit.js";
import { JINGRAN_SIG } from "../weapons/broadblade.js";
import { MYRIAD_SNARE, LAMP_5PC, LAMP_2PC } from "../echoes/mengzhou.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";

/** The HP fold every HP-scaled conversion below reads — same formula evaluate() itself uses,
 *  just callable mid-kit rather than only off a finished Snapshot. Only ever accurate from
 *  convert(): every other held Gear's own apply() has to have already run. */
function hp(): number {
  const base = get(Stat.BaseHp);
  return base + get(Stat.BonusHp) / 100 * base + get(Stat.FlatHp);
}

/** Same fold, for DEF — what `JINGRAN_HP_TO_FUSION` reads to zero his own DEF out exactly
 *  (see its own convert() below), same convert()-only accuracy caveat as `hp()` above. */
function def(): number {
  const base = get(Stat.BaseDef);
  return base + get(Stat.BonusDef) / 100 * base + get(Stat.FlatDef);
}

/** How many whole 1000-HP steps his HP-scaled conversions read, capped at 50 (the 50,000 HP
 *  ceiling every one of them shares). */
function hpSteps(): number { return Math.floor(Math.min(hp(), 50000) / 1000); }

/** The breakpoint itself, written the way the game does — "@50k HP" once he's over the shared
 *  50,000 ceiling, "@37k HP" short of it — for each HP-scaled buff's own display() to name itself
 *  after. Not a stack count: none of these are actually a stacking buff (Fortune in Disguise is
 *  the one exception, and it has a real stack count of its own — see its own display() below),
 *  so showing "x37" the way a stacking buff would misread as one. */
function hpThreshold(): string { return `@${hpSteps()}k HP`; }

/* ------------------------------------------------------------------------------------ buffs */

/** Ghost Shroud — a resource; the stack count *is* the value. His intro spends it. */
export const JINGRAN_GHOST_SHROUD = new Buff({ name: "Jingran: Ghost Shroud", maxStacks: 50 });

/** Earth Charm — granted by Intro Skill (Question the Tombs), Encroaching Yin, or Scorching
 *  Yang. No stat of its own to model (nothing here reads it yet), so it's a do-nothing marker —
 *  present in the resonator popover once one of those three casts, permanent uptime after. */
export const JINGRAN_EARTH_CHARM = new Buff({ name: "Jingran: Earth Charm" });

/** Fortune in Disguise — fusion damage scaled off Max HP per stack, own ceiling. The one HP-scaled
 *  buff here with a real stack count of its own (Ghost Shroud converts 1:1 into it on his intro),
 *  so its own display() reproduces the same "name xN" a plain stacking Buff would show by default
 *  (there's no literal `super` for a plain function field to call for it) and appends the HP
 *  breakpoint after — "Fortune in Disguise x37 @50k HP" reads both numbers apart instead of
 *  conflating them into one. */
export const JINGRAN_FORTUNE = new Buff({
  name: "Jingran: Fortune in Disguise", maxStacks: 50,
  display: (): string => `${JINGRAN_FORTUNE.name} x${stacks()} ${hpThreshold()}`,
  convert: () => {
    const steps = hpSteps(); // 0.05% fusion per 1000 Max HP per stack, capped at 2.5%
    addStat(Stat.DmgBonus, Math.min(2.5, 0.05 * steps) * stacks(), Element.Fusion);
  },
});

/** Fixation — a one-shot permission: the next teammate (not his own) shield after it's granted
 *  pays an extra flat 15 Ghost Shroud on top of Trace the Vestige's own rate, and spends it.
 *  A self buff — `updateGlobal()` is what makes it react to a teammate's own turn despite that,
 *  same as Trace the Vestige on the Resonator itself below. During this call `currentSlot` is
 *  switched to whoever actually holds this Buff (Jingran, always, since it's self-applied) rather
 *  than left on whoever's turn it really is — so `revoke()`/`applySelf()` below still resolve
 *  against him specifically, exactly as if he were the one acting. */
export const JINGRAN_FIXATION = new Buff({
  name: "Jingran: Fixation",
  updateGlobal: () => {
    if (currentTeam().slot.resonator === JINGRAN || !currentAction().shields) return;
    revoke(JINGRAN_FIXATION);
    applySelf(JINGRAN_GHOST_SHROUD, 15);
  },
});

/** Nether to Light (Inherent Skill): his DEF is fixed at 0, plus two HP -> stat conversions in
 *  whole 1000 HP steps: Incoming Healing Bonus and Fusion DMG Bonus. Healing Bonus is unused by
 *  the formula (healing is out of scope), tracked for completeness only.
 *  The DEF fix reads whatever total every other held Gear's own apply() already built this
 *  action (`def()` above, same "only accurate from convert()" reasoning `hp()` carries) and adds
 *  the exact negative of it — nets to precisely 0 regardless of what fed it, rather than a flat
 *  -99999 that only ever worked by being comfortably bigger than any real total could reach. */
export const JINGRAN_HP_TO_FUSION = new Buff({
  name: "Jingran: Nether to Light",
  display: () => `Jingran: Nether to Light ${hpThreshold()}`,
  convert: () => {
    addStat(Stat.FlatDef, -def());
    const steps = hpSteps();
    addStat(Stat.HealingTaken, 6.2 * steps); // 6.2% Incoming Healing Bonus per 1000 HP, capped 310%
    addStat(Stat.DmgBonus, 1.5 * steps, Element.Fusion); // 1.5% fusion per 1000 HP, capped 75%
  },
});
export const JINGRAN_HP_TO_ATK = new Buff({
  name: "Jingran: Yang Changes, Yin Unites",
  display: () => `Jingran: Yang Changes, Yin Unites ${hpThreshold()}`,
  convert: () => {
    const steps = hpSteps();
    addStat(Stat.FlatAtk, 36 * steps); // 36 ATK/1000 HP, capped 1800
  },
});

/** Fire of Life: while Mingfire (forte2) is lit, a heavy attack burns up to 25 of it, summons
 *  Chimei Wangliang, boosts its own motion value off however much HP sits above the first 25,000,
 *  and — above 25 Mingfire specifically — refunds 200 Qi. Its own Gear rather than folded into
 *  the resonator's own convert() below, purely so these contributions keep their own name in the
 *  report instead of borrowing his plain "Jingran" identity: the Mingfire spend and Qi refund go
 *  through `addStat(AddForte2/AddForte1, ...)` rather than `setForte2`/`setForte1` directly, so
 *  both trace back to "Jingran: Fire of Life" in the forte columns' own hover the same way a
 *  stat contribution always does, instead of vanishing into an unexplained gauge change. Both
 *  rely on kit.ts's own addForteN flooring at 0 (never below), same as everywhere else a forte
 *  gauge is spent — no `Math.min(25, mingfire)` or ceiling clamp needed here for it.
 *  Self-applied by his own update() the moment a heavy attack catches Mingfire lit, so its
 *  convert() runs this same action, then revokes itself so it doesn't fire again on whatever he
 *  casts next. Revoking itself mid-action doesn't drop it from the resonator popover — kit.ts's
 *  own evaluate() captures what's held right after update(), before a self-revoking convert()
 *  like this one can pull it back out from under that list. */
function fireSteps(): number { return Math.max(0, Math.floor((Math.min(hp(), 50000) - 25000) / 1000)); }

export const JINGRAN_FIRE_OF_LIFE = new Buff({
  name: "Jingran: Fire of Life",
  // Same breakpoint every HP-scaled buff of his shows (hpThreshold(), the shared "@Nk HP" his
  // actual HP reaches) — not fireSteps() above, which is this buff's own internal scaling window
  // (only the HP sitting between 25k-50k), not a number meant to stand alone as his display.
  display: () => `Jingran: Fire of Life ${hpThreshold()}`,
  convert: () => {
    const a = currentAction();
    const mingfire = forte2();
    queue(ACTION_LIB_FUA);
    addStat(AddForte2, -25);
    if (mingfire > 25) addStat(AddForte1, 200);
    addStat(Stat.AddMv, (a === FHA ? 21.65 : 21.10) * fireSteps()); // 2.17%+2.17%+4.33%+12.98% / 1.48%x2+1.90%x3+12.44%
    revoke(JINGRAN_FIRE_OF_LIFE);
  },
});

/* ----------------------------------------------------------------------------------- actions */

function jingranAction(id: string, def: object): Action {
  return new Action(id, { element: Element.Fusion, scaling: Scaling.Atk, ...def });
}

// energy/concerto/offtune are his own kit's real generation per cast — Liberation's own old
// declared "spend the bar" cost isn't repeated here (TODO_ENGINE.md: that's what
// Resonator.maxEnergy and the engine's own outro handling are for).
// --- basics and mid-air. Stages 3/4 restore Qi. Unprefixed = Yang Font's own basic combo
//     (Devil's Bane); "Drink Soul" is Yin Vessel's.
export const BA1 = jingranAction("Basic - Devil's Bane 1", { node: Node.Normal, cast: Cast.Basic, shields: 1, type: Type1.Basic, mv: 39.82, energy: 0.67, concerto: 1.34, offtune: 2136 });
export const BA2 = jingranAction("Basic - Devil's Bane 2", { node: Node.Normal, cast: Cast.Basic, shields: 1, type: Type1.Basic, mv: 99.47, energy: 1.68, concerto: 3.35, offtune: 5337 });
export const BA3 = jingranAction("Basic - Devil's Bane 3", { node: Node.Normal, cast: Cast.Basic, shields: 1, type: Type1.Heavy, mv: 159.1, energy: 2.69, concerto: 5.36, offtune: 8537, forte1: 50 });
export const BA4 = jingranAction("Basic - Devil's Bane 4", { node: Node.Normal, cast: Cast.Basic, shields: 1, type: Type1.Heavy, mv: 124.24, energy: 2.09, concerto: 4.18, offtune: 6666, forte1: 50 });
export const MA = jingranAction("Basic - Edge of Life and Death (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, shields: 1, type: Type1.Basic, mv: 92.45, energy: 1.55, concerto: 3.1, offtune: 4960 });

export const EBA1 = jingranAction("Basic - Drink Soul 1", { node: Node.Normal, cast: Cast.Basic, shields: 1, type: Type1.Basic, mv: 44.74, energy: 0.75, concerto: 1.5, offtune: 2400 });
export const EBA2 = jingranAction("Basic - Drink Soul 2", { node: Node.Normal, cast: Cast.Basic, shields: 1, type: Type1.Basic, mv: 74.56, energy: 1.26, concerto: 2.5, offtune: 4000 });
export const EBA3 = jingranAction("Basic - Drink Soul 3", { node: Node.Normal, cast: Cast.Basic, shields: 1, type: Type1.Heavy, mv: 109.32, energy: 1.84, concerto: 3.68, offtune: 5864, forte1: 50 });
export const EBA4 = jingranAction("Basic - Drink Soul 4", { node: Node.Normal, cast: Cast.Basic, shields: 1, type: Type1.Heavy, mv: 153.16, energy: 2.6, concerto: 5.16, offtune: 8218, forte1: 50 });

// --- dodge counters: Light Watch (Yang Font), Nether Dive (Yin Vessel), 100 Qi each
export const DC = jingranAction("Basic - Light Watch", { node: Node.Normal, cast: Cast.DodgeCounter, shields: 1, type: Type1.Heavy, mv: 198.8, energy: 3.36, concerto: 6.68, offtune: 10664, forte1: 100 });
export const EDC = jingranAction("Basic - Nether Dive", { node: Node.Normal, cast: Cast.DodgeCounter, shields: 1, type: Type1.Heavy, mv: 248.57, energy: 4.19, concerto: 8.36, offtune: 13337, forte1: 100 });

// --- resonance skill. Scorching Yang/Afterlife's Guide are Yang Font's own tap+hold pair;
//     Encroaching Yin/Netherworld Traverse are Yin Vessel's.
export const Skill1 = jingranAction("Skill - Scorching Yang", { node: Node.Skill, cast: Cast.Skill, shields: 1, type: Type1.Skill, mv: 164.04, energy: 1.75, concerto: 3.5, offtune: 5600 });
export const ESkill1 = jingranAction("Skill - Encroaching Yin", { node: Node.Skill, cast: Cast.Skill, shields: 1, type: Type1.Skill, mv: 164.04, energy: 1.75, concerto: 3.5, offtune: 5600 });
export const Skill2 = jingranAction("Skill - Afterlife's Guide", { node: Node.Skill, cast: Cast.Skill, shields: 1, type: Type1.Heavy, mv: 258.47, energy: 3.35, concerto: 5, offtune: 10667, forte1: 100 });
export const ESkill2 = jingranAction("Skill - Netherworld Traverse", { node: Node.Skill, cast: Cast.Skill, shields: 1, type: Type1.Heavy, mv: 263.48, energy: 3.43, concerto: 5, offtune: 10936, forte1: 100 });

// --- liberation
export const Lib = jingranAction("Liberation - Burial of Thousand Souls", {
  node: Node.Liberation, cast: Cast.Liberation, shields: 2, type: Type1.Heavy, mv: 745.2, // 93.15% x 8
  offtune: 168000, forte1: 200, forte2: 100,
});
/** Chimei Wangliang — the Yinghuo follow-up, one per heavy attack while Mingfire is up. Node
 *  Liberation (attributed to it) but no `cast`: it's a summon, not a press. */
export const ACTION_LIB_FUA = jingranAction("Liberation - Chimei Wangliang", { node: Node.Liberation, type: Type1.Heavy, mv: 83.51 });

// --- intro / outro
export const Intro = jingranAction("Intro - Question the Tombs", { node: Node.Intro, cast: Cast.Intro, shields: 1, type: Type1.Intro, mv: 198.81, energy: 10, concerto: 10, offtune: 8000, forte1: 100 });
export const Outro = jingranAction("Outro - Rising Fortune and Ebbing Evil", { cast: Cast.Outro, type: Type1.Outro, mv: 795, active: false });

// --- heavy attacks ("forte skills"). Unprefixed = Yang Font's own (FHA = Stardome Meander,
//     switches him to Yin Vessel on landing), EFHA (Yin Vessel's own) = Soul Raid.
export const FHA = jingranAction("Forte - Stardome Meander", { node: Node.Forte, cast: Cast.Heavy, shields: 2, type: Type1.Heavy, mv: 240.38, energy: 8.5, concerto: 13, offtune: 10400, forte1: -300 }); // 24.04%+24.04%+48.08%+144.22%
export const EFHA = jingranAction("Forte - Soul Raid", { node: Node.Forte, cast: Cast.Heavy, shields: 2, type: Type1.Heavy, mv: 234.29, energy: 8.53, concerto: 13, offtune: 10140, forte1: -300 }); // 16.40%x2+21.09%x3+138.22%

/** His, as a Resonator: name/element/weapon, every grant/spend/queue rule his kit needs, and his
 *  own base stat line. The stat-tree talent bonus lives in its own `JINGRAN_TALENTS` buff below
 *  — just another piece of his loadout, not special-cased on the Resonator itself. */
export const JINGRAN = new Resonator({
  name: "Jingran",
  element: Element.Fusion,
  weapon: WeaponType.Broadblade,
  intro: () => Intro,
  color: "#f2603c",
  maxEnergy: 12500,

  // permanent passives, plus his own Ghost Shroud top-up and Fixation's first grant
  combatStart: () => {
    applySelf(JINGRAN_HP_TO_FUSION, 1);
    applySelf(JINGRAN_HP_TO_ATK, 1);
    applySelf(JINGRAN_FIXATION, 1); // "upon engaging in combat, Jingran gains Fixation"
    applySelf(JINGRAN_GHOST_SHROUD, 25); // "upon entering combat, tops Ghost Shroud up to 25"
  },

  // Trace the Vestige: unconditional the whole fight, so it lives straight here rather than in
  // its own held Buff — his own shield pays 1 stack of Ghost Shroud, a teammate's pays 2.
  // updateGlobal() (not update()) is what runs this on a teammate's own turn: `currentSlot` is
  // switched to Jingran's own slot for the call regardless of who's actually acting, so
  // `applySelf()` below always banks onto him specifically.
  updateGlobal: () => {
    const shields = currentAction().shields;
    if (!shields) return;
    const own = currentTeam().slot.resonator === JINGRAN;
    applySelf(JINGRAN_GHOST_SHROUD, shields * (own ? 1 : 2));
  },

  update: () => {
    const a = currentAction();
    if (a === Intro || a === Skill1 || a === ESkill1) applySelf(JINGRAN_EARTH_CHARM, 1);
    if (a === Intro) {
      const shroud = stacksOf(JINGRAN_GHOST_SHROUD);
      if (shroud) { revoke(JINGRAN_GHOST_SHROUD); applySelf(JINGRAN_FORTUNE, shroud); }
    }
    if (a === Outro) {
      setForte2(0); revoke(JINGRAN_FORTUNE);
      applySelf(JINGRAN_FIXATION, 1);
    }
    // granted here, not read here — JINGRAN_FIRE_OF_LIFE's own convert() does the spend/queue/
    // MV-boost/Qi-refund work, this same action (apply()/convert() re-reads what update() just
    // granted)
    if ((a === FHA || a === EFHA) && forte2() > 0) applySelf(JINGRAN_FIRE_OF_LIFE, 1);
  },

  apply: () => {
    addStat(Stat.BaseHp, 15375); addStat(Stat.BaseAtk, 313); 
    addStat(Stat.Er, 100); addStat(Stat.CritRate, 5); addStat(Stat.CritDmg, 150);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from his kit
export const JINGRAN_TALENTS = new Buff({
  name: "Jingran: Talents",
  apply: () => { addStat(Stat.CritRate, 8); addStat(Stat.BonusHp, 12); }
});

/** Qi economy: intro 100, liberation +200 to 300, each of the four heavy
 *  attacks spends 300 and the first three refund 200 while Mingfire is above 25.*/
export const JR_ROTATION = [
  INTRO, Lib, FHA,
  EBA2, EBA3, EBA4, EFHA,
  Skill1, Skill2, FHA,
  ESkill1, ESkill2, EFHA,
  ECHO_CAST, Outro,
];

/* ----------------------------------------------------------------------------------- loadout */

// his real 44111 build: resonator + talents, weapon, mainslot echo, sonata pieces, mainstat/substat
export const JR_LOADOUT = [
  JINGRAN, JINGRAN_TALENTS,
  JINGRAN_SIG,
  MYRIAD_SNARE, LAMP_5PC, LAMP_2PC,
  mainstats("CD CD", "", "hp hp hp"), chem("hp", "heavy"),
];
