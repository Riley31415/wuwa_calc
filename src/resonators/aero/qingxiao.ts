/**
 * Qingxiao, ported to the new engine — an Aero Sword main DPS built on Tune Strain, the fourth
 * kit on the variants (see tunebreak.ts). Heavy Attack-led: her whole loop exists to fill Qin
 * Heart (Sheathed Stance hits) and Sword Cadence (Drawn Stance hits) for Heavy Attack -
 * Stringblade, which spends both and drops her into Ephemeral Transcendence, whose basics fill
 * Heart Sword Intent for Heaven's Reckoning, which spends it and ends the state.
 *
 * Every damaging cast of hers lays Tune Strain - Shifting (once per skill per target — once per
 * cast here), she responds to Strain like Lynae/Mornye/Denia (see `strainPayout`) and raises the
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
import { Stat, Attribute, WeaponType, Type, Cast, Node, Scaling } from "../../engine/stats.js";
import { Buff, Debuff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Sequence } from "../../engine/gear.js";
import {
  addStat,
  applied,
  applyCurrent,
  applyTeam,
  applyEnemy,
  currentAction,
  onAction,
  runningAction,
  maxStackIncrease,
  revokeCurrent,
  revokeTeam,
  stacksOfEnemy,
  forte1,
  forte2,
  stacksOf,
  isHeld,
  queue,
  frozenStacks,
  getStat,
  currentTeam,
  appliedByMember,
  addBuff,
  runningAnyOf,
  pressed,
  addToCast,
} from "../../engine/context.js";
import { ActionGroup, Action, Rotation, ECHO, START_3, INTRO } from "../../engine/rotation.js";
import { applyStrain, TUNE_BREAK, TUNE_STRAIN_SHIFTING, TUNE_STRAIN_INTERFERED, strainPayout, tuneBreak } from "../../shared/tunebreak.js";
import { GLINT_OF_CLOUDS, RED_SPRING } from "../../weapons/sword.js";
import { EMERALD_OF_GENESIS, NEW_STD_SWORD } from "../../weapons/standard.js";
import { CALAMITY_EFFIGY, HEART_OF_EVILS_PURGE_5PC } from "../../echoes/mengzhou.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";
import { NM_KELPIE, WINDWARD_5PC } from "../../echoes/rinascita.js";

/* ----------------------------------------------------------------------------------- actions */

function qxAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Aero, scaling: Scaling.Atk, ...def });
}

// --- Stringblade. Stages 1 and 4 are Sheathed Stance (Qin Heart, forte1); 2, 3, the mid-air
//     chain and the dodge counter are Drawn Stance (Sword Cadence, forte2). Gauge gains at their
//     plain rate, doubled by HEAVENS_CLARITY; everything else is the same row either way.
const BA1 = qxAction("Basic - Stringblade 1", { animFrames: 29, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 15, mv: 30.13, energy: 0.55, concerto: 1.09, offtune: 1732, forte1: 4.87 },
    { hitFrame: 22, mv: 30.13, energy: 0.55, concerto: 1.09, offtune: 1732, forte1: 4.87 },
  ]});
const BA2 = qxAction("Basic - Stringblade 2", { animFrames: 37, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 12, mv: 37.09, energy: 0.67, concerto: 1.34, offtune: 2132, forte2: 3.56 },
    { hitFrame: 28, mv: 37.09, energy: 0.67, concerto: 1.34, offtune: 2132, forte2: 3.56 },
  ]});
const BA3 = qxAction("Basic - Stringblade 3", { animFrames: 48, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 6, mv: 24.36, energy: 0.44, concerto: 0.88, offtune: 1400, forte2: 2.34 },
    { hitFrame: 12, mv: 24.36, energy: 0.44, concerto: 0.88, offtune: 1400, forte2: 2.34 },
    { hitFrame: 18, mv: 24.36, energy: 0.44, concerto: 0.88, offtune: 1400, forte2: 2.34 },
    { hitFrame: 20, mv: 24.36, energy: 0.44, concerto: 0.88, offtune: 1400, forte2: 2.34 },
  ]});
const BA4 = qxAction("Basic - Stringblade 4", { animFrames: 52, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 17, mv: 86.73, energy: 1.56, concerto: 3.12, offtune: 4986, forte1: 14.02 },
    { hitFrame: 32, mv: 5.43, energy: 0.1, concerto: 0.2, offtune: 312, forte1: 0.88 },
    { hitFrame: 36, mv: 5.43, energy: 0.1, concerto: 0.2, offtune: 312, forte1: 0.88 },
    { hitFrame: 39, mv: 5.43, energy: 0.1, concerto: 0.2, offtune: 312, forte1: 0.88 },
    { hitFrame: 42, mv: 5.43, energy: 0.1, concerto: 0.2, offtune: 312, forte1: 0.88 },
  ]});
const MA1 = qxAction("Mid-air - Stringblade 1", { animFrames: 42, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 0, mv: 7.24, energy: 0.13, concerto: 0.26, offtune: 416, forte2: 0.7 },
    { hitFrame: 6, commitFrame: 0, mv: 7.24, energy: 0.13, concerto: 0.26, offtune: 416, forte2: 0.7 },
    { hitFrame: 12, commitFrame: 0, mv: 7.24, energy: 0.13, concerto: 0.26, offtune: 416, forte2: 0.7 },
    { hitFrame: 18, commitFrame: 0, mv: 7.24, energy: 0.13, concerto: 0.26, offtune: 416, forte2: 0.7 },
    { hitFrame: 24, commitFrame: 0, mv: 7.24, energy: 0.13, concerto: 0.26, offtune: 416, forte2: 0.7 },
    { hitFrame: 30, commitFrame: 0, mv: 54.28, energy: 0.98, concerto: 1.95, offtune: 3120, forte2: 5.21 },
  ]});
const MA2 = qxAction("Mid-air - Stringblade 2", { animFrames: 45, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 12, mv: 44.89, energy: 0.81, concerto: 1.62, offtune: 2580, forte2: 4.31 },
    { hitFrame: 18, mv: 22.45, energy: 0.41, concerto: 0.81, offtune: 1290, forte2: 2.16 },
    { hitFrame: 23, mv: 22.45, energy: 0.41, concerto: 0.81, offtune: 1290, forte2: 2.16 },
  ]});
const MA3 = qxAction("Mid-air - Stringblade 3", { animFrames: 86, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 18, mv: 11.14, energy: 0.2, concerto: 0.4, offtune: 640, forte2: 1.07 },
    { hitFrame: 24, mv: 11.14, energy: 0.2, concerto: 0.4, offtune: 640, forte2: 1.07 },
    { hitFrame: 30, mv: 11.14, energy: 0.2, concerto: 0.4, offtune: 640, forte2: 1.07 },
    { hitFrame: 36, mv: 11.14, energy: 0.2, concerto: 0.4, offtune: 640, forte2: 1.07 },
    { hitFrame: 42, mv: 11.14, energy: 0.2, concerto: 0.4, offtune: 640, forte2: 1.07 },
    { hitFrame: 70, mv: 83.51, energy: 1.5, concerto: 3, offtune: 4800, forte2: 8.02 },
  ]});
const Plunge = qxAction("Mid-air - Plunging Attack", { animFrames: 63, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 39, mv: 86.29, energy: 1.55, concerto: 3.1, offtune: 4960 }]});
const DC = qxAction("Dodge Counter - Stringblade", { animFrames: 48, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 6, mv: 45.23, energy: 0.82, concerto: 4.13, offtune: 2600, forte2: 6.51 },
    { hitFrame: 12, mv: 45.23, energy: 0.82, concerto: 4.13, offtune: 2600, forte2: 6.51 },
    { hitFrame: 18, mv: 45.23, energy: 0.82, concerto: 4.13, offtune: 2600, forte2: 6.51 },
    { hitFrame: 20, mv: 45.23, energy: 0.82, concerto: 4.13, offtune: 2600, forte2: 6.51 },
  ]});

/** Spends both gauges in full — pre-clamped here so its own declared -100s land exactly on 0 —
 *  and opens Ephemeral Transcendence. Under Clarity it also arms the enhanced Heaven's Reckoning,
 *  which is Clarity's own doing (see HEAVENS_CLARITY). */
const HA = qxAction("Heavy - Stringblade", {
  animFrames: 137,
  node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 26, mv: 14.62, energy: 0.18, concerto: 0.35, offtune: 560 },
    { hitFrame: 35, mv: 14.62, energy: 0.18, concerto: 0.35, offtune: 560 },
    { hitFrame: 43, mv: 21.92, energy: 0.27, concerto: 0.53, offtune: 840 },
    { hitFrame: 44, mv: 14.62, energy: 0.18, concerto: 0.35, offtune: 560 },
    { hitFrame: 52, mv: 21.92, energy: 0.27, concerto: 0.53, offtune: 840 },
    { hitFrame: 54, mv: 21.92, energy: 0.27, concerto: 0.53, offtune: 840 },
    { hitFrame: 61, mv: 21.92, energy: 0.27, concerto: 0.53, offtune: 840 },
    { hitFrame: 63, mv: 21.92, energy: 0.27, concerto: 0.53, offtune: 840 },
    { hitFrame: 72, mv: 21.92, energy: 0.27, concerto: 0.53, offtune: 840 },
    { hitFrame: 109, mv: 263.03, energy: 3.15, concerto: 6.3, offtune: 10080, updateDebuffs: () => stringbladeMindlock(), hitGlobal: () => stringbladeBanks() },
  ], castForte1: -100, castForte2: -100,
});

// --- Severing Note: Judgement banks nothing of its own on the table (the page's "45 Qin Heart
//     during this skill" isn't there) — only Resonant Chime's 30 after an Intro; Ascendant is the
//     Drawn-stance skill inside a basic chain.
const Skill = qxAction("Skill - Severing Note: Judgement", { animFrames: 81, cooldown: 60 * 20, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 4, mv: 20.88, energy: 0.38, concerto: 0.75, offtune: 1200 },
    { hitFrame: 13, mv: 20.88, energy: 0.38, concerto: 0.75, offtune: 1200 },
    { hitFrame: 72, mv: 97.42, energy: 1.75, concerto: 3.5, offtune: 5600, forte1: 45 },
  ]});
const Ascendant = qxAction("Skill - Severing Note: Ascendant", { animFrames: 64, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 16, mv: 33.13, energy: 0.6, concerto: 1.19, offtune: 1904, forte2: 3.18 },
    { hitFrame: 16, mv: 28.4, energy: 0.51, concerto: 1.02, offtune: 1632, forte2: 2.73 },
    { hitFrame: 25, commitFrame: 16, mv: 33.13, energy: 0.6, concerto: 1.19, offtune: 1904, forte2: 3.18 },
  ]});

// --- Ephemeral Transcendence: the basics bank Heart Sword Intent (forte1, cleared by the Heavy
//     on the way in) and, while it's short of full, deal double — see EPHEMERAL and QINGXIAO_RESONATOR's own
//     applyStats. Heaven's Reckoning spends it all and ends the state. Stage 1 is the table's own
//     row (a 22.45% hit more than nanoka's). Both dodge counters carry +10 Concerto (CLAUDE.md).
const FBA1 = qxAction("Basic - Ephemeral Transcendence 1", { animFrames: 40, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 12, mv: 56.1137, energy: 1.0137, concerto: 2.025, offtune: 3225 },
    { hitFrame: 16, mv: 28.0631, energy: 0.5131, concerto: 1.0125, offtune: 1612.5 },
    { hitFrame: 19, mv: 28.0632, energy: 0.5132, concerto: 1.0125, offtune: 1612.5, forte1: 25.55 },
  ],
  applyStats: () => { if (forte1() < 100) addStat(Stat.MulMv, 100); }
});
const FBA2 = qxAction("Basic - Ephemeral Transcendence 2", { animFrames: 58, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 14, mv: 23.11, energy: 0.42, concerto: 0.83, offtune: 1328 },
    { hitFrame: 17, mv: 23.11, energy: 0.42, concerto: 0.83, offtune: 1328 },
    { hitFrame: 20, mv: 23.11, energy: 0.42, concerto: 0.83, offtune: 1328 },
    { hitFrame: 26, mv: 23.11, energy: 0.42, concerto: 0.83, offtune: 1328 },
    { hitFrame: 29, mv: 23.11, energy: 0.42, concerto: 0.83, offtune: 1328, forte1: 26.35 },
  ],
applyStats: () => { if (forte1() < 100) addStat(Stat.MulMv, 100); }
});
const FBA3 = qxAction("Basic - Ephemeral Transcendence 3", { animFrames: 57, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 10, mv: 20.88, energy: 0.38, concerto: 0.75, offtune: 1200 },
    { hitFrame: 20, mv: 31.32, energy: 0.57, concerto: 1.13, offtune: 1800 },
    { hitFrame: 30, mv: 20.88, energy: 0.38, concerto: 0.75, offtune: 1200 },
    { hitFrame: 40, mv: 31.32, energy: 0.57, concerto: 1.13, offtune: 1800 },
    { hitFrame: 50, mv: 20.88, energy: 0.38, concerto: 0.75, offtune: 1200, forte1: 28.56 },
  ],
applyStats: () => { if (forte1() < 100) addStat(Stat.MulMv, 100); }
});
const FBA4 = qxAction("Basic - Ephemeral Transcendence 4", { animFrames: 87, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 10, mv: 18.1, energy: 0.33, concerto: 0.65, offtune: 1040 },
    { hitFrame: 23, mv: 18.1, energy: 0.33, concerto: 0.65, offtune: 1040 },
    { hitFrame: 32, mv: 18.1, energy: 0.33, concerto: 0.65, offtune: 1040 },
    { hitFrame: 43, mv: 18.1, energy: 0.33, concerto: 0.65, offtune: 1040 },
    { hitFrame: 61, mv: 108.56, energy: 1.95, concerto: 3.9, offtune: 6240, forte1: 41.2 },
  ],
applyStats: () => { if (forte1() < 100) addStat(Stat.MulMv, 100); }
});
const FDC = qxAction("Dodge Counter - Ephemeral Transcendence", { animFrames: 87, node: Node.Forte, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 10, mv: 26.45, energy: 0.48, concerto: 1.95, offtune: 1520 },
    { hitFrame: 23, mv: 26.45, energy: 0.48, concerto: 1.95, offtune: 1520 },
    { hitFrame: 32, mv: 26.45, energy: 0.48, concerto: 1.95, offtune: 1520 },
    { hitFrame: 43, mv: 26.45, energy: 0.48, concerto: 1.95, offtune: 1520 },
    { hitFrame: 61, mv: 158.66, energy: 2.85, concerto: 11.7, offtune: 9120, forte1: 60.26 },
  ],
applyStats: () => { if (forte1() < 100) addStat(Stat.MulMv, 100); }
});
/** Spends all Heart Sword Intent and takes Heaven's Clarity with it. */
const FHA = qxAction("Forte Heavy - Heaven's Reckoning", {
  animFrames: 180, timestop: 180, motionStop: 180,
  node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 32, mv: 27.84, energy: 0.92, offtune: 320 },
    { hitFrame: 44, mv: 27.84, energy: 0.92, offtune: 320 },
    { hitFrame: 47, mv: 27.84, energy: 0.92, offtune: 320 },
    { hitFrame: 58, mv: 27.84, energy: 0.92, offtune: 320 },
    { hitFrame: 60, mv: 27.84, energy: 0.92, offtune: 320 },
    { hitFrame: 72, mv: 27.84, energy: 0.92, offtune: 320 },
    { hitFrame: 83, mv: 27.84, energy: 0.92, offtune: 320 },
    { hitFrame: 90, mv: 27.84, energy: 0.92, offtune: 320 },
    { hitFrame: 102, mv: 27.84, energy: 0.92, offtune: 320 },
    { hitFrame: 119, mv: 445.34, energy: 14.72, offtune: 5120 },
  ], castConcerto: 25, castForte1: -100,
  updateBuffs: () => revokeCurrent(HEAVENS_CLARITY),
});

const Liberation = qxAction("Liberation - Billows Beneath Heaven", {
  animFrames: 300, timestop: 300, motionStop: 300, cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, bullets: [
    { hitFrame: 140, mv: 33.41, offtune: 160 },
    { hitFrame: 146, mv: 33.41, offtune: 160 },
    { hitFrame: 152, mv: 33.41, offtune: 160 },
    { hitFrame: 158, mv: 33.41, offtune: 160 },
    { hitFrame: 164, mv: 33.41, offtune: 160 },
    { hitFrame: 170, mv: 33.41, offtune: 160 },
    { hitFrame: 176, mv: 33.41, offtune: 160 },
    { hitFrame: 182, mv: 33.41, offtune: 160 },
    { hitFrame: 188, mv: 33.41, offtune: 160 },
    { hitFrame: 194, mv: 33.41, offtune: 160 },
    { hitFrame: 238, mv: 1336.01, offtune: 6400 },
  ],
  castConcerto: 20, resetEnergy: true,
  updateBuffs: () => applyCurrent(HEAVENS_CLARITY, 1),
});

/** Banks nothing on the table — the page's "restores 30 Sword Cadence" isn't there — and arms
 *  Resonant Chime. */
const Intro = qxAction("Intro - Tonality Shift", {
  animFrames: 64, prioFrames: 64, motionStop: 29,
  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [
    { hitFrame: 35, mv: 39.79, energy: 3, offtune: 2288 },
    { hitFrame: 43, mv: 46.42, energy: 3.5, offtune: 2669 },
    { hitFrame: 52, mv: 46.42, energy: 3.5, offtune: 2669 },
  ], castConcerto: 10, castForte2: 30,
  updateBuffs: () => applyCurrent(RESONANT_CHIME, 1),
});
/** S1's Juque Perdition: 400% as Basic Attack DMG, off the first Stringblade/Ephemeral basic to land
 *  while she holds Exorcising Seal, which it then spends — every stack spent is +4% more damage
 *  taken from it. Not a row on the kit page, so no energy, concerto or off-tune of its own. */
const JuquePerdition = qxAction("Basic - Juque Perdition (S1)", {
  node: Node.Normal, type: Type.Basic, mv: 400,
  applyStats: () => addStat(Stat.DamageTaken, 4 * stacksOf(EXORCISING_SEAL)),
  afterAction: () => revokeCurrent(EXORCISING_SEAL),
});

/** Lingering Song: a real 800% Aero hit on the way out. */
const Outro = qxAction("Outro - Lingering Song", { animFrames: 0, cast: Cast.Outro, type: Type.Outro, bullets: [{ hitFrame: 0, mv: 800 }], castConcerto: -100});

/* ------------------------------------------------------------------------------------- buffs */

/** Mindlock, her own enemy debuff — 15 frozenStacks, never decays. Nothing but her reads it. */
const MINDLOCK = new Debuff({ name: "Qingxiao: Mindlock", 
  maxStacks: 15,
  applyStats: () => {
    if (!mindlockPays()) return;
    const n = stacksOfEnemy(MINDLOCK);
    addStat(Stat.Amp, 2 * n + 5 * Math.min(n, 7));
  },
});

/** What Mindlock pays on — those five plus Heavy Attack - Stringblade, Heaven's Reckoning and the
 *  Liberation; Juque Perdition too from S6, which is her own node, read off her slot (the
 *  Perdition lands there). */
const MINDLOCK_PAYS = new Set<Action>([HA, FBA1, FBA2, FBA3, FBA4, FDC, FHA, Liberation]);
const mindlockPays = (): boolean => runningAnyOf(MINDLOCK_PAYS) || (runningAction(JuquePerdition) && isHeld(QX_S6));

/** Gathered Mind: 1 stack from combat start (only a kill of a Mindlocked target grows it, which
 *  there's nothing to model against one standing target). It pays out twice, each once per target:
 *  Mindlock equal to its stacks on the team's first damaging hit — laid at combat start with the
 *  stack itself, see QX_INHERENT_1, since that hit is the very next action either way — and one
 *  extra Tune Strain - Interfered on the first Tune Break, which spends it. Held team-wide rather
 *  than on her slot so that break is seen whoever lands it, and inflicted from updateDebuffs so
 *  both Mindlock sources below count it on that same break. */
const GATHERED_MIND = new Buff({
  name: "Qingxiao: Gathered Mind", maxStacks: 15, duration: 60 * 30,
  updateDebuffs: () => {
    if (!runningAction(TUNE_BREAK) || stacksOfEnemy(TUNE_STRAIN_SHIFTING) <= 0) return;
    // two of them from S3 — her own node, read off her slot since this buff is the team's
    applyEnemy(TUNE_STRAIN_INTERFERED, currentTeam().slots.find((m) => m.resonator === QINGXIAO_RESONATOR)?.isHeld(QX_S3) ? 2 : 1);
    revokeTeam(GATHERED_MIND);
  },
});

/** Resonant Chime: her Intro arms it, the next Severing Note: Judgement banks 30 more Qin Heart
 *  and spends it. */
const RESONANT_CHIME = new Buff({
  name: "Qingxiao: Resonant Chime",
  updateBuffs: () => {
    if (!runningAction(Skill)) return;
    addToCast({ forte1: 30 });
    revokeCurrent(RESONANT_CHIME);
  },
});

const CLARITY_FORTE = new Set<Action>([BA1, BA2, BA3, BA4, MA1, MA2, MA3, DC, Ascendant]);
/** Heaven's Clarity: up from combat start and again off every Liberation, gone the moment
 *  Heaven's Reckoning is cast. While up, Sheathed/Drawn hits bank their gauges twice as fast, and
 *  Heavy Attack - Stringblade lays 3 Mindlock and enhances the next Heaven's Reckoning. */
const HEAVENS_CLARITY = new Buff({
  name: "Qingxiao: Heaven's Clarity",
  grants: [{ on: onAction(HA), buff: () => RECKONING_ENHANCED }],
  applyStats: () => {
    // what the press gains on its hits, each hit taking its share
    const a = pressed();
    // Sheathed/Drawn stance hits only — Heart Sword Intent rides forte1 as well, and Ephemeral
    // Transcendence is neither stance, so its own gains are never doubled
    if (CLARITY_FORTE.has(pressed())) {
      if (a.forte1 > a.castForte[0]!) addStat(Stat.AddForte1, a.forte1 - a.castForte[0]!);
      if (a.forte2 > a.castForte[1]!) addStat(Stat.AddForte2, a.forte2 - a.castForte[1]!);
    }
  },
});

/** The enhanced Heaven's Reckoning: x2 multiplier and 160,000 off-tune in place of the plain
 *  8,000 (nanoka's own enhanced rows). Ends on switching out or once it's cast. */
const RECKONING_ENHANCED = new Buff({
  name: "Qingxiao: Heaven's Reckoning Enhancement",
  lostOnSwap: true,
  applyStats: () => { if (runningAction(FHA)) { addStat(Stat.MulMv, 100); addStat(Stat.AddOfftune, 152000); } },
  afterAction: () => { if (runningAction(FHA)) revokeCurrent(RECKONING_ENHANCED); },
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
 *  Mindlock per Interfered is inflicted with the break itself, see QINGXIAO_RESONATOR's own hitGlobal. */
const QX_INHERENT_2 = new Inherent({
  name: "Inherent: To Know, To Banish",
  // its own Mindlock, on top of the Forte Circuit's: one more per Tune Strain - Interfered the team
  // inflicts, since the target is Overlord/Calamity Class (assumed — this project's is a boss)
  hitGlobal: () => {
    const interfered = applied(TUNE_STRAIN_INTERFERED);
    if (interfered) applyEnemy(MINDLOCK, interfered);
  },
  applyStats: () => {
    if (!mindlockPays()) return;
    const n = stacksOfEnemy(MINDLOCK);
    addStat(Stat.DmgBonus, 2 * n + 5 * Math.min(n, 7));
  },
});

const QINGXIAO_TALENTS = new Talent({
  name: "Qingxiao: Talents",
  stats: [[Stat.BonusAtk, 12], [Stat.CritDmg, 16]],
});

/** This kit's own carrier for the Tune Strain payout (tunebreak.ts's `strainPayout`). */
const QX_STRAIN_PAYOUT = strainPayout();

const QINGXIAO_RESONATOR = new Resonator({
  name: "Qingxiao",
  stats: [[Stat.BaseHp, 10300], [Stat.BaseAtk, 462.5], [Stat.BaseDef, 1112.2202], [Stat.Tbb, 10]],
  talent: QINGXIAO_TALENTS,
  inherent1: QX_INHERENT_1,
  inherent2: QX_INHERENT_2,
  element: Attribute.Aero,
  weapon: WeaponType.Sword,
  color: "#6cc5b0",
  intro: Intro,
  tuneBreak: tuneBreak(120, 120, 100, [[64, 100], [70, 100], [76, 100], [82, 100], [101, 1200]]),
  maxEnergy: 125,
  maxForte1: 100,
  maxForte2: 100,

  // Draw and Sunder: "while Qingxiao is in the team"; Heaven's Clarity and Formless Heart Sword
  // are up from the first action
  combatStart: () => {
    maxStackIncrease(TUNE_STRAIN_INTERFERED, 1); applyCurrent(QX_STRAIN_PAYOUT, 1);
    applyCurrent(HEAVENS_CLARITY, 1);
  },


  // every damaging cast of hers lays Tune Strain - Shifting (the echo is its own cast, not hers)
  updateDebuffs: () => {
    const a = currentAction();
    if (a.bullets.length > 0 && a.cast !== null && a.cast !== Cast.Echo) applyStrain();
  },

  // The Forte Circuit's own Mindlock line: +1 for every Tune Strain - Interfered the team inflicts.
  // To Know, To Banish adds its own on top (QX_INHERENT_2) and Heaven's Clarity its three, each
  // from the piece that grants them.
  hitGlobal: () => {
    // 1 mindlock per interfered baseline
    const interfered = applied(TUNE_STRAIN_INTERFERED);
    if (interfered) applyEnemy(MINDLOCK, interfered);
  },

});

/* --------------------------------------------------------------------------------- sequences */

/** Exorcising Seal (S1): 25 on entering combat, and from S6 as many as the target's Mindlock off
 *  every Heavy Attack - Stringblade. The first Stringblade or Ephemeral basic to land while any is
 *  held spends the lot on a Juque Perdition. */
const EXORCISING_SEAL = new Buff({ name: "Qingxiao S1: Exorcising Seal", maxStacks: 25 });
const SEAL_SPENDERS = new Set<Action>([BA1, BA2, BA3, BA4, MA1, MA2, MA3, FBA1, FBA2, FBA3, FBA4]);
/** S1: +16% Crit. Rate, and the Seal above. Swordlight Ward is damage taken. */
const QX_S1 = new Sequence({
  name: "Qingxiao S1: Like Clouds That Meet and Drift Apart",
  stats: [[Stat.CritRate, 16]],
  combatStart: () => applyCurrent(EXORCISING_SEAL, 25),
  // Juque Perdition spends the Seal the moment it lands, so a later hit of the press finds none
  updateDebuffs: () => { if (runningAnyOf(SEAL_SPENDERS) && stacksOf(EXORCISING_SEAL) > 0) queue(JuquePerdition); },
});

/** S2: +40% multiplier on Heavy Attack - Stringblade, Mindlock stacks to 25, and Heaven's Clarity
 *  has that Heavy lay 6 Mindlock rather than 3 (`stringbladeMindlock()`). The
 *  Gathered Mind cap only ever matters off kills. */
const QX_S2 = new Sequence({
  name: "Qingxiao S2: Like Petals That Fall Without a Sound",
  combatStart: () => maxStackIncrease(MINDLOCK, 10),
  applyStats: () => { if (runningAction(HA)) addStat(Stat.MulMv, 40); },
});

/** World in Chorus (S3): Heavy Attack - Stringblade banks the target's Mindlock count as stacks,
 *  +3% multiplier each on Heaven's Reckoning, which spends them. */
const WORLD_IN_CHORUS = new Buff({
  name: "Qingxiao S3: World in Chorus", maxStacks: 25,
  applyStats: () => { if (runningAction(FHA)) addStat(Stat.MulMv, 3 * frozenStacks()); },
  afterAction: () => { if (runningAction(FHA)) revokeCurrent(WORLD_IN_CHORUS); },
});
/** S3: +100% Crit. DMG on the Liberation, World in Chorus above, and Gathered Mind's break lays two
 *  Interfered (in GATHERED_MIND itself). */
const QX_S3 = new Sequence({
  name: "Qingxiao S3: Dreams Fade, Sword Abides",
  applyStats: () => { if (runningAction(Liberation)) addStat(Stat.CritDmg, 100); },
});

/** S4: +20% ATK for 8s to whoever on the team lays Tune Strain - Shifting — every damaging cast of
 *  hers does, so hers holds for her whole window; a teammate's goes with their swap-out. */
const SIDE_BY_SIDE = new Buff({
  name: "Qingxiao S4: Wherever the Road Leads, Side by Side",
  duration: 60 * 8,
  stats: [[Stat.BonusAtk, 20]],
});
const QX_S4 = new Sequence({
  name: "Qingxiao S4: Wherever the Road Leads, Side by Side",
  // from hitGlobal "me" is the holder, so the acting slot has to be named (status.ts)
  hitGlobal: () => {
    const acting = currentTeam().slot;
    if (acting.resonator && appliedByMember(TUNE_STRAIN_SHIFTING, acting)) addBuff(acting.resonator, SIDE_BY_SIDE, 1);
  },
});

/** S5: +100% multiplier on Severing Note: Judgement. Flight Qi is movement. */
const QX_S5 = new Sequence({
  name: "Qingxiao S5: Cold Steel That Longs to Warm the Snow",
  applyStats: () => { if (runningAction(Skill)) addStat(Stat.MulMv, 100); },
});

/** S6: the target takes 40% more from Stringblade, Heaven's Reckoning, the Liberation and Juque
 *  Perdition; Stringblade banks Exorcising Seal equal to the target's Mindlock; Mindlock pays on
 *  Juque Perdition the same twice-over way it pays her Heavies (`mindlockPays()`); and her own
 *  Strain response is a fifth stronger — a fifth of tunebreak.ts's own 0.12 a point of Tune Break
 *  Boost, late, once every Tbb source has landed. */
const QX_S6 = new Sequence({
  name: "Qingxiao S6: Cleanse This Tarnished Age, Till All Runs Clear",
  applyStats: () => {
    if (runningAction(HA) || runningAction(FHA) || runningAction(Liberation) || runningAction(JuquePerdition)) addStat(Stat.DamageTaken, 40);
  },
  lateConvertStats: () => addStat(Stat.TotalDmg, 0.2 * 0.12 * getStat(Stat.Tbb) * stacksOfEnemy(TUNE_STRAIN_INTERFERED)),
});

const QX_SEQUENCES = [QX_S1, QX_S2, QX_S3, QX_S4, QX_S5, QX_S6];

/** Stringblade's finishing hit: Heaven's Clarity's 3 Mindlock, S2's 3 more on top. */
function stringbladeMindlock(): void {
  if (isHeld(HEAVENS_CLARITY)) applyEnemy(MINDLOCK, isHeld(QX_S2) ? 6 : 3);
}
/** ...and, once every inflicting is in, S3's World in Chorus and S6's Seal off the Mindlock count. */
function stringbladeBanks(): void {
  if (isHeld(QX_S3)) applyCurrent(WORLD_IN_CHORUS, stacksOfEnemy(MINDLOCK));
  if (isHeld(QX_S6)) applyCurrent(EXORCISING_SEAL, stacksOfEnemy(MINDLOCK));
}

/* ---------------------------------------------------------------------------------- rotation */

/** The migrated sheet's own "qx" line: Intro into the mid-air finisher, Judgement, the full
 *  Stringblade chain to fill both gauges, Heavy Attack - Stringblade into Ephemeral Transcendence,
 *  its four basics to fill Heart Sword Intent, Heaven's Reckoning (enhanced, off the Heavy), the
 *  Liberation to bring Clarity back, the echo and out. Both opener and loop. */

const FBA1234 = new ActionGroup("Forte - Ephemeral Transcendence 1234", [FBA1, FBA2, FBA3, FBA4]);
const MA123 = new ActionGroup("Mid-air - Stringblade 123", [MA1, MA2, MA3]);

const BA34 = new ActionGroup("Basic - Stringblade 34", [BA3, BA4]);

const QX_ROTATION = new Rotation([
  START_3, Liberation, ECHO.instaSwap(),
  INTRO, MA123, BA34, Skill, HA,
  FBA1234.easyCancel(), FHA,
  Liberation, ECHO.instaSwap(), Outro,
]);

export const QINGXIAO = new Loadout({
  resonator: QINGXIAO_RESONATOR,
  weapons: [GLINT_OF_CLOUDS, EMERALD_OF_GENESIS, NEW_STD_SWORD, RED_SPRING],
  echoLoadouts: [new EchoLoadout(CALAMITY_EFFIGY, HEART_OF_EVILS_PURGE_5PC),
      new EchoLoadout(NM_KELPIE, WINDWARD_5PC),],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Aero3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.AtkPct, Substat.FlatAtk, Substat.Heavy, Substat.Liberation),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.FlatAtk, Substat.Heavy, Substat.Liberation),
  rotation: QX_ROTATION,
  sequences: QX_SEQUENCES,
});
