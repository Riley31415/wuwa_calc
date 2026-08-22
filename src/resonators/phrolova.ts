/**
 * Phrolova, ported to the new engine — sequence-0 core loop only. S1-S6 deferred, weapon/echo
 * pieces come from her own gear files.
 *
 * The old FIFO note queue and hecateProgress countdown are gone, replaced with a fixed 12-item
 * sequence indexed by a running draw count: positions 0-9 are spent by Echo-triggered charges,
 * 10-11 are the Outro's own bonus draws. Maestro itself — whether it's open at all, how many
 * charges are left, and which note comes next — is one stacking Buff (`MAESTRO` below) rather
 * than three separate ones; see its own doc comment for how a single stack count carries all
 * three.
 */
import {
  Buff, Resonator, Gear, Action, ECHO_CAST, INTRO, Stat, Element, WeaponType, Type1, Cast, Node, Scaling,
  applySelf, stacksOf, currentAction, casting, queue, queueOutro,
  revoke, addStat, stacks,
} from "../kit.js";
import { LETHEAN_ELEGY } from "../weapons/rectifier.js";
import { NM_HECATE, DREAM_OF_THE_LOST_3PC } from "../echoes/septimont.js";
import { MIDNIGHT_VEIL_2PC } from "../echoes/rinascita.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";

/* ------------------------------------------------------------------------------------ buffs */

export const AFTERSOUND = new Buff({
  name: "Phrolova: Aftersound", maxStacks: 124,
  // first 24 stacks pay 2.5% Crit DMG each, every stack past that pays 1%, capped at 100% total
  apply: () => {
    const n = stacks(), held = Math.min(n, 24), overflow = n - held;
    addStat(Stat.CritDmg, Math.min(100, held * 2.5 + overflow));

    if (currentAction() === ScarletCoda) {
      addStat(Stat.AddMv, 82.55 * held);
    }
  },
});

/** Maestro — one stacking buff carrying all three of what used to be separate pieces: whether
 *  it's open at all (held at all, regardless of count), how many charge-gated Hecate procs are
 *  left, and which SEQUENCE position comes next. A fresh Buff can't be held at 0 stacks (the
 *  engine deletes a 0-stack entry outright — that's what "not held" *is*), so the stack count is
 *  notes-drawn-so-far *plus one*: granted at 1 (0 notes drawn), maxing at 13 (all 12 drawn).
 *  `stacksOf(MAESTRO) - 1` is the real notes-drawn number everywhere below reads it.
 *  +120% ATK unconditionally while held, no matter the count. Ends the moment Suite of Immortality
 *  (EIntro) plays — that's this cycle's own capstone, not a permanent state, so it still gets the
 *  bonus for that cast (convert() revokes only after apply() has already paid out this same
 *  action) and a fresh Liberation starts the next cycle from scratch. */
export const MAESTRO = new Buff({
  name: "Phrolova: Maestro", maxStacks: 13,
  update: () => { if (currentAction() === EIntro) revoke(MAESTRO); },
  apply: () => addStat(Stat.BonusAtk, 120),
  // Any active Echo Skill cast — hers or a teammate's — spends one of Maestro's 10 charges and
  // draws a note. updateGlobal() (not update()), and living on MAESTRO itself (not on the
  // Resonator), is what makes "or a teammate's" actually true and keeps it scoped to only while
  // Maestro is actually open: it only runs at all while this Buff is held, and while it runs,
  // `currentSlot` is switched to Phrolova's own slot regardless of who's really acting (kit.ts's
  // own evaluate()), so `stacks()`/`applySelf`/`queue` inside drawNote() all resolve against her.
  updateGlobal: () => {
    const a = currentAction();
    if (casting(Cast.Echo) && a.active && stacks() < 11) drawNote();
  },
  // "the note that just got used" when this row is one of the Hecate notes themselves, otherwise
  // "the note that will be used" next — whichever position stacks() - 1 now points at.
  // `stacks()`, not `stacksOf(MAESTRO)`: this runs *as* MAESTRO's own toString(), with
  // `currentBuff` already pointing at it, so `stacks()` reads the frozen count apply()/convert()
  // (and the resonator popover's own name generation) actually ran with — `stacksOf(MAESTRO)`
  // reads the live map instead, which convert() may have already revoked by the time this is
  // called (Suite of Immortality's own row: apply() paid out, then convert() ended it, then this
  // runs — a live read would see "gone" and index SEQUENCE at -1). */
  display: (): string => {
    const justPlayed = NOTE_LABEL.get(currentAction());
    if (justPlayed) return `Maestro: ${justPlayed}`;
    const next = SEQUENCE[Math.min(SEQUENCE.length - 1, stacks() - 1)]!;
    return `Maestro: ${NOTE_LABEL.get(next)}`;
  },
});

/** Accidental (Inherent Skill): casting an Echo Skill grants increased interrupt resistance and
 *  -30% damage taken for 15s — both out of scope for this calculator's own damage formula (damage
 *  taken/interrupt resistance, same "unused by the formula" treatment as healing elsewhere), so
 *  this is a do-nothing marker for it. Also covers "after Suite of Quietus, Suite of Immortality,
 *  or an Echo Skill, the next Volatile Note becomes Volatile Note - Cadenza" — no separate note
 *  variant modelled here either, so one presence marker stands in for both effects together.
 *  Granted by her own update() below (a buff can't grant itself into existence the first time —
 *  nothing runs its own update() before it's already held), consumed the instant one of her own
 *  +100-forte actions fires (BA3, Skill, FBA, FSkill) — self-contained from there via its own
 *  convert(), same shape as MAESTRO's own EIntro close above: it's still "spent by" that action,
 *  not already gone before it. */
export const ACCIDENTAL = new Buff({
  name: "Phrolova: Accidental",
  convert: () => {
    const a = currentAction();
    if (a === BA3 || a === Skill || a === FBA || a === FSkill) revoke(ACCIDENTAL);
  },
});

/* ----------------------------------------------------------------------------------- actions */

function phroAction(id: string, def: object): Action {
  return new Action(id, { element: Element.Havoc, scaling: Scaling.Atk, ...def });
}

// energy/concerto come off the migrated (old-engine) sheet, which only ever gave the basics chain
// combined (BA12/BA23/BA123 alongside BA3 alone) — BA1/BA2 below are derived by subtraction
// (BA1 = BA123-BA23, BA2 = BA123-BA3-BA1), cross-checked two ways: BA1+BA2 reproduces BA12
// exactly (3.18 energy, 6.36 concerto) and BA2+BA3 reproduces BA23 exactly (4.62 energy, 9.18
// concerto). Nothing here is a nanoka page read (see file header for why).
export const BA1 = phroAction("Basic - Movement of Life and Death 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 106.9, energy: 1.68, concerto: 3.36 });
export const BA2 = phroAction("Basic - Movement of Life and Death 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 95.43, energy: 1.5, concerto: 3 });
export const BA3 = phroAction("Basic - Movement of Life and Death 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 196.14, energy: 3.12, concerto: 6.18, forte1: 1 });

export const Skill = phroAction("Skill - Whispers in a Fleeting Dream", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 211.94, energy: 13.34, concerto: 10, forte1: 1 });

export const FBA = phroAction("Forte - Movement of Fate and Finality", { node: Node.Forte, cast: Cast.Basic, type: Type1.Skill, mv: 505.01, energy: 3.21, concerto: 10.02, forte1: 1 });
export const FSkill = phroAction("Forte - Murmurs in a Haunting Dream", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, mv: 464.07, energy: 2.95, concerto: 10, forte1: 1 });

export const ScarletCoda = phroAction("Heavy - Scarlet Coda", {
  node: Node.Normal, cast: Cast.Heavy, cast2: Cast.Echo, type: Type1.Skill, mv: 660.16, energy: 6.93, concerto: 40, forte1: -6,
});

// concerto only — Liberation costs no Resonance Energy at all (maxEnergy: 0 below), so the sheet's
// own blank energy cell is trusted as a real 0, not a gap. The sheet also carries a separate
// "Lib2" row (465.22% MV) with no matching action here — a real, sizeable chunk of Waltz of
// Forsaken Depths' own damage this port is still missing, flagged rather than guessed at.
export const Liberation = phroAction("Liberation - Waltz of Forsaken Depths", {
  node: Node.Liberation, cast: Cast.Liberation, mv: 0, concerto: 20,
});

export const Intro = phroAction("Intro - Suite of Quietus", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 201.52, energy: 10, concerto: 10,
});
/** Maestro-replaced Intro press — used whenever she re-enters with Maestro still open (any loop
 *  where a previous visit's own Liberation opened it and this one is the first cast since). Far
 *  higher MV than plain Intro (596.43 vs 201.52) — a real, large contributor. Playing it is also
 *  what closes Maestro back out — see MAESTRO's own convert() above. */
export const EIntro = phroAction("Intro - Suite of Immortality", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Skill, mv: 596.43, energy: 10, concerto: 10,
});
export const Outro = phroAction("Outro - Unfinished Piece", {
  cast: Cast.Outro, mv: 0, active: false,
});

export const PHROLOVA_OUTRO = new Buff({
  name: "Phrolova: Outro",
  apply: () => { addStat(Stat.Amp, 20, Element.Havoc); addStat(Stat.Amp, 25, Type1.Heavy); },
  // a plain window, not "lost on swap" wording — still counts on the recipient's own outro (see
  // jinzhou.ts's HERON_HANDOFF for the same shape)
  convert: () => { if (casting(Cast.Outro)) revoke(PHROLOVA_OUTRO); },
});

function hecateAction(id: string, mv: number): Action {
  return new Action(id, { element: Element.Havoc, scaling: Scaling.Atk, type: Type1.Echo, active: false, mv });
}
export const EBA_STRINGS = hecateAction("Enhanced - Hecate: Strings", 347.93);
export const EBA_WINDS   = hecateAction("Enhanced - Hecate: Winds", 330.53);
export const EBA_CADENZA = hecateAction("Enhanced - Hecate: Cadenza", 347.93);
export const HBA1 = hecateAction("Basic - Hecate 1", 27.84);
export const HBA2 = hecateAction("Basic - Hecate 2", 27.84);

const SEQUENCE: Action[] = [
  EBA_CADENZA, EBA_CADENZA, EBA_CADENZA,
  EBA_STRINGS, EBA_STRINGS,
  EBA_WINDS, EBA_WINDS,
  EBA_CADENZA, EBA_CADENZA, EBA_CADENZA,
  EBA_STRINGS, EBA_STRINGS,
];

// short name for whichever note SEQUENCE holds — what MAESTRO's own display() names itself after
const NOTE_LABEL = new Map<Action, string>([
  [EBA_CADENZA, "Cadenza"], [EBA_STRINGS, "Strings"], [EBA_WINDS, "Winds"],
]);

/** Queue the next undrawn note and advance MAESTRO's own count. */
function drawNote(): void {
  queue(SEQUENCE[Math.min(SEQUENCE.length - 1, stacksOf(MAESTRO) - 1)]!);
  applySelf(MAESTRO, 1);
}

/** Her, as a Resonator: name/element, every grant/spend/queue rule her kit needs, and her own
 *  base stat line. The stat-tree talent bonus lives in its own `PHROLOVA_TALENTS` buff below —
 *  just another piece of her loadout, not special-cased on the Resonator itself. */
export const PHROLOVA = new Resonator({
  name: "Phrolova",
  element: Element.Havoc,
  weapon: WeaponType.Rectifier,
  color: "#c6547a",
  // Maestro still open (a Liberation happened this visit and it hasn't reached EIntro yet — see
  // MAESTRO's own convert()) means Suite of Immortality (EIntro) instead of plain Intro
  intro: () => (stacksOf(MAESTRO) ? EIntro : Intro),
  // Liberation costs no Resonance Energy at all — see DREAM_OF_THE_LOST_3PC's own check
  maxEnergy: 0,

  // Octet: 10 Aftersound the instant she's on the team, not tied to when she first acts
  combatStart: () => applySelf(AFTERSOUND, 10),

  update: () => {
    const a = currentAction();

    if (a === Liberation) applySelf(MAESTRO, 1); // opens Maestro: 1 stack = 0 notes drawn, 10 charges

    // Accidental (Inherent Skill): Suite of Quietus, Suite of Immortality, or any Echo Skill cast
    // grants it; consumed by whichever of her own +100-forte actions fires next (see its own
    // convert() above)
    if (a === Intro || a === EIntro || casting(Cast.Echo)) applySelf(ACCIDENTAL, 1);

    if (a === EBA_STRINGS || a === EBA_WINDS || a === EBA_CADENZA) {
      applySelf(AFTERSOUND, 1);
    }

    // outro, while Maestro is open: auto cycle plus 2 more notes, not charge-gated
    if (a === Outro && stacksOf(MAESTRO)) {
      drawNote();
      drawNote();
    }
    if (a === Outro) queueOutro(PHROLOVA_OUTRO);
  },

  apply: () => {
    // her own kit-specific base line, plus the universal CR/ER/CD baseline every resonator carries
    addStat(Stat.BaseHp, 10775); addStat(Stat.BaseAtk, 437.5); addStat(Stat.BaseDef, 1137);
    addStat(Stat.Er, 100); addStat(Stat.CritRate, 5); addStat(Stat.CritDmg, 150);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
export const PHROLOVA_TALENTS = new Buff({
  name: "Phrolova: Talents",
  apply: () => { addStat(Stat.CritRate, 8); addStat(Stat.BonusAtk, 12); },
});

// INTRO resolves to plain Intro or EIntro on its own (see her own intro() above, just above) —
// same marker works for both the opener and every loop after
// OPENER ROTATIONS DO NOT HAVE AN INTRO
export const PH_OPENER = [
  BA2, BA3, ECHO_CAST, FBA, Skill, FBA, BA1, BA2, BA3, FBA, ScarletCoda, Liberation, Outro,
];
export const PH_LOOP = [
  INTRO, BA3, ECHO_CAST, FBA, Skill, FBA, BA1, BA2, BA3, FBA, ScarletCoda, Liberation, Outro,
];

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents, weapon, mainslot echo, sonata pieces, mainstat/substat
export const PH_LOADOUT: Gear[] = [
  PHROLOVA, PHROLOVA_TALENTS,
  LETHEAN_ELEGY,
  NM_HECATE, DREAM_OF_THE_LOST_3PC, MIDNIGHT_VEIL_2PC,
  mainstats("CD", "havoc havoc", "atk atk"), chem("atk", "skill"),
];
