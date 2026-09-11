/**
 * Yangyang: Xuanling — a Havoc Sword main DPS built on Havoc Bane, and very nearly an all-Heavy
 * kit: only the two four-stage Basic Attack chains are Basic Attack DMG. Both Resonance Skill
 * forms, both Heavy Attacks, Feather Fall, the whole Havoc in Bloom chain and even the Liberation
 * are *considered Heavy Attack DMG* — which is what her sig, her sonata and her echo all pay into.
 * Filed under Mengzhou with her own echo and sonata, the version she arrives in, rather than under
 * Huanglong with the rest of the country she comes from.
 *
 * Her loop is two stances and two gauges:
 * - **Melody** (forte1, 0-100) starts full and is spent by Basic Attacks. A full four-stage chain
 *   costs 110, so it bottoms out inside stage 4 — the two stage-4 casts floor the bar themselves,
 *   since nothing in this engine does.
 * - Melody empty unlocks **Sword Stance Flow**, which switches to the other stance, refills Melody
 *   and banks a point of **Azure Plume** (forte2, 0-2).
 * - At 2 Azure Plume the stance's Heavy Attack opens. **Heavy - Azure Sword Stance** spends the
 *   plume outright; **Heavy - Feather Sword Stance** spends none and auto-casts **Mid-air Attack -
 *   Feather Fall**, which spends it instead and opens **Hark the Wind** — the 12s window where
 *   Feather basics become the far larger **Havoc in Bloom** chain.
 * - The Liberation spends all Melody for a 1988% hit, banks a plume of its own, and raises Havoc
 *   Bane on the target to its cap.
 *
 * Havoc Bane is the whole point. **Unbroken Vow** amplifies her damage by 10% a stack up to 3, and
 * by 12% a stack — so a flat 36% — from 4 to 6, and the target's base cap is 3: reaching that
 * second tier at all takes a kit that raises Negative Status caps, which is why Chisa stands
 * behind her. Two more passives ride on *anyone* on the team inflicting it: **Feathered Oath**
 * (Forte Circuit) at +25% Crit. DMG a stack to the six Heavy casts it names, and **Windbound**
 * (Inherent), which at 6 becomes **One with the Wind** and has her next Sword Stance Flow summon
 * Feather Release for 6 stacks at once.
 *
 * Two pieces are deliberately absent. **Refrain** propagates the highest Havoc Bane count across
 * targets in range, which does nothing to the single boss this calculator fights. **Wraith of
 * Sound** (a fixed 523 Havoc hit) only fires when a Sword Stance Flow resets the Basic chain,
 * which the rotation below never does. The 1s gate on Windbound and Feathered Oath is a clock this
 * engine has none of, so both are taken as available; the 25s on the two Crit. DMG windows is
 * modelled as once a visit instead (see Bated Breath below).
 *
 * MVs off nanoka.cc (character 1610) at level 10, per-hit x hit count as CLAUDE.md describes, with
 * the flat Concerto Regen rows folded in (the Liberation 20, the Intro 10) and the hidden +10 on
 * both dodge counters. Melody and Azure Plume are wuwalab's frame data
 * (api.wuwalab.com/api/app/characters/xuanling), which nanoka does not expose. Dodge Counter -
 * Havoc in Bloom shares Basic - Havoc in Bloom's own rows exactly, hit for hit, so the three
 * actions below stand for both. Her `weakness_mastery` is 0, so she carries no flat Tune Break
 * Boost of her own.
 */
import { Stat, Attribute, WeaponType, Type1, Cast, Node, Scaling, LifeTime } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Sequence } from "../../engine/gear.js";
import {
  addStat,
  applied,
  appliedByMe,
  applyCurrent,
  applyEnemy,
  applyTeam,
  casting,
  consume,
  currentAction,
  runningAction,
  currentTeam,
  forte1,
  frozenStacks,
  isActive,
  isHeld,
  maxStackIncrease,
  queue,
  queueOn,
  removeStack,
  revokeCurrent,
  setForte1,
  setForte2,
  stacksOfEnemy,
} from "../../engine/context.js";
import { ActionGroup, Action, Rotation, INTRO, ECHO_ONFIELD, OUTRO, START_3, SWAP } from "../../engine/rotation.js";
import { HAVOC_BANE, anyNegativeStatusInflicted } from "../../shared/status.js";
import { AZURE_OATH, EMERALD_SENTENCE } from "../../weapons/sword.js";
import { EMERALD_OF_GENESIS } from "../../weapons/standard.js";
import { THOUSAND_PUPPET_PAVILION, FEATHERED_TRACE_5PC } from "../../echoes/mengzhou.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function yangyangAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Havoc, scaling: Scaling.Atk, ...def });
}

/** Both Sword Stance Flow forms, which are where every stored payout is cashed. Feather Release
 *  inflicts in `updateDebuffs`, the first phase, so the team's own "on inflicting Havoc Bane"
 *  passives see all six stacks this action; the Flow's own "consume 1 stack on hit" waits for
 *  `afterAction` so this cast still reads the full count for Unbroken Vow. */
const FLOW = {
  updateDebuffs: () => {
    if (!isHeld(ONE_WITH_THE_WIND)) return;
    applyEnemy(HAVOC_BANE, 6);
    revokeCurrent(ONE_WITH_THE_WIND);
  },
  updateBuffs: () => {
    if (!isHeld(VOICE_UPON_VOICE)) return;
    queue(ShadowOfXuanling);
    revokeCurrent(VOICE_UPON_VOICE);
  },
  afterAction: () => {
    // `consume`, not a plain remove: this is the kit spending a stack, and a teammate's own "when
    // you consume Havoc Bane" passive has no other way to see it (context.ts's own `consumed()`)
    consume(HAVOC_BANE, 1);
  },
};

// --- Succor and Smite: the two four-stage Basic chains, the only ordinary Basic Attack DMG she
//     has. Stage 4 of each lands a stack of Havoc Bane.
const BA_A1 = yangyangAction("Basic - Azure Sword Stance 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 47.72, energy: 0.75, concerto: 1.50, offtune: 2400, forte1: -12 });
const BA_A2 = yangyangAction("Basic - Azure Sword Stance 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 100.69, energy: 1.59, concerto: 3.18, offtune: 5065, forte1: -24 });
const BA_A3 = yangyangAction("Basic - Azure Sword Stance 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 100.69, energy: 1.59, concerto: 3.17, offtune: 5065, forte1: -26 });
const BA_A4 = yangyangAction("Basic - Azure Sword Stance 4", {
  node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 185.63, energy: 2.94, concerto: 5.85, offtune: 9337, forte1: -48,
  updateDebuffs: () => applyEnemy(HAVOC_BANE, isHeld(XL_S3) ? 2 : 1),
});
const MA_A = yangyangAction("Mid-air - Azure Sword Stance", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 98.61, energy: 1.55, concerto: 3.10, offtune: 4960, forte1: -12 });
const DC_A = yangyangAction("Dodge Counter - Azure Sword Stance 2", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 196.13, energy: 3.09, concerto: 16.18, offtune: 9865, forte1: -24 });

const BA_F1 = yangyangAction("Basic - Feather Sword Stance 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 79.54, energy: 1.26, concerto: 2.50, offtune: 4000, forte1: -12 });
const BA_F2 = yangyangAction("Basic - Feather Sword Stance 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 100.68, energy: 1.59, concerto: 3.18, offtune: 5064, forte1: -24 });
const BA_F3 = yangyangAction("Basic - Feather Sword Stance 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 74.29, energy: 1.19, concerto: 2.36, offtune: 3738, forte1: -26 });
const BA_F4 = yangyangAction("Basic - Feather Sword Stance 4", {
  node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 238.59, energy: 3.76, concerto: 7.50, offtune: 12000, forte1: -48,
  updateDebuffs: () => applyEnemy(HAVOC_BANE, isHeld(XL_S3) ? 2 : 1),
});
const MA_F = yangyangAction("Mid-air - Feather Sword Stance", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 98.61, energy: 1.55, concerto: 3.10, offtune: 4960, forte1: -12 });
const DC_F = yangyangAction("Dodge Counter - Feather Sword Stance 2", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 196.11, energy: 3.09, concerto: 16.18, offtune: 9864, forte1: -24 });

// --- Feather's Edge: the plain stance switch, castable any time and worth nothing but its own
//     hit — the Flow forms below replace it the moment Melody empties.
const SwitchAzure = yangyangAction("Skill - Sword Stance Switch: Azure", { node: Node.Skill, cast: Cast.Skill, type: Type1.Heavy, mv: 116.60, energy: 1.85, concerto: 3.67, offtune: 5865 });
const SwitchFeather = yangyangAction("Skill - Sword Stance Switch: Feather", { node: Node.Skill, cast: Cast.Skill, type: Type1.Heavy, mv: 100.68, energy: 1.59, concerto: 3.18, offtune: 5064 });

// --- The Way of Ten Thousand Voices. Sword Stance Flow refills Melody outright rather than
//     adding to it, so the refill is a set (the bar is at 0 by the time either is castable).
const FlowAzure = yangyangAction("Skill - Sword Stance Flow: Azure", {
  node: Node.Forte, cast: Cast.Skill, type: Type1.Heavy, mv: 116.60, energy: 11.61, concerto: 10.02, offtune: 5865, forte2: 1,forte1: 100,
  ...FLOW,
});
const FlowFeather = yangyangAction("Skill - Sword Stance Flow: Feather", {
  node: Node.Forte, cast: Cast.Skill, type: Type1.Heavy, mv: 100.68, energy: 11.61, concerto: 10.02, offtune: 5064, forte2: 1, forte1: 100,
  ...FLOW,
});

const HeavyAzure = yangyangAction("Forte Heavy - Azure Sword Stance", {
  node: Node.Forte, cast: Cast.Heavy, type: Type1.Heavy, mv: 450.53, energy: 9.34, concerto: 15.00, offtune: 10666,
  updateDebuffs: () => applyEnemy(HAVOC_BANE, isHeld(XL_S3) ? 3 : 2),
  updateBuffs: () => { if (!isHeld(BATED_BREATH_CD)) applyCurrent(BATED_BREATH, 1); },
  // only opens at 2 Azure Plume, and spends it outright: maxForte2 (2 below) clamps an overrun
  // back to the cap before this lands exactly on 0
  forte2: -2,
});
const HeavyFeather = yangyangAction("Heavy - Feather Sword Stance", {
  node: Node.Forte, cast: Cast.Heavy, type: Type1.Heavy, mv: 217.05, energy: 1.87, concerto: 4.67, offtune: 7465,
  updateDebuffs: () => applyEnemy(HAVOC_BANE, isHeld(XL_S3) ? 3 : 2),
  updateBuffs: () => { if (!isHeld(STREAMING_STORM_CD)) applyCurrent(STREAMING_STORM, 1); },
});
const FeatherFall = yangyangAction("Forte Mid-air - Feather Fall", {
  node: Node.Forte, cast: Cast.Basic, type: Type1.Heavy, mv: 110.97, energy: 1.26, concerto: 3.12, offtune: 4962,
  // Feather Sword Stance itself spends none — this auto-cast follow-up is what actually spends
  // the 2 Azure Plume that opened it
  forte2: -2,
});
const HiB1 = yangyangAction("Basic - Havoc in Bloom 1", { node: Node.Forte, cast: Cast.Basic, type: Type1.Heavy, mv: 119.37, energy: 1.35, concerto: 3.36, offtune: 5337 });
const HiB2 = yangyangAction("Basic - Havoc in Bloom 2", { node: Node.Forte, cast: Cast.Basic, type: Type1.Heavy, mv: 223.13, energy: 2.50, concerto: 6.26, offtune: 9977 });
const HiB3 = yangyangAction("Basic - Havoc in Bloom 3", { node: Node.Forte, cast: Cast.Basic, type: Type1.Heavy, mv: 399.59, energy: 2.67, concerto: 12.67, offtune: 10665 });

// --- Hush of a Thousand Voices. Heavy Attack DMG despite the cast, and it ends holding a plume.
const Lib = yangyangAction("Liberation - Hush of a Thousand Voices", {
  node: Node.Liberation, cast: Cast.Liberation, cutscene: true, type: Type1.Heavy, mv: 1988.10, concerto: 20, offtune: 136400, resetForte1: true,
  forte2: 1, resetEnergy: true,
  // One Life, One Blade's own first line: the hit raises Havoc Bane to the target's limit, which
  // is the fight's rather than the declared 3 (Chisa's +3 to every Negative Status cap)
  updateDebuffs: () => applyEnemy(HAVOC_BANE, currentTeam().enemyMax(HAVOC_BANE)),
  updateBuffs: () => applyCurrent(VOICE_UPON_VOICE, 1),
});
/** Voice upon Voice cashed on the next Sword Stance Flow. A summon, so it is queued rather than
 *  named by the rotation. */
const ShadowOfXuanling = yangyangAction("Liberation - Shadow of Xuanling", { node: Node.Liberation, type: Type1.Heavy, mv: 337.98 });
/** The three sequence Shadows — the Liberation's own 337.98% row (no energy/concerto/off-tune of
 *  its own), Heavy DMG, each filed under the cast that summons it. */
const ShadowUnfaltering = yangyangAction("Skill - Shadow of Xuanling: Unfaltering (S1)", { node: Node.Forte, type: Type1.Heavy, mv: 337.98 });
const ShadowStrungNotes = yangyangAction("Basic - Shadow of Xuanling: Strung Notes (S2)", { node: Node.Normal, type: Type1.Heavy, mv: 337.98 });
const ShadowWitheredWood = yangyangAction("Skill - Shadow of Xuanling: Still as Withered Wood (S6)", { node: Node.Forte, type: Type1.Heavy, mv: 337.98 });

const Intro = yangyangAction("Intro - Skybound Feather", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 116.59, energy: 10, concerto: 10, offtune: 5864,
  forte2: 1,
  updateDebuffs: () => applyEnemy(HAVOC_BANE, 1),
});
const Outro = yangyangAction("Outro - As the Wind Wills", {
  cast: Cast.Outro, type: Type1.Outro, mv: 300, concerto: -100, swapOut: true,
  updateBuffs: () => applyTeam(TONAL_SWITCH, 1),
});

/* ------------------------------------------------------------------------------------- buffs */

/** The six casts Feathered Oath names, and the five of them Streaming Storm does — she has other
 *  Heavy Attack DMG (both stance switches, both Flows, the Liberation), so neither can be a plain
 *  `isType(Type1.Heavy)` check. */
const FEATHER_HEAVIES: Action[] = [HeavyFeather, FeatherFall, HiB1, HiB2, HiB3];
const OATH_ACTIONS = new Set<Action>([HeavyAzure, ...FEATHER_HEAVIES]);
const STORM_ACTIONS = new Set<Action>(FEATHER_HEAVIES);

/** Feathered Oath (Forte Circuit): a stack every time anyone on the team inflicts Havoc Bane, up
 *  to 6, each +25% Crit. DMG on the casts above. "While Yangyang is the active Resonator" needs no
 *  check — every cast it names is one of hers, made on field.
 *
 *  A stack lasts 4s and every fresh Havoc Bane on the team renews the set, so what actually ends
 *  it is a gap with no Bane in it. Her visit has exactly one: the Havoc in Bloom chain, which
 *  inflicts none of its own — Feather Fall through Stage 3 outruns the 4s, and the stacks are gone
 *  by the time Stage 3 closes. Her outro ends it too, per CLAUDE.md's own wording rule.
 *
 *  The Stage 3 half is conditional, and on the fight rather than on the roster: a teammate whose
 *  kit lands Havoc Bane off *every* hit (Chisa's Thread of Bane) renews the stacks right through
 *  the chain, so there is no gap and nothing lapses. Asking whether any Bane landed on this very
 *  cast is exactly that question, and it stays true of any future kit that does the same rather
 *  than naming Chisa here. Dropped from `updateBuffs`, a phase ahead of any stat, so Stage 3 is
 *  not paid either — the window is already gone by the time it lands. */
const FEATHERED_OATH = new Buff({
  name: "Xuanling: Feathered Oath", maxStacks: 6,
  // Stage 3 is the cast the window lapses *on*, so it is dropped here, a phase ahead of any
  // applyStats — Stage 3 itself pays nothing. The grant runs earlier still (the Resonator's own
  // updateGlobal), so a Bane landing on this very cast re-arms it before this looks.
  updateBuffs: () => { if (runningAction(HiB3) && !applied(HAVOC_BANE)) revokeCurrent(FEATHERED_OATH); },
  applyStats: () => { if (OATH_ACTIONS.has(currentAction())) addStat(Stat.CritDmg, 25 * frozenStacks()); },
  // the outro is the other end of it, and nothing it pays is in OATH_ACTIONS, so that one is an
  // ordinary pay-then-drop like every short window in this file
  until: LifeTime.Outro,
});

/** Bated Breath and Streaming Storm: the two +160% Crit. DMG windows, each opened by its own Heavy
 *  Attack and each behind a 25s cooldown.
 *
 *  Both are one Buff of two stacks, the shape Starfield Calibrator's Definite Solution and
 *  Variation's Ceaseless Aria already use for a cooldown here: stack 1 is the live window, stack 2
 *  is the same buff spent and holding the cooldown open, and her Outro clears it so the next visit
 *  arms again. A second cast inside one visit re-grants onto a buff already at its cap, reads 2,
 *  and pays nothing. 25s is about one full team loop, so once a visit is what the cooldown comes
 *  to — this is not a clock, and a rotation that pressed either Heavy twice would still only be
 *  paid once, which is the part worth enforcing.
 *
 *  "While Yangyang: Xuanling is the active Resonator" needs no check on either: every cast either
 *  window pays is one of hers, made on field. */
/** The once-a-visit cooldowns on the two windows below — nameless, so a spent window leaves no
 *  row behind: what the reader wants to see is the window while it pays, not a marker saying it
 *  has already gone. Lifted by her own Outro, which is what makes it once a *visit*. */
const BATED_BREATH_CD = new Buff({ until: LifeTime.Outro });
const STREAMING_STORM_CD = new Buff({ until: LifeTime.Outro });

const BATED_BREATH = new Buff({
  name: "Xuanling: Bated Breath",
  stats: [[Stat.CritDmg, 160]], when: () => runningAction(HeavyAzure),
  // "when Heavy Attack - Azure Sword Stance ends, Bated Breath is removed" — the window closes on
  // the very cast that opened it, and the cooldown it leaves is what bars a second one this visit
  convertStats: () => {
    if (casting(Cast.Outro)) revokeCurrent(BATED_BREATH);
    else if (runningAction(HeavyAzure)) { revokeCurrent(BATED_BREATH); applyCurrent(BATED_BREATH_CD, 1); }
  },
});

/** Streaming Storm: the same shape, but the window stays open across the whole Feather Heavy chain
 *  it starts — the Heavy itself, Feather Fall, and Havoc in Bloom — rather than closing on its own
 *  cast, so it is spent when Stage 3 ends instead. */
const STREAMING_STORM = new Buff({
  name: "Xuanling: Streaming Storm",
  stats: [[Stat.CritDmg, 160]], when: () => STORM_ACTIONS.has(currentAction()),
  convertStats: () => {
    if (casting(Cast.Outro)) revokeCurrent(STREAMING_STORM);
    else if (runningAction(HiB3)) { revokeCurrent(STREAMING_STORM); applyCurrent(STREAMING_STORM_CD, 1); }
  },
});

/** Windbound and what it becomes. Neither carries a stat: Windbound is a counter, and One with the
 *  Wind is spent by the next Sword Stance Flow for Feather Release's 6 stacks of Havoc Bane (see
 *  `FLOW` above, which is also what removes it). */
const WINDBOUND = new Buff({ name: "Xuanling: Windbound", maxStacks: 6 });
const ONE_WITH_THE_WIND = new Buff({ name: "Xuanling: One with the Wind" });

/** Voice upon Voice: banked by the Liberation, spent by the next Sword Stance Flow for the Shadow
 *  of Xuanling summon. Does not stack, and no stat of its own. */
const VOICE_UPON_VOICE = new Buff({ 
  name: "Xuanling: Voice upon Voice" 
});

/** Tonal Switch (Outro Skill): 20s on every resonator in the team *but* her, and it pays out only
 *  once that resonator has inflicted Havoc Bane themselves — so the window is one buff and the
 *  payout another, granted on the turn they actually inflict. Held team-wide so it ticks on
 *  whoever is acting; the payout is local, and drops itself once her next Intro has taken the
 *  window away. */
const TONAL_SWITCH = new Buff({
  name: "Xuanling: Tonal Switch",
  updateBuffs: () => {
    if (currentTeam().slot.resonator === XUANLING_RESONATOR) return;
    // `appliedByMe`: the amplification is that resonator's for inflicting it themselves, and
    // Chisa's Unseen Snare hands Havoc Bane out off whoever happens to be hitting her marked
    // target — which the kit text credits to Chisa, not to them
    if (appliedByMe(HAVOC_BANE)) applyCurrent(TONAL_SWITCH_AMP, 1);
  },
});
const TONAL_SWITCH_AMP = new Buff({
  name: "Xuanling: Outro",
  stats: [[Stat.Amp, 20, Attribute.Havoc]],
});

/* --------------------------------------------------------------------------------- sequences */

const isFlow = (): boolean => runningAction(FlowAzure) || runningAction(FlowFeather);

/** S1: a Shadow of Xuanling: Unfaltering off every Sword Stance Flow. Stagnation and the interrupt
 *  immunity are no stat. */
const XL_S1 = new Sequence({
  name: "Xuanling S1: At the Wind's Breath, the Blossoms Wake",
  updateBuffs: () => { if (isFlow()) queue(ShadowUnfaltering); },
});

/** Strung Notes (S2): one stack, spent by her first stance Basic for a Shadow of Xuanling. */
const STRUNG_NOTES = new Buff({
  name: "Xuanling S2: Strung Notes",
  updateBuffs: () => {
    if (!casting(Cast.Basic) || currentAction().node !== Node.Normal) return;
    revokeCurrent(STRUNG_NOTES);
    queue(ShadowStrungNotes);
  },
});
/** S2: +100% DMG on both Heavies, Feather Fall and Havoc in Bloom. The out-of-combat lines are
 *  taken once at the start of the fight: Strung Notes above and 2 Azure Plume (the cooldown reset
 *  has nothing to reset yet). The plume is banked, not pressed — this line opens no Heavy before
 *  the swap. */
const XL_S2 = new Sequence({
  name: "Xuanling S2: River Carries Her Song Away",
  combatStart: () => { applyCurrent(STRUNG_NOTES, 1); setForte2(2); },
  applyStats: () => { if (OATH_ACTIONS.has(currentAction())) addStat(Stat.DmgBonus, 100); },
});

/** S3: the Liberation Amplified by 175%; the Intro and both Flows raise the target's Havoc Bane
 *  cap by 3 (20s, renewed every visit, and the engine takes one raise a source) — which is what
 *  the Liberation's raise-to-max then fills; and the extra stack on both Stage 4s and both
 *  Heavies is inside their own inflicts above. */
const XL_S3 = new Sequence({
  name: "Xuanling S3: My Grief Follows You into the Clouds",
  updateDebuffs: () => { if (runningAction(Intro) || isFlow()) maxStackIncrease(HAVOC_BANE, 3); },
  applyStats: () => { if (runningAction(Lib)) addStat(Stat.Amp, 175); },
});

/** S4: +20% ATK to the team for 20s off the Intro, either Switch or either Flow — granted on every
 *  visit's first cast and again mid-visit, so it never lapses between them. */
const A_LETTER_AND_MY_LONGING = new Buff({
  name: "Xuanling S4: Across the Miles, a Letter and My Longing",
  stats: [[Stat.BonusAtk, 20]],
});
const XL_S4 = new Sequence({
  name: "Xuanling S4: Across the Miles, a Letter and My Longing",
  updateBuffs: () => {
    if (runningAction(Intro) || runningAction(SwitchAzure) || runningAction(SwitchFeather) || isFlow()) applyTeam(A_LETTER_AND_MY_LONGING, 1);
  },
});

/** S5: a once-per-fight cheat death. No formula effect. */
const XL_S5 = new Sequence({ name: "Xuanling S5: Take Wing. Take Wing." });

/** Voice Flux (S6): the target takes 40% more Heavy Attack DMG from her, 30s off her own first Havoc
 *  Bane — permanent. */
const VOICE_FLUX = new Buff({
  name: "Xuanling S6: Voice Flux",
  stats: [[Stat.DamageTaken, 40, Type1.Heavy]],
});
/** Still as Withered Wood (S6): five charges off a Sword Stance Flow, one spent whenever *anyone*
 *  on the team inflicts any of the six Negative Statuses while she is on field — hers, a teammate's,
 *  or a marker's, which is why this reads `anyNegativeStatusInflicted()` rather than her own share.
 *  Watched from updateGlobal so a teammate's turn reaches it; "me" there is her, so `isActive()` is
 *  the "if Yangyang: Xuanling is on the field" the node asks for and the Shadow is queued onto her
 *  by name. The 1s gate is no clock here: five charges are what actually binds. */
const WITHERED_WOOD = new Buff({
  name: "Xuanling S6: Still as Withered Wood", maxStacks: 5,
  updateGlobal: () => {
    // never off its own Shadow's damage: a marker that re-inflicts on whatever hits the target
    // (Chisa's Thread of Bane) would otherwise have each summon trigger the next until the charges
    // ran out, which is the runaway the node's own 1s limiter stops in game
    if (!isActive() || runningAction(ShadowWitheredWood) || !anyNegativeStatusInflicted()) return;
    removeStack(WITHERED_WOOD, 1);
    queueOn(XUANLING_RESONATOR, ShadowWitheredWood);
  },
  until: LifeTime.Outro,
});
/** The window's own 25s cooldown: one Flow a visit opens it, the second doesn't re-arm it. It
 *  outlives the charges it was granted with, which is what makes it — not the spent window — the
 *  piece that has to clear itself on her way out so the next visit opens a fresh one. No `name`:
 *  a cooldown is not a buff she holds, and the charges it gates already have their own row. */
const WITHERED_WOOD_CD = new Buff({ until: LifeTime.Outro });
const XL_S6 = new Sequence({
  name: "Xuanling S6: Let the Azure Keep Its Light",
  updateBuffs: () => {
    // her own Havoc Bane, read as the action's own inflict — Chisa's marker re-sources it onto
    // herself, which `appliedByMe()` would then read as nobody's
    if (applied(HAVOC_BANE)) applyCurrent(VOICE_FLUX, 1);
    // opened after the window above has had its look at this cast, so the Flow that opens it never
    // spends a charge on its own Feather Release
    if (isFlow() && !isHeld(WITHERED_WOOD_CD)) {
      applyCurrent(WITHERED_WOOD, 5);
      applyCurrent(WITHERED_WOOD_CD, 1);
    }
  },
  applyStats: () => { if (runningAction(ShadowWitheredWood)) addStat(Stat.CritRate, 100); },
});

const XL_SEQUENCES = [XL_S1, XL_S2, XL_S3, XL_S4, XL_S5, XL_S6];

/* --------------------------------------------------------------------------- kit and loadout */

/** Unbroken Vow (Inherent Skill): 10% amplification a stack up to 3, 12% a stack — capped, so a
 *  flat 36% — from 4 to 6. Only ever her own damage, which is what holding it locally already
 *  means. The count is read live rather than frozen: the stacks a cast lands are on the target by
 *  the time it hits, which is the same "on hit" the Liberation's own raise-to-max is written as. */
const XUANLING_INHERENT_1 = new Inherent({
  name: "Inherent: Unbroken Vow",
  applyStats: () => {
    const bane = stacksOfEnemy(HAVOC_BANE);
    if (bane === 0) return;
    addStat(Stat.Amp, bane <= 3 ? 10 * bane : 30 + (bane - 3) * 12);
  },
});

/** One Life, One Blade (Inherent Skill), the Windbound half — its other line rides on the
 *  Liberation itself. From `updateGlobal`, so a teammate's own cast is seen; that runs with the
 *  "current" slot already pointed at her, so every read and grant below is hers. */
const XUANLING_INHERENT_2 = new Inherent({
  name: "Inherent: One Life, One Blade",
  updateGlobal: () => {
    if (!applied(HAVOC_BANE) || isHeld(ONE_WITH_THE_WIND)) return;
    if (applyCurrent(WINDBOUND, 1) < 6) return;
    revokeCurrent(WINDBOUND);
    applyCurrent(ONE_WITH_THE_WIND, 1);
  },
});

const XUANLING_TALENTS = new Talent({
  name: "Xuanling: Talents",
  stats: [[Stat.BonusAtk, 12], [Stat.CritRate, 8]],
});

export const XUANLING_RESONATOR = new Resonator({
  name: "Xuanling",
  stats: [[Stat.BaseHp, 11025], [Stat.BaseAtk, 425], [Stat.BaseDef, 1148.89]],
  talent: XUANLING_TALENTS,
  inherent1: XUANLING_INHERENT_1,
  inherent2: XUANLING_INHERENT_2,
  element: Attribute.Havoc,
  weapon: WeaponType.Sword,
  intro: () => Intro,
  outro: () => Outro,
  color: "#4f29e6",
  maxEnergy: 125,
  maxForte1: 100,
  maxForte2: 2,

  /* Feathered Oath is Forte Circuit machinery, which lives on the Resonator rather than a loadout
   * slot of its own. Same trigger as Windbound above and the same `updateGlobal` reason: it counts
   * Havoc Bane inflicted by anyone on the team, her own casts included. */
  updateGlobal: () => { if (applied(HAVOC_BANE)) applyCurrent(FEATHERED_OATH, 1); },

  /* Melody starts a fight full, unlike every other gauge in this engine. */
  combatStart: () => setForte1(100),

  applyStats: () => {
    if (currentAction().node === Node.Normal && forte1() > 0) addStat(Stat.EnergyRegenMult, 20);
  },

});

/* ---------------------------------------------------------------------------------- rotation */

const BA_F1234 = new ActionGroup("Basic - Feather Sword Stance 1234", [BA_F1, BA_F2, BA_F3, BA_F4]);
const HiB123 = new ActionGroup("Forte Basic: Havoc in Bloom 123", [HiB1, HiB2, HiB3]);

/** One visit, in gauge order. The Intro banks a plume, the Azure chain spends the whole Melody
 *  bar, and Sword Stance Flow: Feather refills it and takes the plume to 2 — which opens the
 *  Feather Heavy, and with it Streaming Storm, Feather Fall, Hark the Wind and the Havoc in Bloom
 *  chain, the largest run of Heavy Attack DMG she has. The Liberation then spends the refilled
 *  Melody and banks the next plume, Sword Stance Flow: Azure tops it back to 2 and cashes Voice
 *  upon Voice for the Shadow, and the Azure Heavy spends it on the way out with Bated Breath up.
 *  The echo goes in early rather than at the exit: its four Blades of Thousand Memories are spent
 *  one per Havoc Bane she inflicts, and the four casts that inflict one all come after it. She is
 *  always the team's main DPS, so this covers the loop and there is no opener chain. */
const XUANLING_ROTATION = new Rotation([
  START_3, SwitchFeather, SWAP, // start in feather stance, so the first cast is a switch to Azure

  INTRO, BA_F1234, FlowAzure, ECHO_ONFIELD, HeavyAzure, 
  Lib, FlowFeather, HeavyFeather, FeatherFall, HiB123,
  OUTRO,
]);

const XUANLING_ROTATION_2F = new Rotation([
  INTRO, FlowFeather, ECHO_ONFIELD, HeavyFeather, FeatherFall, HiB123, SwitchAzure,
  Lib, FlowFeather, HeavyFeather, FeatherFall, HiB123,
  OUTRO,
]);

const XUANLING_ROTATION_S1 = new Rotation([
  START_3, HeavyAzure, SwitchFeather, SWAP, // start in feather stance, so the first cast is a switch to Azure

  INTRO, BA_F1234, FlowAzure, ECHO_ONFIELD, HeavyAzure, 
  Lib, FlowFeather, HeavyFeather, FeatherFall, HiB123,
  OUTRO,
]);

const XUANLING_ROTATION_2F_S1 = new Rotation([
  START_3, HeavyAzure, SWAP,

  INTRO, FlowFeather, ECHO_ONFIELD, HeavyFeather, FeatherFall, HiB123, SwitchAzure,
  Lib, FlowFeather, HeavyFeather, FeatherFall, HiB123,
  OUTRO,
]);

const XUANLING_ECHOES = [
  new EchoLoadout(THOUSAND_PUPPET_PAVILION, FEATHERED_TRACE_5PC),
];

export const XUANLING = new Loadout({
  resonator: XUANLING_RESONATOR,
  weapons: [AZURE_OATH, EMERALD_OF_GENESIS, EMERALD_SENTENCE],
  echoLoadouts: XUANLING_ECHOES,
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Havoc3, Mainstat.ATK1),
  substat: substats(Substat.AtkPct, Substat.Heavy, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Heavy, Substat.FlatAtk, Substat.Er),
  rotation: { 0: XUANLING_ROTATION, 1: XUANLING_ROTATION_S1 },
  sequences: XL_SEQUENCES,
});

export const XUANLING_2F = new Loadout({
  resonator: XUANLING_RESONATOR,
  weapons: [AZURE_OATH, EMERALD_OF_GENESIS, EMERALD_SENTENCE],
  echoLoadouts: XUANLING_ECHOES,
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Havoc3, Mainstat.ATK1),
  substat: substats(Substat.AtkPct, Substat.Heavy, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Heavy, Substat.FlatAtk, Substat.Er),
  rotation: { 0: XUANLING_ROTATION_2F, 1: XUANLING_ROTATION_2F_S1 },
  sequences: XL_SEQUENCES,
});