/**
 * The Tune Break: the enemy itself as a dummy resonator, the break, its cooldown, and the two
 * enemy states around it. The engine owns nothing but the off-tune bar as a counter — the rest is
 * here, equipped onto `State.enemy` the way a member's own kit is equipped onto them.
 */
import {
  Action, Attribute, BuffDef, Cast, Debuff, EnemyStat, Gear, Resonator, Scaling, Stat, Type1, WeaponType,
  addEnemyStat, addStat, applied, applyEnemy, currentAction, currentTeam, equip, getStat, midActionGroup,
  queue, queueEvent, revokeEnemy, stacksOfEnemy, triggeredAction,
} from "../engine/kit.js";

/* ---------------------------------------------------------------------------- the enemy */

/** The bar's own ceiling, x10000 like every `offtune` an action declares (the sheet's own 39.2). */
export const ENEMY_MAX_OFFTUNE = 392_000;

/** The enemy's own 20% resistance to every attribute, as seven scoped RES Reduce entries of -20 —
 *  so the res column's own trace lists it beside every shred and ignore and foots to the total. */
export const BASE_RESISTANCE = new Gear({
  name: "Base Resistance",
  constantStats: () => {
    for (const attribute of [Attribute.Aero, Attribute.Electro, Attribute.Fusion, Attribute.Glacio, Attribute.Spectro, Attribute.Havoc, Attribute.Physical]) {
      addEnemyStat(EnemyStat.ResShred, -20, attribute);
    }
  },
});

/** Tune Break Cooldown: on the target from the break, and while it stands every off-tune gain is
 *  taken straight back off the bar — for the next three active presses by anyone on the team, and
 *  every triggered action in between. Its stacks are that clock: the break lands the first, each
 *  active, non-triggered action adds one, and the fourth is the one that finds it full and takes
 *  it off, a phase ahead of any stat, so that action already builds again. */
export const TUNE_BREAK_COOLDOWN: Debuff = new Debuff({
  name: "Tune Break Cooldown", maxStacks: 4,
  display: () => "Tune Break Cooldown",
  updateBuffs: () => {
    if (triggeredAction() || !currentAction().active) return;
    if (stacksOfEnemy(TUNE_BREAK_COOLDOWN) >= 4) revokeEnemy(TUNE_BREAK_COOLDOWN);
    else applyEnemy(TUNE_BREAK_COOLDOWN, 1);
  },
  // what evaluate() is about to bank of what this action *built*, negated — last of all, once
  // every AddOfftune source has landed. What a kit puts on the bar directly (DirectOfftune,
  // Denia's half-bar surge) is not a gain the cooldown holds off.
  lateConvertStats: () => {
    const built = currentAction().offtune + getStat(Stat.AddOfftune);
    if (built > 0) addStat(Stat.DirectOfftune, -built * getStat(Stat.OfftuneBuildup) / 100);
  },
});

/** The enemy, as the dummy resonator every fight has: its name is the bucket the break's damage
 *  reports under (a break is nobody's turn) and its colour the hue that bucket wears, and it holds
 *  the machinery that fires the break. solver.ts `equipEnemy()`s it onto `State.enemy` as it
 *  builds a team — never onto a team slot, so it casts no Intro or Outro — and its own start of
 *  combat puts its Base Resistance on. */
export const TUNE_BREAK_ENEMY = new Resonator({
  name: "Tune Break", enemy: true,
  element: Attribute.Physical, weapon: WeaponType.Sword,
  // deliberately paler than any resonator's hue: it marks a row as *not* somebody's damage
  color: "#c9d2de",
  intro: () => { throw new Error("the enemy casts no Intro"); },
  outro: () => { throw new Error("the enemy casts no Outro"); },
  combatStart: () => equip(BASE_RESISTANCE),

  // A break drops whatever the bar overshot by and starts the cooldown, so the break's own
  // `-ENEMY_MAX_OFFTUNE` DirectOfftune lands it on empty exactly — before the drain banks, the
  // same `>=` that queues a break below.
  updateDebuffs: () => {
    if (currentAction() !== TUNE_BREAK) return;
    const state = currentTeam();
    if (state.offtune >= ENEMY_MAX_OFFTUNE) state.offtune = ENEMY_MAX_OFFTUNE;
    applyEnemy(TUNE_BREAK_COOLDOWN, 1);
  },
  // the only phase that runs after evaluate() banks the action's own off-tune, so the only one that
  // sees the bar fill in time. Not `queue`: a break falls in behind everything else this action
  // spawned, and lands on whoever is on field rather than on whoever queued it.
  // Only a real on-field press can set one off: a queued follow-up or engine event
  // (`triggeredAction()`, which a break of its own is) and an inactive action both top the bar up
  // without breaking it. The bar stays full either way, so the next action that *is* one fires it.
  afterAction: () => {
    if (triggeredAction() || !currentAction().active) return;
    // ...and not part-way through an ActionGroup, which the rotation presses as one beat: the bar
    // can fill on any cast in it, but the break lands on the one that ends the group (kit.ts)
    if (midActionGroup()) return;
    // and not while the last break's own Rupture/Hack Interfered is still up: a target already
    // interfered with can't be broken again until that window is out. The bar just stays full
    // meanwhile, so the break lands on the first action after the window ends.
    if (stacksOfEnemy(TUNE_RUPTURE_INTERFERED) > 0 || stacksOfEnemy(TUNE_HACK_INTERFERED) > 0) return;
    if (currentTeam().offtune >= ENEMY_MAX_OFFTUNE) queueEvent(TUNE_BREAK);
  },
});

/** Always this one tune-scaled hit, whichever Shifting steered it — a Tune Break scales off Tune
 *  Break, and the Shifting only decides which Interfered it leaves behind. Reports under the
 *  enemy's own bucket rather than whoever was on field. */
export const TUNE_BREAK = new Action("Tune Break", {
  element: Attribute.Physical, scaling: Scaling.Tune, cast: Cast.TuneBreak, type: Type1.Break,
  mv: 1600, slot: TUNE_BREAK_ENEMY.name,
  // The whole bar, straight off it: `DirectOfftune` rather than a declared `offtune`, because a
  // drain is an amount the bar moves by, not something the team's Off-Tune Buildup Rate builds
  // (see kit.ts's own evaluate()). Sourced to the break itself, so the off-tune panel names it.
  applyStats: () => { addStat(Stat.DirectOfftune, -ENEMY_MAX_OFFTUNE); },
});

/* ------------------------------------------------------------- shifting and interfered */

/** How long an Interfered lasts: 8s in game, which this clockless engine takes as the next 10
 *  active, non-triggered actions.
 *  A debuff on that clock, counting the window off in its own stacks rather than through anything
 *  beside it: the break that inflicts it lands the first, every active, non-triggered action after
 *  adds one — a break's own queued follow-ups add none — and the action that finds it already full
 *  is the one that revokes it, from updateBuffs, a phase ahead of any applyStats, so that action
 *  already pays nothing. Its stacks are the clock and nothing else, so it still reports its plain
 *  name rather than "xN".
 *  Nothing here handles a second application: a target already under Rupture/Hack Interfered can't
 *  be broken again until the window is out (the enemy above is what holds the break off), so the
 *  count is only ever started by the one break that inflicted it. A debuff that *can* land again
 *  inside its own window revokes itself first, which is what starts the count over — Mornye's own
 *  Interfered Marker, the other thing on this 8s, is the one kit that has to.  */
export function interferedWindow(def: BuffDef): Debuff {
  const self: Debuff = new Debuff({
    ...def,
    maxStacks: 11,
    display: () => def.name ?? "",
    updateBuffs: () => {
      if (triggeredAction() || !currentAction().active) return;
      if (stacksOfEnemy(self) > 10) revokeEnemy(self);
      else applyEnemy(self, 1);
    },
  });
  return self;
}

/** What a break leaves behind. Rupture and Hack run out on the window above, their stacks spent
 *  counting it off. Strain is left standing instead, since the kits built on it (Luuk, Lynae,
 *  Qingxiao) pay off its stacks rather than its duration: capped at 1 as declared, with a kit that
 *  responds to it raising the target's own limit with `maxStackIncrease()`, so the real ceiling is
 *  whoever is on the team. */
export const TUNE_RUPTURE_INTERFERED = interferedWindow({ name: "Tune Rupture - Interfered" });
export const TUNE_STRAIN_INTERFERED = new Debuff({ name: "Tune Strain - Interfered", maxStacks: 1 });
export const TUNE_HACK_INTERFERED = interferedWindow({ name: "Tune Hack - Interfered" });

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
 *  Call from the kit's own updateGlobal(), which is what pins the follow-up to the kit's holder.
 *  On the break itself rather than on `applied()` alone: a break is the only thing that inflicts an
 *  Interfered, while the window above re-adds the same debuff on every action it counts off, so
 *  this answers the break once and never the ticks after it. */
export const tuneRuptureResponse = (action: Action): void => {
  if (currentAction() === TUNE_BREAK && applied(TUNE_RUPTURE_INTERFERED)) queue(action);
};
export const tuneHackResponse = (action: Action): void => {
  if (currentAction() === TUNE_BREAK && applied(TUNE_HACK_INTERFERED)) queue(action);
};

/** The shared Strain payout: every point of the holder's own Tune Break Boost is +0.12% total
 *  damage per Interfered stack. From a gear's convertStats(), by when every Tbb source has landed. */
export function tuneStrainBonus(): void {
  const interfered = stacksOfEnemy(TUNE_STRAIN_INTERFERED);
  if (interfered > 0) addStat(Stat.TotalDmg, 0.12 * getStat(Stat.Tbb) * interfered);
}
