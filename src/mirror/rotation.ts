/**
 * The engine's actions as the detail page reads them: a traced row's press, its bullets and the
 * frames it charged — mirrored from the WebAssembly engine's reply, one object per action id.
 */
import { ActionTag, INSTA_DELAY, EASY_DELAY, CANCEL_DELAY } from "../engine/stats.js";
import type { Attribute, Type, Subtype, Cast, Node, Scaling } from "../engine/stats.js";
import { call } from "../engine/wasm.js";
import type { Loadout } from "./gear.js";

export { ActionTag };

/** One bullet of a press, every tag resolved. */
export interface Bullet {
  hitFrame: number; commitFrame: number; mv: number; energy: number; concerto: number; offtune: number;
  forte1: number; forte2: number; forte3: number; forte4: number; forte5: number;
  element: Attribute | null; type: Type | null; subtype: Subtype | null;
}

/** A field a summon's hits and the Buff that opens it both name (a report grouping only). */
export interface ActionField { name: string }

export interface ActionJson {
  id: number; gear: number; name: string; cast: Cast | null; subcast: Cast | null; node: Node | null; scaling: Scaling | null;
  mv: number; energy: number; concerto: number; offtune: number; castEnergy: number; castConcerto: number;
  castForte: number[]; forte: number[]; resetForte: boolean[]; resetEnergy: boolean;
  bullets: { hitFrame: number; commitFrame: number; mv: number; energy: number; concerto: number; offtune: number; forte: number[]; element: Attribute | null; type: Type | null; subtype: Subtype | null }[];
  animFrames: number; prioFrames: number; qteFrames: number; timestop: number; motionStop: number; tag: ActionTag;
  half: "cast" | "hit" | "end" | null; hitsAtCast: boolean; onHitAt: number | null;
  cancelOf: number | null; formOf: number | null; field: string | null; castPart: number | null;
}

const ACTIONS = new Map<number, Action>();
const FIELDS = new Map<string, ActionField>();

/** A cast: its tags, what it deals and banks, and its frames. */
export class Action {
  readonly id: number;
  readonly gear: number;
  readonly name: string;
  readonly cast: Cast | null;
  readonly subcast: Cast | null;
  readonly node: Node | null;
  readonly scaling: Scaling | null;
  readonly mv: number;
  readonly energy: number;
  readonly concerto: number;
  readonly offtune: number;
  readonly castEnergy: number;
  readonly castConcerto: number;
  readonly castForte: number[];
  readonly forte1: number;
  readonly forte2: number;
  readonly forte3: number;
  readonly forte4: number;
  readonly forte5: number;
  readonly resetForte: boolean[];
  readonly resetEnergy: boolean;
  readonly bullets: Bullet[];
  readonly animFrames: number;
  readonly prioFrames: number;
  readonly qteFrames: number;
  readonly timestop: number;
  readonly motionStop: number;
  readonly tag: ActionTag;
  readonly half: "cast" | "hit" | "end" | null;
  readonly hitsAtCast: boolean;
  readonly onHitAt: number | null;
  readonly field: ActionField | null;
  private readonly links: { cancelOf: number | null; formOf: number | null; castPart: number | null };
  constructor(j: ActionJson) {
    this.id = j.id;
    this.gear = j.gear;
    this.name = j.name;
    this.cast = j.cast;
    this.subcast = j.subcast;
    this.node = j.node;
    this.scaling = j.scaling;
    this.mv = j.mv;
    this.energy = j.energy;
    this.concerto = j.concerto;
    this.offtune = j.offtune;
    this.castEnergy = j.castEnergy;
    this.castConcerto = j.castConcerto;
    this.castForte = j.castForte;
    [this.forte1, this.forte2, this.forte3, this.forte4, this.forte5] = j.forte as [number, number, number, number, number];
    this.resetForte = j.resetForte;
    this.resetEnergy = j.resetEnergy;
    this.bullets = j.bullets.map((b) => ({
      hitFrame: b.hitFrame, commitFrame: b.commitFrame, mv: b.mv, energy: b.energy, concerto: b.concerto, offtune: b.offtune,
      forte1: b.forte[0]!, forte2: b.forte[1]!, forte3: b.forte[2]!, forte4: b.forte[3]!, forte5: b.forte[4]!,
      element: b.element, type: b.type, subtype: b.subtype,
    }));
    this.animFrames = j.animFrames;
    this.prioFrames = j.prioFrames;
    this.qteFrames = j.qteFrames;
    this.timestop = j.timestop;
    this.motionStop = j.motionStop;
    this.tag = j.tag;
    this.half = j.half;
    this.hitsAtCast = j.hitsAtCast;
    this.onHitAt = j.onHitAt;
    this.field = j.field === null ? null : FIELDS.get(j.field) ?? (FIELDS.set(j.field, { name: j.field }), FIELDS.get(j.field)!);
    this.links = { cancelOf: j.cancelOf, formOf: j.formOf, castPart: j.castPart };
  }
  get lastBullet(): Bullet | null { return this.bullets[this.bullets.length - 1] ?? null; }
  get cancelOf(): Action | null { return this.links.cancelOf === null ? null : actionById(this.links.cancelOf); }
  get formOf(): Action | null { return this.links.formOf === null ? null : actionById(this.links.formOf); }
  /** Where a cancel cuts this press: its last bullet committed, and never inside its priority. */
  get cutFrame(): number {
    let at = this.prioFrames;
    for (const b of this.bullets) at = Math.max(at, b.commitFrame);
    return at;
  }
  /** The cast of a press whose hits were queued. */
  castPart(): Action { return this.links.castPart === null ? this : actionById(this.links.castPart); }
  /** rotation.ts's cancelCost: what the clock charged this press cut short by `cut`. */
  cost(cut: ActionTag | null): { action: number; timestop: number; global: number; total: number } {
    const full = this.animFrames;
    const tag = cut ?? this.tag;
    const insta = tag === ActionTag.InstaCancel || tag === ActionTag.InstaDodge || tag === ActionTag.InstaJump || tag === ActionTag.InstaSwap;
    const whole = this.half === "cast" ? this.formOf ?? this : this;
    const action = tag === ActionTag.Default ? full : tag === ActionTag.Field || insta ? 0 : Math.min(whole.onHitAt ?? whole.cutFrame, full);
    const timestop = Math.min(this.timestop, action);
    const global = tag === ActionTag.InstaSwap || tag === ActionTag.SwapCancel ? 0 : insta ? INSTA_DELAY : tag === ActionTag.EasyCancel ? EASY_DELAY
      : tag === ActionTag.Cancel || tag === ActionTag.DodgeCancel || tag === ActionTag.JumpCancel || tag === ActionTag.HitCancel || tag === ActionTag.DodgeOnHit || tag === ActionTag.JumpOnHit ? CANCEL_DELAY : 0;
    return { action, timestop, global, total: action - timestop + global };
  }
}

export function addAction(j: ActionJson): Action {
  let a = ACTIONS.get(j.id);
  if (!a) ACTIONS.set(j.id, (a = new Action(j)));
  return a;
}
export function actionById(id: number): Action {
  const a = ACTIONS.get(id);
  if (!a) throw new Error(`no Action #${id} mirrored`);
  return a;
}

/** Why a team can't be scheduled on any of the rotations its members declare, or null. */
export const teamPlayable = (loadouts: Loadout[]): string | null =>
  call<string | null>({ op: "teamPlayable", members: loadouts.map((l) => l.export) });
