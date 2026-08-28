/**
 * Lupa, ported to the new engine — sequence-0 core loop, a limited 5-star
 * (`Tier.Limited`). A fusion broadblade sub-DPS/support. Wolflame (forte1) gates her enhanced
 * Heavy Attacks, each spending 50 Wolflame for a point of Wolfaith (forte2, no live 10s decay
 * tracked). At 2 Wolfaith, Resonance Skill is replaced by Dance With the Wolf. Her own Liberation
 * tops Wolflame to 100, spends every point of Wolfaith, and opens Pack Hunt (team ATK, escalating
 * on any Intro) and Glory (Fusion RES ignore, scaled off the team's own Fusion count).
 *
 * Numbers from nanoka.cc (character 1207) for MV; energy/concerto come off the migrated
 * (old-engine) sheet. Offtune has no migrated sheet row for her at all, so the old reference
 * file's own nanoka-sourced numbers are trusted as-is. forte1 (Wolflame)/forte2 (Wolfaith) deltas
 * are hand-derived from the kit text.
 *
 * Wolfaith's own 10s decay and Radiance Cleaver's tune-strained bonus (untracked enemy state) are
 * left unmodelled, same as the old reference. Ordinary-hit Wolflame regen is modelled on every
 * Normal Attack; Burning Matchpoint's own +500% Wolflame multiplier on top is BURNING_MATCHPOINT
 * below.
 *
 * Her real two Inherent Skills, confirmed off the page's own "INHERENT SKILLS" section:
 *  - Remember My Name: Sprint state/interrupt resistance — no combat-formula effect this engine
 *    models, so it's a do-nothing marker.
 *  - Applause of Victory: cooldown-reset half is a genuine no-op, but its own bundled "Resonance
 *    Liberation - Glory" text is where Glory (team Fusion RES ignore) actually comes from — not a
 *    bare base-kit Liberation effect (see GLORY's own trigger below).
 */
import {
  isType, Buff, Debuff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Action, Stat, Attribute, WeaponType,
  Type1, Cast, Node, Scaling, applyCurrent, applyTeam, applyEnemy, revokeCurrent, revokeTeam, revokeEnemy, casting,
  currentAction, currentTeam, addStat, frozenStacks, stacksOfTeam, queueOn, queueOutro, setForte1, setForte2,
  lostOnSwap,
} from "../../engine/kit.js";
import { Rotation, OPENER, INTRO, ECHO_CANCEL, OUTRO_NEXT } from "../../engine/rotation.js";
import { WILDFIRE_MARK } from "../../weapons/broadblade.js";
import { NEW_STD_BRAUDBLADE, LUSTROUS_RAZOR } from "../../weapons/standard.js";
import { LIONESS_OF_GLORY, CLAWPRINT_5PC, CLAWPRINT_2PC } from "../../echoes/septimont.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { chem } from "../../shared/substats.js";
import { HERON, MOONLIT_CLOUDS_2PC, MOONLIT_CLOUDS_5PC } from "../../echoes/jinzhou.js";

/* ----------------------------------------------------------------------------------- actions */

function lupaAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Fusion, scaling: Scaling.Atk, ...def });
}

// energy/concerto off the migrated sheet; offtune off the old reference's own nanoka numbers (see
// file header). Ordinary Basic/Heavy hits feed Wolflame in this simplified model.
const BA1 = lupaAction("Basic - Flaming Star 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 90.08, energy: 1.34, concerto: 2.67, offtune: 4264, forte1: 7.5 });
const BA2 = lupaAction("Basic - Flaming Star 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 90.08, energy: 1.34, concerto: 2.67, offtune: 4264, forte1: 7.5 });
const BA3 = lupaAction("Basic - Flaming Star 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 157.68, energy: 2.37, concerto: 4.68, offtune: 7464, forte1: 12.5 });
const BA4 = lupaAction("Basic - Flaming Star 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 246.24, energy: 3.66, concerto: 7.30, offtune: 11656, forte1: 17.5 });
/** Basic Attack - Starfall, the enhanced follow-up after a plunging attack or dodge counter. */
const EBA = lupaAction("Basic - Flaming Star: Starfall", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 168.66, energy: 2.51, concerto: 5.02, offtune: 7985, forte1: 5 });

/** Wolf's Descent, her plunging attack — never placed in the rotation below, kept for completeness. */
const MA = lupaAction("Basic - Flaming Star: Plunge", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 104.79, energy: 1.56, concerto: 3.11, offtune: 4960, forte1: 5 });
/** Flaming Star, her dodge counter — same treatment as `MA` above. */
const DC = lupaAction("Basic - Flaming Star (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 273.44, energy: 4.07, concerto: 18.13, offtune: 12944 });

const MA1 = lupaAction("Basic - Flaming Star 1 (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 76.73, energy: 1.14, concerto: 2.27, offtune: 3632, forte1: 7 });
const MA2 = lupaAction("Basic - Flaming Star 2 (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 154.47, energy: 2.31, concerto: 4.61, offtune: 7312, forte1: 13 });
const MA3 = lupaAction("Basic - Flaming Star 3 (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 56.96, energy: 0.86, concerto: 1.70, offtune: 2696 });

// base cast, plus three 50-Wolflame-consuming enhanced forms (each earns a point of Wolfaith
// rather than restoring the gauge)
const HA = lupaAction("Heavy - Flaming Star", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 112.72, energy: 1.68, concerto: 3.34, offtune: 5336 });
/** Firestrike, at Wolflame 50+. Counts as Heavy Attack DMG. */
const EMA3 = lupaAction("Heavy - Flaming Star: Firestrike (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Heavy, mv: 56.96, energy: 0.86, concerto: 1.7, offtune: 2696, forte1: -50, forte2: 1 });
/** Wolf's Gnawing, at Wolflame 50+. */
const EHA3 = lupaAction("Heavy - Flaming Star: Wolf's Gnawing", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 112.22, energy: 1.66, concerto: 10, offtune: 5312, forte1: -50, forte2: 1 });
/** Wolf's Claw, at Wolflame 50+ and Wolfaith 1+. */
const EMA4 = lupaAction("Heavy - Flaming Star: Wolf's Claw", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 240.5, energy: 3.58, concerto: 10, offtune: 11385, forte1: -50, forte2: 1 });

// Shewolf's Hunt and its Feral Fang follow-up, each restoring 15 Wolflame
const Skill1 = lupaAction("Skill - Shewolf's Hunt", {
  node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 140.77, energy: 2.09, concerto: 4.17, offtune: 6664, forte1: 15,
  updateBuffs: () => applyEnemy(LUPA_MARK, 1),
});
/** Feral Fang: +50% DMG Multiplier against the marked target, kept as an explicit MulMv add (see
 *  LUPA_RESONATOR's own updateBuffs() below) rather than baked into mv, so the trace shows where it comes from. */
const Skill2 = lupaAction("Skill - Feral Fang", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 313.61, energy: 13.67, offtune: 5328, forte1: 15 });

/** Foebreaker: consumes every point of Wolflame. Always placed right after Liberation, whose own
 *  updateBuffs() hard-resets Wolflame to exactly 100 first, so forte1: -100 always lands on 0. Opens
 *  Burning Matchpoint (see BURNING_MATCHPOINT below). */
const USkill = lupaAction("Liberation Skill - Foebreaker", {
  node: Node.Liberation, cast: Cast.Skill, type: Type1.Skill, mv: 304.46, concerto: 20, offtune: 6448, forte1: -100,
  updateBuffs: () => applyCurrent(BURNING_MATCHPOINT, 1),
});

// tops Wolflame to 100, spends every point of Wolfaith, opens Pack Hunt/Glory
const Liberation = lupaAction("Liberation - Fire-Kissed Glory", {
  node: Node.Liberation, cast: Cast.Liberation, type: Type1.Liberation, mv: 820.44, concerto: 20, offtune: 48000, forte1: 100, resetEnergy: true,
  updateBuffs: () => {
    applyTeam(PACK_HUNT, 1);
    // "Restores 100 points of Wolflame" is a hard top-off, not additive on top of whatever was
    // already held: normalize to 0 first, so the action's own declared forte1: 100 lands on 100.
    setForte1(0); setForte2(0);
  },
});

// Dance With the Wolf and its Climax form, each spending every point of Wolfaith (a fixed -2
// delta — always exactly 2 in this fixed-rotation-line, the only gate that lets either one fire)
// both Dance With the Wolf forms put Backup Ready on the team
const BACKUP = { updateBuffs: () => applyTeam(LUPA_BACKUP_READY, 1) };
const FSkill = lupaAction("Forte Skill - Dance With the Wolf", { node: Node.Forte, cast: Cast.Skill, type: Type1.Liberation, mv: 560.21, energy: 30, concerto: 15.02, offtune: 16016, forte2: -2, ...BACKUP });
const UFSkill = lupaAction("Forte Skill - Dance With the Wolf: Climax", { node: Node.Forte, cast: Cast.Skill, type: Type1.Liberation, mv: 756.26, energy: 30, concerto: 30, offtune: 54416, forte2: -2, ...BACKUP });
/** Set the Arena Ablaze — queued by LUPA_BACKUP_READY the moment a teammate's Liberation earns
 *  it, not placed in the rotation directly. */
const fskillFUA = lupaAction("Forte Skill - Set the Arena Ablaze", { node: Node.Forte, type: Type1.Skill, mv: 211.75, offtune: 9600, active: false });

const Intro = lupaAction("Intro - Try Focusing, Eh?", { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 198.4, energy: 10.02, concerto: 10, offtune: 9393 });
/** Nowhere to Run! — replaces plain Intro once Pack Hunt is maxed (see LUPA_RESONATOR's own intro()
 *  selector below, which also ends Pack Hunt/Glory right there, before this hit's own damage). */
const EIntro = lupaAction("Intro - Nowhere to Run!", { node: Node.Intro, cast: Cast.Intro, type: Type1.Liberation, mv: 991.97, energy: 10, concerto: 10, offtune: 16000 });
/** Stand by Me, Warrior: no damage of its own, just the outro handoff. */
const Outro = lupaAction("Outro - Stand by Me, Warrior", {
  cast: Cast.Outro, concerto: -100, active: false,
  updateBuffs: () => queueOutro(LUPA_OUTRO),
});

/* ------------------------------------------------------------------------------------ buffs */

/** Pack Hunt: 1 stack (6% team ATK) granted outright by her own Liberation, escalating +1 more on
 *  any team member's own Intro, capped at 3 (18% ATK). "Overlord/Calamity Class" is a target-tier
 *  gate this engine has no notion of, so the +10% Fusion DMG Bonus (and its "3+ Fusion members"
 *  escalation) applies unconditionally. Ended by her own intro() selector below once maxed. */
const PACK_HUNT = new Buff({
  name: "Lupa: Pack Hunt", maxStacks: 3,
  updateBuffs: () => { if (casting(Cast.Intro)) applyTeam(PACK_HUNT, 1); },
  applyStats: () => {
    addStat(Stat.BonusAtk, 6 * frozenStacks());
    addStat(Stat.DmgBonus, 10, Attribute.Fusion);
    const fusionCount = currentTeam().slots.filter((s) => s.resonator?.element === Attribute.Fusion).length;
    if (fusionCount >= 3) addStat(Stat.DmgBonus, 10, Attribute.Fusion);
  },
});

/** Glory: 3% Fusion RES ignore a stack, one per Fusion resonator on the team (herself included, up
 *  to 3), +6% flat once all three are held — read live off the team's own Fusion count at her
 *  Liberation cast. Just the payout — its trigger lives on LP_INHERENT_2 below (see file header). */
const GLORY = new Buff({
  name: "Lupa: Glory", maxStacks: 3,
  applyStats: () => {
    addStat(Stat.ResIgnore, 3 * frozenStacks(), Attribute.Fusion);
    if (frozenStacks() >= 3) addStat(Stat.ResIgnore, 6, Attribute.Fusion);
  },
});

/** Stand by Me, Warrior — the outro handoff. Short window, so it still counts on the recipient's
 *  own outro (see echoes/jinzhou.ts's HERON_HANDOFF). */
const LUPA_OUTRO = new Buff({
  name: "Lupa: Outro",
  applyStats: () => { addStat(Stat.Amp, 20, Attribute.Fusion); addStat(Stat.Amp, 25, Type1.Basic); },
  updateBuffs: () => { lostOnSwap(); },
});

/** Wildfire Banner: +12% ATK for 8s on casting Feral Fang, Wolf's Gnawing/Wolf's Claw/Firestrike,
 *  Fire-Kissed Glory, or Dance With the Wolf/its Climax form — part of her Forte Circuit, not an
 *  Inherent Skill. Just the payout — its trigger lives on LUPA_RESONATOR's own updateBuffs() below. */
const WILDFIRE_BANNER = new Buff({
  name: "Lupa: Wildfire Banner",
  applyStats: () => addStat(Stat.BonusAtk, 12),
  convertStats: () => { if (currentAction() === fskillFUA) revokeCurrent(WILDFIRE_BANNER); },
});

/** Remember My Name (Inherent Skill): a Sprint state/interrupt resistance passive — see file header. */
const LP_INHERENT_1 = new Inherent({ name: "Lupa: Remember My Name" });
/** Applause of Victory (Inherent Skill): Glory's own trigger — see file header. */
const LP_INHERENT_2 = new Inherent({
  name: "Lupa: Applause of Victory",
  updateBuffs: () => {
    if (currentAction() === Liberation) {
      revokeTeam(GLORY);
      applyTeam(GLORY, currentTeam().slots.filter((s) => s.resonator?.element === Attribute.Fusion).length);
    }
  },
});

/** Mark: a genuine debuff on the enemy — Shewolf's Hunt (Skill1) marks the target, Feral Fang
 *  (Skill2) is the "against the marked target" follow-up that consumes it for +50% DMG Multiplier.
 *  Also ends on a Liberation cast with the mark still up and unconsumed. */
const LUPA_MARK = new Debuff({
  name: "Lupa: Mark",
  applyStats: () => { if (currentAction() === Skill2) addStat(Stat.MulMv, 50); },
  convertStats: () => { if (currentAction() === Skill2 || currentAction() === Liberation) revokeEnemy(LUPA_MARK); },
});

/** Burning Matchpoint: opened by Foebreaker, ends the moment either form of Dance With the Wolf
 *  is cast. While held, true Normal Attack hits (not her enhanced Heavy Attacks) restore 500%
 *  MORE Wolflame on hit — a straight +5x of the action's own declared forte1 gain. */
const BURNING_MATCHPOINT = new Buff({
  name: "Lupa: Burning Matchpoint",
  applyStats: () => {
    const a = currentAction();
    if (isType(Type1.Basic)) addStat(Stat.AddForte1, 5 * a.forte1);
  },
  convertStats: () => { if (currentAction() === FSkill || currentAction() === UFSkill) revokeCurrent(BURNING_MATCHPOINT); },
});

/** Set the Arena Ablaze: Dance With the Wolf/its Climax form leave this ready on her — whoever
 *  next casts a Liberation while she holds it (not her own) queues fskillFUA onto her own slot,
 *  same "queued and owned by the kit that earned it" shape as Roccia's own Magic Box. Granted
 *  team-wide so its own applyStats() sees any teammate's Liberation cast, not just her own turn. */
const LUPA_BACKUP_READY = new Buff({
    name: "Lupa: Set the Arena Ablaze",
    applyStats: () => {
        if (casting(Cast.Liberation) && currentTeam().slot.resonator !== LUPA_RESONATOR) {
            queueOn(LUPA_RESONATOR, fskillFUA);
            revokeTeam(LUPA_BACKUP_READY);
        }
    }
});

/** Her, as a Resonator: name/element/weapon, every grant/spend/queue rule her kit needs, and her
 *  own base stat line. Sequence-0 only — a limited 5-star (`Tier.Limited`). */
const LUPA_RESONATOR = new Resonator({
  name: "Lupa",
  element: Attribute.Fusion,
  weapon: WeaponType.Broadblade,
  intro: () => {
    if (stacksOfTeam(PACK_HUNT) < 3) return Intro;
    revokeTeam(PACK_HUNT);
    revokeTeam(GLORY);
    return EIntro;
  },
  outro: () => Outro,
  color: "#e8483a",
  maxEnergy: 125,

  // every cast that arms Set the Arena Ablaze
  updateBuffs: () => {
    const a = currentAction();
    if (a === Skill2 || a === EHA3 || a === EMA4 || a === EMA3 || a === Liberation || a === FSkill || a === UFSkill) {
      applyCurrent(WILDFIRE_BANNER, 1);
    }
  },

  constantStats: () => {
    addStat(Stat.BaseHp, 11912.5); addStat(Stat.BaseAtk, 387.5); addStat(Stat.BaseDef, 1186);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
const LUPA_TALENTS = new Talent({
  name: "Lupa: Talents",
  constantStats: () => { addStat(Stat.CritRate, 8); addStat(Stat.BonusAtk, 12); },
});

const LP_LOOP = new Rotation([
  OPENER, Skill1, Skill2, ECHO_CANCEL, Liberation, USkill, MA1, MA2, EMA3, EMA4, UFSkill, OUTRO_NEXT,
  INTRO, Skill1, ECHO_CANCEL, Liberation, USkill, MA1, MA2, EMA3, EMA4, UFSkill, OUTRO_NEXT,
]);

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills + Forte Circuit, weapon,
// mainslot echo, sonata pieces, mainstat/substat
export const LUPA = new Loadout({
  resonator: LUPA_RESONATOR,
  talent: LUPA_TALENTS,
  inherent1: LP_INHERENT_1,
  inherent2: LP_INHERENT_2,
  weapons: [WILDFIRE_MARK, NEW_STD_BRAUDBLADE, LUSTROUS_RAZOR],
  echoLoadouts: [
    new EchoLoadout(LIONESS_OF_GLORY, CLAWPRINT_5PC, CLAWPRINT_2PC),
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC),
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Fusion3, Mainstat.ATK1),
  substat: chem("atk", "liberation"),
    rotation: LP_LOOP,
});
