/**
 * Phrolova — a havoc main DPS. Volatile Notes (Strings/Winds/Cadenza, a real 6-slot FIFO queue
 * held on her own `Phrolova.notes`) build off Basic Attack 3 / Movement of Fate and Finality (Strings)
 * and Skill / Murmurs in a Haunting Dream (Winds). Aftersound (10 on combat start, +1 per
 * Hecate Enhanced Attack) pays Crit DMG directly and scales Scarlet Coda's own damage.
 *
 * Liberation opens Maestro: +120% ATK, and every team Echo Skill cast queues a Hecate Enhanced
 * Attack using whichever Volatile Note is currently active. The active note advances every 8
 * active actions from *any* team member (not just Echo casts) — 6 notes × 8 actions each, 48
 * total — and past the 48th active action it just stalls on the 6th note rather than ending
 * (see `HECATE_ECHO_WATCH`); Maestro itself only ends on Curtain Call or switching back to
 * Phrolova. Hecate's own hits (the Enhanced Attacks, the off-field Auto cycle) are marked
 * `active: false` — she's genuinely off-field acting autonomously while someone else holds the
 * field, so those hits don't themselves count toward the "active actions" that move the note
 * along, matching the "active resonators" wording rule. The one piece with no real equivalent
 * here is Hecate's own off-field auto-attack cycle — a literal time loop with no cast to hang
 * it off — so that's one lump placeholder action, same treatment as Cantarella's Diffusion.
 *
 * Curtain Call is never auto-triggered — every loop iteration opens on her own Enhanced Intro
 * (Suite of Immortality) instead, which ends Maestro the same way switching back to her always
 * does (see `endMaestro`), then Liberation reopens it before Outro closes the loop out.
 *
 * `OPENER`/`LOOP` split: she isn't the team's lead, so her first appearance skips the real
 * Intro press entirely (see `OPENER`); every loop after that opens on Enhanced Intro instead.
 *
 * Numbers from nanoka.cc (character 1608, https://ww.nanoka.cc/character/1608, echo 6000115, weapon 21050066); cross-checked
 * against the migrated sheet's non-chain rows. Sequences 1-6 and the R5 weapon are implemented
 * as a secondary `LOADOUT_S6R5`, by explicit instruction — the default `LOADOUT` stays
 * sequence-0/R1. S1's out-of-combat Cadenza regen and S5's enemy-Stagnate field / DMG-taken
 * reduction have no combat-formula equivalent (non-combat trigger, incoming-damage reduction —
 * out of scope), so both are no-ops there; S3's "convert notes to Cadenza on Scarlet Coda" and
 * its enemy ATK-down debuff are skipped the same way (Cadenza/Strings already share one MV, and
 * enemy ATK never feeds our own damage) — only its own +80% Echo Skill DMG Amp is modelled.
 */
import { Buff, GlobalBuff, Gear, Action, Chain, PRIORITY, ECHO_CAST } from "../kit.js";
import type { ActionDef } from "../kit.js";
import type { Ctx, Slot, ResonatorFactory } from "../state.js";
import { Resonator, Loadout, isOutro, isEcho, isIntro } from "../state.js";
import { Stat, Element, DamageType, Node, Cast, Scaling } from "../stats.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";
import { MIDNIGHT_VEIL_2PC } from "../echoes/rinascita.js";
import { NM_HECATE, DREAM_OF_THE_LOST_3PC } from "../echoes/septimont.js";
import { LETHEAN_ELEGY, LETHEAN_ELEGY_R5 } from "../weapons/rectifier.js";

/** This resonator's own color — every action from the wrapper below defaults to it. */
export const COLOR = "#d84b5a";

/** Volatile Note kinds — the 6-slot FIFO queue kept in `self().data.notes`. */
type NoteType = "strings" | "winds" | "cadenza";

/* --------------------------------------------------------------- resonator */

/** Accidental: a one-shot marker, no stats of its own — the next `gainNote()` call checks it. */
export const ACCIDENTAL_CADENZA = new Buff(PRIORITY.BUFF_STATS,
  () => "Phrolova: Accidental (next note is Cadenza)");

/** Volatile Notes: push onto the 6-slot FIFO. Past 6, the leftmost Strings/Winds note falls off
 *  — Cadenza notes are immune to eviction, per the kit text. Accidental upgrades the next one
 *  to Cadenza regardless of its natural type. */
function gainNote(ctx: Ctx, type: NoteType): void {
  const notes = (ctx.slot.resonator as Phrolova).notes;
  const upgraded = ctx.stacksOf(ACCIDENTAL_CADENZA) > 0;
  if (upgraded) ctx.revoke(ACCIDENTAL_CADENZA);
  notes.push(upgraded ? "cadenza" : type);
  if (notes.length > 6) {
    const evict = notes.findIndex((n) => n !== "cadenza");
    notes.splice(evict === -1 ? 0 : evict, 1);
  }
}

/** Aftersound: up to 124 stacks. The first 24 ("held") each pay 2.5% Crit DMG; every stack past
 *  that ("overflow") pays 1% instead — both together capped at 100% total, per the kit text. */
export const AFTERSOUND = new Buff(PRIORITY.BUFF_STATS, (ctx, stacks) => {
  const held = Math.min(stacks, 24), overflow = stacks - held;
  ctx.add(Math.min(100, held * 2.5 + overflow), Stat.CritDmg);
  return `Phrolova: Aftersound x${stacks}`;
}, 124);

/** Maestro: +120% ATK. Ends on Curtain Call or on switching back to Phrolova (Suite of
 *  Immortality) — either way all Volatile Notes are removed and the echo-triggered Hecate
 *  window (HECATE_ECHO_WATCH) closes early too, since it's scoped to the Maestro duration. */
export const MAESTRO_ATK = new Buff(PRIORITY.BUFF_STATS,
  (ctx) => { ctx.add(120, Stat.BonusAtk); return "Phrolova: Maestro"; });

/** `slot` defaults to the acting one (every in-file call site), but takes an explicit override
 *  for a teammate's own kit ending Maestro on Phrolova's behalf — Augusta's Lib2, currently, the
 *  same way her own EIntro would. HECATE_ECHO_WATCH/HECATE_CHARGES are global, so `ctx.revoke`
 *  reaches them regardless of whose slot is acting; only the local buff and the note queue need
 *  the explicit slot. */
export function endMaestro(ctx: Ctx, slot: Slot = ctx.slot): void {
  slot.removeBuff(MAESTRO_ATK);
  ctx.revoke(HECATE_ECHO_WATCH);
  ctx.revoke(HECATE_CHARGES);
  const phrolova = slot.resonator as Phrolova;
  phrolova.notes = [];
  phrolova.hecateProgress = 0;
}

/** Queues the Hecate Enhanced Attack for whichever Volatile Note is active right now — read
 *  off Phrolova's own `hecateProgress` (still per-slot, hence the explicit `slot` argument). */
function triggerHecateAttack(ctx: Ctx, slot: Slot): void {
  const phrolova = slot.resonator as Phrolova;
  const note = phrolova.notes[Math.floor(phrolova.hecateProgress / 8)];
  const eba = note === "winds" ? EBA_WINDS : note === "cadenza" ? EBA_CADENZA : EBA_STRINGS;
  ctx.queueOn(slot, eba);
}

/** A team Echo Skill cast queues a Hecate Enhanced Attack, up to 10 times total during Maestro
 *  — the kit's own cap, separate from how the active note advances. Global: the charge count
 *  isn't any one resonator's own, it's Maestro's shared pool. */
export const HECATE_CHARGES = new GlobalBuff(PRIORITY.BUFF_STATS,
  (ctx, stacks) => `Phrolova: Hecate Charges x${stacks}`, 10);

/** Whether Maestro's Hecate window is open at all — the countdown itself (0-47, moving the
 *  active note every 8 ticks) isn't a real buff (nothing reads it as a stat), so it lives as
 *  `hecateProgress` directly on Phrolova's own Resonator instead of this buff's stack count; this
 *  is just the presence/absence gate plus the trigger, granted once (see Liberation's apply())
 *  and revoked by `endMaestro`. Past the 47th active action it stalls on the 6th (last) note
 *  rather than ending — Maestro itself only ends on Curtain Call or switching back to Phrolova
 *  (Suite of Immortality), not from running out of notes to cycle through. A team Echo Skill cast
 *  additionally queues a Hecate Enhanced Attack for whichever note is active at that moment, as
 *  long as HECATE_CHARGES still has one to spend. Global so it can react no matter whose turn
 *  either kind of action lands on; only Phrolova's own note queue/progress and Aftersound move
 *  (all read straight off her own slot, found via `slotsWith("Phrolova")`). */
export const HECATE_ECHO_WATCH = new GlobalBuff(PRIORITY.UPDATE_BUFFS, (ctx) => {
  const a = ctx.action!;
  if (!a.active) return;
  const [phrolovaSlot] = ctx.slotsWith("Phrolova");
  const phrolova = phrolovaSlot!.resonator as Phrolova;
  if (isEcho(a) && ctx.stacksOf(HECATE_CHARGES)) {
    triggerHecateAttack(ctx, phrolovaSlot!);
    ctx.removeStack(HECATE_CHARGES, 1);
  }
  if (phrolova.hecateProgress < 47) phrolova.hecateProgress++;
  return `Phrolova: Hecate Note Progress x${Math.floor(phrolova.hecateProgress / 8) + 1}`;
});

/** Her own Resonator — shared by both loadouts below (see `LOADOUT_S6R5`); only the weapon and
 *  sonata (sequences added on top) differ, so mainstats/substats live here once rather than
 *  being repeated per loadout. */
export class Phrolova extends Resonator {
  /** Volatile Notes: the 6-slot FIFO queue `gainNote` pushes onto — real per-fight state, not a
   *  buff, so it's a plain field here instead of the generic `slot.data` bag. */
  notes: NoteType[] = [];
  /** 0-47 while Maestro's Hecate window is open (HECATE_ECHO_WATCH's own apply() advances it and
   *  reads it for the active note index) — also not a real buff, just a countdown. */
  hecateProgress = 0;

  constructor(loadout: Loadout, sequences: Gear[] = []) {
    super(
      "Phrolova",
      Element.Havoc,
      // decides on Maestro and ends it right here — on the outro that's handing her the field,
      // before Suite of Immortality (which doesn't get Maestro's own ATK) ever runs
      (ctx) => {
        if (!ctx.stacksOf(MAESTRO_ATK)) return Intro;
        endMaestro(ctx);
        return EIntro;
      },
      loadout,
      (ctx) => {
        ctx.add(10775, Stat.BaseHp);
        ctx.add(437.5, Stat.BaseAtk);
        ctx.add(1137, Stat.BaseDef);
        // Accidental: Intro/Enhanced Intro/Echo Skill casts upgrade her next Volatile Note to Cadenza
        if (isIntro(ctx.action!) || isEcho(ctx.action!)) ctx.grantSelf(ACCIDENTAL_CADENZA);
      },
      (ctx) => {
        ctx.add(8, Stat.CritRate);
        ctx.add(12, Stat.BonusAtk);
      },
      (ctx) => { ctx.grantSelf(AFTERSOUND, 10); },   // Octet: 10 Aftersound on entering combat
      null,
      sequences,
      0,   // Liberation costs no Resonance Energy — see DREAM_OF_THE_LOST_3PC's own check
    );
  }
}

/** Her echoes: Nightmare: Hecate mainslot, Dream of the Lost 3pc, Midnight Veil 2pc (shared
 *  with Cantarella) — the sheet's `frolo r1` build. 43311 crit-rate. */
const PHROLOVA_LOADOUT = new Loadout(
  LETHEAN_ELEGY, NM_HECATE, DREAM_OF_THE_LOST_3PC, MIDNIGHT_VEIL_2PC,
  mainstats("CD", "havoc havoc", "atk atk"), chem("atk", "skill"),
);
export const LOADOUT: ResonatorFactory = () => new Phrolova(PHROLOVA_LOADOUT);

/* ------------------------------------------------------------------- sequences */

/** S1 A Key to Netherworld's Secrets: +80% MV multiplier on Movement of Fate and Finality (Forte
 *  Basic) and Murmurs in a Haunting Dream (Forte Skill) specifically. The out-of-combat Cadenza
 *  regen (staying below 2 notes outside Maestro for 4s) has no combat-relevant effect here — no-op. */
export const S1 = new Gear("Phrolova S1", (ctx) => {
  const a = ctx.action!;
  if (a === FBA || a === FSkill) ctx.add(80, Stat.MulMv);
});

/** S2 A Rope Tied to a Life Beyond: +75% MV multiplier on Scarlet Coda specifically, and each
 *  Aftersound stack pays an extra 75% MV on it (on top of the base 82.55%/stack) — both read
 *  directly off `stacksOf(S2)` inside Scarlet Coda's own apply() below, so its damage formula
 *  stays in one place. Casting Scarlet Coda also grants 14 Aftersound outright. */
export const S2 = new Gear("Phrolova S2", (ctx) => {
  if (ctx.action === ScarletCoda) {
    ctx.grantSelf(AFTERSOUND, 14);
    ctx.add(75, Stat.MulMv);
  }
});

/** S3 A Dagger to Cut Clean Obsessions: +80% Echo Skill DMG Amplification, permanent. Casting
 *  Scarlet Coda also converts all held notes to Cadenza and debuffs the target's own ATK — both
 *  enemy-facing/non-combat-formula effects with no equivalent here (note *type* barely matters
 *  anyway, since Cadenza and Strings already share one MV, and enemy ATK never feeds our own
 *  damage), so this is DMG Amp only. */
export const S3 = new Gear("Phrolova S3", (ctx) => { ctx.add(80, DamageType.Echo, Stat.Amp); });

/** S4 A Torch Illuminating the Path: a team Echo Skill cast grants the whole team +20%
 *  (unscoped) DMG Bonus for 30s — permanent uptime, per the standing duration rule. S4 itself
 *  only grants the global watcher once (idempotent); from there it reacts no matter whose turn
 *  the Echo cast lands on. */
export const S4 = new Gear("Phrolova S4", (ctx) => {
    if (isEcho(ctx.action!)) ctx.grantGlobal(S4_TEAM);
});
export const S4_TEAM = new GlobalBuff(PRIORITY.BUFF_STATS,
  (ctx) => { ctx.add(20, Stat.DmgBonus); return "Phrolova S4"; });

/** S5 A Forked Road in Fate's Heartland: an enemy-targeting Stagnate field on entering Maestro,
 *  and -30% DMG taken during Maestro — both out of scope (crowd control, incoming-damage
 *  reduction is a DPS calculator's non-concern), so this is a no-op placeholder. */
export const S5 = new Gear("Phrolova S5");

/**
 * S6 A Night to Depart From Eternal Rest: +24% MV multiplier on the three named Hecate Enhanced
 * Attacks specifically. During Forte Basic/Forte Skill, Hecate also fires Apparition of Beyond (216.42%
 * ATK, considered Echo Skill DMG, +8 Aftersound on hit). While Phrolova herself isn't the
 * active resonator during Maestro, Hecate and Phrolova's own hits deal +40% more DMG; while she
 * IS active during Maestro, she instead gets +60% Havoc DMG Bonus.
 *
 * "Not the active resonator" reads `a.active` — Hecate's own hits (the three Enhanced Attacks,
 * the off-field Auto cycle, this same Apparition) are marked `active: false` since she's
 * genuinely off-field acting autonomously, matching the "active resonators" wording rule; S6 is
 * local (only ticks on Phrolova's own slot, which every one of her own hits — active or not —
 * is queued/evaluated on), so both branches land on exactly "Hecate and Phrolova", never a
 * teammate's own hit.
 */
export const S6 = new Gear("Phrolova S6", (ctx) => {
  const a = ctx.action!;
  if (a === FBA || a === FSkill) ctx.queue(APPARITION_OF_BEYOND);
  if (a === EBA_STRINGS || a === EBA_WINDS || a === EBA_CADENZA) ctx.add(24, Stat.MulMv);

  if (ctx.stacksOf(MAESTRO_ATK)) {
    if (!a.active) ctx.add(40, Stat.DmgDealt);
    else ctx.add(60, Element.Havoc, Stat.DmgBonus);
  }
});

export const APPARITION_OF_BEYOND = new Action("Hecate: Apparition of Beyond", {
  element: Element.Havoc, scaling: Scaling.Atk, type: DamageType.Echo, active: false,
  mv: 216.42,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.grantSelf(AFTERSOUND, 8); },
});

/** Secondary loadout: all six sequences, R5 Lethean Elegy. Everything else (mainstats/substats,
 *  mainslot echo) stays the same as the default `LOADOUT`. */
const PHROLOVA_LOADOUT_S6R5 = new Loadout(
  LETHEAN_ELEGY_R5, NM_HECATE, DREAM_OF_THE_LOST_3PC, MIDNIGHT_VEIL_2PC,
  mainstats("CD", "havoc havoc", "atk atk"), chem("atk", "skill"),
);
export const LOADOUT_S6R5: ResonatorFactory = () =>
  new Phrolova(PHROLOVA_LOADOUT_S6R5, [S1, S2, S3, S4, S5, S6]);

/* ----------------------------------------------------------------- actions */

function phroAction(name: string, def: ActionDef): Action {
  return new Action(name, {
    element: Element.Havoc,
    scaling: Scaling.Atk,
    ...def,
  });
}

// --- basics, mid-air, dodge counter
const BA1 = phroAction("Basic: Movement of Life and Death 1", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Basic, mv: 106.9, energy: 159, concerto: 318, offtune: 5376 });
const BA2 = phroAction("Basic: Movement of Life and Death 2", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Basic, mv: 95.43, energy: 159, concerto: 318, offtune: 4800 });
const BA3 = phroAction("Basic: Movement of Life and Death 3", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Basic, mv: 196.14, energy: 312, concerto: 618, offtune: 9864,
  priority: PRIORITY.UPDATE_BUFFS, apply(ctx) { gainNote(ctx, "strings"); } });
const MA = phroAction("Basic: Movement of Life and Death (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Basic, mv: 127.24, energy: 200, concerto: 400, offtune: 6400 });
const DC = phroAction("Basic: Movement of Life and Death 2 (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: DamageType.Basic, mv: 121.99, energy: 192, concerto: 384, offtune: 1336 });
const HA = phroAction("Heavy: Movement of Life and Death", { node: Node.Normal, cast: Cast.Heavy, type: DamageType.Heavy, mv: 159.7, energy: 252, concerto: 502, offtune: 8032 });

export const BA12 = new Chain("Basic: Movement of Life and Death 12", [BA1, BA2]);
export const BA23 = new Chain("Basic: Movement of Life and Death 23", [BA2, BA3]);
export const BA123 = new Chain("Basic: Movement of Life and Death 123", [BA1, BA2, BA3]);

// --- resonance skill: Whispers in a Fleeting Dream, sends her into Reincarnate
const Skill = phroAction("Skill 1: Whispers in a Fleeting Dream", { node: Node.Skill, cast: Cast.Skill, type: DamageType.Skill, mv: 211.94, energy: 1334, concerto: 1000, offtune: 4264,
  priority: PRIORITY.UPDATE_BUFFS, apply(ctx) { gainNote(ctx, "winds"); } });

// --- Reincarnate follow-ups: Movement of Fate and Finality (basic), Murmurs in a Haunting
//     Dream (skill) — both "considered Resonance Skill DMG"
const FBA = phroAction("Basic: Movement of Fate and Finality", { node: Node.Forte, cast: Cast.Basic, type: DamageType.Skill, mv: 505.01, energy: 321, concerto: 1002, offtune: 10161,
  priority: PRIORITY.UPDATE_BUFFS, apply(ctx) { gainNote(ctx, "strings"); } });
const FSkill = phroAction("Skill 2: Murmurs in a Haunting Dream", { node: Node.Forte, cast: Cast.Skill, type: DamageType.Skill, mv: 464.07, energy: 295, concerto: 1000, offtune: 9338,
  priority: PRIORITY.UPDATE_BUFFS, apply(ctx) { gainNote(ctx, "winds"); } });

/** Scarlet Coda: base 660.16% plus 82.55% (S2: +75%, so 157.55%) of her ATK's own motion value
 *  per Aftersound stack she's actually holding — real-time scaling, not an assumed count. Also
 *  counts as casting Echo Skill. S2's own flat +75% MV multiplier is read here too, alongside
 *  its formula change, so Scarlet Coda's whole damage shape stays in one place. */
const ScarletCoda = phroAction("Heavy: Scarlet Coda", {
  node: Node.Normal, cast: Cast.Heavy, cast2: Cast.Echo, type: DamageType.Skill, mv: 660.16, energy: 693, concerto: 4000, offtune: 166144,
  priority: PRIORITY.LATE_CONVERSION,
  apply(ctx) {
    const perStack = 82.55;
    ctx.add(perStack * Math.min(24, ctx.stacksOf(AFTERSOUND)), Stat.AddMv);
  },
});

// --- liberation: opens Maestro
const Liberation = phroAction("Liberation: Waltz of Forsaken Depths", {
  node: Node.Liberation, cast: Cast.Liberation, type: DamageType.Liberation, mv: 0, concerto: 2000,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) {
    ctx.grantSelf(MAESTRO_ATK);
    ctx.grantGlobal(HECATE_ECHO_WATCH, 48);
    ctx.grantGlobal(HECATE_CHARGES, 10);
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
const Intro = phroAction("Intro: Suite of Quietus", {
  node: Node.Intro, cast: Cast.Intro, type: DamageType.Intro, mv: 201.52, energy: 1000, concerto: 1000, offtune: 10137,
});
/** Suite of Immortality — the Maestro-replaced Intro press. Maestro already ended on the outro
 *  that triggered this (see the PHROLOVA Gear's onIntro); this hit never sees its +120% ATK. */
const EIntro = phroAction("Intro 2: Suite of Immortality", {
  node: Node.Intro, cast: Cast.Intro, type: DamageType.Skill, mv: 596.43, energy: 1000, concerto: 1000, offtune: 9600,
});
const Outro = phroAction("Outro: Unfinished Piece", {
  cast: Cast.Outro, type: DamageType.Outro, mv: 0, concerto: -10000, active: false,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) {
    ctx.outro(PHROLOVA_OUTRO);
    // in Maestro (post-Liberation), her own outro also triggers 2 Enhanced Hecate Attacks
    if (ctx.stacksOf(MAESTRO_ATK)) {
        ctx.queue(HECATE_AUTO_CYCLE); triggerHecateAttack(ctx, ctx.slot); triggerHecateAttack(ctx, ctx.slot);
    }
  },
});
export const PHROLOVA_OUTRO = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  if (isOutro(ctx.action!)) ctx.revoke(PHROLOVA_OUTRO);
  ctx.add(20, Element.Havoc, Stat.Amp);
  ctx.add(25, DamageType.Heavy, Stat.Amp);
  return "Phrolova: Outro";
});

/** Curtain Call — exported for completeness, not used in the default rotation (see the file
 *  header: nothing here auto-triggers it). Ends Maestro same as EIntro, on whichever of its 5
 *  real trigger conditions actually casts it. */
export const CurtainCall = phroAction("Liberation: Curtain Call", {
  node: Node.Liberation, type: DamageType.Liberation, mv: 465.22, offtune: 9360,
  // AUTO_ACTION: same reason as EIntro — still benefits from Maestro's ATK on the hit that ends it.
  priority: PRIORITY.AUTO_ACTION,
  apply(ctx) { endMaestro(ctx); },
});

/* -------------------------------------------------------------------- Hecate */

// active: false by default — Hecate is genuinely off-field acting on her own while someone
// else holds it, matching the "active resonators" wording rule (see the file header). No
// auto-prefix — wuwalab files all of Hecate's own hits under "Basic:", not "Hecate:", so each
// call site spells out its own full in-game name.
function hecateAction(name: string, def: ActionDef): Action {
  return new Action(name, {
    element: Element.Havoc,
    scaling: Scaling.Atk,
    type: DamageType.Echo,
    active: false,
    ...def,
  });
}

const HBA1 = hecateAction("Basic: Hecate 1", { mv: 27.84 });
const HBA2 = hecateAction("Basic: Hecate 2", { mv: 27.84 });
export const HBA12 = new Chain("Basic: Hecate 12", [HBA1, HBA2]);

/** Each Enhanced Attack gains Phrolova 1 Aftersound on landing. */
export const EBA_STRINGS = hecateAction("Basic: Hecate - Strings", {
  mv: 347.93, priority: PRIORITY.UPDATE_BUFFS, apply(ctx) { ctx.grantSelf(AFTERSOUND); },
});
export const EBA_WINDS = hecateAction("Basic: Hecate - Winds", {
  mv: 330.53, priority: PRIORITY.UPDATE_BUFFS, apply(ctx) { ctx.grantSelf(AFTERSOUND); },
});
export const EBA_CADENZA = hecateAction("Basic: Hecate - Cadenza", {
  mv: 347.93, priority: PRIORITY.UPDATE_BUFFS, apply(ctx) { ctx.grantSelf(AFTERSOUND); },
});

/** She isn't the team's lead — her first appearance is a mid-combo swap-in, not a real Intro
 *  press, so the opener is just enough Basic Attacks to get going. */
export const OPENER = [BA23, ECHO_CAST, FBA, Skill, FBA, BA123, FBA, 
    ScarletCoda, Liberation, HBA1, EBA_CADENZA, Outro];
export const OPENER_S6R5 = [BA123, ECHO_CAST, FBA, Skill, FBA, 
    ScarletCoda, Liberation, Outro];

/** The sheet's `frolo manual` loop: the preceding member's outro triggers Enhanced Intro
 *  (ending whatever Maestro her last Liberation left running — see `onIntro`), then enough
 *  Basic/Skill hits to bank all 6 Volatile Notes (2 Strings, 2 Winds from BA3/FBA/Skill/FSkill,
 *  a 3rd Strings from Basic 123's own stage 3, and a 6th from Accidental upgrading the note
 *  after her Echo cast to Cadenza) before Scarlet Coda, then Liberation reopens Maestro, and
 *  Outro closes the loop — triggering 2 bonus Enhanced Hecate Attacks since Maestro is freshly
 *  open. */
export const LOOP = [ BA3, FBA, Skill, FBA, ECHO_CAST, BA123, FSkill,
  ScarletCoda, Liberation, HBA1, EBA_CADENZA, Outro,
];
export const LOOP_S6R5 = [
  BA3, FBA, Skill, FBA, ECHO_CAST, BA12, FBA, BA12, FBA,
  ScarletCoda, Liberation, Outro,
];