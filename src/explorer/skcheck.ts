/**
 * Shorekeeper's shipped rotation over an opener and two loops in the bench's duo: each visit's time to its
 * Outro (the bench's own cooldown waits taken out) and the energy her presses generate in it.
 *
 *     npx tsc && node dist/src/explorer/skcheck.js
 */
import { fight, visits } from "./skbench.js";
import { SHOREKEEPER } from "../resonators/spectro/shorekeeper.js";

const shown = visits(fight(SHOREKEEPER.rotationAt(0), 3, true));
console.log(shown.map((v) => `${v.first.name.replace(/^.* - /, "")}: ${(v.frames / 60).toFixed(2)}s ${v.energy.toFixed(1)}E`).join(" | "));
