/**
 * The Tune Break: the break itself, and the two enemy states around it. The engine owns nothing but
 * the off-tune bar as a counter — the rest is here, reaching it as one gear on the target.
 */
import {
  Action, Attribute, Cast, Debuff, Scaling, Stat, Type1, addStat, applied, applyEnemy, currentAction,
  currentTeam, queue, queueEvent, getStat, revokeEnemy, stacksOfEnemy, triggeredAction,
  MISC_SLOT,
} from "./kit.js";

/* ---------------------------------------------------------------------------- the break */

/** A break is nobody's turn, so its damage groups under the shared bucket rather than any
 *  member's — the same one every Negative Status's own damage reports under. */
export const TUNE_BREAK_SLOT = MISC_SLOT;

/** Deliberately paler than any resonator's hue: it marks a row as *not* somebody's damage. */
export const TUNE_BREAK_HUE = "#c9d2de";

/** The bar's own ceiling, x10000 like every `offtune` an action declares (the sheet's own 39.2). */
export const ENEMY_MAX_OFFTUNE = 392_000;

/** Where a full bar lands once a break has taken `ENEMY_MAX_OFFTUNE` off it — below empty on
 *  purpose, so there's a short dead window before the bar can start building again. */
const OFFTUNE_AFTER_BREAK = -30_000;

/** Always this one tune-scaled hit, whichever Shifting steered it — a Tune Break scales off Tune
 *  Break, and the Shifting only decides which Interfered it leaves behind. */
export const TUNE_BREAK = new Action("Tune Break", {
  element: Attribute.Physical, scaling: Scaling.Tune, cast: Cast.TuneBreak, type: Type1.Break,
  mv: 1600, slot: TUNE_BREAK_SLOT,
  // The whole bar, straight off it: `DirectOfftune` rather than a declared `offtune`, because a
  // drain is an amount the bar moves by, not something the team's Off-Tune Buildup Rate builds
  // (see kit.ts's own evaluate()). Sourced to the break itself, so the off-tune panel names it.
  applyStats: () => { addStat(Stat.DirectOfftune, -ENEMY_MAX_OFFTUNE); },
});

/* ------------------------------------------------------------- shifting and interfered */

/** What a break leaves behind. Capped at 1 as declared; a kit that responds to it raises the
 *  target's own limit with `maxStackIncrease()`, so the real ceiling is whoever is on the team. */
export const TUNE_RUPTURE_INTERFERED = new Debuff({ name: "Tune Rupture - Interfered", maxStacks: 1 });
export const TUNE_STRAIN_INTERFERED = new Debuff({ name: "Tune Strain - Interfered", maxStacks: 1 });
export const TUNE_HACK_INTERFERED = new Debuff({ name: "Tune Hack - Interfered", maxStacks: 1 });

/** What a kit puts on the target to steer the next break — and where every Interfered comes from:
 *  on the break, the Shifting steering it spends itself and applies its own, through the same
 *  `applyEnemy()` a kit uses, so `applied()` sees it like any other inflicted debuff. Enemy-pool
 *  gear runs last in the phase, so a kit adding its own Interfered still sees the Shifting up. */
function shifting(name: string, interfered: Debuff): Debuff {
  const self: Debuff = new Debuff({
    name,
    updateDebuffs: () => {
      if (currentAction() !== TUNE_BREAK) return;
      revokeEnemy(self);
      applyEnemy(interfered, 1);
    },
  });
  return self;
}
export const TUNE_RUPTURE_SHIFTING = shifting("Tune Rupture - Shifting", TUNE_RUPTURE_INTERFERED);
export const TUNE_STRAIN_SHIFTING = shifting("Tune Strain - Shifting", TUNE_STRAIN_INTERFERED);
export const TUNE_HACK_SHIFTING = shifting("Tune Hack - Shifting", TUNE_HACK_INTERFERED);

/** Only one Shifting on the target at a time: applying one clears the others. Nothing backs these
 *  but the debuff itself — there is no engine-side field for which variant is up. */
const SHIFTINGS = [TUNE_RUPTURE_SHIFTING, TUNE_STRAIN_SHIFTING, TUNE_HACK_SHIFTING];
function applyShifting(shifting: Debuff): void {
  for (const other of SHIFTINGS) if (other !== shifting) revokeEnemy(other);
  applyEnemy(shifting, 1);
}
export const applyRupture = (): void => applyShifting(TUNE_RUPTURE_SHIFTING);
export const applyStrain = (): void => applyShifting(TUNE_STRAIN_SHIFTING);
export const applyHack = (): void => applyShifting(TUNE_HACK_SHIFTING);

/** A kit's answer to the break resolving as this variant, queued off the Interfered it just left.
 *  Call from the kit's own updateGlobal(), which is what pins the follow-up to the kit's holder. */
export const tuneRuptureResponse = (action: Action): void => { if (applied(TUNE_RUPTURE_INTERFERED)) queue(action); };
export const tuneHackResponse = (action: Action): void => { if (applied(TUNE_HACK_INTERFERED)) queue(action); };

/** The shared Strain payout: every point of the holder's own Tune Break Boost is +0.12% total
 *  damage per Interfered stack. From a gear's convertStats(), by when every Tbb source has landed. */
export function tuneStrainBonus(): void {
  const interfered = stacksOfEnemy(TUNE_STRAIN_INTERFERED);
  if (interfered > 0) addStat(Stat.TotalDmg, 0.12 * getStat(Stat.Tbb) * interfered);
}

/* --------------------------------------------------------------------------- firing it */

/** The whole mechanic, as one gear on the target: a break drops whatever the bar overshot by, then
 *  the break's own `-ENEMY_MAX_OFFTUNE` DirectOfftune banks — leaving a full bar at
 *  OFFTUNE_AFTER_BREAK exactly, and a break somehow fired on a bar that wasn't full properly
 *  negative instead. */
const TUNE_BREAK_WATCHER = new Debuff({
  // before the drain banks, so the two land in that order — the same `>=` that queues a break below
  updateDebuffs: () => {
    const state = currentTeam();
    if (currentAction() !== TUNE_BREAK) return;
    if (state.offtune >= ENEMY_MAX_OFFTUNE) state.offtune = ENEMY_MAX_OFFTUNE + OFFTUNE_AFTER_BREAK;
  },
  // the only phase that runs after evaluate() banks the action's own off-tune, so the only one that
  // sees the bar fill in time. Not `queue`: a break jumps ahead of whatever else this action
  // spawned, and lands on whoever is on field rather than on whoever queued it.
  // Only a real on-field press can set one off: a queued follow-up or engine event
  // (`triggeredAction()`, which a break of its own is) and an inactive action both top the bar up
  // without breaking it. The bar stays full either way, so the next action that *is* one fires it.
  afterAction: () => {
    if (triggeredAction() || !currentAction().active) return;
    if (currentTeam().offtune >= ENEMY_MAX_OFFTUNE) queueEvent(TUNE_BREAK);
  },
});

/** Put the bar's own watcher on the target — solver.ts calls this once as it builds a team.
 *  Nameless on purpose: machinery, not a buff anyone's kit put up, so no popover lists it. */
export const armTuneBreak = (): void => { applyEnemy(TUNE_BREAK_WATCHER, 1); };
