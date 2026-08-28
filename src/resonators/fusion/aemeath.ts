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
import {
  Buff, Debuff, Talent, Inherent, ResonanceMode, Resonator, Loadout, EchoLoadout, Action, ActionGroup, Stat,
  Attribute, WeaponType, Type1, Type2, Cast, Node, Scaling, addStat, addBuff, revokeBuff, applyCurrent, applyEnemy,
  applied, appliedByMember, casting, currentAction, currentMember, currentTeam, isHeld, frozenStacks, queue, queueOn,
  removeStack, revokeCurrent, revokeEnemy, stacksOf, stacksOfEnemy, forte1, forte2, setForte1, setForte2,
} from "../../engine/kit.js";
import { Rotation, INTRO, ECHO_CANCEL, OUTRO_NEXT } from "../../engine/rotation.js";
import { TUNE_RUPTURE_SHIFTING, applyRupture, tuneRuptureResponse } from "../../shared/tunebreak.js";
import { FUSION_BURST, FUSION_BURST_ACTIONS } from "../../shared/status.js";
import { EVERBRIGHT_POLESTAR } from "../../weapons/sword.js";
import { EMERALD_OF_GENESIS } from "../../weapons/standard.js";
import { SIGILLUM, TRAILBLAZING_STAR_5PC, TRAILBLAZING_STAR_2PC, CHROMATIC_FOAM_5PC, CHROMATIC_FOAM_2PC } from "../../echoes/lahairoi.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { chem } from "../../shared/substats.js";

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
const AMA = aemeathAction("Basic - Aemeath (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 86.29, energy: 1.55, concerto: 3.10, offtune: 4960, forte1: 11.71 });
const ADC = aemeathAction("Basic - Aemeath (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 260.15, energy: 3.19, concerto: 16.37, offtune: 10155, forte1: 28.99 });

// --- Mech form
const MBA1 = aemeathAction("Basic - Mech 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 69.60, energy: 1.26, concerto: 2.52, offtune: 4002, forte1: 6.45 });
const MBA2 = aemeathAction("Basic - Mech 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 92.83, energy: 1.68, concerto: 3.34, offtune: 5337, forte1: 9.60 });
const MBA3 = aemeathAction("Basic - Mech 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 116.53, energy: 2.10, concerto: 4.19, offtune: 6702, forte1: 19.88 });
const MBA4 = aemeathAction("Basic - Mech 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 134.59, energy: 2.43, concerto: 4.85, offtune: 7737, forte1: 23.28, ...DUO });
const MHA1 = aemeathAction("Heavy - Mech: Charged I", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Liberation, mv: 92.83, energy: 1.67, concerto: 3.34, offtune: 5336 });
const MHA2 = aemeathAction("Heavy - Mech: Charged II", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Liberation, mv: 232, energy: 4.17, concerto: 8.34, offtune: 13336 });
const MDC = aemeathAction("Basic - Mech (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 283.49, energy: 3.60, concerto: 17.19, offtune: 11502, forte1: 32.20 });

// --- Resonance Skill: the Sync Strikes, combo follow-ups off Stage 2-4, a heavy or a dodge counter
const ArmamentMerge = aemeathAction("Skill - Sync Strike: Armament Merge", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 134.59, energy: 2.43, concerto: 4.85, offtune: 7737, forte1: 18.29, ...TO_MECH });
const CallOfDawn = aemeathAction("Skill - Sync Strike: Call of Dawn", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 163.27, energy: 2.96, concerto: 5.88, offtune: 9386, forte1: 22.18, ...TO_AEMEATH });

// --- Forte Circuit: the Seraphic Duets, Resonance Liberation DMG off Seraphic Duo, 100
//     Synchronization Rate apiece and +1 Resonance Rate. Overture is Aemeath's, Encore the Mech's.
const DUET = { node: Node.Forte, cast: Cast.Skill, type: Type1.Liberation, forte1: -100, forte2: 1 };
const AmyFSkill = aemeathAction("Forte - Seraphic Duet: Overture", { ...DUET, mv: 357.95, energy: 5.05, concerto: 10.04, offtune: 16004, ...TO_MECH });
const MechFSkill = aemeathAction("Forte - Seraphic Duet: Encore", { ...DUET, mv: 357.9, energy: 5, concerto: 10, offtune: 16000, ...TO_AEMEATH });
const isDuet = (a: Action): boolean => a === AmyFSkill || a === MechFSkill;

// --- Resonance Liberation. Overdrive spends the Energy bar (125), banks 30 Synchronization Rate
//     and a Resonance Rate, and opens Unbound and Stardust Resonance. Finale
//     spends both gauges whole — the caps as its deltas, clamped to them first so it lands on 0;
//     what it closes, each buff closes itself. Both carry their flat 20 Concerto Regen.
const Lib1 = aemeathAction("Liberation - Heavenfall Edict: Overdrive", {
  node: Node.Liberation, cast: Cast.Liberation, type: Type1.Liberation, mv: 1004.02, concerto: 20, offtune: 84000,
  resetEnergy: true, forte1: 30, forte2: 1,
  updateBuffs: () => { applyCurrent(MECH_FORM, 1); applyCurrent(UNBOUND, 1); applyCurrent(STARDUST, 2); },
});
const Lib2 = aemeathAction("Liberation - Heavenfall Edict: Finale", {
  node: Node.Liberation, cast: Cast.Liberation, type: Type1.Liberation, mv: 1789.29, energy: 20, concerto: 20, offtune: 84000, forte1: -200, forte2: -4,
  updateBuffs: () => { 
    if (forte1() > 200) setForte1(200); 
    if (forte2() > 4) setForte2(4); 
    revokeCurrent(MECH_FORM); 
  },
});

// --- Intros, one per form: 40 Synchronization Rate and Starlume Acceleration
const INTRO_DEF = { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, energy: 10, concerto: 10, forte1: 40, updateBuffs: () => applyCurrent(STARLUME, 1) };
const Intro = aemeathAction("Intro - Songs Across the Universe", { ...INTRO_DEF, mv: 134.58, offtune: 7737 });
const EIntro = aemeathAction("Intro - Debut of Meteoric Radiance", { ...INTRO_DEF, mv: 163.25, offtune: 9385 });

/** Silent Protection: everyone but her, and "casting this skill resets the effects above" — so a
 *  member's old one comes off before the fresh grant rather than stacking. */
const Outro = aemeathAction("Outro - Silent Protection", {
  cast: Cast.Outro, concerto: -100, active: false,
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
    if (currentAction() === Outro) revokeCurrent(SERAPHIC_DUO);
  },
});

/** Starlume Acceleration: 15s off the Intro; Overdrive restores one more Resonance Rate and ends
 *  it. Short, so gone after the outro if she never cast it. */
const STARLUME = new Buff({
  name: "Aemeath: Starlume Acceleration",
  applyStats: () => { if (currentAction() === Lib1) addStat(Stat.AddForte2, 1); },
  convertStats: () => { if (currentAction() === Lib1 || casting(Cast.Outro)) revokeCurrent(STARLUME); },
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
    const a = currentAction();
    if (a === Volley) addStat(Stat.AddMv, 109.35 * 5);
    if (a === DuetBurst) addStat(Stat.MulMv, 200);
  },
  afterAction: () => { const a = currentAction(); if (a === Volley || a === DuetBurst) removeStack(STARDUST, 1); },
});

/** Heavenfall Edict: Unbound — 60s off Overdrive, until Finale. The first action that leaves the
 *  Resonance Rate at its cap of 4 while this is held enters Instant Response. */
const UNBOUND = new Buff({
  name: "Aemeath: Heavenfall Edict - Unbound",
  convertStats: () => { if (currentAction() === Lib2) revokeCurrent(UNBOUND); },
  afterAction: () => { if (forte2() >= 4) applyCurrent(INSTANT_RESPONSE, 1); },
});

/** Instant Response: under Unbound a Charged II restores the whole Synchronization Rate (200 — the
 *  cap, clamped by AEMEATH_RESONATOR's own afterAction). Either Charged II or Finale ends it. */
const INSTANT_RESPONSE = new Buff({
  name: "Aemeath: Instant Response",
  applyStats: () => {
    const a = currentAction();
    if ((a === AHA2 || a === MHA2) && isHeld(UNBOUND)) addStat(Stat.AddForte1, 200);
  },
  convertStats: () => {
    const a = currentAction();
    if (a === AHA2 || a === MHA2 || a === Lib2) revokeCurrent(INSTANT_RESPONSE);
  },
});

/* ---------------------------------------------------------------------------- kit and talents */

/** Before All Sounds: in Instant Response, both forms' heavies are amplified 200%. */
const AE_INHERENT_1 = new Inherent({
  name: "Aemeath: Before All Sounds",
  applyStats: () => { if (isHeld(INSTANT_RESPONSE) && casting(Cast.Heavy)) addStat(Stat.Amp, 200); },
});

const AEMEATH_TALENTS = new Talent({
  name: "Aemeath: Talents",
  constantStats: () => { addStat(Stat.BonusAtk, 12); addStat(Stat.CritRate, 8); },
});

export const AEMEATH_RESONATOR = new Resonator({
  name: "Aemeath",
  element: Attribute.Fusion,
  weapon: WeaponType.Sword,
  intro: () => (stacksOf(MECH_FORM) ? EIntro : Intro),
  outro: () => Outro,
  color: "#ff4680",
  maxEnergy: 125,

  constantStats: () => {
    addStat(Stat.BaseHp, 11025); addStat(Stat.BaseAtk, 425); addStat(Stat.BaseDef, 1148.88);
    // the flat 10 every tune-break-era resonator carries (nanoka's own weakness_mastery)
    addStat(Stat.Tbb, 10);
  },
  // the two gauge caps — the engine floors a gauge at 0 but leaves the ceiling to the kit
  afterAction: () => {
    if (forte1() > 200) setForte1(200);
    if (forte2() > 4) setForte2(4);
  },
});

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
  applyStats: () => { if (currentAction() === Volley) addStat(Stat.MulMv, 4 * frozenStacks()); },
  convertStats: () => { if (currentAction() === Volley && stacksOf(STARDUST) !== 2) revokeEnemy(RUPTUROUS_TRAIL); },
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
  name: "Aemeath: Between the Stars (rupture)", maxStacks: 1 + 2 + 4,
  display: () => `Aemeath: Between the Stars (rupture) x${betweenTheStars()}`,
  applyStats: () => {
    addStat(Stat.CritDmg, 20 * betweenTheStars());
    if (betweenTheStars() >= 3 && currentAction() === Lib2) addStat(Stat.Amp, 25);
  },
});

/** Its grant, from `updateGlobal` so a teammate's own cast is seen — which runs with the "current"
 *  slot pointed at her, so the actor is read off the team (a queued response lands on the slot
 *  that queued it, so Mornye's Particle Jet counts Mornye). */
const AE_INHERENT_2 = new Inherent({
  name: "Aemeath: Between the Stars",
  updateGlobal: () => {
    const actor = currentTeam().slot;
    const slot = 1 << currentTeam().active;
    if (isHeld(MODE_BURST)) {
      if (!appliedByMember(FUSION_BURST, actor) || (stacksOf(BETWEEN_THE_STARS_BURST) & slot) !== 0) return;
      applyCurrent(BETWEEN_THE_STARS_BURST, slot);
      return;
    }
    if (!appliedByMember(TUNE_RUPTURE_SHIFTING, actor) && currentAction().type !== Type1.Rupture) return;
    if ((stacksOf(BETWEEN_THE_STARS_RUPTURE) & slot) !== 0) return;
    applyCurrent(BETWEEN_THE_STARS_RUPTURE, slot);
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
const inflicts = (a: Action): boolean =>
  a === ABA3 || a === ABA4 || a === MBA3 || a === MBA4 || a === ArmamentMerge || a === CallOfDawn || a === Intro || a === EIntro;

/** Held on her slot, so its updateGlobal runs as her whoever is acting: the Starburst response and
 *  the Trail are hers. A response is any Rupture-typed hit that isn't her own Duet volley. */
const MODE_RUPTURE = new ResonanceMode({
  name: "Aemeath: Resonance Mode - Tune Rupture",
  updateDebuffs: () => { if (inflicts(currentAction())) applyRupture(); },
  updateGlobal: () => {
    tuneRuptureResponse(Starburst);
    const a = currentAction();
    if (a.type === Type1.Rupture && a !== Volley) applyEnemy(RUPTUROUS_TRAIL, 10);
  },
  updateBuffs: () => { if (isDuet(currentAction())) queue(Volley); },
});

/* ---------------------------------------------------------------------------------- rotation */

const ABA234 = new ActionGroup("Basic - Aemeath 234", [ABA2, ABA3, ABA4]);
const MBA234 = new ActionGroup("Basic - Mech 234", [MBA2, MBA3, MBA4]);

/** Intro (+40 Rate, Starlume) into Stage 3-4, Overdrive (Rate 2 with Starlume — Unbound, Stardust),
 *  the Mech chain into the free Encore, the Aemeath chain into Overture (Rate 4, Instant Response),
 *  the Charged II to refill the gauge, the echo, Finale and out. Never the team's lead. */
const AE_ROTATION = new Rotation([
  INTRO, ABA3, ABA4, Lib1,
  MBA234, MechFSkill,
  ABA234, AmyFSkill,
  MHA2, ECHO_CANCEL, Lib2,
  OUTRO_NEXT,
]);

export const AEMEATH_RUPTURE = new Loadout({
  resonator: AEMEATH_RESONATOR,
  talent: AEMEATH_TALENTS,
  inherent1: AE_INHERENT_1,
  inherent2: AE_INHERENT_2,
  weapons: [EVERBRIGHT_POLESTAR, EMERALD_OF_GENESIS],
  echoLoadouts: [new EchoLoadout(SIGILLUM, TRAILBLAZING_STAR_5PC, TRAILBLAZING_STAR_2PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Fusion3, Mainstat.ATK1),
  substat: chem("atk", "liberation"),
  rotation: AE_ROTATION,
  mode: MODE_RUPTURE,
});

/* ======================================================================= Fusion Burst mode */

/** The Duet's own Fusion Burst: the status calculated at the target's max-stack rung without
 *  spending the stacks — a dot hit like the ladder's own (status.ts), reading that rung's
 *  multiplier at cast since the cap is the fight's (Chisa raises it). The Trail and Stardust
 *  multiply it from their own buffs. */
const DuetBurst = new Action("Forte - Seraphic Duet: Fusion Burst", {
  element: Attribute.Fusion, type: Type1.Status, type2: Type2.FusionBurst, scaling: Scaling.Dot, mv: 0,
  applyStats: () => addStat(Stat.AddMv, FUSION_BURST_ACTIONS[currentTeam().enemyMax(FUSION_BURST)]!.mv),
});

/** Fusion Trail: a stack for every Fusion Burst stack anyone on the team lands, cap 30, 30s
 *  (standing). The Duet's Fusion Burst is +10% multiplier a stack and spends them all — unless it
 *  is the first Stardust Duet (both charges up), which pays and leaves them. */
const FUSION_TRAIL = new Debuff({
  name: "Aemeath: Fusion Trail", maxStacks: 30,
  applyStats: () => { if (currentAction() === DuetBurst) addStat(Stat.MulMv, 10 * frozenStacks()); },
  convertStats: () => { if (currentAction() === DuetBurst && stacksOf(STARDUST) !== 2) revokeEnemy(FUSION_TRAIL); },
});

/** Between the Stars, Fusion Burst: +30% Crit. DMG the first time each resonator on the team lays
 *  Fusion Burst, cap 2; at 2, Finale is amplified 25%. The same per-slot bits as the Rupture one. */
const BETWEEN_THE_STARS_BURST = new Buff({
  name: "Aemeath: Between the Stars (burst)", maxStacks: 1 + 2 + 4,
  display: () => `Aemeath: Between the Stars (burst) x${Math.min(2, betweenTheStars())}`,
  applyStats: () => {
    const n = Math.min(2, betweenTheStars());
    addStat(Stat.CritDmg, 30 * n);
    if (n >= 2 && currentAction() === Lib2) addStat(Stat.Amp, 25);
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
  name: "Aemeath: Resonance Mode - Fusion Burst",
  updateDebuffs: () => { if (inflicts(currentAction())) applyEnemy(FUSION_BURST, 1); },
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
    if (landed > 0) applyEnemy(FUSION_TRAIL, landed);
  },
  updateBuffs: () => { if (isDuet(currentAction())) queue(DuetBurst); },
});

export const AEMEATH_BURST = new Loadout({
  resonator: AEMEATH_RESONATOR,
  talent: AEMEATH_TALENTS,
  inherent1: AE_INHERENT_1,
  inherent2: AE_INHERENT_2,
  weapons: [EVERBRIGHT_POLESTAR, EMERALD_OF_GENESIS],
  echoLoadouts: [
    new EchoLoadout(SIGILLUM, TRAILBLAZING_STAR_5PC, TRAILBLAZING_STAR_2PC),
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Fusion3, Mainstat.ATK1),
  substat: chem("atk", "liberation"),
  rotation: AE_ROTATION,
  mode: MODE_BURST,
});
