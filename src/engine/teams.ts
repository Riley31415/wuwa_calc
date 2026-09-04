/**
 * Every team the comparison table runs, defined by slot rather than one at a time: each entry is
 * three lists, one per team position, and stands for every team you get picking one loadout from
 * each. The main DPS is the position with exactly one loadout in it (the last such position, for
 * a team whose supports are also fixed); the other two list everyone who can stand there. A
 * loadout may sit in both support lists, but no team fields the same resonator twice.
 *
 * Position matters: whoever is 1st runs their `opener`, and the rotations of the two behind them
 * are built around it — see solver.ts's own `runTeam()`.
 *
 * A Worker cannot be handed a team (postMessage structured-clones, and a `Loadout` is closures
 * all the way down), so what crosses the wire is a team's own *key*: where it sits in
 * `ALL_TEAMS`, the one list both threads build identically out of this file. See `teamKey()`
 * and `teamAt()` below, and solver.ts's own `teamFromKey()`.
 */
import type { Loadout } from "./kit.js";
import { CIACCONA } from "../resonators/aero/ciaccona.js";
import { IUNO, IUNO_MDPS } from "../resonators/aero/iuno.js";
import { JIANXIN } from "../resonators/aero/jianxin.js";
import { JIYAN } from "../resonators/aero/jiyan.js";
import { QINGXIAO } from "../resonators/aero/qingxiao.js";
import { QIUYUAN } from "../resonators/aero/qiuyuan.js";
import { ROVER_AERO } from "../resonators/aero/rover_aero.js";
import { SIGRIKA, SIGRIKA_FAST } from "../resonators/aero/sigrika.js";
import { AUGUSTA } from "../resonators/electro/augusta.js";
import { BULING } from "../resonators/electro/buling.js";
import { REBECCA } from "../resonators/electro/rebecca.js";
import { ROVER_ELECTRO } from "../resonators/electro/rover_electro.js";
import { XIANGLI_YAO } from "../resonators/electro/xiangli_yao.js";
import { YINLIN } from "../resonators/electro/yinlin.js";
import { AEMEATH_BURST, AEMEATH_RUPTURE } from "../resonators/fusion/aemeath.js";
import { BRANT, BRANT_MDPS } from "../resonators/fusion/brant.js";
import { CHANGLI } from "../resonators/fusion/changli.js";
import { DENIA_BURST, DENIA_STRAIN } from "../resonators/fusion/denia.js";
import { ENCORE } from "../resonators/fusion/encore.js";
import { GALBRENA } from "../resonators/fusion/galbrena.js";
import { JINGRAN } from "../resonators/fusion/jingran.js";
import { LUPA } from "../resonators/fusion/lupa.js";
import { MORNYE } from "../resonators/fusion/mornye.js";
import { MORTEFI } from "../resonators/fusion/mortefi.js";
import { CARLOTTA } from "../resonators/glacio/carlotta.js";
import { HIYUKI } from "../resonators/glacio/hiyuki.js";
import { LUCILLA, LUCILLA_CHAFE } from "../resonators/glacio/lucilla.js";
import { SANHUA } from "../resonators/glacio/sanhua.js";
import { SUISUI } from "../resonators/glacio/suisui.js";
import { ZHEZHI } from "../resonators/glacio/zhezhi.js";
import { CAMELLYA, CAMELLYA_DOUBLE } from "../resonators/havoc/camellya.js";
import { CANTARELLA } from "../resonators/havoc/cantarella.js";
import { CHISA } from "../resonators/havoc/chisa.js";
import { DANJIN } from "../resonators/havoc/danjin.js";
import { PHROLOVA, PHROLOVA_DUAL_DPS } from "../resonators/havoc/phrolova.js";
import { ROCCIA } from "../resonators/havoc/roccia.js";
import { ROVER_HAVOC } from "../resonators/havoc/rover_havoc.js";
import { XUANLING } from "../resonators/havoc/xuanling.js";
import { JINHSI } from "../resonators/spectro/jinhsi.js";
import { LUCY } from "../resonators/spectro/lucy.js";
import { LUUK } from "../resonators/spectro/luuk.js";
import { LYNAE_RUPTURE, LYNAE_STRAIN } from "../resonators/spectro/lynae.js";
import { ROVER_SPECTRO } from "../resonators/spectro/rover_spectro.js";
import { SHOREKEEPER } from "../resonators/spectro/shorekeeper.js";
import { VERINA } from "../resonators/spectro/verina.js";

const TEAMS: Loadout[][][] = [

  // jingran: fusion heavy shielder
  [[SHOREKEEPER, LUPA, VERINA, MORNYE], [IUNO, MORTEFI, BRANT, LUPA, LYNAE_RUPTURE, REBECCA], [JINGRAN]],

  // qingxiao: aero heavy/basic/liberation on tune strain
  [[MORNYE, SHOREKEEPER, VERINA, ROVER_AERO, CIACCONA], [DENIA_STRAIN, LYNAE_STRAIN, ROVER_AERO, CIACCONA, SANHUA, MORTEFI, REBECCA, JIANXIN], [QINGXIAO]],

  // xuanling: havoc heavy attack on Havoc Bane — Chisa's +3 to every Negative Status cap is what
  // takes Unbroken Vow off its 3-stack 30% tier onto the 4-6 stack 36% one
  [[SUISUI, VERINA, SHOREKEEPER, MORNYE, CHISA], [CHISA, MORTEFI, REBECCA, LYNAE_RUPTURE, IUNO, PHROLOVA_DUAL_DPS, ROVER_ELECTRO], [XUANLING]],

  // hiyuki: glacio chafe/bite — every stack the team lands calculates at the target's own limit,
  // which is why Chisa (+3 to it) and Lucilla's Chafe build stand behind her
  [[SUISUI, VERINA, SHOREKEEPER, MORNYE, CHISA], [LUCILLA_CHAFE, CHISA, LYNAE_RUPTURE, JIANXIN, ROVER_ELECTRO], [HIYUKI]],

  // lucy: spectro heavy on tune hack, with rebecca feeding her the outro
  [[VERINA, MORNYE, SHOREKEEPER], [REBECCA, REBECCA], [LUCY]],

  // sigrika: aero + echo
  [[SHOREKEEPER, ROVER_AERO, CIACCONA, QIUYUAN, VERINA, MORNYE], [QIUYUAN, LUCILLA, CANTARELLA, ROVER_AERO, CIACCONA, LYNAE_RUPTURE], [SIGRIKA]],

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

  // galbrena: fusion echo
  [[SHOREKEEPER, VERINA, LUPA, QIUYUAN, MORNYE, DENIA_BURST], [QIUYUAN, LUCILLA], [GALBRENA]],
  // galbrena: fusion heavy
  [[SHOREKEEPER, VERINA, LUPA, MORNYE, DENIA_BURST], [BRANT, MORTEFI, IUNO, LUPA, LYNAE_RUPTURE, REBECCA], [GALBRENA]],

  // iuno mdps: aero + echo
  [[SHOREKEEPER, ROVER_AERO, CIACCONA, VERINA, MORNYE], [ROVER_AERO, CIACCONA, LYNAE_RUPTURE, JIANXIN], [IUNO_MDPS]],

  // augusta: electro heavy shielder
  [[SHOREKEEPER, VERINA, MORNYE], [IUNO, MORTEFI, LYNAE_RUPTURE, REBECCA], [AUGUSTA]],

  // phrolova: havoc, echo, skill
  // phrolova -> subdps -> subdps
  [[PHROLOVA], [QIUYUAN, LUCILLA, LYNAE_RUPTURE, ROCCIA, DANJIN], [DANJIN, LUCILLA, CANTARELLA, LYNAE_RUPTURE]],
  // phrolova -> support -> subdps
  [[PHROLOVA], [SHOREKEEPER, VERINA, BULING, MORNYE, SUISUI], [QIUYUAN, DANJIN, LUCILLA, CANTARELLA, LYNAE_RUPTURE]],
  // phrolova -> driver -> support
  [[PHROLOVA], [QIUYUAN, ROCCIA, DANJIN, ROVER_HAVOC], [SHOREKEEPER, VERINA, SUISUI]],
  // phrolova -> subdps -> dual dps
  [[PHROLOVA_DUAL_DPS, PHROLOVA_DUAL_DPS], [QIUYUAN, LUCILLA], [SIGRIKA_FAST]],
  [[PHROLOVA_DUAL_DPS, PHROLOVA_DUAL_DPS], [LUCILLA, LUCILLA], [HIYUKI]],
  [[SUISUI, SUISUI], [PHROLOVA_DUAL_DPS, PHROLOVA_DUAL_DPS], [HIYUKI]],

  // brant: fusion basic
  [[MORNYE, DENIA_BURST, VERINA, SHOREKEEPER], [SANHUA, LUPA, DENIA_BURST], [BRANT_MDPS]],
  [[LUPA, LUPA], [BRANT], [CHANGLI, ENCORE]],

  // changli: fusion skill+liberation
  [[LUPA, MORNYE, SHOREKEEPER, DENIA_BURST, VERINA], [DENIA_BURST, LYNAE_RUPTURE, LUPA], [CHANGLI]],

  // jinhsi: spectro skill
  [[SHOREKEEPER, VERINA, MORNYE, BULING], [ZHEZHI, CANTARELLA, LYNAE_RUPTURE, REBECCA], [JINHSI]],

  // carlotta: glacio skill
  [[SHOREKEEPER, BULING, VERINA, MORNYE, SUISUI], [ZHEZHI, BRANT, LYNAE_RUPTURE, REBECCA, LUCILLA_CHAFE], [CARLOTTA]],

  // camellya: havoc basic
  [[SHOREKEEPER, VERINA], [SANHUA, SANHUA], [CAMELLYA_DOUBLE]],
  [[SHOREKEEPER, VERINA, MORNYE], [ROCCIA, SANHUA, LYNAE_RUPTURE, REBECCA], [CAMELLYA]],

  // xiangli yao: electro liberation
  [[SHOREKEEPER, VERINA, MORNYE], [YINLIN, LYNAE_RUPTURE, JIANXIN], [XIANGLI_YAO]],

  // jiyan: aero heavy
  [[SHOREKEEPER, VERINA, ROVER_AERO, CIACCONA, MORNYE], [MORTEFI, IUNO, CIACCONA, LYNAE_RUPTURE, REBECCA], [JIYAN]],

  // encore: fusion basic
  [[SHOREKEEPER, VERINA, DENIA_BURST, LUPA], [LUPA, SANHUA, DENIA_BURST], [ENCORE]],
  [[LUPA, LUPA], [ENCORE], [CHANGLI, BRANT]],

  // havoc rover: havoc, mixed
  [[SHOREKEEPER, VERINA, MORNYE], [ROCCIA, DANJIN, SANHUA, LYNAE_RUPTURE, CANTARELLA], [ROVER_HAVOC]],
];

/** One expanded team: a loadout per slot, plus which position is *this team's* main DPS — its one
 *  one-loadout slot. Exactly one, and it is checked (`ALL_TEAMS` throws otherwise): a team whose
 *  supports are fixed too says so by naming that support twice, which is what keeps the main DPS
 *  the only slot standing alone rather than leaving it to a tie-break. Computed per
 *  team rather than stamped onto the shared `Loadout` objects themselves (as this used to do),
 *  since the same loadout can be a fixed support in one team and someone's main DPS in another —
 *  a global flag on the loadout would leak whichever team set it last into every other team. */
export interface TeamEntry { loadouts: Loadout[]; dpsIndex: number }

/** `TEAMS` expanded: every pick of one loadout per slot, minus any that repeats a resonator. */
export const ALL_TEAMS: TeamEntry[] = TEAMS.flatMap((slots) => {
  // read off the slots exactly as written, before the dedupe below: naming a loadout twice is how
  // a slot says it is *not* this team's main DPS (it stops counting as a one-loadout slot), so
  // collapsing the repeat first would take that back
  const singletons = slots.map((s, i) => (s.length === 1 ? i : -1)).filter((i) => i !== -1);
  const [dpsIndex] = singletons;
  // exactly one, either way round: a team with none has named no main DPS, and one with several
  // has named several — neither is a thing this file can guess at, and a silent tie-break here
  // would hand the flag to whichever slot happened to come last. A fixed support says it is one
  // by naming its loadout twice (see the dedupe below, which then drops the repeat).
  if (dpsIndex === undefined || singletons.length > 1) {
    const names = slots.map((s) => s.map((l) => l.resonator.name).join("/")).join(", ");
    throw new Error(singletons.length > 1
      ? `the team [${names}] has ${singletons.length} one-loadout slots, so more than one resonator is eligible to be its main DPS — name each fixed support twice to rule it out`
      : `the team [${names}] has no one-loadout slot naming its main DPS`);
  }
  // ...and now that it has said so, the repeat is dropped rather than crossed — a slot naming the
  // same loadout twice would otherwise build every team under it twice over, and the two are the
  // same row in every way the table can see. Dropped here rather than filtered afterwards so the
  // duplicates are never built at all.
  const [a, b, c] = slots.map((s) => [...new Set(s)]);
  return a!.flatMap((x) => b!.flatMap((y) => c!.map((z) => ({ loadouts: [x, y, z], dpsIndex }))))
    .filter((team) => new Set(team.loadouts.map((l) => l.resonator)).size === team.loadouts.length);
});

/** A team's own name: its slot in `ALL_TEAMS`. Plain alphanumerics with no dash, since a row's key
 *  is this plus its per-member combo keys (index.ts's own `expandTeam()`). */
export const teamKey = (index: number): string => `t${index}`;

/** The team a key names, or `undefined` if it names nothing — a stale bookmark falls back to the
 *  table rather than throwing (index.ts's own `rowFromKey()`). */
export const teamAt = (key: string): TeamEntry | undefined =>
  /^t\d+$/.test(key) ? ALL_TEAMS[Number(key.slice(1))] : undefined;
