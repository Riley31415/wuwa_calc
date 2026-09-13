/**
 * Every team the comparison table runs, by slot: each entry is three positions, and stands for
 * every team picking one loadout from each. A position names a bare loadout to be a main DPS, or a
 * list of loadouts to be a support running each in turn — a support with only one choice is still
 * a one-entry list. Position matters: slot 1 runs its opener. An `INTENDED` marker in front of an
 * entry marks that one entry as a real team rather than a combination the cross-product merely
 * allows. Workers are handed a team's index into `ALL_TEAMS` (`teamKey`), which both threads build
 * alike.
 */
import type { Loadout } from "./engine/gear.js";
import { teamPlayable } from "./engine/rotation.js";
import { CARTETHYIA } from "./resonators/aero/cartethyia.js";
import { CIACCONA } from "./resonators/aero/ciaccona.js";
import { IUNO, IUNO_MDPS } from "./resonators/aero/iuno.js";
import { JIANXIN } from "./resonators/aero/jianxin.js";
import { JIYAN } from "./resonators/aero/jiyan.js";
import { QINGXIAO } from "./resonators/aero/qingxiao.js";
import { QIUYUAN, QIUYUAN_MDPS } from "./resonators/aero/qiuyuan.js";
import { ROVER_AERO } from "./resonators/aero/rover_aero.js";
import { SIGRIKA, SIGRIKA_FAST } from "./resonators/aero/sigrika.js";
import { AUGUSTA } from "./resonators/electro/augusta.js";
import { BULING } from "./resonators/electro/buling.js";
import { HSIN_FLARE, HSIN_UNISON } from "./resonators/electro/hsin.js";
import { REBECCA } from "./resonators/electro/rebecca.js";
import { ROVER_ELECTRO, ROVER_ELECTRO_MDPS } from "./resonators/electro/rover_electro.js";
import { SUOMING, SUOMING_MDPS } from "./resonators/electro/suoming.js";
import { XIANGLI_YAO } from "./resonators/electro/xiangli_yao.js";
import { YINLIN } from "./resonators/electro/yinlin.js";
import { AEMEATH_BURST, AEMEATH_RUPTURE } from "./resonators/fusion/aemeath.js";
import { BRANT, BRANT_MDPS } from "./resonators/fusion/brant.js";
import { CHANGLI } from "./resonators/fusion/changli.js";
import { DENIA_BURST, DENIA_STRAIN } from "./resonators/fusion/denia.js";
import { ENCORE } from "./resonators/fusion/encore.js";
import { GALBRENA } from "./resonators/fusion/galbrena.js";
import { JINGRAN } from "./resonators/fusion/jingran.js";
import { LUPA } from "./resonators/fusion/lupa.js";
import { MORNYE } from "./resonators/fusion/mornye.js";
import { MORTEFI } from "./resonators/fusion/mortefi.js";
import { CARLOTTA } from "./resonators/glacio/carlotta.js";
import { HIYUKI } from "./resonators/glacio/hiyuki.js";
import { LUCILLA, LUCILLA_CHAFE } from "./resonators/glacio/lucilla.js";
import { SANHUA } from "./resonators/glacio/sanhua.js";
import { SUISUI } from "./resonators/glacio/suisui.js";
import { ZHEZHI } from "./resonators/glacio/zhezhi.js";
import {  CAMELLYA_DOUBLE } from "./resonators/havoc/camellya.js";
import { CANTARELLA, CANTARELLA_MDPS } from "./resonators/havoc/cantarella.js";
import { CHISA } from "./resonators/havoc/chisa.js";
import { DANJIN } from "./resonators/havoc/danjin.js";
import { PHRO_12s, PHRO_14s, PHROLO_10s as PHRO_10s, PHROLO_10s } from "./resonators/havoc/phrolova.js";
import { ROCCIA, ROCCIA_MDPS } from "./resonators/havoc/roccia.js";
import { ROVER_HAVOC } from "./resonators/havoc/rover_havoc.js";
import { XUANLING, XUANLING_2F } from "./resonators/havoc/xuanling.js";
import { JINHSI, JINHSI_SUPPORT } from "./resonators/spectro/jinhsi.js";
import { LUCY } from "./resonators/spectro/lucy.js";
import { LUUK } from "./resonators/spectro/luuk.js";
import { LYNAE_RUPTURE, LYNAE_STRAIN } from "./resonators/spectro/lynae.js";
import { ROVER_SPECTRO } from "./resonators/spectro/rover_spectro.js";
import { SHOREKEEPER } from "./resonators/spectro/shorekeeper.js";
import { VERINA } from "./resonators/spectro/verina.js";

/** One position in a team: the main DPS bare, or the list of loadouts a support position runs. */
type Slot = Loadout | Loadout[];

/** Marks the one team entry that follows it as intended — a pairing whose supports are each
 *  actually consumed, not merely a combination the slot cross-product allows. Reaches exactly one
 *  entry: every team you want on the Intended view names its own marker. */
const INTENDED: Slot[] = [];

const TEAMS: Slot[][] = [

  // suoming mdps, electro basic unison
  INTENDED, [[SHOREKEEPER], [SANHUA, JINHSI_SUPPORT], SUOMING_MDPS],
  INTENDED, [[SHOREKEEPER, MORNYE], [LYNAE_RUPTURE], SUOMING_MDPS],
  [[VERINA, MORNYE, SUISUI], [SANHUA, LYNAE_RUPTURE, REBECCA, JINHSI_SUPPORT], SUOMING_MDPS],
  // dual dps long rot
  // [[SHOREKEEPER, VERINA, BULING, MORNYE, SUISUI], [SUOMING_MDPS], [JINHSI]],

  // hsin, Unison mode: Suoming or Jinhsi behind her hands over the Unison her Intro answers
  INTENDED, [[SHOREKEEPER], [SUOMING], HSIN_UNISON],
  INTENDED, [[SUOMING], HSIN_UNISON, [JINHSI_SUPPORT]],
  [[VERINA, MORNYE, SUISUI, PHRO_10s, BULING], [SUOMING], HSIN_UNISON],

  // hsin (Electro Flare mode): electro skill flare
  INTENDED, [[SUISUI, BULING, CHISA], [ROVER_ELECTRO], HSIN_FLARE],
  [[SHOREKEEPER, MORNYE, SUISUI, BULING, CHISA], [LYNAE_RUPTURE, REBECCA, CHISA, ], HSIN_FLARE],

  // jinhsi: spectro skill
  INTENDED, [[SHOREKEEPER, VERINA], [ZHEZHI, CANTARELLA, SUOMING, HSIN_UNISON, YINLIN], JINHSI],
  [[MORNYE, SUISUI, SHOREKEEPER, VERINA, BULING], [LYNAE_RUPTURE, REBECCA, ZHEZHI, CANTARELLA, SUOMING, HSIN_UNISON, YINLIN], JINHSI],

  // electro rover mdps: Apex Resonance, the Thrum of All Sounds chains
  INTENDED, [[BULING, CHISA, SHOREKEEPER, MORNYE], [LYNAE_RUPTURE], ROVER_ELECTRO_MDPS],
  [[BULING, CHISA, SHOREKEEPER, VERINA, MORNYE, SUISUI], [LYNAE_RUPTURE, REBECCA], ROVER_ELECTRO_MDPS],

  // jingran: fusion heavy shielder
  INTENDED, [[SHOREKEEPER], [IUNO, MORTEFI], JINGRAN],
  INTENDED, [[LUPA], [MORTEFI, BRANT], JINGRAN],
  INTENDED, [[MORNYE], [LUPA, REBECCA], JINGRAN],
  [[SHOREKEEPER,VERINA, MORNYE, SUISUI], [IUNO, MORTEFI, REBECCA, LYNAE_RUPTURE, LUPA], JINGRAN],

  // qingxiao: aero heavy/basic/liberation on tune strain
  INTENDED,[[MORNYE, SHOREKEEPER], [DENIA_STRAIN, LYNAE_STRAIN], QINGXIAO],
  [[MORNYE, SHOREKEEPER, VERINA, ROVER_AERO, CIACCONA], [DENIA_STRAIN, LYNAE_STRAIN, ROVER_AERO, CIACCONA, SANHUA, MORTEFI, REBECCA, JIANXIN], QINGXIAO],

  // xuanling: havoc heavy attack on Havoc Bane — Chisa's +3 to every Negative Status cap is what
  // takes Unbroken Vow off its 3-stack 30% tier onto the 4-6 stack 36% one
  INTENDED, [[SUISUI, CHISA], [MORTEFI, REBECCA, IUNO, PHRO_10s, CHISA], XUANLING],
  [[MORNYE, VERINA, SHOREKEEPER, SUISUI, CHISA], [MORTEFI, REBECCA, LYNAE_RUPTURE, IUNO, PHRO_10s, ROVER_ELECTRO], XUANLING],

  // lucy: spectro heavy on tune hack, with rebecca feeding her the outro
  INTENDED, [[MORNYE, SHOREKEEPER], [REBECCA], LUCY],
  [[VERINA, SUISUI, MORNYE], [REBECCA, MORTEFI, LYNAE_RUPTURE], LUCY],

  // hiyuki: glacio chafe/bite — every stack the team lands calculates at the target's own limit,
  // which is why Chisa (+3 to it) and Lucilla's Chafe build stand behind her
  INTENDED, [[SUISUI, CHISA], [LUCILLA_CHAFE, LYNAE_RUPTURE], HIYUKI],
  INTENDED, [[MORNYE], [LYNAE_RUPTURE], HIYUKI],
  [[SUISUI, VERINA, SHOREKEEPER, MORNYE, CHISA], [LUCILLA_CHAFE, CHISA, LYNAE_RUPTURE, JIANXIN, ROVER_ELECTRO, ZHEZHI], HIYUKI],
  [PHRO_10s, [LUCILLA], HIYUKI],
  [[SUISUI], PHRO_10s, HIYUKI],
  [[SUISUI], CARLOTTA, HIYUKI],
  [HIYUKI, CARLOTTA, [LUCILLA_CHAFE]],

  // sigrika: aero + echo
  INTENDED, [PHRO_10s, [QIUYUAN, LUCILLA], SIGRIKA_FAST],
  INTENDED, [[SHOREKEEPER], [QIUYUAN, LUCILLA], SIGRIKA],
  INTENDED, [[CIACCONA], [QIUYUAN], SIGRIKA],
  INTENDED, [[QIUYUAN], [LUCILLA], SIGRIKA_FAST],
  [[SHOREKEEPER, VERINA, MORNYE], [QIUYUAN, LUCILLA, CANTARELLA, ROVER_AERO, CIACCONA, LYNAE_RUPTURE], SIGRIKA],
  [[CIACCONA, ROVER_AERO, SUISUI], [QIUYUAN, LUCILLA, CANTARELLA, ROVER_AERO, CIACCONA, LYNAE_RUPTURE], SIGRIKA_FAST],
  [[QIUYUAN], SIGRIKA, [IUNO]],

  // luuk: spectro basic, tune strain
  [[SHOREKEEPER, MORNYE], [LYNAE_STRAIN, SANHUA, DENIA_STRAIN], LUUK],
  [[SHOREKEEPER, VERINA, MORNYE, SUISUI], [LYNAE_STRAIN, SANHUA, DENIA_STRAIN, ROVER_SPECTRO], LUUK],

  // aemeath: fusion liberation on tune rupture — Mornye and Lynae answer the break beside her
  INTENDED, [[MORNYE], [LYNAE_RUPTURE, CHANGLI, LUPA], AEMEATH_RUPTURE],
  INTENDED, [[LUPA], [CHANGLI], AEMEATH_RUPTURE], // TODO CHECK
  [[SHOREKEEPER, VERINA, MORNYE, LUPA], [LYNAE_RUPTURE, LUPA, CHANGLI, JIANXIN], AEMEATH_RUPTURE],
  [[MORNYE, LUPA], [BRANT], AEMEATH_RUPTURE],
  [[DENIA_BURST], [LYNAE_RUPTURE], AEMEATH_RUPTURE],
  [[MORNYE], [DENIA_BURST], AEMEATH_RUPTURE],

  // aemeath: fusion liberation on fusion burst — Denia's Burst mode feeds the stacks and amplifies
  INTENDED, [[SUISUI, CHISA, LUPA], [DENIA_BURST], AEMEATH_BURST],
  INTENDED, [[DENIA_BURST], [LYNAE_RUPTURE, CHANGLI], AEMEATH_BURST],
  [[SHOREKEEPER, VERINA, MORNYE, LUPA, DENIA_BURST, CHISA, SUISUI], [DENIA_BURST, LUPA, JIANXIN, ROVER_ELECTRO], AEMEATH_BURST],
  // monofus needs lupa or denia
  [[LUPA, DENIA_BURST], [CHANGLI, BRANT], AEMEATH_BURST],
  // lynae rupture only with denia burst 3rd slot
  [[DENIA_BURST], [LYNAE_RUPTURE], AEMEATH_BURST],

  // qiuyuan: aero heavy echo
  INTENDED, [[SHOREKEEPER], [MORTEFI, IUNO, REBECCA], QIUYUAN_MDPS],
  [[SHOREKEEPER, VERINA, ROVER_AERO, CIACCONA, MORNYE, SUISUI], [MORTEFI, IUNO, CIACCONA, LYNAE_RUPTURE, REBECCA, ROVER_AERO, LUCILLA], QIUYUAN_MDPS],
  [[SHOREKEEPER, VERINA, ROVER_AERO, CIACCONA, MORNYE, SUISUI], PHRO_10s, QIUYUAN_MDPS],

  // galbrena: fusion echo and heavy
  INTENDED, [[SHOREKEEPER], [QIUYUAN, LUCILLA], GALBRENA],
  INTENDED, [[LUPA], [MORTEFI, GALBRENA], GALBRENA],
  INTENDED, [[MORNYE], [LUPA], GALBRENA],
  [[SHOREKEEPER, VERINA, LUPA, QIUYUAN, MORNYE, DENIA_BURST], [QIUYUAN, LUCILLA], GALBRENA],
  [PHRO_10s, [QIUYUAN, LUCILLA], GALBRENA],
  [[SHOREKEEPER, VERINA, LUPA, MORNYE, DENIA_BURST, SUISUI], [BRANT, MORTEFI, IUNO, LUPA, LYNAE_RUPTURE, REBECCA], GALBRENA],

  // iuno mdps: aero + echo
  INTENDED, [[SHOREKEEPER, MORNYE], [LYNAE_RUPTURE], IUNO_MDPS],
  INTENDED, [[CIACCONA], [JIANXIN], IUNO_MDPS],
  [[SHOREKEEPER, ROVER_AERO, CIACCONA, VERINA, MORNYE, SUISUI], [ROVER_AERO, CIACCONA, LYNAE_RUPTURE, JIANXIN], IUNO_MDPS],

  // augusta: electro heavy shielder
  INTENDED, [[SHOREKEEPER], [IUNO, MORTEFI, REBECCA], AUGUSTA],
  [[SHOREKEEPER, VERINA, MORNYE, SUISUI], [IUNO, MORTEFI, LYNAE_RUPTURE, REBECCA], AUGUSTA],

  // phrolova: havoc, echo, skill
  INTENDED, [PHRO_10s, [ROCCIA, LUCILLA], [CANTARELLA]],
  INTENDED, [PHRO_10s, [QIUYUAN], [CANTARELLA, LUCILLA]],
  INTENDED, [PHRO_12s, [SHOREKEEPER], [CANTARELLA, LUCILLA, QIUYUAN]],

  [PHRO_14s, [VERINA], [QIUYUAN, DANJIN, LUCILLA, CANTARELLA, LYNAE_RUPTURE]],
  [PHRO_14s, [QIUYUAN, ROCCIA, DANJIN], [VERINA]],
  [PHRO_12s, [SHOREKEEPER, BULING, MORNYE, SUISUI], [QIUYUAN, DANJIN, LUCILLA, CANTARELLA, LYNAE_RUPTURE, ROCCIA]],
  [PHRO_12s, [QIUYUAN, ROCCIA, DANJIN], [SHOREKEEPER, SUISUI, MORNYE]],
  [PHRO_10s, [QIUYUAN, LUCILLA, LYNAE_RUPTURE, DANJIN, ROCCIA], [LUCILLA, QIUYUAN, LYNAE_RUPTURE, CANTARELLA]],
  [PHRO_10s, [JINHSI_SUPPORT], [CANTARELLA]],

  // cartethyia: aero HP-scaling basic attack on Aero Erosion — Aero Rover and Chisa both raise the
  // status's own cap, which is what her Erosion ticks and her Blade's amplification both read
  INTENDED, [[CIACCONA], [ROVER_AERO, CHISA], CARTETHYIA],
  INTENDED, [[CHISA, ROVER_AERO, CIACCONA], [SANHUA, ROVER_AERO], CARTETHYIA],
  [[SUISUI, CHISA, ROVER_AERO, CIACCONA, SHOREKEEPER, SUISUI, MORNYE], [SANHUA, ROVER_AERO, CHISA], CARTETHYIA],

  // brant: fusion basic
  INTENDED, [[SHOREKEEPER], [SANHUA, LUPA], BRANT_MDPS],
  INTENDED, [[MORNYE], [LUPA], BRANT_MDPS],
  [[MORNYE, DENIA_BURST, VERINA, SHOREKEEPER, SUISUI], [SANHUA, LUPA, DENIA_BURST], BRANT_MDPS],
  INTENDED, [[LUPA], BRANT, CHANGLI],
  [[LUPA], BRANT, ENCORE],

  // cantarella: havoc basic, echo
  //INTENDED, [[SHOREKEEPER], [SANHUA, ROCCIA], CANTARELLA_MDPS],
  [[SHOREKEEPER, VERINA, MORNYE, SUISUI], [SANHUA, ROCCIA, LYNAE_RUPTURE, REBECCA], CANTARELLA_MDPS],

  // carlotta: glacio skill
  INTENDED, [[SHOREKEEPER, BULING], [ZHEZHI], CARLOTTA],
  INTENDED, [[MORNYE], [LYNAE_RUPTURE], CARLOTTA],
  [[SHOREKEEPER, BULING, VERINA, MORNYE, SUISUI], [BRANT, ZHEZHI, LYNAE_RUPTURE, REBECCA, LUCILLA_CHAFE], CARLOTTA],

  // roccia: havoc heavy
  //INTENDED, [[SHOREKEEPER], [MORTEFI, IUNO, REBECCA], ROCCIA_MDPS],
  [[SHOREKEEPER, VERINA, MORNYE, SUISUI], [MORTEFI, IUNO, LYNAE_RUPTURE, REBECCA], ROCCIA_MDPS],
  [[SHOREKEEPER, VERINA, MORNYE, SUISUI], PHROLO_10s, ROCCIA_MDPS],

  // camellya: havoc basic
  INTENDED, [[SHOREKEEPER], [SANHUA, ROCCIA], CAMELLYA_DOUBLE],
   [[VERINA, SUISUI, MORNYE], [SANHUA, ROCCIA], CAMELLYA_DOUBLE],

  // xiangli yao: electro liberation
  INTENDED, [[MORNYE], [LYNAE_RUPTURE], XIANGLI_YAO],
  INTENDED, [[SHOREKEEPER], [YINLIN, LYNAE_RUPTURE], XIANGLI_YAO],
  [[SHOREKEEPER, VERINA, MORNYE, SUISUI], [YINLIN, LYNAE_RUPTURE, JIANXIN], XIANGLI_YAO],

  // changli: fusion skill+liberation
  INTENDED, [[MORNYE, SHOREKEEPER], [LUPA, LYNAE_RUPTURE], CHANGLI],
  INTENDED, [[DENIA_BURST], [LUPA], CHANGLI],
  [[LUPA, MORNYE, SHOREKEEPER, DENIA_BURST, VERINA, SUISUI], [DENIA_BURST, LYNAE_RUPTURE, LUPA], CHANGLI],

  // jiyan: aero heavy
  INTENDED, [[SHOREKEEPER], [MORTEFI, IUNO, CIACCONA, REBECCA, PHRO_10s], JIYAN],
  INTENDED, [[CIACCONA], [IUNO], JIYAN],
  [[SHOREKEEPER, VERINA, ROVER_AERO, CIACCONA, MORNYE, SUISUI], [MORTEFI, IUNO, CIACCONA, LYNAE_RUPTURE, REBECCA, PHRO_10s, ROVER_AERO], JIYAN],

  // encore: fusion basic
  //[[SHOREKEEPER, VERINA, DENIA_BURST, LUPA], [LUPA, SANHUA, DENIA_BURST], ENCORE],
  //[[LUPA], ENCORE, [CHANGLI, BRANT]],

  // havoc rover: havoc, mixed
  //[[SHOREKEEPER, VERINA, MORNYE], [ROCCIA, DANJIN, SANHUA, LYNAE_RUPTURE, CANTARELLA], ROVER_HAVOC],
];

/** `mdps[i]`: whether slot i is one of the team's main DPS — per team, never stamped on the shared
 *  Loadout. `intended`: whether an `INTENDED` marker stood in front of the entry this came from. */
export interface TeamEntry { loadouts: Loadout[]; mdps: boolean[]; intended: boolean }

/** Teams the scheduler can't play — thrown below so the roster's mistake shows on the loading screen. */
const UNPLAYABLE_TEAMS: { names: string[]; why: string }[] = [];

/** `TEAMS` with its markers read off: the real entries, each carrying whether one stood before it. */
const MARKED: { slots: Slot[]; intended: boolean }[] = TEAMS.flatMap((slots, i) => {
  if (slots !== INTENDED) return [{ slots, intended: i > 0 && TEAMS[i - 1] === INTENDED }];
  // a marker reaches exactly one entry, so two in a row or one at the end marks nothing
  if (TEAMS[i + 1] === undefined || TEAMS[i + 1] === INTENDED) {
    throw new Error(`teams.ts has an INTENDED marker at index ${i} with no team entry after it`);
  }
  return [];
});

/** A stable number per distinct Loadout, so a team's identity is the objects it holds rather than
 *  the names on them — Phrolova's three loadouts share a resonator and a mode, and are not the same. */
const LOADOUT_ID = new Map<Loadout, number>();
const idOf = (l: Loadout): number => {
  const seen = LOADOUT_ID.get(l);
  if (seen !== undefined) return seen;
  LOADOUT_ID.set(l, LOADOUT_ID.size);
  return LOADOUT_ID.size - 1;
};

/** `TEAMS` expanded: every pick of one loadout per slot, minus any that repeats a resonator. */
const EXPANDED: TeamEntry[] = MARKED.flatMap(({ slots, intended }) => {
  // a bare loadout is a main DPS; a list is a support position, however many choices it holds
  const mdps = slots.map((s) => !Array.isArray(s));
  const [a, b, c] = slots.map((s) => (Array.isArray(s) ? [...new Set(s)] : [s]));
  if (!mdps.some(Boolean)) {
    const names = [a, b, c].map((s) => s!.map((l) => l.resonator.name).join("/")).join(", ");
    throw new Error(`the team [${names}] has no bare loadout naming its main DPS`);
  }
  return a!.flatMap((x) => b!.flatMap((y) => c!.map((z) => ({ loadouts: [x, y, z], mdps, intended }))))
    .filter((team) => new Set(team.loadouts.map((l) => l.resonator)).size === team.loadouts.length)
    // every chain level its members declare rotations for must be playable (rotation.ts `teamPlayable()`)
    .filter((team) => {
      const names = team.loadouts.map((l) => l.resonator.name);
      const [x, y, z] = team.loadouts.map((l) => l.rotations);
      let why: string | null = null;
      for (const rx of x!) for (const ry of y!) for (const rz of z!) why ??= teamPlayable([rx, ry, rz], names);
      if (why) UNPLAYABLE_TEAMS.push({ names, why });
      return why === null;
    });
});
/** One row per distinct team. The same three loadouts, in the same three positions, with the same
 *  main-DPS slots, is the same fight however many entries produced it — the `INTENDED` rows and the
 *  general rows under them overlap constantly. First occurrence keeps its place; `intended` anywhere
 *  in a group marks the survivor, since the marker is a statement about the pairing, not the row. */
export const ALL_TEAMS: TeamEntry[] = [...EXPANDED.reduce((by, team) => {
  const key = `${team.loadouts.map(idOf).join(".")}|${team.mdps.map(Number).join("")}`;
  const seen = by.get(key);
  if (seen) seen.intended ||= team.intended;
  else by.set(key, team);
  return by;
}, new Map<string, TeamEntry>()).values()];

if (UNPLAYABLE_TEAMS.length) {
  throw new Error(`teams.ts lists ${UNPLAYABLE_TEAMS.length} team(s) the scheduler can't play:\n`
    + UNPLAYABLE_TEAMS.map((t) => `  ${t.names.join(" / ")} — ${t.why}`).join("\n"));
}

/** A team's key: its slot in `ALL_TEAMS`. No dash — a row key is this plus per-member combo keys. */
export const teamKey = (index: number): string => `t${index}`;

/** `undefined` for a stale key, so an old bookmark falls back to the table. */
export const teamAt = (key: string): TeamEntry | undefined =>
  /^t\d+$/.test(key) ? ALL_TEAMS[Number(key.slice(1))] : undefined;
