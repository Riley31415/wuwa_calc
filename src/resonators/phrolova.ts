/**
 * Phrolova, ported to the new engine.
 * Maestro (open/charges/next-note) is one stacking Buff rather than three separate mechanics —
 * see MAESTRO's own comment for how a single stack count carries all three.
 */
import {
  Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Action, ECHO_CAST, INTRO, Stat, Attribute, WeaponType, Type1, Cast, Node, Scaling,
  applySelf, stacksOf, currentAction, casting, queue, queueOutro,
  revoke, addStat, stacks,
  lostOnSwap, Sequence, applyTeam, isHeld, setForte1,
} from "../kit.js";
import { LETHEAN_ELEGY, STRINGMASTER } from "../weapons/rectifier.js";
import { NEW_STD_RECTIFIER, COSMIC_RIPPLES } from "../weapons/standard.js";
import { DREAM_OF_THE_LOST_3PC } from "../echoes/septimont.js";
import { NM_HECATE, MIDNIGHT_VEIL_2PC } from "../echoes/rinascita.js";
import { mainstatOptions } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function phroAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Havoc, scaling: Scaling.Atk, ...def });
}

// energy/concerto come off the migrated sheet's combined BA12/BA23/BA123 rows — BA1/BA2 are
// derived by subtraction, cross-checked both ways against BA12 and BA23.
export const BA1 = phroAction("Basic - Movement of Life and Death 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 106.9, offtune: 5376, energy: 1.68, concerto: 3.36 });
export const BA2 = phroAction("Basic - Movement of Life and Death 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 95.43, offtune: 4800, energy: 1.5, concerto: 3 });
export const BA3 = phroAction("Basic - Movement of Life and Death 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 196.14, offtune: 9864, energy: 3.12, concerto: 6.18, forte1: 1 });

export const Skill = phroAction("Skill - Whispers in a Fleeting Dream", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 211.94, offtune: 4264, energy: 13.34, concerto: 10, forte1: 1 });

export const FBA = phroAction("Forte - Movement of Fate and Finality", { node: Node.Forte, cast: Cast.Basic, type: Type1.Skill, mv: 505.01, offtune: 10161, energy: 3.21, concerto: 10.02, forte1: 1 });
export const FSkill = phroAction("Forte - Murmurs in a Haunting Dream", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, mv: 464.07, offtune: 9338, energy: 2.95, concerto: 10, forte1: 1 });

export const ScarletCoda = phroAction("Heavy - Scarlet Coda", {
  node: Node.Normal, cast: Cast.Heavy, cast2: Cast.Echo, type: Type1.Skill, mv: 660.16, offtune: 166144, energy: 6.93, concerto: 40, forte1: -6,
});

// concerto only — Liberation costs no Resonance Energy (maxEnergy: 0 below). The sheet's separate
// "Lib2" row (465.22% MV) has no matching action here — a known gap, flagged rather than guessed.
export const Liberation = phroAction("Liberation - Waltz of Forsaken Depths", {
  node: Node.Liberation, cast: Cast.Liberation, mv: 0, concerto: 20,
});

export const Intro = phroAction("Intro - Suite of Quietus", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 201.52, offtune: 10137, energy: 10, concerto: 10,
});
/** Maestro-replaced Intro — used whenever she re-enters with Maestro still open. Playing it is
 *  also what closes Maestro back out (see MAESTRO's own convert() below). */
export const EIntro = phroAction("Intro - Suite of Immortality", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Skill, mv: 596.43, offtune: 9600, energy: 10, concerto: 10,
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

/** Queue the next undrawn note and advance MAESTRO's own count. S3 turns every note she's
 *  holding when Maestro opens into a Cadenza (Scarlet Coda, its trigger, is always the cast right
 *  before Liberation here), so the first six she plays are Cadenza on that chain. */
function drawNote(): void {
  const i = Math.min(SEQUENCE.length - 1, stacksOf(MAESTRO) - 1);
  queue(isHeld(PH_S3) && i < 6 ? EBA_CADENZA : SEQUENCE[i]!);
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
    const i = Math.min(SEQUENCE.length - 1, stacks() - 1);
    const next = isHeld(PH_S3) && i < 6 ? EBA_CADENZA : SEQUENCE[i]!;
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

/* --------------------------------------------------------------------------------- sequences */

/** S6's own Hecate cast, queued out of her two Forte actions — she's on the field for those, so
 *  unlike the Maestro notes this is an active action. */
export const Apparition = phroAction("Hecate - Apparition of Beyond", { type: Type1.Echo, mv: 216.42 });

/** S1: the out-of-combat top-up only ever reads, in a rotation, as opening the fight holding 2
 *  Volatile Notes. */
export const PH_S1 = new Sequence({
  name: "Phrolova S1: A Key to Netherworld's Secrets",
  combatStart: () => setForte1(2),
  apply: () => { const a = currentAction(); if (a === FBA || a === FSkill) addStat(Stat.MulMv, 80); },
});

/** S2: both Scarlet Coda lines together are the one +75% MV multiplier, not a per-Aftersound one. */
export const PH_S2 = new Sequence({
  name: "Phrolova S2: A Rope Tied to a Life Beyond",
  update: () => { if (currentAction() === ScarletCoda) applySelf(AFTERSOUND, 14); },
  apply: () => { if (currentAction() === ScarletCoda) addStat(Stat.MulMv, 75); },
});

/** S3: the Cadenza ATK shred isn't modelled (enemy ATK doesn't enter this formula); the note
 *  conversion lives in drawNote() above. */
export const PH_S3 = new Sequence({
  name: "Phrolova S3: A Dagger to Cut Clean Obsessions",
  apply: () => addStat(Stat.Amp, 80, Type1.Echo),
});

/** S4: 30s, so permanent uptime; untagged per the attribute-bonus rule. Her own Echo Skill casts
 *  are the trigger — Scarlet Coda counts as one (cast2). */
export const PH_S4_TEAM = new Buff({
  name: "Phrolova S4: A Torch Illuminating the Path (team)",
  apply: () => addStat(Stat.DmgBonus, 20),
});
export const PH_S4 = new Sequence({
  name: "Phrolova S4: A Torch Illuminating the Path",
  update: () => { if (casting(Cast.Echo)) applyTeam(PH_S4_TEAM, 1); },
});

/** S5: a Stagnation field and 30% damage-taken reduction — neither reaches this calculator. */
export const PH_S5 = new Sequence({ name: "Phrolova S5: A Forked Road in Fate's Heartland" });

/** S6: +24% MV on the Maestro notes, an extra Hecate cast out of each Forte action, and the
 *  Maestro damage split — off-field (her inactive actions) is the 40% the target takes, on-field
 *  is the Havoc bonus instead. */
export const PH_S6 = new Sequence({
  name: "Phrolova S6: A Night to Depart From Eternal Rest",
  update: () => {
    const a = currentAction();
    if (a === FBA || a === FSkill) queue(Apparition);
    if (a === Apparition) applySelf(AFTERSOUND, 8); // TODO check if the apparition gains the 8 stacks for its damage
  },
  apply: () => {
    const a = currentAction();
    if (a === EBA_STRINGS || a === EBA_WINDS || a === EBA_CADENZA) addStat(Stat.MulMv, 24);
    if (stacksOf(MAESTRO)) {
      if (a.active) addStat(Stat.DmgBonus, 60, Attribute.Havoc);
      else addStat(Stat.TotalDmg, 40);
    }
  },
});

/** Her, as a Resonator: name/element, every grant/spend/queue rule her kit needs, and her own
 *  base stat line. */
export const PHROLOVA = new Resonator({
  name: "Phrolova",
  abbreviation: "Frolo",
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
export const FROLO_LOADOUT = new Loadout(
  PHROLOVA,
  true,
  PHROLOVA_TALENTS,
  PH_INHERENT_1,
  PH_INHERENT_2,
  [LETHEAN_ELEGY, COSMIC_RIPPLES, STRINGMASTER],
  [new EchoLoadout(NM_HECATE, DREAM_OF_THE_LOST_3PC, MIDNIGHT_VEIL_2PC)],
  mainstatOptions(["CR", "CD"], ["atk", "havoc"], ["atk"]),
  chem("atk", "skill"),
  PH_OPENER, PH_LOOP,
  PH_S1, PH_S2, PH_S3, PH_S4, PH_S5, PH_S6,
);
