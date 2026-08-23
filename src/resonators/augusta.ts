/**
 * Augusta, ported to the new engine — sequence-0 core loop, a limited 5-star (not
 * `standardCharacter`). An electro broadblade DPS. Two gauges gate her chained forms: Prowess
 * (forte1, 0-660) lets a full-gauge Heavy Attack - Steelclash become the Thunderoar Backstep ->
 * Spinslash chain instead; Ascendancy (forte2, 0-4000) lets a full-gauge Resonance Skill -
 * Warrior's Blade become the Undying Sunlight Strike -> Leap -> Plunge chain instead. Majesty (2
 * stacks) — from her own Plunge, or a teammate's Outro cast while under her own Outro buff —
 * unlocks a second Liberation: Sublime is the Sun (Sunborne x9, then Everbright Protector). No
 * live Prowess/Ascendancy/Majesty gate is enforced — the rotation below places both liberations
 * and both chains by hand, same "fixed valid line" shape as every other kit here.
 *
 * Numbers from nanoka.cc (character 1306) for every named hit's MV, cross-checked against the
 * migrated (old-engine) sheet's own multi-hit totals. Energy/concerto/offtune/Prowess/Ascendancy
 * deltas aren't exposed on the page itself, so those come off the migrated sheet directly.
 *
 * Sublime is the Sun's own opening press deals no damage of its own, so Lib2 is placed directly
 * and its own update() queues Lib3 once the ninth Sunborne hit lands. The migrated sheet gives
 * Lib3 energy -125, but the page is explicit it costs no Resonance Energy at all — trusted here.
 * Lib3's own cross-kit special (ending Phrolova's own Maestro instantly) reaches into
 * phrolova.ts's own MAESTRO directly — a no-op on any team that isn't running her.
 *
 * Glory's Favor (Inherent Skill): a shield on every damaging hit, 0.5s ICD — `shields: 1` on
 * every action rather than tracking the ICD. Ruler's Realm's own shield (any team member's next
 * Intro, while it's up) is left unmodelled — this engine has no way to inject a dynamic per-action
 * `shields` value onto another kit's own action.
 */
import {
  Buff, Talent, Inherent, Resonator, Loadout, Action, ECHO_CAST, INTRO, Stat, Attribute, WeaponType, Type1, Cast, Node, Scaling,
  applySelf, applyTeam, revoke, revokeBuff, casting, currentAction, currentTeam, addStat,
  queue, queueOutro,
  lostOnSwap,
} from "../kit.js";
import { THUNDERFLARE_DOMINION } from "../weapons/broadblade.js";
import { FALSE_SOVEREIGN, COV_3PC } from "../echoes/septimont.js";
import { VOID_THUNDER_2PC } from "../echoes/jinzhou.js";
import { PHROLOVA, MAESTRO } from "./phrolova.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function augustaAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Electro, scaling: Scaling.Atk, shields: 1, ...def });
}

// --- basics, mid-air, dodge counter (Hunter's Path)
export const BA1 = augustaAction("Basic - Hunter's Path 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 57.46, energy: 0.73, concerto: 1.45, offtune: 2300, forte1: 99, forte2: 74 });
export const BA2 = augustaAction("Basic - Hunter's Path 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 134, energy: 1.70, concerto: 3.38, offtune: 5400, forte1: 230, forte2: 172 });
export const BA3 = augustaAction("Basic - Hunter's Path 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 196.83, energy: 2.49, concerto: 4.95, offtune: 7900, forte1: 336, forte2: 252 });
export const BA4 = augustaAction("Basic - Hunter's Path 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 193.89, energy: 2.46, concerto: 4.89, offtune: 7800, forte1: 333, forte2: 249 });
export const MA = augustaAction("Basic - Hunter's Path (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 119.3 });
export const DC = augustaAction("Basic - Hunter's Path 2 (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 134 });
export const MDC = augustaAction("Basic - Hunter's Path (Mid-Air Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 119.3 });

// heavy attack: Steelclash, base cast; at full Prowess it's replaced by Backstep -> Spinslash
export const HA = augustaAction("Heavy - Hunter's Path", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 139.17, energy: 1.77, concerto: 3.51, offtune: 5700, forte1: 342, forte2: 255 });
export const FHA1 = augustaAction("Forte Heavy - Thunderoar: Backstep", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 53.68, energy: 0.50, concerto: 1, offtune: 1600, forte1: -660, forte2: 50 });
export const FHA2 = augustaAction("Forte Heavy - Thunderoar: Spinslash", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 425.16, energy: 4.47, concerto: 8.91, offtune: 14400, forte2: 744 });
export const FJump = augustaAction("Forte Heavy - Thunderoar: Uppercut", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 357.86, energy: 3.76, concerto: 7.50, offtune: 12000, forte1: -660, forte2: 382 });

// resonance skill: Warrior's Blade, base cast; at full Ascendancy it's replaced by the Undying
// Sunlight Strike -> Leap -> Plunge chain instead
export const Skill = augustaAction("Skill - Warrior's Blade", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 656.1, energy: 9, concerto: 10, offtune: 4500, forte1: 660, forte2: 400 });
export const FSkill1 = augustaAction("Forte Skill - Undying Sunlight: Strike", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, mv: 278.34, energy: 5, concerto: 7, offtune: 18200, forte2: -4000 });
export const FSkill2 = augustaAction("Forte Skill - Undying Sunlight: Leap", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, mv: 278.35, energy: 5, concerto: 7, offtune: 11200, shields: 2 });
/** Consumes all Ascendancy, counts as Heavy Attack DMG, grants a stack of Majesty. */
export const FSkill3 = augustaAction("Forte Skill - Undying Sunlight: Plunge", { node: Node.Forte, cast: Cast.Skill, type: Type1.Heavy, mv: 865.83, energy: 11, concerto: 7, offtune: 24000, shields: 2 });

// liberation: Sword of Eternal Oath, the plain press-and-release cast
export const Lib1 = augustaAction("Liberation - Sword of Eternal Oath", { node: Node.Liberation, cast: Cast.Liberation, type: Type1.Heavy, mv: 1099.48, shields: 2, concerto: 20, offtune: 29400, forte2: 1600 });
/** Held instead of released once Majesty reaches 2 — costs both stacks of Majesty rather than
 *  Energy, spent via AUGUSTA's own update() below. Nine hits lumped into one action; queues
 *  Everbright Protector itself once the ninth lands. */
export const Lib2 = augustaAction("Liberation - Sublime is the Sun", { node: Node.Liberation, cast: Cast.Liberation });

export const Lib2fua = augustaAction("Liberation - Sublime is the Sun: Sunborne x9", { node: Node.Liberation, cast: Cast.Liberation, type: Type1.Heavy, mv: 1073.61, concerto: 18, offtune: 64800 });
/** The finisher — ends Sworn Allegiance and spends every stack of Crown of Wills. Costs no
 *  Resonance Energy. */
export const Lib3 = augustaAction("Liberation - Sublime is the Sun: Everbright Protector", { node: Node.Liberation, cast: Cast.Liberation, type: Type1.Heavy, mv: 1192.93, concerto: 10, offtune: 49800 });

export const Intro = augustaAction("Intro - Stride of Goldenflare", { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 198.82, energy: 10, concerto: 10, offtune: 4800, forte1: 660, forte2: 800 });
/** No damage of its own, just the outro handoff (BATTLESONG) — her own Majesty/Crown of Wills
 *  grant is earned later, off the recipient's own Outro. */
export const Outro = augustaAction("Outro - Battlesong of the Unyielding", { cast: Cast.Outro, active: false });

/* ------------------------------------------------------------------------------------ buffs */

/** Up to 2 stacks — Undying Sunlight: Plunge grants one outright; a teammate's own Outro cast,
 *  while Augusta's own Outro buff is up on them, grants the other. No live gate spends it. */
export const MAJESTY = new Buff({ name: "Augusta: Majesty", maxStacks: 2 });

/** +15% Electro DMG Bonus, one stack only — granted alongside Majesty's own second stack, spent
 *  entirely when Everbright Protector ends Sworn Allegiance. */
export const CROWN_OF_WILLS = new Buff({
  name: "Augusta: Crown of Wills",
  apply: () => addStat(Stat.DmgBonus, 15, Attribute.Electro),
  convert: () => {
    const a = currentAction();
    if (a === Lib3) {
      revoke(CROWN_OF_WILLS);
    }
  },
});

/** Opens alongside Sublime is the Sun, 30s — permanent uptime once granted. */
export const RULERS_REALM = new Buff({ name: "Augusta: Ruler's Realm" });

/** Hands the incoming resonator +15% DMG Amplification (all attributes) for 14s. */
export const BATTLESONG = new Buff({
  name: "Augusta: Outro",
  update: () => { lostOnSwap(); },
  apply: () => addStat(Stat.Amp, 15),
});

/** A shield on every damaging hit — baked as `shields: 1` on every action itself, not a stat this
 *  piece can add. */
export const AG_INHERENT_1 = new Inherent({ name: "Augusta: Glory's Favor" });

/** No combat-formula effect this engine models either, same "still equipped, no stat" treatment. */
export const AG_INHERENT_2 = new Inherent({
  name: "Augusta: Blazing Valor",
  combatStart: () => {
    applySelf(MAJESTY, 1);
    applySelf(CROWN_OF_WILLS, 1);
  },
});

export const AUGUSTA = new Resonator({
  name: "Augusta",
  element: Attribute.Electro,
  weapon: WeaponType.Broadblade,
  intro: () => Intro,
  color: "#d7370f",
  maxEnergy: 125,

  // reacts to *any* team member's own Outro, not just her own — currentSlot is forced to her own
  // holder for this call, so the real actor's own held gear comes off currentTeam().slot instead
  updateGlobal: () => {
    if (casting(Cast.Outro) && currentTeam().slot.isHeld(BATTLESONG)) {
      applySelf(MAJESTY, 1);
      applySelf(CROWN_OF_WILLS, 1);
    }
  },

  update: () => {
    const a = currentAction();
    if (a === Lib2) { queue(Lib2fua); queue(Lib3); applyTeam(RULERS_REALM, 1); revoke(MAJESTY); }
    if (a === Outro) queueOutro(BATTLESONG);
    if (a === FSkill3) applySelf(MAJESTY, 1);
    if (a === Lib3) {
      // memberOf() throws on a resonator not on this team, so only reach for it if Phrolova's along
      if (currentTeam().slots.some((s) => s.resonator === PHROLOVA)) revokeBuff(PHROLOVA, MAESTRO);
    }
  },

  apply: () => {
    addStat(Stat.BaseHp, 10300); addStat(Stat.BaseAtk, 463); addStat(Stat.BaseDef, 1112);
    addStat(Stat.Er, 100); addStat(Stat.CritRate, 5); addStat(Stat.CritDmg, 150);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
export const AUGUSTA_TALENTS = new Talent({
  name: "Augusta: Talents",
  apply: () => { addStat(Stat.CritRate, 8); addStat(Stat.BonusAtk, 12); },
});

// the migrated rotation: the Steelclash->Thunderoar chain twice, Sword of Eternal Oath, the
// Undying Sunlight chain. She's never the team's own lead, so this covers both opener and loop.
export const AG_ROTATION = [
  INTRO, FHA1, FHA2, Skill, FHA1, FHA2, ECHO_CAST, Lib1,
  FSkill1, FSkill2, FSkill3, Lib2,
  Outro,
];

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills, weapon, mainslot echo,
// sonata pieces, mainstat/substat
export const AG_LOADOUT = new Loadout(
  AUGUSTA, AUGUSTA_TALENTS, AG_INHERENT_1, AG_INHERENT_2,
  THUNDERFLARE_DOMINION,
  FALSE_SOVEREIGN, COV_3PC, VOID_THUNDER_2PC,
  mainstats("CR", "electro electro", "atk atk"), chem("atk", "heavy"),
);
