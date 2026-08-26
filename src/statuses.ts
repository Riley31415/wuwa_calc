/**
 * The shield marker and the six elemental Negative Statuses (Tune Shifting is tunebreak.ts's).
 *
 * Each is an enemy `Debuff` a kit inflicts from `updateDebuffs()`, plus a ladder of dot-scaled
 * `Type1.Status` casts, one per stack count — motion values are the migrated sheet's own
 * `Glacio Chafe: 1`..`16` rows, x100 into percent. A dot hit reads no ATK, crit, damage bonus or
 * res/def ignore, only amplification scoped to its own `Type2` (damage.ts).
 *
 * Frostbite and Implosion key off stack gains, which this engine sees, so they fire themselves.
 * Wind Erosion (every 3s), Electromagnetic (5s) and Light Noise (3s) run on a clock there is none
 * of here: ladder and stack spend are in place, nothing triggers them, and a rotation can name a
 * rung directly meanwhile — how the migrated sheet placed its ticks.
 *
 * Caps are each Debuff's own `maxStacks`, raised for a fight with `maxStackIncrease()`.
 */
import {
  Action, Attribute, Buff, Debuff, EnemyStat, MISC_SLOT, Scaling, Type1, Type2,
  addEnemyStat, applied, applyEnemy, currentAction, currentTeam, queue, removeStackEnemy, revokeSelf, revokeEnemy,
  frozenStacks, stacksOfEnemy,
} from "./kit.js";

/** A shield going up, on the caster never applied to the team `applied()` being how
 *  many this cast granted. Never a stat. */
export const SHIELD = new Buff({
    name: "Shield", maxStacks: 9999,
    convertStats: ()=> revokeSelf(SHIELD),
});

/** Healing any resonator in the team never applied to the team only applied on the healer who cast it
 *  many this cast granted. Never a stat. */
export const HEALS = new Buff({
    name: "Healed", maxStacks: 9999,
    convertStats: ()=> revokeSelf(HEALS),
});

/** One status's damage ladder: an Action per stack count, indexed by that count. Index 0 is empty
 *  — no stacks means the status isn't on the target. */
const negativeStatusActions = (name: string, element: Attribute, type2: Type2, mvs: number[]): (Action | null)[] =>
  [null, ...mvs.map((mv, i) => new Action(`${name} - ${i + 1} Stack${(i+1)>1 ? "s" : ""}`, {
    element, type: Type1.Status, type2, scaling: Scaling.Dot, mv, active: false, slot: MISC_SLOT,
  }))];



/** Void Annihilation: 25s a stack, cleared when it ends, cap 3 (+12 raisable). No damage of its
 *  own — each stack is 2% DEF reduce. */
export const HAVOC_BANE = new Debuff({
    name: "Havoc Bane", maxStacks: 3,
    applyStats: ()=> {
        addEnemyStat(EnemyStat.DefReduce, 2*frozenStacks());
    }
});

/** Frostbite (replaces Frost Creep): 15s a stack, refreshed on gain, cap 10; at the cap the stacks
 *  clear and the target freezes 2s — not modelled, this calculator fights a boss.
 *
 *  Calculates once per stack gained, so two at once is two instances at n and n+1, read backwards
 *  off `frozenStacks()`. That is Frost Creep's rule — live Frostbite calculates every gain at the
 *  max-stack rung instead. */
export const GLACIO_CHAFE_DMG = negativeStatusActions("Glacio Chafe", Attribute.Glacio, Type2.GlacioChafe, [
  24.5, 44.42, 64.34, 84.26, 104.17, 
  124.09, 144.01, 163.93, 183.85, 203.77,
  271.69, 339.61, 407.53, 
  475.46, 543.38, 611.3,
]);
export const GLACIO_CHAFE = new Debuff({
    name: "Glacio Chafe", maxStacks: 10,
    applyStats: () => { 
        const held = frozenStacks();
        for (let n = Math.max(1, held - applied(GLACIO_CHAFE) + 1); n <= held; n++) {
            queue(GLACIO_CHAFE_DMG[n]!);
        }
    },
});

/** Implosion: 15s a stack, refreshed on gain, cap 10; reaching the cap calculates in a 3m radius,
 *  0.2s cooldown. */
export const FUSION_BURST_DMG = negativeStatusActions("Fusion Burst", Attribute.Fusion, Type2.FusionBurst, [
  84, 152.29, 220.58, 288.88, 357.17, 
  425.46, 493.75, 562.04, 630.34, 698.63,
  931.5, 1164.38, 1397.26, 
  1630.13, 1863.01, 2095.88,
]);
export const FUSION_BURST = new Debuff({
  name: "Fusion Burst", maxStacks: 10,
  // the burst takes the stacks with it and whatever landed past the cap is lost, so the target
  // rebuilds from empty. Cap is the fight's, not the declared 10.
  updateBuffs: () => {
    if (frozenStacks() < currentTeam().enemyMax(FUSION_BURST)) return;
    queue(FUSION_BURST_DMG[frozenStacks()]!);
    revokeEnemy(FUSION_BURST);
  },
});

/** Wind Erosion: 14.8s a stack, refreshed on gain, cap 3; calculates every 3s, spending nothing.
 *  Untriggered — no clock. */
export const AERO_EROSION_DMG = negativeStatusActions("Aero Erosion", Attribute.Aero, Type2.AeroErosion, [
  45, 112.5, 225, 
  337.5, 450, 562.5, 
  675, 787.5, 900, 
  1012.5, 1125, 1237.5, 
  1350, 1462.5, 1575,
]);
export const AERO_EROSION = new Debuff({ name: "Aero Erosion", maxStacks: 3 });

/** Light Noise: 3s a stack, no refresh on gain, cap 10; calculates every 3s, dropping one stack
 *  each time. Untriggered — no clock. */
export const SPECTRO_FRAZZLE_DMG = negativeStatusActions("Spectro Frazzle", Attribute.Spectro, Type2.SpectroFrazzle, [
  30, 54.39, 78.78, 103.17, 127.56, 
  151.95, 176.34, 200.73, 225.12, 249.51,
  332.68, 415.85, 499.02, 
  582.19, 665.36, 748.53,
]);
export const SPECTRO_FRAZZLE = new Debuff({
  name: "Spectro Frazzle", maxStacks: 10,
  convertStats: () => { if (currentAction() === SPECTRO_FRAZZLE_DMG[frozenStacks()]!) removeStackEnemy(SPECTRO_FRAZZLE, 1); },
});

/** Electromagnetic: 15s a stack, refreshed on gain, cap 10; every 5s it calculates and removes 50%
 *  of the stacks. What lands past the cap banks as Electro Rage. Untriggered — no clock. */
export const ELECTRO_FLARE_DMG = negativeStatusActions("Electro Flare", Attribute.Electro, Type2.ElectroFlare, [
  50, 90.65, 131.3, 171.95, 212.6, 
  253.25, 293.9, 334.55, 375.2, 415.85,
  554.47, 693.08, 831.7, 970.32, 1108.93, 1247.55,
]);
/** Electromagnetic Burst: banked once Flare is at its cap and calculated as its own hit alongside
 *  the next Flare calculation, which consumes all of it. Real cap is 10, but only 6 rungs exist —
 *  the migrated table has no Rage rows of its own, so these are Flare's own increment past its cap
 *  (a flat `flare[10] / 3` a stack, the same rule every status table follows), and that runs out
 *  at Flare's 16th rung. */
export const ELECTRO_RAGE_DMG = negativeStatusActions("Electro Rage", Attribute.Electro, Type2.ElectroFlare, [
  138.62, 277.23, 415.85, 554.47, 693.08, 831.7,
]);
export const ELECTRO_RAGE = new Debuff({
    name: "Electro Rage", maxStacks: 6,
    convertStats: () => { if (currentAction() === ELECTRO_RAGE_DMG[frozenStacks()]!) revokeEnemy(ELECTRO_RAGE); },
})
export const ELECTRO_FLARE = new Debuff({
  name: "Electro Flare", maxStacks: 10,
  // What a cast asked for minus what actually went on is what the cap ate. Only updateDebuffs can
  // see both: `frozenStacks()` is frozen before the action, while `stacksOfEnemy()` is live and the kits
  // inflicting have already run (enemy gear is last in this phase). A Flare not already on the
  // target isn't in that freeze at all, so a cast overshooting the cap from zero banks nothing.
  updateDebuffs: () => {
    const before = frozenStacks();
    const landed = stacksOfEnemy(ELECTRO_FLARE) - before;
    const overflow = applied(ELECTRO_FLARE) - landed;
    if (overflow > 0) applyEnemy(ELECTRO_RAGE, overflow);
  },
  // a Flare calculation fires whatever Rage is banked as its own hit alongside it...
  updateBuffs: () => {
    const rage = stacksOfEnemy(ELECTRO_RAGE);
    if (rage > 0 && currentAction() === ELECTRO_FLARE_DMG[frozenStacks()]!) queue(ELECTRO_RAGE_DMG[rage]!);
  },
  // ...and spends half its own frozenStacks, rounded down. The Rage spends itself on its own hit.
  convertStats: () => { 
    if (currentAction() === ELECTRO_FLARE_DMG[frozenStacks()]!) removeStackEnemy(ELECTRO_FLARE, Math.floor(frozenStacks() / 2));
  },
});

const NEGATIVE_STATUSES: Debuff[] = [HAVOC_BANE, GLACIO_CHAFE, ELECTRO_FLARE, FUSION_BURST, AERO_EROSION, SPECTRO_FRAZZLE];

/** Did the action being evaluated inflict any of the six Negative Statuses? */
export const inflictedNegativeStatus = (): boolean => NEGATIVE_STATUSES.some((d) => applied(d) > 0);
