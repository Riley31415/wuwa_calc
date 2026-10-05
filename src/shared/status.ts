/**
 * The shield marker and the six elemental Negative Statuses (Tune Shifting is tunebreak.ts's).
 *
 * Each is an enemy `Debuff` a kit inflicts from `updateDebuffs()`, plus a ladder of dot-scaled
 * `Type.Status` casts, one per stack count — motion values are the migrated sheet's own
 * `Glacio Chafe: 1`..`16` rows, x100 into percent. A dot hit reads no ATK, crit, damage bonus or
 * res/def ignore, only amplification scoped to its own `Subtype` (damage.ts).
 *
 * A rung resolves on whoever is on field, the same way a Tune Break does, so that the one thing it
 * does read is the *acting resonator's* own — Hiyuki's Fine Snow, Frostburn's Self No More. Unlike
 * a Tune Break it also reports as that resonator's damage: they are the one who inflicted the
 * status, so the rung belongs in their column. Active because the resonator really is on field for
 * it: marking it otherwise would have every "lost on switching out" buff on the team drop the
 * moment a rung ticked. It is `triggered` (queued, never
 * named by a rotation), which is what a passive counting real on-field presses tests instead.
 *
 * Frostbite and Implosion key off stack gains, which this engine sees, so they fire themselves.
 * Electromagnetic (every 5s), Wind Erosion (3s) and Light Noise (3s) run on their own clocks
 * (`tick`) and tick themselves.
 *
 * Caps are each Debuff's own `maxStacks`, raised for a fight with `maxStackIncrease()`.
 */
import { Attribute, EnemyStat, Scaling, Stat, Type, Subtype } from "../engine/stats.js";
import { Buff, Debuff } from "../engine/gear.js";
import type { Resonator } from "../engine/gear.js";
import {
  addEnemyStat,
  addStat,
  applied,
  appliedByMe,
  appliedByMember,
  applyEnemy,
  applyCurrent,
  currentHit,
  currentTeam,
  isType,
  queue,
  removeStackEnemy,
  revokeEnemy,
  consume,
  frozenStacks,
  stacksOfEnemy,
  queueOn,
  tickInEnemy,
  asSource,
  setStacksSelf,
  stacksOf,
  withMoment,
  fireHeldGrants,
  currentMember,
  currentFrame,
} from "../engine/context.js";
import { Action } from "../engine/rotation.js";
import type { TeamMember } from "../engine/state.js";

/** A shield going up, on the caster never applied to the team — `applied()` being how many this
 *  hit or cast granted. Display only: never a stat, and never taken off. */
export const SHIELD = new Buff({ name: "Shield", maxStacks: 9999 });

/** The frame a resonator can next gain a shield, held as its stack count so a variant replay
 *  restores it with everything else. */
const SHIELD_READY = new Buff({ name: "Shield Cooldown", maxStacks: 1e9, hidden: true });

/** A shield off the hit (or cast) being evaluated, at a 0.5s (30f) cooldown per resonator. */
export function gainShield(): void {
  const now = currentFrame();
  if (now < stacksOf(SHIELD_READY)) return;
  applyCurrent(SHIELD, 1);
  setStacksSelf(SHIELD_READY, now + 30);
}

/** Healing any resonator in the team never applied to the team only applied on the healer who cast it
 *  many this cast granted. Never a stat. */
export const HEALS = new Buff({ name: "Healed", maxStacks: 9999 });

/** The moment a heal tick lands in, outside any press: no cast, no type, nothing but the heal. */
const HEAL_MOMENT = new Action("Heal");

/** One heal from the current slot, landing on its own (a heal window's tick, `coordinatedBuff`):
 *  the Healed marker, and every "on heal" grant the healer's gear declares answering it. */
export function heal(): void {
  withMoment(HEAL_MOMENT, () => {
    applyCurrent(HEALS, 1);
    fireHeldGrants();
  });
}

/** One status's damage ladder: an Action per stack count, indexed by that count. Index 0 is empty
 *  — no stacks means the status isn't on the target. */
const negativeStatusActions = (name: string, element: Attribute, subtype: Subtype, mvs: number[]): (Action | null)[] =>
  [null, ...mvs.map((mv, i) => new Action(`${name} - ${i + 1} Stack${(i+1)>1 ? "s" : ""}`, {
    element, type: Type.Status, subtype, scaling: Scaling.Dot, bullets: [{ hitFrame: 0, mv: mv }],
  }))];

/** The rung a live stack count names, or null when there is none to fire. Every caller reads the
 *  count off the target at the moment it fires, and that count can sit outside the ladder at both
 *  ends: 0, because a phase runs on the roster captured before the acting cast's own hooks ran and
 *  so still reaches a status whose last stack that cast just spent (Cartethyia's Erosion bursts);
 *  and past the top rung, because a fight's caps are raised (`maxStackIncrease`) with no regard for
 *  how long the ladder is. */
export const negativeStatusRung = (ladder: (Action | null)[], held: number): Action | null =>
  held < 1 ? null : ladder[Math.min(held, ladder.length - 1)]!;



/** Void Annihilation: 25s a stack, cleared when it ends, cap 3 (+12 raisable). No damage of its
 *  own — each stack is 2% DEF reduce. */
export const HAVOC_BANE = new Debuff({
    name: "Havoc Bane", maxStacks: 3, duration: 60 * 25,
    applyStats: ()=> {
        addEnemyStat(EnemyStat.DefReduce, 2*frozenStacks());
    }
});

/** Frostbite (replaces Frost Creep): 15s a stack, refreshed on gain, cap 10; at the cap the stacks
 *  clear and the target freezes 2s — not modelled, this calculator fights a boss.
 *
 *  Calculates once per stack gained, so two at once is two instances at n and n+1, read backwards
 *  off `frozenStacks()`. That is Frost Creep's rule — live Frostbite calculates every gain at the
 *  max-stack rung instead, which is also what Hiyuki's Glacio Bite does with the same ladder: her
 *  own file converts the stacks and fires these rungs itself, and nothing here needs to know. */
export const GLACIO_CHAFE_ACTIONS = negativeStatusActions("Glacio Chafe", Attribute.Glacio, Subtype.GlacioChafe, [
  2450, 4442, 6434, 8426, 10417, 
  12409, 14401, 16393, 18385, 20377,
  27169, 33961, 40753, 
  47546, 54338, 61130,
]);

/** A resonator's own copy of the rungs, filed under a field of theirs (`ActionField`): what their
 *  Glacio Chafe hits read as while they are the one on field, so the table groups them (Lucilla's). */
export const OWN_CHAFE_RUNGS = new Map<Resonator, (Action | null)[]>();

export const GLACIO_CHAFE = new Debuff({
    name: "Glacio Chafe", maxStacks: 10, duration: 60 * 15,
    // each stack this hit laid (every one is laid in updateDebuffs) deals its rung, a bullet-less hit's
    // too, on whoever laid it last (a marker's owner, not the hitter)
    hitGlobal: () => {
        const held = stacksOfEnemy(GLACIO_CHAFE);
        const team = currentTeam();
        const applier = team.slots.find((s) => s.name === team.sourceOf.get(GLACIO_CHAFE)) ?? currentMember();
        const own = team.slots[team.onField] === applier && applier.resonator ? OWN_CHAFE_RUNGS.get(applier.resonator) : undefined;
        const rungs = own ?? GLACIO_CHAFE_ACTIONS;
        for (let n = Math.max(1, held - applied(GLACIO_CHAFE) + 1); n <= held; n++) {
            queueOnApplier(GLACIO_CHAFE, rungs[n]!);
        }
    },
});

/** Implosion: 15s a stack, refreshed on gain, cap 10; reaching the cap calculates in a 3m radius,
 *  0.2s cooldown. */
export const FUSION_BURST_ACTIONS = negativeStatusActions("Fusion Burst", Attribute.Fusion, Subtype.FusionBurst, [
  8400, 15229, 22058, 28888, 35717, 
  42546, 49375, 56204, 63034, 69863,
  93150, 116438, 139726, 
  163013, 186301, 209588,
]);
export const FUSION_BURST = new Debuff({
  name: "Fusion Burst", maxStacks: 10, duration: 60 * 15,
  // A kit's own Fusion Burst DMG instance carries no motion value of its own (Aemeath's Seraphic
  // Duet): what it is worth is the cap rung — a Fusion Burst only ever calculates at the cap,
  // unlike Electro Flare's ticks at the current count (below) — and the kit's own percentage
  // multiplies that. Added from here, sourced to the rung itself ("Fusion Burst - 10 Stacks"),
  // which is where the number comes from; the cap is the fight's (Chisa raises it), not the
  // declared 10.
  applyStats: () => {
    if (!isType(Subtype.FusionBurst) || currentHit().mv !== 0) return;
    const rung = FUSION_BURST_ACTIONS[currentTeam().enemyMax(FUSION_BURST)];
    if (rung) asSource(rung, () => addStat(Stat.AddMv, rung.mv));
  },
  // the burst takes the stacks with it and whatever landed past the cap is lost, so the target
  // rebuilds from empty. Cap is the fight's, not the declared 10. On the hit that filled it (the
  // enemy pool runs last in the phase, after every inflict), credited to whoever laid the last stack.
  updateDebuffs: () => {
    if (frozenStacks() < currentTeam().enemyMax(FUSION_BURST)) return;
    queueOnApplier(FUSION_BURST, FUSION_BURST_ACTIONS[frozenStacks()]!);
    // a consume, which a "when you consume" passive reads (Suisui's Undulating Mist)
    consume(FUSION_BURST, stacksOfEnemy(FUSION_BURST));
  },
});

/** Wind Erosion: 14.8s a stack, refreshed on gain, cap 3; calculates every 3s at the current
 *  count, spending nothing. Same shape as Electro Flare below — its own clock (`tick`), the
 *  14.8s refreshed by every inflict, the tick on whoever last inflicted it.
 *
 *  Two clocks, both on the target. The tick is enemy forte 2, counting half-seconds so a kit that
 *  halves the interval can add its own two on top (Cartethyia's Mandate of Divinity); its
 *  remainder carries rather than zeroing, which is what keeps a doubled clock at a true 1.5s
 *  instead of 2s. The duration is enemy forte 4, counting whole seconds since the last
 *  application — 14.8s taken as 15 — and *any* resonator applying Erosion starts it over, which
 *  is the status's own "refreshed on gain" read across the stack rather than per stack. When it
 *  runs out the whole status goes, and both clocks reset so the next application starts clean.
 *  This is the one Negative Status whose duration is kept: unlike Electro Flare or Spectro
 *  Frazzle, a rotation can easily leave 15s between applications. */
export const AERO_EROSION_ACTIONS = negativeStatusActions("Aero Erosion", Attribute.Aero, Subtype.AeroErosion, [
  4500, 11250, 22500, 
  33750, 45000, 56250, 
  67500, 78750, 90000, 
  101250, 112500, 123750, 
  135000, 146250, 157500,
]);
export const AERO_EROSION: Debuff = new Debuff({
  name: "Aero Erosion", maxStacks: 3, duration: 60 * 14.8,
  display: () => `Aero Erosion x${frozenStacks()} (tick in ${Math.round(tickInEnemy(AERO_EROSION) / 6) / 10}s)`,
  // every 3s of its own clock, at the count it finds — 1.5s while Cartethyia's Mandate of
  // Divinity holds the target (below)
  tick: {
    every: () => (stacksOfEnemy(EROSION_HASTE) ? 90 : 180),
    fire: () => {
      const rung = negativeStatusRung(AERO_EROSION_ACTIONS, stacksOfEnemy(AERO_EROSION));
      if (rung) queueOnApplier(AERO_EROSION, rung);
    },
  },
});
/** Cartethyia's Mandate of Divinity on the target: Aero Erosion's clock runs twice as fast while
 *  it stands. Put up and taken down by her own kit (cartethyia.ts); nameless, so the popover
 *  carries no row for it. */
export const EROSION_HASTE = new Debuff({});

/** Light Noise: 3s a stack, no refresh on gain, cap 10; calculates every 3s at its own count and
 *  drops one stack each time. Its tick clock is enemy forte 3, counting half-seconds so Phoebe's
 *  Silent Prayer can stretch the interval by half (FRAZZLE_SLOWED below); the duration is not
 *  kept, the same way Electro Flare's isn't — every rotation re-inflicts well inside it. The
 *  stack a tick costs is Shimmer's to stop (SHIMMER below). */
const SPECTRO_FRAZZLE_MVS = [
  3000, 5439, 7878, 10317, 12756, 
  15195, 17634, 20073, 22512, 24951,
  33268, 41585, 49902, 
  58219, 66536, 74853,
];
export const SPECTRO_FRAZZLE_ACTIONS = negativeStatusActions("Spectro Frazzle", Attribute.Spectro, Subtype.SpectroFrazzle, SPECTRO_FRAZZLE_MVS);
/** Phoebe's Silent Prayer, the half of it that reaches this file: "extend Spectro Frazzle's
 *  damage interval by 50%" — 3s between ticks becomes 4.5s on the clock below. Nameless, the same way Hsin's FLARE_RETAINED is: one
 *  clause of one kit reaching the status machinery, not a debuff the target's popover lists. */
export const FRAZZLE_SLOWED = new Debuff({});

/** Spectro Rover's Shimmer, laid by Resonating Spin alongside its own two stacks: "Shimmer
 *  prevents Spectro Frazzle stacks from reducing over time", so while it stands a tick still
 *  fires and still costs the target nothing. Hsin's FLARE_RETAINED is the same clause for Electro
 *  Flare — but hers is keyed to entering combat and stands all fight, while this is a real 9s
 *  window. */
export const SHIMMER = new Debuff({ name: "Shimmer", duration: 60 * 9 });

/** Light Noise's own clock: every 3s, 4.5s while Silent Prayer stands, at the count it finds and
 *  a stack less after — none while Shimmer holds the target. */
export const SPECTRO_FRAZZLE: Debuff = new Debuff({
  name: "Spectro Frazzle", maxStacks: 10,
  display: () => `Spectro Frazzle x${frozenStacks()} (tick in ${Math.round(tickInEnemy(SPECTRO_FRAZZLE) / 6) / 10}s)`,
  tick: {
    every: () => (stacksOfEnemy(FRAZZLE_SLOWED) ? 270 : 180),
    fire: () => {
      const rung = negativeStatusRung(SPECTRO_FRAZZLE_ACTIONS, stacksOfEnemy(SPECTRO_FRAZZLE));
      if (!rung) return;
      queueOnApplier(SPECTRO_FRAZZLE, rung);
      if (!stacksOfEnemy(SHIMMER)) removeStackEnemy(SPECTRO_FRAZZLE, 1);
    },
  },
});

/** Heliacal Ember: Zani's own conversion of Spectro Frazzle, and the only reason it sits in this
 *  file rather than in her kit — the sonata that counts it (Eternal Radiance's 10-stack tier) is
 *  echo gear, which never imports a resonator.
 *
 *  Not one of the six below: an Ember is what a Negative Status *became*, and a passive keyed to
 *  "the target holds a Negative Status" must not read it. The Frazzle that turned into one still
 *  counts as inflicted — `applied()` records at the grant, and zani.ts converts a phase later —
 *  and the conversion itself is no consumption, so it takes the stacks off with
 *  `removeStackEnemy`/`revokeEnemy` rather than `consume()`. */
export const HELIACAL_EMBER: Debuff = new Debuff({
  name: "Heliacal Ember", maxStacks: 60,
  // `stacksOfEnemy`, not `frozenStacks()`: this Gear gets borrowed as a stat *source*
  // (`asSource` in zani.ts, for the Outro's per-stack payout) and outside the enemy pool walk
  // a frozen count reads 0, which had the hover claiming the bonus came from no stacks at all.
  display: () => `Heliacal Ember x${stacksOfEnemy(HELIACAL_EMBER)} (next expires in ${Math.round(tickInEnemy(HELIACAL_EMBER) / 6) / 10}s)`,
  // 6s a stack, one stack at a time — no damage, no Blaze. A re-grant keeps the clock's progress,
  // so a stack falls off every 6s however often she re-applies
  tick: { every: 360, fire: () => removeStackEnemy(HELIACAL_EMBER, 1) },
});

/** The conversion's own damage, one row per stack count converted. Turning n Spectro Frazzle into
 *  Embers fires the status's whole ladder as the stacks come off — n, then n-1, all the way down
 *  to 1 — so converting six is worth the 6, 5, 4, 3, 2 and 1-stack rungs together, and this is
 *  that run reported as the single action it looks like in play.
 *
 *  The row carries no motion value of its own: each rung contributes its own, `asSource`d to
 *  itself, so the MV hover lists exactly which counts paid for it rather than one opaque total.
 *  Same shape Fusion Burst and Electro Flare use for a kit's own status instance. */
export const HELIACAL_EMBER_ACTIONS: (Action | null)[] = [null, ...SPECTRO_FRAZZLE_MVS.map((_, i) =>
  new Action(`Heliacal Ember - ${i + 1} Stack${i ? "s" : ""}`, {
    element: Attribute.Spectro, type: Type.Status, subtype: Subtype.SpectroFrazzle, scaling: Scaling.Dot,
    // one hit, worth nothing of its own: the rungs below add all of it
    bullets: [{ hitFrame: 0 }],
    applyStats: () => {
      for (let n = i; n >= 0; n--) {
        const rung = SPECTRO_FRAZZLE_ACTIONS[n + 1]!;
        asSource(rung, () => addStat(Stat.AddMv, rung.mv));
      }
    },
  }))];

/** Electromagnetic's two ladders: the tick at its own count, and Electro Rage's extra multiplier
 *  on top of it (the same table). Both fired by ELECTRO_FLARE's own clock below. */
export const ELECTRO_FLARE_DMG = negativeStatusActions("Electro Flare", Attribute.Electro, Subtype.ElectroFlare, [
  5000, 9065, 13130, 17195, 21260, 
  25325, 29390, 33455, 37520, 41585,
  55447, 69308, 83170, 97032, 110893, 124755,
]);

export const ELECTRO_RAGE_ACTIONS = negativeStatusActions("Electro Rage", Attribute.Electro, Subtype.ElectroFlare, [
  5000, 9065, 13130, 17195, 21260, 
  25325, 29390, 33455, 37520, 41585,
  55447, 69308, 83170, 97032, 110893, 124755,
]);
/** What lands past Electro Flare's cap: a second multiplier added onto the next Flare tick, and
 *  cleared by it. Only ever granted through `inflictElectroFlare()` below. */
export const ELECTRO_RAGE = new Debuff({ name: "Electro Rage", maxStacks: 10 });

/** Hsin's hold on the target: while it stands a Flare tick fires at the count it finds and spends
 *  none of it. "When Hsin enters combat, targets within a certain range do not lose Electro Flare
 *  stacks when it's triggered automatically" — keyed to entering combat, so her Electro Flare
 *  mode's own combatStart puts it up (hsin.ts) and nothing ever takes it down. Nameless: this is
 *  how that one clause of her kit reaches this file, not a debuff the target's popover should carry
 *  a row for. Not the mark she calls Fleeting Thunder, which is the cap pin and lives in hsin.ts
 *  with the rest of Heart Manifest. */
export const FLARE_RETAINED = new Debuff({});

/** Electromagnetic Effect: 15s a stack, refreshed on gain, cap 10. Every 5s it calculates at the
 *  current count and halves the stacks (rounded down); what lands past the cap banks as Electro
 *  Rage (cap 10), which adds its own multiplier onto the next calculation and is spent by it.
 *
 *  The 5s is the status's own clock (`tick`), running from the first inflict and untouched by the
 *  refreshes after it. A tick resolves on the slot of whoever last inflicted the status — they are
 *  on field for none of it, but the damage is theirs — so a Buling array ticking through the
 *  DPS's turn still lands in her column. */
export const ELECTRO_FLARE: Debuff = new Debuff({
  name: "Electro Flare", maxStacks: 10, duration: 60 * 15,
  display: () => `Electro Flare x${frozenStacks()} (tick in ${Math.round(tickInEnemy(ELECTRO_FLARE) / 6) / 10}s)`,
  // A kit's own Electro Flare DMG instance carries no motion value of its own (Hsin's Heart of
  // Thunder hits): what it is worth is "the Electro Flare DMG Multiplier corresponding to the
  // current Electro Flare stacks on the target" — the count it finds, the same rung the status's
  // own ticks fire at, not the cap — and the kit's own percentage multiplies that. Added from
  // here, sourced to the rung itself ("Electro Flare - 10 Stacks"), which is where the number
  // comes from. Hsin's own instances land while her cap pin holds the target full, so for her the
  // two read alike; a kit firing one on a target below the cap pays the lower rung.
  applyStats: () => {
    if (!isType(Subtype.ElectroFlare) || currentHit().mv !== 0) return;
    const rung = negativeStatusRung(ELECTRO_FLARE_DMG, frozenStacks());
    if (rung) asSource(rung, () => addStat(Stat.AddMv, rung.mv));
  },
  tick: {
    every: 300,
    fire: () => {
      const held = stacksOfEnemy(ELECTRO_FLARE);
      const rung = negativeStatusRung(ELECTRO_FLARE_DMG, held);
      if (!rung) return;
      queueOnApplier(ELECTRO_FLARE, rung);
      const rage = negativeStatusRung(ELECTRO_RAGE_ACTIONS, stacksOfEnemy(ELECTRO_RAGE));
      if (rage) {
        queueOnApplier(ELECTRO_FLARE, rage);
        revokeEnemy(ELECTRO_RAGE);
      }
      if (!stacksOfEnemy(FLARE_RETAINED)) removeStackEnemy(ELECTRO_FLARE, held - Math.floor(held / 2));
    },
  },
});

/** The one way a kit inflicts Electro Flare: whatever the cap turns away lands as Electro Rage
 *  instead. `applied(ELECTRO_FLARE)` still reads the full amount, so an "on inflicting" passive
 *  pays out on an overflowing hit too. */
export function inflictElectroFlare(n: number): void {
  const before = stacksOfEnemy(ELECTRO_FLARE);
  const over = n - (applyEnemy(ELECTRO_FLARE, n) - before);
  if (over > 0) applyEnemy(ELECTRO_RAGE, over);
}

const NEGATIVE_STATUSES: Debuff[] = [HAVOC_BANE, GLACIO_CHAFE, ELECTRO_FLARE, FUSION_BURST, AERO_EROSION, SPECTRO_FRAZZLE];

/** Did *this kit* inflict any of the six Negative Statuses on the action being evaluated?
 *
 *  `appliedByMe`, not `applied`: every caller is an "on inflicting a Negative Status" passive, and
 *  a marker that inflicts one off a teammate's cast (Chisa's Unseen Snare) is that marker owner's
 *  doing, not the teammate's — their weapon/sonata must not pay out for it. */
/** Fire a status's own rung on whoever put the status there — they are on field for none of it,
 *  but the damage is theirs (a Buling array ticking through the DPS's turn lands in her column).
 *  Falls back to whoever is acting if that resonator is no longer a member to name. */
export function queueOnApplier(status: Debuff, rung: Action): void {
  const source = currentTeam().sourceOf.get(status);
  const applier = currentTeam().slots.find((s) => s.name === source)?.resonator;
  if (applier) queueOn(applier, rung);
  else queue(rung);
}

export const inflictedNegativeStatus = (): boolean => NEGATIVE_STATUSES.some((d) => appliedByMe(d) > 0);

/** Did *anyone* put one of the six on the target this action — what a passive keyed to the whole
 *  team's inflicts reads rather than to its own holder's (Xuanling's Still as Withered Wood), and
 *  the one that survives a marker re-sourcing the status onto its own owner. */
export const anyNegativeStatusInflicted = (): boolean => NEGATIVE_STATUSES.some((d) => applied(d) > 0);

/** Does the target carry any of the six *right now* — what a passive keyed to the target's own
 *  state reads, rather than to what the action being evaluated just put on (Cartethyia's Outro). */
export const hasNegativeStatus = (): boolean => NEGATIVE_STATUSES.some((d) => stacksOfEnemy(d) > 0);

/** The same question about one specific member — for a passive watching the whole team from
 *  updateGlobal (Kumokiri's team half), where "me" is the holder rather than whoever is acting. */
export const inflictedNegativeStatusBy = (member: TeamMember): boolean => NEGATIVE_STATUSES.some((d) => appliedByMember(d, member) > 0);
