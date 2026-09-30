/** The report's stat entries and held buffs, and the one piece of a run's State the page reads. */
import type { StatKey } from "../engine/stats.js";
import type { Gear } from "./gear.js";

export interface StatEntry { stat: StatKey; value: number; source: string; owner: string | null; gear: Gear | null }

export interface HeldBuff {
  name: string;
  source: string;
  left: number;
}

/** What a traced run leaves for the loadout hovers: which equipped piece each granted buff came
 *  off, and on whose turn it landed. */
export interface State {
  grantedBy: Map<Gear, Gear>;
  grantedOn: Map<Gear, string>;
}
