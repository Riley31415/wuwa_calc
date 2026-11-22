/** The three kinds of echo cast, with their kind's default frames and priority (CLAUDE.md's "echo
 *  casts"), each a resolver playing only while its mainslot is worn — a rotation writes one per mainslot. */
import { Cast } from "../engine/stats.js";
import { Action, SKIP } from "../engine/rotation.js";
import type { ActionDef } from "../engine/rotation.js";
import type { Mainslot } from "../engine/gear.js";
import { currentMember } from "../engine/context.js";

type EchoDef = ActionDef & { mainslot: Mainslot };

/** A mainslot echo's cast as a rotation writes it: `press` while `mainslot` is worn, else SKIP. */
export class EchoAction extends Action {
  /** The press itself, as its wearer makes it — what hooks and queues name. */
  readonly press: Action;
  constructor(name: string, def: EchoDef) {
    const press = new Action(name, def);
    const { mainslot } = def;
    super(name, { cast: Cast.Echo, mainslot, resolve: () => (currentMember().mainslot === mainslot ? press : SKIP) });
    this.press = press;
  }
}

/** An echo the wearer transforms into ("Transform into ..."): 60 frames held at 13, cast at 5. Its def
 *  lists wuwalab's commits as given: wuwalab already lands them ahead of the hit, the transform staying on
 *  field to finish its attack. */
export class TransformEcho extends EchoAction {
  constructor(name: string, def: EchoDef) {
    super(name, { cast: Cast.Echo, animFrames: 60, animPriority: { 0: 13 }, castPriority: 5, ...def });
  }
}

/** A pseudo-transform (wuwalab's semi_transform: Bell-Borne Geochelone, Mech Abomination, Threnodian -
 *  Leviathan, Thousand-Puppet Pavilion): 8 frames held at 4, cast at 5. */
// basically transforms which can be cancelled by lib
export class PseudoTransformEcho extends EchoAction {
  constructor(name: string, def: EchoDef) {
    super(name, { cast: Cast.Echo, animFrames: 30, animPriority: { 0: 5 }, castPriority: 5, ...def });
  }
}

/** An echo that summons its own attack: 8 frames, cast at 10 as the next press starts, never cutting
 *  the one before (`castsWithNext`), held at 8 (a Liberation cuts it), and no break in its wearer's chain. */
export class SummonEcho extends EchoAction {
  constructor(name: string, def: EchoDef) {
    super(name, { cast: Cast.Echo, animFrames: 8, animPriority: { 0: 8 }, castPriority: 1, keepsChain: true, castsWithNext: true, ...def });
  } // timestop moves can "cancel" it aka remov ethe time dilation
}
