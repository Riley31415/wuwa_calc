/**
 * The option boxes more than one page shows in its aside: Team Cost and Matrix Buffs. Markup only —
 * each page wires its own change handlers (table.ts on the main page, value.ts and tierlist.ts).
 */
import type { TeamCost } from "../solve/solver.js";

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const COST_HELP = [
  "s0r0 all - Limited resonators are S0 and use the best standard or 4* weapon available at R1. Rover and 4* resonators are S6.",
  "s0r1 mdps +r0 supports - Each team gets a single signature weapon at R1, on whichever of its main DPS gives the best DPR increase — never a support. Dual DPS teams still only get one signature weapon.",
  "s0r1 all - All limited resonators get their best signature weapon, while Rover and 4* supports may still use standard or 4* weapons.",
  "s2r1 / s3r1 / s6r1 mdps +r1 supports - One main DPS per team runs that many sequence nodes, whichever gives the best DPR increase — never a support. Everyone else stays S0 on their own signature at R1.",
  "s6r1 mdps +s2r1 supports - As above at S6, with everyone else at S2 on their own signature at R1.",
  "s6r5 mdps +s0r1 supports - One main DPS per team is S6 with their signature at R5, whichever gives the best DPR increase — never a support. Everyone else stays S0 on their own signature at R1.",
  "s6r5 all - Every resonator is S6 with their best weapon at R5.",
];

const COST_LABEL: [TeamCost, string][] = [
  ["s0r0", "s0r0 all"], ["s0r1mdps", "s0r1 mdps +r0 supports"], ["s0r1", "s0r1 all"],
  ["s2r1mdps", "s2r1 mdps +r1 supports"], ["s3r1mdps", "s3r1 mdps +r1 supports"], ["s6r1mdps", "s6r1 mdps +r1 supports"],
  ["s6r1mdps_s2r1", "s6r1 mdps +s2r1 supports"], ["s6r5mdps", "s6r5 mdps +s0r1 supports"], ["s6r5", "s6r5 all"],
];

/** The Team Cost box: its name opens the description (`data-help="cost"`), the select is `#cost`. */
export function costBox(cost: TeamCost, open: boolean): string {
  return `<div class="tcopt${open ? " open" : ""}">`
    + `<div class="tcopt-head">`
    + `<button type="button" class="tcopt-name" data-help="cost" aria-expanded="${open}">Team Cost<span class="arrow">›</span></button>`
    + `<select id="cost" class="tcselect" aria-label="Team Cost" title="Team Cost">`
    + COST_LABEL.map(([value, label]) => `<option value="${value}"${cost === value ? " selected" : ""}>${label}</option>`).join("")
    + `</select></div>`
    + `<div class="tcopt-desc"${open ? "" : " hidden"}><ul>${COST_HELP.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></div>`
    + `</div>`;
}

/** The Matrix Buffs box: one toggle for every kit's Matrix (`#matrixToggle`). */
export function matrixBox(on: boolean, open: boolean): string {
  return `<div class="tcopt${open ? " open" : ""}">`
    + `<div class="tcopt-head">`
    + `<button type="button" class="tcopt-name" data-help="matrix" aria-expanded="${open}">Matrix Buffs<span class="arrow">›</span></button>`
    + `<input type="checkbox" id="matrixToggle" aria-label="Matrix Buffs" title="Matrix Buffs"${on ? " checked" : ""}>`
    + `</div>`
    + `<div class="tcopt-desc"${open ? "" : " hidden"}><ul><li>Enables Endstate Matrix exclusive resonator buffs</li><li>Neutral Matrix Score is calculated ignoring elements and using only a 20% general damage enhancement.</li></ul></div>`
    + `</div>`;
}
