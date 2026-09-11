/**
 * Every team the comparison table runs, by slot: each entry is three lists, one per position, and
 * stands for every team picking one loadout from each. A one-loadout slot is a main DPS; a fixed
 * support says it is *not* one by naming its loadout twice. Position matters: slot 1 runs its opener.
 * Workers are handed a team's index into `ALL_TEAMS` (`teamKey`), which both threads build alike.
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
import { PHRO_12s, PHRO_14s, PHROLO_10s } from "./resonators/havoc/phrolova.js";
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

const TEAMS: Loadout[][][] = [

  // suoming mdps, electro basic unison
  [[SHOREKEEPER, VERINA, MORNYE, SUISUI], [SANHUA, LYNAE_RUPTURE, REBECCA, JINHSI_SUPPORT], [SUOMING_MDPS]],
  // dual dps long rot
  // [[SHOREKEEPER, VERINA, BULING, MORNYE, SUISUI], [SUOMING_MDPS], [JINHSI]],

  // hsin, Unison mode: Suoming or Jinhsi behind her hands over the Unison her Intro answers
  [[SHOREKEEPER, VERINA, BULING, MORNYE, SUISUI], [SUOMING, SUOMING], [HSIN_UNISON]],
  //[[HSIN_UNISON], [JINHSI_SUPPORT, JINHSI_SUPPORT], [SUOMING, SUOMING], ],
  [[SUOMING, SUOMING], [HSIN_UNISON], [JINHSI_SUPPORT, JINHSI_SUPPORT], ],
  [[PHROLO_10s], [SUOMING, SUOMING], [HSIN_UNISON], ],
  //[[JINHSI_SUPPORT, JINHSI_SUPPORT], [SUOMING, SUOMING], [HSIN_UNISON], ],

  // jinhsi: spectro skill
  [[SHOREKEEPER, VERINA, MORNYE, BULING, ZHEZHI, SUISUI], [ZHEZHI, YINLIN, CANTARELLA, LYNAE_RUPTURE, REBECCA, SUOMING, HSIN_UNISON], [JINHSI]],
  // both worse with jinhsi first
  // [[SHOREKEEPER, VERINA, MORNYE, BULING, ZHEZHI, SUISUI], [JINHSI], [SUOMING, HSIN_UNISON]],

  // hsin (Electro Flare mode): electro skill flare
  [[SUISUI, BULING, CHISA, SHOREKEEPER, MORNYE], [CHISA, ROVER_ELECTRO, LYNAE_RUPTURE, REBECCA], [HSIN_FLARE]],

  // electro rover mdps: Apex Resonance, the Thrum of All Sounds chains
  [[BULING, CHISA, SHOREKEEPER, VERINA, MORNYE, SUISUI], [LYNAE_RUPTURE, REBECCA], [ROVER_ELECTRO_MDPS]],

  // jingran: fusion heavy shielder
  [[SHOREKEEPER, LUPA, VERINA, MORNYE], [IUNO, MORTEFI, BRANT, LUPA, LYNAE_RUPTURE, REBECCA], [JINGRAN]],

  // qingxiao: aero heavy/basic/liberation on tune strain
  [[MORNYE, SHOREKEEPER, VERINA, ROVER_AERO, CIACCONA], [DENIA_STRAIN, LYNAE_STRAIN, ROVER_AERO, CIACCONA, SANHUA, MORTEFI, REBECCA, JIANXIN], [QINGXIAO]],

  // xuanling: havoc heavy attack on Havoc Bane — Chisa's +3 to every Negative Status cap is what
  // takes Unbroken Vow off its 3-stack 30% tier onto the 4-6 stack 36% one
  [[SUISUI, MORNYE, CHISA, VERINA, SHOREKEEPER], [MORTEFI, REBECCA, LYNAE_RUPTURE, IUNO, PHROLO_10s, ROVER_ELECTRO], [XUANLING]],
  // faster supports = 2F rot with chisa
  [[VERINA, SHOREKEEPER], [CHISA, CHISA], [XUANLING_2F]],
  [[SUISUI, MORNYE], [CHISA, CHISA], [XUANLING]],

  // hiyuki: glacio chafe/bite — every stack the team lands calculates at the target's own limit,
  // which is why Chisa (+3 to it) and Lucilla's Chafe build stand behind her
  [[SUISUI, VERINA, SHOREKEEPER, MORNYE, CHISA], [LUCILLA_CHAFE, CHISA, LYNAE_RUPTURE, JIANXIN, ROVER_ELECTRO, ZHEZHI], [HIYUKI]],
  [[HIYUKI],[LUCILLA_CHAFE, LUCILLA_CHAFE], [LYNAE_RUPTURE, JIANXIN, ROVER_ELECTRO, ZHEZHI],],

  [[PHROLO_10s], [LUCILLA, LUCILLA], [HIYUKI]],
  [[SUISUI, SUISUI], [PHROLO_10s], [HIYUKI]],
  [[SUISUI, SUISUI], [CARLOTTA], [HIYUKI]],
  [[HIYUKI], [CARLOTTA], [LUCILLA_CHAFE, LUCILLA_CHAFE], ],

  // lucy: spectro heavy on tune hack, with rebecca feeding her the outro
  [[VERINA, MORNYE, SHOREKEEPER], [REBECCA, REBECCA], [LUCY]],

  // sigrika: aero + echo
  [[SHOREKEEPER, CIACCONA, VERINA, MORNYE], [QIUYUAN, LUCILLA, CANTARELLA, ROVER_AERO, CIACCONA, LYNAE_RUPTURE], [SIGRIKA]],
  [[QIUYUAN, ROVER_AERO], [QIUYUAN, LUCILLA], [SIGRIKA_FAST]],
  [[PHROLO_10s], [QIUYUAN, LUCILLA], [SIGRIKA_FAST]],

  // luuk: spectro basic, tune strain
  [[SHOREKEEPER, VERINA, MORNYE], [LYNAE_STRAIN, SANHUA, DENIA_STRAIN, ROVER_SPECTRO], [LUUK]],

  // aemeath: fusion liberation on tune rupture — Mornye and Lynae answer the break beside her
  [[SHOREKEEPER, VERINA, MORNYE, LUPA], [LYNAE_RUPTURE, LUPA, CHANGLI, JIANXIN], [AEMEATH_RUPTURE]],
  // monofus needs mornye or lupa
  [[MORNYE, LUPA], [BRANT, BRANT], [AEMEATH_RUPTURE]],
  // denia burst mode with real rupture teammates
  [[DENIA_BURST, DENIA_BURST], [LYNAE_RUPTURE, LYNAE_RUPTURE], [AEMEATH_RUPTURE]],
  [[MORNYE, MORNYE], [DENIA_BURST, DENIA_BURST], [AEMEATH_RUPTURE]],

  // aemeath: fusion liberation on fusion burst — Denia's Burst mode feeds the stacks and amplifies
  [[SHOREKEEPER, VERINA, MORNYE, LUPA, DENIA_BURST, CHISA, SUISUI], [DENIA_BURST, LUPA, JIANXIN, ROVER_ELECTRO], [AEMEATH_BURST]],
  // monofus needs lupa or denia
  [[LUPA, DENIA_BURST], [CHANGLI, BRANT], [AEMEATH_BURST]],
  // lynae rupture only with denia burst 3rd slot
  [[DENIA_BURST, DENIA_BURST], [LYNAE_RUPTURE, LYNAE_RUPTURE], [AEMEATH_BURST]],

  // qiuyuan: aero heavy echo
  [[SHOREKEEPER, VERINA, ROVER_AERO, CIACCONA, MORNYE], [MORTEFI, IUNO, CIACCONA, LYNAE_RUPTURE, REBECCA, ROVER_AERO, LUCILLA], [QIUYUAN_MDPS]],
  // too long
  //[[SHOREKEEPER, VERINA, ROVER_AERO, CIACCONA, MORNYE], [PHROLO_10s], [QIUYUAN_MDPS]],

  // galbrena: fusion echo
  [[SHOREKEEPER, VERINA, LUPA, QIUYUAN, MORNYE, DENIA_BURST], [QIUYUAN, LUCILLA], [GALBRENA]],
  [[PHROLO_10s], [QIUYUAN, LUCILLA], [GALBRENA], ],
  // galbrena: fusion heavy
  [[SHOREKEEPER, VERINA, LUPA, MORNYE, DENIA_BURST], [BRANT, MORTEFI, IUNO, LUPA, LYNAE_RUPTURE, REBECCA], [GALBRENA]],

  // iuno mdps: aero + echo
  [[SHOREKEEPER, ROVER_AERO, CIACCONA, VERINA, MORNYE], [ROVER_AERO, CIACCONA, LYNAE_RUPTURE, JIANXIN], [IUNO_MDPS]],

  // augusta: electro heavy shielder
  [[SHOREKEEPER, VERINA, MORNYE], [IUNO, MORTEFI, LYNAE_RUPTURE, REBECCA], [AUGUSTA]],
  // add phrolo subdps?

  // phrolova: havoc, echo, skill
  // phrolova fastest
  [[PHRO_14s], [VERINA, VERINA], [QIUYUAN, DANJIN, LUCILLA, CANTARELLA, LYNAE_RUPTURE]],
  [[PHRO_14s], [QIUYUAN, ROCCIA, DANJIN], [VERINA, VERINA]],

  // phrolova with support
  [[PHRO_12s], [SHOREKEEPER, BULING, MORNYE, SUISUI], [QIUYUAN, DANJIN, LUCILLA, CANTARELLA, LYNAE_RUPTURE, ROCCIA]],
  [[PHRO_12s], [QIUYUAN, ROCCIA, DANJIN], [SHOREKEEPER, SUISUI, MORNYE]],

  // phrolova offield more
  [[PHROLO_10s], [QIUYUAN, LUCILLA, LYNAE_RUPTURE, DANJIN, ROCCIA], [LUCILLA, QIUYUAN, LYNAE_RUPTURE, CANTARELLA]],
  [[PHROLO_10s], [JINHSI_SUPPORT, JINHSI_SUPPORT], [CANTARELLA, CANTARELLA]],

  // cartethyia: aero HP-scaling basic attack on Aero Erosion — Aero Rover and Chisa both raise the
  // status's own cap, which is what her Erosion ticks and her Blade's amplification both read
  [[SUISUI, CHISA, SHOREKEEPER, MORNYE, CIACCONA, CHISA], [ROVER_AERO, CHISA], [CARTETHYIA]],
  [[SUISUI, CHISA, ROVER_AERO, CIACCONA], [SANHUA, SANHUA], [CARTETHYIA]],

  // brant: fusion basic
  [[MORNYE, DENIA_BURST, VERINA, SHOREKEEPER], [SANHUA, LUPA, DENIA_BURST], [BRANT_MDPS]],
  [[LUPA, LUPA], [BRANT], [CHANGLI]],
  [[LUPA, LUPA], [BRANT], [ENCORE]],

  // cantarella: havoc basic, echo
  [[SHOREKEEPER, VERINA, MORNYE], [SANHUA, ROCCIA, LYNAE_RUPTURE, REBECCA], [CANTARELLA_MDPS]],

  // carlotta: glacio skill
  [[SHOREKEEPER, BULING, VERINA, MORNYE, SUISUI], [BRANT, LYNAE_RUPTURE, REBECCA, LUCILLA_CHAFE], [CARLOTTA]],
  [[SHOREKEEPER, BULING, VERINA, MORNYE, SUISUI, JINHSI_SUPPORT], [ZHEZHI, CANTARELLA], [CARLOTTA]],

  // roccia: havoc heavy
  [[SHOREKEEPER, VERINA, MORNYE], [MORTEFI, IUNO, LYNAE_RUPTURE, REBECCA], [ROCCIA_MDPS]],
  // too long
  //[[SHOREKEEPER, VERINA, MORNYE], [PHROLO_10s], [ROCCIA_MDPS]],

  // camellya: havoc basic
  [[SHOREKEEPER, VERINA], [SANHUA, ROCCIA], [CAMELLYA_DOUBLE]],

  // xiangli yao: electro liberation
  [[SHOREKEEPER, VERINA, MORNYE], [YINLIN, LYNAE_RUPTURE, JIANXIN], [XIANGLI_YAO]],

  // changli: fusion skill+liberation
  [[LUPA, MORNYE, SHOREKEEPER, DENIA_BURST, VERINA], [DENIA_BURST, LYNAE_RUPTURE, LUPA], [CHANGLI]],

  // jiyan: aero heavy
  [[SHOREKEEPER, VERINA, ROVER_AERO, CIACCONA, MORNYE], [MORTEFI, IUNO, CIACCONA, LYNAE_RUPTURE, REBECCA, PHROLO_10s, ROVER_AERO], [JIYAN]],

  // encore: fusion basic
  //[[SHOREKEEPER, VERINA, DENIA_BURST, LUPA], [LUPA, SANHUA, DENIA_BURST], [ENCORE]],
  //[[LUPA, LUPA], [ENCORE], [CHANGLI, BRANT]],

  // havoc rover: havoc, mixed
  //[[SHOREKEEPER, VERINA, MORNYE], [ROCCIA, DANJIN, SANHUA, LYNAE_RUPTURE, CANTARELLA], [ROVER_HAVOC]],
];

/** `mdps[i]`: whether slot i is one of the team's main DPS — per team, never stamped on the shared Loadout. */
export interface TeamEntry { loadouts: Loadout[]; mdps: boolean[] }

/** Teams the scheduler can't play — thrown below so the roster's mistake shows on the loading screen. */
const UNPLAYABLE_TEAMS: { names: string[]; why: string }[] = [];

/** `TEAMS` expanded: every pick of one loadout per slot, minus any that repeats a resonator. */
export const ALL_TEAMS: TeamEntry[] = TEAMS.flatMap((slots) => {
  // read before the dedupe: a repeated loadout is how a slot opts out of being the main DPS
  const mdps = slots.map((s) => s.length === 1);
  if (!mdps.some(Boolean)) {
    const names = slots.map((s) => s.map((l) => l.resonator.name).join("/")).join(", ");
    throw new Error(`the team [${names}] has no one-loadout slot naming its main DPS`);
  }
  const [a, b, c] = slots.map((s) => [...new Set(s)]);
  return a!.flatMap((x) => b!.flatMap((y) => c!.map((z) => ({ loadouts: [x, y, z], mdps }))))
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
if (UNPLAYABLE_TEAMS.length) {
  throw new Error(`teams.ts lists ${UNPLAYABLE_TEAMS.length} team(s) the scheduler can't play:\n`
    + UNPLAYABLE_TEAMS.map((t) => `  ${t.names.join(" / ")} — ${t.why}`).join("\n"));
}

/** A team's key: its slot in `ALL_TEAMS`. No dash — a row key is this plus per-member combo keys. */
export const teamKey = (index: number): string => `t${index}`;

/** `undefined` for a stale key, so an old bookmark falls back to the table. */
export const teamAt = (key: string): TeamEntry | undefined =>
  /^t\d+$/.test(key) ? ALL_TEAMS[Number(key.slice(1))] : undefined;
