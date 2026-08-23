/**
 * Phrolova, ported to the new engine — sequence-0 core loop only.
 * Maestro (open/charges/next-note) is one stacking Buff rather than three separate mechanics —
 * see MAESTRO's own comment for how a single stack count carries all three.
 */
import {
  Buff, Talent, Inherent, Resonator, Loadout, Action, ECHO_CAST, INTRO, Stat, Attribute, WeaponType, Type1, Cast, Node, Scaling,
  applySelf, stacksOf, currentAction, casting, queue, queueOutro,
  revoke, addStat, stacks,
  lostOnSwap,
} from "../kit.js";
import { LETHEAN_ELEGY } from "../weapons/rectifier.js";
import { DREAM_OF_THE_LOST_3PC } from "../echoes/septimont.js";
import { NM_HECATE, MIDNIGHT_VEIL_2PC } from "../echoes/rinascita.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function phroAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Havoc, scaling: Scaling.Atk, ...def });
}

// energy/concerto come off the migrated sheet's combined BA12/BA23/BA123 rows — BA1/BA2 are
// derived by subtraction, cross-checked both ways against BA12 and BA23.
export const BA1 = phroAction("Basic - Movement of Life and Death 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 106.9, energy: 1.68, concerto: 3.36 });
export const BA2 = phroAction("Basic - Movement of Life and Death 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 95.43, energy: 1.5, concerto: 3 });
export const BA3 = phroAction("Basic - Movement of Life and Death 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 196.14, energy: 3.12, concerto: 6.18, forte1: 1 });

export const Skill = phroAction("Skill - Whispers in a Fleeting Dream", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 211.94, energy: 13.34, concerto: 10, forte1: 1 });

export const FBA = phroAction("Forte - Movement of Fate and Finality", { node: Node.Forte, cast: Cast.Basic, type: Type1.Skill, mv: 505.01, energy: 3.21, concerto: 10.02, forte1: 1 });
export const FSkill = phroAction("Forte - Murmurs in a Haunting Dream", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, mv: 464.07, energy: 2.95, concerto: 10, forte1: 1 });

export const ScarletCoda = phroAction("Heavy - Scarlet Coda", {
  node: Node.Normal, cast: Cast.Heavy, cast2: Cast.Echo, type: Type1.Skill, mv: 660.16, energy: 6.93, concerto: 40, forte1: -6,
});

// concerto only — Liberation costs no Resonance Energy (maxEnergy: 0 below). The sheet's separate
// "Lib2" row (465.22% MV) has no matching action here — a known gap, flagged rather than guessed.
export const Liberation = phroAction("Liberation - Waltz of Forsaken Depths", {
  node: Node.Liberation, cast: Cast.Liberation, mv: 0, concerto: 20,
});

export const Intro = phroAction("Intro - Suite of Quietus", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 201.52, energy: 10, concerto: 10,
});
/** Maestro-replaced Intro — used whenever she re-enters with Maestro still open. Playing it is
 *  also what closes Maestro back out (see MAESTRO's own convert() below). */
export const EIntro = phroAction("Intro - Suite of Immortality", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Skill, mv: 596.43, energy: 10, concerto: 10,
});
export const Outro = phroAction("Outro - Unfinished Piece", {
  cast: Cast.Outro, mv: 0, active: false,
});

function hecateAction(id: string, mv: number): Action {
  return new Action(id, { element: Attribute.Havoc, scaling: Scaling.Atk, type: Type1.Echo, active: false, mv });
}
export const EBA_STRINGS = hecateAction("Hecate - Enhanced Strings", 347.93);
export const EBA_WINDS   = hecateAction("Hecate - Enhanced Winds", 330.53);
export const EBA_CADENZA = hecateAction("Hecate - Enhanced Cadenza", 347.93);
export const HBA1 = hecateAction("Hecate - Basic 1", 27.84);
export const HBA2 = hecateAction("Hecate - Basic 2", 27.84);

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

/** Maestro: open/charges/next-note as one stacking buff. Can't be held at 0 stacks, so the count
 *  is notes-drawn-so-far *plus one* (granted at 1, maxing at 13); `stacksOf(MAESTRO) - 1` is the
 *  real notes-drawn number everywhere below. Ends the moment Suite of Immortality (EIntro) plays. */
export const MAESTRO = new Buff({
  name: "Phrolova: Maestro", maxStacks: 13,
  update: () => { if (currentAction() === EIntro) revoke(MAESTRO); },
  apply: () => addStat(Stat.BonusAtk, 120),
  // Any active Echo Skill cast (hers or a teammate's) spends a charge and draws a note.
  // updateGlobal() forces currentSlot to Phrolova's own slot so drawNote() resolves against her.
  updateGlobal: () => {
    const a = currentAction();
    if (casting(Cast.Echo) && a.active && stacks() < 11) drawNote();
  },
  // the note that just played, or (if this row isn't one of the Hecate notes) the one coming next
  display: (): string => {
    const justPlayed = NOTE_LABEL.get(currentAction());
    if (justPlayed) return `Maestro: ${justPlayed}`;
    const next = SEQUENCE[Math.min(SEQUENCE.length - 1, stacks() - 1)]!;
    return `Maestro: ${NOTE_LABEL.get(next)}`;
  },
});

/** Accidental (Inherent Skill): interrupt resistance/damage-taken reduction on Echo Skill cast —
 *  out of scope for this calculator's formula, so this is a do-nothing presence marker, consumed
 *  the instant one of her +100-forte actions fires. */
export const ACCIDENTAL = new Buff({
  name: "Phrolova: Accidental",
  convert: () => {
    const a = currentAction();
    if (a === BA3 || a === Skill || a === FBA || a === FSkill) revoke(ACCIDENTAL);
  },
});
/** Accidental's own trigger — always-equipped Inherent Skill piece. */
export const PH_INHERENT_1 = new Inherent({
  name: "Phrolova: Accidental",
  update: () => { const a = currentAction(); if (a === Intro || a === EIntro || casting(Cast.Echo)) applySelf(ACCIDENTAL, 1); },
});
/** No combat-formula effect this engine models — still equipped, just doesn't hand out a stat. */
export const PH_INHERENT_2 = new Inherent({ name: "Phrolova: Inherent Skill 2" });

export const PHROLOVA_OUTRO = new Buff({
  name: "Phrolova: Outro",
  apply: () => { addStat(Stat.Amp, 20, Attribute.Havoc); addStat(Stat.Amp, 25, Type1.Heavy); },
  update: () => { lostOnSwap(); },
});

/** Her, as a Resonator: name/element, every grant/spend/queue rule her kit needs, and her own
 *  base stat line. */
export const PHROLOVA = new Resonator({
  name: "Phrolova",
  element: Attribute.Havoc,
  weapon: WeaponType.Rectifier,
  color: "#c6547a",
  // Maestro still open means Suite of Immortality (EIntro) instead of plain Intro
  intro: () => (stacksOf(MAESTRO) ? EIntro : Intro),
  maxEnergy: 0,

  // Octet: 10 Aftersound the instant she's on the team, not tied to when she first acts
  combatStart: () => applySelf(AFTERSOUND, 10),

  update: () => {
    const a = currentAction();
    if (currentAction() === Outro) queueOutro(PHROLOVA_OUTRO);
    if (a === Liberation) applySelf(MAESTRO, 1); // opens Maestro: 1 stack = 0 notes drawn
    if (a === EBA_STRINGS || a === EBA_WINDS || a === EBA_CADENZA) applySelf(AFTERSOUND, 1);
    // outro, while Maestro is open: auto cycle plus 2 more notes, not charge-gated
    if (a === Outro && stacksOf(MAESTRO)) { drawNote(); drawNote(); }
  },

  apply: () => {
    addStat(Stat.BaseHp, 10775); addStat(Stat.BaseAtk, 437.5); addStat(Stat.BaseDef, 1137);
    addStat(Stat.Er, 100); addStat(Stat.CritRate, 5); addStat(Stat.CritDmg, 150);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
export const PHROLOVA_TALENTS = new Talent({
  name: "Phrolova: Talents",
  apply: () => { addStat(Stat.CritRate, 8); addStat(Stat.BonusAtk, 12); },
});

// INTRO resolves to plain Intro or EIntro on its own (see her own intro() above)
// OPENER ROTATIONS DO NOT HAVE AN INTRO
export const PH_OPENER = [
  BA2, BA3, ECHO_CAST, FBA, Skill, FBA, BA1, BA2, BA3, FBA, ScarletCoda, Liberation, Outro,
];
export const PH_LOOP = [
  INTRO, BA3, ECHO_CAST, FBA, Skill, FBA, BA1, BA2, BA3, FBA, ScarletCoda, Liberation, Outro,
];

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills + Forte Circuit, weapon,
// mainslot echo, sonata pieces, mainstat/substat
export const PH_LOADOUT = new Loadout(
  PHROLOVA,
  PHROLOVA_TALENTS,
  PH_INHERENT_1,
  PH_INHERENT_2,
  LETHEAN_ELEGY,
  NM_HECATE,
  DREAM_OF_THE_LOST_3PC,
  MIDNIGHT_VEIL_2PC,
  mainstats("CD", "havoc havoc", "atk atk"),
  chem("atk", "skill"),
);
