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
 *  lists wuwalab's commits; each lands 14 frames earlier (floored at 0), the transform staying on field
 *  to finish its attack. */
export class TransformEcho extends EchoAction {
  constructor(name: string, def: EchoDef) {
    const bullets = def.bullets?.map((b) => ({ ...b, commitFrame: Math.max(0, (b.commitFrame ?? b.hitFrame) - 14) }));
    super(name, { cast: Cast.Echo, animFrames: 60, animPriority: { 0: 13 }, castPriority: 5, ...def, bullets });
  }
}

/** A pseudo-transform (wuwalab's semi_transform: Bell-Borne Geochelone, Mech Abomination, Threnodian -
 *  Leviathan, Thousand-Puppet Pavilion): 8 frames held at 4, cast at 5. */
export class PseudoTransformEcho extends EchoAction {
  constructor(name: string, def: EchoDef) {
    super(name, { cast: Cast.Echo, animFrames: 8, animPriority: { 0: 4 }, castPriority: 5, ...def });
  }
}

/** An echo that summons its own attack: 8 frames, cast at 10 but held at 0 (a Liberation cuts it), and
 *  no break in its wearer's chain. */
export class SummonEcho extends EchoAction {
  constructor(name: string, def: EchoDef) {
    super(name, { cast: Cast.Echo, animFrames: 8, animPriority: { 0: 0 }, castPriority: 10, keepsChain: true, ...def });
  }
}
