/**
 * The Tune Break: the enemy itself as a dummy resonator, the break, its cooldown, and the two
 * enemy states around it. The engine owns nothing but the off-tune bar as a counter — the rest is
 * here, equipped onto `State.enemy` the way a member's own kit is equipped onto them.
 */
import { ActionTag, Attribute, Cast, EnemyStat, Scaling, Stat, Type, WeaponType } from "../engine/stats.js";
import { Buff, BuffDef, Debuff, Gear, Resonator } from "../engine/gear.js";
import {
  addEnemyStat,
  addStat,
  applied,
  applyEnemy,
  currentAction, pressed,
  runningAction,
  currentTeam,
  equip,
  getStat,
  isCast,
  isHeld,
  midActionGroup,
  queue,
  queueEvent,
  revokeEnemy,
  stacksOfEnemy,
  triggeredAction,
  isActive,
  pressCut,
  replaceNextDash,
} from "../engine/context.js";
import { Action, nextIsPlainDodge } from "../engine/rotation.js";
import { currentMember } from "../engine/context.js";

/* ---------------------------------------------------------------------------- the enemy */

/** The bar's own ceiling, x10000 like every `offtune` an action declares */
export const ENEMY_MAX_OFFTUNE = 392_000;

/** The enemy's own 20% resistance to every attribute, as seven scoped RES Reduce entries of -20 —
 *  so the res column's own trace lists it beside every shred and ignore and foots to the total. */
export const BASE_RESISTANCE = new Gear({
  name: "Base Resistance",
  constantStats: () => {
    for (const attribute of [Attribute.Aero, Attribute.Electro, Attribute.Fusion, Attribute.Glacio, Attribute.Spectro, Attribute.Havoc, Attribute.Physical]) {
      addEnemyStat(EnemyStat.ResReduce, -20, attribute);
    }
  },
});

/** Tune Break Cooldown: on the target from the break, and while it stands every off-tune gain is
 *  taken straight back off the bar — for the three seconds after the break. */
export const TUNE_BREAK_COOLDOWN: Debuff = new Debuff({
  name: "Tune Break Cooldown", duration: 60 * 3,
  // what evaluate() is about to bank of what this action *built*, negated — last of all, once
  // every AddOfftune source has landed. What a kit puts on the bar directly (DirectOfftune,
  // Denia's half-bar surge) is not a gain the cooldown holds off.
  lateConvertStats: () => {
    const built = currentAction().offtune + getStat(Stat.AddOfftune);
    if (built > 0) addStat(Stat.DirectOfftune, -built * getStat(Stat.OfftuneBuildup) / 100);
  },
});

/** The cuts a break may come out behind: none at all (or a press beside the fight), and a plain,
 *  insta, on-hit or mash cancel. */
const BREAK_AFTER = new Set<string>([ActionTag.Default, ActionTag.Field, ActionTag.Cancel, ActionTag.InstaCancel, ActionTag.HitCancel, ActionTag.MashCancel]);

/** The dodge cuts a break may replace the plain dodge of, and the cut each becomes. */
const DODGE_CUTS = new Map<string, string>([
  [ActionTag.DodgeCancel, ActionTag.Cancel], [ActionTag.InstaDodge, ActionTag.InstaCancel], [ActionTag.DodgeOnHit, ActionTag.HitCancel],
]);

/** A break queued and waiting for the press playing to run out (`ActionDef.afterPlay`): the bar
 *  stays full until it is cast, and this keeps a second one from queuing behind it meanwhile. */
const TUNE_BREAK_QUEUED: Debuff = new Debuff({ name: "Tune Break Queued", hidden: true });

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
  combatStart: () => equip(BASE_RESISTANCE),

  // A break drops whatever the bar overshot by and starts the cooldown as it is cast, so its own
  // `castOfftune` drain lands the bar on empty exactly — the same `>=` that queues a break below.
  updateBuffs: () => {
    if (!runningAction(TUNE_BREAK)) return;
    revokeEnemy(TUNE_BREAK_QUEUED);
    const state = currentTeam();
    if (state.offtune >= ENEMY_MAX_OFFTUNE) state.offtune = ENEMY_MAX_OFFTUNE;
    applyEnemy(TUNE_BREAK_COOLDOWN, 1);
  },
  // the only phase that runs after evaluate() banks the action's own off-tune, so the only one that
  // sees the bar fill in time. Not `queue`: a break falls in behind everything else this action
  // spawned, and lands on whoever is on field rather than on whoever queued it.
  // Only a real on-field press can set one off: a queued follow-up (`triggeredAction()`) and an
  // inactive action both top the bar up without breaking it, and a break — triggered itself — never
  // sets off another. The bar stays full either way, so the next action that *is* one fires it.
  afterAction: () => {
    if (triggeredAction() || !isActive()) return;
    // a press cut by the plain dodge can have the break take that dodge's place, the cut becoming
    // its non-dodge form — the group the dodge closed ends on the press
    const dodgeCut = DODGE_CUTS.get(pressCut());
    const replacesDodge = !!dodgeCut && nextIsPlainDodge();
    // ...and not part-way through an ActionGroup, which the rotation presses as one beat: the bar
    // can fill on any cast in it, but the break lands on the one that ends the group (evaluate.ts)
    if (midActionGroup() && !replacesDodge) return;
    // and not while the last break's own Rupture/Hack Interfered is still up: a target already
    // interfered with can't be broken again until that window is out. The bar just stays full
    // meanwhile, so the break lands on the first action after the window ends.
    if (stacksOfEnemy(TUNE_RUPTURE_INTERFERED) > 0 || stacksOfEnemy(TUNE_HACK_INTERFERED) > 0) return;
    // ...and never behind an Intro or a Liberation: the bar waits for the press after it
    if (isCast(currentAction(), Cast.Intro) || isCast(currentAction(), Cast.Liberation)) return;
    // ...nor behind a wait (`waitFor()`'s rows, every one named "Wait ..."): it is no press at all
    if (currentAction().name.startsWith("Wait ")) return;
    // ...and only behind a press that played out or was cancelled outright: a hold, a dash, a jump or
    // a swap gives the break no opening, so the bar stays full for the next press that does
    if (!BREAK_AFTER.has(pressCut()) && !replacesDodge) return;
    if (currentTeam().offtune < ENEMY_MAX_OFFTUNE || stacksOfEnemy(TUNE_BREAK_QUEUED)) return;
    applyEnemy(TUNE_BREAK_QUEUED, 1);
    if (replacesDodge) replaceNextDash(dodgeCut!);
    queueEvent(TUNE_BREAK_PRESS);
  },
});

/** Always this one tune-scaled hit, whichever Shifting steered it — a Tune Break scales off Tune
 *  Break, and the Shifting only decides which Interfered it leaves behind. Reports under the
 *  enemy's own bucket rather than whoever was on field. */
export const TUNE_BREAK = new Action("Tune Break (Auto Generated)", {
  element: Attribute.Physical, scaling: Scaling.Tune, cast: Cast.TuneBreak, type: Type.Break,
  bullets: [{ hitFrame: 90, mv: 160000 }], slot: TUNE_BREAK_ENEMY.name,
  // the world stands still for all of it, so the game timer charges none; it waits for the
  // press playing to run out rather than playing over it
  animFrames: 90, timestop: 90, motionStop: 70, afterPlay: true,
  // A cast nobody pressed, so `run()` counts it triggered by its cast: every per-action clock in
  // the fight — the two below, a sonata's own cadence, an inherent counting presses — reads
  // `triggeredAction()` and passes it over, rather than each having to know the break by name.
  // The whole bar, straight off it on the cast: a drain is an amount the bar moves by, not
  // something the team's Off-Tune Buildup Rate builds, so the negative comes off in full
  castOfftune: -ENEMY_MAX_OFFTUNE,
});

/** A sword's and a broadblade's break hits (wuwalab), [frame, mv]; the other classes land one. */
export const SWORD_BREAK: [number, number][] = [[30, 10000], [36, 10000], [42, 10000], [48, 10000], [72, 120000]];
export const BROADBLADE_BREAK: [number, number][] = [[4, 17334], [26, 22666], [66, 120000]];

/** The break as one resonator performs it: its bullets, played over their own frames — a form of
 *  `TUNE_BREAK`, so every `runningAction(TUNE_BREAK)` still reads it. */
export function tuneBreak(animFrames: number, timestop: number, motionStop: number, bullets: [number, number][]): Action {
  const out = TUNE_BREAK.variant(TUNE_BREAK.name, { animFrames, timestop, motionStop, bullets: bullets.map(([hitFrame, mv]) => ({ hitFrame, mv })) });
  out.formOf = TUNE_BREAK;
  return out;
}

/** Each weapon class's own Tune Break (wuwalab's "Tune Break Skill", the class's usual one). */
const CLASS_TUNE_BREAK: Record<WeaponType, Action> = {
  [WeaponType.Sword]: tuneBreak(90, 90, 70, SWORD_BREAK),
  [WeaponType.Broadblade]: tuneBreak(94, 94, 64, BROADBLADE_BREAK),
  [WeaponType.Rectifier]: tuneBreak(90, 90, 54, [[56, 160000]]),
  [WeaponType.Pistols]: tuneBreak(96, 96, 70, [[72, 160000]]),
  [WeaponType.Gauntlets]: tuneBreak(92, 92, 70, [[72, 160000]]),
};

/** What a full bar queues: resolved when reached to the on-field resonator's own break — their kit's
 *  (`ResonatorDef.tuneBreak`, itself resolved where it has one), else their weapon class's. */
const TUNE_BREAK_PRESS = new Action("Tune Break Placeholder", {
  // queued, it waits for the press playing to run out like the break it resolves to
  afterPlay: true,
  resolve: () => {
    const resonator = currentMember().resonator;
    const own = resonator?.tuneBreak;
    if (own) return own.resolveFn ? own.resolveFn() : own;
    return resonator ? CLASS_TUNE_BREAK[resonator.weapon] : TUNE_BREAK;
  },
});

/* ------------------------------------------------------------- shifting and interfered */

/** How long an Interfered lasts: 8s from the break that inflicts it. A target already under
 *  Rupture/Hack Interfered can't be broken again until the window is out (the enemy above is what
 *  holds the break off), so nothing but that one break ever grants it. */
export function interferedWindow(def: BuffDef): Debuff {
  return new Debuff({ ...def, duration: 60 * 8 });
}

/** What a break leaves behind. Rupture and Hack run out on the window above. Strain is left
 *  standing instead, since the kits built on it (Luuk, Lynae,
 *  Qingxiao) pay off its stacks rather than its duration: capped at 1 as declared, with a kit that
 *  responds to it raising the target's own limit with `maxStackIncrease()`, so the real ceiling is
 *  whoever is on the team. */
export const TUNE_RUPTURE_INTERFERED = interferedWindow({ name: "Tune Rupture - Interfered" });
export const TUNE_STRAIN_INTERFERED = new Debuff({ name: "Tune Strain - Interfered", maxStacks: 1 });

/** The Strain payout, for a responder's own kit to call from its `lateConvertStats`: every point of
 *  its own Tune Break Boost is +0.12% total damage a stack of Interfered. Late, by when every Tbb
 *  source has landed. Called by the piece that makes the kit a responder — Luuk's resonator,
 *  Denia's Strain mode — so the loadout hover files it under that piece, while the value itself
 *  reads as the debuff's, which is what pays it. */
export const strainPayout = (): Buff => new Buff({
  name: "Tune Strain - Interfered", hidden: true,
  lateConvertStats: () => tuneStrainPayout(),
});

const tuneStrainPayout = (): void => {
  const stacks = stacksOfEnemy(TUNE_STRAIN_INTERFERED);
  if (!stacks) return;
  addStat(Stat.TotalDmg, 0.12 * getStat(Stat.Tbb) * stacks);
};
export const TUNE_HACK_INTERFERED = interferedWindow({ name: "Tune Hack - Interfered" });

/** What a kit puts on the target to steer the next break — and where every Interfered comes from:
 *  on the break, the Shifting steering it spends itself and applies its own, through the same
 *  `applyEnemy()` a kit uses, so `applied()` sees it like any other inflicted debuff. Enemy-pool
 *  gear runs last in the phase, so a kit adding its own Interfered still sees the Shifting up. */
function shifting(name: string, interfered: Debuff): Debuff {
  const self: Debuff = new Debuff({
    name,
    updateDebuffs: () => {
      if (!runningAction(TUNE_BREAK)) return;
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
  if (runningAction(TUNE_BREAK) && applied(TUNE_RUPTURE_INTERFERED)) queue(action);
};
export const tuneHackResponse = (action: Action): void => {
  if (runningAction(TUNE_BREAK) && applied(TUNE_HACK_INTERFERED)) queue(action);
};
