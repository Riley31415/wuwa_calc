/** Mainslot echoes and sonatas from Rinascita (versions 2.0-2.4). */
import { Stat, Attribute, Type1, Type2, Cast, Scaling, LifeTime, BuffTarget } from "../engine/stats.js";
import { Buff, Sonata, Sonata2pc, Mainslot, EchoType } from "../engine/gear.js";
import {
  addStat, casting, currentAction, getStat, queue, queueOutro, stacksOfEnemy, currentMember, isActive,
  onApplied, onCast, onType, onInflict,
} from "../engine/context.js";
import { Action } from "../engine/rotation.js";
import { AERO_EROSION, HELIACAL_EMBER, SPECTRO_FRAZZLE } from "../shared/status.js";

/* ----------------------------------------------------------------------------- Carlotta, 2.0 */

/** Sentry Construct, Carlotta's own mainslot echo — flat Glacio/Resonance Skill DMG Bonus, no trigger. */
export const ACTION_SENTRY_CONSTRUCT = new Action("Echo - Sentry Construct", {
  cast: Cast.Echo, element: Attribute.Glacio, scaling: Scaling.Atk, type: Type1.Echo, mv: 405, energy: 5.62,
});
export const SENTRY_CONSTRUCT = new Mainslot({
  name: "Sentry Construct",
  action: ACTION_SENTRY_CONSTRUCT,
  echoType: EchoType.TRANSFORM,
  stats: [[Stat.DmgBonus, 12, Attribute.Glacio], [Stat.DmgBonus, 12, Type1.Skill]],
});

/** Frosty Resolve, Carlotta's own sonata (also carried by Empyrean Anthem's Overlord-class
 *  echoes). 2pc: +12% Resonance Skill DMG Bonus flat. 5pc: Resonance Skill grants +22.5% Glacio
 *  DMG Bonus for 15s; Resonance Liberation grants +18% Resonance Skill DMG Bonus for 5s, up to
 *  2 stacks. */
export const FROSTY_RESOLVE_2PC = new Sonata2pc({ name: "Frosty Resolve 2pc", stats: [[Stat.DmgBonus, 12, Type1.Skill]] });
export const FROSTY_RESOLVE_GLACIO = new Buff({
  name: "Frosty Resolve 5pc: Glacio",
  stats: [[Stat.DmgBonus, 22.5, Attribute.Glacio]], until: LifeTime.Outro,
});
export const FROSTY_RESOLVE_SKILL_DMG = new Buff({
  name: "Frosty Resolve 5pc: Resonance Skill", maxStacks: 2,
  stats: [[Stat.DmgBonus, 18, Type1.Skill]], perStack: true, until: LifeTime.Outro,
});
export const FROSTY_RESOLVE_5PC = new Sonata({
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
export const ACTION_NM_HERON = new Action("Echo - Nightmare: Impermanence Heron", {
  cast: Cast.Echo, element: Attribute.Havoc, scaling: Scaling.Atk, type: Type1.Echo, mv: 405, energy: 5.6,
});
export const NM_HERON = new Mainslot({
  name: "Nightmare: Impermanence Heron",
  action: ACTION_NM_HERON,
  echoType: EchoType.TRANSFORM,
  stats: [[Stat.DmgBonus, 12, Attribute.Havoc], [Stat.DmgBonus, 12, Type1.Heavy]],
});

/* ---------------------------------------------------------------------------- Cantarella, 2.2 */

/** Lorelei, Cantarella's own mainslot echo — flat Havoc/Basic DMG Bonus, no trigger. */
export const ACTION_LORELEI = new Action("Echo - Lorelei", {
  cast: Cast.Echo, element: Attribute.Havoc, scaling: Scaling.Atk, type: Type1.Echo, mv: 405, energy: 5.62,
});
export const LORELEI = new Mainslot({
  name: "Lorelei",
  action: ACTION_LORELEI,
  echoType: EchoType.TRANSFORM,
  stats: [[Stat.DmgBonus, 12, Attribute.Havoc], [Stat.DmgBonus, 12, Type1.Basic]],
});

/** Midnight Veil, Cantarella's own sonata — also reused by Roccia and Phrolova. 2pc: +10% Havoc
 *  DMG Bonus flat. 5pc: her outro also fires a 480% Havoc burst and hands the incoming
 *  resonator +15% Havoc DMG Bonus for 15s. */
export const MIDNIGHT_VEIL_2PC = new Sonata2pc({ name: "Midnight Veil 2pc", stats: [[Stat.DmgBonus, 10, Attribute.Havoc]] });
export const ACTION_MIDNIGHT_VEIL_BURST = new Action("Outro - Midnight Veil", {
  element: Attribute.Havoc, scaling: Scaling.Atk, type: Type1.Outro, mv: 480,
});
export const MIDNIGHT_VEIL_HANDOFF = new Buff({
  name: "Midnight Veil 5pc (outro)",
  stats: [[Stat.DmgBonus, 15, Attribute.Havoc]], until: LifeTime.Outro,
});
export const MIDNIGHT_VEIL_5PC = new Sonata({
  name: "Midnight Veil 5pc",
  sonata2pc: MIDNIGHT_VEIL_2PC,
  updateBuffs: () => {
    if (casting(Cast.Outro)) { queue(ACTION_MIDNIGHT_VEIL_BURST); queueOutro(MIDNIGHT_VEIL_HANDOFF); }
  },
});

/* ---------------------------------------------------------------------------------- Brant, 2.1 */

// TODO check how many hits for real
/** Dragon of Dirge, Brant's own mainslot echo — flat Fusion/Basic Attack DMG Bonus, no trigger. */
export const ACTION_DRAGON_OF_DIRGE = new Action("Echo - Dragon of Dirge", {
  cast: Cast.Echo, element: Attribute.Fusion, scaling: Scaling.Atk, type: Type1.Echo, mv: 36.81 * 8, energy: 0.51 * 8,
});
export const DRAGON_OF_DIRGE = new Mainslot({
  name: "Dragon of Dirge",
  action: ACTION_DRAGON_OF_DIRGE,
  echoType: EchoType.TRANSFORM,
  stats: [[Stat.DmgBonus, 12, Attribute.Fusion], [Stat.DmgBonus, 12, Type1.Basic]],
});

export const TIDEBREAKING_2PC = new Sonata2pc({ name: "Tidebreaking Courage 2pc", stats: [[Stat.Er, 10]] });

/** +15% ATK flat, and +30% (unscoped) DMG Bonus once Energy Regen reaches 250% — read via
 *  convertStats() so every ER contribution has already landed this action. */
export const TIDEBREAKING_5PC = new Sonata({
  name: "Tidebreaking Courage 5pc",
  sonata2pc: TIDEBREAKING_2PC,
  stats: [[Stat.BonusAtk, 15]],
  convertStats: () => { if (getStat(Stat.Er) >= 250) addStat(Stat.DmgBonus, 30); },
});

/* --------------------------------------------------------------------------------- Phrolova */

/** Nightmare: Hecate, Phrolova's own mainslot echo — flat Havoc/Echo Skill DMG Bonus, no trigger. */
export const ACTION_NM_HECATE = new Action("Echo - Nightmare: Hecate", {
  cast: Cast.Echo, element: Attribute.Havoc, scaling: Scaling.Atk, type: Type1.Echo, mv: 457.17, energy: 3.15,
});
export const NM_HECATE = new Mainslot({
  name: "Nightmare: Hecate",
  action: ACTION_NM_HECATE,
  echoType: EchoType.TRANSFORM,
  stats: [[Stat.DmgBonus, 12, Attribute.Havoc], [Stat.DmgBonus, 20, Type1.Echo]],
});

/* ------------------------------------------------------------------------------------ Zhezhi */

/** Nightmare: Lampylumen Myriad, Zhezhi's own mainslot echo — the only glacio Coordinated
 *  Attack character. Flat Glacio/Coordinated Attack DMG Bonus, no trigger. */
export const ACTION_NM_LAMPY = new Action("Echo - Nightmare: Lampylumen Myriad", {
  cast: Cast.Echo, element: Attribute.Glacio, scaling: Scaling.Atk, type: Type1.Echo, mv: 273.6, energy: 3.8,
});
export const NM_LAMPY = new Mainslot({
  name: "Nightmare: Lampylumen Myriad",
  action: ACTION_NM_LAMPY,
  echoType: EchoType.SUMMON,
  stats: [[Stat.DmgBonus, 12, Attribute.Glacio], [Stat.DmgBonus, 30, Type2.Coordinated]],
});


export const ACTION_HECATE = new Action("Echo - Hecate", { // TODO unsure on hits
  cast: Cast.Echo, element: Attribute.Havoc, scaling: Scaling.Atk, type: Type1.Echo, mv: 	45.59*6, energy: 	0.63*6,
});
export const HECATE = new Mainslot({
  name: "Hecate",
  action: ACTION_HECATE,
  echoType: EchoType.SUMMON,
  stats: [[Stat.DmgBonus, 40, Type2.Coordinated]],
});

/** Empyrean Anthem, Zhezhi's own sonata. 2pc: +10% ER flat. 5pc: +80% Coordinated Attack DMG
 *  Bonus, self only. A Coordinated Attack crit also grants the whole team +20% ATK for 4s,
 *  assumed permanent uptime once one lands (a real source re-triggers well past 21s). */
export const EMPYREAN_ANTHEM_2PC = new Sonata2pc({ name: "Empyrean Anthem 2pc", stats: [[Stat.Er, 10]] });
export const EMPYREAN_ANTHEM_5PC = new Sonata({
  name: "Empyrean Anthem 5pc",
  sonata2pc: EMPYREAN_ANTHEM_2PC,
  stats: [[Stat.DmgBonus, 80, Type2.Coordinated]],
  grants: [{ on: onType(Type2.Coordinated), buff: () => EMPYREAN_ANTHEM_TEAM, to: BuffTarget.Team }],
});
export const EMPYREAN_ANTHEM_TEAM = new Buff({
  name: "Empyrean Anthem 5pc",
  stats: [[Stat.BonusAtk, 20]], when: isActive,
});

/* ------------------------------------------------------------------------------- Ciaccona */

/** Nightmare: Kelpie, Ciaccona's own mainslot echo — flat Glacio/Aero DMG Bonus for whoever wears
 *  it. The Echo Skill itself is Glacio; switching the wearer out with an Outro summons Kelpie once
 *  more for the same multiplier as Aero DMG, which is what ACTION_NM_KELPIE_OUTRO below is. */
export const ACTION_NM_KELPIE = new Action("Echo - Nightmare: Kelpie", {
  cast: Cast.Echo, element: Attribute.Glacio, scaling: Scaling.Atk, type: Type1.Echo, mv: 405, energy: 2.81,
});
export const ACTION_NM_KELPIE_OUTRO = new Action("Echo - Nightmare: Kelpie (Outro)", {
  element: Attribute.Aero, scaling: Scaling.Atk, type: Type1.Echo, mv: 405, energy: 2.81,
});
export const NM_KELPIE = new Mainslot({
  name: "Nightmare: Kelpie",
  action: ACTION_NM_KELPIE,
  echoType: EchoType.TRANSFORM,
  stats: [[Stat.DmgBonus, 12, Attribute.Glacio], [Stat.DmgBonus, 12, Attribute.Aero]],
  updateBuffs: () => { if (casting(Cast.Outro)) queue(ACTION_NM_KELPIE_OUTRO); },
});

/* ----------------------------------------------------------------------------- Ciaccona, 2.3 */

/** Gusts of Welkin, the Aero Erosion sonata. 2pc: +10% Aero DMG Bonus flat. 5pc: inflicting Aero
 *  Erosion pays the whole team +15% Aero DMG Bonus and the resonator who inflicted it another 15%,
 *  20s — so the team half is lost on the applier's own next Intro and the self half on their own
 *  outro, per the standing duration rules. */
export const GUSTS_OF_WELKIN_TEAM = new Buff({
  name: "Gusts of Welkin 5pc (team)",
  stats: [[Stat.DmgBonus, 15, Attribute.Aero]],
});
export const GUSTS_OF_WELKIN_SELF = new Buff({
  name: "Gusts of Welkin 5pc",
  stats: [[Stat.DmgBonus, 15, Attribute.Aero]],
});
export const GUSTS_OF_WELKIN_2PC = new Sonata2pc({ name: "Gusts of Welkin 2pc", stats: [[Stat.DmgBonus, 10, Attribute.Aero]] });
export const GUSTS_OF_WELKIN_5PC = new Sonata({
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
export const ACTION_FLEURDELYS = new Action("Echo - Reminiscence: Fleurdelys", {
  cast: Cast.Echo, element: Attribute.Aero, scaling: Scaling.Atk, type: Type1.Echo,
  mv: 27.36 * 8 + 136.8, energy: 0.38 * 8 + 1.9,
});
export const FLEURDELYS = new Mainslot({
  name: "Reminiscence: Fleurdelys",
  action: ACTION_FLEURDELYS,
  echoType: EchoType.SUMMON,
  constantStats: () => {
    addStat(Stat.DmgBonus, 10, Attribute.Aero);
    const worn = currentMember().resonator?.name;
    if (worn === "Aero Rover" || worn === "Cartethyia") addStat(Stat.DmgBonus, 10, Attribute.Aero);
  },
});

/** Windward Pilgrimage, the other Aero Erosion sonata. 2pc: +10% Aero DMG Bonus flat. 5pc:
 *  hitting a target that already carries Aero Erosion grants +10% Crit. Rate and +30% Aero DMG
 *  Bonus for 10s — a short self window, so lost after the outro. Unlike Gusts of Welkin above the
 *  trigger is the hit, not the inflict: `stacksOfEnemy`, so any hit while the status stands pays,
 *  including on Erosion a teammate put there. */
export const WINDWARD_2PC = new Sonata2pc({ name: "Windward Pilgrimage 2pc", stats: [[Stat.DmgBonus, 10, Attribute.Aero]] });
export const WINDWARD_5PC = new Sonata({
  name: "Windward Pilgrimage 5pc",
  sonata2pc: WINDWARD_2PC,
  grants: [{ on: () => stacksOfEnemy(AERO_EROSION) > 0, buff: () => WINDWARD_BUFF }],
});
export const WINDWARD_BUFF = new Buff({
  name: "Windward Pilgrimage 5pc",
  stats: [[Stat.CritRate, 10], [Stat.DmgBonus, 30, Attribute.Aero]], until: LifeTime.Outro,
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
 *  is most of what she does. `Type1.Heavy` reaches them because a scoped stat resolves against
 *  damage type, never `cast`: the Heavy Slashes are pressed on Basic Attack but deal Heavy. */
export const ACTION_CAPITANEUS = new Action("Echo - Capitaneus", {
  cast: Cast.Echo, element: Attribute.Spectro, scaling: Scaling.Atk, type: Type1.Echo,
  mv: 118.80 + 59.40 * 4, energy: 1.65 + 0.82 * 4,
});
export const CAPITANEUS = new Mainslot({
  name: "Capitaneus",
  action: ACTION_CAPITANEUS,
  echoType: EchoType.SUMMON,
  stats: [[Stat.DmgBonus, 12, Attribute.Spectro], [Stat.DmgBonus, 12, Type1.Heavy]],
});

/** Nightmare: Mourning Aix, the Eternal Radiance set's only Overlord-class echo and so the only
 *  one that fills a four-cost slot. One 273.6% Spectro summon whose own damage doubles against a
 *  target carrying Spectro Frazzle, and a flat +12% Spectro DMG Bonus for the wearer.
 *
 *  `SPECTRO_FRAZZLE` only, not Heliacal Ember: Zani's kit extends the count to Embers for the
 *  sonata effect below and for nothing else, so in her team the summon lands on an already
 *  converted target and pays the plain figure. */
export const ACTION_NM_MOURNING_AIX = new Action("Echo - Nightmare: Mourning Aix", {
  cast: Cast.Echo, element: Attribute.Spectro, scaling: Scaling.Atk, type: Type1.Echo, mv: 273.6, energy: 3.8,
  applyStats: () => { if (stacksOfEnemy(SPECTRO_FRAZZLE) > 0) addStat(Stat.TotalDmg, 100); },
});
export const NM_MOURNING_AIX = new Mainslot({
  name: "Nightmare: Mourning Aix",
  action: ACTION_NM_MOURNING_AIX,
  echoType: EchoType.SUMMON,
  stats: [[Stat.DmgBonus, 12, Attribute.Spectro]],
});

/** Eternal Radiance, the Spectro Frazzle sonata. 2pc: +10% Spectro DMG Bonus flat. 5pc:
 *  inflicting Spectro Frazzle grants +20% Crit. Rate for 15s, and attacking a target holding ten
 *  stacks grants +15% Spectro DMG Bonus for 15s — both short self windows, lost after the outro.
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
export const ETERNAL_RADIANCE_2PC = new Sonata2pc({ name: "Eternal Radiance 2pc", stats: [[Stat.DmgBonus, 10, Attribute.Spectro]] });
export const ETERNAL_RADIANCE_CRIT = new Buff({
  name: "Eternal Radiance 5pc (frazzle)",
  stats: [[Stat.CritRate, 20]], until: LifeTime.Outro,
});
export const ETERNAL_RADIANCE_SPECTRO = new Buff({
  name: "Eternal Radiance 5pc (10 stacks)",
  stats: [[Stat.DmgBonus, 15, Attribute.Spectro]], until: LifeTime.Outro,
});
export const ETERNAL_RADIANCE_5PC = new Sonata({
  name: "Eternal Radiance 5pc",
  sonata2pc: ETERNAL_RADIANCE_2PC,
  grants: [
    { on: onApplied(SPECTRO_FRAZZLE, HELIACAL_EMBER), buff: ETERNAL_RADIANCE_CRIT },
    {
      on: () => currentAction().mv > 0
        && stacksOfEnemy(SPECTRO_FRAZZLE) + stacksOfEnemy(HELIACAL_EMBER) >= 10,
      buff: ETERNAL_RADIANCE_SPECTRO,
    },
  ],
});
