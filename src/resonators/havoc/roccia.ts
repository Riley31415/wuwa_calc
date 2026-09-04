/**
 * Roccia, ported to the new engine — sequence-0 core loop, a limited 5-star
 * (`Tier.Limited`). A havoc gauntlets support/sub-DPS. Imagination (forte1, max 300) builds
 * off normal attack hits; at 100+ a held Heavy Attack — or Resonance Skill: Acrobatic Trick,
 * unconditionally — launches her into Beyond Imagination, unlocking Basic Attack: Real Fantasy
 * (a 3-stage Heavy Attack DMG combo, spending the 100 Imagination on its own first hit).
 * Liberation: Commedia Improvviso! scales the whole team's ATK off her own Crit Rate past 50%.
 *
 * Super Attractive Magic Box (Inherent Skill): her Outro swaps the incoming resonator's own Echo
 * Skill for a flat, DMG-bonus-immune "Magic Box" hit for 14s. Full move-replacement needs
 * per-resonator state this engine doesn't have, so it's simplified to one queued cast on the
 * recipient's own next Intro instead, through ROCCIA_RESONATOR's own updateGlobal() below.
 *
 * Numbers from nanoka.cc (character 1606) for MV. Energy/concerto/offtune/Imagination deltas
 * aren't exposed on nanoka's own page, so those come off the migrated (old-engine) sheet. Dodge
 * Counter has no sheet row at all, so it's still bare (nanoka's own MV only).
 */
import { Stat, Attribute, WeaponType, Type1, Cast, Node, Scaling } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout } from "../../engine/gear.js";
import {
  applyCurrent,
  applyTeam,
  revokeCurrent,
  casting,
  currentAction,
  currentTeam,
  addStat,
  frozenStacks,
  getStat,
  queueOutro,
  queueOn,
} from "../../engine/context.js";
import { lostOnSwap, matrix } from "../../shared/helpers.js";
import { ActionGroup, Action, Rotation, INTRO, ECHO_CANCEL, OUTRO, SWAP, DODGE, NOINTRO, ECHO_SWAP, START_3 } from "../../engine/rotation.js";
import { TRAGICOMEDY } from "../../weapons/gauntlet.js";
import { NEW_STD_GAUNTLET, ABYSS_SURGES } from "../../weapons/standard.js";
import { NM_HERON, MIDNIGHT_VEIL_5PC } from "../../echoes/rinascita.js";
import { MOONLIT_CLOUDS_5PC, HERON, BELL_BORNE_GEOCHELONE } from "../../echoes/jinzhou.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { chem } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function rocciaAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Havoc, scaling: Scaling.Atk, ...def });
}

// --- basics, mid-air, dodge counter (Pero, Easy)
const BA1 = rocciaAction("Basic - Pero, Easy 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 73.18, energy: 1.09, concerto: 3.47, offtune: 3464, forte1: 19 });
const BA2 = rocciaAction("Basic - Pero, Easy 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 114.42, energy: 1.71, concerto: 5.43, offtune: 5418, forte1: 33 });
const BA3 = rocciaAction("Basic - Pero, Easy 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 169.00, energy: 2.50, concerto: 8, offtune: 8000, forte1: 49 });
const BA4 = rocciaAction("Basic - Pero, Easy 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 208.38, energy: 3.10, concerto: 9.88, offtune: 9864, forte1: 100 });
const MA = rocciaAction("Basic - Pero, Easy (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 104.78, energy: 1.55, concerto: 4.96, offtune: 4960, forte1: 38 });
const DC = rocciaAction("Basic - Pero, Easy (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 206.70, offtune: 4986, concerto: 15.01, energy: 1.56 });

// hitting with 100+ Imagination also launches Beyond Imagination — a second way in besides Skill
const HA = rocciaAction("Heavy - Pero, Easy", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 168.99, energy: 2.50, concerto: 8, offtune: 8000, forte1: 100 });

// pulls in targets and always launches Beyond Imagination
const Skill = rocciaAction("Skill - Acrobatic Trick", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 491.76, energy: 14, concerto: 20, offtune: 10992, forte1: 100 });

// Real Fantasy: 100 Imagination is spent once, on the first hit, not a per-stage cost
const FBA1 = rocciaAction("Forte Basic - Real Fantasy 1", { node: Node.Forte, cast: Cast.Basic, type: Type1.Heavy, mv: 322.08, energy: 8, concerto: 10, offtune: 7200, forte1: -100 });
const FBA2 = rocciaAction("Forte Basic - Real Fantasy 2", { node: Node.Forte, cast: Cast.Basic, type: Type1.Heavy, mv: 339.97, energy: 8, concerto: 16, offtune: 7600, forte1: -100 });
const FBA3 = rocciaAction("Forte Basic - Real Fantasy 3", { node: Node.Forte, cast: Cast.Basic, type: Type1.Heavy, mv: 357.86, energy: 8, concerto: 25, offtune: 8000, forte1: -100 });

// Resonance Cost 125 (maxEnergy below) is nanoka's own declared cost, not the migrated sheet's 0
const Liberation = rocciaAction("Liberation - Commedia Improvviso!", {
  node: Node.Liberation, cast: Cast.Liberation, type: Type1.Heavy, mv: 835.02, concerto: 20, offtune: 96000, resetEnergy: true,
  updateBuffs: () => applyTeam(COMMEDIA_TEAM_ATK),
});

const Intro = rocciaAction("Intro - Pero, Help", { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 168.99, energy: 10, concerto: 10, offtune: 10824, forte1: 100 });
const Outro = rocciaAction("Outro - Applause, Please!", {
  cast: Cast.Outro, concerto: -100, active: false,
  updateBuffs: () => queueOutro(APPLAUSE_HANDOFF),
});

/** 100 flat Havoc DMG, Utility damage type, DMG-bonus-immune (Scaling.Fixed reads no stat/buff).
 *  Queued once by ROCCIA_RESONATOR's own kit on the recipient's own next Intro — see updateGlobal() below. */
const MAGIC_BOX = rocciaAction("Utility - Super Attractive Magic Box", {
  cast: Cast.Echo, type: Type1.Utility, scaling: Scaling.Fixed, mv: 100,
});

/* ------------------------------------------------------------------------------------ buffs */

/** Immersive Performance (Inherent Skill): +20% ATK for 12s on Resonance Skill or the base Heavy
 *  Attack specifically — not Real Fantasy, a Basic Attack-button press despite Heavy Attack DMG. */
const IMMERSIVE_PERFORMANCE = new Buff({
  name: "Inherent: Immersive Performance",
  applyStats: () => addStat(Stat.BonusAtk, 20),
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(IMMERSIVE_PERFORMANCE); },
});
const RC_INHERENT_1 = new Inherent({
  name: "Inherent: Immersive Performance",
  updateBuffs: () => { if (casting(Cast.Skill) || casting(Cast.Heavy)) applyCurrent(IMMERSIVE_PERFORMANCE, 1); },
});

/** 1 flat ATK per 0.1% Crit Rate held over 50%, capped at 200 — read live at the Liberation cast,
 *  replacing rather than stacking. 30s, so permanent uptime once granted. */
const COMMEDIA_TEAM_ATK = new Buff({
  name: "Roccia: Commedia Improvviso!",
  applyStats: () => addStat(Stat.FlatAtk, 200),
});

/** The window her outro hands the incoming resonator — just the stat grant, the Magic Box
 *  follow-up is queued separately (see RC_INHERENT_2 below). */
const APPLAUSE_HANDOFF = new Buff({
  name: "Roccia: Outro",
  applyStats: () => { addStat(Stat.Amp, 20, Attribute.Havoc); addStat(Stat.Amp, 25, Type1.Basic); },
  updateBuffs: () => { lostOnSwap(); },
});

/** Runs through updateGlobal() so it fires on the recipient's own turn, not Roccia's — `currentSlot`
 *  is forced to her own holder, so the real actor comes off currentTeam().slot, and queueOn() (not
 *  queue()) lands the follow-up on them. */
const RC_INHERENT_2 = new Inherent({
  name: "Inherent: Super Attractive Magic Box",
  updateGlobal: () => {
    const acting = currentTeam().slot;
    if (casting(Cast.Intro) && acting.isHeld(APPLAUSE_HANDOFF)) queueOn(acting.resonator!, MAGIC_BOX);
  },
});

const ROCCIA_RESONATOR = new Resonator({
  name: "Roccia",
  element: Attribute.Havoc,
  weapon: WeaponType.Gauntlets,
  intro: () => Intro,
  outro: () => Outro,
  color: "#9634b2",
  maxEnergy: 125,

  constantStats: () => {
    addStat(Stat.BaseHp, 12250); addStat(Stat.BaseAtk, 375); addStat(Stat.BaseDef, 1198);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
const ROCCIA_TALENTS = new Talent({
  name: "Roccia: Talents",
  constantStats: () => { addStat(Stat.BonusAtk, 12); addStat(Stat.CritDmg, 16); },
});

const FBA123 = new ActionGroup("Forte Basic - Real Fantasy 123", [FBA1, FBA2, FBA3]);

const RC_ROTATION = new Rotation([
  START_3, Liberation, SWAP,
  INTRO, BA4, 
  Liberation, 
  Skill, FBA123,
  ECHO_SWAP, 
  OUTRO,
]);

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills, viable weapons, and two real
// echo choices — Midnight Veil or Moonlit Clouds (same mainslot either way) — both automatically
// iterated (see gear.ts's own EchoLoadout)
/** Matrix: her Liberation grants the team +20% Havoc DMG Bonus for 30s — permanent. */
const ROCCIA_MATRIX_TEAM = new Buff({
  name: "Roccia: Matrix (team)",
  applyStats: () => addStat(Stat.DmgBonus, 20, Attribute.Havoc),
});
const ROCCIA_MATRIX = matrix("Roccia", 20, {
  updateBuffs: () => { if (casting(Cast.Liberation)) applyTeam(ROCCIA_MATRIX_TEAM); },
});

export const ROCCIA = new Loadout({
  resonator: ROCCIA_RESONATOR,
  matrix: ROCCIA_MATRIX,
  talent: ROCCIA_TALENTS,
  inherent1: RC_INHERENT_1,
  inherent2: RC_INHERENT_2,
  weapons: [TRAGICOMEDY, NEW_STD_GAUNTLET, ABYSS_SURGES],
  echoLoadouts: [
    new EchoLoadout(NM_HERON, MIDNIGHT_VEIL_5PC),
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
    new EchoLoadout(BELL_BORNE_GEOCHELONE, MOONLIT_CLOUDS_5PC),
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Havoc3, Mainstat.ATK1),
  substat: chem("atk", "heavy"),
    rotation: RC_ROTATION,
});
