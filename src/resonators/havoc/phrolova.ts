/**
 * Phrolova, ported to the new engine.
 *
 * Her Volatile Notes are the real store, packed into one Buff word (NOTES below, same treatment
 * as Jinhsi's Eras in Unity): six two-bit slots holding which notes she has actually gathered —
 * Strings off Basic 3 or Movement of Fate and Finality, Winds off Whispers or Murmurs, and a
 * Cadenza only ever by Accidental turning the next gain into one — plus four bits for the ten
 * auto-cast chances a Waltz opens with. Hecate plays the store back oldest-first: an active Echo
 * Skill spends a chance and the note, the two her Outro owes and the manual command spend only
 * the note's play count. Hecate plays the store back leftmost-first on a 3/2/3/2/3/2 metre: the
 * front note plays three times before it is removed from the left, its successor twice, and so on
 * — a full store is up to fifteen plays, though only ten of them can ever be the echo-triggered
 * kind. Whatever is left unplayed is deleted with the Waltz itself (Suite of Immortality).
 * Resolving Chord's own "no notes gained" window (Coda to Waltz) is left unmodelled: nothing in a
 * rotation gains between the two casts anyway.
 */
import { Stat, Attribute, WeaponType, Type1, Cast, Node, Scaling } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Sequence } from "../../engine/gear.js";
import {
  applyCurrent,
  stacksOf,
  currentAction,
  casting,
  queue,
  queueOutro,
  revokeCurrent,
  addStat,
  frozenStacks,
  applyTeam,
  isHeld,
  setStacksSelf,
  currentTeam,
  queueOn,
} from "../../engine/context.js";
import { lostOnSwap } from "../../shared/helpers.js";
import { ActionGroup, Action, Rotation, NOINTRO, INTRO, ECHO_ONFIELD, OUTRO, DODGE } from "../../engine/rotation.js";
import { LETHEAN_ELEGY, STRINGMASTER } from "../../weapons/rectifier.js";
import { NEW_STD_RECTIFIER, COSMIC_RIPPLES } from "../../weapons/standard.js";
import { DREAM_OF_THE_LOST_3PC } from "../../echoes/septimont.js";
import { NM_HECATE } from "../../echoes/rinascita.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { chem } from "../../shared/substats.js";
import { BELL_BORNE_GEOCHELONE, HAVOC_ECLIPSE_2PC, HERON, MOONLIT_CLOUDS_2PC, MOONLIT_CLOUDS_5PC } from "../../echoes/jinzhou.js";

/* ----------------------------------------------------------------------------------- actions */

function phroAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Havoc, scaling: Scaling.Atk, ...def });
}

// energy/concerto come off the migrated sheet's combined BA12/BA23/BA123 rows — BA1/BA2 are
// derived by subtraction, cross-checked both ways against BA12 and BA23.
const BA1 = phroAction("Basic - Movement of Life and Death 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 106.9, offtune: 5376, energy: 1.68, concerto: 3.36 });
const BA2 = phroAction("Basic - Movement of Life and Death 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 95.43, offtune: 4800, energy: 1.5, concerto: 3 });
const BA3 = phroAction("Basic - Movement of Life and Death 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 196.14, offtune: 9864, energy: 3.12, concerto: 6.18, updateBuffs: () => gainNote(1) });

const Skill = phroAction("Skill - Whispers in a Fleeting Dream", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 211.94, offtune: 4264, energy: 13.34, concerto: 10, updateBuffs: () => gainNote(2) });

const FBA = phroAction("Basic - Movement of Fate and Finality", { node: Node.Forte, cast: Cast.Basic, type: Type1.Skill, mv: 505.01, offtune: 10161, energy: 3.21, concerto: 10.02, updateBuffs: () => gainNote(1) });
const FSkill = phroAction("Skill - Murmurs in a Haunting Dream", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, mv: 464.07, offtune: 9338, energy: 2.95, concerto: 10, updateBuffs: () => gainNote(2) });

const ScarletCoda = phroAction("Heavy - Scarlet Coda", {
  node: Node.Normal, cast: Cast.Heavy, cast2: Cast.Echo, type: Type1.Skill, mv: 660.16, offtune: 166144, energy: 6.93, concerto: 40,
});

// concerto only — Liberation costs no Resonance Energy (maxEnergy: 0 below). The sheet's separate
// "Lib2" row (465.22% MV) has no matching action here — a known gap, flagged rather than guessed.
// Opens Maestro and banks the ten auto-cast chances (NOTES' own bits 12-15).
const Liberation = phroAction("Liberation - Waltz of Forsaken Depths", {
  node: Node.Liberation, cast: Cast.Liberation, concerto: 20,
  updateBuffs: () => {
    applyCurrent(MAESTRO, 1);
    setStacksSelf(NOTES, (stacksOf(NOTES) & ~(15 << 12)) | (10 << 12));
  },
});

const Intro = phroAction("Intro - Suite of Quietus", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 201.52, offtune: 10137, energy: 10, concerto: 10,
});
/** Maestro-replaced Intro — used whenever she re-enters with Maestro still open. Playing it is
 *  also what closes Maestro back out. */
const EIntro = phroAction("Intro - Suite of Immortality", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Skill, mv: 596.43, offtune: 9600, energy: 10, concerto: 10,
  // the Waltz ends here, and everything it was playing through goes with it: the unplayed notes,
  // the chances left, the front note's play count — the store keeps only its always-set bit
  updateBuffs: () => { revokeCurrent(MAESTRO); setStacksSelf(NOTES, stacksOf(NOTES) & (1 << 16)); },
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
const EBA_STRINGS = hecateAction("Enhanced - Hecate Strings", 347.93, NOTE);
const EBA_WINDS   = hecateAction("Enhanced - Hecate Winds", 330.53, NOTE);
const EBA_CADENZA = hecateAction("Enhanced - Hecate Cadenza", 347.93, NOTE);
const HBA1 = hecateAction("Basic - Hecate 1", 27.84);
/** Basic 2 ends the manual command: pressing Hecate's 1-2 by hand finishes on the next gathered
 *  note as its swap form — a play like any other, but never one of the ten auto-cast chances. */
const HBA2 = hecateAction("Basic - Hecate 2", 27.84, { updateBuffs: () => drawNote(false, true) });

// the note each two-bit slot value stands for, indexed 1-3; the manual command plays the same
// hit as its swap form, made on the way out
const NOTE_ACTIONS = [EBA_STRINGS, EBA_WINDS, EBA_CADENZA];
const SWAP_NOTES = NOTE_ACTIONS.map((a) => a.swap());

/** Bank one gathered note into the store's first empty slot — 1 Strings, 2 Winds, 3 Cadenza.
 *  Gated on a landed hit ("hitting a target with..."), so a dodge-cancelled Basic 3 (mv stripped
 *  by dodgeCancel()) pays nothing and leaves an armed Accidental standing. Accidental is the one
 *  road to a Cadenza: armed, the next note gained turns into one, whatever the cast would have
 *  paid. A full store makes room the kit's own way — every note past the leftmost Strings or
 *  Winds slides down a slot, that note is removed, and the new one takes the last slot; six
 *  Cadenzas part with nothing, and the gain is lost. */
function gainNote(note: number): void {
  if (!currentAction().mv) return;
  if (isHeld(ACCIDENTAL)) { note = 3; revokeCurrent(ACCIDENTAL); }
  const word = stacksOf(NOTES);
  for (let shift = 0; shift < 12; shift += 2) {
    if ((word >> shift) & 3) continue;
    setStacksSelf(NOTES, word | (note << shift));
    return;
  }
  for (let shift = 0; shift < 12; shift += 2) {
    if (((word >> shift) & 3) === 3) continue;
    const notes = word & 0xfff;
    setStacksSelf(NOTES, (word & ~0xfff) | (notes & ((1 << shift) - 1)) | (((notes >> (shift + 2)) << shift) & 0xfff) | (note << 10));
    return;
  }
}

/** Hecate plays the store's front note — three plays and it is removed from the left, the next
 *  two, alternating (bits 17-18 count the front note's plays, bit 19 whose turn the quota is) —
 *  and nothing at all off an empty store or a closed Waltz. `charged` is the ten-chance path (an
 *  active Echo Skill while the Waltz stands): it also spends one of the chances, and plays
 *  nothing once they are gone. The Outro's two and the manual command spend only the play. At S3
 *  every note *played* is a Cadenza, whatever was stored. Resolved against her own slot
 *  throughout rather than whoever is acting: the two her Outro owes are drawn from her handoff
 *  buff, which the *incoming* resonator is the one holding. */
function drawNote(charged: boolean, manual = false): void {
  const her = currentTeam().memberOf(PHROLOVA_RESONATOR);
  if (!her.stacksOf(MAESTRO)) return;
  let word = her.stacksOf(NOTES);
  const note = word & 3;
  if (!note) return;
  if (charged) {
    if (!((word >> 12) & 15)) return;
    word -= 1 << 12;
  }
  const plays = ((word >> 17) & 3) + 1;
  if (plays < ((word >> 19) & 1 ? 2 : 3)) {
    word = (word & ~(3 << 17)) | (plays << 17);
  } else {
    word = ((word & ~0xfff & ~(3 << 17)) | ((word & 0xfff) >> 2)) ^ (1 << 19);
  }
  her.setStacks(NOTES, word);
  const played = her.isHeld(PH_S3) ? 3 : note;
  queueOn(PHROLOVA_RESONATOR, (manual ? SWAP_NOTES : NOTE_ACTIONS)[played - 1]!);
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

/** The Volatile Note store, one packed word (see the file header): bits 0-11 are six two-bit
 *  slots oldest-first (1 Strings, 2 Winds, 3 Cadenza), bits 12-15 the auto-cast chances left of a
 *  Waltz's ten, bit 16 always set so an empty store is still a held buff, bits 17-18 how often
 *  the front note has been played and bit 19 whether its quota is the three or the two (see
 *  drawNote()). Hers from combat start; the display reads the slots off as she stands. */
export const NOTES = new Buff({
  name: "Phrolova: Volatile Notes", maxStacks: 0xfffff,
  display: (): string => {
    let slots = "";
    for (let shift = 0; shift < 12; shift += 2) slots += "-SWC"[(frozenStacks() >> shift) & 3]!;
    return `Phrolova: Volatile Notes [${slots}]`;
  },
});

/** Maestro: the Waltz standing, ended the moment Suite of Immortality (EIntro) plays. The chances
 *  and the notes it plays through live in NOTES above. */
export const MAESTRO = new Buff({
  name: "Phrolova: Maestro",
  applyStats: () => addStat(Stat.BonusAtk, 120),
  // Any active Echo Skill cast (hers or a teammate's) spends a chance and plays a note.
  // updateGlobal() keeps the "current" pointers on her own slot, so drawNote() resolves against her.
  updateGlobal: () => {
    if (casting(Cast.Echo) && currentAction().active) drawNote(true);
  },
});

/** Accidental (Inherent Skill), armed: her next Volatile Note gained turns into a Cadenza —
 *  which is the only way a Cadenza ever reaches the store. Consumed by that gain (gainNote()
 *  above), so it waits through anything that doesn't land one. */
const ACCIDENTAL = new Buff({
  name: "Inherent: Accidental",
});
/** Accidental's own trigger: casting Suite of Quietus, Suite of Immortality, or an Echo Skill. */
const PH_INHERENT_1 = new Inherent({
  name: "Inherent: Accidental",
  updateBuffs: () => { const a = currentAction(); if (a === Intro || a === EIntro || casting(Cast.Echo)) applyCurrent(ACCIDENTAL, 1); },
});
/** No combat-formula effect this engine models — still equipped, just doesn't hand out a stat. */
const PH_INHERENT_2 = new Inherent({ name: "Inherent: Octet" ,

  // Octet: 10 Aftersound the instant she's on the team, not tied to when she first acts — and
  // the note store itself, empty (its always-set bit alone; see NOTES)
  combatStart: () => { applyCurrent(AFTERSOUND, 10); },
});

const PHROLOVA_OUTRO = new Buff({
  name: "Phrolova: Outro",
  applyStats: () => { addStat(Stat.Amp, 20, Attribute.Havoc); addStat(Stat.Amp, 25, Type1.Heavy); },
  // Also the two notes her Outro owes: this is adopted on the incoming resonator's own Intro, so
  // it is the thing that sees the Intro they play — and drawNote() puts them back on her slot.
  updateBuffs: () => {
    if (casting(Cast.Intro) && currentTeam().memberOf(PHROLOVA_RESONATOR).stacksOf(MAESTRO)) { drawNote(false); drawNote(false); }
    lostOnSwap();
  },
});

/* --------------------------------------------------------------------------------- sequences */

/** S6's own Hecate cast, queued out of her two Forte actions — she's on the field for those, so
 *  unlike the Maestro notes this is an active action. */
const Apparition = phroAction("Hecate - Apparition of Beyond", { type: Type1.Echo, mv: 216.42 });

/** S1: the out-of-combat top-up only ever reads, in a rotation, as opening the fight holding 2
 *  Volatile Notes — Cadenza by its own text ("gains Volatile Note - Cadenza until she has at
 *  least 2"), banked straight into the store's first two slots. */
const PH_S1 = new Sequence({
  name: "Phrolova S1: A Key to Netherworld's Secrets",
  combatStart: () => applyCurrent(NOTES, 3 | (3 << 2)),
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

  combatStart: () => { applyCurrent(NOTES, 1 << 16); }, // initialize notes state

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
// NOINTRO ROTATIONS DO NOT HAVE AN INTRO

const BA123 = new ActionGroup("Basic - Movement of Life and Death 123", [BA1, BA2, BA3, DODGE]);

const PH_LOOP = new Rotation([
  NOINTRO, BA2,
  INTRO,
  BA3, ECHO_ONFIELD, 
  FBA, Skill, FBA, DODGE, 
  BA123, FBA, DODGE,
  ScarletCoda, Liberation, HBA1, HBA2, OUTRO,
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
  echoLoadouts: [new EchoLoadout(NM_HECATE, DREAM_OF_THE_LOST_3PC, HAVOC_ECLIPSE_2PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Havoc3, Mainstat.ATK1),
  substat: chem("atk", "skill"),
    rotation: PH_LOOP,
  sequences: [PH_S1, PH_S2, PH_S3, PH_S4, PH_S5, PH_S6],
});


const PH_LOOP_DUAL_DPS = new Rotation([
  NOINTRO, BA2,
  INTRO, BA3, ECHO_ONFIELD, 
  FBA, Skill, FBA, DODGE,
  BA123, FBA, 
  ScarletCoda, Liberation, OUTRO,
]);

export const PHROLOVA_DUAL_DPS = new Loadout({
  resonator: PHROLOVA_RESONATOR,
  talent: PHROLOVA_TALENTS,
  inherent1: PH_INHERENT_1,
  inherent2: PH_INHERENT_2,
  weapons: [LETHEAN_ELEGY, COSMIC_RIPPLES, STRINGMASTER],
  echoLoadouts: [
    new EchoLoadout(NM_HECATE, DREAM_OF_THE_LOST_3PC, HAVOC_ECLIPSE_2PC),
    new EchoLoadout(HERON, DREAM_OF_THE_LOST_3PC, MOONLIT_CLOUDS_2PC),
    new EchoLoadout(BELL_BORNE_GEOCHELONE, DREAM_OF_THE_LOST_3PC, MOONLIT_CLOUDS_2PC),
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
    new EchoLoadout(BELL_BORNE_GEOCHELONE, MOONLIT_CLOUDS_5PC),
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Havoc3, Mainstat.ATK1),
  substat: chem("atk", "skill"),
    rotation: PH_LOOP_DUAL_DPS,
  sequences: [PH_S1, PH_S2, PH_S3, PH_S4, PH_S5, PH_S6],
});
