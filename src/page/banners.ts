/**
 * Banners: wuwalab's official hero or splash art for each resonator who has one, never a piece credited
 * to an artist (images/banners/<id>.webp, 1920 wide). Shown as tabs above the table while no filter is
 * set, and behind a team page as its backdrop.
 */
import { TEAMS } from "./model.js";
import type { Member, Axis } from "../solve/solver.js";

/** Every resonator with art in images/banners/: by id, or by lowercase name until their id is known. */
export const BANNER_ART = new Set<number | string>(["anna", "lucielle", 1103, 1104, 1105, 1107, 1108, 1109, 1110, 1205, 1206, 1207, 1208, 1209, 1210, 1211, 1212, 1304, 1306, 1308, 1309, 1311, 1312, 1406, 1407, 1409, 1410, 1411, 1412, 1413, 1501, 1505, 1506, 1507, 1508, 1509, 1510, 1511, 1512, 1603, 1606, 1607, 1608, 1610]);

/** A tab under a banner, cut from the next strip of the same art: it shows the teams of `show` (resonator
 *  ids) with the banner's resonator compared on `compare`. */
export interface SubBanner { title: string; show: number[]; compare: Axis }
/** The banners while no filter is set, newest first: who, the line over their art, and the tabs
 *  beneath it. */
export const BANNERS: { id: number; title: string; subs?: SubBanner[] }[] = [
  { id: 1512, title: "Lily Calcs Released" },
];

/** A resonator's banner art, by id or else by name, or null where they have none. */
export function bannerUrl(r: { id: number; name: string }): string | null {
  const key = BANNER_ART.has(r.id) ? r.id : BANNER_ART.has(r.name.toLowerCase()) ? r.name.toLowerCase() : null;
  return key === null ? null : `./images/banners/${key}.webp`;
}

/** A roster member of resonator `id`, for their name, colour and filter tag. */
export function memberOfId(id: number): Member | undefined {
  for (const ms of Object.values(TEAMS)) for (const m of ms) if (m.loadout.resonator.id === id) return m;
  return undefined;
}
