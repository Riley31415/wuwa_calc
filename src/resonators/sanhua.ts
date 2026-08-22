/**
 * Sanhua, ported to the new engine — sequence-0 core loop, but a 4-star `standardCharacter: true`
 * (see kit.ts's own doc comment on the flag), so all six of her sequence nodes are folded into her
 * loadout unconditionally, each its own always-equipped gear piece (`SANHUA_S1`-`SANHUA_S6`) that
 * owns its own trigger logic — the central Resonator's own update() only ever handles her base/
 * Inherent-Skill kit, nothing sequence-specific: S1 Solitude's Embrace (Basic 5 grants +15% Crit
 * Rate, 10s), S2 Snowy Clarity (a STA-cost/interruption-resistance node, no damage-relevant
 * effect — a genuine no-op, not modelled), S3 Anomalous Vision (+35% DMG vs sub-70% HP targets —
 * no enemy-HP tracking here, so modelled as a flat +24.5% DMG Bonus, 35% at an assumed 70%
 * uptime, per established precedent), S4 Blade Mastery (Liberation arms a one-shot +120% DMG
 * Bonus for the very next Detonate), S5 Unraveling Fate (+100% Crit DMG on Ice Burst; grants a
 * *second* Glacier stack on top of Liberation's own base 1 — see its own comment on why this
 * really does fire the Ice Burst twice, not a bug here), and S6 Daybreak Radiance (detonating an
 * Ice Prism or Glacier grants the *other* two team members +10% ATK — team-wide, lost on her own
 * next Intro rather than tracked as truly permanent, same shape as Verina's Gift of Nature).
 *
 * Her Forte Circuit (Heavy Attack - Detonate) bursts whichever Ice Creations are up — Ice Thorn
 * (from her Intro), Ice Prism (from her Skill), Glacier (from her Liberation, doubled by S5) —
 * each its own stackable marker buff Detonate's own update() reads and consumes, queueing the
 * matching burst hit(s) rather than having them placed by hand. Clarity stacks (gating the
 * Detonate release-window size) are pure gameplay timing, not a damage modifier, so they aren't
 * tracked.
 *
 * Numbers from nanoka.cc (character 1102, https://ww.nanoka.cc/character/1102) — every action's
 * own MV/energy/concerto/offtune delta ported from the migrated (old-engine) sheet, which already
 * cites the same character page.
 */
import {
  Buff, Resonator, Action, ECHO_CAST, INTRO, Stat, Element, WeaponType, Type1, Cast, Node, Scaling,
  applySelf, applyTeam, revokeTeam, isHeld, stacksOf, removeStack, revoke, casting, currentAction,
  addStat, stacks, queue, queueOutro,
} from "../kit.js";
import { EMERALD_OF_GENESIS } from "../weapons/standard.js";
import { HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC } from "../echoes/jinzhou.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";

/* ------------------------------------------------------------------------------------ buffs */

/** Condensation (Inherent Skill): +20% Resonance Skill DMG for 8s after casting Intro Skill
 *  Freezing Thorns — short enough that only the standing outro-loss rule matters. */
export const CONDENSATION = new Buff({
  name: "Sanhua: Condensation",
  apply: () => addStat(Stat.DmgBonus, 20, Type1.Skill),
  convert: () => { if (casting(Cast.Outro)) revoke(CONDENSATION); },
});

/** Avalanche (Inherent Skill): +20% Ice Burst DMG for 8s after casting Basic Attack 5. Scoped by
 *  checking the three Ice Burst actions directly rather than a Type2 tag — she deals Ice Burst
 *  DMG, not Fusion Burst DMG, so Type2.FusionBurst (Fusion's own elemental proc type, coincidence
 *  of the English name only) doesn't actually apply here. */
export const AVALANCHE = new Buff({
  name: "Sanhua: Avalanche",
  apply: () => {
    const a = currentAction();
    if (a === DETONATE_THORN || a === DETONATE_PRISM || a === DETONATE_GLACIER) addStat(Stat.DmgBonus, 20);
  },
  convert: () => { if (casting(Cast.Outro)) revoke(AVALANCHE); },
});

/** S1 Solitude's Embrace: Basic Attack 5 grants +15% Crit Rate, 10s. Trigger lives in its own
 *  gear piece (`SANHUA_S1`, below the Ice Creation markers) per the standing "all sequence logic
 *  lives in the sequence piece" rule — S1_CRIT itself is just the granted/revoked window. */
export const S1_CRIT = new Buff({
  name: "Sanhua S1: Solitude's Embrace",
  apply: () => addStat(Stat.CritRate, 15),
  convert: () => { if (casting(Cast.Outro)) revoke(S1_CRIT); },
});

/** S4 Blade Mastery: arms a one-shot +120% DMG Bonus for the very next Detonate — consumed the
 *  instant it lands (still pays out that same action: convert() revokes only after apply() has),
 *  or lost on outro if Detonate never comes. Trigger lives in `SANHUA_S4`. */
export const S4_WINDOW = new Buff({
  name: "Sanhua S4: Blade Mastery",
  apply: () => { if (currentAction() === FHA) addStat(Stat.DmgBonus, 120); },
  convert: () => { if (currentAction() === FHA || casting(Cast.Outro)) revoke(S4_WINDOW); },
});

/** S6 Daybreak Radiance: detonating an Ice Prism or a Glacier grants the *other* two team members
 *  +10% ATK — team-wide (`applyTeam`, triggered from `SANHUA_S6` below), excluding Sanhua's own
 *  actions via `isHeld(SANHUA)` since the real effect explicitly isn't for her. Lost on her own
 *  next Intro rather than tracked as truly permanent — the standing "short team buff, lost on the
 *  applier's next intro" rule, same shape as Verina's own Gift of Nature. */
export const S6_ATK = new Buff({
  name: "Sanhua S6: Daybreak Radiance", maxStacks: 2,
  apply: () => { if (!isHeld(SANHUA)) addStat(Stat.BonusAtk, 10 * stacks()); },
  convert: () => { if (casting(Cast.Intro) && isHeld(SANHUA)) revokeTeam(S6_ATK); },
});

/** Ice Creations: one stackable marker buff each, granted by the cast that makes them (Intro ->
 *  Thorn, Skill -> Prism, Liberation -> Glacier, doubled by S5) and consumed by Detonate's own
 *  update() below, which queues the matching burst(s) rather than having them placed by hand. No
 *  stat of their own, so the update-vs-convert phase doesn't matter for payout — convert() used
 *  throughout for consistency with every other outro-loss buff. */
export const THORN_BUFF = new Buff({
  name: "Sanhua: Ice Thorn", convert: () => { if (casting(Cast.Outro)) revoke(THORN_BUFF); },
});
export const PRISM_BUFF = new Buff({
  name: "Sanhua: Ice Prism", convert: () => { if (casting(Cast.Outro)) revoke(PRISM_BUFF); },
});
export const GLACIER_BUFF = new Buff({
  name: "Sanhua: Glacier", maxStacks: 2, convert: () => { if (casting(Cast.Outro)) revoke(GLACIER_BUFF); },
});

/* -------------------------------------------------------------------------------- sequences */
// All six live here as their own always-equipped gear pieces (standardCharacter — see file
// header); every trigger a sequence needs lives in its own piece rather than the central
// Resonator update() below, which only ever handles her base/Inherent-Skill kit.

export const SANHUA_S1 = new Buff({
  name: "Sanhua S1: Solitude's Embrace",
  update: () => { if (currentAction() === BA5) applySelf(S1_CRIT, 1); },
});

// S2 Snowy Clarity: a STA-cost/interruption-resistance node, no damage-relevant effect — a
// do-nothing gear piece, held for the name only (see file header)
export const SANHUA_S2 = new Buff({ name: "Sanhua S2: Snowy Clarity" });

// S3 Anomalous Vision: a flat piece of her own kit, no separate trigger needed
export const SANHUA_S3 = new Buff({
  name: "Sanhua S3: Anomalous Vision", apply: () => addStat(Stat.DmgBonus, 24.5),
});

export const SANHUA_S4 = new Buff({
  name: "Sanhua S4: Blade Mastery",
  update: () => { if (currentAction() === Liberation) applySelf(S4_WINDOW, 1); },
});

/** S5 Unraveling Fate: +100% Crit DMG on Ice Burst, and grants the *second* Glacier stack — the
 *  base 1 is Liberation's own unconditional grant in SANHUA's central update() below. Detonate's
 *  own central loop then queues one Ice Burst hit per Glacier stack currently held, so a single
 *  Liberation cast under S5 genuinely fires Glacial Gaze's own burst twice over. Confirmed against
 *  the real game, not a modelling slip — this is a real (if easy to mistake for a bug) doubling
 *  in Wuthering Waves itself, kept faithfully rather than smoothed down to a single hit. */
export const SANHUA_S5 = new Buff({
  name: "Sanhua S5: Unraveling Fate",
  // same direct-action scoping as Avalanche above, not Type2.FusionBurst — see its own comment
  apply: () => {
    const a = currentAction();
    if (a === DETONATE_THORN || a === DETONATE_PRISM || a === DETONATE_GLACIER) addStat(Stat.CritDmg, 100);
  },
  update: () => { if (currentAction() === Liberation) applySelf(GLACIER_BUFF, 1); },
});

export const SANHUA_S6 = new Buff({
  name: "Sanhua S6: Daybreak Radiance",
  update: () => {
    if (currentAction() === DETONATE_PRISM || currentAction() === DETONATE_GLACIER) applyTeam(S6_ATK, 1);
  },
});

export const SANHUA_OUTRO = new Buff({
  name: "Sanhua: Outro",
  apply: () => addStat(Stat.Amp, 38, Type1.Basic),
  convert: () => { if (casting(Cast.Outro)) revoke(SANHUA_OUTRO); },
});

/* ----------------------------------------------------------------------------------- actions */

function sanhuaAction(id: string, def: object): Action {
  return new Action(id, { element: Element.Glacio, scaling: Scaling.Atk, ...def });
}

// --- intro / outro
export const Intro = sanhuaAction("Intro - Freezing Thorns", { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 139.17, energy: 10, concerto: 10, offtune: 2800 });
export const Outro = sanhuaAction("Outro - Silversnow", { cast: Cast.Outro, active: false });

// --- resonance skill (creates Ice Prism) and liberation (creates 2 Glacier stacks — S5 — and
//     refunds 10 Energy while arming Blade Mastery — S4, both unconditional: standardCharacter)
export const Skill = sanhuaAction("Skill - Eternal Frost", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 359.85, energy: 10, concerto: 15 });
export const Liberation = sanhuaAction("Liberation - Glacial Gaze", { node: Node.Liberation, cast: Cast.Liberation, type: Type1.Liberation, mv: 809.48, energy: 10, concerto: 20 });

// --- normal attacks: five basics, a heavy, a mid-air
export const BA1 = sanhuaAction("Basic - Frigid Light 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 48.71, energy: 0.87, concerto: 2, offtune: 4340 });
export const BA2 = sanhuaAction("Basic - Frigid Light 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 73.76, energy: 1.32, concerto: 4, offtune: 4960 });
export const BA3 = sanhuaAction("Basic - Frigid Light 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 86.32, energy: 1.52, concerto: 8, offtune: 4560 });
export const BA4 = sanhuaAction("Basic - Frigid Light 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 79.34, energy: 1.42, concerto: 8, offtune: 13440 });
export const BA5 = sanhuaAction("Basic - Frigid Light 5", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 233.81, energy: 4.2, concerto: 10, offtune: 9520 });
export const HA = sanhuaAction("Heavy - Frigid Light", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 111.35, energy: 2, concerto: 8, offtune: 8000 });
export const MA = sanhuaAction("Basic - Frigid Light (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 86.29, energy: 0.51, concerto: 1, offtune: 8000 });

// --- forte circuit: Detonate itself (Heavy Attack DMG), then Ice Burst on whichever Ice
//     Creations are up (Resonance Skill DMG; Avalanche/S5 scope onto these three directly rather
//     than a Type2 tag — Ice Burst isn't Type2.FusionBurst, that's Fusion's own elemental proc
//     type, a coincidence of the English name only). The Ice Thorn burst is a real exception, not
//     a data gap: it pays 0 concerto (every other burst pays 1500), just 200 Energy — kept as
//     given rather than smoothed over.
export const FHA = sanhuaAction("Forte Heavy - Detonate", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 372.58, energy: 4.68, concerto: 15 });
export const DETONATE_THORN = sanhuaAction("Forte - Ice Burst (Thorn)", { node: Node.Normal, type: Type1.Skill, mv: 59.65, energy: 2, concerto: 0, active: false });
export const DETONATE_PRISM = sanhuaAction("Forte - Ice Burst (Prism)", { node: Node.Normal, type: Type1.Skill, mv: 79.53, energy: 7, concerto: 15, active: false });
export const DETONATE_GLACIER = sanhuaAction("Forte - Ice Burst (Glacier)", { node: Node.Normal, type: Type1.Skill, mv: 139.17, energy: 7, concerto: 15, active: false });

/** Her, as a Resonator: name/element/weapon, every grant/spend/queue rule her kit needs, and her
 *  own base stat line. `standardCharacter: true` — see the file header. The stat-tree talent
 *  bonus and every sequence node live in their own separate Buffs above — just more pieces of her
 *  loadout, not special-cased on the Resonator itself. */
export const SANHUA = new Resonator({
  name: "Sanhua",
  element: Element.Glacio,
  weapon: WeaponType.Sword,
  intro: () => Intro,
  color: "#5fc9e8",
  maxEnergy: 12500,
  standardCharacter: true,

  // base/Inherent-Skill kit only — every sequence's own trigger lives in its own gear piece
  // (SANHUA_S1-S6, above), not here. Liberation's own Glacier grant is just the base 1 stack;
  // S5's own piece adds the second on top (see its own comment for why that's not a bug).
  update: () => {
    const a = currentAction();
    if (a === Intro) { applySelf(CONDENSATION, 1); applySelf(THORN_BUFF, 1); }
    if (a === BA5) applySelf(AVALANCHE, 1);
    if (a === Skill) applySelf(PRISM_BUFF, 1);
    if (a === Liberation) applySelf(GLACIER_BUFF, 1);
    if (a === FHA) {
      if (stacksOf(THORN_BUFF)) { queue(DETONATE_THORN); removeStack(THORN_BUFF, 1); }
      if (stacksOf(PRISM_BUFF)) { queue(DETONATE_PRISM); removeStack(PRISM_BUFF, 1); }
      const glaciers = stacksOf(GLACIER_BUFF);
      for (let i = 0; i < glaciers; i++) queue(DETONATE_GLACIER);
      if (glaciers) removeStack(GLACIER_BUFF, glaciers);
    }
    if (a === Outro) queueOutro(SANHUA_OUTRO);
  },

  apply: () => {
    addStat(Stat.BaseHp, 10063); addStat(Stat.BaseAtk, 275); addStat(Stat.BaseDef, 941);
    addStat(Stat.Er, 100); addStat(Stat.CritRate, 5); addStat(Stat.CritDmg, 150);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
export const SANHUA_TALENTS = new Buff({
  name: "Sanhua: Talents",
  apply: () => { addStat(Stat.BonusAtk, 12); addStat(Stat.DmgBonus, 12, Element.Glacio); },
});

/** Skill/Liberation come first so Condensation (opened by Intro) covers the Skill cast; the
 *  basics chain ends on Basic 5 so Avalanche (and S1's Crit Rate) are up for the Detonate that
 *  follows it, and Blade Mastery's window (S4) still covers that same Detonate. She's never the
 *  team's own lead, so unlike a first-position member's own opener, this same rotation covers
 *  both. */
export const SH_ROTATION = [
  INTRO, Skill, Liberation, FHA, ECHO_CAST, Outro,
];

/* ----------------------------------------------------------------------------------- loadout */

// her real build: resonator + talents + every sequence node (standardCharacter — see file
// header), weapon, mainslot echo, sonata pieces, mainstat/substat
export const SH_LOADOUT = [
  SANHUA, SANHUA_TALENTS, SANHUA_S1, SANHUA_S2, SANHUA_S3, SANHUA_S4, SANHUA_S5, SANHUA_S6,
  EMERALD_OF_GENESIS,
  HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC,
  mainstats("CD", "glacio glacio", "atk atk"), chem("atk", "skill"),
];
