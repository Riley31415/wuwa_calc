/**
 * Buling — an electro support/healer. Trigram (Mountain/Thunder, up to 4 held, FIFO) builds off
 * Basic Attack Stage 2 (Mountain) / Stage 4, Mid-air Attack, or Resonance Skill (Thunder); a Heavy
 * Attack spends specific Trigram pairs left-to-right for Minor Yang (Mountain+Thunder, either
 * order) or Minor Yin (two of the same). Holding both at once upgrades Resonance Liberation to
 * Flashing Thunder Spell: Harmony, which alone generates the Five Thunders Spell Array and opens
 * Thunder Spell. The rotation below hand-places one specific, kit-valid Trigram/Minor sequence
 * (Mid-air -> Thunder, Basic 12 -> Mountain, Heavy: Thunder Over Mountain -> Minor Yang, Skill ->
 * Thunder, Basic 4 -> Thunder, Heavy: Twin Thunders -> Minor Yin, unlocking Harmony) rather than
 * tracking the Trigram queue live — it's a fixed authored line, not a simulator, so the state
 * machine doesn't need runtime enforcement; each Heavy Attack action is commented with what it
 * spends/grants for reference. Healing (Twin Mountains/Twin Thunders' own heal, Intro's heal,
 * Outro's heal) is out of scope, per the standing rule — both healing-only Heavy Attacks carry
 * 0 mv here for that reason, not a missing number.
 *
 * Thunder Spell: opened (Primordial Qi, stack 1) when the Array generates; the first Intro Skill
 * cast from *any* team member while held escalates everyone to Yin and Yang (stack 2, +10% Skill
 * DMG to whoever's active); the second escalates to Heaven, Earth, Mind (stack 3, +25%, or +50%
 * with S6). Team-wide watcher, same pattern as Phrolova's HECATE_ECHO_WATCH — necessary since the
 * trigger can be anyone's cast. 24s(ish) real duration, past the standing rule's 20s cutoff, so no
 * revoke-on-outro is modelled — treated as permanent for a showcase-length rotation.
 *
 * Sequences 1-6, each its own Gear, all six in the default loadout:
 *  S1 Exorcist Gadgets, Lend Me Your Power — +20% Crit Rate on Flashing Thunder Spell: Harmony
 *     (Liberation) and its own Array, scoped so the hit that earns it is itself paid same-cast.
 *  S2 Talisman Burns, Spirits Turn — 25 Energy on entering Yin-Yang Balance (the state Minor Yin
 *     opens Harmony from), every 24s. No live Trigram state to key off (see above), so this reads
 *     off the two actions the kit itself treats as "reaches Minor Yin" — Twin Mountains/Twin
 *     Thunders — rather than a real state check; the 24s cooldown never matters in a fixed line
 *     that only reaches Minor Yin once.
 *  S3 Summoner of Spirits, Seeker of Fate — heals the team below 50% HP for 350+150% ATK while
 *     the Array lasts. Healing amounts and ally HP are both out of scope, so this is a no-op.
 *  S4 Wanderer of Solaris, Blessed by Fortune — flat +20% Healing Bonus.
 *  S5 Forum Ban? New Account! — the Array inflicts 6 more Electro Flare stacks on generation.
 *     Electro Flare itself (S5's own stacks, the Array's periodic 2-a-tick, Earthly Immortal's 4
 *     on Intro-hit) is left as a bare count on the action (`flare`, see kit.js, mirroring
 *     `shields`) — nothing reads it yet, so getting this one exactly right has no payoff; no-op.
 *  S6 "Almighty Forum Lord of Thunder Spell" — Thunder Spell - Heaven, Earth, Mind grants 50%
 *     Resonance Skill DMG Bonus instead of 25% — read directly by THUNDER_SPELL below.
 *
 * Numbers from nanoka.cc (character 1307, https://ww.nanoka.cc/character/1307), cross-checked against the migrated sheet's `buling`
 * rotation, which this follows — except the sheet's own trailing `Echo: Fallacy` / `FLib field *
 * 12` land *after* its `Outro` entry; since this engine's Outro ends the resonator's own turn and
 * hands the active slot to the next teammate, both are reordered to land before Outro instead so
 * they still resolve as Buling's own hits. The sheet's `Electro Flare: N` lines are its own
 * running-stack annotations, not real actions — skipped, matching the unread `flare` count above.
 * Flashing Thunder Spell's Concerto Regen: the sheet gives 28 for both Liberation forms; nanoka's
 * own text says 20 for the plain one (no figure given separately for Harmony) — nanoka trusted
 * per the standing rule, flagged here since the two disagree outright rather than one filling a
 * gap in the other. The Array's own energy/mv (`ACTION_FIVE_THUNDERS_ARRAY`) use the sheet's own
 * `FLib field * 12` totals (full 12-tick lifetime), not a single tick — nanoka's one-tick number
 * given inline below for reference, but the sheet's total is what's actually placed.
 */
import { Buff, GlobalBuff, Gear, Action, Chain, PRIORITY, ECHO_CAST } from "../kit.js";
import type { ActionDef } from "../kit.js";
import { Resonator, Loadout, isIntro } from "../state.js";
import type { ResonatorFactory } from "../state.js";
import { Stat, Element, Type1, Node, Resource, Cast, Scaling } from "../stats.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";
import { VARIATION } from "../weapons/standard.js";
import { FALLACY, REJUV_5PC, REJUV_2PC } from "../echoes/jinzhou.js";

/** This resonator's own color — every action from the wrapper below defaults to it. */
export const COLOR = "#7a6ff0";

/* ------------------------------------------------------------------- sequences */

/** S1 Exorcist Gadgets, Lend Me Your Power: +20% Crit Rate on Flashing Thunder Spell: Harmony —
 *  scoped to Liberation damage, so both her own Liberation cast and the Array it queues (both
 *  `type: LIB`) pick it up without a trigger. */
export const S1 = new Gear("Buling S1", (ctx) => { ctx.add(20, Type1.Liberation, Stat.CritRate); });

/** S2 Talisman Burns, Spirits Turn: 25 Energy on entering Yin-Yang Balance, every 24s — read
 *  directly by Twin Mountains/Twin Thunders below, since this file doesn't simulate live Trigram
 *  state (see file header) and those two are already the kit's own "reaches Minor Yin" actions. */
export const S2 = new Gear("Buling S2");

/** S3 Summoner of Spirits, Seeker of Fate: heals the team below 50% HP for 350+150% ATK while
 *  the Array lasts — no-op. Healing amounts and ally HP are both out of scope. */
export const S3 = new Gear("Buling S3");

/** S4 Wanderer of Solaris, Blessed by Fortune: flat +20% Healing Bonus — unused by the formula
 *  (healing is out of scope), tracked for completeness only. */
export const S4 = new Gear("Buling S4", (ctx) => { ctx.add(20, Stat.HealingBonus); });

/** S5 Forum Ban? New Account!: the Array inflicts 6 more Electro Flare stacks on generation —
 *  no-op. Nothing reads Electro Flare stacks yet (see file header), so the exact count has no
 *  payoff to get right. */
export const S5 = new Gear("Buling S5");

/** S6 "Almighty Forum Lord of Thunder Spell": Thunder Spell - Heaven, Earth, Mind grants 50%
 *  Resonance Skill DMG Bonus instead of 25% — read directly by THUNDER_SPELL below. */
export const S6 = new Gear("Buling S6");

/** Cosmic Ripples, her own top-recommended weapon — no deeper research on its own passive done
 *  this pass, just the base stat line. Mainslot Fallacy, full 5pc Rejuvenating Glow — both
 *  generic gear, imported from echoes/jinzhou.js. Default loadout carries all six sequences,
 *  passed as `sequences` below — nothing distinguishes how either gets equipped. */
const BULING_LOADOUT = new Loadout(
  VARIATION, FALLACY, REJUV_5PC, REJUV_2PC,
  mainstats("CD", "ER ER", "atk atk"), chem("atk", "liberation", { er: true }),
);

export class Buling extends Resonator {
  constructor(loadout: Loadout) {
    super(
      "Buling",
      Element.Electro,
      () => Intro,
      loadout,
      (ctx) => {
        ctx.add(10625, Stat.BaseHp);
        ctx.add(225, Stat.BaseAtk);
        ctx.add(1259, Stat.BaseDef);
      },
      (ctx) => {
        ctx.add(12, Stat.BonusAtk);   // In Shadow Thunder Stirs (Skill) B2/B4 + Flashing Thunder Spell (Lib) B2/B4 ATK+ nodes
        ctx.add(12, Stat.HealingBonus); // stat-tree Healing Bonus+ nodes, 1.8+1.8+4.2+4.2 — unused
                                     // by the formula (healing is out of scope), tracked for
                                     // completeness only. Her Inherent Skill "Time Arrives, Evil
                                     // Declines" (+25% Healing Bonus while healing an ally under
                                     // 50% HP) isn't modelled — no ally-HP tracking here, same as
                                     // every other untracked-state skip.
      },
      null,
      null,
      [S1, S2, S3, S4, S5, S6],
    );
    this.alwaysUnlocked = true;
  }
}
export const LOADOUT: ResonatorFactory = () => new Buling(BULING_LOADOUT);

/** Thunder Spell: 1 buff, 3 stacks, named for whichever state it currently is. Opened by
 *  Liberation. Global so any teammate's Intro can advance it — self-included, since Buling
 *  casting her own Intro counts too. Only the top two stacks' own DMG Bonus is scoped to
 *  whoever's currently active, per the kit's own "active Resonators" wording. */
export const THUNDER_SPELL = new GlobalBuff(PRIORITY.BUFF_STATS, (ctx, stacks) => {
  const a = ctx.action!;
  if (isIntro(a) && stacks < 3) ctx.grantGlobal(THUNDER_SPELL);
  // re-read live: `stacks` is this call's pre-increment snapshot, stale the instant the grant
  // above just moved it
  const held = ctx.stacksOf(THUNDER_SPELL);
  if (a.active) {
    if (held === 2) ctx.add(10, Type1.Skill, Stat.DmgBonus);
    else if (held >= 3) ctx.add(ctx.stacksOf(S6) ? 50 : 25, Type1.Skill, Stat.DmgBonus);
  }
  if (held >= 3) {
    if (ctx.stacksOf(S6)) {
        return "Buling: Thunder Spell - Heaven, Earth, Mind S6";
    }
    return "Buling: Thunder Spell - Heaven, Earth, Mind";
  }
  if (held === 2) return "Buling: Thunder Spell - Yin and Yang";
  return "Buling: Thunder Spell - Primordial Qi";
}, 3);

/* ----------------------------------------------------------------- actions */

function bulingAction(name: string, def: ActionDef): Action {
  return new Action(name, {
    element: Element.Electro,
    scaling: Scaling.Atk,
    ...def,
  });
}

// --- intro / outro
const Intro = bulingAction("Intro: Summon and Smite", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 131.10, energy: 0, concerto: 1000, flare: 4,
});
const Outro = bulingAction("Outro: Exorcism Spell", {
  cast: Cast.Outro, mv: 0, concerto: -10000, active: false,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.queue(ACTION_FIVE_THUNDERS_ARRAY); ctx.grantGlobal(BULING_OUTRO); },
});
/** Exorcism Spell: +15% (unscoped) DMG Amplified, 30s — past the standing 20s cutoff, so treated
 *  as permanent uptime rather than lost on the receiving resonator's own outro. */
export const BULING_OUTRO = new GlobalBuff(PRIORITY.BUFF_STATS, (ctx) => { ctx.add(15, Stat.Amp); return "Buling: Outro"; });

// --- resonance skill: grants a Thunder Trigram
const Skill = bulingAction("Skill: In Shadow Thunder Stirs", {
  node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 116.8, energy: 1500, concerto: 2300,
});

// --- resonance liberation: Flashing Thunder Spell, assumed always cast as Harmony (see file
//     header) — generates the Array, opening Thunder Spell at Primordial Qi. A fresh Array
//     replaces whatever stage the last one reached, hence the explicit stack: 1.
export const Liberation = bulingAction("Liberation: Flashing Thunder Spell - Harmony", {
  node: Node.Liberation, cast: Cast.Liberation, type: Type1.Liberation, mv: 536.79, energy: -15000, concerto: 2000,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.setStacksGlobal(THUNDER_SPELL, 1); },
});

/** Five Thunders Spell Array: the sheet's own full 12-tick lifetime total (238.32% mv, 25 energy,
 *  24 Electro Flare stacks) rather than one representative tick — see file header. Nanoka's own
 *  single-tick number is 19.89% mv for reference. */
export const ACTION_FIVE_THUNDERS_ARRAY = bulingAction("Five Thunders Spell Array x12", {
  type: Type1.Liberation, mv: 238.32, energy: 2500, flare: 24, active: false,
});

// --- normal attacks: four basics, a mid-air, a dodge counter — Stage 2/4 (and Mid-air, Skill
//     above) are what grant Trigrams, commented per hit
const BA1 = bulingAction("Basic: Hexagram Calls, Lightning Falls 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 41.46, energy: 106, concerto: 334 });
const BA2 = bulingAction("Basic: Hexagram Calls, Lightning Falls 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 66.9, energy: 170, concerto: 540 });     // grants Trigram: Mountain
const BA3 = bulingAction("Basic: Hexagram Calls, Lightning Falls 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 47.02, energy: 120, concerto: 380 });
const BA4 = bulingAction("Basic: Hexagram Calls, Lightning Falls 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 93.64, energy: 472, concerto: 1508 }); // grants Trigram: Thunder
export const MA = bulingAction("Basic: Hexagram Calls, Lightning Falls (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 73.96, energy: 124, concerto: 496 }); // grants Trigram: Thunder
export const DC = bulingAction("Basic: Hexagram Calls, Lightning Falls 3 (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 47.02, energy: 120, concerto: 1380 });

export const BA12 = new Chain("Basic: Hexagram Calls, Lightning Falls 12", [BA1, BA2]);
export const BA1234 = new Chain("Basic: Hexagram Calls, Lightning Falls 1234", [BA1, BA2, BA3, BA4]);

// --- heavy attacks: spend specific Trigram pairs left-to-right for a Minor state
export const HA_MOUNTAIN_OVER_THUNDER = bulingAction("Heavy: Mountain Over Thunder",
  { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 178.93, energy: 300, concerto: 1500 });   // spends Mountain+Thunder -> Minor Yang
export const HA_THUNDER_OVER_MOUNTAIN = bulingAction("Heavy: Thunder Over Mountain",
  { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 89.47, energy: 300, concerto: 1500 });    // spends Thunder+Mountain -> Minor Yang
// spends Mountain+Mountain/Thunder+Thunder -> Minor Yin; healing only. Both are the kit's own
// "reaches Minor Yin" (Yin-Yang Balance) actions — S2's Energy restore reads off them directly.
export const HA_TWIN_MOUNTAINS = bulingAction("Heavy: Twin Mountains", {
  node: Node.Normal, cast: Cast.Heavy, mv: 0, energy: 0, concerto: 1500, heal: 1,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { if (ctx.stacksOf(S2)) ctx.gain(Resource.Energy, 2500); },
});
export const HA_TWIN_THUNDERS = bulingAction("Heavy: Twin Thunders", {
  node: Node.Normal, cast: Cast.Heavy, mv: 0, energy: 0, concerto: 1500, heal: 1,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { if (ctx.stacksOf(S2)) ctx.gain(Resource.Energy, 2500); },
});

/** The migrated sheet's `buling` rotation, values and order both cross-checked — except the
 *  Array tick is no longer placed by hand: Outro's own apply() queues it now (see Outro above),
 *  matching Cantarella's Diffusion. Mid-air opens with a Thunder Trigram; Basic 12 adds Mountain;
 *  Heavy: Thunder Over Mountain spends both for Minor Yang; Skill and Basic 4 each add a fresh
 *  Thunder; Heavy: Twin Thunders spends both for Minor Yin — Yin and Yang together unlock Harmony
 *  for the Liberation that follows. Intro is no longer placed here — the preceding member's
 *  outro triggers it (see `onIntro`). */
export const ROTATION = [
  MA, BA12, HA_THUNDER_OVER_MOUNTAIN,
  Skill, BA4, HA_TWIN_THUNDERS, ECHO_CAST,
  Liberation, Outro,
];
