/**
 * The Tune Break system: the break itself, its variants, and the two target-side states around it.
 *
 * The shared off-tune bar lives on the engine (`State.offtune`, banked in kit.ts's own
 * `evaluate()`), and `run()` asks this file what happens when it fills. Everything else about the
 * mechanic is here.
 *
 * There are two states, both ordinary enemy `Debuff`s — nothing about them is special-cased in the
 * engine, so a kit reads them with `stacksOfEnemy()` and they show up in the resonator popover's
 * own enemy-debuff section like any other:
 *
 * - **Shifting** is what a kit puts on the target ahead of time, with `applyRupture()` /
 *   `applyStrain()` / `applyHack()`. Only one can be on a target at once — applying one clears the
 *   others — and it is what decides which variant the next break resolves as.
 * - **Interfered** is what the break leaves behind, one stack per break, of whichever variant it
 *   was. Kits are paid off this: Lynae and Mornye both answer Rupture with a follow-up attack and
 *   read Strain's stack count for a damage bonus.
 *
 * The break itself never changes: it is always the same tune-scaled `Type1.Break` hit, whichever
 * Shifting steered it, because a Tune Break scales off Tune Break. What the Shifting decides is
 * only which Interfered state the break leaves behind. The `Type1.Rupture`-style damage types
 * belong to the *responses* a kit fires off that state — Lynae's Spectral Analysis, Mornye's
 * Particle Jet — not to the break.
 *
 * This file registers itself with the engine on import (see `setTuneBreakResolver`); solver.ts
 * imports it so every path that runs a team has it.
 */
import {
  Action, Debuff, State, Stat, addStat, applyEnemy, currentAction, getStat, queue, revokeEnemy,
  setTuneBreakResolver, stacksOfEnemy, TUNE_BREAK, TUNE_BREAK_SLOT,
} from "./kit.js";

/** The plain break and its bucket are the engine's own (kit.ts), so a run without this file still
 *  breaks — importing this only adds the variants on top. Re-exported so a kit has one place to
 *  import the whole system from. */
export { TUNE_BREAK, TUNE_BREAK_SLOT };

/* -------------------------------------------------------------------- shifting and interfered */

/** What a kit puts on the target to steer the next break. Single-stack: which one is on the target
 *  is the whole of the state. */
export const TUNE_RUPTURE_SHIFTING = new Debuff({ name: "Tune Rupture - Shifting" });
export const TUNE_STRAIN_SHIFTING = new Debuff({ name: "Tune Strain - Shifting" });
export const TUNE_HACK_SHIFTING = new Debuff({ name: "Tune Hack - Shifting" });

/** What a break leaves behind. No cap is enforced here (see CLAUDE.md); a kit that cares reads the
 *  count — and both kits that do also raise the target's own limit by 1, so the cap is theirs. */
export const TUNE_RUPTURE_INTERFERED = new Debuff({ name: "Tune Rupture - Interfered", maxStacks: 1 });
export const TUNE_STRAIN_INTERFERED = new Debuff({ name: "Tune Strain - Interfered", maxStacks: 1 });
export const TUNE_HACK_INTERFERED = new Debuff({ name: "Tune Hack - Interfered", maxStacks: 1 });

/** Each Shifting to the Interfered state a break under it leaves. Ordered, because the resolver
 *  walks it to find whichever Shifting is actually on the target. */
const VARIANTS: { shifting: Debuff; interfered: Debuff }[] = [
  { shifting: TUNE_RUPTURE_SHIFTING, interfered: TUNE_RUPTURE_INTERFERED },
  { shifting: TUNE_STRAIN_SHIFTING, interfered: TUNE_STRAIN_INTERFERED },
  { shifting: TUNE_HACK_SHIFTING, interfered: TUNE_HACK_INTERFERED },
];

/** Put one Shifting on the target, clearing whichever was there — only one at a time. What a kit
 *  calls; there is no engine-side field behind it, just the debuff. */
function applyShifting(shifting: Debuff): void {
  for (const v of VARIANTS) if (v.shifting !== shifting) revokeEnemy(v.shifting);
  applyEnemy(shifting, 1);
}
export const applyRupture = (): void => applyShifting(TUNE_RUPTURE_SHIFTING);
export const applyStrain = (): void => applyShifting(TUNE_STRAIN_SHIFTING);
export const applyHack = (): void => applyShifting(TUNE_HACK_SHIFTING);

/** Queue a kit's answer to the team's break resolving as this variant — called from the kit's own
 *  updateGlobal() so it sees the break whoever is on field (which is also what pins the queued
 *  follow-up to the kit's holder — see kit.ts's own `queue()`). The trigger is the plain break
 *  *plus* the matching Shifting still on the target: the resolver spends it only after the break
 *  has resolved, which is exactly when an updateGlobal runs. */
function tuneResponse(shifting: Debuff, action: Action): void {
  if (currentAction() === TUNE_BREAK && stacksOfEnemy(shifting) > 0) queue(action);
}
export const tuneRuptureResponse = (action: Action): void => tuneResponse(TUNE_RUPTURE_SHIFTING, action);
export const tuneHackResponse = (action: Action): void => tuneResponse(TUNE_HACK_SHIFTING, action);

/** The shared Strain payout: every point of the holder's own Tune Break Boost is +0.12% total
 *  damage per stack of Tune Strain - Interfered on the target. Call it from a gear's convert() —
 *  by then every Tbb contribution (the era's flat 10, kit buffs, gear) has already landed, so the
 *  stat is read live rather than written out by hand. */
export function tuneStrainBonus(): void {
  const interfered = stacksOfEnemy(TUNE_STRAIN_INTERFERED);
  if (interfered > 0) addStat(Stat.TotalDmg, 0.12 * getStat(Stat.Tbb) * interfered);
}

/** Whether the target is under any Shifting at all — what a piece of gear that pays out on
 *  inflicting one reads, rather than caring which (Lynae's own Spectrum Blaster). */
export const isShifted = (): boolean =>
  VARIANTS.some((v) => stacksOfEnemy(v.shifting) > 0);

/* ---------------------------------------------------------------------------- the resolution */

setTuneBreakResolver((state: State) => {
  const variant = VARIANTS.find((v) => state.stacksOfEnemy(v.shifting) > 0);
  return {
    // always the plain break: a Tune Break scales off Tune Break itself whatever Shifting steered
    // it, and the Shifting only decides which Interfered state it leaves. The special damage type
    // belongs to the *responses* a kit fires off that state, not to the break.
    action: TUNE_BREAK,
    slot: TUNE_BREAK_SLOT,
    resolved: () => {
      if (!variant) return;
      // the Shifting is spent steering this break, and the target is left Interfered instead.
      // Written straight to the pools rather than through `applyEnemy()`, which would attribute
      // them to whichever buff happened to be current — this is the engine's own doing, the same
      // way the break itself is nobody's cast.
      state.revokeEnemy(variant.shifting);
      state.addStackEnemy(variant.interfered, 1);
    },
  };
});
