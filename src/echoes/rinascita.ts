/** Mainslot echoes and sonatas from Rinascita (versions 2.0-2.4). */
import { Stat, Attribute, Type, Subtype, Cast, Scaling, BuffTarget, Position } from "../engine/stats.js";
import { Buff, Sonata, Sonata2pc, Mainslot } from "../engine/gear.js";
import { NM_TEMPEST_MEPHIS } from "./jinzhou.js";
import {
  addStat, casting, hitting, getStat, queue, queueOutro, stacksOfEnemy, currentMember, isActive,
  onApplied, onCast, onType, onInflict, inflicting,
} from "../engine/context.js";
import { Action } from "../engine/rotation.js";
import { AERO_EROSION, HELIACAL_EMBER, SPECTRO_FRAZZLE } from "../shared/status.js";
import { PseudoTransformEcho, SummonEcho, TransformEcho } from "./echo.js";

/* ----------------------------------------------------------------------------- Carlotta, 2.0 */

/** Sentry Construct, Carlotta's own mainslot echo — flat Glacio/Resonance Skill DMG Bonus, no trigger. */
export const SENTRY_CONSTRUCT = new Mainslot({
  id: 6000083,
  name: "Sentry Construct",
  cost: 4,
  stats: [[Stat.DmgBonus, 12, Attribute.Glacio], [Stat.DmgBonus, 12, Type.Skill]],
});
export const ACTION_SENTRY_CONSTRUCT = new TransformEcho("Echo - Sentry Construct", {
  mainslot: SENTRY_CONSTRUCT, endPosition: Position.Grounded, animFrames: 82,
  bullets: [{ hitFrame: 50, mv: 40500, energy: 562 }],
  cooldown: 60 * 25,
  element: Attribute.Glacio, scaling: Scaling.Atk, type: Type.Echo,
});

/** Frosty Resolve, Carlotta's own sonata (also carried by Empyrean Anthem's Overlord-class
 *  echoes). 2pc: +12% Resonance Skill DMG Bonus flat. 5pc: Resonance Skill grants +22.5% Glacio
 *  DMG Bonus for 15s; Resonance Liberation grants +18% Resonance Skill DMG Bonus for 5s, up to
 *  2 stacks. */
export const FROSTY_RESOLVE_2PC = new Sonata2pc({ id: 10, name: "Frosty Resolve 2pc", echoes: () => [SENTRY_CONSTRUCT, NM_LAMPY], stats: [[Stat.DmgBonus, 12, Type.Skill]] });
export const FROSTY_RESOLVE_GLACIO = new Buff({
  name: "Frosty Resolve 5pc: Glacio",
  duration: 60 * 15,
  stats: [[Stat.DmgBonus, 22.5, Attribute.Glacio]],
});
export const FROSTY_RESOLVE_SKILL_DMG = new Buff({
  name: "Frosty Resolve 5pc: Resonance Skill", maxStacks: 2, duration: 60 * 5,
  stats: [[Stat.DmgBonus, 18, Type.Skill]], perStack: true,
});
export const FROSTY_RESOLVE_5PC = new Sonata({
  id: 10,
  name: "Frosty Resolve 5pc",
  sonata2pc: FROSTY_RESOLVE_2PC,
  grants: [
    { on: onCast(Cast.Skill), buff: FROSTY_RESOLVE_GLACIO },
    { on: onCast(Cast.Liberation), buff: FROSTY_RESOLVE_SKILL_DMG },
  ],
});

/* ------------------------------------------------------------------------------- Roccia, 2.0 */

/** Nightmare: Impermanence Heron, Roccia's own mainslot echo — flat Havoc/Heavy Attack DMG
 *  Bonus, no trigger. */
export const NM_HERON = new Mainslot({
  id: 6000087,
  name: "Nightmare: Impermanence Heron",
  cost: 4,
  stats: [[Stat.DmgBonus, 12, Attribute.Havoc], [Stat.DmgBonus, 12, Type.Heavy]],
});
export const ACTION_NM_HERON = new TransformEcho("Echo - Nightmare: Impermanence Heron", {
  mainslot: NM_HERON, castPosition: Position.Grounded, endPosition: Position.Grounded, animFrames: 122,
  bullets: [11, 17, 23, 29, 35, 41, 47, 53, 59, 65].map((f) => ({ hitFrame: f, mv: 4050, energy: 56 })),
  cooldown: 60 * 25,
  element: Attribute.Havoc, scaling: Scaling.Atk, type: Type.Echo,
});

/* ---------------------------------------------------------------------------- Cantarella, 2.2 */

/** Lorelei, Cantarella's own mainslot echo — flat Havoc/Basic DMG Bonus, no trigger. */
export const LORELEI = new Mainslot({
  id: 6000082,
  name: "Lorelei",
  cost: 4,
  stats: [[Stat.DmgBonus, 12, Attribute.Havoc], [Stat.DmgBonus, 12, Type.Basic]],
});
export const ACTION_LORELEI = new TransformEcho("Echo - Lorelei", {
  mainslot: LORELEI, endPosition: Position.Grounded, animFrames: 140,
  bullets: [{ hitFrame: 49, mv: 40500, energy: 562 }],
  cooldown: 60 * 25,
  element: Attribute.Havoc, scaling: Scaling.Atk, type: Type.Echo,
});

/** Midnight Veil, Cantarella's own sonata — also reused by Roccia and Phrolova. 2pc: +10% Havoc
 *  DMG Bonus flat. 5pc: her outro also fires a 480% Havoc burst and hands the incoming
 *  resonator +15% Havoc DMG Bonus for 15s. */
export const MIDNIGHT_VEIL_2PC = new Sonata2pc({ id: 12, name: "Midnight Veil 2pc", echoes: [LORELEI, NM_HERON], stats: [[Stat.DmgBonus, 10, Attribute.Havoc]] });
export const ACTION_MIDNIGHT_VEIL_BURST = new Action("Outro - Midnight Veil", {
  element: Attribute.Havoc, scaling: Scaling.Atk, type: Type.Outro, bullets: [{ hitFrame: 0, mv: 48000 }],
});
export const MIDNIGHT_VEIL_HANDOFF = new Buff({
  name: "Midnight Veil 5pc (outro)",
  duration: 60 * 15,
  stats: [[Stat.DmgBonus, 15, Attribute.Havoc]],
});
export const MIDNIGHT_VEIL_5PC = new Sonata({
  id: 12,
  name: "Midnight Veil 5pc",
  sonata2pc: MIDNIGHT_VEIL_2PC,
  updateBuffs: () => {
    if (casting(Cast.Outro)) { queue(ACTION_MIDNIGHT_VEIL_BURST); queueOutro(MIDNIGHT_VEIL_HANDOFF); }
  },
});

/* ---------------------------------------------------------------------------------- Brant, 2.1 */

/** Dragon of Dirge, Brant's own mainslot echo — flat Fusion/Basic Attack DMG Bonus, no trigger. */
export const DRAGON_OF_DIRGE = new Mainslot({
  id: 6000084,
  name: "Dragon of Dirge",
  cost: 4,
  stats: [[Stat.DmgBonus, 12, Attribute.Fusion], [Stat.DmgBonus, 12, Type.Basic]],
});
export const ACTION_DRAGON_OF_DIRGE = new TransformEcho("Echo - Dragon of Dirge", {
  mainslot: DRAGON_OF_DIRGE, endPosition: Position.Midair, animFrames: 108,
  // the rift's eleven ticks (wuwalab's), all committed with the first
  bullets: [46, 76, 106, 137, 167, 197, 226, 256, 287, 317, 346].map((f) => ({ hitFrame: f, commitFrame: 46, mv: 3681, energy: 51 })),
  cooldown: 60 * 25,
  element: Attribute.Fusion, scaling: Scaling.Atk, type: Type.Echo,
});

export const TIDEBREAKING_2PC = new Sonata2pc({ id: 14, name: "Tidebreaking Courage 2pc", echoes: [DRAGON_OF_DIRGE], stats: [[Stat.ER, 10]] });

/** +15% ATK flat, and +30% (unscoped) DMG Bonus once Energy Regen reaches 250% — read via
 *  convertStats() so every ER contribution has already landed this action. */
export const TIDEBREAKING_5PC = new Sonata({
  id: 14,
  name: "Tidebreaking Courage 5pc",
  sonata2pc: TIDEBREAKING_2PC,
  stats: [[Stat.BonusAtk, 15]],
  convertStats: () => { if (getStat(Stat.ER) >= 250) addStat(Stat.DmgBonus, 30); },
});

/* --------------------------------------------------------------------------------- Phrolova */

/** Nightmare: Hecate, Phrolova's own mainslot echo — flat Havoc/Echo Skill DMG Bonus, no trigger. */
export const NM_HECATE = new Mainslot({
  id: 6000115,
  name: "Nightmare: Hecate",
  cost: 4,
  stats: [[Stat.DmgBonus, 12, Attribute.Havoc], [Stat.DmgBonus, 20, Type.Echo]],
});
export const ACTION_NM_HECATE = new TransformEcho("Echo - Nightmare: Hecate", {
  mainslot: NM_HECATE, castPosition: Position.Grounded, endPosition: Position.Grounded, animFrames: 50, cooldown: 60 * 25,
  bullets: [7, 35, 40].map((f) => ({ hitFrame: f, mv: 15239, energy: 105 })),
  element: Attribute.Havoc, scaling: Scaling.Atk, type: Type.Echo,
});

/* ------------------------------------------------------------------------------------ Zhezhi */

/** Nightmare: Lampylumen Myriad, Zhezhi's own mainslot echo — the only glacio Coordinated
 *  Attack character. Flat Glacio/Coordinated Attack DMG Bonus, no trigger. */
export const NM_LAMPY = new Mainslot({
  id: 6000105,
  name: "Nightmare: Lampylumen Myriad",
  cost: 4,
  stats: [[Stat.DmgBonus, 12, Attribute.Glacio], [Stat.DmgBonus, 30, Subtype.Coordinated]],
});
export const ACTION_NM_LAMPY = new SummonEcho("Echo - Nightmare: Lampylumen Myriad", {
  mainslot: NM_LAMPY, cooldown: 60 * 20,
  element: Attribute.Glacio, scaling: Scaling.Atk, type: Type.Echo, bullets: [{ hitFrame: 68, commitFrame: 0, mv: 27360, energy: 380 }],
});

export const HECATE = new Mainslot({
  id: 6000085,
  name: "Hecate",
  cost: 4,
  stats: [[Stat.DmgBonus, 40, Subtype.Coordinated]],
});
// the three Crescent Servants' blades, three rounds of them (wuwalab's nine)
export const ACTION_HECATE = new SummonEcho("Echo - Hecate", {
  mainslot: HECATE, cooldown: 60 * 20,
  element: Attribute.Havoc, scaling: Scaling.Atk, type: Type.Echo, bullets: [0, 0, 0, 30, 30, 30, 60, 60, 60].map((f) => ({ hitFrame: f, commitFrame: 0, mv: 4559, energy: 63 })),
});

/** Empyrean Anthem, Zhezhi's own sonata. 2pc: +10% ER flat. 5pc: +80% Coordinated Attack DMG
 *  Bonus, self only. A Coordinated Attack crit also grants the whole team +20% ATK for 4s,
 *  assumed permanent uptime once one lands (a real source re-triggers well past 21s). */
export const EMPYREAN_ANTHEM_2PC = new Sonata2pc({ id: 13, name: "Empyrean Anthem 2pc", echoes: [HECATE, NM_TEMPEST_MEPHIS, NM_LAMPY], stats: [[Stat.ER, 10]] });
export const EMPYREAN_ANTHEM_5PC = new Sonata({
  id: 13,
  name: "Empyrean Anthem 5pc",
  sonata2pc: EMPYREAN_ANTHEM_2PC,
  stats: [[Stat.DmgBonus, 80, Subtype.Coordinated]],
  grants: [{ on: onType(Subtype.Coordinated), buff: () => EMPYREAN_ANTHEM_TEAM, to: BuffTarget.Team, onHit: true }],
});
export const EMPYREAN_ANTHEM_TEAM = new Buff({
  name: "Empyrean Anthem 5pc",
  duration: 60 * 4,
  stats: [[Stat.BonusAtk, 20]], when: isActive,
});

/* ------------------------------------------------------------------------------- Ciaccona */

/** Nightmare: Kelpie, Ciaccona's own mainslot echo — flat Glacio/Aero DMG Bonus for whoever wears
 *  it. The Echo Skill itself is Glacio; switching the wearer out with an Outro summons Kelpie once
 *  more for the same multiplier as Aero DMG, which is what ACTION_NM_KELPIE_OUTRO below is. */
export const NM_KELPIE = new Mainslot({
  id: 6000113,
  name: "Nightmare: Kelpie",
  cost: 4,
  stats: [[Stat.DmgBonus, 12, Attribute.Glacio], [Stat.DmgBonus, 12, Attribute.Aero]],
  updateBuffs: () => { if (casting(Cast.Outro)) queue(ACTION_NM_KELPIE_OUTRO); },
});
export const ACTION_NM_KELPIE = new TransformEcho("Echo - Nightmare: Kelpie", {
  mainslot: NM_KELPIE, castPosition: Position.Grounded, endPosition: Position.Grounded, animFrames: 138,
  bullets: [{ hitFrame: 91, mv: 40500, energy: 281 }],
  cooldown: 60 * 25,
  element: Attribute.Glacio, scaling: Scaling.Atk, type: Type.Echo,
});
export const ACTION_NM_KELPIE_OUTRO = new Action("Echo - Nightmare: Kelpie (Outro)", {
  element: Attribute.Aero, scaling: Scaling.Atk, type: Type.Echo, bullets: [{ hitFrame: 0, mv: 40500, energy: 281 }], 
});

/* ----------------------------------------------------------------------------- Ciaccona, 2.3 */

/** Gusts of Welkin, the Aero Erosion sonata. 2pc: +10% Aero DMG Bonus flat. 5pc: inflicting Aero
 *  Erosion pays the whole team +15% Aero DMG Bonus and the resonator who inflicted it another 15%,
 *  20s — so the team half is lost on the applier's own next Intro and the self half on their own
 *  outro, per the standing duration rules. */
export const GUSTS_OF_WELKIN_TEAM = new Buff({
  name: "Gusts of Welkin 5pc (team)",
  duration: 60 * 20,
  stats: [[Stat.DmgBonus, 15, Attribute.Aero]],
});
export const GUSTS_OF_WELKIN_SELF = new Buff({
  name: "Gusts of Welkin 5pc",
  duration: 60 * 20,
  stats: [[Stat.DmgBonus, 15, Attribute.Aero]],
});
export const GUSTS_OF_WELKIN_2PC = new Sonata2pc({ id: 16, name: "Gusts of Welkin 2pc", echoes: () => [FLEURDELYS, NM_KELPIE, CAPITANEUS], stats: [[Stat.DmgBonus, 10, Attribute.Aero]] });
export const GUSTS_OF_WELKIN_5PC = new Sonata({
  id: 16,
  name: "Gusts of Welkin 5pc",
  sonata2pc: GUSTS_OF_WELKIN_2PC,
  grants: [
    { on: onInflict(AERO_EROSION), buff: GUSTS_OF_WELKIN_TEAM, to: BuffTarget.Team },
    { on: onInflict(AERO_EROSION), buff: GUSTS_OF_WELKIN_SELF },
  ],
});

/* --------------------------------------------------------------------------- Cartethyia, 2.4 */

/** Reminiscence: Fleurdelys, the Windcleaver summon: eight 27.36% Aero hits and one 136.8%. The
 *  main-slot wearer gets +10% Aero DMG Bonus, and another +10% when that wearer is Rover: Aero or
 *  Cartethyia. Both are checked by name: importing either module here would close the cycle their
 *  own loadouts already open by equipping this echo, and the loser of that race is whichever file
 *  the loader reaches second. */
export const FLEURDELYS = new Mainslot({
  id: 6000106,
  name: "Reminiscence: Fleurdelys",
  cost: 4,
  constantStats: () => {
    addStat(Stat.DmgBonus, 10, Attribute.Aero);
    const worn = currentMember().resonator?.name;
    if (worn === "Aero Rover" || worn === "Cartethyia") addStat(Stat.DmgBonus, 10, Attribute.Aero);
  },
});
export const ACTION_FLEURDELYS = new SummonEcho("Echo - Reminiscence: Fleurdelys", {
  mainslot: FLEURDELYS, cooldown: 60 * 20,
  element: Attribute.Aero, scaling: Scaling.Atk, type: Type.Echo,
  bullets: [...[24, 33, 42, 51, 60, 69, 78, 87].map((f) => ({ hitFrame: f, commitFrame: 0, mv: 2736, energy: 38 })), { hitFrame: 108, commitFrame: 0, mv: 13680, energy: 190 }],
});

/** Windward Pilgrimage, the other Aero Erosion sonata. 2pc: +10% Aero DMG Bonus flat. 5pc:
 *  hitting a target that already carries Aero Erosion grants +10% Crit. Rate and +30% Aero DMG
 *  Bonus for 10s. Unlike Gusts of Welkin above the
 *  trigger is the hit, not the inflict: `stacksOfEnemy`, so any hit while the status stands pays,
 *  including on Erosion a teammate put there. */
export const WINDWARD_2PC = new Sonata2pc({ id: 17, name: "Windward Pilgrimage 2pc", echoes: () => [FLEURDELYS, NM_KELPIE, CAPITANEUS], stats: [[Stat.DmgBonus, 10, Attribute.Aero]] });
export const WINDWARD_5PC = new Sonata({
  id: 17,
  name: "Windward Pilgrimage 5pc",
  sonata2pc: WINDWARD_2PC,
  grants: [{ on: () => stacksOfEnemy(AERO_EROSION) > 0, buff: () => WINDWARD_BUFF, onHit: true }],
});
export const WINDWARD_BUFF = new Buff({
  name: "Windward Pilgrimage 5pc",
  duration: 60 * 10,
  stats: [[Stat.CritRate, 10], [Stat.DmgBonus, 30, Attribute.Aero]],
});

/* ------------------------------------------------------------------- Phoebe and Zani, 2.4 */

/** Capitaneus, the Eternal Radiance set's Elite-class echo (2.2's, but worn by the 2.4 Spectro
 *  Frazzle kits it was printed for): one 118.80% Spectro smash plus the four 59.40% Merciless
 *  Judgements it generates, and a flat +12% Spectro and +12% Heavy Attack DMG Bonus for whoever
 *  wears it. None of the five hits carries concerto or off-tune.
 *
 *  Zani wears this over Nightmare: Mourning Aix below: that one's damage doubles against a
 *  Frazzled target, which in her team is never — her conversion clears the status on the very
 *  action that applied it — while this one's Heavy Attack bonus pays on every Heavy Slash, which
 *  is most of what she does. `Type.Heavy` reaches them because a scoped stat resolves against
 *  damage type, never `cast`: the Heavy Slashes are pressed on Basic Attack but deal Heavy. */
export const CAPITANEUS = new Mainslot({
  id: 6000104,
  name: "Capitaneus",
  cost: 3,
  stats: [[Stat.DmgBonus, 12, Attribute.Spectro], [Stat.DmgBonus, 12, Type.Heavy]],
});
export const ACTION_CAPITANEUS = new SummonEcho("Echo - Capitaneus", {
  mainslot: CAPITANEUS, castPosition: Position.Grounded, endPosition: Position.Grounded, cooldown: 60 * 20,
  element: Attribute.Spectro, scaling: Scaling.Atk, type: Type.Echo,
  bullets: [{ hitFrame: 41, commitFrame: 0, mv: 11880, energy: 165 }, ...[0, 1, 2, 3].map(() => ({ hitFrame: 43, commitFrame: 0, mv: 5940, energy: 82 }))],
});

/** Nightmare: Mourning Aix, the Eternal Radiance set's only Overlord-class echo and so the only
 *  one that fills a four-cost slot. One 273.6% Spectro summon whose own damage doubles against a
 *  target carrying Spectro Frazzle, and a flat +12% Spectro DMG Bonus for the wearer.
 *
 *  `SPECTRO_FRAZZLE` only, not Heliacal Ember: Zani's kit extends the count to Embers for the
 *  sonata effect below and for nothing else, so in her team the summon lands on an already
 *  converted target and pays the plain figure. */
export const NM_MOURNING_AIX = new Mainslot({
  id: 6000092,
  name: "Nightmare: Mourning Aix",
  cost: 4,
  stats: [[Stat.DmgBonus, 12, Attribute.Spectro]],
});
export const ACTION_NM_MOURNING_AIX = new SummonEcho("Echo - Nightmare: Mourning Aix", {
  mainslot: NM_MOURNING_AIX, cooldown: 60 * 20,
  element: Attribute.Spectro, scaling: Scaling.Atk, type: Type.Echo, bullets: [{ hitFrame: 80, commitFrame: 0, mv: 27360, energy: 380 }],
  applyStats: () => { if (stacksOfEnemy(SPECTRO_FRAZZLE) > 0) addStat(Stat.TotalDmg, 100); },
});

/** Eternal Radiance, the Spectro Frazzle sonata. 2pc: +10% Spectro DMG Bonus flat. 5pc:
 *  inflicting Spectro Frazzle grants +20% Crit. Rate for 15s, and attacking a target holding ten
 *  stacks grants +15% Spectro DMG Bonus for 15s — both short self windows.
 *
 *  Two different questions: the crit half is the inflict, the ten-stack half the count standing
 *  now. Heliacal Ember answers both — "Heliacal Ember stacks are counted toward the Spectro
 *  Frazzle stacks for the Eternal Radiance Sonata Effect" is the whole set, not just its tier, and
 *  without that the one resonator the clause is written for would never arm the crit at all: Zani
 *  inflicts Embers directly (Targeted Action) and converts away every Frazzle anyone else lands.
 *  A teammate who inflicts the Frazzle still arms it off their own application, and the grant caps
 *  at one stack, so the two reaching the same action never pays twice.
 *
 *  `applied`, not `appliedByMe`: the set is worn locally, so its wearer is always the acting slot,
 *  and a marker re-sourcing the status must not hide it (see the Film Roll case in status.ts). */
export const ETERNAL_RADIANCE_2PC = new Sonata2pc({ id: 11, name: "Eternal Radiance 2pc", echoes: [NM_MOURNING_AIX, CAPITANEUS], stats: [[Stat.DmgBonus, 10, Attribute.Spectro]] });
export const ETERNAL_RADIANCE_CRIT = new Buff({
  name: "Eternal Radiance 5pc (frazzle)", duration: 60 * 15,
  stats: [[Stat.CritRate, 20]],
});
export const ETERNAL_RADIANCE_SPECTRO = new Buff({
  name: "Eternal Radiance 5pc (10 stacks)", duration: 60 * 15,
  stats: [[Stat.DmgBonus, 15, Attribute.Spectro]],
});
export const ETERNAL_RADIANCE_5PC = new Sonata({
  id: 11,
  name: "Eternal Radiance 5pc",
  sonata2pc: ETERNAL_RADIANCE_2PC,
  grants: [
    { on: onApplied(SPECTRO_FRAZZLE, HELIACAL_EMBER), buff: ETERNAL_RADIANCE_CRIT },
    // read on the hit, after its own inflictions, and pays into that same hit
    {
      on: inflicting(() => hitting()
        && stacksOfEnemy(SPECTRO_FRAZZLE) + stacksOfEnemy(HELIACAL_EMBER) >= 10),
      buff: ETERNAL_RADIANCE_SPECTRO,
    },
  ],
});
