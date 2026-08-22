/**
 * Augusta, ported to the new engine — sequence-0 core loop, a limited 5-star (not
 * `standardCharacter`). An electro broadblade DPS. Two gauges gate her chained forms: Prowess
 * (forte1, 0-660, matching the migrated sheet's own internal scale rather than the kit text's
 * "100 points") lets a full-gauge Heavy Attack - Steelclash become the Thunderoar Backstep ->
 * Spinslash chain instead; Ascendancy (forte2, 0-4000, same reasoning) lets a full-gauge
 * Resonance Skill - Warrior's Blade become the Undying Sunlight Strike -> Leap -> Plunge chain
 * instead. Majesty (2 stacks) — from her own Plunge, or a teammate's Outro cast while under her
 * own Outro buff — unlocks a second Liberation: Sublime is the Sun, which itself is two more
 * hits (Sunborne x9, then Everbright Protector). No live Prowess/Ascendancy/Majesty gate is
 * enforced — same "fixed valid line, no live queue" shape as every other kit here — so the
 * rotation below places both liberations and both chains by hand.
 *
 * Numbers from nanoka.cc (character 1306, https://ww.nanoka.cc/character/1306) for every named
 * hit's MV, cross-checked against every multi-hit total the migrated (old-engine) sheet also
 * gives (all agree to the hundredth of a percent). Energy/concerto/offtune/Prowess/Ascendancy
 * deltas aren't cleanly exposed on the page itself, so those come off the migrated sheet
 * directly, same gap other kits (Sanhua, Brant) have. Mid-air Attack/Dodge Counter/Mid-air Dodge
 * Counter carry MV only (nanoka gives it) — no energy/concerto/offtune, and the rotation below
 * never uses them. The Prowess/Ascendancy-gated Dodge Counter variants are skipped entirely: both
 * deal exactly the same numbers as Heavy Attack - Steelclash / Heavy Attack - Thunderoar:
 * Backstep already do, just from a different button — a bare reskin, not new data.
 *
 * Liberation - Sword of Eternal Oath (Lib1) and Liberation - Sublime is the Sun's own two phases
 * (Lib2 Sunborne x9, Lib3 Everbright Protector) are mutually exclusive presses in real play, but
 * the rotation below places both by hand, same as every other kit's fixed valid line. Sublime is
 * the Sun's own opening press deals no damage of its own (nothing on the page gives it one), so
 * it isn't a separate action — Lib2 is placed directly, and its own update() queues Lib3 once the
 * ninth Sunborne hit lands ("Everbright Protector is automatically cast" when Sworn Allegiance
 * ends, per the kit text). The migrated sheet gives Lib3 energy -125 (Sword of Eternal Oath's own
 * declared cost), but the page is explicit that Sublime is the Sun costs no Resonance Energy at
 * all — trusted here, so Lib3 carries none. Lib3's own cross-kit special (ending Phrolova's own
 * Maestro instantly, same as her own EIntro would) is wired up in its own convert() below,
 * reaching into phrolova.ts's own MAESTRO directly — a no-op on any team that isn't running her.
 *
 * Glory's Favor (Inherent Skill): a shield on every damaging hit, 0.5s ICD — same treatment as
 * Iuno/Jingran's own shield passives, `shields: 1` on every action rather than tracking the ICD.
 * Ruler's Realm's own shield (any team member's own Intro, while it's up) is left unmodelled: it
 * needs handing a shield to *whichever* teammate happens to cast an Intro next, and this engine
 * has no way to inject a dynamic per-action `shields` value onto another kit's own action from a
 * buff — `shields` is only ever a plain declared field on the action itself (see kit.ts's own
 * Action def). Ruler's Realm is still granted/tracked (for display and Majesty/Crown of Wills'
 * own timing), just doesn't hand out the shield event itself.
 */
import {
  Buff, Resonator, Action, ECHO_CAST, INTRO, Stat, Element, WeaponType, Type1, Cast, Node, Scaling,
  applySelf, applyTeam, isHeld, revoke, revokeBuff, casting, currentAction, currentTeam, addStat,
  queue, queueOutro,
  lostOnSwap,
} from "../kit.js";
import { THUNDERFLARE_DOMINION } from "../weapons/broadblade.js";
import { FALSE_SOVEREIGN, COV_3PC } from "../echoes/septimont.js";
import { VOID_THUNDER_2PC } from "../echoes/jinzhou.js";
import { PHROLOVA, MAESTRO } from "./phrolova.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";

/* ------------------------------------------------------------------------------------ buffs */

/** Majesty: up to 2 stacks — Undying Sunlight: Plunge grants one outright (see FSkill3 below); a
 *  teammate's own Outro cast, while Augusta's own Outro buff (BATTLESONG) is up on them, grants
 *  the other, alongside a stack of Crown of Wills below (`AUGUSTA`'s own updateGlobal(), below —
 *  needs to react to *any* team member's own Outro, same "global reach through a self-held buff"
 *  shape Sigrika's Blessing of Runes uses). No live gate spends it — see file header. */
export const MAJESTY = new Buff({ name: "Augusta: Majesty", maxStacks: 2 });

/** Crown of Wills: +15% Electro DMG Bonus, one stack only — granted alongside Majesty's own
 *  second stack (see MAJESTY's own comment above and AUGUSTA's own updateGlobal() below), spent
 *  entirely when Everbright Protector ends Sworn Allegiance. */
export const CROWN_OF_WILLS = new Buff({
  name: "Augusta: Crown of Wills",
  apply: () => addStat(Stat.DmgBonus, 15, Element.Electro),
  convert: () => {
    const a = currentAction();
    if (a === Lib3) {
        // revoked after giving buff
      revoke(CROWN_OF_WILLS);
    }
  },
});

/** Ruler's Realm: opens alongside Sublime is the Sun (see Lib2 below), 30s — permanent uptime
 *  once granted, per the standing duration rule. The shield it hands any team member's own Intro
 *  cast is out of scope — see file header. */
export const RULERS_REALM = new Buff({ name: "Augusta: Ruler's Realm" });

/** Battlesong of the Unyielding: hands the incoming resonator +15% DMG Amplification (all
 *  attributes) for 14s. Short window, so it still counts on the recipient's own outro (see
 *  jinzhou.ts's HERON_HANDOFF). */
export const BATTLESONG = new Buff({
  name: "Augusta: Outro",
  update: () => { lostOnSwap(); },
  apply: () => addStat(Stat.Amp, 15),
});

/* ----------------------------------------------------------------------------------- actions */

function augustaAction(id: string, def: object): Action {
  return new Action(id, { element: Element.Electro, scaling: Scaling.Atk, shields: 1, ...def });
}

// energy/concerto/offtune/Prowess/Ascendancy all come off the migrated (old-engine) sheet —
// nanoka's own page never gave them (see file header).
// --- basics, mid-air, dodge counter (Hunter's Path)
export const BA1 = augustaAction("Basic - Hunter's Path 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 57.46, energy: 0.73, concerto: 1.45, offtune: 2300, forte1: 99, forte2: 74 });
export const BA2 = augustaAction("Basic - Hunter's Path 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 134, energy: 1.70, concerto: 3.38, offtune: 5400, forte1: 230, forte2: 172 });
export const BA3 = augustaAction("Basic - Hunter's Path 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 196.83, energy: 2.49, concerto: 4.95, offtune: 7900, forte1: 336, forte2: 252 });
export const BA4 = augustaAction("Basic - Hunter's Path 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 193.89, energy: 2.46, concerto: 4.89, offtune: 7800, forte1: 333, forte2: 249 });
export const MA = augustaAction("Basic - Hunter's Path (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 119.3 });
export const DC = augustaAction("Basic - Hunter's Path 2 (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 134 });
export const MDC = augustaAction("Basic - Hunter's Path (Mid-Air Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 119.3 });

// --- heavy attack: Steelclash, base cast; at full Prowess it's replaced by the Thunderoar
//     Backstep -> Spinslash chain instead (FHA1/FHA2), and Jump becomes Uppercut (FJump)
export const HA = augustaAction("Heavy - Hunter's Path", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 139.17, energy: 1.77, concerto: 3.51, offtune: 5700, forte1: 342, forte2: 255 });
export const FHA1 = augustaAction("Forte Heavy - Thunderoar: Backstep", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 53.68, energy: 0.50, concerto: 1, offtune: 1600, forte1: -660, forte2: 50 });
export const FHA2 = augustaAction("Forte Heavy - Thunderoar: Spinslash", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 425.16, energy: 4.47, concerto: 8.91, offtune: 14400, forte2: 744 });
export const FJump = augustaAction("Forte Heavy - Thunderoar: Uppercut", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 357.86, energy: 3.76, concerto: 7.50, offtune: 12000, forte1: -660, forte2: 382 });

// --- resonance skill: Warrior's Blade, base cast; at full Ascendancy it's replaced by the
//     Undying Sunlight Strike -> Leap -> Plunge chain instead (FSkill1/FSkill2/FSkill3)
export const Skill = augustaAction("Skill - Warrior's Blade", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 656.1, energy: 9, concerto: 10, offtune: 4500, forte1: 660, forte2: 400 });
export const FSkill1 = augustaAction("Forte Skill - Undying Sunlight: Strike", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, mv: 278.34, energy: 5, concerto: 7, offtune: 18200, forte2: -4000 });
export const FSkill2 = augustaAction("Forte Skill - Undying Sunlight: Leap", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, mv: 278.35, energy: 5, concerto: 7, offtune: 11200, shields: 2 });
/** Undying Sunlight: Plunge — consumes all Ascendancy, counts as Heavy Attack DMG, and grants a
 *  stack of Majesty. */
export const FSkill3 = augustaAction("Forte Skill - Undying Sunlight: Plunge", { node: Node.Forte, cast: Cast.Skill, type: Type1.Heavy, mv: 865.83, energy: 11, concerto: 7, offtune: 24000, shields: 2 });

// --- liberation: Sword of Eternal Oath, the plain press-and-release cast — costs Energy like any
//     other liberation (maxEnergy below) and restores 40% Ascendancy
export const Lib1 = augustaAction("Liberation - Sword of Eternal Oath", { node: Node.Liberation, cast: Cast.Liberation, type: Type1.Heavy, mv: 1099.48, shields: 2, concerto: 20, offtune: 29400, forte2: 1600 });
/** Sublime is the Sun - Sunborne, held instead of released once Majesty reaches 2 — costs 2
 *  Majesty rather than Energy (see file header). Nine hits lumped into one action, same treatment
 *  as Cantarella's Diffusion/Phrolova's Hecate cycle. Queues Everbright Protector itself once the
 *  ninth lands. */
export const Lib2 = augustaAction("Liberation - Sublime is the Sun", { node: Node.Liberation, cast: Cast.Liberation });

export const Lib2fua = augustaAction("Liberation - Sublime is the Sun: Sunborne x9", { node: Node.Liberation, cast: Cast.Liberation, type: Type1.Heavy, mv: 1073.61, concerto: 18, offtune: 64800 });
/** Sublime is the Sun - Everbright Protector, the finisher — ends Sworn Allegiance and spends
 *  every stack of Crown of Wills. Costs no Resonance Energy (see file header). */
export const Lib3 = augustaAction("Liberation - Sublime is the Sun: Everbright Protector", { node: Node.Liberation, cast: Cast.Liberation, type: Type1.Heavy, mv: 1192.93, concerto: 10, offtune: 49800 });

// --- intro / outro
export const Intro = augustaAction("Intro - Stride of Goldenflare", { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 198.82, energy: 10, concerto: 10, offtune: 4800, forte1: 660, forte2: 800 });
/** Battlesong of the Unyielding: no damage of its own, just the outro handoff (BATTLESONG) — her
 *  own Majesty/Crown of Wills grant is earned later, off the recipient's own Outro (see MAJESTY's
 *  own comment above), not off this cast itself. */
export const Outro = augustaAction("Outro - Battlesong of the Unyielding", { cast: Cast.Outro, active: false });

/** Her, as a Resonator: name/element/weapon, every grant/spend/queue rule her kit needs, and her
 *  own base stat line. Sequence-0 only — a limited 5-star, not `standardCharacter`. */
export const AUGUSTA = new Resonator({
  name: "Augusta",
  element: Element.Electro,
  weapon: WeaponType.Broadblade,
  intro: () => Intro,
  color: "#d7370f",
  maxEnergy: 12500,

  // reacts to *any* team member's own Outro cast, not just her own — see MAJESTY's own comment
  updateGlobal: () => {
    if (casting(Cast.Outro) && isHeld(BATTLESONG)) { applySelf(MAJESTY, 1); applySelf(CROWN_OF_WILLS, 1); }
  },

  update: () => {
    const a = currentAction();
    if (a === Lib2) { queue(Lib2fua); queue(Lib3); applyTeam(RULERS_REALM, 1); }
    if (a === FSkill3) applySelf(MAJESTY, 1);
    if (a === Outro) queueOutro(BATTLESONG);
    if (a === Lib3) {
      // Everbright Protector's own cross-kit special: ends Phrolova's own Maestro instantly, same
      // as her own EIntro would (see phrolova.ts's own MAESTRO). memberOf() throws on a resonator
      // that isn't on this team, so this only reaches for it when Phrolova's actually along.
      if (currentTeam().slots.some((s) => s.resonator === PHROLOVA)) revokeBuff(PHROLOVA, MAESTRO);
    }
  },

  apply: () => {
    addStat(Stat.BaseHp, 10300); addStat(Stat.BaseAtk, 463); addStat(Stat.BaseDef, 1112);
    addStat(Stat.Er, 100); addStat(Stat.CritRate, 5); addStat(Stat.CritDmg, 150);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
export const AUGUSTA_TALENTS = new Buff({
  name: "Augusta: Talents",
  apply: () => { addStat(Stat.CritRate, 8); addStat(Stat.BonusAtk, 12); },
});

/** The migrated rotation: the Steelclash->Thunderoar chain twice (Intro tops Prowess, Warrior's
 *  Blade also does per the sheet), Sword of Eternal Oath, the Undying Sunlight chain (Plunge
 *  grants the Majesty stack Sublime is the Sun then spends). She's never the team's own lead, so
 *  unlike a first-position member's own opener, this same rotation covers both. */
export const AG_ROTATION = [
  INTRO, FHA1, FHA2, Skill, FHA1, FHA2, ECHO_CAST, Lib1,
  FSkill1, FSkill2, FSkill3, Lib2,
  Outro,
];

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents, weapon, mainslot echo, sonata pieces, mainstat/substat
export const AG_LOADOUT = [
  AUGUSTA, AUGUSTA_TALENTS,
  THUNDERFLARE_DOMINION,
  FALSE_SOVEREIGN, COV_3PC, VOID_THUNDER_2PC,
  mainstats("CR", "electro electro", "atk atk"), chem("atk", "heavy"),
];
