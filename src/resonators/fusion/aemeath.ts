/**
 * Aemeath — a Fusion Sword main DPS whose damage is nearly all Resonance Liberation DMG, built on
 * the Tune Break variants (see tunebreak.ts) and, in her other mode, Fusion Burst.
 *
 * Two forms, walked by the rotation: Aemeath and her Mech share every gauge and stat, each with its
 * own basic chain, heavies and dodge counter. The Sync Strikes, the Seraphic Duets and both
 * liberations flip form as they land. Both heavies are Resonance Liberation DMG.
 *
 * Her loop is the two gauges. **Synchronization Rate** (forte1, 0-200) builds off basics, dodge
 * counters and Sync Strikes, +40 on an Intro and +30 on Overdrive; Stage 4 of either chain opens
 * Seraphic Duo, where a Duet spends 100 of it. **Resonance Rate** (forte2, 0-4) gains 1 per Duet
 * and 1 per Overdrive (2 with Starlume Acceleration, off the Intro). Overdrive opens Heavenfall
 * Edict: Unbound; at 4 Resonance Rate under Unbound she enters Instant Response, where a Charged
 * II heavy is amplified 200% and refills the Synchronization Rate, and then Finale (1789%) spends
 * both gauges whole.
 *
 * The *modes* are `ResonanceMode` gear, one loadout each, the Denia/Lynae shape:
 * - **Tune Rupture**: her listed casts lay Tune Rupture - Shifting; she answers a Rupture break with
 *   Starburst; every Rupture response on the team banks 10 Rupturous Trail on the target, which a
 *   Seraphic Duet spends into its own volley of Tune Rupture DMG. Between the Stars, Silent
 *   Protection, Stardust and the Trail each carry their own effect.
 * - **Fusion Burst**: the same casts lay a Fusion Burst stack; Fusion Trail mirrors every stack the
 *   team lands; the status calculates past 5 stacks at the cap's rung and an empty target gets one
 *   back; a Seraphic Duet calculates it again at the cap's rung without spending the stacks, +10%
 *   multiplier a Trail stack. Between the Stars is 30% x2, the Outro upgrades on Fusion Burst.
 *
 * MVs and energy/concerto/off-tune off nanoka.cc (character 1210, the 3.6+365 static JSON the page
 * fetches) at skill level 10. Per-hit Synchronization Rate off wuwalab (forte_2 x100), which nanoka
 * doesn't list; wuwalab omits Mid-air Attack - Mech entirely, so that cast is left out rather than
 * given an invented gauge value. Form Switch (no damage, auto-casts the new form's Stage 1) isn't an
 * action: a rotation flips form through a Sync Strike, a Duet or a liberation.
 */
import { Stat, Attribute, WeaponType, Type1, Type2, Cast, Node, Scaling } from "../../engine/stats.js";
import { Buff, Debuff, Talent, Inherent, ResonanceMode, Resonator, Loadout, EchoLoadout, Sequence } from "../../engine/gear.js";
import {
  asSource,
  addStat,
  addBuff,
  revokeBuff,
  applyCurrent,
  applyEnemy,
  applied,
  appliedByMember,
  casting,
  currentAction,
  runningAction,
  currentMember,
  currentTeam,
  isHeld,
  frozenStacks,
  applyTeam,
  asActor,
  maxStackIncrease,
  queue,
  queueOn,
  removeStack,
  revokeCurrent,
  revokeEnemy,
  stacksOf,
  stacksOfEnemy,
  forte1,
  forte2,
  setForte1,
  setForte2,
} from "../../engine/context.js";
import { ActionGroup, Action, Rotation, INTRO, ECHO_CANCEL, OUTRO, SWAP, START_3, START_2, START_1 } from "../../engine/rotation.js";
import { TUNE_RUPTURE_SHIFTING, applyRupture, tuneRuptureResponse } from "../../shared/tunebreak.js";
import { FUSION_BURST, FUSION_BURST_ACTIONS } from "../../shared/status.js";
import { EVERBRIGHT_POLESTAR } from "../../weapons/sword.js";
import { EMERALD_OF_GENESIS } from "../../weapons/standard.js";
import { SIGILLUM, TRAILBLAZING_STAR_5PC, CHROMATIC_FOAM_5PC } from "../../echoes/lahairoi.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";

/* =================================================================================== shared */

/* ----------------------------------------------------------------------------------- actions */

function aemeathAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Fusion, scaling: Scaling.Atk, ...def });
}

const TO_MECH = { updateBuffs: () => applyCurrent(MECH_FORM, 1) };
const TO_AEMEATH = { updateBuffs: () => revokeCurrent(MECH_FORM) };
const DUO = { updateBuffs: () => applyCurrent(SERAPHIC_DUO, 1) };

// --- Aemeath form. forte1 is the Synchronization Rate each hit recovers; heavies recover none.
//     The dodge counter carries the hidden +10 Concerto every dodge counter gets (CLAUDE.md).
const ABA1 = aemeathAction("Basic - Aemeath 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 46.35, energy: 0.84, concerto: 1.67, offtune: 2664, forte1: 3.29 });
const ABA2 = aemeathAction("Basic - Aemeath 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 69.46, energy: 1.26, concerto: 2.50, offtune: 3993, forte1: 6.44 });
const ABA3 = aemeathAction("Basic - Aemeath 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 93.15, energy: 1.69, concerto: 3.37, offtune: 5355, forte1: 16.66 });
const ABA4 = aemeathAction("Basic - Aemeath 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 134.59, energy: 2.47, concerto: 4.88, offtune: 7737, forte1: 23.31, ...DUO });
const AHA1 = aemeathAction("Heavy - Aemeath: Charged I", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Liberation, mv: 92.83, energy: 1.68, concerto: 3.34, offtune: 5337 });
const AHA2 = aemeathAction("Heavy - Aemeath: Charged II", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Liberation, mv: 232, energy: 4.18, concerto: 8.35, offtune: 13337 });
const AMA = aemeathAction("Mid-air - Aemeath", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 86.29, energy: 1.55, concerto: 3.10, offtune: 4960, forte1: 11.71 });
const ADC = aemeathAction("Dodge Counter - Aemeath", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 260.15, energy: 3.19, concerto: 16.37, offtune: 10155, forte1: 28.99 });

// --- Mech form
const MBA1 = aemeathAction("Basic - Mech 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 69.60, energy: 1.26, concerto: 2.52, offtune: 4002, forte1: 6.45 });
const MBA2 = aemeathAction("Basic - Mech 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 92.83, energy: 1.68, concerto: 3.34, offtune: 5337, forte1: 9.60 });
const MBA3 = aemeathAction("Basic - Mech 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 116.53, energy: 2.10, concerto: 4.19, offtune: 6702, forte1: 19.88 });
const MBA4 = aemeathAction("Basic - Mech 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 134.59, energy: 2.43, concerto: 4.85, offtune: 7737, forte1: 23.28, ...DUO });
const MHA1 = aemeathAction("Heavy - Mech: Charged I", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Liberation, mv: 92.83, energy: 1.67, concerto: 3.34, offtune: 5336 });
const MHA2 = aemeathAction("Heavy - Mech: Charged II", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Liberation, mv: 232, energy: 4.17, concerto: 8.34, offtune: 13336 });
const MDC = aemeathAction("Dodge Counter - Mech", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 283.49, energy: 3.60, concerto: 17.19, offtune: 11502, forte1: 32.20 });

// --- Resonance Skill: the Sync Strikes, combo follow-ups off Stage 2-4, a heavy or a dodge counter
const ArmamentMerge = aemeathAction("Skill - Sync Strike: Armament Merge", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 134.59, energy: 2.43, concerto: 4.85, offtune: 7737, forte1: 18.29, ...TO_MECH });
const CallOfDawn = aemeathAction("Skill - Sync Strike: Call of Dawn", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 163.27, energy: 2.96, concerto: 5.88, offtune: 9386, forte1: 22.18, ...TO_AEMEATH });

// --- Forte Circuit: the Seraphic Duets, Resonance Liberation DMG off Seraphic Duo, 100
//     Synchronization Rate apiece and +1 Resonance Rate. Overture is Aemeath's, Encore the Mech's.
const DUET = { node: Node.Forte, cast: Cast.Skill, type: Type1.Liberation, forte1: -100, forte2: 1 };
const AmyFSkill = aemeathAction("Forte - Seraphic Duet: Overture", { ...DUET, mv: 357.95, energy: 5.05, concerto: 10.04, offtune: 16004, ...TO_MECH });
const MechFSkill = aemeathAction("Forte - Seraphic Duet: Encore", { ...DUET, mv: 357.9, energy: 5, concerto: 10, offtune: 16000, ...TO_AEMEATH });
const isDuet = (): boolean => runningAction(AmyFSkill) || runningAction(MechFSkill);

// --- Resonance Liberation. Overdrive spends the Energy bar (125), banks 30 Synchronization Rate
//     and a Resonance Rate, and opens Unbound and Stardust Resonance. Finale
//     spends both gauges whole — the caps as its deltas, clamped to them first so it lands on 0;
//     what it closes, each buff closes itself. Both carry their flat 20 Concerto Regen.
const Lib1 = aemeathAction("Liberation - Heavenfall Edict: Overdrive", {
  node: Node.Liberation, cast: Cast.Liberation, cutscene: true, type: Type1.Liberation, mv: 1004.02, concerto: 20, offtune: 84000,
  resetEnergy: true, forte1: 30, forte2: 1,
  updateBuffs: () => { applyCurrent(MECH_FORM, 1); applyCurrent(UNBOUND, 1); applyCurrent(STARDUST, 2); },
});
const Lib2 = aemeathAction("Liberation - Heavenfall Edict: Finale", {
  node: Node.Liberation, cast: Cast.Liberation, cutscene: true, type: Type1.Liberation, mv: 1789.29, energy: 20, concerto: 20, offtune: 84000, forte1: -200, forte2: -4,
  updateBuffs: () => revokeCurrent(MECH_FORM),
});

// --- Intros, one per form: 40 Synchronization Rate and Starlume Acceleration
const INTRO_DEF = { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, energy: 10, concerto: 10, forte1: 40, updateBuffs: () => applyCurrent(STARLUME, 1) };
const Intro = aemeathAction("Intro - Songs Across the Universe", { ...INTRO_DEF, mv: 134.58, offtune: 7737 });
const EIntro = aemeathAction("Intro - Debut of Meteoric Radiance", { ...INTRO_DEF, mv: 163.25, offtune: 9385 });

/** Silent Protection: everyone but her, and "casting this skill resets the effects above" — so a
 *  member's old one comes off before the fresh grant rather than stacking. */
const Outro = aemeathAction("Outro - Silent Protection", {
  cast: Cast.Outro, concerto: -100, swapOut: true,
  updateBuffs: () => {
    const buff = isHeld(MODE_BURST) ? SILENT_PROTECTION_BURST : SILENT_PROTECTION_RUPTURE;
    for (const m of currentTeam().slots) {
      if (!m.resonator || m.resonator === AEMEATH_RESONATOR) continue;
      revokeBuff(m.resonator, buff);
      addBuff(m.resonator, buff, 1);
    }
  },
});

/* ------------------------------------------------------------------------------------- buffs */

/** Which form she is in — picks the Intro. Set by every cast that switches her. */
const MECH_FORM = new Buff({ name: "Aemeath: Mech Form" });

const SERAPHIC_DUO = new Buff({
  name: "Aemeath: Seraphic Duo",
  updateBuffs: () => {
    if (runningAction(Outro)) revokeCurrent(SERAPHIC_DUO);
  },
});

/** Starlume Acceleration: 15s off the Intro; Overdrive restores one more Resonance Rate and ends
 *  it. Short, so gone after the outro if she never cast it. */
const STARLUME = new Buff({
  name: "Aemeath: Starlume Acceleration",
  applyStats: () => { if (runningAction(Lib1)) addStat(Stat.AddForte2, 1); },
  convertStats: () => { if (runningAction(Lib1) || casting(Cast.Outro)) revokeCurrent(STARLUME); },
});

/** Stardust Resonance: 30s off Overdrive, enhancing the next two Seraphic Duets — held as two
 *  charges. In Tune Rupture the Duet's volley is 10 instances rather than 5 (the second five as
 *  AddMv, so the Trail's multiplier covers them); in Fusion Burst the Duet's own Fusion Burst is
 *  +200% multiplier, on top of the Trail's. "The next Seraphic Duet cast within 30s after
 *  Overdrive doesn't consume Rupturous Trail / Fusion Trail" is the Duet at both charges, so the
 *  charge is spent after the action, once the Trail has read it. */
const STARDUST = new Buff({
  name: "Aemeath: Stardust Resonance", maxStacks: 2,
  applyStats: () => {
    if (runningAction(Volley)) addStat(Stat.AddMv, 109.35 * 5);
    if (!runningAction(DuetBurst)) return;
    addStat(Stat.MulMv, 200);
    // S2 raises the Stardust Duet's own Fusion Burst multiplier to 400% — the 200 over it is its own
    if (isHeld(AE_S2)) asSource(AE_S2, () => addStat(Stat.MulMv, 200));
  },
  afterAction: () => { if (runningAction(Volley) || runningAction(DuetBurst)) removeStack(STARDUST, 1); },
});

/** Heavenfall Edict: Unbound — 60s off Overdrive, until Finale. The first action that leaves the
 *  Resonance Rate at its cap of 4 while this is held enters Instant Response. */
const UNBOUND = new Buff({
  name: "Aemeath: Heavenfall Edict - Unbound",
  convertStats: () => { if (runningAction(Lib2)) revokeCurrent(UNBOUND); },
  afterAction: () => { if (forte2() >= 4) applyCurrent(INSTANT_RESPONSE, 1); },
});

/** Instant Response: under Unbound a Charged II restores the whole Synchronization Rate (200 — the
 *  cap, clamped by AEMEATH_RESONATOR's own afterAction). Either Charged II or Finale ends it. */
const INSTANT_RESPONSE = new Buff({
  name: "Aemeath: Instant Response",
  applyStats: () => {
    if ((runningAction(AHA2) || runningAction(MHA2)) && isHeld(UNBOUND)) addStat(Stat.AddForte1, 200);
  },
  convertStats: () => {
    if (runningAction(AHA2) || runningAction(MHA2) || runningAction(Lib2)) revokeCurrent(INSTANT_RESPONSE);
  },
});

/* ---------------------------------------------------------------------------- kit and talents */

/** Before All Sounds: in Instant Response, both forms' heavies are amplified 200%. */
const AE_INHERENT_1 = new Inherent({
  name: "Inherent: Before All Sounds",
  // Brilliance (S1) inherits every Instant Response effect, this one included
  applyStats: () => { if ((isHeld(INSTANT_RESPONSE) || isHeld(BRILLIANCE)) && casting(Cast.Heavy)) addStat(Stat.Amp, 200); },
});

const AEMEATH_TALENTS = new Talent({
  name: "Aemeath: Talents",
  stats: [[Stat.BonusAtk, 12], [Stat.CritRate, 8]],
});

/** Between the Stars' own grant, from `updateGlobal` so a teammate's own cast is seen — which runs
 *  with the "current" slot pointed at her, so the actor is read off the team (a queued response
 *  lands on the slot that queued it, so Mornye's Particle Jet counts Mornye). Both modes' payout
 *  buffs are declared further down; only this hook's own body reads them, so it never runs before
 *  they exist. */
const AE_INHERENT_2 = new Inherent({
  name: "Inherent: Between the Stars",
  updateGlobal: () => {
    const actor = currentTeam().slot;
    const slot = 1 << currentTeam().active;
    if (isHeld(MODE_BURST)) {
      if (!appliedByMember(FUSION_BURST, actor) || (stacksOf(BETWEEN_THE_STARS_BURST) & slot) !== 0) return;
      applyCurrent(BETWEEN_THE_STARS_BURST, slot);
      return;
    }
    if (!appliedByMember(TUNE_RUPTURE_SHIFTING, actor) && currentAction().type1 !== Type1.Rupture) return;
    if ((stacksOf(BETWEEN_THE_STARS_RUPTURE) & slot) !== 0) return;
    applyCurrent(BETWEEN_THE_STARS_RUPTURE, slot);
  },
});

export const AEMEATH_RESONATOR = new Resonator({
  name: "Aemeath",
  talent: AEMEATH_TALENTS,
  inherent1: AE_INHERENT_1,
  inherent2: AE_INHERENT_2,
  element: Attribute.Fusion,
  weapon: WeaponType.Sword,
  intro: () => (stacksOf(MECH_FORM) ? EIntro : Intro),
  outro: () => Outro,
  color: "#ff4680",
  maxEnergy: 125,
  maxForte1: 200,
  maxForte2: 4,

  constantStats: () => {
    addStat(Stat.BaseHp, 11025); addStat(Stat.BaseAtk, 425); addStat(Stat.BaseDef, 1148.88);
    // the flat 10 every tune-break-era resonator carries (nanoka's own weakness_mastery)
    addStat(Stat.Tbb, 10);
  },
});

/* --------------------------------------------------------------------------------- sequences */

/** Instant Response - Brilliance (S1): held from the start of the fight — she is out of combat and
 *  casting nothing for the 4s it asks for — and it inherits Instant Response outright, so the
 *  amplification above and S1's own Crit. DMG both read it. Outside Unbound a Charged II takes the
 *  100 Synchronization Rate and ends it, the same way Instant Response is spent by one. */
const BRILLIANCE = new Buff({
  name: "Aemeath S1: Instant Response - Brilliance",
  applyStats: () => {
    if ((runningAction(AHA2) || runningAction(MHA2)) && !isHeld(UNBOUND)) addStat(Stat.AddForte1, 100);
  },
  convertStats: () => { if (runningAction(AHA2) || runningAction(MHA2) || runningAction(Lib2)) revokeCurrent(BRILLIANCE); },
});
/** S1: +300% Crit. DMG on either form's heavy in Instant Response, Brilliance included, and the
 *  Brilliance window above. Sealed Trail is a kill effect, and this calculator fights one boss. */
const AE_S1 = new Sequence({
  name: "Aemeath S1: Gilded Glimmer of the First Dawn",
  combatStart: () => applyCurrent(BRILLIANCE, 1),
  applyStats: () => {
    if ((isHeld(INSTANT_RESPONSE) || isHeld(BRILLIANCE)) && casting(Cast.Heavy)) addStat(Stat.CritDmg, 300);
  },
});

/** S2: both Duets at x2 of their multiplier — no sequence row on nanoka, so multiplicative. In
 *  Tune Rupture the volley ramps 20% an instance to a cap of 5, which over its own 5 instances
 *  averages 40% and over Stardust's 10 averages 70%; the mode's other two lines are paid by
 *  Stardust and Fusion Trail themselves. The kill trigger is out of scope. */
const AE_S2 = new Sequence({
  name: "Aemeath S2: Downy Notes of Snowfluff",
  applyStats: () => {
    if (isDuet()) addStat(Stat.MulMv, 100);
    if (runningAction(Volley)) addStat(Stat.MulMv, isHeld(STARDUST) ? 70 : 40);
  },
});

/** S3: Finale at x2 and Overdrive at x1.4 — again no sequence rows, so multiplicative. The Instant
 *  Response heavies' own inflict and the rewritten Between the Stars are paid where each already
 *  lives (`inflicts()` and the two payout buffs). */
const AE_S3 = new Sequence({
  name: "Aemeath S3: Fervor Sightly Burns Bright as New",
  applyStats: () => {
    if (runningAction(Lib2)) addStat(Stat.MulMv, 100);
    if (runningAction(Lib1)) addStat(Stat.MulMv, 40);
  },
});

/** S4: +20% All-Attribute DMG Bonus to the team off either Intro, either Sync Strike or either
 *  Duet — 30s, so permanent. */
const ETHEREAL_WALTZ = new Buff({
  name: "Aemeath S4: Ethereal Waltz on Binary Tides",
  stats: [[Stat.DmgBonus, 20]],
});
const AE_S4 = new Sequence({
  name: "Aemeath S4: Ethereal Waltz on Binary Tides",
  updateBuffs: () => {
    if (runningAction(Intro) || runningAction(EIntro) || runningAction(ArmamentMerge) || runningAction(CallOfDawn) || isDuet()) applyTeam(ETHEREAL_WALTZ, 1);
  },
});

/** S5: a kill-reset on Starflux and a once-per-fight cheat death. No formula effect. */
const AE_S5 = new Sequence({ name: "Aemeath S5: Voyage to the Astral Shore" });

/** S6: the target takes 40% more Resonance Liberation DMG from her — which is what her heavies and
 *  Duets deal too; both Trails cap at 60 and double what the Forte Circuit lays (in the modes
 *  themselves); and each mode's status damage crits at a fixed 80%/275%. Tune Rupture DMG carries
 *  no Type2 tag to scope that crit to (damage.ts), so hers is the factor it averages out to
 *  instead: 0.2 + 0.8 x 2.75 = 2.4, written as Total Damage — the one term a tune row multiplies
 *  by that a kit can reach, where a motion-value bonus would only sum with the Trail's own. */
const AE_S6 = new Sequence({
  name: "Aemeath S6: A Zephyr-Kissed Journey to You",
  // her Resonance Mode isn't equipped yet at combatStart, so both standing lines are asserted from
  // updateGlobal instead — the first action of the fight, whoever casts it, and `maxStackIncrease`
  // takes one raise a source however often it is called
  updateGlobal: () => {
    if (!isHeld(MODE_BURST)) { maxStackIncrease(RUPTUROUS_TRAIL, 30); return; }
    maxStackIncrease(FUSION_TRAIL, 30);
    // the fixed crit itself, written straight out rather than through a buff of its own: onto the
    // cast being evaluated (`asActor`, since this hook runs as her whoever is up), so a burst that
    // calculates on a teammate's turn crits the same way hers does. Scoped to Fusion Burst, which
    // is the only crit a dot row reads at all (damage.ts), so every other action reads past it.
    asActor(() => {
      addStat(Stat.CritRate, 80, Type2.FusionBurst);
      addStat(Stat.CritDmg, 275, Type2.FusionBurst);
    });
  },
  // the Duet's own 10 stacks, laid from here rather than from the Trail: an empty Trail is not held
  // and would run no hook of its own, which is exactly when the first Duet of a visit lands
  updateDebuffs: () => {
    if (!isDuet()) return;
    applyEnemy(isHeld(MODE_BURST) ? FUSION_TRAIL : RUPTUROUS_TRAIL, 10);
  },
  applyStats: () => {
    addStat(Stat.DamageTaken, 40, Type1.Liberation);
    if (runningAction(Volley) || runningAction(Starburst)) addStat(Stat.TotalDmg, 140);
  },
});

const AE_SEQUENCES = [AE_S1, AE_S2, AE_S3, AE_S4, AE_S5, AE_S6];

/* ======================================================================= Tune Rupture mode */

/** Her answer to a Rupture break, queued by the engine's own break (MODE_RUPTURE) rather than
 *  played — active, like every Tune Break response (see Mornye's Particle Jet). The 8s per-target
 *  cooldown is the Interfered window itself: no second break lands inside it. */
const Starburst = aemeathAction("Tune Rupture Response - Starburst", { node: Node.Forte, type: Type1.Rupture, mv: 596.43, scaling: Scaling.Tune });

/** The Duet's own Tune Rupture DMG: 5 instances of 109.35%, queued off the Duet. Stardust makes it
 *  10 and the Rupturous Trail multiplies it — each from its own buff. */
const Volley = aemeathAction("Forte - Seraphic Duet: Tune Rupture", { node: Node.Forte, type: Type1.Rupture, mv: 109.35 * 5, scaling: Scaling.Tune });

/** Rupturous Trail: 10 stacks on the target every time a resonator on the team responds to Tune
 *  Rupture - Interfered, cap 30, 30s (standing). The Duet's volley is +4% multiplier a stack and
 *  spends them all — unless it is the first Stardust Duet (both charges up), which pays and
 *  leaves them. */
const RUPTUROUS_TRAIL = new Debuff({
  name: "Aemeath: Rupturous Trail", maxStacks: 30,
  applyStats: () => { if (runningAction(Volley)) addStat(Stat.MulMv, 4 * frozenStacks()); },
  convertStats: () => { if (runningAction(Volley) && stacksOf(STARDUST) !== 2) revokeEnemy(RUPTUROUS_TRAIL); },
});

/** How many distinct team slots Between the Stars has counted — one bit per slot, the way
 *  Hiyuki's Snow Rust holds it, so the tier is how many of the three bits are up. */
const betweenTheStars = (): number => {
  const slots = frozenStacks();
  return (slots & 1) + ((slots >> 1) & 1) + ((slots >> 2) & 1);
};

/** Between the Stars, Tune Rupture: +20% Crit. DMG the first time each resonator on the team lays
 *  a Tune Rupture - Shifting or deals Tune Rupture DMG, cap 3; at 3, Finale is amplified 25%.
 *  "Each Resonator can only trigger this effect once" is carried by the stacks themselves: slot 1
 *  banks 1, slot 2 banks 2, slot 3 banks 4, so what is held is the set of who has already paid. */
const BETWEEN_THE_STARS_RUPTURE = new Buff({
  name: "Inherent: Between the Stars (rupture)", maxStacks: 1 + 2 + 4,
  display: () => `Inherent: Between the Stars (rupture) x${betweenTheStars()}`,
  // S3 replaces the tiering outright: a flat 60% off the first inflict, and Finale amplified with it
  applyStats: () => {
    const tiers = betweenTheStars();
    if (isHeld(AE_S3)) asSource(AE_S3, () => addStat(Stat.CritDmg, 60));
    else addStat(Stat.CritDmg, 20 * tiers);
    if (!runningAction(Lib2)) return;
    if (tiers >= 3) addStat(Stat.Amp, 25);
    else if (isHeld(AE_S3)) asSource(AE_S3, () => addStat(Stat.Amp, 25));
  },
});

/** Silent Protection (Outro), Tune Rupture: everyone but her gets +10% All DMG Amplification for
 *  20s, 20% once they lay a Tune Rupture - Shifting of their own — stack 2 is that upgraded state.
 *  A 20s team buff, so lost on her next Intro. */
const SILENT_PROTECTION_RUPTURE = new Buff({
  name: "Aemeath: Outro", maxStacks: 2,
  display: () => (frozenStacks() === 2 ? "Aemeath: Outro (rupture)" : "Aemeath: Outro"),
  updateBuffs: () => { if (appliedByMember(TUNE_RUPTURE_SHIFTING, currentMember())) applyCurrent(SILENT_PROTECTION_RUPTURE, 1); },
  applyStats: () => addStat(Stat.Amp, frozenStacks() === 2 ? 20 : 10),
});

/** The casts that lay the mode's Shifting (or, in the other mode, its Fusion Burst). */
const inflicts = (): boolean =>
  runningAction(ABA3) || runningAction(ABA4) || runningAction(MBA3) || runningAction(MBA4) || runningAction(ArmamentMerge) || runningAction(CallOfDawn) || runningAction(Intro) || runningAction(EIntro)
  // S3: in Instant Response either form's heavy lays it too
  || (isHeld(AE_S3) && isHeld(INSTANT_RESPONSE) && casting(Cast.Heavy));

/** Held on her slot, so its updateGlobal runs as her whoever is acting: the Starburst response and
 *  the Trail are hers. A response is any Rupture-typed hit that isn't her own Duet volley. */
const MODE_RUPTURE = new ResonanceMode({
  name: "Resonance Mode - Tune Rupture",
  updateDebuffs: () => { if (inflicts()) applyRupture(); },
  updateGlobal: () => {
    tuneRuptureResponse(Starburst);
    const a = currentAction();
    if (a.type1 === Type1.Rupture && !runningAction(Volley)) applyEnemy(RUPTUROUS_TRAIL, isHeld(AE_S6) ? 20 : 10);
  },
  updateBuffs: () => { if (isDuet()) queue(Volley); },
});

/* ---------------------------------------------------------------------------------- rotation */

const ABA234 = new ActionGroup("Basic - Aemeath 234", [ABA2, ABA3, ABA4]);
const MBA234 = new ActionGroup("Basic - Mech 234", [MBA2, MBA3, MBA4]);

/** Intro (+40 Rate, Starlume) into Stage 3-4, Overdrive (Rate 2 with Starlume — Unbound, Stardust),
 *  the Mech chain into the free Encore, the Aemeath chain into Overture (Rate 4, Instant Response),
 *  the Charged II to refill the gauge, the echo, Finale and out. Never the team's lead. */
const ABA34 = new ActionGroup("Basic - Aemeath 34", [ABA3, ABA4]);

const AE_ROTATION = new Rotation([
  INTRO, ABA34, Lib1,
  MBA234, MechFSkill,
  ABA234, AmyFSkill,
  MHA2, ECHO_CANCEL, Lib2,
  OUTRO,
]);

// S1: Brilliance stands at the opening, so the Charged II ahead of Overdrive is amplified and
// hands back the whole 100 Synchronization Rate it would otherwise take a chain to rebuild
const AE_ROTATION_S1 = new Rotation([
  START_1, START_2, START_3, AHA2, SWAP,

  INTRO, ABA34, Lib1,
  MBA234, MechFSkill,
  ABA234, AmyFSkill,
  MHA2, ECHO_CANCEL, Lib2,
  OUTRO,
]);

export const AEMEATH_RUPTURE = new Loadout({
  resonator: AEMEATH_RESONATOR,
  weapons: [EVERBRIGHT_POLESTAR, EMERALD_OF_GENESIS],
  echoLoadouts: [new EchoLoadout(SIGILLUM, TRAILBLAZING_STAR_5PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Fusion3, Mainstat.ATK1),
  substat: substats(Substat.AtkPct, Substat.Liberation, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Liberation, Substat.FlatAtk, Substat.Er),
  rotation: { 0: AE_ROTATION, 1: AE_ROTATION_S1 },
  sequences: AE_SEQUENCES,
  mode: MODE_RUPTURE,
});

/* ======================================================================= Fusion Burst mode */

/** The Duet's own Fusion Burst: the status calculated at the target's max-stack rung without
 *  spending the stacks — a dot hit like the ladder's own, carrying no motion value of its own; the
 *  rung is added by the status itself (status.ts's own FUSION_BURST, so the value is sourced to
 *  it and reads the fight's cap), the way Hsin's Heart of Thunder reads Electro Flare. The Trail
 *  and Stardust multiply it from their own buffs. */
const DuetBurst = new Action("Forte - Seraphic Duet: Fusion Burst", {
  element: Attribute.Fusion, type: Type1.Status, type2: Type2.FusionBurst, scaling: Scaling.Dot, mv: 0,
});

/** Fusion Trail: a stack for every Fusion Burst stack anyone on the team lands, cap 30, 30s
 *  (standing). The Duet's Fusion Burst is +10% multiplier a stack and spends them all — unless it
 *  is the first Stardust Duet (both charges up), which pays and leaves them. */
const FUSION_TRAIL = new Debuff({
  name: "Aemeath: Fusion Trail", maxStacks: 30,
  applyStats: () => {
    if (!runningAction(DuetBurst)) return;
    // the count is read out here: inside `asSource` the "current" gear is the node, not this trail
    const trail = frozenStacks();
    addStat(Stat.MulMv, 10 * trail);
    // S2 pays 15% a stack rather than 10% — the 5 more a stack is the node's own
    if (isHeld(AE_S2)) asSource(AE_S2, () => addStat(Stat.MulMv, 5 * trail));
  },
  convertStats: () => { if (runningAction(DuetBurst) && stacksOf(STARDUST) !== 2) revokeEnemy(FUSION_TRAIL); },
});

/** Between the Stars, Fusion Burst: +30% Crit. DMG the first time each resonator on the team lays
 *  Fusion Burst, cap 2; at 2, Finale is amplified 25%. The same per-slot bits as the Rupture one. */
const BETWEEN_THE_STARS_BURST = new Buff({
  name: "Inherent: Between the Stars (burst)", maxStacks: 1 + 2 + 4,
  display: () => `Inherent: Between the Stars (burst) x${Math.min(2, betweenTheStars())}`,
  applyStats: () => {
    const n = Math.min(2, betweenTheStars());
    if (isHeld(AE_S3)) asSource(AE_S3, () => addStat(Stat.CritDmg, 60));
    else addStat(Stat.CritDmg, 30 * n);
    if (!runningAction(Lib2)) return;
    if (n >= 2) addStat(Stat.Amp, 25);
    else if (isHeld(AE_S3)) asSource(AE_S3, () => addStat(Stat.Amp, 25));
  },
});

/** Silent Protection (Outro), Fusion Burst: everyone but her gets +10% All DMG Amplification for
 *  20s, 20% once they lay Fusion Burst of their own — stack 2 is that upgraded state. */
const SILENT_PROTECTION_BURST = new Buff({
  name: "Aemeath: Outro", maxStacks: 2,
  display: () => (frozenStacks() === 2 ? "Aemeath: Outro (burst)" : "Aemeath: Outro"),
  updateBuffs: () => { if (appliedByMember(FUSION_BURST, currentMember())) applyCurrent(SILENT_PROTECTION_BURST, 1); },
  applyStats: () => addStat(Stat.Amp, frozenStacks() === 2 ? 20 : 10),
});

/** Held on her slot, so its updateGlobal runs as her whoever is acting. Her listed casts lay a
 *  stack; every stack the team lands mirrors into Fusion Trail; and the mode's own upkeep — past 5
 *  stacks the status calculates at the cap's rung on whoever is on field (the ladder's own rule,
 *  status.ts) and clears, and a target left on 0 gets a stack back, hers. The fight opens on that
 *  stack too. A Duet queues its own calculation. */
const MODE_BURST = new ResonanceMode({
  name: "Resonance Mode - Fusion Burst",
  updateDebuffs: () => { if (inflicts()) applyEnemy(FUSION_BURST, 1); },
  updateGlobal: () => {
    const team = currentTeam();
    if (stacksOfEnemy(FUSION_BURST) > 5) {
      queueOn(team.slot.resonator!, FUSION_BURST_ACTIONS[team.enemyMax(FUSION_BURST)]!);
      revokeEnemy(FUSION_BURST);
    }
    if (stacksOfEnemy(FUSION_BURST) === 0) {
      applyEnemy(FUSION_BURST, 1);
    }
    const landed = applied(FUSION_BURST);
    if (landed > 0) applyEnemy(FUSION_TRAIL, isHeld(AE_S6) ? landed * 2 : landed);
  },
  updateBuffs: () => { if (isDuet()) queue(DuetBurst); },
});

export const AEMEATH_BURST = new Loadout({
  resonator: AEMEATH_RESONATOR,
  weapons: [EVERBRIGHT_POLESTAR, EMERALD_OF_GENESIS],
  echoLoadouts: [
    new EchoLoadout(SIGILLUM, TRAILBLAZING_STAR_5PC),
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Fusion3, Mainstat.ATK1),
  substat: substats(Substat.AtkPct, Substat.Liberation, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Liberation, Substat.FlatAtk, Substat.Er),
  rotation: { 0: AE_ROTATION, 1: AE_ROTATION_S1 },
  sequences: AE_SEQUENCES,
  mode: MODE_BURST,
});
