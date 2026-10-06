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
 * through `unisonResponse()`. Only a Unison Boon reactor (`BOON_REACTOR`, which such a kit grants
 * itself from its own combatStart) can gain Unison Boon at all — so a Jinhsi beside Suoming never
 * holds it. Anybody else simply adopts and drops the Intro marker on their Intro row.
 */
import { Cast, Stat } from "../engine/stats.js";
import { Buff } from "../engine/gear.js";
import type { Action } from "../engine/rotation.js";
import {
  addStat,
  applied,
  applyCurrent,
  applyOn,
  casting,
  gained,
  currentCast,
  currentTeam,
  frozenStacks,
  getStat,
  hitting,
  inflicting,
  isHeld,
  lastHit,
  queueOutro,
  removeStack,
  revokeCurrent,
  stacksOfTeam,
} from "../engine/context.js";

/** Unison itself: spent by the outro it pays for, on its cast — ahead of the Intro it hands to —
 *  publishing the handoff the next Intro reads. The bar it stands in for is not paid back
 *  here: the outro a kit resolves to while this is held is its Unison form (`unisonOutro()`),
 *  which declares no spend at all. */
export const UNISON = new Buff({
  name: "Unison",
  updateBuffs: () => {
    if (!casting(Cast.Outro)) return;
    revokeCurrent(UNISON);
    queueOutro(UNISON_INTRO);
  },
});

/** The Unison form of a kit's Outro: the same cast with no Concerto spend and no full-bar
 *  condition, since Unison pays for the swap in the bar's place — so the bar carries over into the
 *  owner's next visit, and the outro is never short whatever it held. A Unison-capable kit builds one off its plain Outro and
 *  its `outro` fn picks it while Unison is held (`isHeld(UNISON)`), the way an Intro fn picks its
 *  Unison form off `unisonIntro()`. */
export const unisonOutro = (outro: Action): Action => {
  const out = outro.variant(`${outro.name} (Unison)`, { castConcerto: 0, minConcerto: undefined });
  out.formOf = outro;
  return out;
};

/** "Upon obtaining Unison" — did the action being evaluated grant it? */
export const gainedUnison = inflicting(() => applied(UNISON) > 0);

/** What a Unison outro publishes for the next Intro: adopted at that Intro, read by its own hooks,
 *  and gone once the Intro row has paid out — its last hit, whatever cut the press (`introPaid`). */
export const UNISON_INTRO = new Buff({
  //name: "Unison Intro",
  afterHit: () => { if (introPaid()) revokeCurrent(UNISON_INTRO); },
  afterAction: () => { if (introPaid()) revokeCurrent(UNISON_INTRO); },
});

/** Is the Intro being resolved or evaluated answering a Unison outro? True from an Intro Resolver —
 *  the handoff is still queued then, adopted only once the Intro row itself is evaluated — and
 *  true on the Intro row's own hooks after that. */
export function unisonIntro(): boolean {
  return isHeld(UNISON_INTRO) || currentTeam().outroQueue.includes(UNISON_INTRO);
}

/** The response itself, for the one Intro row it happens on: put up by the responder's Unison
 *  Intro in its own updateBuffs, which runs ahead of every held Gear's, so all of them see it. */
export const UNISON_RESPONSE = new Buff({
  //name: "Unison Response",
  afterHit: () => { if (introPaid()) revokeCurrent(UNISON_RESPONSE); },
  afterAction: () => { if (introPaid()) revokeCurrent(UNISON_RESPONSE); },
});

/** An Intro row paid out: on its last hit, or at its end where it has none to land. */
function introPaid(): boolean {
  return casting(Cast.Intro) && (hitting() ? lastHit() : !currentCast().bullets.length);
}

/** What a responder's Unison Intro form declares in its updateBuffs — the handoff is adopted ahead
 *  of the cast's hooks, so the marker is already held here. */
export function respondToUnison(): void {
  if (isHeld(UNISON_INTRO)) applyCurrent(UNISON_RESPONSE, 1);
}

/** "Triggering Unison Response" — is the action being evaluated a responder's Unison Intro? */
export const unisonResponse = inflicting(() => applied(UNISON_RESPONSE) > 0);

/** "When the wielder consumes Concerto Energy" — a cast of their own that spends some, which an
 *  outro's own bar is not. Reads the declared field plus whatever a held buff's own conditional
 *  spend (Suoming's Rift Cleaver, Unison held) has already added to the cast by this point — the
 *  action's own updateBuffs runs ahead of every held Gear's in the same phase, so that addition is
 *  in `gained()` before this is ever checked. */
export const consumedConcerto = (): boolean =>
  currentCast().castConcerto + gained("concerto") < 0 && !casting(Cast.Outro);

/** Suoming's S6 on the team: every stack of Unison Boon pays half again — +4.5% rather than +3%.
 *  Put up team-wide by that sequence's own combatStart. */
export const NINE_SHADOWS = new Buff({ name: "Suoming S6: Nine Shadows at Her Side" });

/** A Unison Boon reactor — Hsin in her Unison mode, Suoming — the only members who can gain the
 *  Boon. Their kit grants it from its own combatStart. */
export const BOON_REACTOR = new Buff({ name: "Unison Boon Reactor", hidden: true });

/** Unison Boon: +3% Total DMG a stack (+4.5% beside Suoming's S6), two at most — three with Hsin's
 *  Gleaning Simple Joys and four with her S6, each of which is both a cap raise and the extra grant
 *  that reaches it — 30s, refreshed by every grant. Held by each reactor on the team, and only by
 *  them. The cap is declared at its highest here rather than raised at runtime: without those two
 *  pieces nothing grants a third stack anyway. */
export const UNISON_BOON = new Buff({
  name: "Unison Boon", maxStacks: 4, duration: 60 * 30,
  applyStats: () => addStat(Stat.TotalDmg, (stacksOfTeam(NINE_SHADOWS) ? 4.5 : 3) * frozenStacks()),
});

/** Every reactor on the team, each as the Resonator `applyOn` runs their own grants as. */
const reactors = () => currentTeam().slots.filter((m) => m.isHeld(BOON_REACTOR) && m.resonator).map((m) => m.resonator!);

/** One granter's stack of the Boon, to every reactor: theirs to give once while it stands, and
 *  every retrigger after that resets its 30s rather than adding a second ("Suoming can grant up to
 *  1 stack of Unison Boon this way. Gaining it again only resets the duration"). `marker` is that
 *  granter's own latch, so two granters on a team still make two stacks — and once the Boon has
 *  lapsed entirely the latch means nothing and the next response grants afresh. */
export function grantBoon(marker: Buff): void {
  const standing = currentTeam().slots.some((m) => m.stacksOf(UNISON_BOON) > 0);
  const n = standing && isHeld(marker) ? 0 : 1;
  for (const r of reactors()) applyOn(r, () => applyCurrent(UNISON_BOON, n));
  if (n) applyCurrent(marker, 1);
}

/** Take one granter's stack back off every reactor. */
export function takeBoon(): void {
  for (const r of reactors()) applyOn(r, () => removeStack(UNISON_BOON, 1));
}
