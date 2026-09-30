/**
 * Phrolova. Her Volatile Notes are one packed Buff word (NOTES): six two-bit slots oldest-first —
 * Strings off Basic 3 or Movement of Fate and Finality, Winds off Whispers or Murmurs, a Cadenza
 * only by Accidental turning the next gain into one — plus four bits for the ten Echo-cast chances
 * a Waltz opens with.
 *
 * Maestro plays them through Hecate on her own clock: every 240 frames the leftmost note is
 * consumed, queueing a basic attack, and consuming the last ends Maestro. Hecate's queue (a basic
 * and an enhanced count) plays only while Phrolova is off field, one attack after another as each
 * animation ends: an enhanced first — the leftmost note's attack, queued by an Echo cast or two by
 * her Outro — else Hecate 1 then 2, cut the moment an enhanced is queued. Any cast of hers but
 * Hecate's ends Maestro, and that takes the queue, every Hecate hit in flight and her notes with it.
 */
import { Stat, Attribute, WeaponType, Type, Cast, Node, Scaling, BuffTarget } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Sequence } from "../../engine/gear.js";
import {
  applyCurrent,
  stacksOf,
  currentAction, pressed,
  onAction,
  runningAction,
  casting,
  queue,
  queueOutro,
  revokeCurrent,
  addStat,
  frozenStacks,
  isHeld,
  setStacksSelf,
  currentTeam,
  queueOn,
  asSource,
  isActive,
  onCast,
  setForte1,
  addForte1,
  lostOnSwap,
  addBuff,
  cancelHits,
  pressEndOf,
  runningAnyOf,
  triggeredAction,
} from "../../engine/context.js";
import { ActionGroup, Action, Rotation, NOINTRO, ECHO, ActionTag, INTRO } from "../../engine/rotation.js";
import { LETHEAN_ELEGY, STRINGMASTER } from "../../weapons/rectifier.js";
import { COSMIC_RIPPLES } from "../../weapons/standard.js";
import { DREAM_OF_THE_LOST_3PC } from "../../echoes/septimont.js";
import { NM_HECATE } from "../../echoes/rinascita.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";
import { BELL_BORNE_GEOCHELONE, HAVOC_ECLIPSE_2PC, HERON, MOONLIT_CLOUDS_2PC, MOONLIT_CLOUDS_5PC } from "../../echoes/jinzhou.js";

/* ----------------------------------------------------------------------------------- actions */

function phroAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Havoc, scaling: Scaling.Atk, ...def });
}

// energy/concerto come off the migrated sheet's combined BA12/BA23/BA123 rows — BA1/BA2 are
// derived by subtraction, cross-checked both ways against BA12 and BA23.
const BA1 = phroAction("Basic - Movement of Life and Death 1", { animFrames: 44, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 18, mv: 53.45, energy: 0.84, concerto: 1.68, offtune: 2688 },
    { hitFrame: 35, mv: 53.45, energy: 0.84, concerto: 1.68, offtune: 2688 },
  ]});
const BA2 = phroAction("Basic - Movement of Life and Death 2", { animFrames: 36, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 12, mv: 95.43, energy: 1.5, concerto: 3, offtune: 4800 }]});
const BA3 = phroAction("Basic - Movement of Life and Death 3", { animFrames: 81, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 30, mv: 32.69, energy: 0.52, concerto: 1.03, offtune: 1644, forte1: 1,
      updateDebuffs: () => gainNote(1) },
    { hitFrame: 36, mv: 32.69, energy: 0.52, concerto: 1.03, offtune: 1644 },
    { hitFrame: 42, mv: 32.69, energy: 0.52, concerto: 1.03, offtune: 1644 },
    { hitFrame: 48, mv: 32.69, energy: 0.52, concerto: 1.03, offtune: 1644 },
    { hitFrame: 54, mv: 32.69, energy: 0.52, concerto: 1.03, offtune: 1644 },
    { hitFrame: 60, mv: 32.69, energy: 0.52, concerto: 1.03, offtune: 1644 },
  ]});

const Skill = phroAction("Skill - Whispers in a Fleeting Dream", { animFrames: 34, cooldown: 60 * 12, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 10, mv: 105.97, energy: 6.67, offtune: 2132, forte1: 1,
      updateDebuffs: () => gainNote(2) },
    { hitFrame: 48, commitFrame: 18, mv: 105.97, energy: 6.67, offtune: 2132 },
  ], castConcerto: 10});

const FBA = phroAction("Forte Basic - Movement of Fate and Finality", { animFrames: 92, node: Node.Forte, cast: Cast.Basic, type: Type.Skill, bullets: [
    { hitFrame: 8, commitFrame: 2, mv: 37.88, energy: 0.24, concerto: 0.75, offtune: 762, forte1: 1,
      updateDebuffs: () => gainNote(1) },
    { hitFrame: 14, commitFrame: 2, mv: 37.88, energy: 0.24, concerto: 0.75, offtune: 762 },
    { hitFrame: 20, commitFrame: 2, mv: 37.88, energy: 0.24, concerto: 0.75, offtune: 762 },
    { hitFrame: 26, commitFrame: 2, mv: 37.88, energy: 0.24, concerto: 0.75, offtune: 762 },
    { hitFrame: 53, commitFrame: 2, mv: 117.83, energy: 0.75, concerto: 2.34, offtune: 2371 },
    { hitFrame: 60, commitFrame: 2, mv: 117.83, energy: 0.75, concerto: 2.34, offtune: 2371 },
    { hitFrame: 67, commitFrame: 2, mv: 117.83, energy: 0.75, concerto: 2.34, offtune: 2371 },
  ]});
const FSkill = phroAction("Forte Skill - Murmurs in a Haunting Dream", { animFrames: 79, node: Node.Forte, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 10, mv: 23.21, energy: 0.15, concerto: 0.5, offtune: 467, forte1: 1,
      updateDebuffs: () => gainNote(2) },
    { hitFrame: 16, mv: 23.21, energy: 0.15, concerto: 0.5, offtune: 467 },
    { hitFrame: 22, mv: 23.21, energy: 0.15, concerto: 0.5, offtune: 467 },
    { hitFrame: 28, mv: 23.21, energy: 0.15, concerto: 0.5, offtune: 467 },
    { hitFrame: 38, mv: 46.41, energy: 0.3, concerto: 1, offtune: 934 },
    { hitFrame: 81, commitFrame: 38, mv: 324.82, energy: 2.05, concerto: 7, offtune: 6536 },
  ]});

/** Casting it sends Compose into its 25s cooldown, modelled as the cast's own. */
const ScarletCoda = phroAction("Forte Heavy - Scarlet Coda", {
  animFrames: 172, cooldown: 60 * 25,
  node: Node.Normal, cast: Cast.Heavy, subcast: Cast.Echo, type: Type.Skill, castForte1: -6,  bullets: [
    { hitFrame: 14, mv: 33.01, energy: 0.35, offtune: 8307 },
    { hitFrame: 41, mv: 33.01, energy: 0.35, offtune: 8307 },
    { hitFrame: 59, mv: 12.38, energy: 0.13, offtune: 3116 },
    { hitFrame: 66, mv: 12.38, energy: 0.13, offtune: 3116 },
    { hitFrame: 73, mv: 12.38, energy: 0.13, offtune: 3116 },
    { hitFrame: 80, mv: 12.38, energy: 0.13, offtune: 3116 },
    { hitFrame: 87, mv: 12.38, energy: 0.13, offtune: 3116 },
    { hitFrame: 95, mv: 12.38, energy: 0.13, offtune: 3116 },
    { hitFrame: 102, mv: 12.38, energy: 0.13, offtune: 3116 },
    { hitFrame: 109, mv: 12.38, energy: 0.13, offtune: 3116 },
    { hitFrame: 139, mv: 495.1, energy: 5.19, offtune: 124602 },
  ], castConcerto: 40,
});

// concerto only — Liberation costs no Resonance Energy (maxEnergy: 0 below). The sheet's separate
// "Lib2" row (465.22% MV) has no matching action here — a known gap, flagged rather than guessed.
// Opens Maestro and banks the ten auto-cast chances (NOTES' own bits 12-15).
const Liberation = phroAction("Liberation - Waltz of Forsaken Depths", {
  animFrames: 240, timestop: 240, motionStop: 240,
  node: Node.Liberation, cast: Cast.Liberation, castConcerto: 20, resetForte1: true,
  updateBuffs: () => startMaestro(),
});
/** Recast during Maestro: ends it (and with it Suite of Immortality's replacement). */
export const CurtainCall = phroAction("Liberation - Curtain Call", {
  animFrames: 83, bullets: [{ hitFrame: 42, mv: 465.22, energy: 2.93, concerto: 5.85, offtune: 9360 }],
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation,
  updateBuffs: () => endMaestro(),
});

const Intro = phroAction("Intro - Suite of Quietus", {
  animFrames: 80, prioFrames: 80, motionStop: 33,
  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [{ hitFrame: 43, mv: 80.61, energy: 4, offtune: 4055 }, { hitFrame: 62, mv: 120.91, energy: 6, offtune: 6082 }], castConcerto: 10,
});
/** Maestro-replaced Intro — used whenever she re-enters with Maestro still open. Playing it is
 *  also what closes Maestro back out. */
const EIntro = phroAction("Intro - Suite of Immortality", {
  animFrames: 93, prioFrames: 93, motionStop: 51,
  node: Node.Intro, cast: Cast.Intro, type: Type.Skill, bullets: [{ hitFrame: 60, mv: 596.43, energy: 10, offtune: 9600 }], castConcerto: 10,resetForte1: true,
  // the Waltz ends here, and the notes it was playing through go with it
  updateBuffs: () => endMaestro(),
});
/** In Maestro the Outro also queues two enhanced Hecate attacks, not charge-gated. */
const Outro = phroAction("Outro - Unfinished Piece", {
  animFrames: 0,
  cast: Cast.Outro, castConcerto: -100,
  updateBuffs: () => {
    queueOutro(PHROLOVA_OUTRO);
    if (stacksOf(MAESTRO)) queueEnhanced(2);
  },
});

function hecateAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Havoc, scaling: Scaling.Atk, type: Type.Echo, ...def });
}
/** One Hecate attack beside the fight: its bullets on their frames (wuwalab), and its end playing
 *  whatever she has queued next (`hecateEnded()`). */
const hecateMove = (id: string, animFrames: number, bullets: [number, number][]): Action => hecateAction(id, {
  tag: ActionTag.Field, animFrames, bullets: bullets.map(([hitFrame, mv]) => ({ hitFrame, mv })), afterAction: () => hecateEnded(),
});
const HECATE_1 = hecateMove("Basic - Hecate 1", 40, [[10, 27.84]]);
const HECATE_2 = hecateMove("Basic - Hecate 2", 49, [[4, 13.92], [22, 13.92]]);
// indexed by the note's slot value less one: Strings, Winds, Cadenza
const NOTE_MOVES = [
  hecateMove("Enhanced - Hecate Strings", 91, [[26, 104.38], [56, 243.55]]),
  hecateMove("Enhanced - Hecate Winds", 70, [[26, 99.16], [56, 231.37]]),
  hecateMove("Enhanced - Hecate Cadenza", 70, [[26, 104.38], [56, 243.55]]),
];

// The manual command, pressed on field: Hecate 1-2 by hand, then the leftmost note's attack as
// its swap form (`EnhancedHecate.instaSwap()`), Hecate carrying on from its end once Phrolova is out.
const HBA1 = HECATE_1.variant(HECATE_1.name, { tag: ActionTag.Default, afterAction: undefined });
const HBA2 = HECATE_2.variant(HECATE_2.name, { tag: ActionTag.Default, afterAction: undefined });
const COMMANDS = NOTE_MOVES.map((move) => move.variant(`${move.name} (Command)`, {
  tag: ActionTag.Default, updateBuffs: () => startEnhanced(),
}));
/** The leftmost note's attack, commanded — resolved when reached. */
const EnhancedHecate = new Action("Enhanced Hecate Resolver", {
  resolve: () => {
    const note = stacksOf(NOTES) & 3;
    return note ? COMMANDS[note - 1]! : null;
  },
});

/** Her basic attacks, which an enhanced one cuts short; and every attack of hers. */
const BASIC_MOVES = new Set<Action>([HECATE_1, HECATE_2]);
const MOVES = new Set<Action>([HECATE_1, HECATE_2, ...NOTE_MOVES, ...COMMANDS, HBA1, HBA2]);
/** Every note attack, commanded or not (S6's multiplier). */
const NOTE_ATTACKS = new Set<Action>([...NOTE_MOVES, ...COMMANDS]);

/** Every hit Hecate lands, her S6 Apparition included. Damage dealt by Hecate is Phrolova's own,
 *  but her attacks are not Phrolova's for a kit that reads them: "Hecate's attacks will not remove
 *  the target's Hazy Dream state" is her own text, and Cantarella's Hazy Dream reads this. */
export const HECATE_ACTIONS = new Set<Action>([...MOVES, HBA1, HBA2]);

/** Bank one gathered note into the store's first empty slot — 1 Strings, 2 Winds, 3 Cadenza.
 *  Gated on a landed hit ("hitting a target with..."), so a dodge-cancelled Basic 3 (mv stripped
 *  by instaDodge()) pays nothing and leaves an armed Accidental standing. Accidental is the one
 *  road to a Cadenza: armed, the next note gained turns into one, whatever the cast would have
 *  paid. A full store makes room the kit's own way — every note past the leftmost Strings or
 *  Winds slides down a slot, that note is removed, and the new one takes the last slot; six
 *  Cadenzas part with nothing, and the gain is lost. */
function gainNote(note: number): void {
  if (!pressed().bullets.length) return;
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

/* ------------------------------------------------------------------------------- Hecate */

/** Hecate's queue, one packed word on Phrolova (bit 16 always set): bits 0-5 the basic attacks
 *  queued, 6-11 the enhanced, 12-13 what she is playing now — 0 nothing, 1 Hecate 1, 2 Hecate 2,
 *  3 an enhanced attack. */
const HECATE_QUEUE = new Buff({ name: "Phrolova: Hecate Queue", hidden: true, maxStacks: 0x1ffff });
const her = () => currentTeam().memberOf(PHROLOVA_RESONATOR);
const queued = (): number => her().stacksOf(HECATE_QUEUE);
function setQueue(basic: number, enhanced: number, playing: number): void {
  her().setStacks(HECATE_QUEUE, (1 << 16) | basic | (enhanced << 6) | (playing << 12));
}

/** Is Phrolova off field — or leaving it, on a swap-out press of her own. */
function offField(): boolean {
  const team = currentTeam();
  if (team.slots[team.onField] !== her()) return true;
  return team.slot === her() && currentAction().swapOut;
}

/** Would casting `a` end Maestro: any cast of hers but Hecate's, the Waltz that opens it and the
 *  Outro that hands it over. */
function endsMaestro(a: Action): boolean {
  if (a.cast === null) return false;
  for (let x: Action | null = a; x; x = x.cancelOf ?? x.formOf) {
    if (HECATE_ACTIONS.has(x) || x === Liberation || x === Outro) return false;
  }
  return true;
}

/** Before she arrives on a cast that would end Maestro, whoever hands her the field waits out the
 *  enhanced attack Hecate is playing; asked again after, so one queued behind it is waited out too. */
function hecateHold(next: Action): Action | null {
  if (!her().stacksOf(MAESTRO) || !endsMaestro(next) || ((queued() >> 12) & 3) !== 3) return null;
  const frames = (pressEndOf(NOTE_ATTACKS) ?? currentTeam().frame) - currentTeam().frame;
  if (frames <= 0) return null;
  return new Action(`Wait ${(frames / 60).toFixed(2)}s (Hecate)`, { animFrames: frames });
}

/** Hecate starts `move` now: its hits land on their frames, and its end plays whatever is next. */
function playHecate(playing: number, move: Action): void {
  const w = queued();
  setQueue(w & 63, (w >> 6) & 63, playing);
  if (playing === 3) addBuff(PHROLOVA_RESONATOR, AFTERSOUND, 1);
  // Maestro's attack, whichever end or cast set it going
  asSource(MAESTRO, () => queueOn(PHROLOVA_RESONATOR, move));
}

/** A commanded enhanced attack starts: Hecate is busy with it until its end. */
function startEnhanced(): void {
  const w = queued();
  setQueue(w & 63, (w >> 6) & 63, 3);
  addBuff(PHROLOVA_RESONATOR, AFTERSOUND, 1);
}

/** Hecate's attack is over: she plays whatever is next. */
function hecateEnded(): void {
  const now = queued();
  setQueue(now & 63, (now >> 6) & 63, 0);
  hecateNext(((now >> 12) & 3) === 1);
}

/** Hecate's next attack, if she is free and Phrolova is off field in Maestro: an enhanced first,
 *  on the leftmost note; Hecate 2 behind a Hecate 1; else a queued basic. */
function hecateNext(afterFirst = false): void {
  if (!her().stacksOf(MAESTRO) || !offField()) return;
  const w = queued();
  if ((w >> 12) & 3) return;
  const basic = w & 63, enhanced = (w >> 6) & 63;
  const note = her().stacksOf(NOTES) & 3;
  if (enhanced && note) {
    setQueue(basic, enhanced - 1, 0);
    playHecate(3, NOTE_MOVES[note - 1]!);
  } else if (afterFirst) {
    playHecate(2, HECATE_2);
  } else if (basic) {
    setQueue(basic - 1, enhanced, 0);
    playHecate(1, HECATE_1);
  }
}

/** Queue `n` enhanced attacks: one cuts a basic chain short and plays at once. */
function queueEnhanced(n: number): void {
  const w = queued(), playing = (w >> 12) & 3;
  setQueue(w & 63, ((w >> 6) & 63) + n, playing);
  if (!her().stacksOf(MAESTRO) || !offField()) return;
  if (playing === 1 || playing === 2) {
    cancelHits(BASIC_MOVES);
    setQueue(w & 63, ((w >> 6) & 63) + n, 0);
  }
  hecateNext();
}

/** The Waltz opens: Maestro, the ten Echo-cast chances, and Hecate's queue holding one basic. */
function startMaestro(): void {
  applyCurrent(MAESTRO, 1);
  setStacksSelf(NOTES, (stacksOf(NOTES) & ~(15 << 12)) | (10 << 12));
  cancelHits(MOVES);
  setQueue(1, 0, 0);
}

/** Maestro ends — its last note consumed, any cast of hers but Hecate's, or Augusta's Liberation —
 *  and Hecate's queue, every hit of hers still in flight and every note she held go with it. */
export function endMaestro(): void {
  const team = currentTeam();
  if (!team.slots.some((m) => m.resonator === PHROLOVA_RESONATOR) || !her().stacksOf(MAESTRO)) return;
  her().revoke(MAESTRO);
  cancelHits(MOVES);
  setQueue(0, 0, 0);
  // and every note she held with it, the Echo chances too
  her().setStacks(NOTES, 1 << 16);
}

/** Every 240 frames of Maestro: the leftmost note is consumed and a basic attack queued; the last
 *  one ends Maestro. */
function consumeNotes(n: number): void {
  for (let k = 0; k < n; k++) {
    const word = her().stacksOf(NOTES);
    if (!(word & 3)) break;
    const next = (word & ~0xfff) | ((word & 0xfff) >> 2);
    her().setStacks(NOTES, next);
    if (!(next & 0xfff)) {
      endMaestro();
      return;
    }
    const w = queued();
    setQueue((w & 63) + 1, (w >> 6) & 63, (w >> 12) & 3);
  }
  hecateNext();
}

/* ------------------------------------------------------------------------------------ buffs */

const AFTERSOUND = new Buff({
  name: "Phrolova: Aftersound", maxStacks: 124,
  // first 24 stacks pay 2.5% Crit DMG each, every stack past that pays 1%, capped at 100% total
  applyStats: () => {
    const n = frozenStacks(), held = Math.min(n, 24), overflow = n - held;
    addStat(Stat.CritDmg, Math.min(100, held * 2.5 + overflow));

    if (runningAction(ScarletCoda)) {
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

/** Maestro: the Waltz standing, until its last note is consumed (see the Hecate block above). */
export const MAESTRO = new Buff({
  name: "Phrolova: Maestro",
  stats: [[Stat.BonusAtk, 120]],
  tick: { every: 240, fire: (n) => consumeNotes(n) },
  // any cast of hers ends it but Hecate's own, the Waltz that opened it and the Outro handing over
  updateBuffs: () => { if (!triggeredAction() && endsMaestro(pressed())) endMaestro(); },
  // any active Echo Skill cast, hers or a teammate's, spends a chance for an enhanced attack
  updateGlobal: () => {
    if (!casting(Cast.Echo) || !isActive()) return;
    const word = her().stacksOf(NOTES);
    if (!((word >> 12) & 15)) return;
    her().setStacks(NOTES, word - (1 << 12));
    queueEnhanced(1);
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
  updateBuffs: () => { if (runningAction(Intro) || runningAction(EIntro) || casting(Cast.Echo)) applyCurrent(ACCIDENTAL, 1); },
});
/** No combat-formula effect this engine models — still equipped, just doesn't hand out a stat. */
const PH_INHERENT_2 = new Inherent({ name: "Inherent: Octet" ,

  // Octet: 10 Aftersound the instant she's on the team, not tied to when she first acts — and
  // the note store itself, empty (its always-set bit alone; see NOTES)
  combatStart: () => { applyCurrent(AFTERSOUND, 10); },
});

const PHROLOVA_OUTRO = new Buff({
  name: "Phrolova: Outro",
  duration: 60 * 14,
  stats: [[Stat.Amp, 20, Attribute.Havoc], [Stat.Amp, 25, Type.Heavy]],
  updateBuffs: () => lostOnSwap(),
});

/* --------------------------------------------------------------------------------- sequences */

/** S6's own Hecate cast, queued out of her two Forte actions — she's on the field for those, so
 *  unlike the Maestro notes this is an active action. */
const Apparition = phroAction("Hecate - Apparition of Beyond", { tag: ActionTag.Field, type: Type.Echo, mv: 216.42 });
HECATE_ACTIONS.add(Apparition);

/** S1: the out-of-combat top-up only ever reads, in a rotation, as opening the fight holding 2
 *  Volatile Notes — Cadenza by its own text ("gains Volatile Note - Cadenza until she has at
 *  least 2"), banked straight into the store's first two slots. */
const PH_S1 = new Sequence({
  name: "Phrolova S1: A Key to Netherworld's Secrets",
  combatStart: () => {
    applyCurrent(NOTES, 3 | (3 << 2));
    addForte1(2);
  },
  applyStats: () => { if (runningAction(FBA) || runningAction(FSkill)) addStat(Stat.MulMv, 80); },
});

/** S2: both Scarlet Coda lines together are the one +75% MV multiplier, not a per-Aftersound one. */
const PH_S2 = new Sequence({
  name: "Phrolova S2: A Rope Tied to a Life Beyond",
  grants: [{ on: onAction(ScarletCoda), buff: AFTERSOUND, stacks: 14 }],
  applyStats: () => { if (runningAction(ScarletCoda)) addStat(Stat.MulMv, 75); },
});

/** S3: Scarlet Coda turns every stored note into a Cadenza; the Cadenza ATK shred isn't modelled
 *  (enemy ATK doesn't enter this formula). */
const PH_S3 = new Sequence({
  name: "Phrolova S3: A Dagger to Cut Clean Obsessions",
  stats: [[Stat.Amp, 80, Type.Echo]],
  updateBuffs: () => {
    if (!runningAction(ScarletCoda)) return;
    let word = stacksOf(NOTES);
    for (let shift = 0; shift < 12; shift += 2) if ((word >> shift) & 3) word |= 3 << shift;
    setStacksSelf(NOTES, word);
  },
});

/** S4: 30s, so permanent uptime; untagged per the attribute-bonus rule. Her own Echo Skill casts
 *  are the trigger — Scarlet Coda counts as one (subcast). */
const PH_S4_TEAM = new Buff({
  name: "Phrolova S4: A Torch Illuminating the Path",
  duration: 60 * 30,
  stats: [[Stat.DmgBonus, 20]],
});
const PH_S4 = new Sequence({
  name: "Phrolova S4: A Torch Illuminating the Path",
  grants: [{ on: onCast(Cast.Echo), buff: PH_S4_TEAM, to: BuffTarget.Team }],
});

/** S5: a Stagnation field and 30% damage-taken reduction — neither reaches this calculator. */
const PH_S5 = new Sequence({ name: "Phrolova S5: A Forked Road in Fate's Heartland" });

/** S6: +24% MV on the Maestro notes, an extra Hecate cast out of each Forte action, and the
 *  Maestro damage split — off-field (her inactive actions) is the 40% the target takes, on-field
 *  is the Havoc bonus instead. */
const PH_S6 = new Sequence({
  name: "Phrolova S6: A Night to Depart From Eternal Rest",
  updateBuffs: () => {
    if (runningAction(FBA) || runningAction(FSkill)) queue(Apparition);
  },
  afterAction: () => {
    if (runningAction(Apparition)) applyCurrent(AFTERSOUND, 8); // TODO check if the apparition gains the 8 stacks for its damage
  },
  applyStats: () => {
    if (runningAnyOf(NOTE_ATTACKS)) addStat(Stat.MulMv, 24);
    if (stacksOf(MAESTRO)) {
      if (isActive()) addStat(Stat.DmgBonus, 60, Attribute.Havoc);
      else addStat(Stat.DamageTaken, 40);
    }
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
const PHROLOVA_TALENTS = new Talent({
  name: "Phrolova: Talents",
  stats: [[Stat.CritRate, 8], [Stat.BonusAtk, 12]],
});

/** Her, as a Resonator: name/element, every grant/spend/queue rule her kit needs, and her own
 *  base stat line. */
export const PHROLOVA_RESONATOR = new Resonator({
  name: "Phrolova",
  talent: PHROLOVA_TALENTS,
  inherent1: PH_INHERENT_1,
  inherent2: PH_INHERENT_2,
  element: Attribute.Havoc,
  weapon: WeaponType.Rectifier,
  color: "#a62c57",
  // resolved when its row is reached: whichever Intro the kit's state calls for there
  intro: new Action("Intro Resolver", { cast: Cast.Intro, resolve: () => (stacksOf(MAESTRO) ? EIntro : Intro) }),
  // Maestro still open means Suite of Immortality (EIntro) instead of plain Intro
  maxEnergy: 0,
  maxForte1: 6,
  holdBefore: (next) => hecateHold(next),

  // the note store and Hecate's queue, both empty (their always-set bits alone)
  combatStart: () => {
    applyCurrent(NOTES, 1 << 16);
    applyCurrent(HECATE_QUEUE, 1 << 16);
  },
  // leaving the field in Maestro is where Hecate takes over
  updateBuffs: () => { if (currentAction().swapOut && stacksOf(MAESTRO)) hecateNext(); },

  stats: [[Stat.BaseHp, 10775], [Stat.BaseAtk, 437.5], [Stat.BaseDef, 1136.6646]],
});

// INTRO resolves to plain Intro or EIntro on its own (see her own intro() above)
// NOINTRO ROTATIONS DO NOT HAVE AN INTRO

const BA123 = new ActionGroup("Basic - Movement of Life and Death 123", [BA1, BA2, BA3]);
const BA23 = new ActionGroup("Basic - Movement of Life and Death 23", [BA2, BA3]);
const HBA12 = new ActionGroup("Basic - Hecate 12", [HBA1, HBA2]).dodgeCancel();

const PHRO_FAST = new Rotation([
  NOINTRO, BA23.dodgeCancel(), FBA.instaCancel(), ECHO, 
  BA123.dodgeCancel(), FBA.instaCancel(), Skill.easyCancel(), FBA.instaCancel(),
  ScarletCoda.easyCancel(), Liberation, Outro,
  
  INTRO, BA3.dodgeCancel(), FBA.instaCancel(), ECHO, 
  BA123.dodgeCancel(), FBA.instaCancel(), Skill.easyCancel(), FBA.instaCancel(),
  ScarletCoda.easyCancel(), Liberation, Outro,
]);

const PHRO_MANUAL = new Rotation([
  NOINTRO, BA23.dodgeCancel(), FBA.instaCancel(), ECHO, 
  BA123.dodgeCancel(), FBA.instaCancel(), Skill.easyCancel(), FBA.instaCancel(),
  ScarletCoda.easyCancel(), Liberation, Outro,
  
  INTRO, BA3.dodgeCancel(), FBA.instaCancel(), ECHO, 
  BA123.dodgeCancel(), FBA.instaCancel(), Skill.easyCancel(), FBA.instaCancel(),
  ScarletCoda.easyCancel(), Liberation, HBA12.instaDodge(), EnhancedHecate.instaSwap(), Outro,
]);

const PHRO_5FBA = new Rotation([
  NOINTRO, BA23.dodgeCancel(), FBA.instaCancel(), ECHO, 
  BA123.dodgeCancel(), FBA.instaCancel(), Skill.easyCancel(), FBA.instaCancel(),
  ScarletCoda.easyCancel(), Liberation, Outro,

  INTRO, BA3.instaDodge(), FBA.instaDodge(),
  BA123.instaDodge(), FBA.instaDodge(),
  BA123.instaDodge(), FBA.instaCancel(),  ECHO,
  BA123.instaDodge(), FBA.instaCancel(), Skill.easyCancel(), FBA.instaCancel(),
  ScarletCoda.easyCancel(), Liberation, Outro,
]);

const PHRO_FAST_S2 = new Rotation([
  NOINTRO, BA23.hitCancel(), ECHO, FBA.instaCancel(), Skill.easyCancel(), FBA.instaCancel(),
  ScarletCoda.easyCancel(), Liberation, Outro,
  
  INTRO, BA3.dodgeCancel(), FBA.instaDodge(),
  BA123.hitCancel(), ECHO, FBA.instaCancel(), Skill.easyCancel(), FBA.instaCancel(),
  ScarletCoda.easyCancel(), Liberation, Outro,
]);
const PHRO_5FBA_S2 = new Rotation([
  NOINTRO, BA23.hitCancel(), ECHO, FBA.instaCancel(), Skill.easyCancel(), FBA.instaCancel(),
  ScarletCoda.easyCancel(), Liberation, Outro,

  INTRO,
  BA3.instaDodge(), FBA.instaDodge(),
  BA123.instaDodge(), FBA.instaDodge(),
  BA123.instaDodge(), FBA.instaDodge(),
  BA123.instaCancel(), ECHO, FBA.instaCancel(), Skill.easyCancel(), FBA.instaCancel(),
  ScarletCoda.easyCancel(), Liberation, Outro,
]);

export const PHRO_12s = new Loadout({
  resonator: PHROLOVA_RESONATOR,
  weapons: [LETHEAN_ELEGY, COSMIC_RIPPLES, STRINGMASTER],
  echoLoadouts: [new EchoLoadout(NM_HECATE, DREAM_OF_THE_LOST_3PC, HAVOC_ECLIPSE_2PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Havoc3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.AtkPct, Substat.Skill, Substat.FlatAtk, Substat.Basic),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Skill, Substat.FlatAtk, Substat.Basic),
    rotation: { 0: PHRO_5FBA, 2: PHRO_5FBA_S2 },
  sequences: [PH_S1, PH_S2, PH_S3, PH_S4, PH_S5, PH_S6],
});

export const PHRO_10s = new Loadout({
  resonator: PHROLOVA_RESONATOR,
  weapons: [LETHEAN_ELEGY, COSMIC_RIPPLES, STRINGMASTER],
  echoLoadouts: [
    new EchoLoadout(NM_HECATE, DREAM_OF_THE_LOST_3PC, HAVOC_ECLIPSE_2PC),
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Havoc3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.AtkPct, Substat.Skill, Substat.FlatAtk, Substat.Basic),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Skill, Substat.FlatAtk, Substat.Basic),
    rotation: { 0: PHRO_FAST, 2: PHRO_FAST_S2 },
  sequences: [PH_S1, PH_S2, PH_S3, PH_S4, PH_S5, PH_S6],
});
