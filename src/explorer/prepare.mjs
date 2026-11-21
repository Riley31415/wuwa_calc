// Builds src/explorer/build/: dist/src as tsc left it, with what the explorer's scripts need on top — each kit's
// presses exported (the kits keep them private) and every unmet cast condition warned, not once a team (each
// candidate's run is read on its own). Run after `npx tsc`, and again after any change to the tree.
import { appendFileSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const root = new URL("../../", import.meta.url), build = new URL("./build/", import.meta.url);
rmSync(build, { recursive: true, force: true });
cpSync(new URL("dist/src/", root), new URL("src/", build), { recursive: true });
mkdirSync(new URL("./out/", import.meta.url), { recursive: true });

const exportFrom = (file, lines) => appendFileSync(new URL(`src/resonators/spectro/${file}`, build), `\n${lines.join("\n")}\n`);
exportFrom("shorekeeper.js", [
  "export const __A = { BA1, BA2, BA3, BA4, MA, Skill, FHA, FMA, Illation, Transmutation, Liberation, Outro, Intro, EIntro,",
  "  FALLACY, SPACETREK_EXPLORER, FORMRENDER, Rotation, SWAPIN, BA123, BA23, BA12 };",
]);
exportFrom("lily.js", [
  "export const __A = { BA1, BA2, BA3, BA4, MA, DC, NightmareBlend: SkillPhantasm, WovenPhantasm, PhantasmsEnd, IntroFirst: IntroBase,",
  "  IntroEternal: IntroEternalPhantasm, IntroEternalFT: IntroEternalFairytale, Liberation, Outro, FALLACY, FORMRENDER, SPACETREK_EXPLORER,",
  "  Rotation, SWAPIN, BA12 };",
  "export const __B = { ReverieBlend: SkillFairytale, WovenFairytale, FairytalesFinale };",
  // the stand-in teammate the Shorekeeper loop bench hands to
  "export const __L = { IntroBase, Outro };",
]);

const evaluate = new URL("src/engine/evaluate.js", build);
const source = readFileSync(evaluate, "utf8");
const patched = source.replace(/^    warned\.add\(key\);$/m, "    warned.clear();");
if (patched === source) throw new Error("evaluate.js: the once-a-team warning guard has moved; update prepare.mjs");
writeFileSync(evaluate, patched);
console.log("src/explorer/build ready");
