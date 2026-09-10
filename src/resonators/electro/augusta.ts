/**
 * Augusta, ported to the new engine — Sequences 1-6 in their own block below, a limited 5-star
 * (`Tier.Limited`). An electro broadblade DPS. Three forte gauges gate her chained forms: Prowess
 * (forte1, 0-660) lets a full-gauge Heavy Attack - Steelclash become the Thunderoar Backstep ->
 * Spinslash chain instead; Ascendancy (forte2, 0-4000) lets a full-gauge Resonance Skill -
 * Warrior's Blade become the Undying Sunlight Strike -> Leap -> Plunge chain instead; Majesty
 * (forte3, 0-2) — from her own Plunge, or a teammate's Outro cast while under her own Outro buff —
 * unlocks a second Liberation: Sublime is the Sun (Sunborne x9, then Everbright Protector), which
 * spends both stacks. No live Prowess/Ascendancy/Majesty gate is enforced — the rotation below
 * places both liberations and both chains by hand, same "fixed valid line" shape as every other
 * kit here.
 *
 * Numbers from nanoka.cc (character 1306) for every named hit's MV, cross-checked against the
 * migrated (old-engine) sheet's own multi-hit totals. Energy/concerto/offtune/Prowess/Ascendancy
 * deltas aren't exposed on the page itself, so those come off the migrated sheet directly.
 *
 * Sublime is the Sun's own opening press deals no damage of its own, so Lib2 is placed directly
 * and its own updateBuffs() queues Lib3 once the ninth Sunborne hit lands. The migrated sheet gives
 * Lib3 energy -125, but the page is explicit it costs no Resonance Energy at all — trusted here.
 * Lib3's own cross-kit special (ending Phrolova's own Maestro instantly) reaches into
 * phrolova.ts's own MAESTRO directly — a no-op on any team that isn't running her.
 *
 * Glory's Favor (Inherent Skill): a shield on every damaging hit, 0.5s ICD — the shield marker
 * off every action rather than tracking the ICD. Ruler's Realm's own shield (any team member's
 * Intro while it's up) rides the realm buff itself, see RULERS_REALM.
 */
import { Stat, Attribute, WeaponType, Type1, Cast, Node, Scaling } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Sequence } from "../../engine/gear.js";
import {
  asSource,
  applyCurrent,
  applyTeam,
  revokeCurrent,
  revokeBuff,
  casting,
  currentAction,
  runningAction,
  currentTeam,
  addStat,
  queue,
  queueOutro,
  forte2,
  setForte2,
  addForte3,
  frozenStacks,
  getStat,
  isHeld,
  stacksOf,
} from "../../engine/context.js";
import { Action, Rotation, INTRO, ECHO_CANCEL, OUTRO, ECHO_SWAP } from "../../engine/rotation.js";
import { applied } from "../../engine/context.js";
import { lostOnSwap } from "../../shared/helpers.js";
import { SHIELD } from "../../shared/status.js";
import { THUNDERFLARE_DOMINION, VERDANT_SUMMIT } from "../../weapons/broadblade.js";
import { NEW_STD_BRAUDBLADE, LUSTROUS_RAZOR } from "../../weapons/standard.js";
import { FALSE_SOVEREIGN, COV_3PC } from "../../echoes/septimont.js";
import { VOID_THUNDER_2PC } from "../../echoes/jinzhou.js";
import { PHROLOVA_RESONATOR, MAESTRO } from "../havoc/phrolova.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function augustaAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Electro, scaling: Scaling.Atk, ...def });
}

// --- basics, mid-air, dodge counter (Hunter's Path)
const BA1 = augustaAction("Basic - Hunter's Path 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 57.46, energy: 0.73, concerto: 1.45, offtune: 2312, forte1: 99, forte2: 74 });
const BA2 = augustaAction("Basic - Hunter's Path 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 134, energy: 1.70, concerto: 3.38, offtune: 5392, forte1: 230, forte2: 172 });
const BA3 = augustaAction("Basic - Hunter's Path 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 196.83, energy: 2.49, concerto: 4.95, offtune: 7920, forte1: 336, forte2: 252 });
const BA4 = augustaAction("Basic - Hunter's Path 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 193.89, energy: 2.46, concerto: 4.89, offtune: 7803, forte1: 333, forte2: 249 });
const MA = augustaAction("Mid-air - Hunter's Path", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 119.3, energy: 1.5, concerto: 2, offtune: 7200, forte1: 50, forte2: 154 });
const DC = augustaAction("Dodge Counter - Hunter's Path 2", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 134, energy: 1.7, concerto: 13.38, offtune: 5392, forte1: 230, forte2: 172 });
const MDC = augustaAction("Dodge Counter - Hunter's Path (Mid-Air)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 119.3, energy: 1.5, concerto: 12, offtune: 7200, forte1: 50, forte2: 154 });

// heavy attack: Steelclash, base cast; at full Prowess it's replaced by Backstep -> Spinslash
const HA = augustaAction("Heavy - Hunter's Path", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 139.17, energy: 1.77, concerto: 3.51, offtune: 5601, forte1: 342, forte2: 255 });
const FHA1 = augustaAction("Heavy - Thunderoar: Backstep", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 53.68, energy: 0.50, concerto: 1, offtune: 1600, forte1: -660, forte2: 50 });
const FHA2 = augustaAction("Heavy - Thunderoar: Spinslash", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 425.16, energy: 4.47, concerto: 8.91, offtune: 14256, forte2: 744 });
const FJump = augustaAction("Heavy - Thunderoar: Uppercut", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 357.86, energy: 3.76, concerto: 7.50, offtune: 12000, forte1: -660, forte2: 382 });

// resonance skill: Warrior's Blade, base cast; at full Ascendancy it's replaced by the Undying
// Sunlight Strike -> Leap -> Plunge chain instead
const Skill = augustaAction("Skill - Warrior's Blade", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 656.1, energy: 9, concerto: 10, offtune: 4491, forte1: 660, forte2: 500 });
const FSkill1 = augustaAction("Forte Skill - Undying Sunlight: Strike", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, mv: 278.34, energy: 5, concerto: 7, offtune: 18200, 
  forte2: -4000,
});
const FSkill2 = augustaAction("Forte Skill - Undying Sunlight: Leap", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, mv: 278.35, energy: 5, concerto: 7, offtune: 11200 });
/** Consumes all Ascendancy, counts as Heavy Attack DMG, grants a stack of Majesty (forte3). */
const FSkill3 = augustaAction("Forte Skill - Undying Sunlight: Plunge", {
  node: Node.Forte, cast: Cast.Skill, type: Type1.Heavy, mv: 865.83, energy: 11, concerto: 7, offtune: 24000, forte3: 1,
});

// liberation: Sword of Eternal Oath, the plain press-and-release cast
const Lib1 = augustaAction("Liberation - Sword of Eternal Oath", { node: Node.Liberation, cast: Cast.Liberation, cutscene: true, type: Type1.Heavy, mv: 1099.48, energy: 4.74, concerto: 20, offtune: 29342, forte2: 2000, resetEnergy: true });
/** Held instead of released once Majesty (forte3) reaches 2 — costs both stacks rather than
 *  Energy. Nine hits lumped into one action; queues Everbright Protector itself once the ninth lands. */
const Lib2 = augustaAction("Liberation - Sublime is the Sun", {
  node: Node.Liberation, cast: Cast.Liberation, cutscene: true, forte3: -2,
  updateBuffs: () => { queue(Lib2fua); queue(Lib3); applyTeam(RULERS_REALM, 1); },
});

const Lib2fua = augustaAction("Liberation - Sublime is the Sun: Sunborne x9", { node: Node.Liberation, cast: Cast.Liberation, cutscene: true, type: Type1.Heavy, mv: 1073.61, concerto: 18, offtune: 64800 });
/** The finisher — ends Sworn Allegiance and spends every stack of Crown of Wills. Costs no
 *  Resonance Energy. */
const Lib3 = augustaAction("Liberation - Sublime is the Sun: Everbright Protector", {
  node: Node.Liberation, cast: Cast.Liberation, cutscene: true, type: Type1.Heavy, mv: 1192.93, concerto: 10, offtune: 50400,
  updateBuffs: () => {
    // memberOf() throws on a resonator not on this team, so only reach for it if Phrolova's along
    if (currentTeam().slots.some((s) => s.resonator === PHROLOVA_RESONATOR)) revokeBuff(PHROLOVA_RESONATOR, MAESTRO);
  },
});

/** S6's Thunder Rage: two instances of 100% of her ATK at the spot, Heavy Attack DMG, whenever she
 *  casts Spinslash or Uppercut. Not a row on the kit page, so no energy, concerto or off-tune. */
const ThunderRage = augustaAction("Heavy - Thunder Rage (S6)", { node: Node.Forte, type: Type1.Heavy, mv: 200 });

const Intro = augustaAction("Intro - Stride of Goldenflare", { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 198.82, energy: 10, concerto: 10, offtune: 9600, forte1: 660, forte2: 800 });
/** No damage of its own, just the outro handoff (BATTLESONG) — her own Majesty/Crown of Wills
 *  grant is earned later, off the recipient's own Outro. */
const Outro = augustaAction("Outro - Battlesong of the Unyielding", {
  cast: Cast.Outro, concerto: -100, swapOut: true,
  updateBuffs: () => queueOutro(BATTLESONG),
});

/* ------------------------------------------------------------------------------------ buffs */

/** +15% Electro DMG Bonus a stack — granted alongside Majesty's own second stack, spent entirely
 *  when Everbright Protector ends Sworn Allegiance. One stack until S1 lifts the cap to 2 and S6 to
 *  4; S1 adds Crit. DMG a stack on top and S2 Crit. Rate. */
const CROWN_OF_WILLS = new Buff({
  name: "Augusta: Crown of Wills", maxStacks: 4,
  stats: [[Stat.DmgBonus, 15, Attribute.Electro]], perStack: true,
  applyStats: () => {
    const n = frozenStacks();
    if (isHeld(AG_S1)) asSource(AG_S1, () => addStat(Stat.CritDmg, 15 * n));
    if (isHeld(AG_S2)) asSource(AG_S2, () => addStat(Stat.CritRate, 20 * n));
  },
  convertStats: () => { if (runningAction(Lib3)) revokeCurrent(CROWN_OF_WILLS); },
});
/** A gain against the cap her nodes set, since the buff's own is the highest of the three. */
function gainCrown(n: number): void {
  const room = (isHeld(AG_S6) ? 4 : isHeld(AG_S1) ? 2 : 1) - stacksOf(CROWN_OF_WILLS);
  if (room > 0) applyCurrent(CROWN_OF_WILLS, Math.min(n, room));
}

/** Opens alongside Sublime is the Sun, 30s — permanent uptime once granted. While it's up, any
 *  team member's Intro grants them a shield (650 + 5% of her Max HP, 10s, unstackable) — put up
 *  as one shield marker, but only when that Intro hasn't shielded already: a team buff's own
 *  updateDebuffs() runs after every piece of the actor's equipped gear (state.ts's freezeHeld walks
 *  the slot's own gear first, then team buffs), so Iuno's/Jingran's/her own Intro shield is
 *  already counted by the time this looks, and they don't get a second. */
const RULERS_REALM = new Buff({
  name: "Augusta: Ruler's Realm",
  updateDebuffs: () => { if (casting(Cast.Intro) && !applied(SHIELD)) applyCurrent(SHIELD, 1); },
});

/** Hands the incoming resonator +15% DMG Amplification (all attributes) for 14s. */
const BATTLESONG = new Buff({
  name: "Augusta: Outro",
  updateBuffs: () => { lostOnSwap(); },
  stats: [[Stat.Amp, 15]],
});

/** A shield on every damaging hit — the shield marker off every one of her casts (two off Undying
 *  Sunlight's Leap/Plunge and Sword of Eternal Oath, which shield on their own on top). Shields
 *  are not a stat, so the marker is all this piece adds. */
const SHIELDS = new Map<Action, number>([
  [FSkill2, 2], [FSkill3, 2], [Lib1, 2],
  ...[BA1, BA2, BA3, BA4, MA, DC, MDC, HA, FHA1, FHA2, FJump, Skill, FSkill1, Lib2, Lib2fua, Lib3, Intro].map((a): [Action, number] => [a, 1]),
]);
const AG_INHERENT_1 = new Inherent({
  name: "Inherent: Glory's Favor",
  updateDebuffs: () => {
    const n = SHIELDS.get(currentAction());
    if (n) applyCurrent(SHIELD, n);
  },
});

/** No combat-formula effect this engine models either, same "still equipped, no stat" treatment. */
const AG_INHERENT_2 = new Inherent({
  name: "Inherent: Blazing Valor",
  combatStart: () => {
    addForte3(1);
    gainCrown(4); // "fully restore Crown of Wills" — to whatever cap her nodes allow
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
const AUGUSTA_TALENTS = new Talent({
  name: "Augusta: Talents",
  stats: [[Stat.CritRate, 8], [Stat.BonusAtk, 12]],
});

const AUGUSTA_RESONATOR = new Resonator({
  name: "Augusta",
  talent: AUGUSTA_TALENTS,
  inherent1: AG_INHERENT_1,
  inherent2: AG_INHERENT_2,
  element: Attribute.Electro,
  weapon: WeaponType.Broadblade,
  intro: () => Intro,
  outro: () => Outro,
  color: "#e8734f",
  maxEnergy: 125,
  maxForte1: 660,
  maxForte2: 4000,
  maxForte3: 2,

  // reacts to *any* team member's own Outro, not just her own — currentSlot is forced to her own
  // holder for this call, so the real actor's own held gear comes off currentTeam().slot instead
  updateGlobal: () => {
    if (casting(Cast.Outro) && currentTeam().slot.isHeld(BATTLESONG)) {
      addForte3(1);
      gainCrown(1);
    }
  },

  constantStats: () => {
    addStat(Stat.BaseHp, 10300); addStat(Stat.BaseAtk, 463); addStat(Stat.BaseDef, 1112);
  },
});

/* --------------------------------------------------------------------------------- sequences */

/** S1: Crown of Wills holds 2 and pays +15% Crit. DMG a stack (both in the buff itself), and her
 *  Intro banks one. The Undying Sunlight interrupt immunity is no stat. */
const AG_S1 = new Sequence({
  name: "Augusta S1: Stained in Scorched Earth",
  updateBuffs: () => { if (runningAction(Intro)) gainCrown(1); },
});

/** S2: +20% Crit. Rate a stack of Crown of Wills (in the buff), and every point of Crit. Rate past
 *  100 turned into 2 points of Crit. DMG, up to 100 — read late, once every source has landed,
 *  since it is the build's finished Crit. Rate the node converts. */
const AG_S2 = new Sequence({
  name: "Augusta S2: Cleansed in Crimson War",
  lateConvertStats: () => addStat(Stat.CritDmg, Math.min(100, Math.max(0, (getStat(Stat.CritRate) - 100) * 2))),
});

/** S3: the four Thunderoar hits, Undying Sunlight's Plunge, Sunborne and Everbright Protector at
 *  x1.25 — multiplicative, nanoka's own S3 rows (Backstep 67.1% against 53.68%, Sunborne 149.11%
 *  against 119.29%). */
const AG_S3_HITS = new Set<Action>([FHA1, FHA2, FJump, FSkill3, Lib2fua, Lib3]);
const AG_S3 = new Sequence({
  name: "Augusta S3: Forged in Rot and Ruin",
  applyStats: () => { if (AG_S3_HITS.has(currentAction())) addStat(Stat.MulMv, 25); },
});

/** S4: her Intro hands the team +20% ATK for 30s — every visit casts one, so it never lapses. */
const STRIDE_OF_GOLDENFLARE = new Buff({ name: "Augusta S4: Ascent in Sun and Glory", stats: [[Stat.BonusAtk, 20]] });
const AG_S4 = new Sequence({
  name: "Augusta S4: Ascent in Sun and Glory",
  updateBuffs: () => { if (runningAction(Intro)) applyTeam(STRIDE_OF_GOLDENFLARE, 1); },
});

/** S5: Glory's Favor shields for half as much again — shields are no stat here. */
const AG_S5 = new Sequence({ name: "Augusta S5: Unshaken in Wrathful Tides" });

/** S6: Crown of Wills holds 4 (`gainCrown()`), Spinslash and Uppercut bank 2 of them and fire
 *  Thunder Rage, and a second conversion band picks up where S2's leaves off — every point of Crit.
 *  Rate past 150 for 2 more Crit. DMG, up to 50. The 1s gate on the Crown gain is no clock here;
 *  neither cast comes round twice in a second. */
const AG_S6 = new Sequence({
  name: "Augusta S6: Engraved in Radiant Light",
  updateBuffs: () => {
    if (!runningAction(FHA2) && !runningAction(FJump)) return;
    gainCrown(2);
    queue(ThunderRage);
  },
  lateConvertStats: () => addStat(Stat.CritDmg, Math.min(50, Math.max(0, (getStat(Stat.CritRate) - 150) * 2))),
});

const AG_SEQUENCES = [AG_S1, AG_S2, AG_S3, AG_S4, AG_S5, AG_S6];

// the migrated rotation: the Steelclash->Thunderoar chain twice, Sword of Eternal Oath, the
// Undying Sunlight chain. She's never the team's own lead, so this covers both opener and loop.

const AG_ROTATION = new Rotation([
  INTRO, FHA1, FHA2, Skill, FHA1, FHA2, HA, Lib1, HA, 
  FSkill1, FSkill2, FSkill3, Lib2, FJump, OUTRO,
]);

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills, viable weapons, mainslot echo,
// sonata pieces, mainstat/substat
export const AUGUSTA = new Loadout({
  resonator: AUGUSTA_RESONATOR,
  weapons: [THUNDERFLARE_DOMINION, NEW_STD_BRAUDBLADE, LUSTROUS_RAZOR, VERDANT_SUMMIT],
  echoLoadouts: [new EchoLoadout(FALSE_SOVEREIGN, COV_3PC, VOID_THUNDER_2PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Electro3, Mainstat.ATK1),
  substat: substats(Substat.AtkPct, Substat.Heavy, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Heavy, Substat.FlatAtk, Substat.Er),
  rotation: AG_ROTATION,
  sequences: AG_SEQUENCES,
});
