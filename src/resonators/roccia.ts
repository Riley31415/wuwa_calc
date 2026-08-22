/**
 * Roccia, ported to the new engine — sequence-0 core loop, a limited 5-star (not
 * `standardCharacter`). A havoc gauntlets support/sub-DPS. Imagination (forte1, max 300) builds
 * off normal attack hits; at 100+ a held Heavy Attack — or Resonance Skill: Acrobatic Trick,
 * unconditionally — launches her into Beyond Imagination, unlocking Basic Attack: Real Fantasy
 * (a 3-stage Heavy Attack DMG combo, spending the 100 Imagination on its own first hit).
 * Liberation: Commedia Improvviso! scales the whole team's ATK off her own Crit Rate past 50%.
 *
 * Super Attractive Magic Box (Inherent Skill): her Outro swaps the incoming resonator's own Echo
 * Skill for a flat, DMG-bonus-immune "Magic Box" hit (100 flat Havoc DMG, Utility damage type)
 * for 14s. Genuinely replacing the recipient's own live Echo Skill input for the whole window
 * needs per-resonator move-replacement state this engine's fixed-line rotations don't have, so
 * it's simplified to one queued cast on the recipient's own next Intro instead — queued by her
 * own kit, through ROCCIA's own updateGlobal() below, not smuggled into the handoff buff itself.
 *
 * Numbers from nanoka.cc (character 1606, https://ww.nanoka.cc/character/1606) for every named
 * hit's MV — she has no wuwalab.com entry yet, so this is nanoka's own "Skill Attributes" table.
 * Energy/concerto/offtune/Imagination deltas aren't cleanly exposed on nanoka's own page, so
 * those come off the migrated (old-engine) sheet, same gap Sanhua/Brant/Buling/Carlotta had.
 * Dodge Counter has no sheet row at all, so it's still bare (nanoka's own MV only).
 */
import {
  Buff, Resonator, Action, ECHO_CAST, INTRO, Stat, Element, WeaponType, Type1, Cast, Node, Scaling,
  applySelf, applyTeam, revoke, casting, currentAction, currentTeam, addStat, stacks, get,
  queueOutro, queueOn,
  lostOnSwap,
} from "../kit.js";
import { TRAGICOMEDY } from "../weapons/gauntlet.js";
import { NM_HERON, MIDNIGHT_VEIL_5PC, MIDNIGHT_VEIL_2PC } from "../echoes/rinascita.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";

/* ------------------------------------------------------------------------------------ buffs */

/** Immersive Performance (Inherent Skill): +20% ATK for 12s on casting Resonance Skill or the
 *  base Heavy Attack specifically — not Real Fantasy, which is a Basic Attack-button press even
 *  though it deals Heavy Attack DMG. Short window, so it still counts on her own outro (see
 *  jinzhou.ts's HERON_HANDOFF for the same shape). */
export const IMMERSIVE_PERFORMANCE = new Buff({
  name: "Roccia: Immersive Performance",
  apply: () => addStat(Stat.BonusAtk, 20),
  convert: () => { if (casting(Cast.Outro)) revoke(IMMERSIVE_PERFORMANCE); },
});

/** Commedia Improvviso!'s own team ATK grant: 1 flat ATK point per 0.1% Crit Rate she holds over
 *  50%, capped at 200 — read live off her own Crit Rate at the Liberation cast, replacing
 *  whatever it was set to on the last cast rather than stacking on top (`setStacksTeam`). 30s,
 *  so per the standing duration rule this is permanent uptime once granted, never revoked. */
export const COMMEDIA_TEAM_ATK = new Buff({
  name: "Roccia: Commedia Improvviso!",
  apply: () => addStat(Stat.FlatAtk, 200),
});

/** Applause, Please! — the window her outro hands the incoming resonator. Short window, so it
 *  still counts on the recipient's own outro (see jinzhou.ts's HERON_HANDOFF). Just the stat
 *  grant — the Magic Box follow-up it also earns the recipient is Roccia's own doing, queued from
 *  her own kit (see ROCCIA's own updateGlobal() below), not this buff's. */
export const APPLAUSE_HANDOFF = new Buff({
  name: "Roccia: Applause, Please!",
  apply: () => { addStat(Stat.DmgBonus, 20, Element.Havoc); addStat(Stat.DmgBonus, 25, Type1.Basic); },
  update: () => { lostOnSwap(); },
});

/* ----------------------------------------------------------------------------------- actions */

function rocciaAction(id: string, def: object): Action {
  return new Action(id, { element: Element.Havoc, scaling: Scaling.Atk, ...def });
}

// energy/concerto/offtune/Imagination all come off the migrated (old-engine) sheet — nanoka's own
// page never gave them (see file header). Dodge Counter has no sheet row either, so it's bare
// (nanoka's own MV only).
// --- basics, mid-air, dodge counter (Pero, Easy)
export const BA1 = rocciaAction("Basic - Pero, Easy 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 73.18, energy: 1.09, concerto: 3.47, offtune: 3464, forte1: 19 });
export const BA2 = rocciaAction("Basic - Pero, Easy 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 114.42, energy: 1.71, concerto: 5.43, offtune: 5418, forte1: 33 });
export const BA3 = rocciaAction("Basic - Pero, Easy 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 169.00, energy: 2.50, concerto: 8, offtune: 8000, forte1: 49 });
export const BA4 = rocciaAction("Basic - Pero, Easy 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 208.38, energy: 3.10, concerto: 9.88, offtune: 9920, forte1: 100 });
export const MA = rocciaAction("Basic - Pero, Easy (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 104.78, energy: 1.55, concerto: 4.96, offtune: 4960, forte1: 38 });
export const DC = rocciaAction("Basic - Pero, Easy (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 206.70 });

// --- heavy attack: hitting with at least 100 Imagination also launches Beyond Imagination — same
//     trigger Acrobatic Trick has unconditionally, so this only matters as a second way in
export const HA = rocciaAction("Heavy - Pero, Easy", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 168.99, energy: 2.50, concerto: 8, offtune: 8000, forte1: 100 });

// --- resonance skill: Acrobatic Trick — pulls in targets and always launches Beyond Imagination
export const Skill = rocciaAction("Skill - Acrobatic Trick", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 491.76, energy: 14, concerto: 20, offtune: 10992, forte1: 100 });

// --- forte circuit: Real Fantasy, a 3-stage Heavy Attack DMG combo while in Beyond Imagination.
//     100 Imagination is spent once, on the first hit — the kit text's own "consume 100 to cast"
//     gate, not a per-stage cost.
export const FBA1 = rocciaAction("Forte Basic - Real Fantasy 1", { node: Node.Forte, cast: Cast.Basic, type: Type1.Heavy, mv: 322.08, energy: 8, concerto: 10, offtune: 7200, forte1: -100 });
export const FBA2 = rocciaAction("Forte Basic - Real Fantasy 2", { node: Node.Forte, cast: Cast.Basic, type: Type1.Heavy, mv: 339.97, energy: 8, concerto: 16, offtune: 7600, forte1: -100 });
export const FBA3 = rocciaAction("Forte Basic - Real Fantasy 3", { node: Node.Forte, cast: Cast.Basic, type: Type1.Heavy, mv: 357.86, energy: 8, concerto: 25, offtune: 8000, forte1: -100 });

// --- liberation: Commedia Improvviso! — team ATK scaled off her own Crit Rate past 50%. Resonance
//     Cost 125 (maxEnergy below), not the migrated sheet's own 0 — the sheet disagrees with
//     nanoka's own explicit declared cost here, and nanoka is trusted (every other kit's cost is
//     its own declared field, not a sheet-read number).
export const Liberation = rocciaAction("Liberation - Commedia Improvviso!", { node: Node.Liberation, cast: Cast.Liberation, type: Type1.Heavy, mv: 835.02, concerto: 20, offtune: 96000 });

// --- intro / outro
export const Intro = rocciaAction("Intro - Pero, Help", { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 168.99, energy: 10, concerto: 10, offtune: 10824, forte1: 100 });
/** Applause, Please!: no damage of its own, just the outro handoff. */
export const Outro = rocciaAction("Outro - Applause, Please!", { cast: Cast.Outro, active: false });

/** Super Attractive Magic Box: 100 flat Havoc DMG, Utility damage type, DMG-bonus-immune —
 *  Scaling.Fixed reads no stat or buff at all, so this always deals exactly 100 regardless of
 *  who holds APPLAUSE_HANDOFF or what they're wearing. Queued once, by ROCCIA's own kit, on the
 *  recipient's own next Intro (see ROCCIA's own updateGlobal() below) — not placed directly in
 *  any rotation. */
export const MAGIC_BOX = rocciaAction("Utility - Super Attractive Magic Box", {
  cast: Cast.Echo, type: Type1.Utility, scaling: Scaling.Fixed, mv: 100,
});

/** Her, as a Resonator: name/element/weapon, every grant/spend/queue rule her kit needs, and her
 *  own base stat line. Sequence-0 only — a limited 5-star, not `standardCharacter`. */
export const ROCCIA = new Resonator({
  name: "Roccia",
  element: Element.Havoc,
  weapon: WeaponType.Gauntlets,
  intro: () => Intro,
  color: "#9634b2",
  maxEnergy: 12500,

  update: () => {
    const a = currentAction();
    if (a.cast === Cast.Skill || a.cast === Cast.Heavy) applySelf(IMMERSIVE_PERFORMANCE, 1);
    if (a === Liberation) applyTeam(COMMEDIA_TEAM_ATK);
    if (a === Outro) queueOutro(APPLAUSE_HANDOFF);
  },

  // Magic Box is hers to queue, not APPLAUSE_HANDOFF's own — runs through updateGlobal() so it
  // still fires on the recipient's own Intro even though that's not her own turn. `currentSlot`
  // is forced to her own holder for this call, so the real actor comes off currentTeam().slot
  // instead, and queueOn() (not queue()) is what lets the follow-up land on them, not on her.
  updateGlobal: () => {
    const acting = currentTeam().slot;
    if (casting(Cast.Intro) && acting.isHeld(APPLAUSE_HANDOFF)) queueOn(acting.resonator!, MAGIC_BOX);
  },

  apply: () => {
    addStat(Stat.BaseHp, 12250); addStat(Stat.BaseAtk, 375); addStat(Stat.BaseDef, 1198);
    addStat(Stat.Er, 100); addStat(Stat.CritRate, 5); addStat(Stat.CritDmg, 150);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
export const ROCCIA_TALENTS = new Buff({
  name: "Roccia: Talents",
  apply: () => { addStat(Stat.BonusAtk, 12); addStat(Stat.CritDmg, 16); },
});

/** A kit-valid line: Skill launches Beyond Imagination (unconditionally), Real Fantasy spends the
 *  100 Imagination Intro topped off, the basics chain and base Heavy Attack round it out,
 *  Liberation closes on her own high Crit Rate. She's never the team's own lead, so unlike a
 *  first-position member's own opener, this same rotation covers both. */
export const RC_ROTATION = [
  INTRO, HA, Skill, FBA1, FBA2, FBA3,
  ECHO_CAST, Liberation, Outro,
];

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents, weapon, mainslot echo, sonata pieces, mainstat/substat
export const RC_LOADOUT = [
  ROCCIA, ROCCIA_TALENTS,
  TRAGICOMEDY,
  NM_HERON, MIDNIGHT_VEIL_5PC, MIDNIGHT_VEIL_2PC,
  mainstats("CR", "havoc havoc", "atk atk"), chem("atk", "heavy"),
];
