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
 * from. The conversion itself is her Resonator's own `updateGlobal` below — it sees a teammate's
 * cast as readily as her own. Glacio Bite DMG *is* Glacio Chafe DMG, so it reuses status.ts's
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
import {
  Buff, Debuff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Action, Stat, Attribute, WeaponType,
  Type1, Type2, Cast, Node, Scaling, addStat, applied, appliedByMe, appliedByMember, applyCurrent, applyEnemy,
  applyTeam, currentAction, currentTeam, frozenStacks, queue, queueOn, queueOutro, removeStack,
  consume, removeStackEnemy, revokeEnemy, revokeCurrent, revokeTeam, setForte1, setForte2, stacksOf, stacksOfEnemy,
  lostOnSwap,
  forte1,
  forte3,
  forte2,
} from "../../engine/kit.js";
import { Rotation, INTRO, ECHO_CAST, OUTRO_NEXT } from "../../engine/rotation.js";
import { GLACIO_CHAFE, GLACIO_CHAFE_DMG, HAVOC_BANE } from "../../shared/status.js";
import { FROSTBURN } from "../../weapons/sword.js";
import { EMERALD_OF_GENESIS } from "../../weapons/standard.js";
import { QUIET_SNOWFALL_2PC, QUIET_SNOWFALL_5PC, VOIDBORNE_CONSTRUCT } from "../../echoes/lahairoi.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { chem } from "../../shared/substats.js";
import { TUNE_BREAK } from "../../shared/tunebreak.js";

/* ------------------------------------------------------------------------------ glacio bite */

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
 *  so spending them costs nothing either. In `afterAction`, the last phase of the cast: statuses.ts
 *  has by then already queued the exact ladder rung each stack calculates at, so taking ten back
 *  can't retroactively change what this cast's own hits are worth. */
const FROSTBIND = {
  afterAction: () => { if (stacksOfEnemy(GLACIO_BITE) >= 10) consume(GLACIO_BITE, 10); },
};

// --- Present Self: the chain she opens from, and the only ordinary Basic Attack DMG she has.
const BA1 = hiyukiAction("Basic - Present Self 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 75.44, energy: 1.28, concerto: 2.44, offtune: 4336 });
const BA2 = hiyukiAction("Basic - Present Self 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 90.25, energy: 1.53, concerto: 2.92, offtune: 5188 });
const BA3 = hiyukiAction("Basic - Present Self 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 122.97, energy: 2.12, concerto: 3.99, offtune: 7070, forte1: 100, ...CHAFE });
const MA = hiyukiAction("Basic - Present Self (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 128.18, energy: 2.17, concerto: 4.15, offtune: 7368 });
const DC = hiyukiAction("Basic - Present Self 2 (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 173.75, energy: 2.94, concerto: 15.62, offtune: 9988 });
/** Three arrows, considered Resonance Liberation DMG, and what opens Inward Vision. */
const FrostSplinter = hiyukiAction("Heavy - Frost Splinter: Present Self", {
  node: Node.Normal, cast: Cast.Heavy, type: Type1.Liberation, mv: 317.23, energy: 5.23, concerto: 9.99, offtune: 17728, forte1: -300,
  // the last arrow spends the whole bar — a clear, not a -300 delta: Inward Vision and Blade
  // Liberation each say they remove 300 too, and by then Dedication is already empty, so declared
  // deltas would drive the gauge hundreds negative (nothing in the engine floors one)
  updateBuffs: () => { if (forte1() > 300) setForte1(300); },
  ...CHAFE,
});

// --- Foreclaimed Self: the same buttons, five stages instead of three, all Resonance Liberation
//     DMG, and every hit but Bitterfrost refills Frostheart.
const FBA1 = hiyukiAction("Basic - Foreclaimed Self 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Liberation, mv: 49.27, energy: 0.84, concerto: 1.60, offtune: 2832, forte2: 10 });
const FBA2 = hiyukiAction("Basic - Foreclaimed Self 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Liberation, mv: 80.04, energy: 1.36, concerto: 2.60, offtune: 4600, forte2: 15 });
const FBA3 = hiyukiAction("Basic - Foreclaimed Self 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Liberation, mv: 167.72, energy: 2.86, concerto: 5.45, offtune: 9640, forte2: 32, ...CHAFE });
const FBA4 = hiyukiAction("Basic - Foreclaimed Self 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Liberation, mv: 149.65, energy: 2.55, concerto: 4.85, offtune: 8600, forte2: 30, ...CHAFE });
const FBA5 = hiyukiAction("Basic - Foreclaimed Self 5", { node: Node.Normal, cast: Cast.Basic, type: Type1.Liberation, mv: 121.64, energy: 2.06, concerto: 3.94, offtune: 6993, forte2: 24, ...CHAFE });
const FDC = hiyukiAction("Basic - Foreclaimed Self 2 (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Liberation, mv: 163.54, energy: 2.78, concerto: 15.30, offtune: 9400, forte2: 32 });
const FMA1 = hiyukiAction("Basic - Foreclaimed Self 1 (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Liberation, mv: 96.09, energy: 1.63, concerto: 3.13, offtune: 5523, forte2: 19 });
const FMA2 = hiyukiAction("Basic - Foreclaimed Self 2 (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Liberation, mv: 104.36, energy: 1.80, concerto: 3.40, offtune: 6000, forte2: 20, ...CHAFE });
const FMA3 = hiyukiAction("Basic - Foreclaimed Self 3 (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Liberation, mv: 111.60, energy: 1.89, concerto: 3.61, offtune: 6416, forte2: 22, ...CHAFE });
/** Hold Breath into the thrust — the Heavy she has before Whiteout Bitterfrost fills. */
const UHA = hiyukiAction("Heavy - Foreclaimed Self", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Liberation, mv: 107.16, energy: 1.81, concerto: 3.47, offtune: 6160, forte2: 21 });
/** Bitterfrost: trades all 3 Whiteout for a Snowforged Blade. Restores no Frostheart — the kit
 *  text excludes it by name from the Foreclaimed Self attacks that do. */
const FHA = hiyukiAction("Heavy - Bitterfrost: Foreclaimed Self", {
  node: Node.Normal, cast: Cast.Heavy, type: Type1.Liberation, mv: 616.33, energy: 8.00, concerto: 10.00, offtune: 84000,
  forte3: -3,
  updateBuffs: () => applyCurrent(SNOWFORGED_BLADE, 1),
  ...CHAFE,
});

// --- Frostblight. The Present Self form enhances her next Stage 3; the two Foreclaimed Self forms
//     replace it and refill Frostheart instead, sharing one cooldown between them.
const Skill = hiyukiAction("Skill - Frostblight: Present Self", {
  node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 195.98, energy: 3.34, concerto: 6.37, offtune: 11264,
  updateBuffs: () => applyCurrent(FROSTBLIGHT_ENHANCED, 1),
});
const USkill1 = hiyukiAction("Skill - Frostblight: Jade Cleave", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 264.04, energy: 10.00, concerto: 3.00, offtune: 5312, forte2: 75 });
const USkill2 = hiyukiAction("Skill - Frostblight: Petalfall", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 320.10, energy: 10.30, concerto: 3.65, offtune: 6440, forte2: 75 });

// --- Foreclaiming, both halves.
/** Inward Vision costs no Resonance Energy at all — only Blade Liberation spends the bar. It
 *  removes Dedication *and* Frostheart before restoring 50 of the latter, hence the setForte2(0)
 *  ahead of its own declared +50. */
const Lib1 = hiyukiAction("Liberation - Foreclaiming: Inward Vision", {
  node: Node.Liberation, cast: Cast.Liberation, type: Type1.Liberation, mv: 397.62, concerto: 20, offtune: 84000,
  forte2: 50,
  updateDebuffs: () => applyEnemy(GLACIO_CHAFE, 4),
  updateBuffs: () => { setForte1(0); setForte2(0); applyCurrent(FROSTHARDEN_IAI, 3); },
  ...FROSTBIND,
});
/** Held rather than tapped (see the file header), so it spends whatever Snowforged Blade is
 *  banked, at +795.24% on its own multiplier apiece. */
const Lib2Tap = hiyukiAction("Liberation - Foreclaiming: Blade Liberation", {
  node: Node.Liberation, cast: Cast.Liberation, type: Type1.Liberation, mv: 994.05, concerto: 20, resetEnergy: true,
  // everything it ends the form by removing, once the cast has banked: Dedication, Frostheart, and
  // every Snowforged Blade the multiplier above just cashed
  afterAction: () => { 
    setForte1(0); 
    setForte2(0);     
  },
});
const Lib2Hold = hiyukiAction("Liberation - Foreclaiming: Blade Liberation", {
  node: Node.Liberation, cast: Cast.Liberation, type: Type1.Liberation, mv: 994.05, concerto: 20, resetEnergy: true,
  // everything it ends the form by removing, once the cast has banked: Dedication, Frostheart, and
  // every Snowforged Blade the multiplier above just cashed
  afterAction: () => { 
    setForte1(0); 
    setForte2(0);
  },
});

/** Iai: 100 Frostheart a cast. With a point of Frostharden left it also spends that for 3 stacks
 *  of Chafe and a Whiteout Bitterfrost; without one it is the bare hit. */
const Iai = hiyukiAction("Forte Basic - Iai", {
  node: Node.Forte, cast: Cast.Basic, type: Type1.Liberation, mv: 473.06, energy: 1.88, concerto: 3.59, offtune: 6347,
  forte2: -100,
  ...FROSTBIND,
});

const Intro = hiyukiAction("Intro - Frostedge", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Liberation, mv: 156.15, energy: 10, concerto: 10, offtune: 8976,
  forte1: 200,
  updateDebuffs: () => applyEnemy(GLACIO_CHAFE, 1),
  // Snowlight Blessing is a 20s team buff, so CLAUDE.md's own wording rule ends it here rather
  // than leaving it standing for the fight
  updateBuffs: () => revokeTeam(SNOWLIGHT_BLESSING),
});
const Outro = hiyukiAction("Outro - Snowlight Blessing", {
  cast: Cast.Outro, concerto: -100, active: false,
  updateBuffs: () => applyTeam(SNOWLIGHT_BLESSING, 1)
});

/** Fine Snow at 2 stacks of Snow Rust: one instance of Glacio Bite DMG at a flat 102% multiplier
 *  per stack of Glacio Chafe she applies. Glacio Bite DMG is Glacio Chafe DMG, so it is dot-scaled
 *  and scoped the same way the ladder in statuses.ts is: reported under the shared bucket, and
 *  reading only Negative-Status-scoped amplification. */
const FineSnowBite = new Action("Glacio Bite - Fine Snow", {
  element: Attribute.Glacio, type: Type1.Status, type2: Type2.GlacioChafe, scaling: Scaling.Dot,
  mv: 102,
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
  // count untouched, and the spend itself lands last so none of them races it
  updateDebuffs: () => { if (currentAction() === Iai) applyEnemy(GLACIO_CHAFE, 3); },
  applyStats: () => { if (currentAction() === Iai) addStat(Stat.AddForte3, 1); },
  convertStats: () => { if (currentAction() === Iai) removeStack(FROSTHARDEN_IAI, 1); },
});


const SNOWFORGED_BLADE = new Buff({ name: "Hiyuki: Snowforged Blade", maxStacks: 3 ,
  applyStats: () => {
    const a = currentAction();
    if (a === Lib2Hold || (a === Lib2Tap && frozenStacks() >= 3)) {
      addStat(Stat.AddMv, 795.24 * frozenStacks());
      revokeCurrent(SNOWFORGED_BLADE);
    } else if (a === Lib2Tap) {
      addStat(Stat.AddMv, 795.24);
      removeStack(SNOWFORGED_BLADE, 1);
    }
  },
});

/** Frostblight: Present Self enhancing her next Stage 3 for another 100 Dedication, lost the
 *  moment she switches out. Never paid in the rotation below — the skill is spent in the opening
 *  scramble and the swap ends it (see the file header). */
const FROSTBLIGHT_ENHANCED = new Buff({
  name: "Hiyuki: Present Self",
  updateBuffs: () => lostOnSwap(),
  applyStats: () => { if (currentAction() === BA3) addStat(Stat.AddForte1, 100); },
  convertStats: () => { if (currentAction() === BA3) revokeCurrent(FROSTBLIGHT_ENHANCED); },
});

/** How many *distinct* team slots have banked Snow Rust — the tier every payout below keys off.
 *  Snow Rust holds one bit per slot rather than a plain count (see below), so the tier is how many
 *  of the three bits are up: 2 alone is one payer, 1+4 is two, 1+2+4 is three. */
const snowRust = (): number => {
  const slots = frozenStacks();
  return (slots & 1) + ((slots >> 1) & 1) + ((slots >> 2) & 1);
};

/** Snow Rust: one stack the first time each resonator on the team inflicts Glacio Chafe or Havoc
 *  Bane, capped at 3. All three payouts ride here, on an ordinary buff of her own: +40% Crit. DMG
 *  at 1 stack, the extra fixed-multiplier Bite hit at 2, and +30% Glacio Bite DMG Amplification at
 *  1 rising to +60% at 3. That last one needs no "while Hiyuki is active" check and no team-wide
 *  copy of itself — a Glacio Bite hit resolves on whoever is on field (kit.ts's own `evaluate()`),
 *  so a buff of hers reaches it exactly when she is the one holding the field.
 *
 *  "Each Resonator can trigger this effect only once" is carried by the stacks themselves: slot 1
 *  banks 1, slot 2 banks 2, slot 3 banks 4, so what is held is a set of who has already paid and
 *  the grant below tests it directly — no marker on each applier to remember it for them. Nothing
 *  reads the total as a count: every payout goes through `snowRust()`, and so does the display, so
 *  it still reads "x1".."x3" the way the kit page counts it. */
const SNOW_RUST = new Buff({
  name: "Hiyuki: Snow Rust", maxStacks: 1 + 2 + 4,
  display: () => `Hiyuki: Snow Rust x${snowRust()}`,
  // At 2 stacks, one fixed-multiplier Bite hit per stack of Chafe *she* applies, and only while
  // she is the one on field. Held locally, so it runs on the acting slot's own turn and no other;
  // `appliedByMe` is what makes the count hers alone, so a stack Lucilla's Film Roll adds to her
  // cast buys no extra hit.
  //
  // Counted in `updateBuffs`, a phase after the one every kit inflicts in, so that it sees the
  // whole cast however the stacks got there. In `updateDebuffs` it only ever saw what the *action*
  // itself had already declared: a sibling buff of hers inflicting in that same phase (Frostharden
  // Iai's 3, which is every Iai in the rotation) lands after her in the local roster, and she read
  // 0 and queued nothing. Frostburn and Quiet Snowfall read the same count a phase later for the
  // same reason. The conversion to Glacio Bite in between takes the stacks straight back off, but
  // `appliedByMe` is a record of what this action applied, not of what is still on the target.
  updateBuffs: () => {
    if (snowRust() < 2) return;
    for (let i = appliedByMe(GLACIO_CHAFE); i > 0; i--) queue(FineSnowBite);
  },
  applyStats: () => {
    if (currentAction().active) {
      addStat(Stat.CritDmg, 40);
      addStat(Stat.Amp, snowRust() >= 3 ? 60 : 30, Type2.GlacioChafe);
    }
  },
});
/** Snowlight Blessing (Outro Skill): +20% Glacio DMG Amplification for every *other* resonator in
 *  the team against a Chafed target, 20s — so per CLAUDE.md's own wording rule it stands until her
 *  next Intro rather than permanently. Team-wide so it ticks on whoever is acting. */
const SNOWLIGHT_BLESSING = new Buff({
  name: "Hiyuki: Outro",
  applyStats: () => {
    if (currentTeam().slot.resonator === HIYUKI || stacksOfEnemy(GLACIO_BITE) === 0) return;
    addStat(Stat.Amp, 20, Attribute.Glacio);
  },
});

/* --------------------------------------------------------------------------- kit and loadout */

/** Fine Snow (Inherent Skill): banks Snow Rust off the first Glacio Chafe or Havoc Bane each
 *  resonator on the team inflicts. From `updateGlobal`, so a teammate's own cast is seen — which
 *  runs with the "current" slot pointed at Hiyuki, so the applier is read off the team instead.
 *
 *  Each slot has to land its own: `appliedByMember` against the acting slot, not plain `applied`,
 *  so a stack that a marker put on off somebody's swing (Chisa's Thread of Bane, Lucilla's Film
 *  Roll) banks a bit for its own owner rather than for whoever happened to be hitting. */
const HY_INHERENT_1 = new Inherent({
  name: "Hiyuki: Fine Snow",
  updateGlobal: () => {
    const actor = currentTeam().slot;
    if (!appliedByMember(GLACIO_CHAFE, actor) && !appliedByMember(HAVOC_BANE, actor)) return;
    // the applier's own bit — already up means this slot has banked its stack and gets no second
    const slot = 1 << currentTeam().active;
    if ((stacksOf(SNOW_RUST) & slot) !== 0) return;
    applyCurrent(SNOW_RUST, slot);
  },
});

/** Ephemeral Realm (Inherent Skill): restores a Snowforged Blade after 4s out of combat, which is
 *  only ever worth the one point she walks into the fight already holding. */
const HY_INHERENT_2 = new Inherent({
  name: "Hiyuki: Ephemeral Realm",
  combatStart: () => applyCurrent(SNOWFORGED_BLADE, 1),
});

const HIYUKI_TALENTS = new Talent({
  name: "Hiyuki: Talents",
  constantStats: () => { addStat(Stat.BonusAtk, 12); addStat(Stat.CritRate, 8); },
});

export const HIYUKI = new Resonator({
  name: "Hiyuki",
  element: Attribute.Glacio,
  weapon: WeaponType.Sword,
  intro: () => Intro,
  outro: () => Outro,
  color: "#fb6a6f",
  maxEnergy: 125,

  /* Everfrost Dominion's Glacio Bite, the one thing on her that is true of the whole team: while
   * she is in it, every stack of Glacio Chafe *anyone* inflicts is converted, and each converted
   * stack deals its damage at the target's own stack **limit** rather than at the rung it just
   * reached. On a bare team that is the 10-stack rung on every single application; with Chisa's
   * +3 to the cap it is the 13-stack rung instead, which is where her pairing comes from.
   *
   * From `updateGlobal` so it sees a teammate's cast as readily as her own, and because that phase
   * is past every `updateDebuffs` (where a kit inflicts, Lucilla's Film Roll included) and still
   * ahead of the roster the stat phases are captured from. That last part is what lets the plain
   * stacks be taken straight back off — which is both what the kit says and what keeps status.ts's
   * own ramping damage from firing for the very stacks this just converted.
   *
   * Glacio Bite DMG *is* Glacio Chafe DMG, so it fires status.ts's shared ladder rather than
   * carrying a copy of those motion values, and the limit it indexes is Glacio Chafe's — Bite
   * counts as Chafe for every cap a teammate raises.
   *
   * `queueOn` rather than `queue`: a resonator's own gear runs `updateGlobal` with the current
   * slot switched to *her*, so a plain queue would pin every hit to her and have it read her Fine
   * Snow and Frostburn amplification even on a stack Lucilla laid while on field. The hits belong
   * to whoever actually inflicted.
   *
   * "When Hiyuki joins the team, remove all stacks of Glacio Chafe from the targets" needs nothing
   * of its own: a fight starts with none on the target, and from the first one onward this is what
   * takes them off. */
  updateGlobal: () => {
    const inflicted = applied(GLACIO_CHAFE);
    if (inflicted === 0) return;
    revokeEnemy(GLACIO_CHAFE);
    applyEnemy(GLACIO_BITE, inflicted);
    const rung = GLACIO_CHAFE_DMG[currentTeam().enemyMax(GLACIO_CHAFE)]!;
    const applier = currentTeam().slot.resonator!;
    for (let i = 0; i < inflicted; i++) queueOn(applier, rung);
  },

  constantStats: () => {
    addStat(Stat.BaseHp, 10300); addStat(Stat.BaseAtk, 462.5); addStat(Stat.BaseDef, 1112.22);
  },

  afterAction: () => {
    // uba3 follow of tunebreak
    if (currentAction() != TUNE_BREAK) return;
    if (forte3() > 0 || forte2() > 0) {
      queue(FBA3);
    }
  }
});

/* ---------------------------------------------------------------------------------- rotation */

/** Frostblight in the fight's own first seconds, then out. Every visit after: the Intro banks 200
 *  Dedication and chains straight into Stage 3 for the last 100, Frost Splinter spends the bar,
 *  and Inward Vision trades it for Foreclaimed Self, 3 Frostharden and 4 stacks of Chafe. Jade
 *  Cleave tops Frostheart past 100 for the first Iai; each Foreclaimed Self chain after refills it
 *  for the next, three in total, which is exactly the Frostharden Inward Vision granted and so
 *  exactly the 3 Whiteout Bitterfrost spends. Echo, then the held Blade Liberation cashes the
 *  Snowforged Blade and ends the form, leaving her back in Present Self for the next Intro. She is
 *  always the team's main DPS, so this covers the loop and there is no opener chain to write. */
const HY_ROTATION = new Rotation([
  INTRO, BA3, FrostSplinter, Lib1,
  UHA, FBA2, FBA3,
  UHA, FBA2, FBA3,
  USkill1, USkill2, Iai, Iai, Iai,
  FHA, ECHO_CAST, Lib2Hold, OUTRO_NEXT,
]);

const HY_ECHOES = [
  new EchoLoadout(VOIDBORNE_CONSTRUCT, QUIET_SNOWFALL_5PC, QUIET_SNOWFALL_2PC),
];

export const HIYUKI_LOADOUT = new Loadout({
  resonator: HIYUKI,
  talent: HIYUKI_TALENTS,
  inherent1: HY_INHERENT_1,
  inherent2: HY_INHERENT_2,
  weapons: [FROSTBURN, EMERALD_OF_GENESIS],
  echoLoadouts: HY_ECHOES,
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Glacio3, Mainstat.ATK1),
  substat: chem("atk", "liberation"),
  rotation: HY_ROTATION,
});
