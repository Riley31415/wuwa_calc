/**
 * Phrolova, ported to the new engine.
 * Maestro (open/charges/next-note) is one stacking Buff rather than three separate mechanics —
 * see MAESTRO's own comment for how a single stack count carries all three.
 */
import {
  Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Action, Stat, Attribute, WeaponType, Type1, Cast, Node,
  Scaling, applyCurrent, stacksOf, currentAction, casting, queue, queueOutro, revokeCurrent, addStat, frozenStacks,
  Sequence, applyTeam, isHeld, setForte1, currentTeam, queueOn, addBuff,
  ActionGroup,
} from "../../engine/kit.js";
import { lostOnSwap } from "../../shared/helpers.js";
import { Rotation, OPENER, INTRO, ECHO_ONFIELD, OUTRO_NEXT } from "../../engine/rotation.js";
import { LETHEAN_ELEGY, STRINGMASTER } from "../../weapons/rectifier.js";
import { NEW_STD_RECTIFIER, COSMIC_RIPPLES } from "../../weapons/standard.js";
import { DREAM_OF_THE_LOST_3PC } from "../../echoes/septimont.js";
import { NM_HECATE, MIDNIGHT_VEIL_2PC } from "../../echoes/rinascita.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { chem } from "../../shared/substats.js";
import { BELL_BORNE_GEOCHELONE, HERON, MOONLIT_CLOUDS_2PC, MOONLIT_CLOUDS_5PC } from "../../echoes/jinzhou.js";

/* ----------------------------------------------------------------------------------- actions */

function phroAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Havoc, scaling: Scaling.Atk, ...def });
}

// energy/concerto come off the migrated sheet's combined BA12/BA23/BA123 rows — BA1/BA2 are
// derived by subtraction, cross-checked both ways against BA12 and BA23.
const BA1 = phroAction("Basic - Movement of Life and Death 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 106.9, offtune: 5376, energy: 1.68, concerto: 3.36 });
const BA2 = phroAction("Basic - Movement of Life and Death 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 95.43, offtune: 4800, energy: 1.5, concerto: 3 });
const BA3 = phroAction("Basic - Movement of Life and Death 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 196.14, offtune: 9864, energy: 3.12, concerto: 6.18, forte1: 1 });

const Skill = phroAction("Skill - Whispers in a Fleeting Dream", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 211.94, offtune: 4264, energy: 13.34, concerto: 10, forte1: 1 });

const FBA = phroAction("Forte - Movement of Fate and Finality", { node: Node.Forte, cast: Cast.Basic, type: Type1.Skill, mv: 505.01, offtune: 10161, energy: 3.21, concerto: 10.02, forte1: 1 });
const FSkill = phroAction("Forte - Murmurs in a Haunting Dream", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, mv: 464.07, offtune: 9338, energy: 2.95, concerto: 10, forte1: 1 });

const ScarletCoda = phroAction("Heavy - Scarlet Coda", {
  node: Node.Normal, cast: Cast.Heavy, cast2: Cast.Echo, type: Type1.Skill, mv: 660.16, offtune: 166144, energy: 6.93, concerto: 40, forte1: -6,
});

// concerto only — Liberation costs no Resonance Energy (maxEnergy: 0 below). The sheet's separate
// "Lib2" row (465.22% MV) has no matching action here — a known gap, flagged rather than guessed.
// Opens Maestro: 1 stack = 0 notes drawn (see MAESTRO).
const Liberation = phroAction("Liberation - Waltz of Forsaken Depths", {
  node: Node.Liberation, cast: Cast.Liberation, concerto: 20,
  updateBuffs: () => applyCurrent(MAESTRO, 1)
});

const Intro = phroAction("Intro - Suite of Quietus", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 201.52, offtune: 10137, energy: 10, concerto: 10,
});
/** Maestro-replaced Intro — used whenever she re-enters with Maestro still open. Playing it is
 *  also what closes Maestro back out. */
const EIntro = phroAction("Intro - Suite of Immortality", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Skill, mv: 596.43, offtune: 9600, energy: 10, concerto: 10,
  updateBuffs: () => revokeCurrent(MAESTRO),
});
/** While Maestro is open the handoff also auto-cycles two more notes, not charge-gated — they
 *  play once the next resonator has intro'd rather than on the Outro itself, so the handoff buff
 *  this queues is what watches for that (PHROLOVA_OUTRO). */
const Outro = phroAction("Outro - Unfinished Piece", {
  cast: Cast.Outro, concerto: -100, active: false,
  updateBuffs: () => queueOutro(PHROLOVA_OUTRO),
});

function hecateAction(id: string, mv: number, def: object = {}): Action {
  return new Action(id, { element: Attribute.Havoc, scaling: Scaling.Atk, type: Type1.Echo, active: false, mv, ...def });
}
// a played Maestro note is worth an Aftersound stack; Hecate's own plain basics are not
const NOTE = { updateBuffs: () => applyCurrent(AFTERSOUND, 1) };
const EBA_STRINGS = hecateAction("Hecate - Enhanced Strings", 347.93, NOTE);
const EBA_WINDS   = hecateAction("Hecate - Enhanced Winds", 330.53, NOTE);
const EBA_CADENZA = hecateAction("Hecate - Enhanced Cadenza", 347.93, NOTE);
const HBA1 = hecateAction("Hecate - Basic 1", 27.84);
const HBA2 = hecateAction("Hecate - Basic 2", 27.84);

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

/** Queue the next undrawn note and advance MAESTRO's own count. At S3 every note she plays is a
 *  Cadenza, whatever SEQUENCE would have drawn. Named against her own slot throughout rather than
 *  read off whoever is acting: the two her Outro owes are drawn from her handoff buff, which the
 *  *incoming* resonator is the one holding. */
function drawNote(): void {
  const her = currentTeam().memberOf(PHROLOVA_RESONATOR);
  const i = Math.min(SEQUENCE.length - 1, her.stacksOf(MAESTRO) - 1);
  queueOn(PHROLOVA_RESONATOR, her.isHeld(PH_S3) ? EBA_CADENZA : SEQUENCE[i]!);
  addBuff(PHROLOVA_RESONATOR, MAESTRO, 1);
}

/* ------------------------------------------------------------------------------------ buffs */

const AFTERSOUND = new Buff({
  name: "Phrolova: Aftersound", maxStacks: 124,
  // first 24 stacks pay 2.5% Crit DMG each, every stack past that pays 1%, capped at 100% total
  applyStats: () => {
    const n = frozenStacks(), held = Math.min(n, 24), overflow = n - held;
    addStat(Stat.CritDmg, Math.min(100, held * 2.5 + overflow));

    if (currentAction() === ScarletCoda) {
      addStat(Stat.AddMv, 82.55 * held);
    }
  },
});

/** Maestro: open/charges/next-note as one stacking buff. Can't be held at 0 frozenStacks, so the count
 *  is notes-drawn-so-far *plus one* (granted at 1, maxing at 13); `stacksOf(MAESTRO) - 1` is the
 *  real notes-drawn number everywhere below. Ends the moment Suite of Immortality (EIntro) plays. */
export const MAESTRO = new Buff({
  name: "Phrolova: Maestro", maxStacks: 13,
  applyStats: () => addStat(Stat.BonusAtk, 120),
  // Any active Echo Skill cast (hers or a teammate's) spends a charge and draws a note.
  // updateGlobal() forces currentSlot to Phrolova's own slot so drawNote() resolves against her.
  updateGlobal: () => {
    const a = currentAction();
    if (casting(Cast.Echo) && a.active && frozenStacks() < 11) drawNote();
  },
  // the note that just played, or (if this row isn't one of the Hecate notes) the one coming next
  display: (): string => {
    const justPlayed = NOTE_LABEL.get(currentAction());
    if (justPlayed) return `Maestro: ${justPlayed}`;
    const i = Math.min(SEQUENCE.length - 1, frozenStacks() - 1);
    const next = isHeld(PH_S3) ? EBA_CADENZA : SEQUENCE[i]!;
    return `Maestro: ${NOTE_LABEL.get(next)}`;
  },
});

/** Accidental (Inherent Skill): interrupt resistance/damage-taken reduction on Echo Skill cast —
 *  out of scope for this calculator's formula, so this is a do-nothing presence marker, consumed
 *  the instant one of her +100-forte actions fires. */
const ACCIDENTAL = new Buff({
  name: "Phrolova: Accidental",
  convertStats: () => {
    const a = currentAction();
    if (a === BA3 || a === Skill || a === FBA || a === FSkill) revokeCurrent(ACCIDENTAL);
  },
});
/** Accidental's own trigger — always-equipped Inherent Skill piece. */
const PH_INHERENT_1 = new Inherent({
  name: "Phrolova: Accidental",
  updateBuffs: () => { const a = currentAction(); if (a === Intro || a === EIntro || casting(Cast.Echo)) applyCurrent(ACCIDENTAL, 1); },
});
/** No combat-formula effect this engine models — still equipped, just doesn't hand out a stat. */
const PH_INHERENT_2 = new Inherent({ name: "Phrolova: Inherent Skill 2" });

const PHROLOVA_OUTRO = new Buff({
  name: "Phrolova: Outro",
  applyStats: () => { addStat(Stat.Amp, 20, Attribute.Havoc); addStat(Stat.Amp, 25, Type1.Heavy); },
  // Also the two notes her Outro owes: this is adopted on the incoming resonator's own Intro, so
  // it is the thing that sees the Intro they play — and drawNote() puts them back on her slot.
  updateBuffs: () => {
    if (casting(Cast.Intro) && currentTeam().memberOf(PHROLOVA_RESONATOR).stacksOf(MAESTRO)) { drawNote(); drawNote(); }
    lostOnSwap();
  },
});

/* --------------------------------------------------------------------------------- sequences */

/** S6's own Hecate cast, queued out of her two Forte actions — she's on the field for those, so
 *  unlike the Maestro notes this is an active action. */
const Apparition = phroAction("Hecate - Apparition of Beyond", { type: Type1.Echo, mv: 216.42 });

/** S1: the out-of-combat top-up only ever reads, in a rotation, as opening the fight holding 2
 *  Volatile Notes. */
const PH_S1 = new Sequence({
  name: "Phrolova S1: A Key to Netherworld's Secrets",
  combatStart: () => setForte1(2),
  applyStats: () => { const a = currentAction(); if (a === FBA || a === FSkill) addStat(Stat.MulMv, 80); },
});

/** S2: both Scarlet Coda lines together are the one +75% MV multiplier, not a per-Aftersound one. */
const PH_S2 = new Sequence({
  name: "Phrolova S2: A Rope Tied to a Life Beyond",
  updateBuffs: () => { if (currentAction() === ScarletCoda) applyCurrent(AFTERSOUND, 14); },
  applyStats: () => { if (currentAction() === ScarletCoda) addStat(Stat.MulMv, 75); },
});

/** S3: every note becomes a Cadenza (in drawNote() above); the Cadenza ATK shred isn't modelled
 *  (enemy ATK doesn't enter this formula). */
const PH_S3 = new Sequence({
  name: "Phrolova S3: A Dagger to Cut Clean Obsessions",
  applyStats: () => addStat(Stat.Amp, 80, Type1.Echo),
});

/** S4: 30s, so permanent uptime; untagged per the attribute-bonus rule. Her own Echo Skill casts
 *  are the trigger — Scarlet Coda counts as one (cast2). */
const PH_S4_TEAM = new Buff({
  name: "Phrolova S4: A Torch Illuminating the Path (team)",
  applyStats: () => addStat(Stat.DmgBonus, 20),
});
const PH_S4 = new Sequence({
  name: "Phrolova S4: A Torch Illuminating the Path",
  updateBuffs: () => { if (casting(Cast.Echo)) applyTeam(PH_S4_TEAM, 1); },
});

/** S5: a Stagnation field and 30% damage-taken reduction — neither reaches this calculator. */
const PH_S5 = new Sequence({ name: "Phrolova S5: A Forked Road in Fate's Heartland" });

/** S6: +24% MV on the Maestro notes, an extra Hecate cast out of each Forte action, and the
 *  Maestro damage split — off-field (her inactive actions) is the 40% the target takes, on-field
 *  is the Havoc bonus instead. */
const PH_S6 = new Sequence({
  name: "Phrolova S6: A Night to Depart From Eternal Rest",
  updateBuffs: () => {
    const a = currentAction();
    if (a === FBA || a === FSkill) queue(Apparition);
    if (a === Apparition) applyCurrent(AFTERSOUND, 8); // TODO check if the apparition gains the 8 stacks for its damage
  },
  applyStats: () => {
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
export const PHROLOVA_RESONATOR = new Resonator({
  name: "Phrolova",
  element: Attribute.Havoc,
  weapon: WeaponType.Rectifier,
  color: "#a62c57",
  // Maestro still open means Suite of Immortality (EIntro) instead of plain Intro
  intro: () => (stacksOf(MAESTRO) ? EIntro : Intro),
  outro: () => Outro,
  maxEnergy: 0,

  // Octet: 10 Aftersound the instant she's on the team, not tied to when she first acts
  combatStart: () => applyCurrent(AFTERSOUND, 10),

  constantStats: () => {
    addStat(Stat.BaseHp, 10775); addStat(Stat.BaseAtk, 437.5); addStat(Stat.BaseDef, 1137);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
const PHROLOVA_TALENTS = new Talent({
  name: "Phrolova: Talents",
  constantStats: () => { addStat(Stat.CritRate, 8); addStat(Stat.BonusAtk, 12); },
});

// INTRO resolves to plain Intro or EIntro on its own (see her own intro() above)
// OPENER ROTATIONS DO NOT HAVE AN INTRO

const BA123Dash = new ActionGroup("Basic - Movement of Life and Death 123 (Cancel)", [BA1, BA2]);
const BA123 = new ActionGroup("Basic - Movement of Life and Death 123", [BA1, BA2, BA3]);

const PH_LOOP = new Rotation([
  OPENER, BA2,
  INTRO, BA3, ECHO_ONFIELD, FBA, Skill, FBA, BA123Dash, FBA, BA123Dash, FBA, ScarletCoda, Liberation, OUTRO_NEXT,
]);

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills + Forte Circuit, weapon,
// mainslot echo, sonata pieces, mainstat/substat
export const PHROLOVA = new Loadout({
  resonator: PHROLOVA_RESONATOR,
  talent: PHROLOVA_TALENTS,
  inherent1: PH_INHERENT_1,
  inherent2: PH_INHERENT_2,
  weapons: [LETHEAN_ELEGY, COSMIC_RIPPLES, STRINGMASTER],
  echoLoadouts: [new EchoLoadout(NM_HECATE, DREAM_OF_THE_LOST_3PC, MIDNIGHT_VEIL_2PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Havoc3, Mainstat.ATK1),
  substat: chem("atk", "skill"),
    rotation: PH_LOOP,
  sequences: [PH_S1, PH_S2, PH_S3, PH_S4, PH_S5, PH_S6],
});


const PH_LOOP_DUAL_DPS = new Rotation([
  OPENER, BA2,
  INTRO, BA3, ECHO_ONFIELD, FBA, Skill, FBA, BA123, FBA, ScarletCoda, Liberation, OUTRO_NEXT,
]);

export const PHROLOVA_DUAL_DPS = new Loadout({
  resonator: PHROLOVA_RESONATOR,
  talent: PHROLOVA_TALENTS,
  inherent1: PH_INHERENT_1,
  inherent2: PH_INHERENT_2,
  weapons: [LETHEAN_ELEGY, COSMIC_RIPPLES, STRINGMASTER],
  echoLoadouts: [
    new EchoLoadout(NM_HECATE, DREAM_OF_THE_LOST_3PC, MIDNIGHT_VEIL_2PC),
    new EchoLoadout(HERON, DREAM_OF_THE_LOST_3PC, MOONLIT_CLOUDS_2PC),
    new EchoLoadout(BELL_BORNE_GEOCHELONE, DREAM_OF_THE_LOST_3PC, MOONLIT_CLOUDS_2PC),
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC),
    new EchoLoadout(BELL_BORNE_GEOCHELONE, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC),
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Havoc3, Mainstat.ATK1),
  substat: chem("atk", "skill"),
    rotation: PH_LOOP_DUAL_DPS,
  sequences: [PH_S1, PH_S2, PH_S3, PH_S4, PH_S5, PH_S6],
});
