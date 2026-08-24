/**
 * Every resonator loadout the page can put in a team, in one place — both as named exports (what
 * index.ts's own `TEAMS` table names directly) and as a lookup by that same export name.
 *
 * The lookup is what makes the optimizer parallelizable: a Worker cannot be handed a `Loadout`
 * (postMessage structured-clones, and a Loadout is closures all the way down), so the main thread
 * sends a team as the *names* of its members' loadouts and the worker resolves them here against
 * its own copy of this module. See solver.ts's own `teamFromNames()` and worker.ts.
 */
import type { Loadout } from "./kit.js";

import { QY_LOADOUT } from "./resonators/qiuyuan.js";
import { CANTA_LOADOUT } from "./resonators/cantarella.js";
import { FROLO_LOADOUT } from "./resonators/phrolova.js";
import { SK_LOADOUT } from "./resonators/shorekeeper.js";
import { UNO_LOADOUT } from "./resonators/iuno.js";
import { JINGOAT_LOADOUT } from "./resonators/jingran.js";
import { ZZ_LOADOUT } from "./resonators/zhezhi.js";
import { LOTTA_LOADOUT } from "./resonators/carlotta.js";
import { GEEK_LOADOUT } from "./resonators/sigrika.js";
import { VERINA_LOADOUT } from "./resonators/verina.js";
import { SANHUA_LOADOUT } from "./resonators/sanhua.js";
import { HROVER_LOADOUT } from "./resonators/rover_havoc.js";
import { EROVER_LOADOUT } from "./resonators/rover_electro.js";
import { AROVER_LOADOUT } from "./resonators/rover_aero.js";
import { SROVER_LOADOUT } from "./resonators/rover_spectro.js";
import { CIA_LOADOUT } from "./resonators/ciaccona.js";
import { ROCCIA_LOADOUT } from "./resonators/roccia.js";
import { AUGUGU_LOADOUT } from "./resonators/augusta.js";
import { LOPA_LOADOUT } from "./resonators/lupa.js";
import { GLOB_LOADOUT, GLOB_LOADOUT_ECHO_FOCUS } from "./resonators/galbrena.js";
import { BRANT_LOADOUT } from "./resonators/brant.js";
import { ENCORE_LOADOUT } from "./resonators/encore.js";
import { CHANGLI_LOADOUT } from "./resonators/changli.js";
import { DANJIN_LOADOUT } from "./resonators/danjin.js";
import { CAMMY_LOADOUT } from "./resonators/camellya.js";
import { MORT_LOADOUT } from "./resonators/mortefi.js";
import { BULING_LOADOUT } from "./resonators/buling.js";
import { LUCILLA_LOADOUT } from "./resonators/lucilla.js";
import { LYNAE_LOADOUT, LYNAE_LOADOUT_STRAIN } from "./resonators/lynae.js";
import { JIYAN_LOADOUT } from "./resonators/jiyan.js";
import { YINLIN_LOADOUT } from "./resonators/yinlin.js";
import { XLY_LOADOUT } from "./resonators/xiangli_yao.js";

/** Keyed by export name, and deliberately not typed as `Record<string, Loadout>` — the inferred
 *  literal keys are what let index.ts destructure this without every entry coming back as
 *  possibly-undefined (see tsconfig's own `noUncheckedIndexedAccess`). */
export const LOADOUTS = {
  QY_LOADOUT,
  CANTA_LOADOUT,
  FROLO_LOADOUT,
  SK_LOADOUT,
  UNO_LOADOUT,
  JINGOAT_LOADOUT,
  ZZ_LOADOUT,
  LOTTA_LOADOUT,
  GEEK_LOADOUT,
  VERINA_LOADOUT,
  SANHUA_LOADOUT,
  HROVER_LOADOUT,
  EROVER_LOADOUT,
  AROVER_LOADOUT,
  SROVER_LOADOUT,
  CIA_LOADOUT,
  ROCCIA_LOADOUT,
  AUGUGU_LOADOUT,
  LOPA_LOADOUT,
  GLOB_LOADOUT,
  GLOB_LOADOUT_ECHO_FOCUS,
  BRANT_LOADOUT,
  ENCORE_LOADOUT,
  CHANGLI_LOADOUT,
  DANJIN_LOADOUT,
  CAMMY_LOADOUT,
  MORT_LOADOUT,
  BULING_LOADOUT,
  LUCILLA_LOADOUT,
  JIYAN_LOADOUT,
  YINLIN_LOADOUT,
  XLY_LOADOUT,
  LYNAE_LOADOUT,
  LYNAE_LOADOUT_STRAIN,
};

export type LoadoutName = keyof typeof LOADOUTS;

/** Reverse lookup, so the main thread can name the loadouts a team is made of when it hands that
 *  team to a worker. Built from the table above rather than written out again. */
const NAME_OF = new Map<Loadout, LoadoutName>(
  (Object.entries(LOADOUTS) as [LoadoutName, Loadout][]).map(([name, loadout]) => [loadout, name]),
);

export const loadoutName = (l: Loadout): LoadoutName => {
  const name = NAME_OF.get(l);
  if (!name) throw new Error(`loadout is not registered in loadouts.ts`);
  return name;
};

export {
  QY_LOADOUT,
  CANTA_LOADOUT,
  FROLO_LOADOUT,
  SK_LOADOUT,
  UNO_LOADOUT,
  JINGOAT_LOADOUT,
  ZZ_LOADOUT,
  LOTTA_LOADOUT,
  GEEK_LOADOUT,
  VERINA_LOADOUT,
  SANHUA_LOADOUT,
  HROVER_LOADOUT,
  EROVER_LOADOUT,
  AROVER_LOADOUT,
  SROVER_LOADOUT,
  CIA_LOADOUT,
  ROCCIA_LOADOUT,
  AUGUGU_LOADOUT,
  LOPA_LOADOUT,
  GLOB_LOADOUT,
  GLOB_LOADOUT_ECHO_FOCUS,
  BRANT_LOADOUT,
  ENCORE_LOADOUT,
  CHANGLI_LOADOUT,
  DANJIN_LOADOUT,
  CAMMY_LOADOUT,
  MORT_LOADOUT,
  BULING_LOADOUT,
  LUCILLA_LOADOUT,
  JIYAN_LOADOUT,
  YINLIN_LOADOUT,
  XLY_LOADOUT,
  LYNAE_LOADOUT,
  LYNAE_LOADOUT_STRAIN,
};
