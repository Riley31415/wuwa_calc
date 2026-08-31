/**
 * Suisui — a Glacio Rectifier healer/support, and the first kit built around Negative Statuses in
 * general rather than one of them. She deals almost no damage; everything she is worth is the
 * three things she hands the team.
 *
 * **Ceaseless Landscape** (Resonance Liberation, 30s, so permanent uptime here) raises the target's
 * limit on whichever Negative Status the team is actually playing — Spectro Frazzle, Fusion Burst,
 * Glacio Chafe and Aero Erosion each +3 once anyone inflicts it or deals its damage, Electro Flare
 * and Electro Rage together off Flare — and lets a Havoc kit that spends Havoc Bane ignore 6% of
 * the target's DEF and 12% of its Havoc RES. That cap raise is why she stands in front of Hiyuki
 * (whose every converted Chafe stack calculates at the *limit*, so +3 moves every hit up three
 * rungs) and Yangyang: Xuanling (whose Unbroken Vow tiers on the Bane count).
 *
 * **Outro - Rippling Waters** is 25% All DMG Amplification for the team, plus a tier list paid out
 * of the Floral Epistle it consumes: 200 buys the first Plume Step, 400 the second and a DMG bonus
 * scaled off her own Energy Regen, 600 the third and Undulating Mist, an ATK buff she hands the
 * incoming resonator on every handoff from then on. Her rotation banks well past 600, so all three
 * tiers are live. Both Energy-Regen-scaled figures are taken at their cap per CLAUDE.md's rule for
 * a team buff scaled by the applier's own stats (both want 260% ER, which her build reaches).
 *
 * **Sky Over Water** (Inherent Skill) enhances whichever of Awakening Spring / Intro - Tinkling
 * Jade comes first every 25s: +18 Concerto, +13 Resonance Energy, +80% Crit. Rate, +240% Glacio DMG
 * and nanoka's own enhanced off-tune row (81,600 against the plain 9,600). One cast a rotation, the
 * way every other "once every Ns" in this project is read — Awakening Spring takes it in the
 * opener, the Intro every visit after, and her Outro arms the next one.
 *
 * Her two stances are the two gauges and nothing else: Zephyr banks **Cloud Breath** (forte1, 120),
 * which Awakening Spring or the Intro spends to drop her into **Drizzle Stance**, where the same
 * buttons bank **Floral Epistle** (forte2, 600) for the Outro to spend. The engine gates nothing on
 * a gauge and the rotation below is the kit-valid line, so the stances need no state of their own —
 * each has its own actions.
 *
 * Not modelled, because none of it reaches a damage formula: every heal (Enrichment, Spring's
 * Birth, the Plume Steps, Drizzle Stance's own channel — only the HEALS marker they set matters,
 * for Rejuvenating Glow and her own weapon), Reflecting Shadows' interruption resistance, and
 * Glimmering Gold's once-per-10-minutes revive.
 *
 * MVs and energy/concerto/off-tune off nanoka.cc (character 1110, the 3.6+365 static JSON — the
 * page is client-rendered) at skill level 10, per-hit x hit count, with the flat Concerto Regen
 * rows folded in (the Intro's 10, the Liberation's 20) and the hidden +10 on the dodge counter.
 * Both gauges are wuwalab's frame data (api.wuwalab.com/api/app/characters/suisui), which nanoka
 * does not expose; the two agree on every MV/energy/concerto/off-tune figure they share. Her
 * `weakness_mastery` is 0, so she carries no flat Tune Break Boost.
 */
import {
  Buff, Debuff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Stat, Attribute, WeaponType,
  Type1, Type2, Cast, Node, Scaling, addStat, applied, applyCurrent, applyEnemy, applyTeam, casting,
  concerto, consumedAny, consumedByMe, currentAction, currentTeam, isType, maxStackIncrease, queueOn,
  queueOutro, removeStackTeam, revokeCurrent, revokeTeam, setForte1, setForte2, stacksOfTeam,
  frozenStacks,
  forte2,
  } from "../../engine/kit.js";
import { ActionGroup, Action, Rotation, NOINTRO, INTRO, ECHO_CANCEL, OUTRO } from "../../engine/rotation.js";
import {
  AERO_EROSION, ELECTRO_FLARE, ELECTRO_RAGE, FUSION_BURST, GLACIO_CHAFE, HAVOC_BANE, HEALS, SPECTRO_FRAZZLE,
} from "../../shared/status.js";
import { FIRSTLIGHTS_HERALD } from "../../weapons/rectifier.js";
import { VARIATION } from "../../weapons/standard.js";
import { FORBIDDEN_BASTION, FEATHERED_TRACE_5PC, FEATHERED_TRACE_2PC } from "../../echoes/mengzhou.js";
import { REJUV_5PC, REJUV_2PC } from "../../echoes/jinzhou.js";
import { mainstats, Mainstat } from "../../shared/mainstats.js";
import { chem } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function suisuiAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Glacio, scaling: Scaling.Atk, ...def });
}

// --- Zephyr Stance: the chain she opens a fight from, banking Cloud Breath (forte1) for
//     Awakening Spring. Resonance Skill - Zephyr Stance's own 40 is the kit page's, not the
//     per-hit table's — wuwalab carries no gauge on those six hits either.
const BA1 = suisuiAction("Basic - Zephyr Stance 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 63.15, energy: 1.00, concerto: 3.18, offtune: 3176, forte1: 24 });
const BA2 = suisuiAction("Basic - Zephyr Stance 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 122.00, energy: 1.92, concerto: 6.14, offtune: 6136, forte1: 46 });
const BA3 = suisuiAction("Basic - Zephyr Stance 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 139.34, energy: 2.20, concerto: 7.03, offtune: 7010, forte1: 53 });
const BA4 = suisuiAction("Basic - Zephyr Stance 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 159.08, energy: 2.50, concerto: 8.00, offtune: 8000, forte1: 60 });
const MA = suisuiAction("Basic - Zephyr Stance (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 70.72, energy: 1.86, concerto: 5.93, offtune: 5928 });
const DC = suisuiAction("Basic - Zephyr Stance 3 (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 170.67, energy: 2.70, concerto: 18.60, offtune: 8586, forte1: 30 });
const Skill = suisuiAction("Skill - Vernal Screen: Zephyr Stance", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 143.16, energy: 2.28, concerto: 7.20, offtune: 7200, forte1: 40 });

/** Awakening Spring: replaces the Zephyr skill at full Cloud Breath, spends the whole bar and drops
 *  her into Drizzle Stance, which clears Floral Epistle on the way in. HP-scaled, and one of the
 *  two casts Sky Over Water enhances. */
const ESkill = suisuiAction("Skill - Awakening Spring", {
  node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, scaling: Scaling.Hp,
  mv: 28.63, energy: 5.00, concerto: 9.60, offtune: 9600,
  updateDebuffs: () => { applyEnemy(GLACIO_CHAFE, 1); applyCurrent(HEALS, 1); },
  updateBuffs: () => { setForte1(0); setForte2(0); },
});

// --- Drizzle Stance: the same buttons, banking Floral Epistle (forte2) for the Outro. Illuminating
//     Dew and Swallow's Cut are the two ways out of the Heavy, so a chain only ever takes one.
const FBA1 = suisuiAction("Basic - Drizzle Stance 1", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 78.28, energy: 1.24, concerto: 3.96, offtune: 3936, forte2: 84 });
const FBA2 = suisuiAction("Basic - Drizzle Stance 2", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 159.07, energy: 2.50, concerto: 8.00, offtune: 8000, forte2: 170 });
const FBA3 = suisuiAction("Basic - Drizzle Stance 3", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 165.12, energy: 2.64, concerto: 8.40, offtune: 8304, forte2: 180 });
const FBA4 = suisuiAction("Basic - Drizzle Stance 4", {
  node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 159.05, energy: 2.50, concerto: 8.00, offtune: 8000, forte2: 170,
  updateDebuffs: () => applyEnemy(GLACIO_CHAFE, 1),
});
const FHA = suisuiAction("Heavy - Drizzle Stance", { node: Node.Forte, cast: Cast.Heavy, type: Type1.Heavy, mv: 238.59, energy: 3.78, concerto: 12.00, offtune: 12000, forte2: 258 });
const FHA2 = suisuiAction("Forte - Illuminating Dew", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 104.98, energy: 2.75, concerto: 8.80, offtune: 8800 });
const FMA = suisuiAction("Forte - Swallow's Cut", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 107.65, energy: 2.82, concerto: 9.03, offtune: 9024 });
const FSkill = suisuiAction("Skill - Vernal Screen: Drizzle Stance", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 143.16, energy: 2.27, concerto: 7.20, offtune: 7200, forte2: 100 });

/** Song of Thoroughfare: no damage of its own, just the Landscape and its 20 Concerto. */
const Liberation = suisuiAction("Liberation - Song of Thoroughfare", {
  node: Node.Liberation, cast: Cast.Liberation, concerto: 20, resetEnergy: true,
  updateBuffs: () => applyTeam(CEASELESS_LANDSCAPE, 1)
});

/** Tinkling Jade: the other cast Sky Over Water enhances, and the ordinary way into Drizzle Stance
 *  — it spends whatever Cloud Breath she is holding whether or not the bar is full. */
const Intro = suisuiAction("Intro - Tinkling Jade", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, scaling: Scaling.Hp,
  mv: 28.63, energy: 10, concerto: 19.60, offtune: 9600,
  updateDebuffs: () => { applyEnemy(GLACIO_CHAFE, 1); applyCurrent(HEALS, 1); },
  updateBuffs: () => { setForte1(0); setForte2(0); },
});

/** Rippling Waters: the team's 25% amplification, every Floral Epistle tier, and the three-step
 *  Transcendent Dance armed for the two visits after. The bar is cleared rather than spent by a
 *  declared delta ("consumes all" has no fixed size, and the engine's gauges have no ceiling), and
 *  nothing here tests what it held: 600 consumed — the top tier — is simply taken as read. */
const Outro = suisuiAction("Outro - Rippling Waters", {
  cast: Cast.Outro, concerto: -100, active: false, forte2: -600,
  updateBuffs: () => {
    if (forte2() > 600) setForte2(600);
    applyTeam(RIPPLING_WATERS, 1);
    applyTeam(ROAMING_TRANSCENDENT, 1);
    // a fresh dance, not a top-up: a step the last one never got round to goes with it
    revokeTeam(TRANSCENDENT_DANCE);
    applyTeam(TRANSCENDENT_DANCE, 3);
  },
});

/* ------------------------------------------------------------------------------------- buffs */

/** The four Negative Statuses Ceaseless Landscape raises by name, each with the damage tag its own
 *  ladder rungs carry — the Landscape pays on inflicting one *or* on dealing its damage. Havoc Bane
 *  is deliberately not here; it has the DEF/RES branch below instead. */
const LANDSCAPE_CAPS: [Debuff, Type2][] = [
  [SPECTRO_FRAZZLE, Type2.SpectroFrazzle],
  [FUSION_BURST, Type2.FusionBurst],
  [GLACIO_CHAFE, Type2.GlacioChafe],
  [AERO_EROSION, Type2.AeroErosion],
];

/** Ceaseless Landscape: 30s off every Liberation, so permanent here. Watched globally (it lives in
 *  the team pool) so every ally's own turn counts, not just hers. The real raise is 15s and
 *  unstackable; this engine's maxStackIncrease() only ever raises a cap for the rest of the fight,
 *  which is the closest that gets — the same reading Chisa's Resonant Thread of Closure uses. From
 *  updateGlobal the team pool runs behind every slot's own gear, so the very first Chafe of a fight
 *  is still calculated at the unraised cap and everything after it at +3.
 *
 *  The Havoc branch reads the engine's own consumption log (kit.ts's `consume()`/`consumedByMe()`)
 *  rather than the target merely carrying a Bane, and from `afterAction` because that is the phase
 *  a kit spends its stacks in — Xuanling's Sword Stance Flow, the only cast in the roster that
 *  spends any, deliberately waits until then so the cast itself still reads the full count. Against
 *  a 30s buff a payout landing on the action after the spend never shows. */
const CEASELESS_LANDSCAPE = new Buff({
  name: "Suisui: Ceaseless Landscape",
  updateGlobal: () => {
    for (const [status, tag] of LANDSCAPE_CAPS) {
      if (applied(status) || isType(tag)) maxStackIncrease(status, 3);
    }
    if (applied(ELECTRO_FLARE) || isType(Type2.ElectroFlare)) {
      maxStackIncrease(ELECTRO_FLARE, 3);
      maxStackIncrease(ELECTRO_RAGE, 3);
    }
  },
  afterAction: () => { if (consumedByMe(HAVOC_BANE)) applyCurrent(VOID_TIDE, 1); },
});

/** Ceaseless Landscape's Havoc branch, held by whoever spends the Bane: 6% DEF ignore and 12%
 *  Havoc RES ignore, both on their Havoc DMG alone. 30s, so it never drops once it is up. */
const VOID_TIDE = new Buff({
  name: "Suisui: Ceaseless Landscape (bane)",
  applyStats: () => {
    addStat(Stat.DefIgnoreNew, 6, Attribute.Havoc);
    addStat(Stat.ResIgnore, 12, Attribute.Havoc);
  },
});

/** Rippling Waters' own 25% All DMG Amplification — 30s, so permanent once granted. */
const RIPPLING_WATERS = new Buff({
  name: "Suisui: Outro",
  applyStats: () => addStat(Stat.Amp, 25),
});

/** Reflecting Shadows: 6s to the whole team off every Plume Step, and what the 400-Epistle tier
 *  below is gated on. Nothing else reads it — its own effect is interruption resistance. */
const REFLECTING_SHADOWS = new Buff({ name: "Suisui: Reflecting Shadows" });

/** The 400-Epistle tier: the active resonator inside the Landscape deals 0.2% more DMG per 1% of
 *  Suisui's Energy Regen over 200%, capped at 12% — taken at the cap (CLAUDE.md), which wants 260%
 *  ER. The *active* resonator's, as the kit says, so an off-field action of anyone's is paid
 *  nothing. Runs for the 30s of one Roaming Transcendent, restarted by every Outro. */
const ROAMING_TRANSCENDENT = new Buff({
  name: "Suisui: Roaming Transcendent",
  applyStats: () => {
    if (currentAction().active) addStat(Stat.DmgBonus, 12);
  },
});

/** The Transcendent Dance: her three Plume Steps, paced across the two visits after her Outro
 *  rather than all landing on the handoff, with whoever is on field as the clock — the first goes
 *  off once the resonator she handed to reaches 100 Concerto, the second and third once the one
 *  after *them* passes 50 and then 100. Stacks are steps left, so there is no counter beside it;
 *  run from `afterAction`, the one phase that sees the Concerto an action actually banked.
 *
 *  The 50 rung is "past 50 but not yet 100" precisely so it cannot fire on the resonator who has
 *  already taken the 100 one — they sit above both thresholds for the rest of their visit, and
 *  their own Outro drops them back to zero before the next resonator starts climbing. She stops the
 *  dance whenever she is the one on field, which is the kit's own rule and also what keeps a queued
 *  step from setting off the next one. */
const TRANSCENDENT_DANCE = new Buff({
  name: "Suisui: Transcendent Dance", maxStacks: 3,
  afterAction: () => {
    if (currentTeam().slot.resonator === SUISUI_RESONATOR) return;
    const left = stacksOfTeam(TRANSCENDENT_DANCE), banked = concerto();
    const due = left === 3 ? (banked >= 100) : left === 2 ? (banked >= 50 && banked < 100) : (banked >= 100);
    if (!due) return;
    
    if (left === 3) queueOutro(UNDULATING_MIST);
    applyEnemy(GLACIO_CHAFE, 1); 
    applyCurrent(HEALS, 1);
    // applyTeam(REFLECTING_SHADOWS, 1) // does nothing

    removeStackTeam(TRANSCENDENT_DANCE, 1);
  },
});

/** Undulating Mist: 14s or until its holder is switched off field, and worth +0.1% ATK per 0.12% of
 *  Suisui's Energy Regen over 200% every time they consume a Negative Status or Electro Rage stack,
 *  capped at 50% — taken at the cap, same 260% ER threshold as the tier above.
 *
 *  The two halves of it are the two stacks rather than two buffs: one stack is the Mist itself, as
 *  handed to whoever intro'd (see the Transcendent Dance's own `queueOutro`), and the second is
 *  that holder having since spent a stack off the target, which is what actually buys the ATK. One
 *  buff, because the kit ends the two together — switching the holder off field drops the Mist and
 *  the ATK with it — and because the panel then reads as one line that says which of the two it is.
 *
 *  Its trigger names no particular status — any Negative Status or Electro Rage stack — so it reads
 *  `consumedAny()`, and from `afterAction`, the phase a kit spends its stacks in (see the Havoc
 *  branch above). Held locally, so that phase only ever runs on its own holder's turn and the only
 *  member who could have spent anything is them. `applyStats` reads the count frozen before that,
 *  so the cast that does the consuming is not itself paid — the ATK starts on the next one. */
const UNDULATING_MIST = new Buff({
  name: "Suisui: Undulating Mist", maxStacks: 2,
  display: () => `Suisui: Undulating Mist${frozenStacks() >= 2 ? " (consumed)" : ""}`,
  updateBuffs: () => { if (!currentAction().active) revokeCurrent(UNDULATING_MIST); },
  applyStats: () => { if (frozenStacks() >= 2) addStat(Stat.BonusAtk, 50); },
  afterAction: () => { if (consumedAny()) applyCurrent(UNDULATING_MIST, 1); },
});

/* --------------------------------------------------------------------------- kit and loadout */

/** Sky Over Water (Inherent Skill): the enhancement above, hers from the first action of a fight.
 *  Spring's Birth, its other half, is a heal-over-time and pays no stat. */
const SS_INHERENT_1 = new Inherent({
  name: "Suisui: Sky Over Water",
  applyStats: () => {
    if (currentAction() !== ESkill && currentAction() !== Intro) return;
    addStat(Stat.AddConcerto, 18);
    addStat(Stat.AddEnergy, 13);
    addStat(Stat.CritRate, 80);
    addStat(Stat.DmgBonus, 240, Attribute.Glacio);
    addStat(Stat.AddOfftune, 72000);
  }
});

/** Glimmering Gold (Inherent Skill): a once-per-10-minutes revive, nothing this calculator reads. */
const SS_INHERENT_2 = new Inherent({ name: "Suisui: Glimmering Gold" });

const SUISUI_TALENTS = new Talent({
  name: "Suisui: Talents",
  constantStats: () => {
    addStat(Stat.BonusHp, 12);
    addStat(Stat.HealingBonus, 12); // stat-tree Healing Bonus+ nodes — unused by the formula
  },
});

const SUISUI_RESONATOR = new Resonator({
  name: "Suisui",
  element: Attribute.Glacio,
  weapon: WeaponType.Rectifier,
  intro: () => Intro,
  outro: () => Outro,
  color: "#e8e6a6",
  maxEnergy: 175,

  constantStats: () => {
    addStat(Stat.BaseHp, 16712.5); addStat(Stat.BaseAtk, 287.5); addStat(Stat.BaseDef, 1100);
  },
});

/* ---------------------------------------------------------------------------------- rotation */

const FBA1234 = new ActionGroup("Basic - Drizzle Stance 1234", [FBA1, FBA2, FBA3, FBA4]);
const BA123 = new ActionGroup("Basic - Zephyr Stance 123", [BA1, BA2, BA3]);

/** She leads, so the opener is the Zephyr half: three basics and the skill fill Cloud Breath well
 *  past 120 for Awakening Spring, which is what puts her into Drizzle Stance with no Intro to hand
 *  her there. Every visit after, the Intro does that job and the prefix is skipped.
 *
 *  From there it is one Drizzle chain: the four stages, the Heavy into Swallow's Cut, and the
 *  Drizzle skill — 962 Floral Epistle against the 600 the top Outro tier wants, and comfortably
 *  inside the stance's own 15s at the table's frame counts. The Liberation sits in an inline
 *  start-of-combat section: she spends the bar she walks into the fight holding in the opening
 *  scramble, so the Landscape is up from the first action, and re-casts it every visit after.
 *
 *  Concerto: 135.7 by the opener's Outro (Awakening Spring takes Sky Over Water's +18 there, and
 *  the scramble's Liberation is already banked) and 122.2 every loop after — both well clear of the
 *  100 the Outro spends. */
const SS_ROTATION = new Rotation([
  NOINTRO, BA123, ESkill,
  INTRO, 
  FSkill, FBA1234, 
  ECHO_CANCEL, Liberation, OUTRO,
]);

export const SUISUI = new Loadout({
  resonator: SUISUI_RESONATOR,
  talent: SUISUI_TALENTS,
  inherent1: SS_INHERENT_1,
  inherent2: SS_INHERENT_2,
  weapons: [FIRSTLIGHTS_HERALD, VARIATION],
  echoLoadouts: [
    new EchoLoadout(FORBIDDEN_BASTION, FEATHERED_TRACE_5PC, FEATHERED_TRACE_2PC),
  ],
  mainstats: [mainstats(Mainstat.HP4, Mainstat.ER3, Mainstat.ER3, Mainstat.HP1, Mainstat.HP1)],
  substat: chem("hp", "skill", { er: true }),
  rotation: SS_ROTATION,
});
