/**
 * Hsin — a limited 5-star electro Rectifier main DPS with two forms and two Resonance Modes, one
 * loadout each: HSIN (Resonance Mode - Electro Flare) and HSIN_UNISON (Resonance Mode - Unison).
 *
 * Answering Form is her ground state: presses bank Answering Heart (forte1, 0-100), and at 100 her
 * Heavy becomes Realm Wanderer/Protector, which spends it and unlocks Formshift. Formshift (a
 * Liberation cast) turns her into Illumining Form for the Heart Manifest window: 21 Edict for
 * Soaring Pillar coordinated hits, 5 Electro Flare, and Illumining presses bank Illumining Heart
 * (forte2, 0-300). At 300 her Skill becomes Pillars Aligned, opening Mechanism Dominion, whose
 * presses spend the Heart; empty, her Heavy becomes Beholding/Stilling All Horizons and unlocks
 * Pillars Across Heaven, the real Liberation, which ends Heart Manifest and returns her to
 * Answering Form.
 *
 * Flare mode's own loop: every Electro Rage the team inflicts becomes Heart of Thunder on her
 * (cap 100) and is taken off the target; Skill - Illumining Form spends it five at a time for
 * Electro Flare DMG at 200% of the current rung, then dumps the rest at 40% a stack. Thunderglow
 * (one a stack teammates inflict, cap 10, while she is out of Heart Manifest) arms Fleeting
 * Thunder in her first Manifest, and that mark never comes off: from there the target's Flare is
 * pinned at its cap (16 at most), no tick ever spends it, and every Flare anyone lands after that
 * overflows straight into Electro Rage for her Heart of Thunder.
 *
 * Numbers from encore.moe's beta data (character 1311, `?v=Beta`) at skill level 10: motion
 * values, energy, concerto (per-hit ElementPower plus the flat Concerto Regen rows) and off-tune
 * (WeaknessLvl x10000) per hit, checked unit for unit against Buling's own rows. Base stats and
 * the talent tree from the same file. Neither encore nor any other source publishes her per-hit
 * Answering/Illumining Heart gains or what a Mechanism Dominion hit spends, so those deltas are
 * absent here (0) — only the kit text's own flat grants are wired: 60 on the Intro, 150 on the
 * primed Heartlock collapse. The rotation is written as the kit reads and will only gate
 * correctly once those numbers are in. No sequences are modelled.
 *
 * Unison mode (shared/unison.ts): Formshift grants Unison, and she can trigger Unison Response.
 * Her four Intro forms are the mode's own smaller ones, replaced by the Manifold Unison pair —
 * Resonance Skill DMG, far larger — on a Unison Response, which also banks Source Intent, or by
 * spending Source Intent on an Intro that is no response. An Illumining Intro of either kind
 * lands her straight in Mechanism Dominion with 300 Illumining Heart. Tides of Succession is +40%
 * Electro DMG Bonus off a Manifold Intro, lost on swap; Gleaning Simple Joys lets the team's
 * Unison Boon reach three stacks and hands one to everyone off *any* member's response; and her
 * Outro spends Nightglow on Shared Light — every teammate who gained a Unison of their own takes
 * +20% All DMG Amplification for 30s. The loop is Jinhsi's double-Intro shape: an Answering
 * visit ending on Formshift's Unison outro, the resonator behind her plays, and their outro
 * brings her back in Illumining Form for Dominion, Stilling and Pillars Across Heaven.
 */
import { Tier, Stat, Attribute, WeaponType, Type1, Type2, Cast, Node, Scaling } from "../../engine/stats.js";
import { Buff, Talent, Inherent, ResonanceMode, Resonator, Loadout, EchoLoadout } from "../../engine/gear.js";
import {
  addBuff,
  addStat,
  applied,
  appliedByMember,
  applyCurrent,
  applyEnemy,
  applyTeam,
  casting,
  consume,
  currentAction,
  currentTeam,
  forte1,
  frozenStacks,
  isHeld,
  queue,
  removeStack,
  revokeCurrent,
  revokeEnemy,
  revokeTeam,
  setForte1,
  setStacksSelf,
  stacksOf,
  stacksOfEnemy,
  isActive,
} from "../../engine/context.js";
import { Action, ActionField, ActionGroup, Rotation, DOUBLE_INTRO, INTRO, ECHO_SWAP, OUTRO, ECHO_ONFIELD } from "../../engine/rotation.js";
import { coordinatedBuff, lostOnSwap } from "../../shared/helpers.js";
import { UNISON, UNISON_BOON, UNISON_RESPONDER, UNISON_RESPONSE, respondToUnison, unisonIntro, unisonResponse } from "../../shared/unison.js";
import {
  ELECTRO_FLARE, ELECTRO_FLARE_DMG, ELECTRO_RAGE, FLEETING_THUNDER, inflictElectroFlare, negativeStatusRung,
} from "../../shared/status.js";
import { BLOOMING_JADEHAVEN, FREEZE_FRAME, LETHEAN_ELEGY, STRINGMASTER } from "../../weapons/rectifier.js";
import { COSMIC_RIPPLES, NEW_STD_RECTIFIER } from "../../weapons/standard.js";
import { STAY_TUNED, SWORN_VIGIL_5PC, ELECTRIC_REFLECTION_5PC } from "../../echoes/mengzhou.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { chem } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function hsinAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Electro, scaling: Scaling.Atk, ...def });
}

/** The Electro Flare rung the target currently sits on, as a motion value — 0 with no Flare up. */
const flareMv = (): number => negativeStatusRung(ELECTRO_FLARE_DMG, stacksOfEnemy(ELECTRO_FLARE))?.mv ?? 0;

/** One of her own Electro Flare DMG instances: a dot-scaled Status hit carrying no motion value of
 *  its own — the target's own rung is what it is worth (AddMv, inside the parentheses), and `mul`
 *  is the percentage the kit text puts on top of it: +100 for a 200% instance, -60 for a 40% one. */
const flareHit = (name: string, mul: () => number, def: object = {}): Action =>
  new Action(name, {
    element: Attribute.Electro, type: Type1.Status, type2: Type2.ElectroFlare, scaling: Scaling.Dot, mv: 0,
    applyStats: () => { addStat(Stat.AddMv, flareMv()); addStat(Stat.MulMv, mul()); },
    ...def,
  });

// --- Answering Form: basics, heavy, mid-air, dodge counter, skill (Manifold Bloom / Heartward by
//     Moon). Every hit banks Answering Heart — amounts unpublished, see the file header.
const BA1 = hsinAction("Basic - Answering Form 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 69.60, energy: 1.80, concerto: 2.00, offtune: 4000 });
const BA2 = hsinAction("Basic - Answering Form 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 151.44, energy: 3.95, concerto: 4.37, offtune: 8706 });
const BA3 = hsinAction("Basic - Answering Form 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 157.54, energy: 4.11, concerto: 2.40, offtune: 4800 });
const BA4 = hsinAction("Basic - Answering Form 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 198.59, energy: 5.15, concerto: 7.85, offtune: 15673 });
const HA = hsinAction("Heavy - Answering Form", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 102.76, energy: 2.70, concerto: 3.00, offtune: 5906 });
const MA = hsinAction("Mid-air - Answering Form", { node: Node.Normal, cast: Cast.MidAir, type: Type1.Basic, mv: 22.44, energy: 0.59, concerto: 0.65, offtune: 2080 });
const ReignHold = hsinAction("Heavy - Answering Form: Reign at Ease (Mid-Air)", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 696.00, energy: 18.00, concerto: 20.00, offtune: 40000 });
const ReignPlunge = hsinAction("Mid-air - Answering Form: Reign at Ease", { node: Node.Normal, cast: Cast.MidAir, type: Type1.Basic, mv: 22.44, energy: 0.59, concerto: 0.65, offtune: 2080 });
const DC = hsinAction("Dodge Counter - Answering Form", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 224.90, energy: 5.84, concerto: 16.48, offtune: 12930 });
const Skill = hsinAction("Skill - Answering Form", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 167.06, energy: 4.35, concerto: 2.40, offtune: 9600 });

// --- Answering Form: Realm Wanderer at 100 Answering Heart, Realm Protector when Resolution of
//     Wishes (once per 25s — every visit) is spent on it. Both Skill DMG, both unlock Formshift.
const REALM = {
  node: Node.Forte, cast: Cast.Heavy, type: Type1.Skill, energy: 7.77, concerto: 8.64, forte1: -100,
  updateBuffs: () => { if (forte1() > 100) setForte1(100); applyCurrent(FORMSHIFT_UNLOCKED, 1); },
};
const RealmWanderer = hsinAction("Forte Heavy - Answering Form: Realm Wanderer", { ...REALM, mv: 570.62, offtune: 17177 });
const RealmProtector = hsinAction("Forte Heavy - Answering Form: Realm Protector", { ...REALM, mv: 1241.45, offtune: 25819 });

// --- Illumining Form outside Mechanism Dominion: Stage 1 plants the Modular Heartlock, Stage 2,
//     the Heavy, the Dodge Counter and the Skill collapse it. Every hit banks Illumining Heart.
const collapseHeartlock = (): void => { if (isHeld(HEARTLOCK)) { revokeCurrent(HEARTLOCK); queue(Heartlock); } };
const COLLAPSE = { updateBuffs: collapseHeartlock };
const IBA1 = hsinAction("Basic - Illumining Form 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 62.75, energy: 1.64, concerto: 1.83, offtune: 3609, updateBuffs: () => applyCurrent(HEARTLOCK, 1) });
const IBA2 = hsinAction("Basic - Illumining Form 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 69.60, energy: 1.80, concerto: 2.00, offtune: 4000, ...COLLAPSE });
const IBA3 = hsinAction("Basic - Illumining Form 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 182.10, energy: 4.76, concerto: 5.30, offtune: 10470 });
const Heartlock = hsinAction("Basic - Illumining Form: Modular Heartlock", { node: Node.Normal, type: Type1.Basic, mv: 41.84, energy: 1.10, concerto: 1.22, offtune: 2406 });
const IHA = hsinAction("Heavy - Illumining Form", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 107.86, energy: 2.80, concerto: 3.10, offtune: 6200, ...COLLAPSE });
const UpwardCut = hsinAction("Basic - Illumining Form: Upward Cut", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 87.57, energy: 2.27, concerto: 2.53, offtune: 5035 });
const IMA = hsinAction("Mid-air - Illumining Form", { node: Node.Normal, cast: Cast.MidAir, type: Type1.Basic, mv: 22.45, energy: 0.59, concerto: 0.65, offtune: 2080 });
const IDC = hsinAction("Dodge Counter - Illumining Form", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 191.36, energy: 4.96, concerto: 15.50, offtune: 11000, ...COLLAPSE });

/** Skill - Illumining Form: five hits, each spending 5 Heart of Thunder for a Flare instance at
 *  200% of the rung, then every stack left over spent at once for 40% of the rung apiece. Also a
 *  collapse. */
const ISkill = hsinAction("Skill - Illumining Form", {
  node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 222.69, energy: 5.79, concerto: 6.40, offtune: 12800,
  updateBuffs: () => {
    collapseHeartlock();
    for (let hit = 0; hit < 5 && stacksOf(HEART_OF_THUNDER) >= 5; hit++) { removeStack(HEART_OF_THUNDER, 5); queue(ThunderBurst); }
    // whatever is left is spent by the dump itself, which reads it as its own multiplier
    if (stacksOf(HEART_OF_THUNDER) > 0) queue(ThunderDump);
  },
});
const ThunderBurst = flareHit("Skill - Illumining Form: Heart of Thunder (5 Stacks)", () => 100);
/** The whole remainder at once: 40% of the rung a stack, so the stacks ride in the multiplier —
 *  100 of them is x40, not x40 each. It spends the gauge itself, after its own hit has read it. */
const ThunderDump = flareHit("Skill - Illumining Form: Heart of Thunder (Remaining)", () => 40 * stacksOf(HEART_OF_THUNDER) - 100, {
  convertStats: () => revokeCurrent(HEART_OF_THUNDER),
});

// --- Illumining Form: Pillars Aligned at 300 Illumining Heart opens Mechanism Dominion (13s), and
//     the Dominion presses spend the Heart per hit — amounts unpublished, see the file header.
//     In Flare mode Pillars Aligned lays 5 Electro Flare, and each Dominion cast lays 1 more —
//     five of those a Formshift, whichever casts spend them (PILLAR_CHARGES).
const pillarFlare = (): void => {
  if (!isHeld(MODE_FLARE) || !stacksOf(PILLAR_CHARGES)) return;
  inflictElectroFlare(1); removeStack(PILLAR_CHARGES, 1);
};
const PILLAR_FLARE = { updateDebuffs: pillarFlare };
const PillarsAligned = hsinAction("Skill - Illumining Form: Pillars Aligned", {
  node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, mv: 895.21, energy: 8.37, concerto: 13.17, offtune: 16268,
  updateDebuffs: () => { if (isHeld(MODE_FLARE)) inflictElectroFlare(5); pillarFlare(); },
  updateBuffs: () => applyCurrent(MECHANISM_DOMINION, 1),
});
const FBA1 = hsinAction("Basic - Illumining Form: Pillars Aligned 1", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 86.58, energy: 2.25, concerto: 2.49, offtune: 4977, ...PILLAR_FLARE });
const FBA2 = hsinAction("Basic - Illumining Form: Pillars Aligned 2", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 114.69, energy: 2.97, concerto: 3.30, offtune: 6594, ...PILLAR_FLARE });
const FBA3 = hsinAction("Basic - Illumining Form: Pillars Aligned 3", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 106.75, energy: 2.80, concerto: 3.10, offtune: 6140, ...PILLAR_FLARE });
const FBA4 = hsinAction("Basic - Illumining Form: Pillars Aligned 4", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 166.38, energy: 4.38, concerto: 4.80, offtune: 9560, ...PILLAR_FLARE });
const FADC = hsinAction("Dodge Counter - Illumining Form: Pillars Aligned", { node: Node.Forte, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 114.69, energy: 2.97, concerto: 13.30, offtune: 6594, ...PILLAR_FLARE });
const FBA1234 = new ActionGroup("Basic - Illumining Form: Pillars Aligned 1234", [FBA1, FBA2, FBA3, FBA4]);

// --- Illumining Form: Beholding All Horizons once the Heart is spent, Stilling when Law of Heaven
//     (once per 25s — every visit) is spent on it. Both end Dominion and unlock Pillars Across Heaven.
const HORIZONS = {
  node: Node.Forte, cast: Cast.Heavy, type: Type1.Skill, energy: 8.73,
  updateBuffs: () => { revokeCurrent(MECHANISM_DOMINION); applyCurrent(PILLARS_UNLOCKED, 1); },
};
const Beholding = hsinAction("Heavy - Illumining Form: Beholding All Horizons", { ...HORIZONS, mv: 410.78 });
const Stilling = hsinAction("Heavy - Illumining Form: Stilling All Horizons", {
  ...HORIZONS, mv: 1081.69, offtune: 20160,
  updateDebuffs: () => { if (isHeld(MODE_FLARE)) inflictElectroFlare(5); },
});

// --- the two Liberations: Formshift into Illumining Form, Pillars Across Heaven back out of it
const Lib1 = hsinAction("Liberation - Formshift", {
  node: Node.Liberation, cast: Cast.Liberation, concerto: 20,
  updateDebuffs: () => { if (isHeld(MODE_FLARE)) inflictElectroFlare(5); },
  updateBuffs: () => {
    if (isHeld(MODE_UNISON)) applyCurrent(UNISON, 1);
    revokeCurrent(FORMSHIFT_UNLOCKED);
    applyCurrent(ILLUMINING_FORM, 1); applyCurrent(HEART_MANIFEST, 1);
    revokeTeam(EDICT); applyTeam(EDICT, 21);
    if (isHeld(MODE_FLARE)) { applyCurrent(HEARTLOCK_PRIMED, 1); setStacksSelf(PILLAR_CHARGES, 5); }
  },
});
/** The Sanctum comes down as Resonance Skill DMG: 125 Energy, and the end of Heart Manifest. */
const Lib2 = hsinAction("Liberation - Pillars Across Heaven", {
  node: Node.Liberation, cast: Cast.Liberation, type: Type1.Skill, mv: 2012.67, concerto: 20, offtune: 115200, resetEnergy: true,
  updateBuffs: () => {
    revokeCurrent(PILLARS_UNLOCKED); revokeCurrent(ILLUMINING_FORM); revokeCurrent(HEART_MANIFEST);
    revokeCurrent(THUNDERGLOW); revokeCurrent(PILLAR_CHARGES);
    applyCurrent(NIGHTGLOW, 1);
  },
});

/** Soaring Pillar: one Edict spent a second while the active resonator deals damage, considered
 *  Resonance Liberation DMG. */
const SANCTUM = new ActionField("Hsin: Manifold Sanctum");
const SoaringPillar = hsinAction("Liberation - Soaring Pillar", {
  type: Type1.Liberation, type2: Type2.Coordinated, mv: 11.37, field: SANCTUM,
});

// --- intros: the Flare-mode forms, then the Unison mode's own four — its plain pair, and the
//     Manifold Unison pair (Resonance Skill DMG) a Unison Response or a held Source Intent puts
//     in their place. An Illumining Intro of either kind opens Mechanism Dominion at 300 Heart.
const MANIFOLD = {
  updateDebuffs: respondToUnison,
  // a response banks Source Intent for a later Intro; an Intro that is no response spent it
  updateBuffs: () => { if (unisonResponse()) applyCurrent(SOURCE_INTENT, 1); else revokeCurrent(SOURCE_INTENT); },
};
const UIntro = hsinAction("Intro - Answering Form", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 10.28 * 2 + 20.55 * 4, energy: 10, concerto: 3 + 10, offtune: 591 * 2 + 1181 * 4, forte1: 60,
});
const ManifoldAnswering = hsinAction("Intro - Answering Form: Manifold Unison", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Skill, mv: 60.59 * 2 + 121.18 * 4, energy: 10, concerto: 3 + 10, offtune: 591 * 2 + 1181 * 4, forte1: 60,
  ...MANIFOLD,
});
const UIIntro = hsinAction("Intro - Illumining Form", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 56.59 * 4 + 5.66 + 11.32 * 2 + 14.15 * 2, energy: 10, concerto: 1.63 * 4 + 0.17 + 0.33 * 2 + 0.41 * 2 + 10, offtune: 3253 * 4 + 326 + 651 * 2 + 814 * 2, forte2: 300,
  updateBuffs: () => applyCurrent(MECHANISM_DOMINION, 1),
});
const ManifoldIllumining = hsinAction("Intro - Illumining Form: Manifold Unison", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Skill, mv: 157.22 * 4 + 15.73 + 31.45 * 2 + 39.31 * 2, energy: 15, concerto: 2.63 * 4 + 0.27 + 0.53 * 2 + 0.66 * 2 + 10, offtune: 3253 * 4 + 326 + 651 * 2 + 814 * 2, forte2: 300,
  updateDebuffs: MANIFOLD.updateDebuffs,
  updateBuffs: () => { MANIFOLD.updateBuffs(); applyCurrent(MECHANISM_DOMINION, 1); },
});
const Intro = hsinAction("Intro - Answering Form", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 157.54, energy: 10.00, concerto: 14.55, offtune: 9057, forte1: 60,
  updateDebuffs: () => { if (isHeld(MODE_FLARE)) inflictElectroFlare(1); },
});
const IIntro = hsinAction("Intro - Illumining Form", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 228.40, energy: 10.00, concerto: 16.58, offtune: 13134,
  updateDebuffs: () => { if (isHeld(MODE_FLARE)) inflictElectroFlare(1); },
});
const Outro = hsinAction("Outro - Herself a Thousand Lanterns", {
  cast: Cast.Outro, type: Type1.Outro, mv: 100, concerto: -100, swapOut: true,
  updateBuffs: () => {
    if (!isHeld(NIGHTGLOW)) return;
    if (isHeld(MODE_FLARE)) { revokeCurrent(NIGHTGLOW); applyTeam(LANTERNS, 1); }
    if (isHeld(MODE_UNISON)) {
      revokeCurrent(NIGHTGLOW);
      for (const s of currentTeam().slots) if (s.resonator && s.isHeld(SHARED_LIGHT)) addBuff(s.resonator, SHARED_LIGHT_AMP, 1);
    }
  },
});

/* ------------------------------------------------------------------------------------ buffs */

/** The two Resonance Modes, one loadout each. Every mode-bound branch reads its own. */
const MODE_FLARE = new ResonanceMode({ name: "Resonance Mode - Electro Flare" ,
  // Forms Turn, Heart Abides, Flare mode: every Electro Rage the team inflicts is hers, and comes
  // off the target — watched from her own slot on every action, so a teammate's overflow lands on her
  updateGlobal: () => {
    if (!isHeld(MODE_FLARE)) return;
    const rage = applied(ELECTRO_RAGE);
    if (rage > 0) applyCurrent(HEART_OF_THUNDER, rage);
    if (stacksOfEnemy(ELECTRO_RAGE) > 0) consume(ELECTRO_RAGE, stacksOfEnemy(ELECTRO_RAGE));
  },
});

/** Resonance Mode - Unison: her own Unison Response hands the team a Unison Boon (once,
 *  refreshed after) and, as a responder, the Boon pays her; a teammate who gains a Unison of
 *  their own takes Shared Light, watched from her slot on every action. */
const MODE_UNISON = new ResonanceMode({
  name: "Resonance Mode - Unison",
  combatStart: () => applyCurrent(UNISON_RESPONDER, 1),
  updateBuffs: () => { if (unisonResponse() && !isHeld(HS_BOON_RESPONSE)) { applyTeam(UNISON_BOON, 1); applyCurrent(HS_BOON_RESPONSE, 1); } },
  updateGlobal: () => {
    const actor = currentTeam().slot;
    // `isHeld`, not applied: this runs ahead of the grant's own updateBuffs, and a Unison is held
    // from its grant to the outro that spends it
    if (actor.resonator && !actor.isHeld(HSIN_RESONATOR) && actor.isHeld(UNISON)) addBuff(actor.resonator, SHARED_LIGHT, 1);
  },
});

/** Source Intent: banked by a Unison Response, spent by the next Intro that is no response to
 *  make it a Manifold Unison one all the same. */
const SOURCE_INTENT = new Buff({ name: "Hsin: Source Intent" });

/** Shared Light: a teammate who gained a Unison of their own carries it, and her Nightglow Outro
 *  turns it into +20% All DMG Amplification for 30s — permanent once granted. */
const SHARED_LIGHT = new Buff({ name: "Hsin: Shared Light" });
const SHARED_LIGHT_AMP = new Buff({ name: "Hsin: Outro (Shared Light)", applyStats: () => addStat(Stat.Amp, 20) });

/** Her own two Unison Boon grants — one each, refreshed after: her Unison Response (the shared
 *  rule) and Gleaning Simple Joys' off anybody's response. */
const HS_BOON_RESPONSE = new Buff({ name: "Hsin: Unison Boon (response)" });
const HS_BOON_GLEANING = new Buff({ name: "Hsin: Unison Boon (Gleaning Simple Joys)" });

/** Form and unlock markers — Illumining Form picks her Intro, the two unlocks are what the
 *  Liberation button does next. Heart Manifest is the 45s window, and survives a swap. */
const ILLUMINING_FORM = new Buff({ name: "Hsin: Illumining Form" });
const FORMSHIFT_UNLOCKED = new Buff({ name: "Hsin: Formshift Unlocked" });
const PILLARS_UNLOCKED = new Buff({ name: "Hsin: Pillars Across Heaven Unlocked" });
const HEART_MANIFEST = new Buff({ name: "Hsin: Heart Manifest" });
const MECHANISM_DOMINION = new Buff({ name: "Hsin: Mechanism Dominion" });

/** The Modular Heartlock standing on the target, and the Flare-mode priming that makes its next
 *  collapse worth 150 Illumining Heart — once per Formshift, paid on the collapse hit itself. */
const HEARTLOCK = new Buff({ name: "Hsin: Modular Heartlock" });
const HEARTLOCK_PRIMED = new Buff({
  name: "Hsin: Modular Heartlock (Primed)",
  applyStats: () => { if (currentAction() === Heartlock) addStat(Stat.AddForte2, 150); },
  convertStats: () => { if (currentAction() === Heartlock) revokeCurrent(HEARTLOCK_PRIMED); },
});

/** Edict: 21 Soaring Pillars, one a second, banked by Formshift. */
const EDICT = coordinatedBuff("Hsin: Edict", 21, () => HSIN_RESONATOR, SoaringPillar);

/** The 5 Dominion hits that lay a Flare each, reset by every Formshift. */
const PILLAR_CHARGES = new Buff({ name: "Hsin: Pillars Aligned Flare Charges", maxStacks: 5 });

/** Heart of Thunder: the team's Electro Rage, taken off the target and banked on her, 100 at most.
 *  Spent by Skill - Illumining Form. */
const HEART_OF_THUNDER = new Buff({ name: "Hsin: Heart of Thunder", maxStacks: 100 });

/** Thunderglow: one per stack of Electro Flare a teammate inflicts while she is out of Heart
 *  Manifest, cap 10 — full, her next Manifest carries Fleeting Thunder. Overflow past the target's
 *  own cap counts too: it was still inflicted, it just banked as Electro Rage (status.ts).
 *  Cleared when Manifest ends. */
const THUNDERGLOW = new Buff({ name: "Hsin: Thunderglow", maxStacks: 10 });

/** Nightglow: banked by Pillars Across Heaven, spent by her Outro. */
const NIGHTGLOW = new Buff({ name: "Hsin: Nightglow" });

/** Outro, Flare mode: +20% Electro DMG Amplification for everyone but her, 20s — a team buff that
 *  short is lost on her own next Intro. */
const LANTERNS = new Buff({
  name: "Hsin: Outro",
  applyStats: () => { if (isActive() && !isHeld(HSIN_RESONATOR)) addStat(Stat.Amp, 20, Attribute.Electro); },
  updateBuffs: () => { if (casting(Cast.Intro) && isHeld(HSIN_RESONATOR)) revokeTeam(LANTERNS); },
});

/** How many *distinct* team slots have inflicted Electro Flare — Tides of Succession holds one bit
 *  per slot rather than a plain count (Hiyuki's Snow Rust shape), so this is how many of its three
 *  bits are up. Her own payout stops at the kit's two. */
const tidesPayers = (): number => {
  const slots = frozenStacks();
  return (slots & 1) + ((slots >> 1) & 1) + ((slots >> 2) & 1);
};
/** Tides of Succession, Unison mode: a Manifold Unison Intro is +40% Electro DMG Bonus for 8s,
 *  ended by switching out. */
const TIDES_UNISON = new Buff({
  name: "Inherent: Tides of Succession (Manifold Unison)",
  updateBuffs: () => lostOnSwap(),
  applyStats: () => addStat(Stat.DmgBonus, 40, Attribute.Electro),
});
/** Tides of Succession, Flare mode: +25% Electro DMG Bonus per resonator on the team who has
 *  inflicted Electro Flare, two at most. One bit a slot, so a resonator's second inflict pays
 *  nothing — the kit's "each Resonator can trigger this effect only once". */
const TIDES_OF_SUCCESSION = new Buff({
  name: "Inherent: Tides of Succession", maxStacks: 1 + 2 + 4,
  display: () => `Inherent: Tides of Succession x${Math.min(2, tidesPayers())}`,
  applyStats: () => addStat(Stat.DmgBonus, 25 * Math.min(2, tidesPayers()), Attribute.Electro),
});
/** Tides of Succession's Rover clause: Electro Rover's own Intro hands him and Hsin +20% Electro
 *  DMG Bonus for 30s — gone at his Outro, and at her own next Intro. */
const THUNDEROUS_BOND = new Buff({
  name: "Inherent: Tides of Succession (Electro Rover)",
  applyStats: () => addStat(Stat.DmgBonus, 20, Attribute.Electro),
});
const HS_INHERENT_1 = new Inherent({
  name: "Inherent: Tides of Succession",
  updateBuffs: () => {
    const a = currentAction();
    if (isHeld(MODE_UNISON) && (a === ManifoldAnswering || a === ManifoldIllumining)) applyCurrent(TIDES_UNISON, 1);
  },
  updateGlobal: () => {
    if (!isHeld(MODE_FLARE)) return;
    const actor = currentTeam().slot;
    // the applier's own bit — already up means this slot has had its stack and gets no second
    const slot = 1 << currentTeam().active;
    if (appliedByMember(ELECTRO_FLARE, actor) && (stacksOf(TIDES_OF_SUCCESSION) & slot) === 0) {
      applyCurrent(TIDES_OF_SUCCESSION, slot);
    }
    if (casting(Cast.Intro) && actor.resonator?.name === "Electro Rover") {
      applyCurrent(THUNDEROUS_BOND, 1); addBuff(actor.resonator, THUNDEROUS_BOND, 1);
    }
  },
});

/** Gleaning Simple Joys (Inherent 2). Unison mode: the team's Unison Boon may reach three stacks
 *  (the shared buff's own cap), and any member's Unison Response hands everyone one — once from
 *  this, refreshed after. Flare mode: Thunderglow a stack per Flare teammates inflict out of
 *  Heart Manifest; in it, a bare target is given 1 Flare, and full Thunderglow lays Fleeting
 *  Thunder. Only Manifest can lay it; the mark itself stands until the target leaves her range,
 *  which never happens here, so from then on the target's Flare is pinned at its cap (16 at most)
 *  and no tick ever spends it again. */
const HS_INHERENT_2 = new Inherent({
  name: "Inherent: Gleaning Simple Joys",
  updateGlobal: () => {
    const actor = currentTeam().slot;
    if (isHeld(MODE_UNISON)) {
      if (appliedByMember(UNISON_RESPONSE, actor) && !isHeld(HS_BOON_GLEANING)) { applyTeam(UNISON_BOON, 1); applyCurrent(HS_BOON_GLEANING, 1); }
      return;
    }
    if (!isHeld(MODE_FLARE)) return;
    if (isHeld(HEART_MANIFEST)) {
      if (stacksOfEnemy(ELECTRO_FLARE) === 0) inflictElectroFlare(1);
      if (stacksOf(THUNDERGLOW) >= 10) applyEnemy(FLEETING_THUNDER, 1);
    } else {
      const inflicted = actor.isHeld(HSIN_RESONATOR) ? 0 : appliedByMember(ELECTRO_FLARE, actor);
      // guarded: a 0-stack grant would still put an empty entry in the pool
      if (inflicted > 0) applyCurrent(THUNDERGLOW, inflicted);
    }
    // laying it is Manifest's, but the mark itself only goes when the target leaves her range —
    // never, here — so the top-up and the tick's own spend-nothing rule outlive Manifest
    if (!stacksOfEnemy(FLEETING_THUNDER)) return;
    const cap = Math.min(16, currentTeam().enemyMax(ELECTRO_FLARE));
    if (stacksOfEnemy(ELECTRO_FLARE) < cap) applyEnemy(ELECTRO_FLARE, cap - stacksOfEnemy(ELECTRO_FLARE));
  },
});

/* --------------------------------------------------------------------------- kit and loadout */

const HSIN_RESONATOR = new Resonator({
  name: "Hsin",
  tier: Tier.Limited,
  element: Attribute.Electro,
  weapon: WeaponType.Rectifier,
  // Unison mode: the Manifold form on a Unison Response, or on a held Source Intent
  intro: () => {
    if (!isHeld(MODE_UNISON)) return isHeld(ILLUMINING_FORM) ? IIntro : Intro;
    const manifold = unisonIntro() || isHeld(SOURCE_INTENT);
    return isHeld(ILLUMINING_FORM) ? (manifold ? ManifoldIllumining : UIIntro) : (manifold ? ManifoldAnswering : UIntro);
  },
  outro: () => Outro,
  color: "#f1a49b",
  maxEnergy: 125,


  constantStats: () => {
    addStat(Stat.BaseHp, 10300); addStat(Stat.BaseAtk, 462.5); addStat(Stat.BaseDef, 1112.22);
  },
});

const HSIN_TALENTS = new Talent({
  name: "Hsin: Talents",
  constantStats: () => { addStat(Stat.CritRate, 8); addStat(Stat.BonusAtk, 12); },
});

// The Flare-mode visit as the kit reads: the Intro chains into Stage 4, the Skill into Stage 4
// again, Realm Protector spends the Heart and Formshift follows; Stage 1-2 collapse the primed
// Heartlock, Pillars Aligned opens Dominion, its four stages lay the Flare charges, the Skill
// spends the Heart of Thunder they overflowed into, Stilling closes Dominion and Pillars Across
// Heaven ends the visit. She is never the team's lead, so this covers opener and loop both.
const HS_ROTATION_FLARE = new Rotation([
  INTRO, BA4, Skill, BA4, RealmProtector,
  Lib1, 

  IBA1, IBA2, IBA3,
  PillarsAligned, 

  ECHO_ONFIELD, FBA1234, ISkill, FBA4, Stilling,
  Lib2, OUTRO,
]);

// The Unison-mode loop, Jinhsi's double-Intro shape. The Answering pre-visit: the Intro (its
// Manifold form off a response or a held Source Intent) chains into Stage 3, the Skill into Stage
// 4, Realm Protector spends the Heart and Formshift's Unison pays the outro that hands the field
// back. Her return is in Illumining Form: that Intro lands her in Dominion at 300 Heart, its four
// stages spend it, Stilling closes Dominion and Pillars Across Heaven ends the visit on a real bar.
const HS_ROTATION_UNISON = new Rotation([
  DOUBLE_INTRO, BA3, BA4, Skill, BA4, RealmProtector, 
  Lib1, OUTRO,

  INTRO, 
  ECHO_ONFIELD, PillarsAligned, FBA1234, ISkill, FBA4,Stilling,
  Lib2, OUTRO,
]);

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build in Electro Flare mode: resonator + talents + both Inherent Skills, her own
// rectifier and echo, the two Electro Flare sonatas, mainstat/substat
export const HSIN_FLARE = new Loadout({
  resonator: HSIN_RESONATOR,
  talent: HSIN_TALENTS,
  inherent1: HS_INHERENT_1,
  inherent2: HS_INHERENT_2,
  weapons: [BLOOMING_JADEHAVEN, COSMIC_RIPPLES, STRINGMASTER, LETHEAN_ELEGY, FREEZE_FRAME],
  echoLoadouts: [new EchoLoadout(STAY_TUNED, SWORN_VIGIL_5PC), new EchoLoadout(STAY_TUNED, ELECTRIC_REFLECTION_5PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Electro3, Mainstat.ATK1),
  substat: chem("atk", "skill"),
  rotation: HS_ROTATION_FLARE,
  mode: MODE_FLARE,
});

export const HSIN_UNISON = new Loadout({
  resonator: HSIN_RESONATOR,
  talent: HSIN_TALENTS,
  inherent1: HS_INHERENT_1,
  inherent2: HS_INHERENT_2,
  weapons: [BLOOMING_JADEHAVEN, COSMIC_RIPPLES, STRINGMASTER, LETHEAN_ELEGY, FREEZE_FRAME],
  echoLoadouts: [new EchoLoadout(STAY_TUNED, SWORN_VIGIL_5PC), new EchoLoadout(STAY_TUNED, ELECTRIC_REFLECTION_5PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Electro3, Mainstat.ATK1),
  substat: chem("atk", "skill"),
  rotation: HS_ROTATION_UNISON,
  mode: MODE_UNISON,
});
