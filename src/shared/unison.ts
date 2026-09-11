/**
 * Unison — the shared swap mechanic (Jinhsi's Illuminous Epiphany, Suoming's Umbral Canopy), and
 * everything a weapon or sonata reads off it.
 *
 * A kit grants it with a plain `applyCurrent(UNISON, 1)`; its "once every 25s" is a kit's own
 * business (Jinhsi's, which grants on her first Illuminous Epiphany of a rotation and re-arms on
 * her Liberation).
 * Swapping out with it spends it in place of the Concerto bar: the kit's `outro` fn resolves to
 * the Unison form of its Outro (`unisonOutro()`), the same cast declaring no spend, so the bar
 * carries over into the owner's next visit. The Unison spend itself is a conversion, so the outro
 * row still lists Unison among what it held, and it publishes UNISON_INTRO for whoever intros
 * next: that is how the incoming Intro knows the outro it answers was a Unison one.
 *
 * Responding is the responder's own kit's doing, the way a Tune Strain responder pays its
 * Interfered from a marker it holds (tunebreak.ts): a kit whose Intro has a Unison form picks it
 * in its `introFn` off `unisonIntro()`, and that Intro action declares `respondToUnison()` in its
 * updateDebuffs — that is "triggering Unison Response", which every weapon and sonata reads
 * through `unisonResponse()`. Unison Boon pays only a slot holding UNISON_RESPONDER, which such a
 * kit grants itself from its own combatStart — so a Jinhsi beside Suoming holds the stacks and
 * reads nothing from them, as the kit text says, and the payout is sourced to the Boon itself.
 * Anybody else simply adopts and drops the Intro marker on their Intro row.
 */
import { Cast, Stat } from "../engine/stats.js";
import { Buff } from "../engine/gear.js";
import type { Action } from "../engine/rotation.js";
import {
  addStat,
  applied,
  applyCurrent,
  casting,
  currentAction,
  currentTeam,
  getStat,
  isHeld,
  queueOutro,
  revokeCurrent,
  stacksOfTeam,
} from "../engine/context.js";

/** Unison itself: spent by the outro it pays for — from convertStats, so the outro row still shows
 *  it — publishing the handoff the next Intro reads. The bar it stands in for is not paid back
 *  here: the outro a kit resolves to while this is held is its Unison form (`unisonOutro()`),
 *  which declares no spend at all. */
export const UNISON = new Buff({
  name: "Unison",
  convertStats: () => { if (casting(Cast.Outro)) { revokeCurrent(UNISON); queueOutro(UNISON_INTRO); } },
});

/** The Unison form of a kit's Outro: the same cast declaring no Concerto spend, since Unison pays
 *  for the swap in the bar's place — so the bar carries over into the owner's next visit, and the
 *  outro is never short whatever it held. A Unison-capable kit builds one off its plain Outro and
 *  its `outro` fn picks it while Unison is held (`isHeld(UNISON)`), the way an Intro fn picks its
 *  Unison form off `unisonIntro()`. */
export const unisonOutro = (outro: Action): Action => {
  const out = outro.variant(`${outro.name} (Unison)`, { concerto: 0 });
  out.formOf = outro;
  return out;
};

/** Is the chain being played a DOUBLE_INTRO pre-visit — the short visit that leaves on a Unison
 *  outro handing the field *backward* (rotation.ts's own `outroDir`)? What a kit that grants
 *  Unison once every 25s checks: only the pre-visit's cast grants, the main visit's pays the bar. */
export const isDoubleIntro = (): boolean => currentTeam().outroDir === -1;

/** "Upon obtaining Unison" — did the action being evaluated grant it? */
export const gainedUnison = (): boolean => applied(UNISON) > 0;

/** What a Unison outro publishes for the next Intro: adopted at that Intro, read by its own hooks,
 *  and gone once the Intro row has paid out. */
export const UNISON_INTRO = new Buff({
  //name: "Unison Intro",
  convertStats: () => { if (casting(Cast.Intro)) revokeCurrent(UNISON_INTRO); },
});

/** Is the Intro being resolved or evaluated answering a Unison outro? True from an `introFn` —
 *  the handoff is still queued then, adopted only once the Intro row itself is evaluated — and
 *  true on the Intro row's own hooks after that. */
export function unisonIntro(): boolean {
  return isHeld(UNISON_INTRO) || currentTeam().outroQueue.includes(UNISON_INTRO);
}

/** The response itself, for the one Intro row it happens on: put up by the responder's Unison
 *  Intro in its updateDebuffs, the first phase, so every weapon and sonata's updateBuffs sees it. */
export const UNISON_RESPONSE = new Buff({
  //name: "Unison Response",
  convertStats: () => { if (casting(Cast.Intro)) revokeCurrent(UNISON_RESPONSE); },
});

/** What a responder's Unison Intro form declares — the Intro is adopted ahead of updateDebuffs,
 *  so the marker is already held here. */
export function respondToUnison(): void {
  if (isHeld(UNISON_INTRO)) applyCurrent(UNISON_RESPONSE, 1);
}

/** "Triggering Unison Response" — is the action being evaluated a responder's Unison Intro? */
export const unisonResponse = (): boolean => applied(UNISON_RESPONSE) > 0;

/** "When the wielder consumes Concerto Energy" — a cast of their own that spends some, which an
 *  outro's own bar is not. Reads the declared field plus whatever a held buff's own conditional
 *  spend (Suoming's Rift Cleaver, Unison held) has already added by this point — the action's own
 *  updateBuffs runs ahead of every held Gear's in the same phase, so that addition is in `getStat`
 *  before this is ever checked. */
export const consumedConcerto = (): boolean =>
  currentAction().concerto + getStat(Stat.AddConcerto) < 0 && !casting(Cast.Outro);

/** Unison Boon: +3% DMG dealt a stack, two at most — three with Hsin's Gleaning Simple Joys and
 *  four with her S6, each of which is both a cap raise and the extra grant that reaches it — 30s
 *  and refreshed by every grant so permanent once up. It pays only a slot holding
 *  UNISON_RESPONDER. The cap is declared at its highest here rather than raised at runtime
 *  (`maxStackIncrease` is enemy-debuff only): without those two pieces nothing grants a third
 *  stack anyway. */
export const UNISON_BOON = new Buff({ name: "Unison Boon", maxStacks: 4 });

/** The Boon's payout, for a responder's own kit to call from its `applyStats`: +3% DMG
 *  Amplification a stack, +4.5% beside Suoming's S6. Called by the piece that makes the kit a
 *  responder rather than paid by the Boon itself, so the bonus is sourced to that piece — Hsin's
 *  Unison mode, Suoming's own kit — the way Denia's mode calls `applyStrain()` for hers. */
export const unisonBoonAmp = (): void => {
  const stacks = stacksOfTeam(UNISON_BOON);
  if (stacks) addStat(Stat.Amp, (stacksOfTeam(NINE_SHADOWS) ? 4.5 : 3) * stacks);
};

/** Suoming's S6 on the team: every stack of Unison Boon pays half again — +4.5% rather than +3%,
 *  for every responder, not only her. Put up team-wide by that sequence's own combatStart. */
export const NINE_SHADOWS = new Buff({ name: "Suoming S6: Nine Shadows at Her Side" });

/** A kit that can trigger Unison Response grants itself this from its own combatStart — same
 *  shape as tunebreak.ts's own TUNE_STRAIN_RESPONDER — so Unison Boon pays that slot, sourced to
 *  itself. No `name`, so it never enters the held-buffs list (evaluate.ts's own `named()`): it's
 *  bookkeeping for a bonus the Boon's own row already reports, not a second thing to show. */
export const UNISON_RESPONDER = new Buff({});
