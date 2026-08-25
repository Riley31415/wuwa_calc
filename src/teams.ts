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
 * its own copy of this module. See solver.ts's own `teamFromNames()` and worker.ts.
 */
import type { Loadout } from "./kit.js";
import { QY_LOADOUT } from "./resonators/septimont/qiuyuan.js";
import { CANTA_LOADOUT } from "./resonators/rinascita/cantarella.js";
import { FROLO_LOADOUT } from "./resonators/septimont/phrolova.js";
import { SK_LOADOUT } from "./resonators/blackshores/shorekeeper.js";
import { UNO_LOADOUT } from "./resonators/septimont/iuno.js";
import { JINGOAT_LOADOUT } from "./resonators/mengzhou/jingran.js";
import { ZZ_LOADOUT } from "./resonators/jinzhou/zhezhi.js";
import { LOTTA_LOADOUT } from "./resonators/rinascita/carlotta.js";
import { GEEK_LOADOUT } from "./resonators/lahairoi/sigrika.js";
import { VERINA_LOADOUT } from "./resonators/jinzhou/verina.js";
import { SANHUA_LOADOUT } from "./resonators/jinzhou/sanhua.js";
import { HROVER_LOADOUT } from "./resonators/blackshores/rover_havoc.js";
import { EROVER_LOADOUT } from "./resonators/blackshores/rover_electro.js";
import { AROVER_LOADOUT } from "./resonators/blackshores/rover_aero.js";
import { SROVER_LOADOUT } from "./resonators/blackshores/rover_spectro.js";
import { CIA_LOADOUT } from "./resonators/rinascita/ciaccona.js";
import { ROCCIA_LOADOUT } from "./resonators/rinascita/roccia.js";
import { AUGUGU_LOADOUT } from "./resonators/septimont/augusta.js";
import { LOPA_LOADOUT } from "./resonators/septimont/lupa.js";
import { GLOB_LOADOUT, GLOB_LOADOUT_ECHO_FOCUS } from "./resonators/septimont/galbrena.js";
import { BRANT_LOADOUT } from "./resonators/rinascita/brant.js";
import { ENCORE_LOADOUT } from "./resonators/jinzhou/encore.js";
import { CHANGLI_LOADOUT } from "./resonators/jinzhou/changli.js";
import { DANJIN_LOADOUT } from "./resonators/jinzhou/danjin.js";
import { CAMMY_LOADOUT } from "./resonators/blackshores/camellya.js";
import { MORT_LOADOUT } from "./resonators/jinzhou/mortefi.js";
import { BULING_LOADOUT } from "./resonators/mengzhou/buling.js";
import { LUCILLA_LOADOUT } from "./resonators/lahairoi/lucilla.js";
import { LYN_RUPTURE, LYN_STRAIN } from "./resonators/lahairoi/lynae.js";
import { MORNYE_LOADOUT } from "./resonators/lahairoi/mornye.js";
import { DENIA_BURST, DENIA_STRAIN } from "./resonators/lahairoi/denia.js";
import { QX_LOADOUT } from "./resonators/mengzhou/qingxiao.js";
import { JIYAN_LOADOUT } from "./resonators/jinzhou/jiyan.js";
import { YINLIN_LOADOUT } from "./resonators/jinzhou/yinlin.js";
import { XLY_LOADOUT } from "./resonators/jinzhou/xiangli_yao.js";
import { LUUK_LOADOUT } from "./resonators/lahairoi/luuk.js";
import { REBECCA_LOADOUT } from "./resonators/lahairoi/rebecca.js";
import { LUCY_LOADOUT } from "./resonators/lahairoi/lucy.js";

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
  LUUK, REBECCA, LUCY,
} = LOADOUTS;

const TEAMS: Loadout[][][] = [
  // lucy: spectro heavy on tune hack, with rebecca feeding her the outro
  [[VERINA, MORNYE, SK], [REBECCA], [LUCY]],

  // qingxiao: aero heavy/basic/liberation on tune strain
  [[MORNYE, SK, VERINA, AROVER, CIA], [DENIA_STRAIN, LYN_STRAIN, AROVER, CIA, SANHUA, MORT, REBECCA], [QX_LOADOUT]],

  // jingran: fusion heavy shielder
  [[SK, LOPA, VERINA, MORNYE], [UNO, MORT, BRANT, LOPA, LYN_RUPTURE, REBECCA], [JINGOAT]],

  // sigrika: aero + echo
  [[SK, AROVER, CIA, QY, VERINA, MORNYE], [QY, LUCILLA, CANTA, AROVER, CIA, LYN_RUPTURE], [GEEK]],

  // luuk: spectro basic, tune strain
  [[SK, VERINA, MORNYE, SROVER_LOADOUT], [LYN_STRAIN, SANHUA, DENIA_STRAIN, SROVER_LOADOUT], [LUUK]],

  // glob fusion echo
  [[SK, VERINA, LOPA, QY, MORNYE], [QY, LUCILLA], [GLOB_ECHO_FOCUS]],
  // glob fusion heavy
  [[SK, VERINA, LOPA, CANTA, MORNYE, DENIA_BURST], [BRANT, MORT, UNO, LOPA, LYN_RUPTURE, REBECCA], [GLOB]],

  // augusta: electro heavy shielder
  [[SK, VERINA, MORNYE], [UNO, MORT, LYN_RUPTURE, REBECCA], [AUGUGU]],

  // phrolova: havoc, echo, skill
  // frolo -> subdps -> subdps
  [[FROLO], [QY, ROCCIA, DANJIN, LUCILLA, LYN_RUPTURE, LYN_STRAIN], [QY, DANJIN, LUCILLA, CANTA, LYN_RUPTURE, LYN_STRAIN]],
  // frolo -> support -> subdps
  [[FROLO], [SK, VERINA, BULING, MORNYE], [QY, DANJIN, LUCILLA, CANTA, LYN_RUPTURE, LYN_STRAIN]],
  // frolo -> driver -> support
  [[FROLO], [QY, ROCCIA, DANJIN, HROVER], [SK, VERINA]],

  // changli: fusion skill+liberation
  [[LOPA], [BRANT, ENCORE, DENIA_BURST], [CHANGLI]],

  // lotta: glacio skill
  [[SK, BULING, VERINA, MORNYE], [ZZ, BRANT, LYN_RUPTURE, REBECCA], [LOTTA]],

  // cammy: havoc basic
  [[SK, VERINA, MORNYE], [ROCCIA, SANHUA, LYN_RUPTURE, REBECCA], [CAMMY]],

  // XLY: electro liberation
  [[SK, VERINA, MORNYE], [YINLIN, LYN_RUPTURE], [XLY]],

  // Jiyan: aero heavy
  [[SK, VERINA, AROVER, CIA, MORNYE], [MORT, UNO, CIA, LYN_RUPTURE, REBECCA], [JIYAN]],

  // encore: fusion basic
  [[SK, VERINA, MORNYE, DENIA_BURST], [LOPA, SANHUA], [ENCORE]],
];

for (const slots of TEAMS) {
  const dps = slots.filter((s) => s.length === 1).at(-1);
  if (!dps) throw new Error(`a team in teams.ts has no one-loadout slot naming its main DPS`);
  dps[0]!.mainDps = true;
}

/** `TEAMS` expanded: every pick of one loadout per slot, minus any that repeats a resonator. */
export const ALL_TEAMS: Loadout[][] = TEAMS.flatMap(([a, b, c]) =>
  a!.flatMap((x) => b!.flatMap((y) => c!.map((z) => [x, y, z])))
    .filter((team) => new Set(team.map((l) => l.resonator)).size === team.length));
