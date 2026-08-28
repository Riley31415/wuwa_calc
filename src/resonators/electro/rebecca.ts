/**
 * Rebecca — an Electro Pistols sub-DPS, and the first half of the Cyberpunk collab pair. Filed
 * under Lahairoi with Lucy and their shared echo, the era they released alongside, rather than
 * a region of their own.
 *
 * She is the first kit in the project built on the *Hack* branch of the Tune Break variants (see
 * tunebreak.ts), and she works both ends of it: her Intros, either Fervor finisher and BOOM!
 * Fireworks! all lay Hack - Shifting, and she answers Hack - Interfered with Meltdown, a
 * 2358.89% tune-scaled hit. Tune damage reads Tune Break Boost and nothing else, which is why her
 * own Tag, You're It! hands +30 of it to whoever laid the Shifting.
 *
 * Three gauges, all real numbers off the actions:
 * - **Fervor** (forte1, 0-120): banked by every Normal Attack and Resonance Skill, and by 50 the
 *   moment A Girl Gets What She Wants! triggers off an Intro. At 120 the plain Heavy Attack is
 *   replaced by its finisher — Rat-tat-tat!: Huntress or Bang-bang-bang!: Guts by mode — which
 *   spends the whole bar.
 * - **Hot Hand** (forte2, 0-120): regenerates 10/s, which this engine has no clock for; she is off
 *   field for well over the 12s it takes to fill, so it is simply full at every Intro (set at
 *   combat start and again on her own Outro) and the finisher's own +40 is declared on the action.
 *
 * Overload is not tracked: it only ever gates BOOM! Fireworks!, which the mode fires by itself
 * either way, so the three firepower tiers simply queue it.
 *
 * **Switch Gears!** is the mode pair: Huntress (+30% Crit. DMG) and Guts (15% DEF ignore), swapped
 * by every Resonance Skill and Intro Skill — each of which exists in a Huntress form and a Guts
 * form, so which she casts *is* which mode she is in. She starts in Huntress. A Girl Gets What She
 * Wants! grants whichever of the two she is not currently in, for 12s.
 *
 * MVs off nanoka.cc (character 1308), per-hit x hit count as CLAUDE.md describes, with the flat
 * Concerto Regen rows folded in (Liberation 20, both Intros 10). Energy/concerto/off-tune and the
 * per-action Fervor are wuwalab's frame data (api.wuwalab.com/api/app/characters/rebecca) summed
 * the same way, cross-checked against the migrated sheet. The Mk. 31 HMG has no published fire
 * rate; the sheet's own 5 standard / 5 first-enhancement / 10 second-enhancement split is what
 * reaches 90 Overload exactly, so that is how the mode is lumped here. Her dodge counters are left
 * out: nanoka gives their motion values but no source gives their Fervor, and neither rotation
 * plays one.
 */
import {
  Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Action, Stat, Attribute, WeaponType, Type1, Cast, Node,
  Scaling, addBuff, addStat, applyCurrent, applyTeam, casting, currentAction, currentTeam, isHeld, queue, queueOutro,
  revokeCurrent, forte1, forte2, setForte1, setForte2, frozenStacks, lostOnSwap, triggeredAction,
  ActionGroup,
} from "../../engine/kit.js";
import { Rotation, INTRO, ECHO_CANCEL, OUTRO_NEXT } from "../../engine/rotation.js";
import { applied } from "../../engine/kit.js";
import { applyHack, tuneHackResponse, TUNE_HACK_SHIFTING } from "../../shared/tunebreak.js";
import { SKULL_THRASHER } from "../../weapons/pistol.js";
import { NEW_STD_PISTOL, STATIC_MIST } from "../../weapons/standard.js";
import { HERON, STONEWALL_BRACER, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC, LINGERING_TUNES_2PC, VOID_THUNDER_2PC } from "../../echoes/jinzhou.js";
import { ADAM_SMASHER_REBECCA, HYVATIA, NEONLIGHT_LEAP_5PC, NEONLIGHT_LEAP_2PC } from "../../echoes/lahairoi.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { chem } from "../../shared/substats.js";
import { LUCY_RESONATOR } from "../spectro/lucy.js";

/* ----------------------------------------------------------------------------------- actions */

function rebeccaAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Electro, scaling: Scaling.Atk, ...def });
}

// --- Mix-'n'-Match, the Huntress half. Heavy Attack - Huntress is the held burst, which counts as
//     Basic Attack DMG; releasing it turns into Eat Lead!, which does not.
const HBA1 = rebeccaAction("Basic - Huntress 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 73.52, energy: 1.1, concerto: 2.18, offtune: 3480, forte1: 7.06 });
const HBA2 = rebeccaAction("Basic - Huntress 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 95.65, energy: 1.45, concerto: 2.85, offtune: 4530, forte1: 9.2 });
const HBA3 = rebeccaAction("Basic - Huntress 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 109.85, energy: 1.63, concerto: 3.25, offtune: 5200, forte1: 10.54 });
const HHA = rebeccaAction("Heavy - Huntress", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Basic, mv: 33.8, energy: 0.5, concerto: 1, offtune: 1600, forte1: 3.58 });
const EatLead = rebeccaAction("Heavy - Eat Lead!: Huntress", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 121.68, energy: 1.8, concerto: 3.6, offtune: 5760, forte1: 11.68 });
const HMA = rebeccaAction("Basic - Huntress (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 136.04, energy: 2.02, concerto: 4.03, offtune: 6440, forte1: 13.05 });
const HTD = rebeccaAction("Basic - Tactical Dodge: Huntress", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 84.5, energy: 1.25, concerto: 2.5, offtune: 4000, forte1: 8.95 });

// --- the Guts half: fewer, heavier shots, and its Heavy Attack is a real Heavy.
const GBA1 = rebeccaAction("Basic - Guts 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 123.38, energy: 1.84, concerto: 3.66, offtune: 5840, forte1: 13.62 });
const GBA2 = rebeccaAction("Basic - Guts 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 84.5, energy: 1.25, concerto: 2.5, offtune: 4000, forte1: 9.32 });
const GBA3 = rebeccaAction("Basic - Guts 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 225.11, energy: 3.34, concerto: 6.67, offtune: 10658, forte1: 24.84 });
const GHA = rebeccaAction("Heavy - Guts", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 202.79, energy: 3, concerto: 6, offtune: 9600, forte1: 19.45 });
const GMA = rebeccaAction("Basic - Guts (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 104.78, energy: 1.55, concerto: 3.1, offtune: 4960, forte1: 10.05 });
const GTD = rebeccaAction("Basic - Tactical Dodge: Guts", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 101.4, energy: 1.5, concerto: 3, offtune: 4800, forte1: 9.73 });

// --- Tactical Tweaks: one Resonance Skill per mode, each ending in the other one.
// the mode swap lands in convertStats(), after the cast that made it has already paid out under
// the old mode
const TO_GUTS = { convertStats: () => { revokeCurrent(HUNTRESS); applyCurrent(GUTS, 1); } };
const TO_HUNTRESS = { convertStats: () => { revokeCurrent(GUTS); applyCurrent(HUNTRESS, 1); } };
const Skill = rebeccaAction("Skill - It's Big Boomin' Time!", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 236.6, energy: 3.52, concerto: 7, offtune: 11200, forte1: 22.72, ...TO_GUTS });
const ESkill = rebeccaAction("Skill - Come 'n' Get Me!", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 236.6, energy: 3.51, concerto: 7, offtune: 11200, forte1: 22.72, ...TO_HUNTRESS });

// --- Gloves Are Comin' Off!: the Fervor finishers. Both count as Basic Attack DMG, both spend the
//     whole 120 and restore 40 Hot Hand, and both lay Hack - Shifting.
// Fervor's own ceiling, applied on the two casts that spend it rather than on every action — so
// that cast's own delta lands exactly on empty, and everything before it still reports what the
// gauge really banked. Both hack, too.
const SPEND_FERVOR = {
  updateDebuffs: () => applyHack(),
  updateBuffs: () => { if (forte1() > 120) setForte1(120); },
};
const RatTatTat = rebeccaAction("Forte - Rat-tat-tat!: Huntress", { node: Node.Forte, cast: Cast.Heavy, type: Type1.Basic, mv: 397.66, energy: 15, concerto: 20, offtune: 44320, forte1: -120, forte2: 40, ...SPEND_FERVOR });
const BangBang = rebeccaAction("Forte - Bang-bang-bang!: Guts", { node: Node.Forte, cast: Cast.Heavy, type: Type1.Basic, mv: 278.34, energy: 15, concerto: 20, offtune: 44320, forte1: -120, forte2: 40, ...SPEND_FERVOR });

// --- Party 'til Dawn!: the Liberation opens Mk. 31 HMG mode, which fires itself for 9.5s and
//     banks Overload as it goes. The three tiers are lumped one action apiece (see the file
//     comment); the button press itself deals no damage, so its cost and its 20 Concerto Regen
//     ride the first burst. Every hit of the mode is Basic Attack DMG.
// Party 'til Dawn! is only the button press; the mode then fires itself through its three
// firepower tiers, and BOOM! Fireworks! goes off the moment Overload caps
const Lib1 = rebeccaAction("Liberation - Party 'til Dawn!", {
  node: Node.Liberation, cast: Cast.Liberation, resetEnergy: true, forte3: 90,
  updateBuffs: () => { queue(Lib2); queue(Lib3); queue(Lib4); queue(Boom); },
});
const Lib2 = rebeccaAction("Liberation - Mk. 31 HMG x5", {
  node: Node.Liberation, type: Type1.Basic, mv: 24.3 * 5, concerto: 20 + 0.56 * 5, offtune: 1609 * 5, forte3: -10,
});
const Lib3 = rebeccaAction("Liberation - Mk. 31 HMG 1st Enhancement x5", {
  node: Node.Liberation, type: Type1.Basic, mv: 48.6 * 5, concerto: 1.12 * 5, offtune: 3218 * 5, forte3: -20,
});
const Lib4 = rebeccaAction("Liberation - Mk. 31 HMG 2nd Enhancement x10", {
  node: Node.Liberation, type: Type1.Basic, mv: 72.9 * 10, concerto: 1.67 * 10, offtune: 4826 * 10, forte3: -60,
});
const Boom = rebeccaAction("Liberation - BOOM! Fireworks!", {
  node: Node.Liberation, type: Type1.Basic, mv: 636.2, energy: 20, concerto: 10, offtune: 31025, active: false,
  updateDebuffs: () => applyHack(),
});

// --- My Turn!: one Intro per mode, each ending in the other one, each worth 50 Fervor through A
//     Girl Gets What She Wants! (see A_GIRL) rather than on the action itself.
const Intro = rebeccaAction("Intro - Yo, It's Big Boomin' Time!", { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 270.4, energy: 10, concerto: 10, offtune: 12800, updateDebuffs: () => applyHack(), ...TO_GUTS });
const EIntro = rebeccaAction("Intro - Hey, Leadhead, Come 'n' Get Me!", { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 202.8, energy: 10, concerto: 10, offtune: 9600, updateDebuffs: () => applyHack(), ...TO_HUNTRESS });

/** Preem Choom (Outro): the turret's own 14s of 2.5% ticks are folded into the outro row — 70
 *  ticks plain, or 20 at +250% once Lucy enhances it, which is the same 175% either way. */
// her Outro hands the Bonds over; the 12s+ she then spends off field refills Fervor, which is what
// arms A Girl Gets What She Wants! on her next Intro
const Outro = rebeccaAction("Outro - Preem Choom", {
  cast: Cast.Outro, type: Type1.Outro, mv: 2.5 * 70, concerto: -100, active: false,
  updateBuffs: () => {
    queueOutro(EDGERUNNER_BONDS);
    addStat(Stat.AddForte2, 120); // from 12 seconds offfield
  },
});

/** Her answer to a Hack break — tune-scaled, so it reads Tune Break Boost and nothing else.
 *  Queued by the break rather than played, and capped in-game at one per target every 8s, which
 *  this engine has no clock to enforce. An ordinary active cast, like every Tune Break response:
 *  it is her own hit, and marking it inactive would have every "lost on switching out" buff she
 *  holds revoke itself the moment a break went off. */
const Meltdown = rebeccaAction("Tune Hack Response - Meltdown", {
  node: Node.Forte, type: Type1.Hack, scaling: Scaling.Tune, mv: 2358.89,
});

/* ------------------------------------------------------------------------------------- buffs */

/** Switch Gears!: the two modes. Which one she holds decides which Intro and which Resonance
 *  Skill she casts, and every one of those casts swaps her into the other — done in convertStats()
 *  so the cast itself still pays out under the mode she started it in. */
const HUNTRESS = new Buff({ name: "Rebecca: Huntress", applyStats: () => addStat(Stat.CritDmg, 30) });
const GUTS = new Buff({ name: "Rebecca: Guts", applyStats: () => addStat(Stat.DefIgnoreNew, 15) });

/** A Girl Gets What She Wants!: at 120 Hot Hand, a Resonance Skill or Intro Skill grants both
 *  modes' stat bonuses at once for 12s — so it pays whichever of the two she is not already in.
 *  Hot Hand cannot be restored while it is up, so a finisher's own +40 is cancelled back out. The
 *  Intro that triggers it also restores 50 Fervor. 12s, so lost after her outro. */
const A_GIRL = new Buff({
  name: "Rebecca: A Girl Gets What She Wants!",
  applyStats: () => {
    if (forte2() >= 120 && (casting(Cast.Skill) || casting(Cast.Intro))) {
      addStat(Stat.AddForte2, -120); // consume 10 per sec for 12s
    }
    if (!isHeld(HUNTRESS)) addStat(Stat.CritDmg, 30);
    if (!isHeld(GUTS)) addStat(Stat.DefIgnoreNew, 15);
    if (casting(Cast.Intro)) addStat(Stat.AddForte1, 50);
    const a = currentAction();
    if (a.forte2 > 0) addStat(Stat.AddForte2, -a.forte2);
  },
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(A_GIRL); },
});

/** Tag, You're It! (Inherent Skill), the ATK half: +10% for 12s on triggering A Girl Gets What She
 *  Wants! or casting either Fervor finisher, 2 stacks. */
const TAG_YOURE_IT = new Buff({
  name: "Rebecca: Tag, You're It! (self)", maxStacks: 2,
  applyStats: () => addStat(Stat.BonusAtk, 10 * frozenStacks()),
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(TAG_YOURE_IT); },
});

/** The other half: whichever resonator inflicts Hack - Shifting gets +30 Tune Break Boost for 30s
 *  — permanent uptime, and theirs alone rather than the team's (see RB_INHERENT_1 for the watch). */
const TAG_TBB = new Buff({
  name: "Rebecca: Tag, You're It! (team)",
  applyStats: () => addStat(Stat.Tbb, 30),
});

/** Left an Opening! (Inherent Skill): her Liberation gives every nearby resonator +20% ATK for
 *  30s — permanent uptime, and "nearby" rather than "active", so it pays on inactive actions too.
 *  The interruption-resistance half carries no stat. */
const LEFT_AN_OPENING = new Buff({
  name: "Rebecca: Left an Opening! (team)",
  applyStats: () => addStat(Stat.BonusAtk, 20),
});

/** Preem Choom (Outro): the incoming resonator gets Edgerunner Bonds, +15% All DMG Amplification
 *  for 14s, and with it Overlimit — a stack every 0.2s, each +0.5% Heavy Attack DMG Amplification
 *  up to +35%. Lucy is handed the cap the instant the Bonds land; anyone else ramps to it across
 *  the full 14s and so takes the mean of that ramp. Both end early on switching out. */
const EDGERUNNER_BONDS = new Buff({
  name: "Rebecca: Outro - Edgerunner Bonds",
  updateBuffs: () => {
    lostOnSwap();
    if (isHeld(LUCY_RESONATOR)) applyCurrent(OVERLIMIT, 70);
    else if (!triggeredAction()) applyCurrent(OVERLIMIT, 5); // assume 1 action = 1s
  },
  applyStats: () => {
    addStat(Stat.Amp, 15);
  },
});

const OVERLIMIT = new Buff({
  name: "Rebecca: Outro - Overlimit", maxStacks: 70,
  updateBuffs: () => lostOnSwap(),
  applyStats: () => {
    addStat(Stat.Amp, 0.5 * frozenStacks(), Type1.Heavy);
  },
});

/* --------------------------------------------------------------------------- kit and loadout */

const RB_INHERENT_1 = new Inherent({
  name: "Rebecca: Tag, You're It!",
  // Watched from her own inherent rather than through a team-wide marker: the Tune Break Boost is
  // the *inflicter's*, so it has to land on whoever is actually acting — and updateGlobal's own
  // currentSlot is Rebecca (this gear's holder), not them, so it goes through the acting slot's
  // resonator instead of applySelf.
  updateGlobal: () => {
    const acting = currentTeam().slot.resonator;
    if (acting && applied(TUNE_HACK_SHIFTING)) addBuff(acting, TAG_TBB, 1);
  },
  updateBuffs: () => {
    const a = currentAction();
    if (applied(A_GIRL) || a === RatTatTat || a === BangBang) applyCurrent(TAG_YOURE_IT, 1);
  },
});

const RB_INHERENT_2 = new Inherent({
  name: "Rebecca: Left an Opening!",
  updateBuffs: () => { if (currentAction() === Lib1) applyTeam(LEFT_AN_OPENING, 1); },
});

const REBECCA_TALENTS = new Talent({
  name: "Rebecca: Talents",
  constantStats: () => { addStat(Stat.BonusAtk, 12); addStat(Stat.CritRate, 8); },
});

const REBECCA_RESONATOR = new Resonator({
  name: "Rebecca",
  element: Attribute.Electro,
  weapon: WeaponType.Pistols,
  // whichever mode she is in decides which Intro she has; her loop always ends in Huntress
  intro: () => (isHeld(GUTS) ? EIntro : Intro),
  outro: () => Outro,
  color: "#abebda",
  maxEnergy: 125,

  // she starts in Huntress with a full Hot Hand bar
  combatStart: () => { applyCurrent(HUNTRESS, 1); setForte2(120); },

  updateGlobal: () => tuneHackResponse(Meltdown),

  // at a full Hot Hand bar, a Resonance Skill or Intro Skill trades it for the 12s window
  updateBuffs: () => {
    if (forte2() >= 120 && (casting(Cast.Skill) || casting(Cast.Intro))) {
      applyCurrent(A_GIRL, 1);
    }
  },

  constantStats: () => {
    addStat(Stat.BaseHp, 11600); addStat(Stat.BaseAtk, 400); addStat(Stat.BaseDef, 1173.33);
    // the flat 10 every tune-break-era resonator carries (nanoka's own weakness_mastery)
    addStat(Stat.Tbb, 10);
  },
});

/* ---------------------------------------------------------------------------------- rotation */

/** wuwalab's own verified line (rotation 196). Her Intro is the Huntress one — she starts there —
 *  and leaves her in Guts holding the 50 Fervor A Girl Gets What She Wants! restores; the Guts
 *  chain and Come 'n' Get Me! bank the other 70.5 and put her back in Huntress, so Rat-tat-tat! —
 *  the bigger of the two finishers — spends a full bar and lays Hack - Shifting. Echo, then the
 *  Liberation's three firepower tiers into BOOM! Fireworks!, then out. She is never the team's
 *  lead, so this is both opener and loop, and it ends in Huntress ready for the next Intro. */

const GBA123 = new ActionGroup("Basic - Guts 123", [GBA1, GBA2, GBA3]);

const RB_ROTATION = new Rotation([
  INTRO, GBA123,
  ESkill,
  RatTatTat, ECHO_CANCEL,
  Lib1, OUTRO_NEXT,
]);

/** Adam Smasher carries its own 1pc set, so the other four echoes run two ordinary 2-piece sets
 *  instead of a 5pc — ATK and Electro. The other two builds are the classic handoff sets, which
 *  she can run instead since everything she gives Lucy is a handoff anyway. */
const RB_ECHOES = [
  new EchoLoadout(ADAM_SMASHER_REBECCA, LINGERING_TUNES_2PC, VOID_THUNDER_2PC),

  
  new EchoLoadout(HYVATIA, NEONLIGHT_LEAP_5PC, NEONLIGHT_LEAP_2PC),
  new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC),
  new EchoLoadout(STONEWALL_BRACER, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC),
];

export const REBECCA = new Loadout({
  resonator: REBECCA_RESONATOR,
  talent: REBECCA_TALENTS,
  inherent1: RB_INHERENT_1,
  inherent2: RB_INHERENT_2,
  weapons: [SKULL_THRASHER, NEW_STD_PISTOL, STATIC_MIST],
  echoLoadouts: RB_ECHOES,
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Electro3, Mainstat.ATK1),
  substat: chem("atk", "basic"),
    rotation: RB_ROTATION,
});
