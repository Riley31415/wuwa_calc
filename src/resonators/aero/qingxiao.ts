/**
 * Qingxiao, ported to the new engine — an Aero Sword main DPS built on Tune Strain, the fourth
 * kit on the variants (see tunebreak.ts). Heavy Attack-led: her whole loop exists to fill Qin
 * Heart (Sheathed Stance hits) and Sword Cadence (Drawn Stance hits) for Heavy Attack -
 * Stringblade, which spends both and drops her into Ephemeral Transcendence, whose basics fill
 * Heart Sword Intent for Heaven's Reckoning, which spends it and ends the state.
 *
 * Every damaging cast of hers lays Tune Strain - Shifting (once per skill per target — once per
 * cast here), she responds to Strain like Lynae/Mornye/Denia (tuneStrainBonus) and raises the
 * Interfered cap by 1. Mindlock is her own enemy debuff: +1 per Tune Strain - Interfered the team
 * inflicts (+1 more against an Overlord/Calamity target — assumed: the standing target is a boss),
 * +3 off Heavy Attack - Stringblade under Heaven's Clarity, plus Gathered Mind's own opening
 * stack; her Heavy/Ephemeral/Liberation casts pay 2% per stack plus 5% per stack for the first
 * seven — twice over, once as the Forte's DMG-taken Amplification and once as To Know, To
 * Banish's own "deal more DMG" (kept as DMG Bonus, the way the migrated sheet split them).
 *
 * Gauges: Qin Heart and Sword Cadence are forte1/forte2 (0-100 each); Heart Sword Intent reuses
 * forte1, which Heavy Attack - Stringblade has just cleared on its way into Ephemeral
 * Transcendence, and Heaven's Reckoning clears again on the way out. Every
 * per-cast figure is the per-hit table's own, gauge gains declared at their plain rate and doubled
 * by Heaven's Clarity — exactly the table's "with Clarity" rows, which differ from their twins in
 * that column alone. Qin Heart and Sword Cadence are never read back — the rotation is the
 * kit-valid line and the engine gates nothing on a gauge — but Heart Sword Intent is: the
 * Ephemeral casts double their multiplier only while it's short of full, as the table's "before
 * FHA unlock" rows say.
 *
 * Swordlight Ward (interruption immunity / damage taken), Sword Flight/Step/Glide (movement) and
 * Gathered Mind's growth off kills have no combat-formula effect here and aren't modelled.
 *
 * MVs and energy/concerto/off-tune off nanoka.cc (character 1413, the 3.6+365 static JSON — the
 * page is client-rendered) at skill level 10. Where the migrated sheet disagrees (Severing Note's
 * energy/concerto/off-tune, the Liberation's multiplier, the enhanced Heaven's Reckoning's
 * off-tune) nanoka is what's here.
 */
import {
  Buff, Debuff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Stat, Attribute, WeaponType, Type1,
  Cast, Node, Scaling, addStat, applied, applyCurrent, applyTeam, applyEnemy, currentAction, maxStackIncrease,
  revokeCurrent, revokeTeam, stacksOfEnemy, setForte1, setForte2, forte1, forte2,
  } from "../../engine/kit.js";
import { lostOnSwap } from "../../shared/helpers.js";
import { ActionGroup, Action, Rotation, INTRO, ECHO_SWAP, OUTRO, START_3, SWAP } from "../../engine/rotation.js";
import { applyStrain, TUNE_BREAK, TUNE_STRAIN_SHIFTING, TUNE_STRAIN_INTERFERED, tuneStrainBonus } from "../../shared/tunebreak.js";
import { BLAZING_BRILLIANCE, GLINT_OF_CLOUDS, RED_SPRING } from "../../weapons/sword.js";
import { EMERALD_OF_GENESIS, NEW_STD_SWORD } from "../../weapons/standard.js";
import { CALAMITY_EFFIGY, HEART_OF_EVILS_PURGE_5PC } from "../../echoes/mengzhou.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { chem } from "../../shared/substats.js";
import { FROSTY_RESOLVE_SKILL_DMG, NM_KELPIE, WINDWARD_5PC } from "../../echoes/rinascita.js";

/* ----------------------------------------------------------------------------------- actions */

function qxAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Aero, scaling: Scaling.Atk, ...def });
}

// --- Stringblade. Stages 1 and 4 are Sheathed Stance (Qin Heart, forte1); 2, 3, the mid-air
//     chain and the dodge counter are Drawn Stance (Sword Cadence, forte2). Gauge gains at their
//     plain rate, doubled by HEAVENS_CLARITY; everything else is the same row either way.
const BA1 = qxAction("Basic - Stringblade 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 60.26, energy: 1.10, concerto: 2.18, offtune: 3464, forte1: 9.74 });
const BA2 = qxAction("Basic - Stringblade 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 74.18, energy: 1.34, concerto: 2.68, offtune: 4264, forte2: 7.12 });
const BA3 = qxAction("Basic - Stringblade 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 97.44, energy: 1.76, concerto: 3.52, offtune: 5600, forte2: 9.36 });
const BA4 = qxAction("Basic - Stringblade 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 108.45, energy: 1.96, concerto: 3.92, offtune: 6234, forte1: 17.54 });
const MA1 = qxAction("Basic - Stringblade (Mid-Air) 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 90.48, energy: 1.63, concerto: 3.25, offtune: 5200, forte2: 8.71 });
const MA2 = qxAction("Basic - Stringblade (Mid-Air) 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 89.79, energy: 1.63, concerto: 3.24, offtune: 5160, forte2: 8.63 });
const MA3 = qxAction("Basic - Stringblade (Mid-Air) 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 139.21, energy: 2.50, concerto: 5, offtune: 8000, forte2: 13.37 });
const Plunge = qxAction("Basic - Plunging Attack", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 86.29, energy: 1.55, concerto: 3.10, offtune: 4960 });
const DC = qxAction("Basic - Stringblade (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 180.92, energy: 3.28, concerto: 16.52, offtune: 10400, forte2: 26.04 });

/** Spends both gauges in full — pre-clamped here so its own declared -100s land exactly on 0 —
 *  and opens Ephemeral Transcendence. Under Clarity it also arms the enhanced Heaven's Reckoning,
 *  which is Clarity's own doing (see HEAVENS_CLARITY). */
const HA = qxAction("Heavy - Stringblade", {
  node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 438.41, energy: 5.31, concerto: 10.53, offtune: 16800, forte1: -100, forte2: -100,
  updateBuffs: () => {
    if (forte1() > 100) setForte1(100);
    if (forte2() > 100) setForte2(100);
  },
});

// --- Severing Note: Judgement banks nothing of its own on the table (the page's "45 Qin Heart
//     during this skill" isn't there) — only Resonant Chime's 30 after an Intro; Ascendant is the
//     Drawn-stance skill inside a basic chain.
const Skill = qxAction("Skill - Severing Note: Judgement", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 139.18, energy: 2.51, concerto: 5, offtune: 8000, forte1: 45 });
const Ascendant = qxAction("Skill - Severing Note: Ascendant", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 94.66, energy: 1.71, concerto: 3.40, offtune: 5440, forte2: 9.09 });

// --- Ephemeral Transcendence: the basics bank Heart Sword Intent (forte1, cleared by the Heavy
//     on the way in) and, while it's short of full, deal double — see EPHEMERAL and QINGXIAO_RESONATOR's own
//     applyStats. Heaven's Reckoning spends it all and ends the state. Stage 1 is the table's own
//     row (a 22.45% hit more than nanoka's). Both dodge counters carry +10 Concerto (CLAUDE.md).
const FBA1 = qxAction("Forte - Ephemeral Transcendence 1", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 112.24, energy: 2.04, concerto: 4.05, offtune: 6450, forte1: 25.55 ,
  applyStats: () => { if (forte1() < 100) addStat(Stat.MulMv, 100); }
});
const FBA2 = qxAction("Forte - Ephemeral Transcendence 2", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 115.55, energy: 2.10, concerto: 4.15, offtune: 6640, forte1: 26.35 ,
applyStats: () => { if (forte1() < 100) addStat(Stat.MulMv, 100); }
});
const FBA3 = qxAction("Forte - Ephemeral Transcendence 3", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 125.28, energy: 2.28, concerto: 4.51, offtune: 7200, forte1: 28.56 ,
applyStats: () => { if (forte1() < 100) addStat(Stat.MulMv, 100); }
});
const FBA4 = qxAction("Forte - Ephemeral Transcendence 4", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 180.96, energy: 3.27, concerto: 6.50, offtune: 10400, forte1: 41.20 ,
applyStats: () => { if (forte1() < 100) addStat(Stat.MulMv, 100); }
});
const FDC = qxAction("Forte - Ephemeral Transcendence (Dodge Counter)", { node: Node.Forte, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 264.46, energy: 4.77, concerto: 19.50, offtune: 15200, forte1: 60.26 ,
applyStats: () => { if (forte1() < 100) addStat(Stat.MulMv, 100); }
});
/** Spends all Heart Sword Intent and takes Heaven's Clarity with it. */
const FHA = qxAction("Forte Heavy - Heaven's Reckoning", {
  node: Node.Forte, cast: Cast.Heavy, type: Type1.Heavy, mv: 695.90, energy: 23, concerto: 25, offtune: 8000, forte1: -100,
  updateBuffs: () => {
    if (forte1() > 100) setForte1(100);
    revokeCurrent(HEAVENS_CLARITY);
  },
});

const Liberation = qxAction("Liberation - Billows Beneath Heaven", {
  node: Node.Liberation, cast: Cast.Liberation, type: Type1.Liberation, mv: 1670.11,
  concerto: 20, offtune: 8000, resetEnergy: true,
  updateBuffs: () => applyCurrent(HEAVENS_CLARITY, 1),
});

/** Banks nothing on the table — the page's "restores 30 Sword Cadence" isn't there — and arms
 *  Resonant Chime. */
const Intro = qxAction("Intro - Tonality Shift", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 132.63, energy: 10, concerto: 10, offtune: 7626, forte2: 30,
  updateBuffs: () => applyCurrent(RESONANT_CHIME, 1),
});
/** Lingering Song: a real 800% Aero hit on the way out. */
const Outro = qxAction("Outro - Lingering Song", { cast: Cast.Outro, type: Type1.Outro, mv: 800, concerto: -100, active: false });

/* ------------------------------------------------------------------------------------- buffs */

/** Mindlock, her own enemy debuff — 15 frozenStacks, never decays. Nothing but her reads it. */
const MINDLOCK = new Debuff({ name: "Qingxiao: Mindlock", 
  maxStacks: 15,
  applyStats: () => {
    if (!MINDLOCK_PAYS.has(currentAction())) return;
    const n = stacksOfEnemy(MINDLOCK);
    addStat(Stat.Amp, 2 * n + 5 * Math.min(n, 7));
  },
});

/** What Mindlock pays on — those five plus Heavy Attack - Stringblade, Heaven's Reckoning and the
 *  Liberation. */
const MINDLOCK_PAYS = new Set<Action>([HA, FBA1, FBA2, FBA3, FBA4, FDC, FHA, Liberation]);

/** Gathered Mind: 1 stack from combat start (only a kill of a Mindlocked target grows it, which
 *  there's nothing to model against one standing target). It pays out twice, each once per target:
 *  Mindlock equal to its stacks on the team's first damaging hit — laid at combat start with the
 *  stack itself, see QX_INHERENT_1, since that hit is the very next action either way — and one
 *  extra Tune Strain - Interfered on the first Tune Break, which spends it. Held team-wide rather
 *  than on her slot so that break is seen whoever lands it, and inflicted from updateDebuffs so
 *  both Mindlock sources below count it on that same break. */
const GATHERED_MIND = new Buff({
  name: "Qingxiao: Gathered Mind", maxStacks: 15,
  updateDebuffs: () => {
    if (currentAction() !== TUNE_BREAK || stacksOfEnemy(TUNE_STRAIN_SHIFTING) <= 0) return;
    applyEnemy(TUNE_STRAIN_INTERFERED, 1);
    revokeTeam(GATHERED_MIND);
  },
});

/** Resonant Chime: her Intro arms it, the next Severing Note: Judgement banks 30 more Qin Heart
 *  and spends it. */
const RESONANT_CHIME = new Buff({
  name: "Qingxiao: Resonant Chime",
  applyStats: () => { if (currentAction() === Skill) addStat(Stat.AddForte1, 30); },
  convertStats: () => { if (currentAction() === Skill) revokeCurrent(RESONANT_CHIME); },
});

const CLARITY_FORTE = new Set<Action>([BA1, BA2, BA3, BA4, MA1, MA2, MA3, DC, Ascendant]);
/** Heaven's Clarity: up from combat start and again off every Liberation, gone the moment
 *  Heaven's Reckoning is cast. While up, Sheathed/Drawn hits bank their gauges twice as fast, and
 *  Heavy Attack - Stringblade lays 3 Mindlock and enhances the next Heaven's Reckoning. */
const HEAVENS_CLARITY = new Buff({
  name: "Qingxiao: Heaven's Clarity",
  updateDebuffs: () => { if (currentAction() === HA) applyEnemy(MINDLOCK, 3); },
  updateBuffs: () => { if (currentAction() === HA) applyCurrent(RECKONING_ENHANCED, 1); },
  applyStats: () => {
    const a = currentAction();
    // Sheathed/Drawn stance hits only — Heart Sword Intent rides forte1 as well, and Ephemeral
    // Transcendence is neither stance, so its own gains are never doubled
    if (CLARITY_FORTE.has(a)) {
      if (a.forte1 > 0) addStat(Stat.AddForte1, a.forte1);
      if (a.forte2 > 0) addStat(Stat.AddForte2, a.forte2);
    }
  },
});

/** The enhanced Heaven's Reckoning: x2 multiplier and 160,000 off-tune in place of the plain
 *  8,000 (nanoka's own enhanced rows). Ends on switching out or once it's cast. */
const RECKONING_ENHANCED = new Buff({
  name: "Qingxiao: Heaven's Reckoning Enhancement",
  updateBuffs: () => lostOnSwap(),
  applyStats: () => { if (currentAction() === FHA) { addStat(Stat.MulMv, 100); addStat(Stat.AddOfftune, 152000); } },
  convertStats: () => { if (currentAction() === FHA) revokeCurrent(RECKONING_ENHANCED); },
});

/* --------------------------------------------------------------------------- kit and loadout */

/** Sea of Thought, World of Dust — Gathered Mind's own grant, one stack on entering combat, plus
 *  the Mindlock that stack lays on the team's first damaging hit (see GATHERED_MIND). */
const QX_INHERENT_1 = new Inherent({
  name: "Inherent: Sea of Thought, World of Dust",
  combatStart: () => { applyTeam(GATHERED_MIND, 1); applyEnemy(MINDLOCK, 1); },
});

/** To Know, To Banish: her Heavy, the Ephemeral casts, Heaven's Reckoning and the Liberation deal
 *  2% more DMG per stack of Mindlock, and 5% more again per stack for the first seven — and the
 *  Forte Circuit's own Mindlock line amplifies those same casts by the same amount, so both halves
 *  are read off the target here (the migrated sheet's own split: one Amp, one DMG Bonus). The extra
 *  Mindlock per Interfered is inflicted with the break itself, see QINGXIAO_RESONATOR's own updateGlobal. */
const QX_INHERENT_2 = new Inherent({
  name: "Inherent: To Know, To Banish",
  // its own Mindlock, on top of the Forte Circuit's: one more per Tune Strain - Interfered the team
  // inflicts, since the target is Overlord/Calamity Class (assumed — this project's is a boss)
  updateGlobal: () => {
    const interfered = applied(TUNE_STRAIN_INTERFERED);
    if (interfered) applyEnemy(MINDLOCK, interfered);
  },
  applyStats: () => {
    if (!MINDLOCK_PAYS.has(currentAction())) return;
    const n = stacksOfEnemy(MINDLOCK);
    addStat(Stat.DmgBonus, 2 * n + 5 * Math.min(n, 7));
  },
});

const QINGXIAO_TALENTS = new Talent({
  name: "Qingxiao: Talents",
  constantStats: () => { addStat(Stat.BonusAtk, 12); addStat(Stat.CritDmg, 16); },
});

const QINGXIAO_RESONATOR = new Resonator({
  name: "Qingxiao",
  element: Attribute.Aero,
  weapon: WeaponType.Sword,
  intro: () => Intro,
  outro: () => Outro,
  color: "#6cc5b0",
  maxEnergy: 125,

  // Draw and Sunder: "while Qingxiao is in the team"; Heaven's Clarity and Formless Heart Sword
  // are up from the first action
  combatStart: () => {
    maxStackIncrease(TUNE_STRAIN_INTERFERED, 1);
    applyCurrent(HEAVENS_CLARITY, 1);
  },

  // every damaging cast of hers lays Tune Strain - Shifting (the echo is its own cast, not hers)
  updateDebuffs: () => {
    const a = currentAction();
    if (a.mv > 0 && a.cast !== Cast.Echo) applyStrain();
  },

  // The Forte Circuit's own Mindlock line: +1 for every Tune Strain - Interfered the team inflicts.
  // To Know, To Banish adds its own on top (QX_INHERENT_2) and Heaven's Clarity its three, each
  // from the piece that grants them.
  updateGlobal: () => {
    // 1 mindlock per interfered baseline
    const interfered = applied(TUNE_STRAIN_INTERFERED);
    if (interfered) applyEnemy(MINDLOCK, interfered);
  },

  lateConvertStats: () => tuneStrainBonus(),

  constantStats: () => {
    addStat(Stat.BaseHp, 10300); addStat(Stat.BaseAtk, 462.5); addStat(Stat.BaseDef, 1112.22);
    addStat(Stat.Tbb, 10);
  },
});

/* ---------------------------------------------------------------------------------- rotation */

/** The migrated sheet's own "qx" line: Intro into the mid-air finisher, Judgement, the full
 *  Stringblade chain to fill both gauges, Heavy Attack - Stringblade into Ephemeral Transcendence,
 *  its four basics to fill Heart Sword Intent, Heaven's Reckoning (enhanced, off the Heavy), the
 *  Liberation to bring Clarity back, the echo and out. Both opener and loop. */

const FBA1234 = new ActionGroup("Forte - Ephemeral Transcendence 1234", [FBA1, FBA2, FBA3, FBA4]);
const MA123 = new ActionGroup("Basic - Stringblade (Mid-Air) 123", [MA1, MA2, MA3]);

const QX_ROTATION = new Rotation([
  START_3, Liberation, SWAP,
  INTRO, MA123, BA3, BA4, Skill, HA,
  FBA1234, FHA,
  Liberation, ECHO_SWAP, OUTRO,
]);

export const QINGXIAO = new Loadout({
  resonator: QINGXIAO_RESONATOR,
  talent: QINGXIAO_TALENTS,
  inherent1: QX_INHERENT_1,
  inherent2: QX_INHERENT_2,
  weapons: [GLINT_OF_CLOUDS, EMERALD_OF_GENESIS, NEW_STD_SWORD, RED_SPRING],
  echoLoadouts: [new EchoLoadout(CALAMITY_EFFIGY, HEART_OF_EVILS_PURGE_5PC),
      new EchoLoadout(NM_KELPIE, WINDWARD_5PC),],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Aero3, Mainstat.ATK1),
  substat: chem("atk", "heavy"),
    rotation: QX_ROTATION,
});
