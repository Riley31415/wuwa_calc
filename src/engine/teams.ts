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
 * `LOADOUTS` is also the page's one loadout registry: a Worker cannot be handed a `Loadout`
 * (postMessage structured-clones, and a Loadout is closures all the way down), so the main thread
 * sends a team as the *names* of its members' loadouts and the worker resolves them here against
 * its own copy of this module. See solver.ts's own `teamFromNames()`.
 */
import type { Loadout } from "./kit.js";
import { QY_LOADOUT } from "../resonators/aero/qiuyuan.js";
import { CANTA_LOADOUT } from "../resonators/havoc/cantarella.js";
import { FROLO_LOADOUT } from "../resonators/havoc/phrolova.js";
import { SK_LOADOUT } from "../resonators/spectro/shorekeeper.js";
import { UNO_LOADOUT } from "../resonators/aero/iuno.js";
import { JINGOAT_LOADOUT } from "../resonators/fusion/jingran.js";
import { ZZ_LOADOUT } from "../resonators/glacio/zhezhi.js";
import { LOTTA_LOADOUT } from "../resonators/glacio/carlotta.js";
import { GEEK_LOADOUT } from "../resonators/aero/sigrika.js";
import { VERINA_LOADOUT } from "../resonators/spectro/verina.js";
import { SANHUA_LOADOUT } from "../resonators/glacio/sanhua.js";
import { HROVER_LOADOUT } from "../resonators/havoc/rover_havoc.js";
import { EROVER_LOADOUT } from "../resonators/electro/rover_electro.js";
import { AROVER_LOADOUT } from "../resonators/aero/rover_aero.js";
import { SROVER_LOADOUT } from "../resonators/spectro/rover_spectro.js";
import { CIA_LOADOUT } from "../resonators/aero/ciaccona.js";
import { ROCCIA_LOADOUT } from "../resonators/havoc/roccia.js";
import { AUGUGU_LOADOUT } from "../resonators/electro/augusta.js";
import { LOPA_LOADOUT } from "../resonators/fusion/lupa.js";
import { GLOB_LOADOUT, GLOB_LOADOUT_ECHO_FOCUS } from "../resonators/fusion/galbrena.js";
import { BRANT_LOADOUT } from "../resonators/fusion/brant.js";
import { ENCORE_LOADOUT } from "../resonators/fusion/encore.js";
import { CHANGLI_LOADOUT } from "../resonators/fusion/changli.js";
import { DANJIN_LOADOUT } from "../resonators/havoc/danjin.js";
import { CAMMY_LOADOUT } from "../resonators/havoc/camellya.js";
import { MORT_LOADOUT } from "../resonators/fusion/mortefi.js";
import { BULING_LOADOUT } from "../resonators/electro/buling.js";
import { CHISA_LOADOUT } from "../resonators/havoc/chisa.js";
import { HIYUKI_LOADOUT } from "../resonators/glacio/hiyuki.js";
import { LUCILLA_LOADOUT, LUCILLA_LOADOUT_CHAFE } from "../resonators/glacio/lucilla.js";
import { LYN_RUPTURE, LYN_STRAIN } from "../resonators/spectro/lynae.js";
import { MORNYE_LOADOUT } from "../resonators/fusion/mornye.js";
import { DENIA_BURST, DENIA_STRAIN } from "../resonators/fusion/denia.js";
import { QX_LOADOUT } from "../resonators/aero/qingxiao.js";
import { JIYAN_LOADOUT } from "../resonators/aero/jiyan.js";
import { YINLIN_LOADOUT } from "../resonators/electro/yinlin.js";
import { XLY_LOADOUT } from "../resonators/electro/xiangli_yao.js";
import { LUUK_LOADOUT } from "../resonators/spectro/luuk.js";
import { REBECCA_LOADOUT } from "../resonators/electro/rebecca.js";
import { LUCY_LOADOUT } from "../resonators/spectro/lucy.js";
import { XUANLING_LOADOUT } from "../resonators/havoc/xuanling.js";
import { SUISUI_LOADOUT } from "../resonators/glacio/suisui.js";

/** Every loadout, by the short name the teams below and a team's own key (`FROLO.QY.CANTA`) use.
 *  Deliberately not typed as `Record<string, Loadout>` — the inferred literal keys are what make
 *  `LoadoutName` (see tsconfig's own `noUncheckedIndexedAccess`). The whole roster, not just who
 *  the teams field, so a chip can be painted for anyone (index.ts's own `RESONATOR_HUE`). */
export const LOADOUTS = {
  QY: QY_LOADOUT, CANTA: CANTA_LOADOUT, FROLO: FROLO_LOADOUT, SK: SK_LOADOUT, UNO: UNO_LOADOUT,
  JINGOAT: JINGOAT_LOADOUT, ZZ: ZZ_LOADOUT, LOTTA: LOTTA_LOADOUT, GEEK: GEEK_LOADOUT,
  VERINA: VERINA_LOADOUT, SANHUA: SANHUA_LOADOUT,
  HROVER: HROVER_LOADOUT, EROVER: EROVER_LOADOUT, AROVER: AROVER_LOADOUT, SROVER: SROVER_LOADOUT,
  CIA: CIA_LOADOUT, ROCCIA: ROCCIA_LOADOUT, AUGUGU: AUGUGU_LOADOUT, LOPA: LOPA_LOADOUT,
  GLOB: GLOB_LOADOUT, GLOB_ECHO_FOCUS: GLOB_LOADOUT_ECHO_FOCUS, BRANT: BRANT_LOADOUT,
  ENCORE: ENCORE_LOADOUT, CHANGLI: CHANGLI_LOADOUT, DANJIN: DANJIN_LOADOUT, CAMMY: CAMMY_LOADOUT,
  MORT: MORT_LOADOUT, BULING: BULING_LOADOUT, LUCILLA: LUCILLA_LOADOUT,
  LYN_RUPTURE, LYN_STRAIN, MORNYE: MORNYE_LOADOUT, DENIA_BURST, DENIA_STRAIN, QX: QX_LOADOUT,
  JIYAN: JIYAN_LOADOUT, YINLIN: YINLIN_LOADOUT, XLY: XLY_LOADOUT, LUUK: LUUK_LOADOUT,
  REBECCA: REBECCA_LOADOUT, LUCY: LUCY_LOADOUT,
  CHISA: CHISA_LOADOUT, HIYUKI: HIYUKI_LOADOUT, LUCILLA_CHAFE: LUCILLA_LOADOUT_CHAFE,
  XUANLING: XUANLING_LOADOUT, SUISUI: SUISUI_LOADOUT,
};

export type LoadoutName = keyof typeof LOADOUTS;

/** Reverse lookup, so the main thread can name the loadouts a team is made of when it hands that
 *  team to a worker. Built from the table above rather than written out again. */
const NAME_OF = new Map<Loadout, LoadoutName>(
  (Object.entries(LOADOUTS) as [LoadoutName, Loadout][]).map(([name, loadout]) => [loadout, name]),
);

export const loadoutName = (l: Loadout): LoadoutName => {
  const name = NAME_OF.get(l);
  if (!name) throw new Error(`loadout is not registered in teams.ts`);
  return name;
};

const {
  QY, CANTA, FROLO, SK, UNO, JINGOAT, ZZ, LOTTA, GEEK, VERINA, SANHUA, HROVER, AROVER, CIA, ROCCIA,
  AUGUGU, LOPA, GLOB, GLOB_ECHO_FOCUS, BRANT, ENCORE, CHANGLI, DANJIN, CAMMY, MORT, BULING, LUCILLA,
  MORNYE, JIYAN, YINLIN, XLY,
  LUUK, REBECCA, LUCY, CHISA, HIYUKI, LUCILLA_CHAFE, XUANLING, SUISUI,
} = LOADOUTS;

const TEAMS: Loadout[][][] = [
  // hiyuki: glacio chafe/bite — every stack the team lands calculates at the target's own limit,
  // which is why Chisa (+3 to it) and Lucilla's Chafe build stand behind her
  [[SUISUI, VERINA, SK, MORNYE, CHISA], [LUCILLA_CHAFE, CHISA, LYN_RUPTURE], [HIYUKI]],

  // xuanling: havoc heavy attack on Havoc Bane — Chisa's +3 to every Negative Status cap is what
  // takes Unbroken Vow off its 3-stack 30% tier onto the 4-6 stack 36% one
  [[SUISUI, VERINA, SK, MORNYE, CHISA], [CHISA, MORT, REBECCA, LYN_RUPTURE, UNO, FROLO], [XUANLING]],

  // lucy: spectro heavy on tune hack, with rebecca feeding her the outro
  [[VERINA, MORNYE, SK], [REBECCA], [LUCY]],

  // qingxiao: aero heavy/basic/liberation on tune strain
  [[MORNYE, SK, VERINA, AROVER, CIA], [DENIA_STRAIN, LYN_STRAIN, AROVER, CIA, SANHUA, MORT, REBECCA], [QX_LOADOUT]],

  // jingran: fusion heavy shielder
  [[SK, LOPA, VERINA, MORNYE], [UNO, MORT, BRANT, LOPA, LYN_RUPTURE, REBECCA], [JINGOAT]],

  // sigrika: aero + echo
  [[SK, AROVER, CIA, QY, VERINA, MORNYE], [QY, LUCILLA, CANTA, AROVER, CIA, LYN_RUPTURE], [GEEK]],

  // luuk: spectro basic, tune strain
  [[SK, VERINA, MORNYE], [LYN_STRAIN, SANHUA, DENIA_STRAIN, SROVER_LOADOUT], [LUUK]],

  // glob fusion echo
  [[SK, VERINA, LOPA, QY, MORNYE], [QY, LUCILLA], [GLOB_ECHO_FOCUS]],
  // glob fusion heavy
  [[SK, VERINA, LOPA, MORNYE, DENIA_BURST], [BRANT, MORT, UNO, LOPA, LYN_RUPTURE, REBECCA], [GLOB]],

  // augusta: electro heavy shielder
  [[SK, VERINA, MORNYE], [UNO, MORT, LYN_RUPTURE, REBECCA], [AUGUGU]],

  // phrolova: havoc, echo, skill
  // frolo -> subdps -> subdps
  [[FROLO], [QY, ROCCIA, DANJIN, LUCILLA, LYN_RUPTURE], [DANJIN, LUCILLA, CANTA, LYN_RUPTURE]],

  // frolo -> support -> subdps
  [[FROLO], [SK, VERINA, BULING, MORNYE, SUISUI], [QY, DANJIN, LUCILLA, CANTA, LYN_RUPTURE]],

  // frolo -> driver -> support
  [[FROLO], [QY, ROCCIA, DANJIN, HROVER], [SK, VERINA, SUISUI]],

  // changli: fusion skill+liberation
  [[LOPA], [BRANT, ENCORE, DENIA_BURST], [CHANGLI]],

  // lotta: glacio skill
  [[SK, BULING, VERINA, MORNYE, SUISUI], [ZZ, BRANT, LYN_RUPTURE, REBECCA, LUCILLA_CHAFE], [LOTTA]],

  // cammy: havoc basic
  [[SK, VERINA, MORNYE, SUISUI], [ROCCIA, SANHUA, LYN_RUPTURE, REBECCA], [CAMMY]],

  // XLY: electro liberation
  [[SK, VERINA, MORNYE, SUISUI], [YINLIN, LYN_RUPTURE], [XLY]],

  // Jiyan: aero heavy
  [[SK, VERINA, AROVER, CIA, MORNYE], [MORT, UNO, CIA, LYN_RUPTURE, REBECCA], [JIYAN]],

  // encore: fusion basic
  [[SK, VERINA, MORNYE, DENIA_BURST], [LOPA, SANHUA], [ENCORE]],
];

/** One expanded team: a loadout per slot, plus which position is *this team's* main DPS — the
 *  last one-loadout slot (a team whose supports are also fixed, like LOPA+CHANGLI, can have more
 *  than one such slot; the *last* is the dps, per the doc comment on `TEAMS` above). Computed per
 *  team rather than stamped onto the shared `Loadout` objects themselves (as this used to do),
 *  since the same loadout can be a fixed support in one team and someone's main DPS in another —
 *  a global flag on the loadout would leak whichever team set it last into every other team. */
export interface TeamEntry { loadouts: Loadout[]; dpsIndex: number }

/** `TEAMS` expanded: every pick of one loadout per slot, minus any that repeats a resonator. */
export const ALL_TEAMS: TeamEntry[] = TEAMS.flatMap((slots) => {
  const singletons = slots.map((s, i) => (s.length === 1 ? i : -1)).filter((i) => i !== -1);
  const dpsIndex = singletons.at(-1);
  if (dpsIndex === undefined) throw new Error(`a team in teams.ts has no one-loadout slot naming its main DPS`);
  const [a, b, c] = slots;
  return a!.flatMap((x) => b!.flatMap((y) => c!.map((z) => ({ loadouts: [x, y, z], dpsIndex }))))
    .filter((team) => new Set(team.loadouts.map((l) => l.resonator)).size === team.loadouts.length);
});
