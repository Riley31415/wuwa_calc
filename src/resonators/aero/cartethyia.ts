/**
 * Cartethyia, ported to the new engine — a limited 5-star aero Sword main DPS who scales off Max
 * HP, and the only kit here with two forms of her own rather than a mode toggle.
 *
 * As Cartethyia she plants Sword Shadows: Basic Attack Stage 4 leaves a Sword of Divinity's
 * Shadow, her Heavy Attack and Intro a Sword of Discord's Shadow, her Resonance Skill a Sword of
 * Virtue's Shadow (one of each at a time, 20s). A Mid-air Attack recalls every shadow standing,
 * which both picks the Plunging Attack's own form — one, two or three shadows recalled, four
 * separate motion values — and converts each shadow into its Heart: Virtue, Mandate of Divinity,
 * Power of Discord. The rotation below plants all three before it plunges, so the three-shadow
 * plunge is the one it names; the other forms are declared beside it and unused, same as any kit's
 * off-line moves.
 *
 * Resonance Liberation - A Knight's Heartfelt Prayers spends the bar to become Fleurdelys for 12s
 * (Manifest), and every Fleurdelys press banks Conviction (forte1, 0-120). At 120 the Liberation
 * becomes Blade of Howling Squall, which spends the Conviction, ends Manifest and strips the
 * target's Aero Erosion — each stack removed amplifying that very hit 20%, five stacks' worth at
 * most. The HP cost (half her Max HP, a quarter at S5) never reaches the formula: every motion
 * value here reads Max HP, not current.
 *
 * The three Hearts, held from the plunge until Manifest ends:
 *  - Heart of Virtue is a force field and interruption resistance, so it carries no stat.
 *  - Mandate of Divinity amplifies Aero Erosion DMG 50% and halves its tick interval — the second
 *    half is real here, since Aero Erosion runs on a clock now (shared/status.ts): a second of
 *    hers advances the target's own half-second clock twice over.
 *  - Power of Discord levels the Aero Erosion stacks across nearby targets, which is nothing
 *    against the single target this calculator fights.
 *
 * MVs from nanoka.cc (character 1409) at skill level 10, cross-checked hit for hit against
 * wuwalab's own frame data, which is where energy, per-hit Concerto, off-tune and Conviction come
 * from — nanoka publishes none of those four for her beyond the flat Concerto Regen rows, which
 * agree. Her Fleurdelys-form Intro (Sword to Call for Freedom) is the one gap: its text says it
 * restores Conviction and neither source gives a number, so it carries none. Nothing casts it —
 * the loop always leaves Manifest on the Blade — so no number here depends on it.
 */
import { Tier, Stat, Attribute, WeaponType, Type1, Type2, Cast, Node, Scaling } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout } from "../../engine/gear.js";
import {
  addStat,
  appliedByMember,
  applyCurrent,
  applyEnemy,
  applyOthers,
  applyTeam,
  addEnemyForte2,
  casting,
  currentAction,
  currentMember,
  currentTeam,
  forte1,
  isHeld,
  maxStackIncrease,
  queue,
  removeStackEnemy,
  revokeCurrent,
  revokeEnemy,
  revokeTeam,
  setForte1,
  setStacksSelf,
  stacksOf,
  stacksOfEnemy,
} from "../../engine/context.js";
import { Action, Rotation, INTRO, ECHO_SWAP, OUTRO, ActionGroup } from "../../engine/rotation.js";
import { oneSecondPassed } from "../../shared/helpers.js";
import {
  AERO_EROSION, AERO_EROSION_ACTIONS, hasNegativeStatus, inflictedNegativeStatusBy, negativeStatusRung,
} from "../../shared/status.js";
import { BLAZING_BRILLIANCE, DEFIERS_THORN, RED_SPRING } from "../../weapons/sword.js";
import { NEW_STD_SWORD, EMERALD_OF_GENESIS } from "../../weapons/standard.js";
import { FLEURDELYS, WINDWARD_5PC, GUSTS_OF_WELKIN_5PC } from "../../echoes/rinascita.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { chem } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function cartethyiaAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Aero, scaling: Scaling.Hp, ...def });
}

/** Aero Erosion this cast puts on the target, declared where the kit text puts it. */
const erosion = (n: number) => ({ updateDebuffs: () => applyEnemy(AERO_EROSION, n) });

/** "Instantly trigger 1 instance of Aero Erosion DMG and reduce the stack by 1" — Fleurdelys's
 *  Basic Stage 5, Mid-air Stage 2 and May Tempest Break the Tides. The rung fires at the count
 *  standing after whatever this same cast inflicted, then the stack goes. */
const EROSION_BURST = {
  updateBuffs: () => {
    const rung = negativeStatusRung(AERO_EROSION_ACTIONS, stacksOfEnemy(AERO_EROSION));
    if (!rung) return;
    queue(rung);
    removeStackEnemy(AERO_EROSION, 1);
  },
};

// --- Cartethyia: basics, heavy, dodge counter (Sword to Carve My Forms). Stage 4 lays the Aero
//     Erosion and the Sword of Divinity's Shadow; the Heavy is considered Basic Attack DMG.
const BA1 = cartethyiaAction("Basic - Sword to Carve My Forms 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 4.78, energy: 0.70, concerto: 0.98, offtune: 2240 });
const BA2 = cartethyiaAction("Basic - Sword to Carve My Forms 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 13.13, energy: 1.93, concerto: 2.70, offtune: 6146 });
const BA3 = cartethyiaAction("Basic - Sword to Carve My Forms 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 17.12, energy: 2.52, concerto: 3.52, offtune: 8016 });
const BA4 = cartethyiaAction("Basic - Sword to Carve My Forms 4", {
  node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 15.10, energy: 2.22, concerto: 3.11, offtune: 7073, ...erosion(1),
  updateBuffs: () => applyCurrent(SWORD_OF_DIVINITY, 1),
});
const DC = cartethyiaAction("Dodge Counter - Sword to Carve My Forms", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 27.40, energy: 2.52, concerto: 5.64, offtune: 8016 });
const HA = cartethyiaAction("Heavy - Sword to Carve My Forms", {
  node: Node.Normal, cast: Cast.Heavy, type: Type1.Basic, mv: 12.48, energy: 2.51, concerto: 3.52, offtune: 8002,
  updateBuffs: () => applyCurrent(SWORD_OF_DISCORD, 1),
});
const BA234 = new ActionGroup("Basic - Sword to Carve My Forms 234", [BA2, BA3, BA4]);

// --- the Plunging Attack, one form per shadow count. Considered Aero Erosion DMG in its own
//     right (`type2`), so every Aero Erosion amplification on the team pays into it.
const RECALL = {
  updateBuffs: () => {
    if (isHeld(SWORD_OF_VIRTUE)) { revokeCurrent(SWORD_OF_VIRTUE); applyCurrent(HEART_OF_VIRTUE, 1); }
    if (isHeld(SWORD_OF_DIVINITY)) { revokeCurrent(SWORD_OF_DIVINITY); applyCurrent(MANDATE_OF_DIVINITY, 1); }
    if (isHeld(SWORD_OF_DISCORD)) { revokeCurrent(SWORD_OF_DISCORD); applyCurrent(POWER_OF_DISCORD, 1); }
  },
};
const PLUNGE = { node: Node.Normal, cast: Cast.MidAir, type: Type1.Basic, type2: Type2.AeroErosion, offtune: 4248, ...RECALL };
const Plunge = cartethyiaAction("Mid-air - Plunging Attack", { ...PLUNGE, mv: 5.65, energy: 1.33, concerto: 1.86 });
const Plunge1 = cartethyiaAction("Mid-air - Plunging Attack (1 Sword Shadow)", { ...PLUNGE, mv: 5.65, energy: 1.33, concerto: 1.86 });
const Plunge2 = cartethyiaAction("Mid-air - Plunging Attack (2 Sword Shadows)", { ...PLUNGE, mv: 9.90, energy: 1.35, concerto: 1.86 });
const Plunge3 = cartethyiaAction("Mid-air - Plunging Attack (3 Sword Shadows)", { ...PLUNGE, mv: 33.87, energy: 1.35, concerto: 1.86 });



// --- Cartethyia: skill and intro, both considered their own DMG and both laying 2 Aero Erosion
const Skill = cartethyiaAction("Skill - Sword to Bear Their Names", {
  node: Node.Skill, cast: Cast.Skill, type: Type1.Basic, mv: 29.53, energy: 16.28, concerto: 10, offtune: 7200, ...erosion(2),
  updateBuffs: () => applyCurrent(SWORD_OF_VIRTUE, 1),
});
const Intro = cartethyiaAction("Intro - Sword to Mark Tide's Trace", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 12.48, energy: 10.01, concerto: 10, offtune: 7008, ...erosion(2),
  updateBuffs: () => { revokeTeam(WINDS_DIVINE_BLESSING); applyCurrent(SWORD_OF_DISCORD, 1); },
});

// --- Fleurdelys (the Tempest forte circuit): every press banks Conviction, nothing spends it but
//     the Blade. Her Heavy and Enhanced Heavy are considered Basic Attack DMG.
const FBA1 = cartethyiaAction("Basic - Tempest 1", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 6.49, energy: 0.75, concerto: 1.05, offtune: 2400, forte1: 4 });
const FBA2 = cartethyiaAction("Basic - Tempest 2", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 9.09, energy: 1.94, concerto: 2.69, offtune: 6099, forte1: 14 });
const FBA3 = cartethyiaAction("Basic - Tempest 3", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 10.65, energy: 2.25, concerto: 3.15, offtune: 7200, forte1: 14 });
const FBA4 = cartethyiaAction("Basic - Tempest 4", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 13.70, energy: 2.25, concerto: 3.15, offtune: 7200, forte1: 10 });
const FBA5 = cartethyiaAction("Basic - Tempest 5", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 36.00, energy: 1.99, concerto: 2.78, offtune: 6337, forte1: 20, ...EROSION_BURST });
const FDC = cartethyiaAction("Dodge Counter - Tempest", { node: Node.Forte, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 15.99, energy: 2.25, concerto: 3.15, offtune: 7200, forte1: 14 });
const UpwardCut = cartethyiaAction("Basic - Tempest Upward Cut", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 9.08, energy: 1.52, concerto: 2.12, offtune: 4840, forte1: 8 });
const FMA1 = cartethyiaAction("Mid-air - Tempest 1", { node: Node.Forte, cast: Cast.MidAir, type: Type1.Basic, mv: 9.06, energy: 2.00, concerto: 2.81, offtune: 6385, forte1: 6 });
const FMA2 = cartethyiaAction("Mid-air - Tempest 2", { node: Node.Forte, cast: Cast.MidAir, type: Type1.Basic, mv: 29.55, energy: 2.07, concerto: 2.88, offtune: 6576, forte1: 15, ...EROSION_BURST });
const FMA3 = cartethyiaAction("Mid-air - Tempest 3", { node: Node.Forte, cast: Cast.MidAir, type: Type1.Basic, mv: 2.20, energy: 0.48, concerto: 0.67, offtune: 1528, forte1: 10 });
const FHA = cartethyiaAction("Heavy - Tempest", { node: Node.Forte, cast: Cast.Heavy, type: Type1.Basic, mv: 14.25, energy: 1.76, concerto: 2.46, offtune: 5617, forte1: 8 });
const FEHA = cartethyiaAction("Heavy - Tempest (Enhanced)", { node: Node.Forte, cast: Cast.Heavy, type: Type1.Basic, mv: 19.45, energy: 2.40, concerto: 3.38, offtune: 7665, forte1: 24 });
const FSkill1 = cartethyiaAction("Skill - Sword to Answer Waves' Call", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, mv: 24.80, energy: 2.33, concerto: 10, offtune: 7340, forte1: 8 });
const FSkill2 = cartethyiaAction("Skill - May Tempest Break the Tides", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, mv: 24.81, energy: 8.82, concerto: 10, offtune: 7339, forte1: 28, ...EROSION_BURST });
/** Her Intro in Fleurdelys form — reached only by swapping out mid-Manifest and back in, which
 *  this loop never does. Conviction unknown (see the file header), so it banks none. */
const FIntro = cartethyiaAction("Intro - Sword to Call for Freedom", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 14.25, energy: 1.76, concerto: 10, offtune: 5617,
  updateBuffs: () => revokeTeam(WINDS_DIVINE_BLESSING),
});


const FBA345 = new ActionGroup("Basic - Tempest 345", [FBA3, FBA4, FBA5]);
const FBA12345 = new ActionGroup("Basic - Tempest 12345", [FBA1, FBA2, FBA3, FBA4, FBA5]);

// --- the two Liberations: the transform, then the Blade once Conviction is full
const Liberation = cartethyiaAction("Liberation - A Knight's Heartfelt Prayers", {
  node: Node.Liberation, cast: Cast.Liberation, type: Type1.Liberation, mv: 0, concerto: 20, resetEnergy: true,
  updateBuffs: () => applyCurrent(MANIFEST, 1),
});
/** Blade of Howling Squall: spends every Conviction, ends Manifest, and strips the target's Aero
 *  Erosion — 20% amplification on this one hit per stack taken, five at most. The strip waits for
 *  `afterAction` so the hit itself still reads the count it is paid for. */
const Lib2 = cartethyiaAction("Liberation - Blade of Howling Squall", {
  node: Node.Liberation, cast: Cast.Liberation, type: Type1.Liberation, mv: 91.84, concerto: 20, offtune: 168000, forte1: -120,
  // S6 stops the strip but not the payout: the amplification still reads what the target holds
  applyStats: () => addStat(Stat.Amp, 20 * Math.min(5, stacksOfEnemy(AERO_EROSION))),
  updateBuffs: () => {
    if (forte1() > 120) setForte1(120); // the declared -120 lands the gauge on exactly 0
    revokeCurrent(MANIFEST); revokeCurrent(HEART_OF_VIRTUE);
    revokeCurrent(MANDATE_OF_DIVINITY); revokeCurrent(POWER_OF_DISCORD);
  },
  afterAction: () => {
    if (isHeld(CT_S6)) applyEnemy(AERO_EROSION, currentTeam().enemyMax(AERO_EROSION));
    else revokeEnemy(AERO_EROSION);
  },
});
const Outro = cartethyiaAction("Outro - Wind's Divine Blessing", {
  cast: Cast.Outro, concerto: -100, active: false,
  updateBuffs: () => applyTeam(WINDS_DIVINE_BLESSING, 1),
});

/* ------------------------------------------------------------------------------------ buffs */

/** The three Sword Shadows, one of each at a time — pure markers, spent by the Plunging Attack
 *  that recalls them (see `RECALL` above). */
const SWORD_OF_DIVINITY = new Buff({ name: "Cartethyia: Sword of Divinity's Shadow" });
const SWORD_OF_DISCORD = new Buff({ name: "Cartethyia: Sword of Discord's Shadow" });
const SWORD_OF_VIRTUE = new Buff({ name: "Cartethyia: Sword of Virtue's Shadow" });

/** Manifest: 12s as Fleurdelys, opened by A Knight's Heartfelt Prayers and closed by the Blade.
 *  It survives a swap on purpose — that is what her Fleurdelys-form Intro is for. No stat of its
 *  own; S6 is what reads it. */
const MANIFEST = new Buff({ name: "Cartethyia: Manifest" });

/** Heart of Virtue: a force field and interruption resistance, so nothing the formula reads. */
const HEART_OF_VIRTUE = new Buff({ name: "Cartethyia: Heart of Virtue" });

/** Mandate of Divinity: +50% Aero Erosion DMG Amplification, and the status's own tick interval
 *  halved for as long as she is the one on field — its clock counts half-seconds, so a second of
 *  hers hands it two more (shared/status.ts). */
const MANDATE_OF_DIVINITY = new Buff({
  name: "Cartethyia: Mandate of Divinity",
  applyStats: () => addStat(Stat.Amp, 50, Type2.AeroErosion),
  updateBuffs: () => { if (oneSecondPassed() && stacksOfEnemy(AERO_EROSION) > 0) addEnemyForte2(2); },
});

/** Power of Discord: levels the Aero Erosion stacks across every nearby target, which is nothing
 *  against the one target this calculator fights. Held for the name. */
const POWER_OF_DISCORD = new Buff({ name: "Cartethyia: Power of Discord" });

/** A Heart's Truest Wishes (Inherent Skill): +20% Healing Received for every Resonator but her —
 *  unused by the formula, healing being out of scope — and 25 Windstrings to Rover: Aero on his
 *  own Omega Storm. `applyOthers` from her own updateGlobal is that "everyone but her" exactly:
 *  the hook runs on every action with the pointers on her, so the grant lands on the other two.
 *  Rover is read by name, the way the Fleurdelys echo reads him, rather than by importing his
 *  module. */
const TRUEST_WISHES = new Buff({
  name: "Inherent: A Heart's Truest Wishes",
  applyStats: () => {
    addStat(Stat.HealingReceived, 20);
    if (casting(Cast.Liberation) && currentMember().resonator?.name === "Aero Rover") addStat(Stat.AddForte1, 25);
  },
});
const CT_INHERENT_1 = new Inherent({
  name: "Inherent: A Heart's Truest Wishes",
  updateGlobal: () => applyOthers(TRUEST_WISHES, 1),
});

/** Wind's Indelible Imprint (Inherent Skill): the target takes 30% more DMG from her while it
 *  holds 1-3 Aero Erosion, and another 10% a stack past the third, three of those at most. Her
 *  own gear, so it pays on her turns alone. */
const CT_INHERENT_2 = new Inherent({
  name: "Inherent: Wind's Indelible Imprint",
  applyStats: () => {
    const held = stacksOfEnemy(AERO_EROSION);
    if (held < 1) return;
    addStat(Stat.Amp, 30 + 10 * Math.min(3, Math.max(0, held - 3)));
  },
});

/** Wind's Divine Blessing (Outro): +17.5% Aero DMG Amplification for 20s to whoever is active —
 *  never her, and only into a target already carrying a Negative Status. 20s, so it is lost on
 *  her own next Intro (both of them revoke it). */
const WINDS_DIVINE_BLESSING = new Buff({
  name: "Cartethyia: Outro",
  applyStats: () => {
    if (!currentAction().active || isHeld(CARTETHYIA_RESONATOR) || !hasNegativeStatus()) return;
    addStat(Stat.Amp, 17.5, Attribute.Aero);
  },
});

/* -------------------------------------------------------------------------------- sequences */

/** S1: Crit. DMG +25% each time Conviction reaches 30/60/90/120, four stacks, gone once the Blade
 *  is cast. The Zeal half needs a defeated enemy, which this fight never has. */
const CROWN_OF_FATE = new Buff({
  name: "Cartethyia S1: Crown Destined by Fate", maxStacks: 4,
  applyStats: () => addStat(Stat.CritDmg, 25 * stacksOf(CROWN_OF_FATE)),
});
const CT_S1 = new Sequence({
  name: "Cartethyia S1: Crown Destined by Fate",
  // afterAction is the one phase that sees Conviction as the cast actually left it
  afterAction: () => {
    if (currentAction() === Lib2) { revokeCurrent(CROWN_OF_FATE); return; }
    const rungs = Math.min(4, Math.floor(forte1() / 30));
    if (rungs > stacksOf(CROWN_OF_FATE)) setStacksSelf(CROWN_OF_FATE, rungs);
  },
});

/** S2: the Liberation raises the Aero Erosion cap 3 and arms one attack that lays 3 stacks and
 *  fires an Aero Erosion instance without spending any; Cartethyia's own Basic, Heavy, Dodge
 *  Counter and Intro hit 50% harder, her Mid-air 200%. Her Fleurdelys presses (`Node.Forte`) are
 *  not hers for this. */
const BROKEN_BLADE = new Buff({
  name: "Cartethyia S2: Blade Broken by Tempest",
  updateDebuffs: () => { if (currentAction().mv > 0) applyEnemy(AERO_EROSION, 3); },
  updateBuffs: () => {
    if (currentAction().mv <= 0) return;
    const rung = negativeStatusRung(AERO_EROSION_ACTIONS, stacksOfEnemy(AERO_EROSION));
    if (rung) queue(rung);
    revokeCurrent(BROKEN_BLADE);
  },
});
const CT_S2 = new Sequence({
  name: "Cartethyia S2: Blade Broken by Tempest",
  updateBuffs: () => {
    if (currentAction() !== Liberation) return;
    maxStackIncrease(AERO_EROSION, 3);
    applyCurrent(BROKEN_BLADE, 1);
  },
  applyStats: () => {
    const a = currentAction();
    if (a.node === Node.Forte) return;
    if (casting(Cast.MidAir)) addStat(Stat.MulMv, 200);
    else if (casting(Cast.Basic) || casting(Cast.Heavy) || casting(Cast.DodgeCounter) || casting(Cast.Intro)) addStat(Stat.MulMv, 50);
  },
});

/** S3: the four Fleurdelys casts that already burst Aero Erosion now lay 2 stacks of it first,
 *  and the Blade's own multiplier doubles. */
const CT_S3 = new Sequence({
  name: "Cartethyia S3: Prisoner Hanged in the Tower",
  updateDebuffs: () => {
    const a = currentAction();
    if (a === FBA5 || a === FMA2 || a === FEHA || a === FSkill2) applyEnemy(AERO_EROSION, 2);
  },
  applyStats: () => { if (currentAction() === Lib2) addStat(Stat.MulMv, 100); },
});

/** S4: anyone on the team inflicting a Negative Status hands the whole team +20% DMG Bonus for
 *  20s — permanent uptime in practice, since her own line lays Aero Erosion every visit. */
const SACRIFICE = new Buff({
  name: "Cartethyia S4: Sacrifice Made for Salvation",
  applyStats: () => addStat(Stat.DmgBonus, 20),
});
const CT_S4 = new Sequence({
  name: "Cartethyia S4: Sacrifice Made for Salvation",
  // from updateGlobal "me" is the holder, so the acting slot has to be named (status.ts)
  updateGlobal: () => { if (inflictedNegativeStatusBy(currentTeam().slot)) applyTeam(SACRIFICE, 1); },
});

/** S5: a once-per-10-minutes death save and a cheaper Liberation HP cost — neither reaches the
 *  formula, since her motion values read Max HP rather than current. Held for the name. */
const CT_S5 = new Sequence({ name: "Cartethyia S5: Hope Reshaped in Storms" });

/** S6: the Blade tops the target's Aero Erosion up instead of stripping it (see the Blade's own
 *  afterAction), any teammate inflicting Aero Erosion at the cap fires an instance of it, and the
 *  target takes 40% more DMG from Fleurdelys. The 30s window on the middle half covers the whole
 *  loop — her Intro and both Liberations all open it — so it is simply always on. */
const CT_S6 = new Sequence({
  name: "Cartethyia S6: Freedom Found in Storm's Wake",
  updateGlobal: () => {
    if (!appliedByMember(AERO_EROSION, currentTeam().slot)) return;
    if (stacksOfEnemy(AERO_EROSION) < currentTeam().enemyMax(AERO_EROSION)) return;
    const rung = negativeStatusRung(AERO_EROSION_ACTIONS, stacksOfEnemy(AERO_EROSION));
    if (rung) queue(rung);
  },
  applyStats: () => { if (isHeld(MANIFEST)) addStat(Stat.Amp, 40); },
});

/* --------------------------------------------------------------------------- kit and loadout */

/** Her, as a Resonator: name/element/weapon, and her own base stat line. The Intro resolves by
 *  form — Manifest survives a swap, so a visit begun mid-Manifest opens as Fleurdelys. */
const CARTETHYIA_RESONATOR = new Resonator({
  name: "Cartethyia",
  tier: Tier.Limited,
  element: Attribute.Aero,
  weapon: WeaponType.Sword,
  intro: () => (isHeld(MANIFEST) ? FIntro : Intro),
  outro: () => Outro,
  color: "#1d3fff",
  maxEnergy: 125,

  constantStats: () => {
    addStat(Stat.BaseHp, 14800); addStat(Stat.BaseAtk, 312.5); addStat(Stat.BaseDef, 611.11);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
const CARTETHYIA_TALENTS = new Talent({
  name: "Cartethyia: Talents",
  constantStats: () => { addStat(Stat.CritRate, 8); addStat(Stat.BonusHp, 12); },
});

// The line the kit asks for: her Intro plants a Discord shadow and chains into Stage 2, the Skill
// plants Virtue, Stage 4 plants Divinity, and the plunge recalls all three for its own biggest
// form plus every Heart. Then the transform, a Fleurdelys chain that banks exactly 120 Conviction
// (8 + 28 + 14 + 10 + 20 + 8 + 24 + 8), and the Blade. She is never the team's own lead, so this
// covers opener and loop both.

const CT_ROTATION = new Rotation([
  INTRO, BA234,
  Skill, Plunge3,
  Liberation,
  FSkill1, FSkill2, FBA345, FBA12345,
  Lib2, ECHO_SWAP, OUTRO,
]);

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills, her own sword and echo, the
// two Aero Erosion sonatas, mainstat/substat
export const CARTETHYIA = new Loadout({
  resonator: CARTETHYIA_RESONATOR,
  talent: CARTETHYIA_TALENTS,
  inherent1: CT_INHERENT_1,
  inherent2: CT_INHERENT_2,
  sequences: [CT_S1, CT_S2, CT_S3, CT_S4, CT_S5, CT_S6],
  weapons: [DEFIERS_THORN, EMERALD_OF_GENESIS, RED_SPRING],
  echoLoadouts: [new EchoLoadout(FLEURDELYS, WINDWARD_5PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.HP4, Mainstat.Aero3, Mainstat.HP1),
  substat: chem("hp", "basic"),
  rotation: CT_ROTATION,
});
