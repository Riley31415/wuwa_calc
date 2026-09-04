/**
 * Chisa, ported to the new engine — a Havoc Broadblade hybrid: healer/shielder on her basics and
 * Liberation, Resonance-Liberation-tagged burst on her forte circuit's Sawring Blitz/Eradication
 * chain.
 *
 * Every distinct combo piece wuwalab lists gets its own Action below, even the ones this file's own
 * rotation never plays — Mornye's file already does this (MA/DC defined, unused) and CLAUDE.md wants
 * the kit modelled in full regardless of which single path a rotation walks. Left out entirely, each
 * for its own reason:
 * - the mid-air Rending Lunge, and the "auto" Death Snip With Spread — wuwalab gives them the exact
 *   same MV/energy/concerto/forte numbers as their ground/manual twins, so they're the same Action
 *   under a different input, not a separate move
 * - likewise every Sawring Blitz "Dodge Counter"/"After Plunge" variant, which reads identically to
 *   the plain tap or the Hold it's a twin of
 * - "S1: Unseen Snare Fixed DMG" (a one-time 618.03% fixed hit) and "Wandering Through the Desolate
 *   Corridors" — both Sequence 1 only, out of scope per this project's sequence-0 baseline
 * - a generic "Tune Break Skill" entry every wuwalab character export carries — her weakness_mastery
 *   is 0 (confirmed against nanoka), so unlike the tune-break-era cast (Mornye, Lucy, ...) this isn't
 *   really *her* kit, the same call rover_havoc.ts already makes
 * - Dodge Counter - Eye of Unraveling: Retraction (one of the four ways to apply Unseen Snare) and
 *   simply locking onto a target (a second) — neither has a wuwalab entry to read numbers off, and
 *   nothing here fabricates a forte/MV value
 *
 * Her forte gauge is a single "Ring of Chainsaw": basics/Heavy/Skill hits, her Intro and her
 * Liberation all fill it (capped 100 in-game, no cap enforced here per CLAUDE.md); once full, her
 * Skill is replaced by Serrated Loop, which sends her into Chainsaw Mode and unlocks Sawring
 * Blitz 1/2/3 and Sawring Eradication — Blitz spends the same Ring back down, and every point it
 * spends also banks onto a second counter (modelled as RING_CONSUMED below, since — unlike the
 * gauge itself — Eradication actually *reads* this one to scale its own hit, capped 100) that
 * Eradication converts into its own MV bonus (+2.59% a point at max rank) before consuming both.
 * Blitz 2/3 each have a Hold that chains straight into the next stage for more hits at no extra
 * cost this engine models, so the rotation below holds through both rather than releasing early
 * into Discordance/Falltone — both still defined, just unused, same as Mornye's MA/DC.
 *
 * Her Skill (Eye of Unraveling) and Serrated Loop both mark the target with Unseen Snare; while
 * marked, *any* hit that lands — hers or a teammate's — inflicts a stack of the shared Havoc Bane
 * debuff (statuses.ts), watched globally off Unseen Snare's own updateGlobal rather than her own
 * updateDebuffs, so a teammate's hit counts too. Her Outro (Unraveling - Law Zero) hands the *team*
 * Resonant Thread of Closure — a 20s marker, so per CLAUDE.md's own wording rule it's revoked on her
 * own next Intro rather than left permanent. While it's up, any hit landing (anyone's) raises every
 * Negative Status/Electro Rage debuff's cap +3 — this engine's maxStackIncrease() only ever raises a
 * cap for the rest of the fight, so the in-game "for 15s, unstackable" window collapses to "raised
 * once conditions first arise and never lowered again," the closest this engine can get rather than
 * a made-up temporary cap; and inflicting/dealing Negative Status DMG while Resonant Thread of
 * Closure is up grants whoever's acting Thread of Bane (+18% DEF Ignore, 15s) — again watched
 * globally (Resonant Thread of Closure lives in the team pool), so it pays out to whichever ally
 * actually landed the status, not just Chisa.
 *
 * Two mechanics carry no stat and are left out entirely: Inescapable Fate (Inherent 1, a Skill-
 * cooldown reset off an ally's kill) and the second half of All Ends Here (Inherent 2's own on-kill
 * "Sight of Unraveling" chain) — both keyed off a "target defeated" event this engine has no hook
 * for, same as Lucy's Function Cracking. Lifethread - Jetstream/Glide and Chainsaw Fever are pure
 * positioning/uptime-gating tools with no stat of their own, so they are not modelled either.
 *
 * MVs and energy/concerto/forte off wuwalab.com's per-hit data (this project's usual fallback for
 * forte gauges nanoka doesn't expose), cross-checked hit-for-hit against nanoka.cc (character 1508)
 * at level 10 — both agree everywhere they overlap. weakness_mastery is 0: unlike the tune-break
 * era's resonators, she carries no flat Tbb of her own.
 */
import { Stat, Attribute, WeaponType, Type1, Cast, Node, Scaling } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Debuff, Resonator, Loadout, EchoLoadout } from "../../engine/gear.js";
import {
  isType,
  addStat,
  applyCurrent,
  applyTeam,
  revokeTeam,
  casting,
  currentAction,
  revokeCurrent,
  frozenStacks,
  applyEnemy,
  stacksOfEnemy,
  maxStackIncrease,
  setForte2,
  setForte1,
  forte1,
} from "../../engine/context.js";
import { Action, Rotation, NOINTRO, INTRO, ECHO_SWAP, OUTRO, START_1, START_2, SWAP, START_3 } from "../../engine/rotation.js";
import {
  HEALS, SHIELD, HAVOC_BANE, GLACIO_CHAFE, ELECTRO_FLARE, FUSION_BURST, AERO_EROSION, SPECTRO_FRAZZLE, ELECTRO_RAGE,
  inflictedNegativeStatus,
} from "../../shared/status.js";
import { KUMOKIRI, WILDFIRE_MARK } from "../../weapons/broadblade.js";
import { DISCORD, LUSTROUS_RAZOR, NEW_STD_BRAUDBLADE } from "../../weapons/standard.js";
import { THRENODIAN_LEVIATHAN, THREAD_OF_SEVERED_FATE_3PC } from "../../echoes/septimont.js";
import { BELL_BORNE_GEOCHELONE, FALLACY, HAVOC_ECLIPSE_2PC, HERON, MOONLIT_CLOUDS_2PC, MOONLIT_CLOUDS_5PC, REJUV_2PC, REJUV_5PC } from "../../echoes/jinzhou.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { chem } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function chisaAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Havoc, scaling: Scaling.Atk, ...def });
}

const Intro = chisaAction("Intro - Reverberance - Return", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 95.43, energy: 10, concerto: 10, offtune: 6400, forte1: 20,
  // Resonant Thread of Closure is a 20s team buff — CLAUDE.md's own rule for one that short is
  // "lost on the applier's next intro", not left permanent
  updateBuffs: () => revokeTeam(RESONANT_THREAD_OF_CLOSURE),
});
const Outro = chisaAction("Outro - Unraveling - Law Zero", {
  cast: Cast.Outro, active: false, concerto: -100,
  updateBuffs: () => applyTeam(RESONANT_THREAD_OF_CLOSURE, 1)
});

/** Every point of Ring of Chainsaw a Blitz stage spends also banks here (display-only forte1 is the
 *  gauge itself; this is the separate counter Eradication actually reads — see the file header). */
const spendRing = () => ({ updateBuffs: () => applyCurrent(RING_CONSUMED, -currentAction().forte2) });
/** Applied by Skill/Serrated Loop; two more of the game's four ways to mark Unseen Snare have no
 *  wuwalab entry (see file header) and aren't modelled. */
const MARK_SNARE = { updateDebuffs: () => applyEnemy(UNSEEN_SNARE, 1) };
/** Death Snip's second hit ("the scissors snip") heals the team. */
const SNIP_HEAL = { updateDebuffs: () => applyCurrent(HEALS, 1) };

// --- Reign of Silence: the ground basic chain. Stage 1 -> Stage 2 -> Rending Lunge -> Death Snip
//     -> Thread Withdrawn is the full string; Hanging Finality and the mid-air/Heavy pieces below
//     are reached from other points in it (Heavy Attack, mid-air) rather than this ground line.
const BA1 = chisaAction("Basic - Reign of Silence 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 33.42, energy: 0.70, concerto: 1.40, offtune: 2240, forte1: 4 });
const BA2 = chisaAction("Basic - Reign of Silence 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 95.45, energy: 2.00, concerto: 4.00, offtune: 6400, forte1: 14 });
/** Dodge Counter's own Reign of Silence 2 — a bigger single burst than the plain combo stage,
 *  triggered off a successful Dodge rather than chained from Stage 1. Not in the rotation (nothing
 *  here models incoming attacks to dodge), defined for completeness. */
const DodgeCounterBA2 = chisaAction("Basic - Reign of Silence 2 (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 238.59, energy: 5.00, concerto: 10.00, offtune: 11200, forte1: 23 });
const BA3 = chisaAction("Basic - Rending Lunge", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 151.10, energy: 3.19, concerto: 6.37, offtune: 10137, forte1: 20 });
/** "The skill DMG is considered Resonance Liberation DMG" per the kit page — matches wuwalab's own
 *  damage_type for both hits. */
const DeathSnip = chisaAction("Basic - Death Snip", { node: Node.Normal, cast: Cast.Basic, type: Type1.Liberation, mv: 149.06, energy: 2.09, concerto: 4.18, offtune: 6665, forte1: 18, ...SNIP_HEAL });
/** The "insert an extra hit mid-snip" variant — same Resonance Liberation typing and heal. */
const DeathSnipSpread = chisaAction("Basic - Death Snip With Spread", { node: Node.Normal, cast: Cast.Basic, type: Type1.Liberation, mv: 196.84, energy: 2.76, concerto: 5.52, offtune: 8801, forte1: 27, ...SNIP_HEAL });
const ThreadWithdrawn = chisaAction("Basic - Thread Withdrawn", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 67.65, energy: 1.44, concerto: 2.85, offtune: 4538, forte1: 16 });
/** The airborne normal attack — not part of the ground string, chains into Reign of Silence 2 in
 *  mid-air instead. Not in the rotation (nothing here models being airborne), defined for completeness. */
const ReignOfSilenceMidAir = chisaAction("Basic - Reign of Silence (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 73.96, energy: 1.55, concerto: 3.10, offtune: 4960, forte1: 9 });

const HA = chisaAction("Heavy - Reign of Silence", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 71.58, energy: 1.50, concerto: 3.00, offtune: 4800, forte1: 10 });
/** Heavy Attack's own mid-air follow-up, chaining into Hanging Finality. Not in the rotation. */
const SeveredFacet = chisaAction("Heavy - Severed Facet (Mid-Air)", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 89.48, energy: 1.88, concerto: 3.76, offtune: 6000, forte1: 12 });
/** Reached off Heavy Attack, Severed Facet, or Rending Lunge in mid-air; can chain into Death Snip.
 *  Not in the rotation (the ground string reaches Death Snip via Rending Lunge instead). */
const HangingFinality = chisaAction("Basic - Hanging Finality", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 119.30, energy: 2.50, concerto: 5.00, offtune: 8000, forte1: 16 });

// --- Resolution: Eye of Unraveling is her baseline Skill; Serrated Loop replaces it once the Ring
//     of Chainsaw is full and is what sends her into Chainsaw Mode. All three mark Unseen Snare.
const Skill = chisaAction("Skill - Eye of Unraveling", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 35.79, energy: 0.75, concerto: 1.50, offtune: 2400, forte1: 5, ...MARK_SNARE });
/** The plain tap — released immediately. Not in the rotation; the Hold below reaches Chainsaw Mode
 *  with more hits at no extra cost this engine models, so it's the strictly better pick here. */

const SERRATED = { 
  applyStats: () => {
    if (forte1()>100) setForte1(100);
  }, 
  updateDebuffs: () => applyEnemy(UNSEEN_SNARE, 1),
};
const SerratedLoop = chisaAction("Skill - Serrated Loop", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 139.60, energy: 2.96, concerto: 5.92, offtune: 9360, forte1: -100, forte2: 100,...SERRATED });
const SerratedLoopHalfHold = chisaAction("Skill - Serrated Loop (Half Hold)", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 199.28, energy: 4.24, concerto: 8.48, offtune: 13368, forte1: -100,forte2: 100,...SERRATED });
const SerratedLoopHold = chisaAction("Skill - Serrated Loop (Hold)", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 258.96, energy: 5.52, concerto: 11.04, offtune: 17376, forte1: -100, forte2: 100,...SERRATED });

/** Moment of Nihility: 954.29% Havoc, heals the team, banks 40 Ring of Chainsaw and hands herself
 *  Woven Myriad - Convergence (+120% MV to Blitz/Eradication until Eradication resolves it). */
const Liberation = chisaAction("Liberation - Moment of Nihility", {
  node: Node.Liberation, cast: Cast.Liberation, type: Type1.Liberation, resetEnergy: true,
  mv: 954.29, concerto: 20, offtune: 96000, forte1: 40,
  updateDebuffs: () => applyCurrent(HEALS, 1),
  updateBuffs: () => applyCurrent(WOVEN_MYRIAD_CONVERGENCE, 1),
});

// --- Chainsaw Mode's own Sawring Blitz chain, all typed Resonance Liberation DMG per the kit page.
//     Each stage both spends the Ring of Chainsaw gauge (forte1, display only) and banks the same
//     amount onto RING_CONSUMED (spendRing above), which only Eradication ever reads.
const Blitz1 = chisaAction("Forte - Sawring Blitz 1", { node: Node.Forte, type: Type1.Liberation, mv: 68.94, energy: 1.02, concerto: 1.98, offtune: 3084, forte2: -18, ...spendRing() });
/** The plain tap, released immediately into Discordance below. Not in the rotation — the Hold
 *  chains straight into Blitz 3 with more hits for the same Ring spent, same call as Serrated Loop. */
const Blitz2 = chisaAction("Forte - Sawring Blitz 2", { node: Node.Forte, type: Type1.Liberation, mv: 85.12, energy: 1.20, concerto: 2.40, offtune: 3808, forte2: -22, ...spendRing() });
/** Auto-follows a released (non-Hold) Blitz 2. Not in the rotation, same reason as Blitz 2 above. */
const Blitz2Discordance = chisaAction("Forte - Sawring Blitz 2 Discordance", { node: Node.Forte, type: Type1.Liberation, mv: 10.74, energy: 0.15, concerto: 0.30, offtune: 480, forte2: -3, ...spendRing() });
const Blitz2Hold = chisaAction("Forte - Sawring Blitz 2 (Hold)", { node: Node.Forte, type: Type1.Liberation, mv: 191.52, energy: 2.70, concerto: 5.40, offtune: 8568, forte2: -52, ...spendRing() });
/** The plain tap, released immediately into Falltone below. Not in the rotation, same reason as
 *  Blitz 2's own tap. */
const Blitz3 = chisaAction("Forte - Sawring Blitz 3", { node: Node.Forte, type: Type1.Liberation, mv: 127.84, energy: 1.84, concerto: 3.60, offtune: 5720, forte2: -26, ...spendRing() });
/** Auto-follows a released (non-Hold) Blitz 3. Not in the rotation. */
const Blitz3Falltone = chisaAction("Forte - Sawring Blitz 3 Falltone", { node: Node.Forte, type: Type1.Liberation, mv: 10.74, energy: 0.15, concerto: 0.30, offtune: 480, forte2: -3, ...spendRing() });
const Blitz3Hold = chisaAction("Forte - Sawring Blitz 3 (Hold)", { node: Node.Forte, type: Type1.Liberation, mv: 223.72, energy: 3.22, concerto: 6.30, offtune: 10010, forte2: -50, ...spendRing() });
/** Consumes whatever Ring of Chainsaw remains and ends Chainsaw Mode; shields the team. */
const Eradication = chisaAction("Forte - Sawring Eradication", {
  node: Node.Forte, type: Type1.Liberation, mv: 257.67, energy: 22.40, concerto: 49.80, offtune: 7680,
  updateDebuffs: () => {
    applyCurrent(SHIELD, 1);
    setForte2(0);
  }
});

/* ------------------------------------------------------------------------------------- buffs */

/** Woven Myriad - Convergence: +120% MV to Blitz/Eradication, ended the moment Eradication itself
 *  resolves rather than its own 15s (a loop always reaches Eradication well inside that). */
const WOVEN_MYRIAD_CONVERGENCE = new Buff({
  name: "Chisa: Woven Myriad - Convergence",
  applyStats: () => {
    if ([Blitz1, Blitz2, Blitz2Discordance, Blitz2Hold, Blitz3, Blitz3Falltone, Blitz3Hold, Eradication].includes(currentAction())) {
      addStat(Stat.MulMv, 120);
    }
  },
  convertStats: () => { if (currentAction() === Eradication) revokeCurrent(WOVEN_MYRIAD_CONVERGENCE); },
});

/** Every point of Ring of Chainsaw Blitz spends banks here (cap 100), and only Eradication ever
 *  reads it — +2.59% MV a point at max rank — before it resets for the next Chainsaw Mode entry. */
const RING_CONSUMED = new Buff({
  name: "Chisa: Ring of Chainsaw Consumed", maxStacks: 100,
  applyStats: () => { if (currentAction() === Eradication) addStat(Stat.MulMv, 2.59 * frozenStacks()); },
  convertStats: () => { if (currentAction() === Eradication) revokeCurrent(RING_CONSUMED); },
});

/** All Ends Here (Inherent 2's own stat half): casting Intro or Liberation grants +20% Havoc DMG
 *  Bonus and +20% Healing Bonus for 12s — lost after the outro like every short self window here. */
const ALL_ENDS_HERE = new Buff({
  name: "Inherent: All Ends Here",
  applyStats: () => { addStat(Stat.DmgBonus, 20, Attribute.Havoc); addStat(Stat.HealingBonus, 20); },
  convertStats: () => { if (currentAction() === Outro) revokeCurrent(ALL_ENDS_HERE); },
});

/** Unseen Snare: an enemy marker, 30s (permanent uptime — Skill/Serrated Loop both refresh it every
 *  loop well inside that). While up, *any* hit that lands — watched globally, so a teammate's own
 *  hit counts too, not just Chisa's — inflicts a stack of the shared Havoc Bane debuff. */
const UNSEEN_SNARE = new Debuff({
  name: "Chisa: Unseen Snare",
  // The Bane is hers, not the swinging teammate's: applyEnemy() here inherits this marker's own
  // source (context.ts's `attribute()`), so an "on inflicting a Negative Status" passive worn by that
  // teammate — Kumokiri, Thread of Severed Fate — reads 0 for it and doesn't pay out. See
  // `appliedByMe()`, which is what every such passive checks.
  //
  // updateDebuffs, not updateGlobal, even though it fires off everyone's casts: this is an enemy-
  // pool Debuff, so its updateDebuffs already runs on every member's action, and that phase is
  // ahead of *all* updateGlobal. From updateGlobal the enemy pool goes last of the three, so the
  // Bane landed after every cross-slot watcher had already looked — including her own sonata (see
  // THREAD_OF_SEVERED_FATE_3PC), which could never see it.
  updateDebuffs: () => { if (currentAction().mv > 0) applyEnemy(HAVOC_BANE, 1); },
});

/** Every Negative Status (statuses.ts) plus Electro Rage — what Resonant Thread of Closure's own
 *  cap raise below applies to, matching the kit page's generic "Negative Status and Electro Rage". */
const NEGATIVE_STATUS_CAPS = [HAVOC_BANE, GLACIO_CHAFE, ELECTRO_FLARE, FUSION_BURST, AERO_EROSION, SPECTRO_FRAZZLE, ELECTRO_RAGE];

/** Resonant Thread of Closure (Outro): a 20s team marker, revoked on Chisa's own next Intro (see
 *  Intro above) rather than a made-up expiry. While held: any hit landing raises every Negative
 *  Status/Electro Rage cap +3 — this engine's maxStackIncrease() only ever raises a cap for the rest
 *  of the fight (no way to lower it again once the real 15s lapses), so this is the closest a "for
 *  15s, unstackable" raise gets here rather than invented decay. Inflicting/dealing Negative Status
 *  DMG while Unseen Snare is up also grants whoever's acting Thread of Bane. Watched globally (it
 *  lives in the team pool), so both effects see every ally's own turn, not just Chisa's. */
const RESONANT_THREAD_OF_CLOSURE = new Buff({
  name: "Chisa: Outro",
  updateGlobal: () => {
    if (currentAction().mv > 0) for (const d of NEGATIVE_STATUS_CAPS) maxStackIncrease(d, 3);
    if (inflictedNegativeStatus() || isType(Type1.Status)) {
      applyCurrent(THREAD_OF_BANE, 1);
    }
  },
});

/** Thread of Bane: +18% DEF Ignore, 15s — lost after the outro like every short self window here.
 *  Granted per-holder (see Resonant Thread of Closure above), so `casting(Cast.Outro)` rather than
 *  Chisa's own specific Outro action, since any ally on the team could end up holding it. */
const THREAD_OF_BANE = new Buff({
  name: "Chisa: Thread of Bane",
  applyStats: () => { if (stacksOfEnemy(UNSEEN_SNARE) > 0) addStat(Stat.DefIgnoreNew, 18) },
});

/* --------------------------------------------------------------------------- kit and loadout */

/** Inescapable Fate (Inherent 1): resets her Skill's cooldown off an ally's kill on a Snare-marked
 *  target — no engine hook for a "defeat," so this contributes nothing, like Mornye's Boundedness. */
const CS_INHERENT_1 = new Inherent({ name: "Inherent: Inescapable Fate" });

/** All Ends Here (Inherent 2): grants ALL_ENDS_HERE above off her own Intro/Liberation. Its second
 *  half — Sight of Unraveling, another on-kill chain — is left out for the same reason as Inherent 1. */
const CS_INHERENT_2 = new Inherent({
  name: "Inherent: All Ends Here",
  updateBuffs: () => { if (currentAction() === Intro || currentAction() === Liberation) applyCurrent(ALL_ENDS_HERE, 1); },
});

const CHISA_TALENTS = new Talent({
  name: "Chisa: Talents",
  constantStats: () => { addStat(Stat.BonusAtk, 12); addStat(Stat.CritRate, 8); },
});

const CHISA_RESONATOR = new Resonator({
  name: "Chisa",
  element: Attribute.Havoc,
  weapon: WeaponType.Broadblade,
  intro: () => Intro,
  outro: () => Outro,
  color: "#8a3b47",
  maxEnergy: 125,

  constantStats: () => {
    addStat(Stat.BaseHp, 10775); addStat(Stat.BaseAtk, 437.5); addStat(Stat.BaseDef, 1136.6646);
  },
});

/* ---------------------------------------------------------------------------------- rotation */

/** Skill spent once in the opening scramble (its ~12s cooldown is well clear by the time the loop
 *  reaches it again), then Intro into Liberation, the full ground string (Reign of Silence 1/2 ->
 *  Rending Lunge -> Death Snip -> Thread Withdrawn) to bank the rest of the Ring of Chainsaw,
 *  Serrated Loop's Hold once it's full, and the Blitz Hold chain into Eradication to spend it back
 *  down (saturating RING_CONSUMED's own 100-point cap) and trade the Convergence buff away. */

const CS_ROTATION = new Rotation([
  START_2, START_3, Skill, SWAP,

  NOINTRO, Skill, BA3, DeathSnipSpread, ThreadWithdrawn, Liberation,
  SerratedLoop, Blitz2Hold, Blitz3Hold, Eradication,
  ECHO_SWAP, OUTRO,

  INTRO, Skill, BA3, DeathSnipSpread, Liberation,
  SerratedLoop, Blitz2Hold, Blitz3Hold, Eradication,
  ECHO_SWAP, OUTRO,
]);

const CS_ECHOES = [
  new EchoLoadout(THRENODIAN_LEVIATHAN, THREAD_OF_SEVERED_FATE_3PC, HAVOC_ECLIPSE_2PC),
  new EchoLoadout(FALLACY, THREAD_OF_SEVERED_FATE_3PC, REJUV_2PC),
  new EchoLoadout(HERON, THREAD_OF_SEVERED_FATE_3PC, MOONLIT_CLOUDS_2PC),
  new EchoLoadout(BELL_BORNE_GEOCHELONE, THREAD_OF_SEVERED_FATE_3PC, MOONLIT_CLOUDS_2PC),
  new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
  new EchoLoadout(BELL_BORNE_GEOCHELONE, REJUV_5PC),
  new EchoLoadout(FALLACY, REJUV_5PC),
];

export const CHISA = new Loadout({
  resonator: CHISA_RESONATOR,
  talent: CHISA_TALENTS,
  inherent1: CS_INHERENT_1,
  inherent2: CS_INHERENT_2,
  weapons: [KUMOKIRI, LUSTROUS_RAZOR, NEW_STD_BRAUDBLADE, DISCORD, WILDFIRE_MARK],
  echoLoadouts: CS_ECHOES,
  mainstats: mainstatOptions(Mainstat.CD4, Mainstat.CR4, Mainstat.ATK3, Mainstat.Havoc3, Mainstat.ATK1),
  substat: chem("atk", "liberation"),
  rotation: CS_ROTATION,
});
