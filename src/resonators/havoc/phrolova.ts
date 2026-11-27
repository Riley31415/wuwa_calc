/**
 * Phrolova. Her Volatile Notes are one packed Buff word (NOTES): six two-bit slots oldest-first —
 * Strings off Basic 3 or Movement of Fate and Finality, Winds off Whispers or Murmurs, a Cadenza
 * only by Accidental turning the next gain into one — plus four bits for the ten Echo-cast chances
 * a Waltz opens with.
 *
 * Maestro plays them through Hecate on her own clock: every 240 frames the leftmost note is
 * consumed, and consuming the last ends Maestro. Hecate's queue is a count of enhanced attacks
 * (one per Echo cast, two from her Outro); off field she plays them back to back, each on the note
 * in front when it is cast, and with none queued loops Hecate 1, 2 — cut the moment one is queued.
 * Any cast of hers but Hecate's ends Maestro, taking the queue, Hecate's hits in flight and her notes.
 * wuwalab imports: Aftersound (its forte_1) is the stacking buff AFTERSOUND here (S6's Apparition grants 8);
 *  Volatile Notes are forte1, off the kit text — wuwalab lists no Note gains.
 */
import { Stat, Attribute, WeaponType, Type, Cast, Node, Scaling, BuffTarget, Position, Input } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Sequence, matrix } from "../../engine/gear.js";
import {
  applyCurrent,
  stacksOf,
  currentCast, onAction,
  runningAction,
  casting,
  queue,
  queueQTE,
  revokeCurrent,
  addStat,
  frozenStacks,
  isHeld,
  setStacksSelf,
  currentMember,
  currentTeam,
  queueOn,
  queueOnBehindNext,
  asSource,
  isActive,
  onCast,
  addForte1,
  lostOnSwap,
  addBuff,
  cancelHits,
  runningAnyOf,
  triggeredAction,
  runningBullet,
  notAfter,
  holds,
  lacks,
  after,
  grounded,
  forte1,
  concerto,
} from "../../engine/context.js";
import type { TeamMember } from "../../engine/state.js";
import { ActionGroup, Action, Rotation, SWAPIN, waitFor, DEFAULT_DASH, SUCCESSFUL_DODGE, DASH, GROUND_DODGE_LACKS } from "../../engine/rotation.js";
import { CLASS_TUNE_BREAK, breakWhen } from "../tunebreak.js";
import { LETHEAN_ELEGY, STRINGMASTER } from "../../weapons/rectifier.js";
import { COSMIC_RIPPLES } from "../../weapons/standard.js";
import { AUGMENT, RADIANT_DAWN } from "../../weapons/battlepass.js";
import { DREAM_OF_THE_LOST_3PC } from "../../echoes/septimont.js";
import { NM_HECATE_MAINSLOT, NM_HECATE } from "../../echoes/rinascita.js";
import { mainstatOptions, Mainstat } from "../../echoes/mainstats.js";
import { Echoes } from "../../echoes/echoes.js";
import { substats, highSubs, Substat } from "../../echoes/substats.js";
import { HAVOC_ECLIPSE_2PC } from "../../echoes/jinzhou.js";

/* ----------------------------------------------------------------------------------- actions */

function phroAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Havoc, scaling: Scaling.Atk, ...def });
}

/** Reincarnate: entered by casting Basic 3 or Whispers, and ended by either Forte cast it opens. */
const REINCARNATE = new Buff({ name: "Phrolova: Reincarnate" });
/** Resolving Chord: activated by Scarlet Coda's last hit, the state Waltz of Forsaken Depths needs;
 *  casting the Waltz ends it. */
const RESOLVING_CHORD = new Buff({ name: "Phrolova: Resolving Chord" });

/** Maestro ended with her off field: switching to her without an Intro casts Curtain Call. Her
 *  next press of her own spends it. */
const CURTAIN_CALL_READY = new Buff({ name: "Phrolova: Curtain Call Ready" });
/** Hidden marker: Maestro or Curtain Call Ready held — when Curtain Call can be cast (`syncCurtainCall()`). */
const CURTAIN_CALL_OPEN = new Buff({ /* name: "Phrolova: Curtain Call Open" */ });
/** Hidden markers: the leftmost note held (1 Strings, 2 Winds, 3 Cadenza) — which command Hecate 2 leads into (`syncNotes()`). */
const NOTE_LEFT = [new Buff({ /* name: "Phrolova: Strings Leftmost" */ }), new Buff({ /* name: "Phrolova: Winds Leftmost" */ }), new Buff({ /* name: "Phrolova: Cadenza Leftmost" */ })];
/** `m`'s note markers to its store's leftmost note. */
function syncNotes(m: TeamMember): void {
  const note = m.stacksOf(NOTES) & 3;
  NOTE_LEFT.forEach((b, i) => { if (!!m.stacksOf(b) !== (note === i + 1)) m.setStacks(b, note === i + 1 ? 1 : 0); });
}
/** `m`'s Curtain Call marker to whether it holds Maestro or Curtain Call Ready. */
function syncCurtainCall(m: TeamMember): void {
  const open = !!m.stacksOf(MAESTRO) || !!m.stacksOf(CURTAIN_CALL_READY);
  if (!!m.stacksOf(CURTAIN_CALL_OPEN) !== open) m.setStacks(CURTAIN_CALL_OPEN, open ? 1 : 0);
}

/** Maestro: the Waltz standing, until its last note is consumed (see the Hecate block below). */
export const MAESTRO = new Buff({
  name: "Phrolova: Maestro",
  stats: [[Stat.BonusAtk, 120]],
  // one note a tick — `fire`'s argument is the tick's ordinal, not a count
  tick: { every: 240, fire: () => consumeNotes(1) },
  // any cast of hers ends it but Hecate's own, the Waltz that opened it and the Outro handing over
  updateBuffs: () => { if (!triggeredAction() && endsMaestro(currentCast())) endMaestro(); },
  // any active Echo Skill cast, hers or a teammate's, spends a chance for an enhanced attack
  updateGlobal: () => {
    if (!casting(Cast.Echo) || !isActive()) return;
    const word = her().stacksOf(NOTES);
    if (!((word >> 12) & 15)) return;
    her().setStacks(NOTES, word - (1 << 12));
    syncNotes(her());
    queueEnhanced(1);
  },
});

// energy/concerto come off the migrated sheet's combined BA12/BA23/BA123 rows — BA1/BA2 are
// derived by subtraction, cross-checked both ways against BA12 and BA23.
// "When in Reincarnate, press Normal Attack on the ground" casts Movement of Fate and Finality instead
const BA1 = phroAction("Basic - Movement of Life and Death 1", { input: Input.Basic, animFrames: 44, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 18, mv: 5345, energy: 84, concerto: 168, offtune: 2688 },
    { hitFrame: 35, mv: 5345, energy: 84, concerto: 168, offtune: 2688 },
  ]});
const HA = phroAction("Heavy - Movement of Life and Death", { input: Input.BasicHold, animFrames: 62, animPriority: { 0: 2 }, castPriority: 2, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 26, mv: 7985, energy: 126, concerto: 251, offtune: 4016 },
    { hitFrame: 49, mv: 7985, energy: 126, concerto: 251, offtune: 4016 },
  ]});
// "Press Normal Attack shortly after casting [Heavy Attack] to cast Basic Attack Stage 2"
const BA2 = phroAction("Basic - Movement of Life and Death 2", { input: Input.Basic, inputPriority: 1, after: [BA1, HA], position: Position.Grounded, lacks: [REINCARNATE, MAESTRO, CURTAIN_CALL_READY], animFrames: 36, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 12, mv: 9543, energy: 150, concerto: 300, offtune: 4800 }]});
// "Press Normal Attack shortly after casting this skill to cast Basic Attack Stage 3"
const DC = phroAction("Dodge Counter - Movement of Life and Death", { input: Input.Basic, after: [SUCCESSFUL_DODGE], animFrames: 50, animPriority: { 0: 8, 2: 2 }, castPriority: 8, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 24, mv: 12199, energy: 192, concerto: 384, offtune: 1336 },
  ], castConcerto: 1000 });

const Skill = phroAction("Skill - Whispers in a Fleeting Dream", { input: Input.Skill, animFrames: 34, animPriority: { 32: 2 }, castPriority: 4, cooldown: 60 * 12, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 10, mv: 10597, energy: 667, offtune: 2132, forte1: 1,
      updateDebuffs: () => gainNote(2) },
    { hitFrame: 48, commitFrame: 18, mv: 10597, energy: 667, offtune: 2132 },
  ], castConcerto: 1000,
  updateBuffs: () => applyCurrent(REINCARNATE, 1),
});

// both Forte casts: "When in Reincarnate, press ... on the ground"
const FBA = phroAction("Forte Basic - Movement of Fate and Finality", { input: Input.Basic, inputPriority: 2, position: Position.Grounded, holds: REINCARNATE, animFrames: 92, castPriority: 2, node: Node.Forte, cast: Cast.Basic, type: Type.Skill,
  updateBuffs: () => revokeCurrent(REINCARNATE), bullets: [
    { hitFrame: 8, commitFrame: 2, mv: 3788, energy: 24, concerto: 75, offtune: 762, forte1: 1,
      updateDebuffs: () => gainNote(1) },
    { hitFrame: 14, commitFrame: 2, mv: 3788, energy: 24, concerto: 75, offtune: 762 },
    { hitFrame: 20, commitFrame: 2, mv: 3788, energy: 24, concerto: 75, offtune: 762 },
    { hitFrame: 26, commitFrame: 2, mv: 3788, energy: 24, concerto: 75, offtune: 762 },
    { hitFrame: 53, commitFrame: 2, mv: 11783, energy: 75, concerto: 234, offtune: 2371 },
    { hitFrame: 60, commitFrame: 2, mv: 11783, energy: 75, concerto: 234, offtune: 2371 },
    { hitFrame: 67, commitFrame: 2, mv: 11783, energy: 75, concerto: 234, offtune: 2371 },
  ]});
const FSkill = phroAction("Forte Skill - Murmurs in a Haunting Dream", { input: Input.Skill, inputPriority: 1, position: Position.Grounded, holds: REINCARNATE, animFrames: 79, animPriority: { 79: 2 }, castPriority: 4, node: Node.Forte, cast: Cast.Skill, type: Type.Skill,
  updateBuffs: () => revokeCurrent(REINCARNATE), bullets: [
    { hitFrame: 10, mv: 2321, energy: 15, concerto: 50, offtune: 467, forte1: 1,
      updateDebuffs: () => gainNote(2) },
    { hitFrame: 16, mv: 2321, energy: 15, concerto: 50, offtune: 467 },
    { hitFrame: 22, mv: 2321, energy: 15, concerto: 50, offtune: 467 },
    { hitFrame: 28, mv: 2321, energy: 15, concerto: 50, offtune: 467 },
    { hitFrame: 38, mv: 4641, energy: 30, concerto: 100, offtune: 934 },
    { hitFrame: 81, commitFrame: 38, mv: 32482, energy: 205, concerto: 700, offtune: 6536 },
  ]});

/** Casting it sends Compose into its 25s cooldown, modelled as the cast's own. */
const ScarletCoda = phroAction("Forte Heavy - Scarlet Coda", { input: Input.BasicHold, inputPriority: 1, minForte1: 6,
  animFrames: 172, castPriority: 9, cooldown: 60 * 25,
  node: Node.Normal, cast: Cast.Heavy, subcast: Cast.Echo, type: Type.Skill, castForte1: -6,  bullets: [
    { hitFrame: 14, mv: 3301, energy: 35, offtune: 8307 },
    { hitFrame: 41, mv: 3301, energy: 35, offtune: 8307 },
    { hitFrame: 59, mv: 1238, energy: 13, offtune: 3116 },
    { hitFrame: 66, mv: 1238, energy: 13, offtune: 3116 },
    { hitFrame: 73, mv: 1238, energy: 13, offtune: 3116 },
    { hitFrame: 80, mv: 1238, energy: 13, offtune: 3116 },
    { hitFrame: 87, mv: 1238, energy: 13, offtune: 3116 },
    { hitFrame: 95, mv: 1238, energy: 13, offtune: 3116 },
    { hitFrame: 102, mv: 1238, energy: 13, offtune: 3116 },
    { hitFrame: 109, mv: 1238, energy: 13, offtune: 3116 },
    { hitFrame: 139, mv: 49510, energy: 519, offtune: 124602, updateDebuffs: () => applyCurrent(RESOLVING_CHORD, 1) },
  ], castConcerto: 4000,
});

// concerto only — Liberation costs no Resonance Energy (maxEnergy: 0 below). The sheet's separate
// "Lib2" row (465.22% MV) has no matching action here — a known gap, flagged rather than guessed.
// Opens Maestro and banks the ten auto-cast chances (NOTES' own bits 12-15). In Maestro "Phrolova
// floats in the air and commands Hecate".
const Liberation = phroAction("Liberation - Waltz of Forsaken Depths", {
  endPosition: Position.Midair, animFrames: 255, noSwapFrames: 225, castPriority: 10, timestop: [0, 225], motionStop: [0, 225],
  node: Node.Liberation, cast: Cast.Liberation, castConcerto: 2000, resetForte1: true,
  input: Input.Liberation, holds: RESOLVING_CHORD,
  updateBuffs: () => {
    revokeCurrent(RESOLVING_CHORD);
    startMaestro();
  },
  // Hecate does nothing until the Waltz has played out, which a swap doesn't cut
  afterAction: () => {
    her().revoke(HECATE_BUSY);
    hecateNext();
  },
});
/** Recast during Maestro: ends it (and with it Suite of Immortality's replacement). */
export const CurtainCall = phroAction("Liberation - Curtain Call", {
  input: Input.Liberation, position: Position.Grounded, holds: CURTAIN_CALL_OPEN, animFrames: 83, animPriority: { 47: 5, 83: 2 }, castPriority: 10, bullets: [{ hitFrame: 42, mv: 46522, energy: 293, concerto: 585, offtune: 9360 }],
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation,
  // its Resolving Chord form (held Liberation) ends that state too; either way it ends Maestro
  updateBuffs: () => {
    revokeCurrent(RESOLVING_CHORD);
    endMaestro();
  },
});

const Intro = phroAction("Intro - Suite of Quietus", {
  input: Input.Intro, lacks: MAESTRO, endPosition: Position.Grounded, qteFrames: 36, animFrames: 80, noSwapFrames: 76, animPriority: { 80: 1 }, castPriority: 11, motionStop: [6, 38],
  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [{ hitFrame: 43, commitFrame: 40, mv: 8061, energy: 400, offtune: 4055 }, { hitFrame: 62, commitFrame: 59, mv: 12091, energy: 600, offtune: 6082 }], castConcerto: 1000,
});
/** Maestro-replaced Intro — used whenever she re-enters with Maestro still open. Playing it is
 *  also what closes Maestro back out. */
const EIntro = phroAction("Intro - Suite of Immortality", {
  endPosition: Position.Grounded, qteFrames: 10, animFrames: 93, noSwapFrames: 90, animPriority: { 93: 1 }, castPriority: 11, motionStop: [6, 56],
  node: Node.Intro, cast: Cast.Intro, type: Type.Skill, bullets: [{ hitFrame: 60, mv: 59643, energy: 1000, offtune: 9600 }], castConcerto: 1000,resetForte1: true,
  input: Input.Intro, holds: MAESTRO,
  // the Waltz ends here, and the notes it was playing through go with it
  updateBuffs: () => endMaestro(),
});
// "When performing Basic Attack Stage 3, enter Reincarnate state"; either Intro leads into it too
const BA3 = phroAction("Basic - Movement of Life and Death 3", { input: Input.Basic, inputPriority: 1, after: [BA2, Intro, EIntro, DC], animFrames: 81, animPriority: { 0: 4, 81: 2 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic,
  updateBuffs: () => applyCurrent(REINCARNATE, 1), bullets: [
    { hitFrame: 30, mv: 3269, energy: 52, concerto: 103, offtune: 1644, forte1: 1,
      updateDebuffs: () => gainNote(1) },
    { hitFrame: 36, mv: 3269, energy: 52, concerto: 103, offtune: 1644 },
    { hitFrame: 42, mv: 3269, energy: 52, concerto: 103, offtune: 1644 },
    { hitFrame: 48, mv: 3269, energy: 52, concerto: 103, offtune: 1644 },
    { hitFrame: 54, mv: 3269, energy: 52, concerto: 103, offtune: 1644 },
    { hitFrame: 60, mv: 3269, energy: 52, concerto: 103, offtune: 1644 },
  ]});
/** In Maestro the Outro also queues two enhanced Hecate attacks, not charge-gated. */
const Outro = phroAction("Outro - Unfinished Piece", {
  animFrames: 0,
  cast: Cast.Outro, input: Input.Outro, minConcerto: 10000, castConcerto: -10000,
  updateBuffs: () => {
    queueQTE(PHROLOVA_OUTRO);
    if (stacksOf(MAESTRO)) queueEnhanced(2, true);
  },
});

function hecateAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Havoc, scaling: Scaling.Atk, type: Type.Echo, ...def });
}
/** One Hecate attack beside the fight: its bullets on their frames (wuwalab), and its end playing
 *  whatever she has queued next (`hecateEnded()`). Its priority is for its pressed form, below. */
const hecateMove = (id: string, animFrames: number, bullets: [number, number, object?][], animPriority: Record<number, number>, castPriority: number): Action => hecateAction(id, {
  animFrames, animPriority, castPriority, bullets: bullets.map(([hitFrame, mv, extra]) => ({ hitFrame, mv, ...extra })), afterAction: () => hecateEnded(),
});
// Hecate 2's frames include the idle before the loop's next Hecate 1
const HECATE_1 = hecateMove("Basic - Hecate 1", 40, [[10, 2784]], { 0: 2, 35: 0 }, 2);
const HECATE_2 = hecateMove("Basic - Hecate 2", 49, [[4, 1392], [22, 1392]], { 0: 2, 43: 0 }, 2);
// indexed by the note's slot value less one: Strings, Winds, Cadenza
const NOTE_MOVES = [
  hecateMove("Enhanced - Hecate Strings", 91, [[26, 10438], [56, 24355]], { 0: 4, 90: 0 }, 4),
  hecateMove("Enhanced - Hecate Winds", 71, [[26, 9916], [56, 23137]], { 0: 4, 70: 0 }, 4),
  hecateMove("Enhanced - Hecate Cadenza", 71, [[26, 10438], [56, 24355]], { 0: 4, 70: 0 }, 4),
// off field each banks its Aftersound on cast (wuwalab's counter_enhanced_hecate); the command doesn't
].map((move) => move.variant(move.name, { updateBuffs: () => addBuff(PHROLOVA_RESONATOR, AFTERSOUND, 1) }));

// The manual command, pressed on field: Hecate 1-2 by hand, then the leftmost note's attack as
// an instant swap (`EnhancedHecate.instant(), SWAP`), Hecate carrying on from its end once Phrolova is out.
// the cues only exist in Maestro
const HBA1 = HECATE_1.variant(HECATE_1.name, { input: Input.Basic, inputPriority: 1, holds: MAESTRO, cast: Cast.Basic, afterAction: undefined,  });
const HBA2 = HECATE_2.variant(HECATE_2.name, { input: Input.Basic, inputPriority: 2, after: [HBA1], holds: MAESTRO, cast: Cast.Basic, afterAction: undefined,  });
const COMMANDS = NOTE_MOVES.map((move, i) => move.variant(`${move.name} (Command)`, {
  input: Input.Basic, inputPriority: 2, cast: Cast.Basic, after: [HBA2], holds: [MAESTRO, NOTE_LEFT[i]!], updateBuffs: () => startEnhanced(),
}));
/** Her dash while she commands Hecate in Maestro: the plain one under Hecate's name, ending nothing. */
const HecateDash = DEFAULT_DASH.variant("Dash - Hecate", { inputPriority: 0, position: Position.Grounded, holds: MAESTRO, lacks: GROUND_DODGE_LACKS });
/** Her Tune Break: none while she commands Hecate in Maestro (the bar waits full). */
const PHRO_TUNE_BREAK = breakWhen(CLASS_TUNE_BREAK[WeaponType.Rectifier], { lacks: MAESTRO });
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
 *  by instaDash()) pays nothing and leaves an armed Accidental standing. Accidental is the one
 *  road to a Cadenza: armed, the next note gained turns into one, whatever the cast would have
 *  paid. A full store makes room the kit's own way — every note past the leftmost Strings or
 *  Winds slides down a slot, that note is removed, and the new one takes the last slot; six
 *  Cadenzas part with nothing, and the gain is lost. */
function gainNote(note: number): void {
  if (isHeld(ACCIDENTAL)) { note = 3; revokeCurrent(ACCIDENTAL); }
  const word = stacksOf(NOTES);
  for (let shift = 0; shift < 12; shift += 2) {
    if ((word >> shift) & 3) continue;
    setStacksSelf(NOTES, word | (note << shift));
    syncNotes(currentMember());
    return;
  }
  for (let shift = 0; shift < 12; shift += 2) {
    if (((word >> shift) & 3) === 3) continue;
    const notes = word & 0xfff;
    setStacksSelf(NOTES, (word & ~0xfff) | (notes & ((1 << shift) - 1)) | (((notes >> (shift + 2)) << shift) & 0xfff) | (note << 10));
    syncNotes(currentMember());
    return;
  }
}

/* ------------------------------------------------------------------------------- Hecate */

/** Hecate's queue, one packed word on Phrolova (bit 16 always set): bits 0-5 the enhanced attacks
 *  queued, 6-7 what she is playing now — 0 nothing, 1 Hecate 1, 2 Hecate 2, 3 an enhanced attack. */
const HECATE_QUEUE = new Buff({ maxStacks: 0x1ffff });
/** The real frame Phrolova lands on after a hold for Hecate (`hecateHold()`), plus one, 0 for
 *  none: Hecate starts nothing then — the enhanced attack waited out is the last she plays. */
const ARRIVING = new Buff({ maxStacks: 1 << 24 });
/** Held from the Waltz's cast to its end: Hecate starts nothing meanwhile. */
const HECATE_BUSY = new Buff({});
const her = () => currentTeam().memberOf(PHROLOVA_RESONATOR);
const queued = (): number => her().stacksOf(HECATE_QUEUE);
function setQueue(enhanced: number, playing: number): void {
  her().setStacks(HECATE_QUEUE, (1 << 16) | enhanced | (playing << 6));
}

/** Is Phrolova off field — or leaving it, on a swap-out press of her own. */
function offField(): boolean {
  const team = currentTeam();
  if (team.slots[team.onField] !== her()) return true;
  return team.slot === her() && currentCast().swapOut;
}

/** Would casting `a` end Maestro: any cast of hers but Hecate's (her dash included), the Waltz
 *  that opens it and the Outro that hands it over. */
function endsMaestro(a: Readonly<Action>): boolean {
  if (a.cast === Cast.None) return false;
  for (let x: Readonly<Action> | null = a; x; x = x.cancelOf ?? x.formOf) {
    if (HECATE_ACTIONS.has(x as Action) || x === HecateDash || x === Liberation || x === Outro) return false;
  }
  return true;
}

/** Before she arrives on a cast that would end Maestro, whoever hands her the field waits out the
 *  enhanced attack Hecate is playing; asked again after, so one queued behind it is waited out too. */
function hecateHold(next: Action): Action | null {
  if (!her().stacksOf(MAESTRO) || !endsMaestro(next) || ((queued() >> 6) & 3) !== 3) return null;
  const team = currentTeam();
  // the enhanced attack playing now, to the end of its animation
  let end = -1, playing = "Hecate";
  for (const h of team.timed) {
    if (!h.closes || !h.action) continue;
    for (let x: Action | null = h.action; x; x = x.cancelOf ?? x.formOf) {
      if (NOTE_ATTACKS.has(x) && h.due > end) { end = h.due; playing = x.name; }
    }
  }
  if (end < 0) return null;
  // ...and every enhanced attack queued behind it, played back to back on whichever note is in
  // front by then — the note clock consuming one every 240 game frames, the last ending Maestro,
  // and the attacks with it; the attacks are animations, so all of it is read on the real timer
  const word = her().stacksOf(NOTES) & 0xfff;
  let pairs = 0;
  for (let w = word; w; w >>= 2) pairs++;
  const firstTick = team.realOf(team.frame + her().stacks.tickIn(MAESTRO));
  const consumedBy = (t: number): number => (t < firstTick ? 0 : Math.floor((t - firstTick) / 240) + 1);
  const maestroEnds = pairs ? firstTick + (pairs - 1) * 240 : team.real;
  for (let k = queued() & 63; k > 0 && end < maestroEnds; k--) {
    const note = (word >> (2 * consumedBy(end))) & 3;
    if (!note) break;
    end += NOTE_MOVES[note - 1]!.animFrames;
  }
  end = Math.min(end, maestroEnds);
  // her Intro is cast once the outgoing press has played
  const introAt = Math.max(team.real, team.playsTo);
  const frames = end - introAt;
  if (frames <= 0) return null;
  const wait = waitFor(frames, `${playing} to hit`);
  return wait.variant(wait.name, { updateBuffs: () => her().setStacks(ARRIVING, end + 1) });
}

/** Hecate starts `move` now: its hits land on their frames, and its end plays whatever is next.
 *  Set going by her swap-out, it is cast behind the next resonator's press on that same frame
 *  (`behind`). */
function playHecate(enhanced: number, playing: number, move: Action, behind: boolean): void {
  setQueue(enhanced, playing);
  // Maestro's attack, whichever end or cast set it going
  asSource(MAESTRO, () => (behind ? queueOnBehindNext(PHROLOVA_RESONATOR, move) : queueOn(PHROLOVA_RESONATOR, move)));
}

/** A commanded enhanced attack starts: Hecate is busy with it until its end. */
function startEnhanced(): void {
  setQueue(queued() & 63, 3);
}

/** Hecate's attack is over: she plays whatever is next. */
function hecateEnded(): void {
  const now = queued();
  setQueue(now & 63, 0);
  hecateNext((now >> 6) & 3);
}

/** Hecate's next attack, if she is free and Phrolova is off field in Maestro: a queued enhanced on
 *  the leftmost note, else the loop — Hecate 2 behind a Hecate 1, Hecate 1 otherwise. */
function hecateNext(ended = 0, behind = false): void {
  if (!her().stacksOf(MAESTRO) || !offField()) return;
  if (her().stacksOf(HECATE_BUSY) || her().stacksOf(ARRIVING) === currentTeam().real + 1) return;
  const w = queued();
  if ((w >> 6) & 3) return;
  const enhanced = w & 63, note = her().stacksOf(NOTES) & 3;
  if (enhanced && note) playHecate(enhanced - 1, 3, NOTE_MOVES[note - 1]!, behind);
  else if (ended === 1) playHecate(enhanced, 2, HECATE_2, behind);
  else playHecate(enhanced, 1, HECATE_1, behind);
}

/** Queue `n` enhanced attacks: one cuts the Hecate 1-2 loop and plays at once — behind the next
 *  resonator's press, where her Outro queued them (`behind`). */
function queueEnhanced(n: number, behind = false): void {
  const w = queued(), playing = (w >> 6) & 3;
  setQueue((w & 63) + n, playing);
  if (!her().stacksOf(MAESTRO) || !offField()) return;
  if (playing === 1 || playing === 2) {
    cancelHits(BASIC_MOVES);
    setQueue((w & 63) + n, 0);
  }
  hecateNext(0, behind);
}

/** The Waltz opens: Maestro, the ten Echo-cast chances, and Hecate's queue empty. */
function startMaestro(): void {
  applyCurrent(MAESTRO, 1);
  syncCurtainCall(currentMember());
  setStacksSelf(NOTES, (stacksOf(NOTES) & ~(15 << 12)) | (10 << 12));
  syncNotes(currentMember());
  cancelHits(MOVES);
  setQueue(0, 0);
  her().addStack(HECATE_BUSY, 1);
}

/** Maestro ends — its last note consumed or any cast of hers but Hecate's — and Hecate's queue,
 *  every hit of hers still in flight (bar `keepHits`) and every note she held go with it. Ended
 *  with her off field, Curtain Call waits for her return. */
function endMaestro(keepHits = false): void {
  if (!her().stacksOf(MAESTRO)) return;
  her().revoke(MAESTRO);
  her().revoke(HECATE_BUSY);
  if (!keepHits) cancelHits(MOVES);
  if (offField()) her().addStack(CURTAIN_CALL_READY, 1);
  setQueue(0, 0);
  // and every note she held with it, the Echo chances too
  her().setStacks(NOTES, 1 << 16);
  syncNotes(her());
  syncCurtainCall(her());
}

/** Every 240 frames of Maestro: the leftmost note is consumed; the last one ends Maestro. */
function consumeNotes(n: number): void {
  for (let k = 0; k < n; k++) {
    const word = her().stacksOf(NOTES);
    if (!(word & 3)) break;
    const next = (word & ~0xfff) | ((word & 0xfff) >> 2);
    her().setStacks(NOTES, next);
    syncNotes(her());
    if (!(next & 0xfff)) {
      endMaestro();
      return;
    }
  }
}

/* ------------------------------------------------------------------------------------ buffs */

const AFTERSOUND = new Buff({
  name: "Phrolova: Aftersound", maxStacks: 124,
  // first 24 stacks pay 2.5% Crit DMG each, every stack past that pays 1%, capped at 100% total
  applyStats: () => {
    const n = frozenStacks(), held = Math.min(n, 24), overflow = n - held;
    addStat(Stat.CritDmg, Math.min(100, held * 2.5 + overflow));

    if (runningBullet(ScarletCoda, -1)) addStat(Stat.AddMv, 8255 * held);
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
const Apparition = phroAction("Hecate - Apparition of Beyond", { type: Type.Echo, bullets: [{ hitFrame: 70, commitFrame: 0, mv: 21642 }] });
HECATE_ACTIONS.add(Apparition);

/** S1: the out-of-combat top-up only ever reads, in a rotation, as opening the fight holding 2
 *  Volatile Notes — Cadenza by its own text ("gains Volatile Note - Cadenza until she has at
 *  least 2"), banked straight into the store's first two slots. */
const PH_S1 = new Sequence({
  name: "Phrolova S1: A Key to Netherworld's Secrets",
  combatStart: () => {
    applyCurrent(NOTES, 3 | (3 << 2));
    syncNotes(currentMember());
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
    syncNotes(currentMember());
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
  stats: [[Stat.CritRate, 8], [Stat.BonusAtk, 11.9999997]],
});

/** Her, as a Resonator: name/element, every grant/spend/queue rule her kit needs, and her own
 *  base stat line. */
export const PHROLOVA_RESONATOR = new Resonator({
  id: 1608,
  name: "Phrolova",
  matrix: matrix("Phrolova", 25),
  talent: PHROLOVA_TALENTS,
  inherent1: PH_INHERENT_1,
  inherent2: PH_INHERENT_2,
  element: Attribute.Havoc,
  weapon: WeaponType.Rectifier,
  color: "#a62c57",
  actions: [BA1, BA2, BA2.swapIn(), BA3, HA, DC, Skill, FBA, FSkill, ScarletCoda, Liberation, CurtainCall, CurtainCall.swapIn(), Intro, EIntro, Outro, HBA1, HBA2, ...COMMANDS, HecateDash, PHRO_TUNE_BREAK],
  maxEnergy: 0,
  maxForte1: 6,
  holdBefore: (next) => hecateHold(next),

  // the note store and Hecate's queue, both empty (their always-set bits alone)
  combatStart: () => {
    applyCurrent(NOTES, 1 << 16);
    syncNotes(currentMember());
    applyCurrent(HECATE_QUEUE, 1 << 16);
  },
  // leaving the field in Maestro is where Hecate takes over
  // her swap-out sets Hecate going; its attack is cast behind the next resonator's press
  updateBuffs: () => {
    if (currentCast().swapOut && stacksOf(MAESTRO)) hecateNext(0, true);
    if (!triggeredAction()) revokeCurrent(CURTAIN_CALL_READY);
    syncCurtainCall(currentMember());
  },
  // Augusta's Everbright Protector sends her off: Maestro ends and Hecate stops, her attack
  // already out still landing
  sentOff: () => endMaestro(true),

  stats: [[Stat.BaseHp, 10775], [Stat.BaseAtk, 437.5], [Stat.BaseDef, 1136.6646]],
});

// INTRO resolves to plain Intro or EIntro on its own (see her own intro() above)
// SWAPIN ROTATIONS DO NOT HAVE AN INTRO

const BA123 = new ActionGroup("Basic - Movement of Life and Death 123", [BA1, BA2, BA3]);
const BA23 = new ActionGroup("Basic - Movement of Life and Death 23", [BA2, BA3]);
const HBA12 = new ActionGroup("Basic - Hecate 12", [HBA1, HBA2]);

const PHRO_3FBA_MANUAL = new Rotation([
  SWAPIN, BA23.firstHit(), NM_HECATE, FBA, DASH,
  BA123.firstHit(), DASH, FBA, Skill, FBA,
  ScarletCoda, Liberation, Outro,
  
  Intro, EIntro, BA3.firstHit(), DASH, FBA, NM_HECATE,
  BA123.firstHit(), DASH, FBA, Skill, FBA,
  ScarletCoda, Liberation, HBA12.firstHit(), DASH, EnhancedHecate.instant(), Outro,
]);

const PHRO_3FBA = new Rotation([
  SWAPIN, BA23.firstHit(), NM_HECATE, FBA, DASH,
  BA123.firstHit(), DASH, FBA, Skill, FBA,
  ScarletCoda, Liberation, Outro,
  
  Intro, EIntro, BA3.firstHit(), DASH, FBA, NM_HECATE,
  BA123.firstHit(), DASH, FBA, Skill, FBA,
  ScarletCoda, Liberation, Outro,
]);
const PHRO_3FBA_S2 = new Rotation([
  SWAPIN, BA23.instant(), NM_HECATE, FBA, DASH,
  BA123.instant(), DASH, FBA, Skill, FBA,
  ScarletCoda, Liberation, Outro,
  
  Intro, EIntro, BA3.firstHit(), DASH, FBA, NM_HECATE,
  BA123.firstHit(), DASH, FBA, Skill, FBA,
  ScarletCoda, Liberation, Outro,
]);

const PHRO_4FBA = new Rotation([
  SWAPIN, BA23.firstHit(), NM_HECATE, FBA, DASH,
  BA123.firstHit(), DASH, FBA, Skill, FBA,
  ScarletCoda, Liberation, Outro,

  Intro, EIntro, BA3.firstHit(), DASH, FBA, DASH,
  BA123.instant(), DASH, FBA,  NM_HECATE,
  BA123.instant(), DASH, FBA, Skill, FBA,
  ScarletCoda, Liberation, Outro,
]);
const PHRO_4FBA_S2 = new Rotation([
  SWAPIN, BA23.instant(), NM_HECATE, FBA, DASH,
  BA123.instant(), DASH, FBA, Skill, FBA,
  ScarletCoda, Liberation, Outro,

  Intro, EIntro, BA3.firstHit(), DASH, FBA, DASH,
  BA123.instant(), DASH, FBA, NM_HECATE,
  BA123.instant(), DASH, FBA, Skill, FBA,
  ScarletCoda, Liberation, Outro,
]);

const PHRO_5FBA = new Rotation([
  SWAPIN, BA23.firstHit(), NM_HECATE, FBA, DASH,
  BA123.firstHit(), DASH, FBA, Skill, FBA,
  ScarletCoda, Liberation, Outro,

  Intro, EIntro, BA3.instant(), DASH, FBA, DASH,
  BA123.instant(), DASH, FBA, DASH,
  BA123.instant(), DASH, FBA,  NM_HECATE,
  BA123.instant(), DASH, FBA, Skill, FBA,
  ScarletCoda, Liberation, Outro,
]);
const PHRO_5FBA_S2 = new Rotation([
  SWAPIN, BA23.instant(), NM_HECATE, FBA, DASH,
  BA123.instant(), DASH, FBA, Skill, FBA,
  ScarletCoda, Liberation, Outro,

  Intro, EIntro, BA3.instant(), DASH, FBA, DASH,
  BA123.instant(), DASH, FBA, DASH,
  BA123.instant(), DASH, FBA, NM_HECATE,
  BA123.instant(), DASH, FBA, Skill, FBA,
  ScarletCoda, Liberation, Outro,
]);

export const PHRO_12s = new Loadout({
  id: 16081,
  resonator: PHROLOVA_RESONATOR,
  weapons: [LETHEAN_ELEGY, COSMIC_RIPPLES, STRINGMASTER, AUGMENT, RADIANT_DAWN],
  echoes: new Echoes({
    sets: [new EchoLoadout(NM_HECATE_MAINSLOT, DREAM_OF_THE_LOST_3PC, HAVOC_ECLIPSE_2PC)],
    mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Havoc3, Mainstat.ATK1),
    substats: substats(Substat.CritDmg, Substat.CritRate, Substat.AtkPct, Substat.Skill, Substat.FlatAtk, Substat.Basic),
    highSubstats: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Skill, Substat.FlatAtk, Substat.Basic, Substat.Liberation),
  }),
    rotation: { 0: PHRO_5FBA, 2: PHRO_5FBA_S2 
      
    },
  sequences: [PH_S1, PH_S2, PH_S3, PH_S4, PH_S5, PH_S6],
});

export const PHRO_11s = new Loadout({
  id: 16083,
  resonator: PHROLOVA_RESONATOR,
  weapons: [LETHEAN_ELEGY, COSMIC_RIPPLES, STRINGMASTER, AUGMENT, RADIANT_DAWN],
  echoes: new Echoes({
    sets: [
    new EchoLoadout(NM_HECATE_MAINSLOT, DREAM_OF_THE_LOST_3PC, HAVOC_ECLIPSE_2PC),
  ],
    mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Havoc3, Mainstat.ATK1),
    substats: substats(Substat.CritDmg, Substat.CritRate, Substat.AtkPct, Substat.Skill, Substat.FlatAtk, Substat.Basic),
    highSubstats: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Skill, Substat.FlatAtk, Substat.Basic, Substat.Liberation),
  }),
    rotation: { 0: PHRO_4FBA, 2: PHRO_4FBA_S2 

    },
  sequences: [PH_S1, PH_S2, PH_S3, PH_S4, PH_S5, PH_S6],
});


export const PHRO_9s = new Loadout({
  id: 16082,
  resonator: PHROLOVA_RESONATOR,
  weapons: [LETHEAN_ELEGY, COSMIC_RIPPLES, STRINGMASTER, AUGMENT, RADIANT_DAWN],
  echoes: new Echoes({
    sets: [
    new EchoLoadout(NM_HECATE_MAINSLOT, DREAM_OF_THE_LOST_3PC, HAVOC_ECLIPSE_2PC),
  ],
    mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Havoc3, Mainstat.ATK1),
    substats: substats(Substat.CritDmg, Substat.CritRate, Substat.AtkPct, Substat.Skill, Substat.FlatAtk, Substat.Basic),
    highSubstats: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Skill, Substat.FlatAtk, Substat.Basic, Substat.Liberation),
  }),
    rotation: { 0: PHRO_3FBA, 2: PHRO_3FBA_S2 

    },
  sequences: [PH_S1, PH_S2, PH_S3, PH_S4, PH_S5, PH_S6],
});
