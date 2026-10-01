/**
 * Hiyuki — a Glacio Sword main DPS and the kit the whole Glacio Chafe status is built around.
 * Filed with Chisa under Ashinohara, the country she comes from, though she is a 3.6 release.
 *
 * Almost everything she casts is *considered Resonance Liberation DMG* — the Foreclaimed Self
 * basic chain, both Heavy Attacks, her Intro, and the Iai. Only the Present Self chain she opens
 * from is ordinary Basic Attack DMG, and only her three Resonance Skill forms are Skill DMG.
 *
 * **Glacio Bite** (Everfrost Dominion) is the reason she exists: while she is on the team every
 * stack of Glacio Chafe *anyone* inflicts is converted, and a converted stack calculates at the
 * target's own stack *limit* rather than the rung it just reached. On a bare team that is the
 * 10-stack rung on every single application; with a kit that raises the cap (Chisa's Resonant
 * Thread of Closure, +3) it is the 13-stack rung instead, which is where the pairing below comes
 * from. The conversion itself is her Resonator's own `hitGlobal` below — it sees a teammate's
 * hit as readily as her own. Glacio Bite DMG *is* Glacio Chafe DMG, so it reuses status.ts's
 * shared ladder; every other part of the mechanic lives in this file.
 *
 * Her loop is two forms five counters. The three real bars are forte gauges; the two that are
 * just points capped at 3 are ordinary stacking buffs, which cap themselves and read in the buff
 * panel by name.
 * - **Present Self** (forte1, Dedication, 0-300): the Intro banks 200 and Basic Stage 3 banks 100.
 *   At 300 the Heavy becomes **Frost Splinter**, which spends the bar and opens the Liberation.
 * - **Foreclaiming: Inward Vision** spends Dedication for 3 **Frostharden Iai** and 50
 *   **Frostheart** (forte2, 0-300), lands 4 stacks of Chafe, and drops her into **Foreclaimed
 *   Self**.
 * - There the whole chain refills Frostheart, and every 100 of it buys a **Basic Attack - Iai**.
 *   An Iai with Frostharden left spends a point for 3 more Chafe stacks and 1 **Whiteout
 *   Bitterfrost** (forte3); at 3 Whiteout the Heavy becomes **Bitterfrost**, which trades them for
 *   a **Snowforged Blade**.
 * - **Foreclaiming: Blade Liberation** closes the form: it clears Dedication and Frostheart, and
 *   each Snowforged Blade it consumes is +795.24% on its own multiplier. The rotation holds the
 *   cast rather than tapping it — a tap only spends Snowforged Blade at exactly 3, while a hold
 *   spends whatever is banked, which is the honest steady state at one blade a loop (three
 *   Frostharden per Inward Vision is three Iai is one Bitterfrost).
 *
 * Two pieces carry no stat and are here for the kit's shape: Frostbind (Inward Vision/Iai spending
 * 10 Glacio Bite stacks to stun) is purely a lockdown, and Ephemeral Realm only matters as the
 * single Snowforged Blade she walks into the fight already holding. Resonance Skill - Present Self
 * enhancing the next Stage 3 for another 100 Dedication is modelled but never paid: the rotation
 * spends that skill in the opening scramble and swaps, which the kit text says ends the effect,
 * and the Intro's own 200 plus one Stage 3 already lands the bar on exactly 300.
 *
 * MVs off nanoka.cc (character 1108) at level 10, per-hit x hit count as CLAUDE.md describes, with
 * the flat Concerto Regen rows folded in (Inward Vision and Blade Liberation 20 apiece, the Intro
 * and Bitterfrost 10) and the hidden +10 on both dodge counters. The five forte gauges are
 * wuwalab's frame data (api.wuwalab.com/api/app/characters/hiyuki), which nanoka does not expose;
 * both agree on every MV/energy/concerto/off-tune figure they share. Her `weakness_mastery` is 0,
 * so unlike the tune-break-era cast she carries no flat Tune Break Boost of her own.
 */
import { Stat, Attribute, WeaponType, Type, Subtype, Cast, Node, Scaling } from "../../engine/stats.js";
import { Buff, Debuff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Sequence } from "../../engine/gear.js";
import {
  asSource,
  addStat,
  applied,
  appliedByMe,
  appliedByMember,
  applyCurrent,
  applyEnemy,
  applyTeam,
  currentAction,
  onAction,
  runningAction,
  currentTeam,
  frozenStacks,
  queue,
  queueEvent,
  queueOn,
  removeStack,
  consume,
  revokeEnemy,
  revokeCurrent,
  revokeTeam,
  stacksOf,
  stacksOfEnemy,
  forte1,
  forte3,
  forte2,
  isActive,
  isHeld,
  currentMember,
  runningAnyOf,
} from "../../engine/context.js";
import { ActionGroup, Action, ActionField, Cooldown, Rotation, FIRST_INTRO, ECHO, NOINTRO, NOINTRO_FIRST, INTRO } from "../../engine/rotation.js";
import { GLACIO_CHAFE, GLACIO_CHAFE_ACTIONS, HAVOC_BANE, HEALS, OWN_CHAFE_RUNGS } from "../../shared/status.js";
import { FROSTBURN } from "../../weapons/sword.js";
import { EMERALD_OF_GENESIS } from "../../weapons/standard.js";
import { QUIET_SNOWFALL_5PC, VOIDBORNE_CONSTRUCT } from "../../echoes/lahairoi.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";
import { TUNE_BREAK } from "../../shared/tunebreak.js";

/* ------------------------------------------------------------------------------ glacio bite */

/** Her two windows: every converted stack's own rung, and every Fine Snow hit the Snow Rust tier
 *  fires. A visit lands dozens of both, so each reads as one row under the Intro that opened the
 *  window rather than a line apiece — and only what lands while she is on field goes in one. The rungs are the shared ladder's (status.ts) filed under her
 *  field — the same hits, named the same, with somewhere of hers to sit. */
const GLACIO_BITE_FIELD = new ActionField("Hiyuki: Glacio Bite");
const FINE_SNOW = new ActionField("Hiyuki: Fine Snow");
const BITE_RUNGS: (Action | null)[] = GLACIO_CHAFE_ACTIONS.map((a) => a?.variant(a.name, { field: GLACIO_BITE_FIELD }) ?? null);
/** What opens them: nameless, so neither shows in the held list — a window is what the report
 *  reads them by, not something of hers to display. */
const GLACIO_BITE_WINDOW = new Buff({ field: GLACIO_BITE_FIELD });
const FINE_SNOW_WINDOW = new Buff({ field: FINE_SNOW });

/** What the team's Glacio Chafe becomes while she is on the team — laid by the conversion on her
 *  Resonator below, which is also what fires the damage; this carries no rule of its own. It
 *  stacks and is spent the way Chafe does (Frostbind eats ten), and its ceiling stays Chafe's base
 *  10: a kit that raises the Negative Status caps (Chisa's Resonant Thread of Closure) raises
 *  Glacio Chafe's, which is the one the damage rung reads, while this count only ever gates
 *  Frostbind — and Frostbind pays nothing. */
const GLACIO_BITE = new Debuff({ name: "Glacio Bite", maxStacks: 10 });

/* ----------------------------------------------------------------------------------- actions */

function hiyukiAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Glacio, scaling: Scaling.Atk, ...def });
}

/** One stack of Glacio Chafe on hit — Glacio Bite by the time it lands, since she is on the team. */
const CHAFE = { updateDebuffs: () => applyEnemy(GLACIO_CHAFE, 1) };
/** Inward Vision and the Iai both spend 10 Glacio Bite stacks to Frostbind the target, if it has
 *  them. Purely a lockdown — no damage, and under Bite the rung is the cap rather than the count,
 *  so spending them costs nothing either.
 *
 *  On the hit, ahead of every held gear's `updateDebuffs`, so a "when you consume" payout (Suisui's
 *  Undulating Mist) reaches the very hit that consumed. It reads the Bite banked before this hit. */
const FROSTBIND = {
  updateDebuffs: () => { if (stacksOfEnemy(GLACIO_BITE) >= 10) consume(GLACIO_BITE, 10); },
};

// --- Present Self: the chain she opens from, and the only ordinary Basic Attack DMG she has.
const BA1 = hiyukiAction("Basic - Present Self 1", { animFrames: 32, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 10, mv: 37.72, energy: 0.64, concerto: 1.22, offtune: 2168 },
    { hitFrame: 25, mv: 37.72, energy: 0.64, concerto: 1.22, offtune: 2168 },
  ]});
const BA2 = hiyukiAction("Basic - Present Self 2", { animFrames: 38, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 20, mv: 90.25, energy: 1.53, concerto: 2.92, offtune: 5188 }]});
const BA3 = hiyukiAction("Basic - Present Self 3", { animFrames: 53, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 9, mv: 4.92, energy: 0.09, concerto: 0.16, offtune: 283,
      ...CHAFE },
    { hitFrame: 15, mv: 4.92, energy: 0.09, concerto: 0.16, offtune: 283 },
    { hitFrame: 21, mv: 4.92, energy: 0.09, concerto: 0.16, offtune: 283 },
    { hitFrame: 27, mv: 4.92, energy: 0.09, concerto: 0.16, offtune: 283 },
    { hitFrame: 33, mv: 4.92, energy: 0.09, concerto: 0.16, offtune: 283 },
    { hitFrame: 40, mv: 98.37, energy: 1.67, concerto: 3.19, offtune: 5655 },
  ], castForte1: 100});
const MA = hiyukiAction("Mid-air - Present Self Plunge", { animFrames: 52, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 37, mv: 128.18, energy: 2.17, concerto: 4.15, offtune: 7368 }]});
const DC = hiyukiAction("Dodge Counter - Present Self 2", { animFrames: 38, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [{ hitFrame: 20, mv: 173.75, energy: 2.94, concerto: 15.62, offtune: 9988 }]});
/** Three arrows, considered Resonance Liberation DMG, and what opens Inward Vision. */
const FrostSplinter = hiyukiAction("Heavy - Frost Splinter: Present Self", {
  animFrames: 132,
  node: Node.Normal, cast: Cast.Heavy, type: Type.Liberation, bullets: [
    { hitFrame: 28, mv: 79.31, energy: 1.31, concerto: 2.5, offtune: 4432,
      ...CHAFE },
    { hitFrame: 44, mv: 79.31, energy: 1.31, concerto: 2.5, offtune: 4432 },
    { hitFrame: 105, mv: 158.61, energy: 2.61, concerto: 4.99, offtune: 8864 },
  ],
  // only fires at 300 Dedication, and the last arrow spends the whole bar: maxForte1 (300 below)
  // clamps an overrun back to the cap before this lands exactly on 0
  castForte1: -300,
});

// --- Foreclaimed Self: the same buttons, five stages instead of three, all Resonance Liberation
//     DMG, and every hit but Bitterfrost refills Frostheart.
const FBA1 = hiyukiAction("Basic - Foreclaimed Self 1", { animFrames: 22, node: Node.Normal, cast: Cast.Basic, type: Type.Liberation, bullets: [{ hitFrame: 10, mv: 49.27, energy: 0.84, concerto: 1.6, offtune: 2832, forte2: 10, updateDebuffs: () => { if (isHeld(SPRINGLESS)) applyEnemy(GLACIO_CHAFE, 1); } }]});
const FBA2 = hiyukiAction("Basic - Foreclaimed Self 2", { animFrames: 35, node: Node.Normal, cast: Cast.Basic, type: Type.Liberation, bullets: [
    { hitFrame: 14, mv: 40.02, energy: 0.68, concerto: 1.3, offtune: 2300, forte2: 8, updateDebuffs: () => { if (isHeld(SPRINGLESS)) applyEnemy(GLACIO_CHAFE, 1); } },
    { hitFrame: 29, mv: 40.02, energy: 0.68, concerto: 1.3, offtune: 2300, forte2: 7 },
  ]});
const FBA3 = hiyukiAction("Basic - Foreclaimed Self 3", { animFrames: 74, node: Node.Normal, cast: Cast.Basic, type: Type.Liberation, bullets: [
    { hitFrame: 10, mv: 25.16, energy: 0.43, concerto: 0.82, offtune: 1446, forte2: 5,
      ...CHAFE },
    { hitFrame: 16, commitFrame: 10, mv: 25.16, energy: 0.43, concerto: 0.82, offtune: 1446, forte2: 5 },
    { hitFrame: 22, commitFrame: 10, mv: 25.16, energy: 0.43, concerto: 0.82, offtune: 1446, forte2: 5 },
    { hitFrame: 28, commitFrame: 10, mv: 25.16, energy: 0.43, concerto: 0.82, offtune: 1446, forte2: 5 },
    { hitFrame: 58, commitFrame: 10, mv: 67.08, energy: 1.14, concerto: 2.17, offtune: 3856, forte2: 12 },
  ]});
const FBA4 = hiyukiAction("Basic - Foreclaimed Self 4", { animFrames: 65, node: Node.Normal, cast: Cast.Basic, type: Type.Liberation, bullets: [
    { hitFrame: 8, mv: 29.93, energy: 0.51, concerto: 0.97, offtune: 1720, forte2: 6,
      ...CHAFE },
    { hitFrame: 16, mv: 29.93, energy: 0.51, concerto: 0.97, offtune: 1720, forte2: 6 },
    { hitFrame: 28, mv: 29.93, energy: 0.51, concerto: 0.97, offtune: 1720, forte2: 6 },
    { hitFrame: 36, mv: 29.93, energy: 0.51, concerto: 0.97, offtune: 1720, forte2: 6 },
    { hitFrame: 44, mv: 29.93, energy: 0.51, concerto: 0.97, offtune: 1720, forte2: 6 },
  ]});
const FBA5 = hiyukiAction("Basic - Foreclaimed Self 5", { animFrames: 82, node: Node.Normal, cast: Cast.Basic, type: Type.Liberation, bullets: [
    { hitFrame: 17, mv: 12.17, energy: 0.21, concerto: 0.4, offtune: 700, forte2: 24,
      ...CHAFE },
    { hitFrame: 70, commitFrame: 23, mv: 109.47, energy: 1.85, concerto: 3.54, offtune: 6293 },
  ]});
const FDC = hiyukiAction("Dodge Counter - Foreclaimed Self 2", { animFrames: 34, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Liberation, bullets: [
    { hitFrame: 10, mv: 81.77, energy: 1.39, concerto: 7.65, offtune: 4700, forte2: 16 },
    { hitFrame: 25, mv: 81.77, energy: 1.39, concerto: 7.65, offtune: 4700, forte2: 16 },
  ]});
const FMA1 = hiyukiAction("Mid-air - Foreclaimed Self 1", { animFrames: 46, node: Node.Normal, cast: Cast.Basic, type: Type.Liberation, bullets: [
    { hitFrame: 20, mv: 28.83, energy: 0.49, concerto: 0.94, offtune: 1657, forte2: 6 },
    { hitFrame: 30, mv: 28.83, energy: 0.49, concerto: 0.94, offtune: 1657, forte2: 6 },
    { hitFrame: 38, mv: 38.43, energy: 0.65, concerto: 1.25, offtune: 2209, forte2: 7 },
  ]});
const FMA2 = hiyukiAction("Mid-air - Foreclaimed Self 2", { animFrames: 50, node: Node.Normal, cast: Cast.Basic, type: Type.Liberation, bullets: [
    { hitFrame: 4, mv: 26.09, energy: 0.45, concerto: 0.85, offtune: 1500, forte2: 5,
      ...CHAFE },
    { hitFrame: 17, mv: 26.09, energy: 0.45, concerto: 0.85, offtune: 1500, forte2: 5 },
    { hitFrame: 32, mv: 26.09, energy: 0.45, concerto: 0.85, offtune: 1500, forte2: 5 },
    { hitFrame: 42, mv: 26.09, energy: 0.45, concerto: 0.85, offtune: 1500, forte2: 5 },
  ]});
const FMA3 = hiyukiAction("Mid-air - Foreclaimed Self 3", { animFrames: 50, node: Node.Normal, cast: Cast.Basic, type: Type.Liberation, bullets: [{ hitFrame: 35, mv: 111.6, energy: 1.89, concerto: 3.61, offtune: 6416, forte2: 22 }], ...CHAFE });
/** Hold Breath into the thrust — the Heavy she has before Whiteout Bitterfrost fills. */
const UHA = hiyukiAction("Heavy - Foreclaimed Self", { animFrames: 47, node: Node.Normal, cast: Cast.Heavy, type: Type.Liberation, bullets: [{ hitFrame: 34, mv: 107.16, energy: 1.81, concerto: 3.47, offtune: 6160, forte2: 21 }]});
/** Bitterfrost: trades all 3 Whiteout for a Snowforged Blade. Restores no Frostheart — the kit
 *  text excludes it by name from the Foreclaimed Self attacks that do. */
const FHA = hiyukiAction("Heavy - Bitterfrost: Foreclaimed Self", { animFrames: 150, timestop: 150, motionStop: 150, 
  node: Node.Normal, cast: Cast.Heavy, type: Type.Liberation, bullets: [
    { hitFrame: 10, mv: 15.41, energy: 0.2, offtune: 2100,
      ...CHAFE },
    { hitFrame: 17, mv: 15.41, energy: 0.2, offtune: 2100 },
    { hitFrame: 24, mv: 15.41, energy: 0.2, offtune: 2100 },
    { hitFrame: 32, mv: 15.41, energy: 0.2, offtune: 2100 },
    { hitFrame: 39, mv: 15.41, energy: 0.2, offtune: 2100 },
    { hitFrame: 46, mv: 15.41, energy: 0.2, offtune: 2100 },
    { hitFrame: 53, mv: 15.41, energy: 0.2, offtune: 2100 },
    { hitFrame: 60, mv: 15.41, energy: 0.2, offtune: 2100 },
    { hitFrame: 132, mv: 493.05, energy: 6.4, offtune: 67200 },
  ], castConcerto: 10,
  castForte3: -3,
  updateBuffs: () => applyCurrent(SNOWFORGED_BLADE, 1),
});

// --- Frostblight. The Present Self form enhances her next Stage 3; the two Foreclaimed Self forms
//     replace it and refill Frostheart instead, sharing one cooldown between them.
const Skill = hiyukiAction("Skill - Frostblight: Present Self", {
  animFrames: 85, cooldown: 60 * 20,
  node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 12, mv: 24.5, energy: 0.42, concerto: 0.8, offtune: 1408 },
    { hitFrame: 16, mv: 24.5, energy: 0.42, concerto: 0.8, offtune: 1408 },
    { hitFrame: 20, mv: 24.5, energy: 0.42, concerto: 0.8, offtune: 1408 },
    { hitFrame: 25, mv: 24.5, energy: 0.42, concerto: 0.8, offtune: 1408 },
    { hitFrame: 61, mv: 97.98, energy: 1.66, concerto: 3.17, offtune: 5632 },
  ],
  updateBuffs: () => applyCurrent(FROSTBLIGHT_ENHANCED, 1),
});
const USKILL_CD = new Cooldown({ frames: 60 * 12, charges: 2 });
const USkill1 = hiyukiAction("Skill - Frostblight: Jade Cleave", { animFrames: 39, cooldown: USKILL_CD, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 18, mv: 66.01, energy: 2.5, concerto: 0.75, offtune: 1328, forte2: 75 },
    { hitFrame: 23, mv: 66.01, energy: 2.5, concerto: 0.75, offtune: 1328 },
    { hitFrame: 29, mv: 66.01, energy: 2.5, concerto: 0.75, offtune: 1328 },
    { hitFrame: 34, mv: 66.01, energy: 2.5, concerto: 0.75, offtune: 1328 },
  ]});
const USkill2 = hiyukiAction("Skill - Frostblight: Petalfall", { animFrames: 55, cooldown: USKILL_CD, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 16, mv: 64.02, energy: 2.06, concerto: 0.73, offtune: 1288, forte2: 75 },
    { hitFrame: 20, mv: 64.02, energy: 2.06, concerto: 0.73, offtune: 1288 },
    { hitFrame: 26, mv: 64.02, energy: 2.06, concerto: 0.73, offtune: 1288 },
    { hitFrame: 29, mv: 64.02, energy: 2.06, concerto: 0.73, offtune: 1288 },
    { hitFrame: 34, mv: 64.02, energy: 2.06, concerto: 0.73, offtune: 1288 },
  ]});

// --- Foreclaiming, both halves.
/** Inward Vision costs no Resonance Energy at all — only Blade Liberation spends the bar. It
 *  removes Dedication *and* Frostheart before restoring 50 of the latter, hence the reset ahead
 *  of its own declared +50. */
const Lib1 = hiyukiAction("Liberation - Foreclaiming: Inward Vision", {
  animFrames: 240, timestop: 240, motionStop: 240, cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, bullets: [{ hitFrame: 210, mv: 397.62, offtune: 84000 }], castConcerto: 20,
  castForte2: 50, resetForte1: true, resetForte2: true,
  updateBuffs: () => applyCurrent(FROSTHARDEN_IAI, 3),
  // its own four stacks, then Frostbind's spend — the same phase, so spread by hand rather than
  // through `...FROSTBIND`
  updateDebuffs: () => {
    applyEnemy(GLACIO_CHAFE, 4);
    FROSTBIND.updateDebuffs();
  },
});
/** Held rather than tapped (see the file header), so it spends whatever Snowforged Blade is
 *  banked, at +795.24% on its own multiplier apiece. Tap and hold are one press, one cooldown. */
const LIB2_CD = new Cooldown({ frames: 60 * 25 });
const Lib2Tap = hiyukiAction("Liberation - Foreclaiming: Blade Liberation", {
  animFrames: 360, timestop: 360, motionStop: 360, cooldown: LIB2_CD,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, bullets: [{ hitFrame: 216, mv: 198.81 }, { hitFrame: 270, mv: 795.24 }], castConcerto: 20, resetEnergy: true,
  // everything it ends the form by removing: Dedication, Frostheart, and every Snowforged Blade
  // the multiplier above just cashed
  resetForte1: true, resetForte2: true,
});
const Lib2Hold = hiyukiAction("Liberation - Foreclaiming: Blade Liberation", {
  animFrames: 360, timestop: 360, motionStop: 360, cooldown: LIB2_CD,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, bullets: [{ hitFrame: 216, mv: 198.81 }, { hitFrame: 270, mv: 795.24 }], castConcerto: 20, resetEnergy: true,
  // everything it ends the form by removing: Dedication, Frostheart, and every Snowforged Blade
  // the multiplier above just cashed
  resetForte1: true, resetForte2: true,
});

/** Iai: 100 Frostheart a cast. With a point of Frostharden left it also spends that for 3 stacks
 *  of Chafe and a Whiteout Bitterfrost; without one it is the bare hit. */
const Iai = hiyukiAction("Forte Basic - Iai", {
  animFrames: 41,
  node: Node.Forte, cast: Cast.Basic, type: Type.Liberation, bullets: [
    { hitFrame: 2, commitFrame: 0, mv: 283.82, energy: 1.12, concerto: 2.15, offtune: 3807, updateDebuffs: () => { if (isHeld(FROSTHARDEN_IAI)) applyEnemy(GLACIO_CHAFE, 3); } },
    { hitFrame: 15, commitFrame: 0, mv: 47.31, energy: 0.19, concerto: 0.36, offtune: 635 },
    { hitFrame: 20, commitFrame: 0, mv: 47.31, energy: 0.19, concerto: 0.36, offtune: 635 },
    { hitFrame: 26, commitFrame: 0, mv: 47.31, energy: 0.19, concerto: 0.36, offtune: 635 },
    { hitFrame: 31, commitFrame: 0, mv: 47.31, energy: 0.19, concerto: 0.36, offtune: 635 },
  ],
  castForte2: -100,
  ...FROSTBIND,
});

const Intro = hiyukiAction("Intro - Frostedge", {
  animFrames: 64, prioFrames: 64, motionStop: 33,
  node: Node.Intro, cast: Cast.Intro, type: Type.Liberation, bullets: [{ hitFrame: 42, mv: 156.15, energy: 10, offtune: 8976 }], castConcerto: 10,
  castForte1: 200,
  updateDebuffs: () => applyEnemy(GLACIO_CHAFE, 1),
  // Snowlight Blessing is a 20s team buff, so CLAUDE.md's own wording rule ends it here rather
  // than leaving it standing for the fight; the two windows above open on the same cast
  updateBuffs: () => {
    revokeTeam(SNOWLIGHT_BLESSING);
    applyCurrent(GLACIO_BITE_WINDOW, 1);
    applyCurrent(FINE_SNOW_WINDOW, 1);
  },
});
const Outro = hiyukiAction("Outro - Snowlight Blessing", {
  animFrames: 0,
  cast: Cast.Outro, castConcerto: -100,
  updateBuffs: () => applyTeam(SNOWLIGHT_BLESSING, 1)
});

/** Fine Snow at 2 stacks of Snow Rust: one instance of Glacio Bite DMG at a flat 102% multiplier
 *  per stack of Glacio Chafe she applies. Glacio Bite DMG is Glacio Chafe DMG, so it is dot-scaled
 *  and scoped the same way the ladder in statuses.ts is: reported under the shared bucket, and
 *  reading only Negative-Status-scoped amplification. */
const FineSnowBite = new Action("Glacio Bite - Fine Snow", {
  element: Attribute.Glacio, type: Type.Status, subtype: Subtype.GlacioChafe, scaling: Scaling.Dot,
  mv: 102, field: FINE_SNOW,
});

/* ------------------------------------------------------------------------------------- buffs */

/** Frostharden Iai and Snowforged Blade: points rather than bars — 3 apiece, never spent in
 *  fractions, and both wanted by name in the buff panel rather than as a nameless gauge column. A
 *  Buff caps itself at its own `maxStacks`, so neither needs the ceiling/floor handling the real
 *  gauges carry. Frostharden is granted three at a time by Inward Vision and spent one per Iai;
 *  Snowforged is banked one per Bitterfrost — plus the one Ephemeral Realm has her walk into the
 *  fight holding — and spent all at once by Blade Liberation. */
const FROSTHARDEN_IAI = new Buff({ name: "Hiyuki: Frostharden Iai", maxStacks: 3 ,
  // a point of Frostharden buys the 3 Chafe stacks and the Whiteout; all three phases read the
  // count untouched, and the spend itself lands at the press's end so none of them races it
  applyStats: () => { if (runningAction(Iai)) addStat(Stat.AddForte3, 1); },
  afterAction: () => { if (runningAction(Iai)) removeStack(FROSTHARDEN_IAI, 1); },
});


const SNOWFORGED_BLADE = new Buff({ name: "Hiyuki: Snowforged Blade", maxStacks: 3 ,
  applyStats: () => {
    if (runningAction(Lib2Hold) || (runningAction(Lib2Tap) && frozenStacks() >= 3)) addStat(Stat.AddMv, 795.24 * frozenStacks());
  },
  // the blades the multiplier above cashed are spent once the press is over
  afterAction: () => {
    if (runningAction(Lib2Hold) || (runningAction(Lib2Tap) && stacksOf(SNOWFORGED_BLADE) >= 3)) revokeCurrent(SNOWFORGED_BLADE);
  },
});

/** Frostblight: Present Self enhancing her next Stage 3 for another 100 Dedication, lost the
 *  moment she switches out. Never paid in the rotation below — the skill is spent in the opening
 *  scramble and the swap ends it (see the file header). */
const FROSTBLIGHT_ENHANCED = new Buff({
  name: "Hiyuki: Present Self",
  lostOnSwap: true,
  applyStats: () => { if (runningAction(BA3)) addStat(Stat.AddForte1, 100); },
  afterAction: () => { if (runningAction(BA3)) revokeCurrent(FROSTBLIGHT_ENHANCED); },
});

/** How many *distinct* team slots have banked Snow Rust — the tier every payout below keys off.
 *  Snow Rust holds one bit per slot rather than a plain count (see below), so the tier is how many
 *  of the bits are up: 2 alone is one payer, 1+4 is two, 1+2+4 is three. The fourth bit is the
 *  stack S3 hands her outright, which belongs to no slot. */
const snowRust = (slots = frozenStacks()): number => {
  // capped at the kit's own 3: S3's free bit reaches that tier off two payers rather than adding
  // a fourth
  return Math.min(3, (slots & 1) + ((slots >> 1) & 1) + ((slots >> 2) & 1) + ((slots >> 3) & 1));
};

/** Snow Rust: one stack the first time each resonator on the team inflicts Glacio Chafe or Havoc
 *  Bane, capped at 3. All three payouts ride here, on an ordinary buff of her own: +40% Crit. DMG
 *  at 1 stack, the extra fixed-multiplier Bite hit at 2, and +30% Glacio Bite DMG Amplification at
 *  1 rising to +60% at 3. That last one needs no "while Hiyuki is active" check and no team-wide
 *  copy of itself — a Glacio Bite hit resolves on whoever is on field (evaluate.ts's own `evaluate()`),
 *  so a buff of hers reaches it exactly when she is the one holding the field.
 *
 *  "Each Resonator can trigger this effect only once" is carried by the stacks themselves: slot 1
 *  banks 1, slot 2 banks 2, slot 3 banks 4, so what is held is a set of who has already paid and
 *  the grant below tests it directly — no marker on each applier to remember it for them. Nothing
 *  reads the total as a count: every payout goes through `snowRust()`, and so does the display, so
 *  it still reads "x1".."x3" the way the kit page counts it. */
const SNOW_RUST = new Buff({
  name: "Hiyuki: Snow Rust", maxStacks: 1 + 2 + 4 + 8,
  display: () => `Hiyuki: Snow Rust x${snowRust()}`,
  // At 2 stacks, one fixed-multiplier Bite hit per stack of Chafe *she* applies, and only while
  // she is the one on field. `appliedByMe` is what makes the count hers alone, so a stack Lucilla's
  // Film Roll adds to her cast buys no extra hit.
  //
  // In `hitGlobal`, past every `updateDebuffs`, so a sibling's inflicting (Frostharden Iai's 3) is
  // counted; it runs on every member's hit, so it bails unless she is the one hitting.
  hitGlobal: () => {
    if (currentTeam().slot !== currentMember() || snowRust() < 2) return;
    // S6 widens the trigger from the Chafe *she* applies to the team's, which on her own turn is
    // what a marker of somebody else's lands off her swing (Lucilla's Film Roll)
    for (let i = isHeld(HY_S6) ? applied(GLACIO_CHAFE) : appliedByMe(GLACIO_CHAFE); i > 0; i--) queue(FineSnowBite);
  },
  applyStats: () => {
    if (!isActive()) return;
    addStat(Stat.CritDmg, 40);
    addStat(Stat.Amp, snowRust() >= 3 ? 60 : 30, Subtype.GlacioChafe);
    // S6's own two tiers, paid from here since this is where the count lives
    if (isHeld(HY_S6) && snowRust() >= 2) asSource(HY_S6, () => addStat(Stat.CritDmg, 40));
    if (isHeld(HY_S6) && snowRust() >= 3) asSource(HY_S6, () => addStat(Stat.DamageTaken, 25, Subtype.GlacioChafe));
    // S3: the fixed-multiplier Bite hit at x5.88 (no second row on the page — taken the way every
    // other "DMG Multiplier is increased by" on this kit reads, which all four verify as)
    if (isHeld(HY_S3) && runningAction(FineSnowBite)) asSource(HY_S3, () => addStat(Stat.MulMv, 488));
  },
});
/** Snowlight Blessing (Outro Skill): +20% Glacio DMG Amplification for every *other* resonator in
 *  the team against a Chafed target, 20s — so per CLAUDE.md's own wording rule it stands until her
 *  next Intro rather than permanently. Team-wide so it ticks on whoever is acting. */
const SNOWLIGHT_BLESSING = new Buff({
  name: "Hiyuki: Outro",
  duration: 60 * 20,
  applyStats: () => {
    if (currentTeam().slot.resonator === HIYUKI_RESONATOR || stacksOfEnemy(GLACIO_BITE) === 0) return;
    addStat(Stat.Amp, 20, Attribute.Glacio);
  },
});

/* --------------------------------------------------------------------------- kit and loadout */

/** Fine Snow (Inherent Skill): banks Snow Rust off the first Glacio Chafe or Havoc Bane each
 *  resonator on the team inflicts — `appliedByMember`, so a marker's stack off somebody else's
 *  swing (Chisa's Snare Bane, Lucilla's Film Roll) banks a bit for its owner, not the hitter. */
const HY_INHERENT_1 = new Inherent({
  name: "Inherent: Fine Snow",
  hitGlobal: () => {
    currentTeam().slots.forEach((m, i) => {
      if (!appliedByMember(GLACIO_CHAFE, m) && !appliedByMember(HAVOC_BANE, m)) return;
      const slot = 1 << i;
      if ((stacksOf(SNOW_RUST) & slot) === 0) applyCurrent(SNOW_RUST, slot);
    });
  },
});

/** Ephemeral Realm (Inherent Skill): restores a Snowforged Blade after 4s out of combat, which is
 *  only ever worth the one point she walks into the fight already holding. */
const HY_INHERENT_2 = new Inherent({
  name: "Inherent: Ephemeral Realm",
  combatStart: () => applyCurrent(SNOWFORGED_BLADE, 1),
});

const HIYUKI_TALENTS = new Talent({
  name: "Hiyuki: Talents",
  stats: [[Stat.BonusAtk, 12], [Stat.CritRate, 8]],
});

/** What the conversion below had already turned this action, by team slot — what each member had
 *  landed when it ran, so the sweep after it can tell a stack laid later from one it took. */
const converted = [0, 0, 0];
/** A Chafe stack laid *after* the conversion's phase — Suisui's Transcendent Dance inflicts from
 *  `afterAction`, the one phase that sees banked Concerto — would otherwise sit raw on the target
 *  until the next Chafe-landing cast revoked it unconverted: a Bite stack and its rung lost. Held
 *  on the enemy so it runs last in that phase, after every team buff has laid what it lays. On her
 *  own visit the stack counts as hers — her rung, and a Fine Snow hit with it, so the two rows
 *  under her Intro stay level; off it, each stack is credited to whoever the record says landed
 *  it — the Dance's rung is Suisui's. Nameless: a sweep, not a status she holds. */
const LATE_BITE = new Debuff({
  afterAction: () => {
    const late = stacksOfEnemy(GLACIO_CHAFE);
    if (late === 0) return;
    revokeEnemy(GLACIO_CHAFE);
    applyEnemy(GLACIO_BITE, late);
    const team = currentTeam();
    const cap = team.enemyMax(GLACIO_CHAFE);
    // an enemy hook runs as the actor, so "is she on field" is asked of the slot, not `currentMember()`
    const hers = team.slots[team.onField]!.resonator === HIYUKI_RESONATOR;
    if (hers) {
      for (let i = 0; i < late; i++) queueOn(HIYUKI_RESONATOR, BITE_RUNGS[cap]!);
      // her Snow Rust, read by name: `frozenStacks()` here would be this sweep's own count
      if (snowRust(stacksOf(SNOW_RUST)) >= 2) for (let i = 0; i < late; i++) queueOn(HIYUKI_RESONATOR, FineSnowBite);
      return;
    }
    const rung = GLACIO_CHAFE_ACTIONS[cap]!;
    let rest = late;
    for (const s of team.slots) {
      const n = Math.min(rest, appliedByMember(GLACIO_CHAFE, s) - converted[s.index]!);
      for (let i = 0; i < n; i++) queueOn(s.resonator!, rung);
      rest -= Math.max(0, n);
    }
    // anything the record can't place goes to whoever was acting
    for (let i = 0; i < rest; i++) queueOn(team.slot.resonator!, rung);
  },
});

/** Iai Stance: with 100 Frostheart, a dodge out of a Foreclaimed Self attack (Bitterfrost aside), a
 *  Frostblight skill, an Iai or her Intro flashes her into the stance — no hit of its own. */
const IaiFlash = hiyukiAction("Dodge - Iai Stance", { animFrames: 30});
const IAI_ENTRY = new Set<Action>([FBA1, FBA2, FBA3, FBA4, FBA5, FMA1, FMA2, FMA3, UHA, FDC, USkill1, USkill2, Iai, Intro]);

export const HIYUKI_RESONATOR = new Resonator({
  name: "Hiyuki",
  stats: [[Stat.BaseHp, 10300], [Stat.BaseAtk, 462.5], [Stat.BaseDef, 1112.2202]],
  talent: HIYUKI_TALENTS,
  inherent1: HY_INHERENT_1,
  inherent2: HY_INHERENT_2,
  element: Attribute.Glacio,
  weapon: WeaponType.Sword,
  dodge: (after) => (IAI_ENTRY.has(after) && forte2() >= 100 ? IaiFlash : null),
  color: "#87e6e6",
  intro: Intro,
  maxEnergy: 125,
  maxForte1: 300,
  maxForte2: 300,
  maxForte3: 3,
  combatStart: () => applyEnemy(LATE_BITE, 1),

  /* Everfrost Dominion's Glacio Bite, the one thing on her that is true of the whole team: while
   * she is in it, every stack of Glacio Chafe *anyone* inflicts is converted, and each converted
   * stack deals its damage at the target's own stack **limit** rather than at the rung it just
   * reached. On a bare team that is the 10-stack rung on every single application; with Chisa's
   * +3 to the cap it is the 13-stack rung instead, which is where her pairing comes from.
   *
   * From `hitGlobal` so it sees a teammate's hit as readily as her own, and because that phase
   * is past every `updateDebuffs` (where a kit inflicts, Lucilla's Film Roll included) and still
   * ahead of the roster the stat phases are captured from. That last part is what lets the plain
   * stacks be taken straight back off — which is both what the kit says and what keeps status.ts's
   * own ramping damage from firing for the very stacks this just converted.
   *
   * Glacio Bite DMG *is* Glacio Chafe DMG, so it fires status.ts's shared ladder rather than
   * carrying a copy of those motion values, and the limit it indexes is Glacio Chafe's — Bite
   * counts as Chafe for every cap a teammate raises.
   *
   * `queueOn` rather than `queue`: a resonator's own gear runs `hitGlobal` with the current
   * slot switched to *her*, so a plain queue would pin every hit to her and have it read her Fine
   * Snow and Frostburn amplification even on a stack Lucilla laid while on field. The hits belong
   * to whoever actually inflicted.
   *
   * "When Hiyuki joins the team, remove all stacks of Glacio Chafe from the targets" needs nothing
   * of its own: a fight starts with none on the target, and from the first one onward this is what
   * takes them off. */
  hitGlobal: () => {
    for (const s of currentTeam().slots) converted[s.index] = appliedByMember(GLACIO_CHAFE, s);
    const inflicted = applied(GLACIO_CHAFE);
    if (inflicted === 0) return;
    revokeEnemy(GLACIO_CHAFE);
    applyEnemy(GLACIO_BITE, inflicted);
    // Filed under her own window only while she is the one on field — `isActive()` asks about
    // whoever is acting, which on a teammate's own visit is them, so the field is read off the
    // scheduler directly. A stack laid on their visit is their hit on their turn, in no window
    // of hers.
    const cap = currentTeam().enemyMax(GLACIO_CHAFE);
    const hers = currentTeam().slots[currentTeam().onField] === currentMember();
    const applier = currentTeam().slot.resonator!;
    // a teammate's own visit files them under their own field where they have one (Lucilla's)
    const theirs = currentTeam().slots[currentTeam().onField]?.resonator === applier ? OWN_CHAFE_RUNGS.get(applier) : undefined;
    const rung = (hers ? BITE_RUNGS[cap] : (theirs ?? GLACIO_CHAFE_ACTIONS)[cap])!;
    for (let i = 0; i < inflicted; i++) queueOn(applier, rung);
  },


  // the Stage 3 a Tune Break of hers rolls into — `queueEvent`, not `queue`, so it lands as a
  // press of her own rather than a follow-up pinned to the break (evaluate.ts's own `triggered`)
  afterAction: () => {
    if (!runningAction(TUNE_BREAK)) return;
    if (forte3() > 0 || forte2() > 0) queueEvent(FBA3);
  }
});

/* --------------------------------------------------------------------------------- sequences */

/** S1: the whole Foreclaimed Self moveset at x2.2 — multiplicative, nanoka's own second rows
 *  (108.39% against 49.27% on Stage 1, 235.75% against 107.16% on the Heavy) — and Inward Vision
 *  leaves the next Stage 1 and 2 inflicting a stack of Chafe apiece. Bitterfrost is S3's, not this
 *  one's: the node names the plain Heavy Attack - Foreclaimed Self. */
const FORECLAIMED_HITS = new Set<Action>([FBA1, FBA2, FBA3, FBA4, FBA5, UHA, FMA1, FMA2, FMA3, FDC]);
/** What Inward Vision leaves on the next Stage 1 and 2 — spent on Stage 2, the later of the two. */
const SPRINGLESS = new Buff({
  name: "Hiyuki S1: Springless",
  afterAction: () => { if (runningAction(FBA2)) revokeCurrent(SPRINGLESS); },
});
const HY_S1 = new Sequence({
  name: "Hiyuki S1: Springless",
  applyStats: () => { if (runningAnyOf(FORECLAIMED_HITS)) addStat(Stat.MulMv, 120); },
  grants: [{ on: onAction(Lib1), buff: SPRINGLESS }],
});

/** What S2 leaves standing from being out of combat: the next two Frostblight casts of the
 *  Foreclaimed Self form hand back another 50 Frostheart apiece. */
const FROSTHEART_SURGE = new Buff({
  name: "Hiyuki S2: To Burn Cold in Silence", maxStacks: 2,
  applyStats: () => { if (runningAction(USkill1) || runningAction(USkill2)) addStat(Stat.AddForte2, 50); },
  afterAction: () => { if (runningAction(USkill1) || runningAction(USkill2)) removeStack(FROSTHEART_SURGE, 1); },
});
/** S2: the Iai at x2.25 — multiplicative, its own second rows (638.59%+106.44%x4 against
 *  283.82%+47.31%x4) — and Ephemeral Realm's one Snowforged Blade becomes three. The Frostharden
 *  restore is for Foreclaimed Self, which she is not in at the opening; the cooldown resets have
 *  nothing to reset. */
const HY_S2 = new Sequence({
  name: "Hiyuki S2: To Burn Cold in Silence",
  combatStart: () => { applyCurrent(SNOWFORGED_BLADE, 3); applyCurrent(FROSTHEART_SURGE, 2); },
  applyStats: () => { if (runningAction(Iai)) addStat(Stat.MulMv, 125); },
});

/** S3: a stack of Snow Rust from the off (`snowRust()`'s fourth bit, which belongs to no slot),
 *  both named Heavies at x2.6 — multiplicative, their own second rows (824.75% against 317.23%,
 *  1602.49% against 616.33%) — and the fixed-multiplier Bite hit raised, paid inside Snow Rust
 *  where that hit is fired. */
const HY_S3 = new Sequence({
  name: "Hiyuki S3: No Self, No Bound",
  combatStart: () => applyCurrent(SNOW_RUST, 8),
  applyStats: () => { if (runningAction(FrostSplinter) || runningAction(FHA)) addStat(Stat.MulMv, 160); },
});

/** S4: every Frostblight form hands the team +20% DMG for 30s — she casts one a visit, so it never
 *  lapses. The heal is out of scope. */
const LIKE_REEDS_ON_TIDES = new Buff({ name: "Hiyuki S4: Like Reeds on Tides", duration: 60 * 30, stats: [[Stat.DmgBonus, 20]] });
const HY_S4 = new Sequence({
  name: "Hiyuki S4: Like Reeds on Tides",
  updateBuffs: () => {
    if (runningAction(Skill) || runningAction(USkill1) || runningAction(USkill2)) {
      applyTeam(LIKE_REEDS_ON_TIDES, 1);
      applyCurrent(HEALS, 1);
    }
  },
});

/** S5: all three Frostblight forms at x1.8 — multiplicative, their own second rows (352.72%
 *  against 195.98%, 475.24% against 264.04%, 576.20% against 320.10%). */
const HY_S5 = new Sequence({
  name: "Hiyuki S5: Vessel of Thousand Wishes",
  applyStats: () => {
    if (runningAction(Skill) || runningAction(USkill1) || runningAction(USkill2)) addStat(Stat.MulMv, 80);
  },
});

/** S6: +500% Crit. DMG on both halves of Foreclaiming. Its three Snow Rust tiers — the wider Bite
 *  trigger, the second +40% Crit. DMG and the target's +25% Glacio Bite vulnerability — are paid
 *  inside Snow Rust, which is where the count they read lives. */
const HY_S6 = new Sequence({
  name: "Hiyuki S6: Into a Night Without End",
  applyStats: () => {
    if (runningAction(Lib1) || runningAction(Lib2Tap) || runningAction(Lib2Hold)) addStat(Stat.CritDmg, 500);
  },
});

const HY_SEQUENCES = [HY_S1, HY_S2, HY_S3, HY_S4, HY_S5, HY_S6];

/* ---------------------------------------------------------------------------------- rotation */

/** Frostblight in the fight's own first seconds, then out. Every visit after: the Intro banks 200
 *  Dedication and chains straight into Stage 3 for the last 100, Frost Splinter spends the bar,
 *  and Inward Vision trades it for Foreclaimed Self, 3 Frostharden and 4 stacks of Chafe. Jade
 *  Cleave tops Frostheart past 100 for the first Iai; each Foreclaimed Self chain after refills it
 *  for the next, three in total, which is exactly the Frostharden Inward Vision granted and so
 *  exactly the 3 Whiteout Bitterfrost spends. Echo, then the held Blade Liberation cashes the
 *  Snowforged Blade and ends the form, leaving her back in Present Self for the next Intro. She is
 *  always the team's main DPS, so this covers the loop and there is no opener chain to write. */
const FBA123 = new ActionGroup("Basic - Foreclaimed Self 123", [FBA1, FBA2, FBA3]);
const BA123 = new ActionGroup("Basic - Present Self 123", [BA1, BA2, BA3]);

const HY_ROTATION = new Rotation([
  NOINTRO_FIRST, BA123.cancel(), Skill, BA3.easyCancel(), FrostSplinter.easyCancel(), Lib1,
  FBA123.dodgeCancel(), FBA123.dodgeCancel(), Iai.instaJump(), USkill2.dodgeCancel(), Iai.instaJump(), USkill2.dodgeCancel(), Iai.instaDodge(),
  ECHO, FHA, Lib2Tap, Outro,

  FIRST_INTRO, BA3.easyCancel(), FrostSplinter.easyCancel(), Lib1,
  FBA123.dodgeCancel(), FBA123.dodgeCancel(), Iai.instaJump(), USkill2.dodgeCancel(), Iai.instaJump(), USkill2.dodgeCancel(), Iai.instaDodge(),
  ECHO, FHA, Lib2Tap, Skill.instaSwap(), Outro,

  NOINTRO, BA123.cancel(), Skill,
  INTRO, BA3.easyCancel(), FrostSplinter.easyCancel(), Lib1,
  FBA123.dodgeCancel(), FBA123.dodgeCancel(), Iai.instaJump(), USkill2.dodgeCancel(), Iai.instaJump(), USkill2.dodgeCancel(), Iai.instaDodge(),
  ECHO, FHA, Lib2Hold, Skill.instaSwap(), Outro,
]);

/** From S2 on, the first visit alone has the Frostheart for a fourth Iai: the two Frostblight casts
 *  it enhances hand back 100 between them, which is exactly one more. It comes in ahead of
 *  Bitterfrost, and carries no Frostharden of its own — the three Inward Vision granted are spent
 *  by then, so it is the bare hit. Every later visit runs the ordinary line. */
const HY_ROTATION_S2 = new Rotation([
  NOINTRO_FIRST, BA123.cancel(), Skill, BA3.easyCancel(), FrostSplinter.easyCancel(), Lib1,
  FBA123.dodgeCancel(), FBA123.dodgeCancel(), Iai.instaJump(), USkill2.dodgeCancel(), Iai.instaJump(), USkill2.dodgeCancel(), Iai,
  Iai.instaDodge(), // extra from s2
  ECHO, FHA, Lib2Tap, Outro,

  FIRST_INTRO, BA3.easyCancel(), FrostSplinter.easyCancel(), Lib1,
  FBA123.dodgeCancel(), FBA123.dodgeCancel(), Iai.instaJump(), USkill2.dodgeCancel(), Iai.instaJump(), USkill2.dodgeCancel(), Iai,
  Iai.instaDodge(), // extra from s2
  ECHO, FHA, Lib2Tap, Skill.instaSwap(), Outro,

  NOINTRO, BA123.cancel(), Skill,
  INTRO, BA3.easyCancel(), FrostSplinter.easyCancel(), Lib1,
  FBA123.dodgeCancel(), FBA123.dodgeCancel(), Iai.instaJump(), USkill2.dodgeCancel(), Iai.instaJump(), USkill2.dodgeCancel(), Iai.instaDodge(),
  ECHO, FHA, Lib2Hold, Skill.instaSwap(), Outro,
]);

const HY_ECHOES = [
  new EchoLoadout(VOIDBORNE_CONSTRUCT, QUIET_SNOWFALL_5PC),
];

export const HIYUKI = new Loadout({
  resonator: HIYUKI_RESONATOR,
  weapons: [FROSTBURN, EMERALD_OF_GENESIS],
  echoLoadouts: HY_ECHOES,
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.ATK4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Glacio3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.Liberation, Substat.AtkPct, Substat.FlatAtk, Substat.Skill),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.Liberation, Substat.AtkPct, Substat.FlatAtk, Substat.Skill),
  rotation: { 0: HY_ROTATION, 2: HY_ROTATION_S2 },
  sequences: HY_SEQUENCES,
});
