/**
 * Every team the comparison table runs, by slot: each entry is three positions, and stands for
 * every team picking one loadout from each. A position names a bare loadout to be a main DPS, or a
 * list of loadouts to be a support running each in turn — a support with only one choice is still
 * a one-entry list. Position matters: slot 1 runs its opener. Workers are handed a team's index
 * into `ALL_TEAMS` (`teamKey`), which both threads build alike.
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
import { SIGRIKA as SIGRIKA_EXTEND, SIGRIKA_FAST } from "./resonators/aero/sigrika.js";
import { AUGUSTA } from "./resonators/electro/augusta.js";
import { BULING } from "./resonators/electro/buling.js";
import { HSIN_FLARE, HSIN_UNISON } from "./resonators/electro/hsin.js";
import { REBECCA } from "./resonators/electro/rebecca.js";
import { ROVER_ELECTRO, ROVER_ELECTRO_MDPS } from "./resonators/electro/rover_electro.js";
import { SUOMING, SUOMING_MDPS, SUOMING_MDPS_DOUBLE } from "./resonators/electro/suoming.js";
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
import { CAMELLYA_123_ALWAYS_OUTRO as CAMELLYA_123_ALWAYS, CAMELLYA_DOUBLE_123S6, CAMELLYA_DOUBLE_ALWAYS} from "./resonators/havoc/camellya.js";
import { CANTARELLA, CANTARELLA_MDPS } from "./resonators/havoc/cantarella.js";
import { CHISA } from "./resonators/havoc/chisa.js";
import { DANJIN } from "./resonators/havoc/danjin.js";
import { PHRO_12s, PHRO_10s } from "./resonators/havoc/phrolova.js";
import { ROCCIA, ROCCIA_MDPS } from "./resonators/havoc/roccia.js";
import { ROVER_HAVOC } from "./resonators/havoc/rover_havoc.js";
import { XUANLING, XUANLING_2F } from "./resonators/havoc/xuanling.js";
import { JINHSI, JINHSI_SUPPORT } from "./resonators/spectro/jinhsi.js";
import { LUCY } from "./resonators/spectro/lucy.js";
import { LUUK, LUUK_16s } from "./resonators/spectro/luuk.js";
import { LYNAE_RUPTURE, LYNAE_STRAIN } from "./resonators/spectro/lynae.js";
import { ROVER_SPECTRO } from "./resonators/spectro/rover_spectro.js";
import { SHOREKEEPER } from "./resonators/spectro/shorekeeper.js";
import { VERINA } from "./resonators/spectro/verina.js";

/** One position in a team: the main DPS bare, or the list of loadouts a support position runs. */
type Slot = Loadout | Loadout[];

/** Supports that fill one another's slot: with the rest of the team held, swapping one of these for
 *  another is the same fight behind a different buffer, so only one of them stands on the table
 *  until the group is opened up (page/model.ts's own `teamWanted()`). Which one is the slot list's
 *  own doing — whichever of them it names first is the one that runs, so a team leaning on Suisui
 *  or Mornye rather than Shorekeeper simply lists them in that order. */
export const INTERCHANGEABLE = new Set<Loadout>([SHOREKEEPER, MORNYE, SUISUI, BULING, VERINA]);


const TEAMS: Slot[][] = [

  // suoming mdps, electro basic unison
  [[SHOREKEEPER], [JINHSI_SUPPORT], SUOMING_MDPS],
  [[SHOREKEEPER, VERINA, MORNYE], [SANHUA], SUOMING_MDPS_DOUBLE],
  [[SHOREKEEPER, VERINA, MORNYE], [JINHSI_SUPPORT], SUOMING_MDPS],
  [[MORNYE], [LYNAE_RUPTURE], SUOMING_MDPS],
  [[MORNYE], [REBECCA], SUOMING_MDPS],

  // hsin, Unison mode: Suoming or Jinhsi behind her hands over the Unison her Intro answers
  [[SHOREKEEPER, VERINA, MORNYE, SUISUI, BULING], [SUOMING], HSIN_UNISON],
  [[SUOMING], HSIN_UNISON, [JINHSI_SUPPORT]],

  // hsin (Electro Flare mode): electro skill flare
  [[SUISUI, BULING, CHISA], [ROVER_ELECTRO], HSIN_FLARE],
  [[SUISUI, SHOREKEEPER, MORNYE, BULING, CHISA], [CHISA], HSIN_FLARE],
  [[MORNYE], [LYNAE_RUPTURE], HSIN_FLARE],
  [[MORNYE], [REBECCA], HSIN_FLARE],

  // jinhsi: spectro skill
  [[SHOREKEEPER, MORNYE, SUISUI, VERINA, BULING], [ZHEZHI, CANTARELLA, SUOMING, HSIN_UNISON, YINLIN], JINHSI],
  [[MORNYE], [LYNAE_RUPTURE], JINHSI],
  [[MORNYE], [REBECCA], JINHSI],

  // electro rover mdps: Apex Resonance, the Thrum of All Sounds chains
  [[MORNYE, SHOREKEEPER, CHISA, BULING, VERINA, SUISUI], [LYNAE_RUPTURE], ROVER_ELECTRO_MDPS],
  [[MORNYE], [REBECCA], ROVER_ELECTRO_MDPS],

  // jingran: fusion heavy shielder
  [[LUPA], [MORTEFI, BRANT], JINGRAN],
  [[SHOREKEEPER, VERINA, MORNYE, SUISUI, LUPA], [IUNO, MORTEFI], JINGRAN],
  [[MORNYE, SHOREKEEPER, VERINA, SUISUI, LUPA], [LUPA, REBECCA], JINGRAN],
  [[MORNYE], [LYNAE_RUPTURE], JINGRAN],

  // qingxiao: aero heavy/basic/liberation on tune strain
  [[MORNYE, SHOREKEEPER, VERINA, CIACCONA], [DENIA_STRAIN, LYNAE_STRAIN, CIACCONA, SANHUA, MORTEFI, REBECCA, JIANXIN], QINGXIAO],

  // xuanling: havoc heavy attack on Havoc Bane — Chisa's +3 to every Negative Status cap is what
  // takes Unbroken Vow off its 3-stack 30% tier onto the 4-6 stack 36% one
  [[SUISUI, CHISA, VERINA, SHOREKEEPER], [MORTEFI, REBECCA, IUNO, PHRO_10s, CHISA], XUANLING],

  // lucy: spectro heavy on tune hack, with rebecca feeding her the outro
  [[MORNYE, SHOREKEEPER, VERINA], [REBECCA, LYNAE_RUPTURE, MORTEFI], LUCY],

  // hiyuki: glacio chafe/bite — every stack the team lands calculates at the target's own limit,
  // which is why Chisa (+3 to it) and Lucilla's Chafe build stand behind her
  [[SUISUI], PHRO_10s, HIYUKI],
  [[SUISUI], CARLOTTA, HIYUKI],
  [PHRO_10s, [LUCILLA], HIYUKI],
  [HIYUKI, CARLOTTA, [LUCILLA_CHAFE]],
  [[SUISUI, CHISA, MORNYE, VERINA, SHOREKEEPER], [LUCILLA_CHAFE, LYNAE_RUPTURE, CHISA, JIANXIN, ROVER_ELECTRO], HIYUKI],

  // sigrika: aero + echo
  [[PHRO_10s, QIUYUAN], [QIUYUAN, LUCILLA], SIGRIKA_FAST],
  [[QIUYUAN], SIGRIKA_EXTEND, [IUNO]],
  [[MORNYE], [LYNAE_RUPTURE], SIGRIKA_FAST],
  [[CIACCONA], [QIUYUAN, LUCILLA], SIGRIKA_FAST],
  [[SHOREKEEPER, VERINA], [LUCILLA, CANTARELLA, ROVER_AERO], SIGRIKA_FAST],
  [[SHOREKEEPER, VERINA], [QIUYUAN, CIACCONA], SIGRIKA_EXTEND],

  // luuk: spectro basic, tune strain
  [[VERINA], [LYNAE_STRAIN], LUUK_16s],
  [[MORNYE, SHOREKEEPER, VERINA], [SANHUA, DENIA_STRAIN], LUUK_16s],
  [[MORNYE, SHOREKEEPER], [LYNAE_STRAIN], LUUK],

  // aemeath: fusion liberation on tune rupture — Mornye and Lynae answer the break beside her
  [[MORNYE, SHOREKEEPER, VERINA], [LYNAE_RUPTURE, CHANGLI, LUPA], AEMEATH_RUPTURE],
  [[MORNYE], [JIANXIN, DENIA_BURST], AEMEATH_RUPTURE],
  [[LUPA], [LYNAE_RUPTURE, CHANGLI, JIANXIN, BRANT], AEMEATH_RUPTURE],
  [[DENIA_BURST], [LYNAE_RUPTURE], AEMEATH_RUPTURE],

  // aemeath: fusion liberation on fusion burst — Denia's Burst mode feeds the stacks and amplifies
  [[SUISUI, CHISA], [DENIA_BURST], AEMEATH_BURST],
  [[DENIA_BURST], [LYNAE_RUPTURE, CHANGLI, LUPA], AEMEATH_BURST],
  [[LUPA], [CHANGLI, BRANT], AEMEATH_BURST],
  [[SUISUI, SHOREKEEPER, VERINA, LUPA, DENIA_BURST, CHISA, MORNYE], [DENIA_BURST, LUPA, JIANXIN, ROVER_ELECTRO], AEMEATH_BURST],

  // qiuyuan: aero heavy echo
  [[SHOREKEEPER, VERINA, CIACCONA, MORNYE, SUISUI], [MORTEFI, IUNO, CIACCONA, LUCILLA], QIUYUAN_MDPS],
  [[MORNYE, SHOREKEEPER, VERINA, CIACCONA, SUISUI], [REBECCA,LYNAE_RUPTURE], QIUYUAN_MDPS],
  [[SHOREKEEPER, VERINA], PHRO_10s, QIUYUAN_MDPS],

  // galbrena: fusion echo and heavy
  [[SHOREKEEPER, VERINA, MORNYE, SUISUI, LUPA], [BRANT, MORTEFI, IUNO, QIUYUAN, LUCILLA], GALBRENA],
  [[MORNYE, SHOREKEEPER, VERINA, SUISUI, DENIA_BURST], [LUPA], GALBRENA],
  [[MORNYE, SHOREKEEPER, VERINA, SUISUI, DENIA_BURST], [REBECCA], GALBRENA],
  [[MORNYE], [LYNAE_RUPTURE], GALBRENA],

  // iuno mdps: aero + echo
  [[CIACCONA], [JIANXIN], IUNO_MDPS],
  [[SHOREKEEPER, CIACCONA, VERINA, MORNYE, SUISUI], [CIACCONA, JIANXIN], IUNO_MDPS],
  [[MORNYE, SHOREKEEPER, CIACCONA, VERINA, SUISUI], [LYNAE_RUPTURE], IUNO_MDPS],

  // augusta: electro heavy shielder
  [[SHOREKEEPER], [AUGUSTA], SUOMING],
  [[SHOREKEEPER, VERINA, MORNYE, SUISUI], [IUNO, MORTEFI], AUGUSTA],
  [[MORNYE, SHOREKEEPER, VERINA, SUISUI], [REBECCA], AUGUSTA],
  [[MORNYE], [LYNAE_RUPTURE], AUGUSTA],

  // phrolova: havoc, echo, skill
  [PHRO_10s, [JINHSI_SUPPORT], [CANTARELLA]],
  [PHRO_10s, [QIUYUAN, LUCILLA, LYNAE_RUPTURE, DANJIN, ROCCIA], [LUCILLA, QIUYUAN, LYNAE_RUPTURE, CANTARELLA]],

  [PHRO_12s, [SHOREKEEPER, BULING, MORNYE, SUISUI, VERINA], [QIUYUAN, DANJIN, LUCILLA, CANTARELLA, ROCCIA]],
  [PHRO_12s, [QIUYUAN, ROCCIA, DANJIN], [SHOREKEEPER, SUISUI, MORNYE, VERINA]],

  [PHRO_12s, [MORNYE], [LYNAE_RUPTURE]],

  // cartethyia: aero HP-scaling basic attack on Aero Erosion — Aero Rover and Chisa both raise the
  // status's own cap, which is what her Erosion ticks and her Blade's amplification both read
  [[CHISA, ROVER_AERO, CIACCONA], [SANHUA, ROVER_AERO], CARTETHYIA],
  [[ROVER_AERO, SUISUI, CHISA, CIACCONA, SHOREKEEPER, MORNYE], [SANHUA, ROVER_AERO, CHISA], CARTETHYIA],

  // brant: fusion basic
  [[SHOREKEEPER, DENIA_BURST, MORNYE, VERINA, SUISUI], [SANHUA, DENIA_BURST], BRANT_MDPS],
  [[MORNYE, SHOREKEEPER, DENIA_BURST, VERINA, SUISUI], [LUPA], BRANT_MDPS],
  [[LUPA], BRANT, CHANGLI],
  [[LUPA], BRANT, ENCORE],

  // cantarella: havoc basic, echo
  //[[SHOREKEEPER], [SANHUA, ROCCIA], CANTARELLA_MDPS],
  [[SHOREKEEPER, VERINA, MORNYE, SUISUI], [SANHUA, ROCCIA], CANTARELLA_MDPS],
  [[MORNYE], [REBECCA], CANTARELLA_MDPS],
  [[MORNYE], [LYNAE_RUPTURE], CANTARELLA_MDPS],

  // carlotta: glacio skill
  [[SHOREKEEPER, BULING, VERINA, MORNYE, SUISUI], [BRANT, ZHEZHI, LUCILLA_CHAFE], CARLOTTA],
  [[MORNYE], [REBECCA], CARLOTTA],
  [[MORNYE], [LYNAE_RUPTURE], CARLOTTA],

  // roccia: havoc heavy
  [[SHOREKEEPER, VERINA, MORNYE, SUISUI], [MORTEFI, IUNO], ROCCIA_MDPS],
  [[MORNYE, SHOREKEEPER, VERINA, SUISUI], [REBECCA], ROCCIA_MDPS],
  [[MORNYE], [LYNAE_RUPTURE], ROCCIA_MDPS],
  //[[SHOREKEEPER, VERINA, MORNYE, SUISUI], PHROLO_10s, ROCCIA_MDPS],

  // camellya: havoc basic
  [[VERINA], [SANHUA], CAMELLYA_DOUBLE_ALWAYS],
  [[SHOREKEEPER], [SANHUA], CAMELLYA_DOUBLE_123S6],
  [[VERINA], [ROCCIA], CAMELLYA_DOUBLE_123S6],
  [[SHOREKEEPER], [ROCCIA], CAMELLYA_123_ALWAYS],
  [[MORNYE], [LYNAE_RUPTURE], CAMELLYA_123_ALWAYS],

  // xiangli yao: electro liberation
  [[SHOREKEEPER], [YINLIN], XIANGLI_YAO],
  [[SHOREKEEPER, VERINA, MORNYE, SUISUI], [YINLIN, JIANXIN], XIANGLI_YAO],
  [[MORNYE, SHOREKEEPER, VERINA, SUISUI], [LYNAE_RUPTURE], XIANGLI_YAO],

  // changli: fusion skill+liberation
  [[DENIA_BURST], [LUPA], CHANGLI],
  [[MORNYE, LUPA, SHOREKEEPER, DENIA_BURST, VERINA, SUISUI], [LUPA], CHANGLI],
  [[MORNYE, LUPA, SHOREKEEPER, DENIA_BURST, VERINA, SUISUI], [LYNAE_RUPTURE], CHANGLI],

  // jiyan: aero heavy
  [[CIACCONA], [IUNO], JIYAN],
  [[SHOREKEEPER, VERINA, CIACCONA, MORNYE, SUISUI], [MORTEFI, IUNO, CIACCONA, PHRO_10s], JIYAN],
  [[MORNYE, SHOREKEEPER, VERINA, CIACCONA, SUISUI], [REBECCA], JIYAN],
  [[MORNYE], [LYNAE_RUPTURE], JIYAN],

  // encore: fusion basic
  //[[SHOREKEEPER, VERINA, DENIA_BURST, LUPA], [LUPA, SANHUA, DENIA_BURST], ENCORE],
  //[[LUPA], ENCORE, [CHANGLI, BRANT]],

  // havoc rover: havoc, mixed
  //[[SHOREKEEPER, VERINA, MORNYE], [ROCCIA, DANJIN, SANHUA, LYNAE_RUPTURE, CANTARELLA], ROVER_HAVOC],
];

/** `mdps[i]`: whether slot i is one of the team's main DPS — per team, never stamped on the shared
 *  Loadout. `lead`: where this team's interchangeable support stood in the slot list it was picked
 *  from, so the list's own order says which of them the group runs (`PRIMARY_TEAM`); -1 for a team
 *  with no interchangeable support at all. */
export interface TeamEntry { loadouts: Loadout[]; mdps: boolean[]; lead: number }

/** Teams the scheduler can't play — thrown below so the roster's mistake shows on the loading screen. */
const UNPLAYABLE_TEAMS: { names: string[]; why: string }[] = [];

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
const EXPANDED: TeamEntry[] = TEAMS.flatMap((slots) => {
  // a bare loadout is a main DPS; a list is a support position, however many choices it holds
  const mdps = slots.map((s) => !Array.isArray(s));
  const [a, b, c] = slots.map((s) => (Array.isArray(s) ? [...new Set(s)] : [s]));
  if (!mdps.some(Boolean)) {
    const names = [a, b, c].map((s) => s!.map((l) => l.resonator.name).join("/")).join(", ");
    throw new Error(`the team [${names}] has no bare loadout naming its main DPS`);
  }
  return a!.flatMap((x, i) => b!.flatMap((y, j) => c!.map((z, k) => ({
    loadouts: [x, y, z], mdps,
    lead: ([[x, i], [y, j], [z, k]] as const).find(([l]) => INTERCHANGEABLE.has(l))?.[1] ?? -1,
  }))))
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
 *  main-DPS slots, is the same fight however many entries produced it — the rosters overlap
 *  constantly. First occurrence keeps its place. */
export const ALL_TEAMS: TeamEntry[] = [...EXPANDED.reduce((by, team) => {
  const key = `${team.loadouts.map(idOf).join(".")}|${team.mdps.map(Number).join("")}`;
  const seen = by.get(key);
  // the earliest list that named it wins: two entries can reach the same team from lists that
  // disagree about its support's place, and the table runs the one some list puts first
  if (seen) seen.lead = Math.min(seen.lead, team.lead);
  else by.set(key, team);
  return by;
}, new Map<string, TeamEntry>()).values()];

if (UNPLAYABLE_TEAMS.length) {
  throw new Error(`teams.ts lists ${UNPLAYABLE_TEAMS.length} team(s) the scheduler can't play:\n`
    + UNPLAYABLE_TEAMS.map((t) => `  ${t.names.join(" / ")} — ${t.why}`).join("\n"));
}

/** Per team, what it is *besides* its interchangeable support — those slots blanked, the rest kept
 *  in place, since a support two positions apart opens a different rotation. Teams sharing one of
 *  these are the same line on the table. */
const SUPPORT_GROUP: string[] = ALL_TEAMS.map(({ loadouts, mdps }) => loadouts
  .map((l, i) => (INTERCHANGEABLE.has(l) ? "*" : `${idOf(l)}${mdps[i] ? "m" : ""}`))
  .join("."));

/** The one team of each group that runs by default — the rest are never solved until the group is
 *  opened (page/model.ts's own `teamWanted()`). A team with no interchangeable support is its own
 *  group and always stands. */
export const PRIMARY_TEAM: boolean[] = ALL_TEAMS.map(() => false);
{
  const best = new Map<string, { lead: number; index: number }>();
  ALL_TEAMS.forEach((team, i) => {
    const held = best.get(SUPPORT_GROUP[i]!);
    if (!held || team.lead < held.lead) best.set(SUPPORT_GROUP[i]!, { lead: team.lead, index: i });
  });
  for (const { index } of best.values()) PRIMARY_TEAM[index] = true;
}

/** A team's key: its slot in `ALL_TEAMS`. No dash — a row key is this plus per-member combo keys. */
export const teamKey = (index: number): string => `t${index}`;

/** `undefined` for a stale key, so an old bookmark falls back to the table. */
export const teamAt = (key: string): TeamEntry | undefined =>
  /^t\d+$/.test(key) ? ALL_TEAMS[Number(key.slice(1))] : undefined;
