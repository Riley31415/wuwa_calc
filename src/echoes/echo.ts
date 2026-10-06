/** The three kinds of echo cast, each an `Action` with its kind's default frames and priority
 *  (CLAUDE.md's "echo casts"); a def overrides any of them. */
import { Cast } from "../engine/stats.js";
import { Action } from "../engine/rotation.js";
import type { ActionDef } from "../engine/rotation.js";

/** An echo the wearer transforms into ("Transform into ..."): 60 frames held at 13, cast at 5. */
export class TransformEcho extends Action {
  constructor(name: string, def: ActionDef) {
    super(name, { cast: Cast.Echo, animFrames: 60, animPriority: { 0: 13 }, castPriority: 5, ...def });
  }
}

/** A pseudo-transform (Bell-Borne Geochelone, Threnodian - Leviathan, Fleurdelys): 8 frames, cast at 5. */
export class PseudoTransformEcho extends Action {
  constructor(name: string, def: ActionDef) {
    super(name, { cast: Cast.Echo, animFrames: 8, castPriority: 5, ...def });
  }
}

/** An echo that summons its own attack: 8 frames, cast at 12, and no break in its wearer's chain. */
export class SummonEcho extends Action {
  constructor(name: string, def: ActionDef) {
    super(name, { cast: Cast.Echo, animFrames: 8, castPriority: 12, keepsChain: true, ...def });
  }
}
