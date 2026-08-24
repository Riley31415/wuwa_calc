/**
 * Brant, ported to the new engine — sequence-0 core loop, a limited 5-star (not
 * `standardCharacter`). A fusion sword support/sub-DPS. Bravo (forte1, max 100) builds off Basic
 * Attack/Resonance Skill/Intro hits; at 100, Resonance Skill is replaced by Returned from Ashes
 * (spends it all). Liberation opens Aflame (12s): doubles Bravo gain on mid-air combo hits and
 * Resonance Skill specifically (not Intro), and swaps his ATK-from-Energy-Regen conversion
 * (Theatrical Moment -> "My" Moment, a bigger per-point rate).
 *
 * Numbers from nanoka.cc (character 1206) for MV; energy/concerto come off the old-engine
 * reference file's own numbers (÷100 relative to this file's own scale). No offtune in either
 * source, left off entirely rather than guessed at.
 *
 * Interlude Applause (Intro makes the next Mid-air Attack start at stage 2) isn't modelled — the
 * rotation below goes straight from Intro into Liberation. Healing is out of scope, per the
 * standing rule; Returned from Ashes' own shield isn't modelled for HP value, only `shields: 1`.
 */
import {
  Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Action, INTRO, Stat, Attribute, WeaponType, Type1, Cast, Node, Scaling,
  applySelf, revoke, casting, currentAction, addStat, get, isHeld, queueOutro,
  forte1, setForte1,
  lostOnSwap,
} from "../kit.js";
import { UNFLICKERING_VALOR } from "../weapons/sword.js";
import { EMERALD_OF_GENESIS, NEW_STD_SWORD, BLOODPACTS_PLEDGE } from "../weapons/standard.js";
import { DRAGON_OF_DIRGE, TIDEBREAKING_5PC, TIDEBREAKING_2PC } from "../echoes/rinascita.js";
import { mainstatOptions } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function brantAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Fusion, scaling: Scaling.Atk, ...def });
}

// energy/concerto come off the old reference file's own numbers (÷100 — see file header); no
// offtune anywhere in it either, so every action below is bare on that front.
// --- intro / outro
export const Intro = brantAction("Intro - Applaud for Me!", { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 253.49, offtune: 12000, concerto: 10, forte1: 2500, heals: true });
export const Outro = brantAction("Outro - The Course is Set!", { cast: Cast.Outro, active: false });

// --- resonance skill: Anchors Aweigh!, and liberation: To the Horizon (opens Aflame)
export const Skill = brantAction("Skill - Anchors Aweigh!", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 333.92, offtune: 10160, energy: 7.18, concerto: 10, forte1: 793 });
export const Liberation = brantAction("Liberation - To the Horizon", { node: Node.Liberation, cast: Cast.Liberation, type: Type1.Liberation, mv: 680.45, offtune: 48000, concerto: 20, resetEnergy: true });

/** At 100 Bravo — considered Basic Attack DMG, spends the whole gauge, and ends Aflame (if up)
 *  once it resolves — see AFLAME's own convert() below. */
export const FSkill = brantAction("Forte - Returned from Ashes", { node: Node.Forte, cast: Cast.Skill, type: Type1.Basic, mv: 1888.71, offtune: 63200, energy: 30, concerto: 50, forte1: -10000, shields: 1 });

// --- mid-air combo stages (Captain's Rhapsody). forte1 is the base (un-doubled) Bravo gain —
//     AFLAME doubles it live while held.
export const MA1 = brantAction("Basic - Captain's Rhapsody 1 (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 215.81, offtune: 10216, energy: 3.2, concerto: 6.39, forte1: 976 });
export const MA1H = brantAction("Basic - Captain's Rhapsody 1 (Mid-Air, Hold)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 548.29, offtune: 25952, energy: 8.16, concerto: 16.24, forte1: 2195 });
export const MA2 = brantAction("Basic - Captain's Rhapsody 2 (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 262.79, offtune: 12440, energy: 3.9, concerto: 7.79, forte1: 1220 });
export const MA2H = brantAction("Basic - Captain's Rhapsody 2 (Mid-Air, Hold)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 460.01, energy: 6.84, concerto: 13.67, offtune: 21776, forte1: 2439 });
export const MA3 = brantAction("Basic - Captain's Rhapsody 3 (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 261.97, offtune: 12398, energy: 3.9, concerto: 7.79, forte1: 1341 });
export const MA4 = brantAction("Basic - Captain's Rhapsody 4 (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 253.85, offtune: 12017, energy: 3.78, concerto: 7.55, forte1: 976 });

/* ------------------------------------------------------------------------------------ buffs */

/** 12s, opened by Liberation — lost after the outro action gains stats, or the instant Returned
 *  from Ashes is cast while it's up (checked in convert() so that same action still gets the
 *  doubling first). Doubles Bravo gain on mid-air combo/Resonance Skill hits (not Intro) by
 *  re-adding the same forte1 amount through AddForte1. */
export const AFLAME = new Buff({
  name: "Brant: Aflame",
  apply: () => {
    const a = currentAction();
    if (a.node === Node.Normal || a.node === Node.Skill) addStat(Stat.AddForte1, a.forte1);
  },
  convert: () => { if (casting(Cast.Outro) || currentAction() === FSkill) revoke(AFLAME); },
});

/** +12 ATK per 1% Energy Regen over 150%, capped at +1560 (280% ER) — doubled to +20 a point,
 *  capped at +2600, while Aflame is up. Read in convert() so every ER source has landed. */
export const THEATRICAL_MOMENT = new Buff({
  name: "Brant: Theatrical Moment",
  display: () => (isHeld(AFLAME) ? "Brant: \"My\" Moment" : "Brant: Theatrical Moment"),
  convert: () => {
    const aflame = isHeld(AFLAME);
    const perPoint = aflame ? 20 : 12;
    const cap = aflame ? 2600 : 1560;
    const over = Math.max(0, get(Stat.Er) - 150);
    addStat(Stat.FlatAtk, Math.min(cap, perPoint * over));
  },
});

/** The outro handoff. */
export const BRANT_OUTRO = new Buff({
  name: "Brant: Outro",
  apply: () => { addStat(Stat.Amp, 20, Attribute.Fusion); addStat(Stat.Amp, 25, Type1.Skill); },
    update: () => { lostOnSwap(); },
});

/** Trial by Fire and Tide (Inherent Skill) — genuinely unconditional, always equipped. */
export const BR_TRIAL_INHERENT = new Inherent({
  name: "Brant: Trial by Fire and Tide",
  apply: () => addStat(Stat.DmgBonus, 15, Attribute.Fusion),
});

/** Voyager's Blaze (Inherent Skill) — genuinely unconditional, always equipped. */
export const BR_VOYAGE_INHERENT = new Inherent({
  name: "Brant: Voyager's Blaze",
  apply: () => addStat(Stat.HealingBonus, 20),
});

export const BRANT = new Resonator({
  name: "Brant",
  abbreviation: "Brant",
  element: Attribute.Fusion,
  weapon: WeaponType.Sword,
  intro: () => Intro,
  color: "#d1257f",
  maxEnergy: 175,

  combatStart: () => applySelf(THEATRICAL_MOMENT, 1),

  // Forte Circuit (Bravo): pre-clamp an overshoot back to exactly 10000 so Returned from Ashes'
  // own declared forte1: -10000 lands exactly on 0; under 10000, leave it alone (matches
  // Galbrena's own Purging Flame).
  update: () => {
    const a = currentAction();
    if (a === Liberation) applySelf(AFLAME, 1);
    if (a === Outro) queueOutro(BRANT_OUTRO);
    if (a === FSkill && forte1() >= 10000) setForte1(10000);
  },

  apply: () => {
    addStat(Stat.BaseHp, 11675); addStat(Stat.BaseAtk, 375); addStat(Stat.BaseDef, 1308);
    addStat(Stat.Er, 100); addStat(Stat.CritRate, 5); addStat(Stat.CritDmg, 150);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from his kit
export const BRANT_TALENTS = new Talent({
  name: "Brant: Talents",
  apply: () => { addStat(Stat.CritRate, 8); addStat(Stat.BonusAtk, 12); },
});

// he's never the team's own lead, so this same rotation covers both opener and loop
export const BR_ROTATION = [
  INTRO, Liberation, MA1H, MA2H, MA3, MA4, FSkill, Outro,
];

/* ----------------------------------------------------------------------------------- loadout */

// his real 43311 build: resonator + talents + both Inherent Skills, weapon, mainslot echo,
// sonata pieces, mainstat/substat
export const BRANT_LOADOUT = new Loadout(
  BRANT,
  false,
  BRANT_TALENTS,
  BR_TRIAL_INHERENT,
  BR_VOYAGE_INHERENT,
  [UNFLICKERING_VALOR, EMERALD_OF_GENESIS, NEW_STD_SWORD, BLOODPACTS_PLEDGE],
  [new EchoLoadout(DRAGON_OF_DIRGE, TIDEBREAKING_5PC, TIDEBREAKING_2PC)],
  mainstatOptions(["CR", "CD"], ["ER", "fusion"], ["atk"]),
  chem("atk", "basic"),
  BR_ROTATION, BR_ROTATION,
);
