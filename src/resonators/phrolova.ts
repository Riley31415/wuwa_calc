/**
 * Phrolova — a havoc main DPS. Volatile Notes (Strings/Winds/Cadenza, a real 6-slot FIFO queue
 * in `self().data.notes`) build off Basic Attack 3 / Movement of Fate and Finality (Strings)
 * and Skill / Murmurs in a Haunting Dream (Winds). Aftersound (10 on combat start, +1 per
 * Hecate Enhanced Attack) pays Crit DMG directly and scales Scarlet Coda's own damage.
 *
 * Liberation opens Maestro: +120% ATK, and every team Echo Skill cast queues a Hecate Enhanced
 * Attack using whichever Volatile Note is currently active. The active note advances every 5
 * active actions from *any* team member (not just Echo casts) — 6 notes × 5 actions each — and
 * past the 30th active action it just stalls on the 6th note rather than ending (see
 * `HECATE_ECHO_WATCH`); Maestro itself only ends on Curtain Call or switching back to Phrolova.
 * The one piece with no real equivalent here is Hecate's own off-field auto-attack cycle — a
 * literal time loop with no cast to hang it off — so that's one lump placeholder action, same
 * treatment as Cantarella's Diffusion.
 *
 * Curtain Call is never auto-triggered — every loop iteration opens on her own Enhanced Intro
 * (Suite of Immortality) instead, which ends Maestro the same way switching back to her always
 * does (see `endMaestro`), then Liberation reopens it before Outro closes the loop out.
 *
 * `OPENER`/`LOOP` split: she isn't the team's lead, so her first appearance skips the real
 * Intro press entirely (see `OPENER`); every loop after that opens on Enhanced Intro instead.
 *
 * Numbers from nanoka.cc (character 1608, echo 6000115, weapon 21050066); cross-checked
 * against the migrated sheet's non-chain rows — every chain-specific row (S2/S3/S6) is
 * skipped, per this project's no-resonance-chains rule.
 */
import { Buff, GlobalBuff, Gear, Action, Chain, PRIORITY } from "../kit.js";
import type { ActionDef } from "../kit.js";
import type { Slot } from "../state.js";
import {
  add, action, self, grantSelf, grantGlobal, stacksOf, revoke, removeStack,
  outro, queue, queueOn, slotsWith,
  isOutro, isEcho, isIntro,
} from "../state.js";
import { Stat, Element, DamageType, Node, Cast, Scaling } from "../stats.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";
import { MIDNIGHT_VEIL_2PC } from "./cantarella.js";

/** Volatile Note kinds — the 6-slot FIFO queue kept in `self().data.notes`. */
type NoteType = "strings" | "winds" | "cadenza";

/* --------------------------------------------------------------- resonator */

export const PHROLOVA = new Gear(() => {
  add(100, Stat.Er);
  add(5, Stat.CritRate);
  add(150, Stat.CritDmg);

  add(10775, Stat.BaseHp);
  add(438, Stat.BaseAtk);
  add(1137, Stat.BaseDef);
  add(8, Stat.CritRate);
  add(12, Stat.BonusAtk);

  // Accidental: Intro/Enhanced Intro/Echo Skill casts upgrade her next Volatile Note to Cadenza
  if (isIntro(action()!) || isEcho(action()!)) grantSelf(ACCIDENTAL_CADENZA);
  return "Phrolova";
// decides on Maestro and ends it right here — on the outro that's handing her the field,
// before Suite of Immortality (which doesn't get Maestro's own ATK) ever runs
}, () => {
  grantSelf(AFTERSOUND, 10);   // Octet: 10 Aftersound on entering combat
}, Element.Havoc, () => {
  if (!stacksOf(MAESTRO_ATK)) return Intro;
  endMaestro();
  return EIntro;
});

/** Accidental: a one-shot marker, no stats of its own — the next `gainNote()` call checks it. */
export const ACCIDENTAL_CADENZA = new Buff(PRIORITY.BUFF_STATS,
  () => "Phrolova: Accidental (next note is Cadenza)");

/** Volatile Notes: push onto the 6-slot FIFO. Past 6, the leftmost Strings/Winds note falls off
 *  — Cadenza notes are immune to eviction, per the kit text. Accidental upgrades the next one
 *  to Cadenza regardless of its natural type. */
function gainNote(type: NoteType): void {
  const data = self().data as { notes?: NoteType[] };
  const notes = (data.notes ??= []);
  const upgraded = stacksOf(ACCIDENTAL_CADENZA) > 0;
  if (upgraded) revoke(ACCIDENTAL_CADENZA);
  notes.push(upgraded ? "cadenza" : type);
  if (notes.length > 6) {
    const evict = notes.findIndex((n) => n !== "cadenza");
    notes.splice(evict === -1 ? 0 : evict, 1);
  }
}

function gainAftersound(): void {
  grantSelf(AFTERSOUND);
}

/** Aftersound: up to 124 stacks. The first 24 ("held") each pay 2.5% Crit DMG; every stack past
 *  that ("overflow") pays 1% instead — both together capped at 100% total, per the kit text. */
export const AFTERSOUND = new Buff(PRIORITY.BUFF_STATS, (stacks) => {
  const held = Math.min(stacks, 24), overflow = stacks - held;
  add(Math.min(100, held * 2.5 + overflow), Stat.CritDmg);
  return `Phrolova: Aftersound x${stacks}`;
}, 124);

/** Maestro: +120% ATK. Ends on Curtain Call or on switching back to Phrolova (Suite of
 *  Immortality) — either way all Volatile Notes are removed and the echo-triggered Hecate
 *  window (HECATE_ECHO_WATCH) closes early too, since it's scoped to the Maestro duration. */
export const MAESTRO_ATK = new Buff(PRIORITY.BUFF_STATS,
  () => { add(120, Stat.BonusAtk); return "Phrolova: Maestro"; });

function endMaestro(): void {
  revoke(MAESTRO_ATK);
  revoke(HECATE_ECHO_WATCH);
  revoke(HECATE_CHARGES);
  (self().data as { notes?: NoteType[] }).notes = [];
}

/** Queues the Hecate Enhanced Attack for whichever Volatile Note is active right now — read
 *  off `HECATE_ECHO_WATCH`'s remaining charges (a global count now, not this slot's own — the
 *  note queue itself is still per-slot, hence the explicit `slot` argument). */
function triggerHecateAttack(slot: Slot): void {
  const triggered = 30 - stacksOf(HECATE_ECHO_WATCH);
  const note = ((slot.data as { notes?: NoteType[] }).notes ?? [])[Math.floor(triggered / 5)];
  const eba = note === "winds" ? EBA_WINDS : note === "cadenza" ? EBA_CADENZA : EBA_STRINGS;
  queueOn(slot, eba);
}

/** A team Echo Skill cast queues a Hecate Enhanced Attack, up to 10 times total during Maestro
 *  — the kit's own cap, separate from how the active note advances. Global: the charge count
 *  isn't any one resonator's own, it's Maestro's shared pool. */
export const HECATE_CHARGES = new GlobalBuff(PRIORITY.BUFF_STATS,
  (stacks) => `Phrolova: Hecate Charges x${stacks}`, 10);

/** Ticks down on every active action from *any* team member, 30 to 1 — that's what actually
 *  moves the active note, every 5 ticks. Past the 30th active action it stalls on the 6th
 *  (last) note rather than ending — Maestro itself only ends on Curtain Call or switching back
 *  to Phrolova (Suite of Immortality), not from running out of notes to cycle through. A team
 *  Echo Skill cast additionally queues a Hecate Enhanced Attack for whichever note is active at
 *  that moment, as long as HECATE_CHARGES still has one to spend. Global so it can react no
 *  matter whose turn either kind of action lands on; only Phrolova's own note queue and
 *  Aftersound move (both read straight off her own slot, found via `slotsWith(PHROLOVA)`). */
export const HECATE_ECHO_WATCH = new GlobalBuff(PRIORITY.UPDATE_BUFFS, (stacks, a) => {
  if (!a.active) return;
  const [phrolova] = slotsWith(PHROLOVA);
  const held = stacksOf(HECATE_ECHO_WATCH);
  if (isEcho(a) && stacksOf(HECATE_CHARGES)) {
    triggerHecateAttack(phrolova!);
    removeStack(HECATE_CHARGES, 1);
  }
  if (held > 1) removeStack(HECATE_ECHO_WATCH, 1);
  return `Phrolova: Hecate Note Progress x${held}`;
}, 30);

/* ------------------------------------------------------------------ weapon */

/** Lethean Elegy, R1: Underworld Requiem. +12% ATK flat. Dealing Echo Skill DMG (a damage-type
 *  hit, not just a cast that counts as one) grants +32% Skill DMG Bonus, +32% Echo Skill DMG
 *  Amplification and 8% DEF ignore for 12s */
export const LETHEAN_ELEGY = new Gear(() => {
  add(587.5, Stat.BaseAtk);
  add(24.3, Stat.CritRate);
  add(12, Stat.BonusAtk);
  if (action()!.type === DamageType.Echo) grantSelf(UNDERWORLD_REQUIEM);
  return "Lethean Elegy";
});

export const UNDERWORLD_REQUIEM = new Buff(PRIORITY.BUFF_STATS, () => {
  add(32, DamageType.Skill, Stat.DmgBonus);
  add(32, DamageType.Echo, Stat.Amp);
  add(8, Stat.DefIgnore);
  return "Lethean Elegy: Underworld Requiem";
});

/* -------------------------------------------------------------- echo, sonata */

/** Nightmare: Hecate, her mainslot echo — flat Havoc/Echo Skill DMG Bonus for whoever wears it,
 *  no trigger. */
export const NM_HECATE = new Gear(() => {
  add(12, Element.Havoc, Stat.DmgBonus);
  add(20, DamageType.Echo, Stat.DmgBonus);
  return "Nightmare: Hecate";
});

export const ACTION_NM_HECATE = new Action("Echo: Nightmare Hecate", {
  cast: DamageType.Echo,
  element: Element.Havoc,
  scaling: Scaling.Atk,
  type: DamageType.Echo,
  mv: 457.17,
  energy: 3.15,
});

/** Dream of the Lost 3pc: "Holding 0 Resonance Energy" — her max Energy is 0 (Liberation costs
 *  none), so this is unconditionally true for her specifically, not a real trigger. */
export const DREAM_OF_THE_LOST_3PC = new Gear(() => {
  add(20, Stat.CritRate); // only frolo and lucilla
  add(35, DamageType.Echo, Stat.DmgBonus);
  return "Dream of the Lost 3pc";
});

/** Her echoes: Nightmare: Hecate mainslot, Dream of the Lost 3pc, Midnight Veil 2pc (shared
 *  with Cantarella) — the sheet's `frolo r1` build. 43311 crit-rate. */
export const LOADOUT = [
  PHROLOVA, LETHEAN_ELEGY, NM_HECATE, DREAM_OF_THE_LOST_3PC, MIDNIGHT_VEIL_2PC,
  mainstats("CD", "havoc havoc", "atk atk"),
  chem("atk", "skill"),
];

/* ----------------------------------------------------------------- actions */

function phroAction(name: string, def: ActionDef): Action {
  return new Action(`Phrolova: ${name}`, {
    element: Element.Havoc,
    scaling: Scaling.Atk,
    ...def,
  });
}

// --- basics, mid-air, dodge counter
const BA1 = phroAction("Basic 1", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 106.9, energy: 1.59, concerto: 3.18 });
const BA2 = phroAction("Basic 2", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 95.43, energy: 1.59, concerto: 3.18 });
const BA3 = phroAction("Basic 3", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 196.14, energy: 3.12, concerto: 6.18,
  priority: PRIORITY.UPDATE_BUFFS, apply() { gainNote("strings"); } });
const MA = phroAction("Plunge", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 127.24, energy: 2, concerto: 4 });
const DC = phroAction("Dodge Counter", { node: Node.Normal, cast: Cast.DodgeCounter, type: DamageType.Basic, mv: 121.99, energy: 1.92, concerto: 3.84 });
const HA = phroAction("Heavy", { node: Node.Normal, cast: DamageType.Heavy, type: DamageType.Heavy, mv: 159.7, energy: 2.52, concerto: 5.02 });

export const BA12 = new Chain("Phrolova: Basic 12", [BA1, BA2]);
export const BA23 = new Chain("Phrolova: Basic 23", [BA2, BA3]);
export const BA123 = new Chain("Phrolova: Basic 123", [BA1, BA2, BA3]);

// --- resonance skill: Whispers in a Fleeting Dream, sends her into Reincarnate
const Skill = phroAction("Skill", { node: Node.Skill, cast: DamageType.Skill, type: DamageType.Skill, mv: 211.94, energy: 13.34, concerto: 10,
  priority: PRIORITY.UPDATE_BUFFS, apply() { gainNote("winds"); } });

// --- Reincarnate follow-ups: Movement of Fate and Finality (basic), Murmurs in a Haunting
//     Dream (skill) — both "considered Resonance Skill DMG"
const FBA = phroAction("Forte Basic", { node: Node.Forte, cast: DamageType.Basic, type: DamageType.Skill, mv: 505.01, energy: 3.21, concerto: 10.02,
  priority: PRIORITY.UPDATE_BUFFS, apply() { gainNote("strings"); } });
const FSkill = phroAction("Forte Skill", { node: Node.Forte, cast: DamageType.Skill, type: DamageType.Skill, mv: 464.07, energy: 2.95, concerto: 10,
  priority: PRIORITY.UPDATE_BUFFS, apply() { gainNote("winds"); } });

/** Scarlet Coda: base 660.16% plus 82.55% of her ATK's own motion value per Aftersound stack
 *  she's actually holding — real-time scaling, not an assumed count. Also counts as casting
 *  Echo Skill. */
const ScarletCoda = phroAction("Forte Heavy", {
  node: Node.Normal, cast: DamageType.Heavy, cast2: DamageType.Echo, type: DamageType.Skill, mv: 660.16, energy: 6.93, concerto: 40,
  priority: PRIORITY.LATE_CONVERSION,
  apply() { add(82.55 * Math.min(24, stacksOf(AFTERSOUND)), Stat.AddMv); },
});

// --- liberation: opens Maestro
const Liberation = phroAction("Liberation", {
  node: Node.Liberation, cast: DamageType.Liberation, type: DamageType.Liberation, mv: 0, concerto: 20,
  priority: PRIORITY.UPDATE_BUFFS,
  apply() {
    grantSelf(MAESTRO_ATK);
    grantGlobal(HECATE_ECHO_WATCH, 30);
    grantGlobal(HECATE_CHARGES, 10);
  },
});

/** The off-field auto Basic-Attack-Hecate cycle — a real-time loop with no cast to trigger it,
 *  so (matching Cantarella's Diffusion) it's one lump placeholder for the whole window. */
export const HECATE_AUTO_CYCLE = new Action("Hecate: Auto Basic 12 x4", {
  element: Element.Havoc, scaling: Scaling.Atk, type: DamageType.Echo, mv: 222.72, active: false,
});

// --- intro / outro
/** Suite of Quietus — her ordinary intro. The preceding member's outro triggers whichever of
 *  this and `EIntro` her current Maestro state calls for (see the `PHROLOVA` Gear's onIntro).
 *  She isn't the team's opening resonator, so her first appearance is the opener below and
 *  never calls onIntro at all — this only ever fires once Maestro has already ended (Curtain
 *  Call, or a loop that outlasted the 30-action window) by the time she'd swap back in. */
const Intro = phroAction("Intro", {
  node: Node.Intro, cast: DamageType.Intro, type: DamageType.Intro, mv: 201.52, energy: 10, concerto: 10,
});
/** Suite of Immortality — the Maestro-replaced Intro press. Maestro already ended on the outro
 *  that triggered this (see the PHROLOVA Gear's onIntro); this hit never sees its +120% ATK. */
const EIntro = phroAction("Enhanced Intro", {
  node: Node.Intro, cast: DamageType.Intro, type: DamageType.Skill, mv: 596.43, energy: 10, concerto: 10,
});
const Outro = phroAction("Outro", {
  cast: DamageType.Outro, type: DamageType.Outro, mv: 0, concerto: -100, active: false,
  priority: PRIORITY.UPDATE_BUFFS,
  apply() {
    outro(PHROLOVA_OUTRO);
    // in Maestro (post-Liberation), her own outro also triggers 2 Enhanced Hecate Attacks
    if (stacksOf(MAESTRO_ATK)) {
        queue(HECATE_AUTO_CYCLE); triggerHecateAttack(self()); triggerHecateAttack(self());
    }
  },
});
export const PHROLOVA_OUTRO = new Buff(PRIORITY.BUFF_STATS, (stacks, a) => {
  if (isOutro(a)) revoke(PHROLOVA_OUTRO);
  add(20, Element.Havoc, Stat.Amp);
  add(25, DamageType.Heavy, Stat.Amp);
  return "Phrolova: Outro";
});

/** Curtain Call — exported for completeness, not used in the default rotation (see the file
 *  header: nothing here auto-triggers it). Ends Maestro same as EIntro, on whichever of its 5
 *  real trigger conditions actually casts it. */
export const CurtainCall = phroAction("Curtain Call", {
  node: Node.Liberation, type: DamageType.Liberation, mv: 465.22,
  // AUTO_ACTION: same reason as EIntro — still benefits from Maestro's ATK on the hit that ends it.
  priority: PRIORITY.AUTO_ACTION,
  apply() { endMaestro(); },
});

/* -------------------------------------------------------------------- Hecate */

function hecateAction(name: string, def: ActionDef): Action {
  return new Action(`Hecate: ${name}`, {
    element: Element.Havoc,
    scaling: Scaling.Atk,
    type: DamageType.Echo,
    ...def,
  });
}

const HBA1 = hecateAction("Basic 1", { mv: 27.84 });
const HBA2 = hecateAction("Basic 2", { mv: 27.84 });
export const HBA12 = new Chain("Hecate: Basic 12", [HBA1, HBA2]);

/** Each Enhanced Attack gains Phrolova 1 Aftersound on landing. */
export const EBA_STRINGS = hecateAction("Enhanced Strings", {
  mv: 347.93, priority: PRIORITY.UPDATE_BUFFS, apply() { gainAftersound(); },
});
export const EBA_WINDS = hecateAction("Enhanced Winds", {
  mv: 330.53, priority: PRIORITY.UPDATE_BUFFS, apply() { gainAftersound(); },
});
export const EBA_CADENZA = hecateAction("Enhanced Cadenza", {
  mv: 347.93, priority: PRIORITY.UPDATE_BUFFS, apply() { gainAftersound(); },
});

/** She isn't the team's lead — her first appearance is a mid-combo swap-in, not a real Intro
 *  press, so the opener is just enough Basic Attacks to get going. */
export const OPENER = [BA23, FBA, Skill, FBA, ACTION_NM_HECATE, BA123, FSkill,
  ScarletCoda, Liberation, Outro];

/** The sheet's `frolo manual` loop: the preceding member's outro triggers Enhanced Intro
 *  (ending whatever Maestro her last Liberation left running — see `onIntro`), then enough
 *  Basic/Skill hits to bank all 6 Volatile Notes (2 Strings, 2 Winds from BA3/FBA/Skill/FSkill,
 *  a 3rd Strings from Basic 123's own stage 3, and a 6th from Accidental upgrading the note
 *  after her Echo cast to Cadenza) before Scarlet Coda, then Liberation reopens Maestro, and
 *  Outro closes the loop — triggering 2 bonus Enhanced Hecate Attacks since Maestro is freshly
 *  open. */
export const LOOP = [
  BA3, FBA, Skill, FBA, ACTION_NM_HECATE, BA123, FSkill,
  ScarletCoda, Liberation, Outro,
];
