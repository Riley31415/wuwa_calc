import {
  FALLBACK_HUE,
  MATRIX_RESONATORS,
  OPTION_FILTER_MAPS,
  README,
  RESONATOR_HUE,
  ROW_CAP,
  TEAMS,
  comparable,
  costBox,
  echoFilters,
  filters,
  fmt,
  fmtExact,
  fmtPct,
  hashParams,
  matrixBox,
  memberLabel,
  pinnedRows,
  prospectiveRows,
  pruneGearFilters,
  refineFilters,
  refineTag,
  resonatorFilters,
  results,
  rowFromKey,
  sequenceFilters,
  sequenceTag,
  sequenceTagsOf,
  setVisibleRows,
  syncCell,
  syncHash,
  tagOwner,
  teamRows,
  visibleRows,
  weaponFilters,
  weaponHue,
  weaponOwner,
  weaponTag
} from "./chunk-RUPMSA6L.js";
import {
  AXES,
  ActionTag,
  Echo,
  NODE_NAME,
  Sonata,
  TAG_NAME,
  TUNE_BREAK_ENEMY,
  Weapon,
  atDelays,
  axisOpen,
  axisUsed,
  compares,
  echoLabel,
  echoLines,
  echoPicks,
  eligibleWeapons,
  erRollsFor,
  hitsOf,
  isPercent,
  litStats,
  loadoutName,
  mainstatSlotBuffs,
  menuStats,
  panelStats,
  rankShown,
  rankValue,
  scopedKey,
  scopedStat,
  sequenceLevels,
  shownRanks,
  splitStat,
  splitStop,
  statDisplayScale,
  statLabel,
  substatRollBuffs,
  weaponBase
} from "./chunk-4CKV7HFV.js";

// dist/src/page/panels.js
var esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
var coarse = matchMedia("(pointer: coarse)").matches;
var CLICK = coarse ? "Tap" : "Click";
var CLICKING = coarse ? "tapping" : "clicking";
var lazyPop = (html) => html ? ` data-pop='${html.replace(/&/g, "&amp;").replace(/'/g, "&#39;")}'` : "";
var deferredPop = (kind, key) => ` data-pop-kind="${kind}" data-pop-key="${esc(key)}"`;
function buildPop(kind, key) {
  if (kind === "dpr") {
    const run = results.get(key);
    return run ? `<span class="pop dpr">${dprTable(run)}</span>` : "";
  }
  return "";
}
var zoom = () => {
  const w = document.body.clientWidth;
  return w ? document.body.getBoundingClientRect().width / w : 1;
};
var rect = (el) => {
  const r = el.getBoundingClientRect(), z = zoom();
  return z === 1 ? r : new DOMRect(r.x / z, r.y / z, r.width / z, r.height / z);
};
function copyBlock(rows, mode = "discord") {
  const wide = rows[0]?.map((_, c) => Math.max(...rows.map((r) => r[c].length))) ?? [];
  const text = rows.map((r) => r.map((t, c) => t.padEnd(wide[c])).join("  ").trimEnd()).join("\n");
  const plain = mode === "sheets" ? rows.map((r) => r.join("	")).join("\n") : "```\n" + text + "\n```";
  const html = `<table>${rows.map((r) => `<tr>${r.map((t) => `<td>${esc(t)}</td>`).join("")}</tr>`).join("")}</table>`;
  const clip = navigator.clipboard;
  if (!clip)
    return;
  const write = typeof ClipboardItem === "undefined" ? clip.writeText(plain) : clip.write([new ClipboardItem({
    "text/plain": new Blob([plain], { type: "text/plain" }),
    "text/html": new Blob([html], { type: "text/html" })
  })]);
  write.catch(() => clip.writeText(plain).catch(() => {
  }));
}
var clearPops = () => {
  document.body.querySelectorAll(":scope > .pop").forEach((el) => el.remove());
};
var unit = (r) => r.percent ?? (r.stat !== void 0 ? isPercent(r.stat) : false) ? "%" : "";
var SECTION_ORDER = ["base", "bonus", "flat", "final", "cast", "energy"];
var SECTION_RANK = (key) => {
  if (key === null)
    return -1;
  const word = key.split(" ")[0].toLowerCase();
  const i = SECTION_ORDER.indexOf(word);
  return i === -1 ? SECTION_ORDER.length + 1 : i;
};
var panelRow = (r, slotHue, { noSource = false } = {}) => {
  const own = r.owner !== void 0 ? slotHue.get(r.owner ?? "") ?? TUNE_BREAK_ENEMY.color : null;
  const label = r.label ?? (r.stat !== void 0 ? statLabel(r.stat) : "");
  const source = (r.count ?? 1) > 1 ? `${r.source} x${r.count}` : r.source;
  const show = (v) => unit(r) ? fmtPct(v) : r.digits === void 0 ? fmtExact(v) : fmt(v, r.digits, true);
  const value = `<td class="v">${r.text !== void 0 ? esc(r.text) : r.mult ? `&times;${show(r.value)}` : `${show(r.value)}${unit(r)}`}</td>`;
  if (r.summary)
    return `<tr class="sum${r.joined ? " joined" : ""}"><td class="k">${esc(label)}</td>${value}</tr>`;
  return noSource ? `<tr><td class="k">${esc(label)}</td>${value}</tr>` : `<tr><td class="s"${own ? ` style="--own:${own}"` : ""}>${esc(source || label)}</td>${value}</tr>`;
};
function popover(col, rows, total, slotHue, suffix = "", empty = "") {
  if (!rows)
    return "";
  const noSource = col.key === "avg";
  const row = (r) => panelRow(r, slotHue, { noSource });
  const before = rows.filter((r) => r.place === "beforeTotal");
  const after = rows.filter((r) => r.place === "afterTotal");
  const listed = rows.filter((r) => !r.place);
  const bySection = /* @__PURE__ */ new Map();
  for (const r of listed) {
    const key = r.section ?? null;
    if (!bySection.has(key))
      bySection.set(key, []);
    bySection.get(key).push(r);
  }
  const sections = [...bySection].map(([key, group]) => ({ key, rows: group })).sort((a, b) => SECTION_RANK(a.key) - SECTION_RANK(b.key));
  const body = sections.map(({ key, rows: group }) => `<tr class="sec"><td colspan="2">${esc(key ?? col.full ?? col.label)}</td></tr>` + group.map(row).join("")).join("");
  const titled = sections.length ? body : `<tr class="sec${empty ? " plain" : ""}"><td colspan="2">${esc(empty || (col.fullEmpty ?? col.full ?? col.label))}</td></tr>`;
  const sum = col.noTotal ? "" : `<tr class="sum"><td class="k">Total</td><td class="v">${col.percent ? `${fmtPct(total)}%` : fmtExact(total)}${esc(suffix)}</td></tr>`;
  const tail = after.map((r, i) => (r.section && r.section !== after[i - 1]?.section ? `<tr class="sec"><td colspan="2">${esc(r.section)}</td></tr>` : "") + row(r)).join("");
  return lazyPop(`<span class="pop stat${col.key === "avg" ? " damage" : ""}"><table>${titled}${before.map(row).join("")}${sum}${tail}</table></span>`);
}
function hitsPopover(hits) {
  if (!hits.length)
    return "";
  const row = (label, v, cls = "") => `<tr${cls}><td class="k">${esc(label)}</td>${v.map((x) => `<td class="v">${fmt(x, 0)}</td>`).join("")}</tr>`;
  const total = hits.reduce((t, h) => [t[0] + h.avg, t[1] + h.crit, t[2] + h.noCrit], [0, 0, 0]);
  return lazyPop(`<span class="pop stat hits"><table><tr class="sec"><td>Hits</td><td>Avg</td><td>Crit</td><td>Base</td></tr>` + hits.map((h) => row(`Hit ${h.n}`, [h.avg, h.crit, h.noCrit])).join("") + row("Total", total, ' class="sum"') + `</table></span>`);
}
function infoPopover(info, slotHue) {
  if (!info?.length)
    return "";
  const rows = info.map((e) => {
    if (e.source !== void 0) {
      const hue = slotHue.get(e.source) ?? TUNE_BREAK_ENEMY.color;
      return `<tr><td class="k">${esc(e.label)}</td><td class="v s" style="--own:${hue}">${esc(e.value)}</td></tr>`;
    }
    return `<tr><td class="k">${esc(e.label)}</td><td class="v">${esc(e.value)}</td></tr>`;
  }).join("");
  return lazyPop(`<span class="pop info"><table>${rows}</table></span>`);
}
function framesPopover(snaps) {
  const line = (k, v, cls = "") => `<tr${cls}><td class="k">${esc(k)}</td><td class="v">${v}</td></tr>`;
  const rows = [];
  let total = 0, banks = 0;
  for (const s of snaps) {
    if (!s.active)
      continue;
    const press = s.hitAt !== void 0 ? s.action.castPart() : s.action;
    const fast = s.tag === ActionTag.MashCancel;
    const hold = (s.tag === ActionTag.HoldCancel || fast) && s.holdPaid >= 0;
    const cost = atDelays(s.delays, () => hold ? press.holdCost(s.holdCut) : press.cost(s.tag));
    total += cost.total - s.timestopBanked;
    const insta = s.tag === ActionTag.InstaCancel || s.tag === ActionTag.InstaDodge || s.tag === ActionTag.InstaJump || s.tag === ActionTag.InstaSwap;
    const cut = s.tag === ActionTag.Cancel || s.tag === ActionTag.MashCancel || s.tag === ActionTag.HoldCancel || s.tag === ActionTag.DodgeCancel || s.tag === ActionTag.JumpCancel || s.tag === ActionTag.SwapCancel || s.tag === ActionTag.MashSwap || s.tag === ActionTag.HitCancel || s.tag === ActionTag.DodgeOnHit || s.tag === ActionTag.JumpOnHit;
    if (hold) {
      const own = Math.min(s.holdPaid, cost.action);
      if (own)
        rows.push(line(`${s.action.name} (c)`, own));
      if (cost.action > own)
        rows.push(line(fast ? "Mash Input" : "Hold Input", cost.action - own));
    } else if (s.tag === ActionTag.MashSwap) {
      const own = Math.min(s.action.noSwapFrames, cost.action);
      rows.push(line(`${s.action.name} (c)`, own));
      if (cost.action > own)
        rows.push(line("Swap Delay", cost.action - own));
    } else if (!insta)
      rows.push(line(`${s.action.name}${cut ? " (c)" : ""}`, cost.action));
    if (cost.timestop)
      rows.push(line("Timestop", -cost.timestop));
    const swaps = s.tag === ActionTag.InstaSwap || s.tag === ActionTag.SwapCancel || s.tag === ActionTag.MashSwap;
    if (cost.global)
      rows.push(line(swaps ? "Swap Delay" : insta ? "Input Delay" : "Cancel Timing", cost.global));
    if (s.timestopBanked)
      rows.push(line("Banked Timestop", -s.timestopBanked));
    if (s.swapFrames)
      rows.push(line("Swap Delay", s.swapFrames));
    total += s.swapFrames ?? 0;
    banks += splitStop(press.timestopFrom, press.timestop, cost.action, cost.action + cost.global).banked;
  }
  return lazyPop(`<span class="pop frames"><table><tr class="sec"><td colspan="2">Active Frames</td></tr>` + rows.join("") + line("Total", total, ' class="sum"') + (banks ? line("Timestop Banked", banks) : "") + `</table></span>`);
}
var GEAR_SECTION_ENABLED = false;
function buffsPopover(member, gear, local, global, enemy, slotHue) {
  const showGear = GEAR_SECTION_ENABLED && gear.length > 0;
  if (!showGear && !local.length && !global.length && !enemy.length) {
    return lazyPop(`<span class="pop buffs"><table><tr class="sec"><td>No buffs</td></tr></table></span>`);
  }
  const order = [...slotHue.keys()];
  const rank = (b) => {
    const i = order.indexOf(b.source);
    return i === -1 ? order.length : i;
  };
  const sorted = (buffs) => [...buffs].sort((a, b) => rank(a) - rank(b) || a.source.localeCompare(b.source) || a.name.localeCompare(b.name));
  const left = (frames) => frames > 0 ? ` <span class="left">(${Math.round(frames / 6) / 10}s)</span>` : "";
  const row = (name, hue, frames = 0) => `<tr><td class="s" style="--own:${hue}">${esc(name)}${left(frames)}</td></tr>`;
  const own = slotHue.get(member) ?? FALLBACK_HUE;
  const gearSection = showGear ? `<tr class="sec"><td>Gear</td></tr>` + gear.map((g) => row(g.name, own)).join("") : "";
  const section = (heading, buffs) => buffs.length ? `<tr class="sec"><td>${esc(heading)}</td></tr>` + sorted(buffs).map((b) => row(b.name, slotHue.get(b.source) ?? TUNE_BREAK_ENEMY.color, b.left)).join("") : "";
  const columns = [
    gearSection + section("Local buffs", local),
    section("Global buffs", global),
    section("Enemy debuffs", enemy)
  ].filter(Boolean).map((rows) => `<table>${rows}</table>`).join("");
  return lazyPop(`<span class="pop buffs"><div class="cols">${columns}</div></span>`);
}
function eachHit(lines, slot, fn) {
  const mine = (snap) => slot === null || snap.slot === slot;
  for (const line of lines) {
    if (line.aggregate)
      continue;
    if (!line.isChain) {
      if (mine(line.snap))
        fn(line.snap, line.avg);
      continue;
    }
    const members = new Set(line.members ?? []);
    for (const p of line.parts)
      if (members.has(p.snap) && mine(p.snap))
        fn(p.snap, p.dmg.avg);
  }
}
function equippedGear(member, combo, erRolls = 1) {
  const l = member.loadout;
  const r = l.resonator;
  return [
    ...r.inherent1 ? [["Inherent", r.inherent1]] : [],
    ...r.inherent2 ? [["Inherent", r.inherent2]] : [],
    ["Weapon", combo.weapon],
    ["Mainslot", combo.echo.mainslot],
    ...combo.echo.sets.map((g, i) => [i === 0 ? "Sonata" : "", g]),
    ...l.echoes.worn(combo.echo, combo.mainstat, l.spread(combo.highSubs, erRolls)).map((g) => ["Echo", g])
  ];
}
var ATTRIBUTE_SCOPES = [
  64,
  128,
  192,
  256,
  320,
  384,
  448
];
var CORE_TYPE_SCOPES = [
  4096,
  8192,
  12288,
  16384
  /* Type.Liberation */
];
var OTHER_SCOPES = [
  20480,
  24576,
  28672,
  32768,
  36864,
  40960,
  49152,
  53248,
  262144,
  524288,
  786432,
  1048576,
  1310720,
  1572864
];
function menuStatRows(member, combo, erRolls) {
  const l = member.loadout;
  const pieces = l.pieces(combo.weapon, combo.echo, combo.mainstat, combo.sequence, combo.matrix !== null, combo.highSubs, erRolls);
  const entries = menuStats(pieces);
  const totals = /* @__PURE__ */ new Map();
  for (const e of entries)
    totals.set(e.stat, (totals.get(e.stat) ?? 0) + e.value);
  const get = (key) => totals.get(key) ?? 0;
  const folded = panelStats(pieces);
  const rows = [];
  const push = (label, value, percent) => {
    if (!value)
      return;
    rows.push({ label, value: percent ? `${fmtPct(value)}%` : fmt(value) });
  };
  const pushBest = (scopes) => {
    let bestTag = null, bestValue = 0;
    for (const tag of scopes) {
      const v = get(scopedStat(
        tag,
        18
        /* Stat.DmgBonus */
      ));
      if (v > bestValue) {
        bestValue = v;
        bestTag = tag;
      }
    }
    if (bestTag !== null)
      push(statLabel(scopedStat(
        bestTag,
        18
        /* Stat.DmgBonus */
      )), bestValue, true);
  };
  push("HP", folded.hp, false);
  push("ATK", folded.atk, false);
  push("DEF", folded.def, false);
  push(statLabel(
    11
    /* Stat.ER */
  ), get(
    11
    /* Stat.ER */
  ), true);
  push(statLabel(
    9
    /* Stat.CritRate */
  ), get(
    9
    /* Stat.CritRate */
  ), true);
  push(statLabel(
    10
    /* Stat.CritDmg */
  ), get(
    10
    /* Stat.CritDmg */
  ), true);
  push(statLabel(
    12
    /* Stat.TBB */
  ), get(
    12
    /* Stat.TBB */
  ), false);
  pushBest(ATTRIBUTE_SCOPES);
  pushBest(CORE_TYPE_SCOPES);
  pushBest(OTHER_SCOPES);
  return rows;
}
var subsLabel = (combo) => combo.highSubs ? "High Invest" : "ChemX32";
function declaredRows(buffs, owner, fold, lit = []) {
  const rowsOf = (b) => b.decl.stats.map((line) => {
    const [stat, value, tag] = line;
    return { stat: tag === void 0 ? stat : scopedStat(tag, stat), value, source: b.name, owner, gear: b };
  });
  if (!fold)
    return buffs.flatMap(rowsOf);
  const by2 = /* @__PURE__ */ new Map();
  for (const b of buffs) {
    const rows = rowsOf(b);
    const key = `${b.name} ${rows.map((e) => e.stat).join(",")}`;
    const seen = by2.get(key);
    if (seen)
      seen.n++;
    else
      by2.set(key, { rows, n: 1 });
  }
  return [...by2.values()].flatMap(({ rows, n }) => rows.map((e) => ({
    ...e,
    value: e.value * n,
    source: `${e.source} x${n}`,
    dim: n === 1 && !lit.includes(e.stat)
  })));
}
function buffStats(run, keep) {
  const grantedBy = run.state?.grantedBy;
  if (!grantedBy || !run.rotationLines)
    return [];
  const rootOf = (g) => grantedBy.get(g) ?? g.mainslot ?? g;
  const peak = /* @__PURE__ */ new Map();
  for (const section of run.rotationLines) {
    for (const line of section) {
      for (const snap of hitsOf(line)) {
        for (const e of snap.entries) {
          if (!e.gear || e.value === 0 || !keep(rootOf(e.gear), e, snap.slot))
            continue;
          let byStat = peak.get(e.gear);
          if (!byStat)
            peak.set(e.gear, byStat = /* @__PURE__ */ new Map());
          if (e.value > (byStat.get(e.stat)?.value ?? 0))
            byStat.set(e.stat, e);
        }
      }
    }
  }
  return [...peak.values()].flatMap((byStat) => [...byStat.values()]);
}
var lineKey = (e) => `${e.gear?.engineId} ${e.stat} ${e.value}`;
var constantKeys = (stats) => new Set(stats.map(lineKey));
var statRow = (e, owner, slotHue, noStat = false) => {
  const percent = isPercent(e.stat);
  const stat = splitStat(e.stat)[0];
  return `<tr class="stat${e.dim ? " one" : ""}"><td class="s" style="--own:${slotHue.get(owner) ?? FALLBACK_HUE}">${esc(e.source)}</td>` + (noStat ? "" : `<td class="k">${esc(statLabel(e.stat))}</td>`) + `<td class="v">${percent ? `${fmtPct(e.value / statDisplayScale(stat))}%` : fmt(e.value / statDisplayScale(stat))}</td></tr>`;
};
function piecePopover(run, pieces, owner, slotHue) {
  const own = new Set(pieces);
  const stats = menuStats(pieces);
  const constant = constantKeys(stats);
  const grantedOn = run.state?.grantedOn;
  const grantedBy = run.state?.grantedBy;
  const order = new Map(pieces.map((g, i) => [g, i]));
  const rank = (e) => order.get((e.gear ? grantedBy?.get(e.gear) : void 0) ?? e.gear) ?? 0;
  const mine = (e, slot) => (grantedOn?.get(e.gear) ?? slot) === owner;
  const buffs = buffStats(run, (root, e, slot) => own.has(root) && !constant.has(lineKey(e)) && mine(e, slot));
  return statsPanel(stats, buffs.sort((a, b) => rank(a) - rank(b)), owner, slotHue);
}
function resonatorPopover(run, kit, equipped, owner, slotHue) {
  const own = new Set(kit);
  const stats = menuStats(kit);
  const constant = constantKeys(stats);
  const mine = (root, e) => e.owner === owner && (own.has(root) || !equipped.has(root)) && !constant.has(lineKey(e));
  const order = new Map(kit.map((g, i) => [g, i]));
  const rank = (e) => order.get((e.gear ? run.state?.grantedBy.get(e.gear) : void 0) ?? e.gear) ?? 0;
  return statsPanel(stats, buffStats(run, mine).sort((a, b) => rank(a) - rank(b)), owner, slotHue);
}
function statsPanel(stats, buffs, owner, slotHue, heading = "Stats", noStat = false) {
  const row = (e) => statRow(e, owner, slotHue, noStat);
  const cols = noStat ? 2 : 3;
  if (!stats.length && !buffs.length)
    return "";
  return lazyPop(`<span class="pop gear"><table>` + (stats.length ? `<tr class="sec"><td colspan="${cols}">${esc(heading)}</td></tr>${stats.map(row).join("")}` : "") + (buffs.length ? `<tr class="sec"><td colspan="${cols}">Buffs</td></tr>${buffs.map(row).join("")}` : "") + `</table></span>`);
}
function loadoutTable(run, needs, pickable2) {
  const erRolls = erRollsFor(run.teamKey, run.members, run.combo);
  const builds = run.members.map((m, i) => ({ member: m, combo: run.combo[i], erRolls: erRolls[i], slot: i }));
  const slotHue = new Map([
    ...run.members.map((m) => [m.name, m.color]),
    [TUNE_BREAK_ENEMY.name, TUNE_BREAK_ENEMY.color]
  ]);
  const kitOf = ({ member, combo }) => {
    const l = member.loadout, r = l.resonator;
    return [r, r.talent, r.inherent1, r.inherent2, combo.matrix, l.mode, ...l.sequences.slice(0, combo.sequence)].filter((g) => g != null);
  };
  const pick = (slot, kind) => pickable2?.(slot, kind) ? ` data-pick="${kind}" data-slot="${slot}"` : "";
  const equipped = new Set(builds.flatMap(({ member, combo, erRolls: n }) => member.loadout.pieces(combo.weapon, combo.echo, combo.mainstat, combo.sequence, combo.matrix !== null, combo.highSubs, n).flatMap((g) => g instanceof Echo ? [g, ...g.sources] : [g])));
  const head = `<div class="rtrow rthead"><div class="c lbl">Resonator</div>` + builds.map((b) => {
    const hover = resonatorPopover(run, kitOf(b), equipped, b.member.name, slotHue);
    return `<div class="c mem${hover ? " has" : ""}"${hover}${pick(b.slot, "sequences")} style="--mem:${b.member.color}">${esc(loadoutName(b.member.loadout, b.combo.sequence || void 0))}</div>`;
  }).join("") + `</div>`;
  const row = (label, cells) => `<div class="rtrow"><div class="c lbl">${esc(label)}</div>${cells.join("")}</div>`;
  const gearCell = (owner, g, pieces, picks = "") => {
    if (!g)
      return `<div class="c"></div>`;
    const hover = piecePopover(run, pieces ?? [g], owner, slotHue);
    const hue = g instanceof Weapon ? ` style="--mem:${weaponHue(g)};color:${weaponHue(g)}"` : "";
    return `<div class="c${hover ? " has" : ""}"${hover}${picks}${hue}>${esc(g.name)}</div>`;
  };
  const rows = [];
  rows.push(row("Weapon", builds.map((b) => gearCell(b.member.name, b.combo.weapon, void 0, pick(b.slot, "weapons")))));
  rows.push(row("Mainslot", builds.map((b) => gearCell(b.member.name, b.combo.echo.mainslot, void 0, pick(b.slot, "mainslot")))));
  rows.push(row("Sonata", builds.map((b) => {
    const sets = b.combo.echo.sets;
    const pieces = sets.flatMap((g) => g instanceof Sonata ? [g, g.sonata2pc] : [g]);
    return gearCell(b.member.name, sets[0] ?? null, pieces, pick(b.slot, "sonata"));
  })));
  const spreadCell = (piece, owner, stats, heading, noStat = false, picks = "") => {
    const hover = statsPanel(stats, [], owner, slotHue, heading, noStat);
    return `<div class="c has"${hover}${picks}>${esc(piece.name)}</div>`;
  };
  rows.push(row("Mainstats", builds.map((b) => spreadCell(b.combo.mainstat, b.member.name, declaredRows(mainstatSlotBuffs(b.combo.mainstat), b.member.name, false), "Mainstats & Secondary Stats", false, pick(b.slot, "mainstats")))));
  rows.push(row("Substats", builds.map((b) => {
    const l = b.member.loadout;
    const piece = l.spread(b.combo.highSubs, b.erRolls);
    const rolls = substatRollBuffs(piece);
    const lit = litStats(l.resonator.maxEnergy);
    return spreadCell(piece, b.member.name, declaredRows(rolls, b.member.name, true, lit), `Substats (${rolls.length} lines)`, true, pick(b.slot, "substats"));
  })));
  rows.push(row("Menu Stats", builds.map((b) => {
    const req = needs?.get(b.member.name);
    const stats = menuStatRows(b.member, b.combo, b.erRolls).map((r) => {
      const need = req?.get(r.label);
      const label = need ? `${esc(r.label)} ${need}` : esc(r.label);
      return `<tr><td class="k">${label}</td><td class="v">${esc(r.value)}</td></tr>`;
    }).join("");
    return `<div class="c menustats"><table>${stats}</table></div>`;
  })));
  return `<div class="rtable loadout" style="--cols:${builds.length}">${head}${rows.join("")}</div>`;
}
function dprTable(run, lines) {
  const grand = run.fightTotal;
  const flat = lines?.flat();
  const whole = run.sectionTotals.length;
  const slots = [...run.members.map((m) => m.name), TUNE_BREAK_ENEMY.name];
  const slotHue = new Map([
    ...run.members.map((m) => [m.name, m.color]),
    [TUNE_BREAK_ENEMY.name, TUNE_BREAK_ENEMY.color]
  ]);
  const sections = ["Opener", ...Array.from({ length: whole - 1 }, (_, i) => `Loop ${i + 1}`), "4 Rots"];
  const ownTotal = (slot) => run.fightBySlot.get(slot) ?? 0;
  if (lines)
    distRows = [...slots, TEAM_ROW];
  const cell = lines ? /^(\d)(\d)$/.exec(hashParams().get("c") ?? "") : null;
  const selected = !flat ? "" : cell && distRows[+cell[1]] && +cell[2] <= whole ? `${distRows[+cell[1]]}|${cell[2]}` : `${TEAM_ROW}|${whole}`;
  if (lines)
    distCells = new Map([
      ...slots.flatMap((slot) => [...lines.slice(0, whole), lines.flat()].map((sec, i) => [
        `${slot}|${i}`,
        distCell(sec, slot, sections[i] ?? "", slotHue.get(slot) ?? TUNE_BREAK_ENEMY.color)
      ])),
      // the team's own row reads the rotation itself rather than one slot's share of it: one section
      // for each loop column, the whole fight in order for the Total
      ...[...lines.slice(0, whole).map((sec) => [sec]), lines].map((secs, i) => [`${TEAM_ROW}|${i}`, teamCell(secs, sections[i] ?? "", slotHue)])
    ]);
  const head = `<div class="rtrow rthead"><div class="c"></div>` + sections.slice(0, whole).map((n) => `<div class="c num">${n}</div>`).join("") + `<div class="c num tot">Total</div></div>`;
  const valueCell = (sec, value, key, cls = "") => sec ? `<div class="c num dist-cell${cls}${key === selected ? " sel" : ""}" data-dist="${key}">${fmt(value)}</div>` : `<div class="c num${cls}">${fmt(value)}</div>`;
  const rowLabel = (slot, mem) => `<div class="c name"${mem}${lines ? ` data-dist-row="${esc(slot)}"` : ""}>${esc(slot)}</div>`;
  const dataRow = (slot, color) => {
    const own = ownTotal(slot);
    return `<div class="rtrow">` + rowLabel(slot, ` style="--mem:${color}"`) + run.sectionBySlot.map((by2, i) => valueCell(lines?.[i], by2.get(slot) ?? 0, `${slot}|${i}`)).join("") + valueCell(flat, own, `${slot}|${whole}`, " tot") + `</div>`;
  };
  const memberRows = run.members.map((m) => dataRow(m.name, m.color)).join("");
  const tuneBreakRow = dataRow(TUNE_BREAK_ENEMY.name, TUNE_BREAK_ENEMY.color);
  const totalRow = `<div class="rtrow total">` + rowLabel(TEAM_ROW, "") + run.sectionTotals.map((v, i) => valueCell(lines?.[i], v, `${TEAM_ROW}|${i}`)).join("") + valueCell(flat, grand, `${TEAM_ROW}|${whole}`, " tot") + `</div>`;
  const distRow = lines ? distributionRow(selected) : "";
  const rowsCss = lines ? `;grid-template-rows:repeat(${run.members.length + 3}, max-content) 1fr` : "";
  return `<div class="rtable dpr" data-total-col="${whole}" style="--secs:${whole + 1}${rowsCss}">${head}${memberRows}${tuneBreakRow}${totalRow}${distRow}</div>`;
}
var driver = null;
var drivePanel = (cell, html) => driver?.show(cell, html);
var dropPanel = () => driver?.hide();
var holdPanels = (on) => driver?.hold(on);
var panelOpenOn = (cell) => driver?.pinnedOn(cell) ?? false;
function wireSourcePanels(root) {
  const GAP = 4, EDGE2 = 6;
  let open = null;
  let openHome = null;
  let pinned = false;
  clearPops();
  const built = /* @__PURE__ */ new WeakMap();
  const close = () => {
    open?.remove();
    open = null;
    openHome = null;
    pinned = false;
  };
  const place2 = (cell, pop) => {
    if (pop.parentElement !== document.body)
      document.body.appendChild(pop);
    pop.style.visibility = "hidden";
    pop.style.display = "block";
    const c = rect(cell);
    const p = rect(pop);
    const winW = innerWidth / zoom(), winH = innerHeight / zoom();
    const onTable = !!cell.closest(".tcwrap");
    const natural = !onTable && cell.classList.contains("num") ? c.right - p.width : c.left;
    const wrap = onTable ? null : cell.closest(".gridwrap");
    const tableLeft = wrap ? rect(wrap).left : EDGE2;
    const minLeft = Math.max(EDGE2, tableLeft);
    const left = Math.max(minLeft, Math.min(natural, winW - p.width - EDGE2));
    const above = c.top - p.height - GAP;
    const below = c.bottom + GAP;
    const fitsBelow = below + p.height <= winH - EDGE2;
    const top = fitsBelow ? below : Math.max(EDGE2, above);
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
    pop.style.visibility = "";
    open = pop;
    openHome = cell;
  };
  const homeIn = (target, cell) => {
    for (let el = target; el && el !== cell; el = el.parentElement) {
      const data = el.dataset;
      if (built.has(el) || data?.pop !== void 0 || data?.popKind !== void 0)
        return el;
    }
    return cell;
  };
  const panelIn = (target) => {
    const cell = target?.closest?.(".c") ?? null;
    if (!cell)
      return { cell: null, pop: null };
    const home = homeIn(target, cell);
    if (open && openHome === home)
      return { cell: home, pop: open };
    const kept = built.get(home);
    if (kept)
      return { cell: home, pop: kept };
    const data = home.dataset;
    const markup = data?.pop ?? (data?.popKind ? buildPop(data.popKind, data.popKey ?? "") : void 0);
    if (!markup)
      return { cell: home, pop: null };
    const box = document.createElement("div");
    box.innerHTML = markup;
    home.removeAttribute("data-pop");
    const pop = box.firstElementChild;
    if (pop)
      built.set(home, pop);
    return { cell: home, pop };
  };
  let driven = false;
  let held = false;
  driver = {
    show: (cell, html) => {
      close();
      driven = true;
      const box = document.createElement("div");
      box.innerHTML = html;
      const pop = box.firstElementChild;
      if (pop)
        place2(cell, pop);
    },
    hide: () => {
      driven = false;
      close();
    },
    hold: (on) => {
      held = on;
      if (on)
        close();
    },
    pinnedOn: (cell) => pinned && !!openHome && cell.contains(openHome)
  };
  const clickOpen = (cell) => !!cell.closest(".grid") || cell.classList.contains("teamdpr");
  document.addEventListener("mouseover", (e) => {
    if (driven || held || pinned)
      return;
    if (open && open.contains(e.target))
      return;
    const hovered2 = e.target?.closest?.(".c") ?? null;
    if (hovered2 && clickOpen(hovered2)) {
      if (openHome !== hovered2)
        close();
      return;
    }
    const { cell, pop } = panelIn(e.target);
    if (pop === open)
      return;
    close();
    if (pop)
      place2(cell, pop);
  });
  document.addEventListener("mouseout", (e) => {
    if (driven || held || pinned)
      return;
    const to = e.relatedTarget;
    if (to && (root.contains(to) || open && open.contains(to)))
      return;
    close();
  });
  addEventListener("click", (e) => {
    if (held)
      return;
    if (driven) {
      driven = false;
      close();
      return;
    }
    if (pinned) {
      if (open?.contains(e.target))
        return;
      const onHome = !!openHome?.contains(e.target);
      close();
      if (onHome) {
        e.preventDefault();
        return;
      }
    }
    const { cell, pop } = panelIn(e.target);
    if (!cell)
      return;
    const onCaret = !!e.target?.closest?.(".caret");
    if (clickOpen(cell) && !onCaret && pop) {
      e.preventDefault();
      const same = openHome === cell;
      close();
      if (!same) {
        place2(cell, pop);
        pinned = true;
      }
      return;
    }
    if (cell.querySelector(":scope > .caret"))
      close();
  });
  addEventListener("scroll", () => {
    if (!driven)
      close();
  }, true);
  addEventListener("resize", () => {
    if (!driven)
      close();
  });
}
var TEAM_ROW = "Team Total";
function sliceColor(base, i, n) {
  const [h, sat, l] = toHsl(base);
  const lift = i === 0 ? 0 : i % 2 ? 8 : -8;
  return `hsl(${((h + i * 360 / n) % 360).toFixed(1)} ${sat.toFixed(1)}% ${Math.min(92, Math.max(22, l + lift)).toFixed(1)}%)`;
}
function toHsl(hex) {
  const word = parseInt(hex.slice(1), 16);
  const r = (word >> 16 & 255) / 255, g = (word >> 8 & 255) / 255, b = (word & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), spread = max - min;
  const l = (max + min) / 2;
  if (!spread)
    return [0, 0, l * 100];
  const h = max === r ? (g - b) / spread + (g < b ? 6 : 0) : max === g ? (b - r) / spread + 2 : (r - g) / spread + 4;
  return [h * 60, spread / (1 - Math.abs(2 * l - 1)) * 100, l * 100];
}
var typeLabel = (type, subtype) => [subtype, type].filter((t) => t !== null).map((t) => TAG_NAME[t]).join(" ") || "Untyped";
function distCell(lines, slot, section, hue) {
  const types = /* @__PURE__ */ new Map();
  const nodes = /* @__PURE__ */ new Map();
  let total = 0;
  let nodeless = 0;
  eachHit(lines, slot, (snap, avg) => {
    total += avg;
    const subtype = snap.action.lastDamage?.subtype ?? null;
    const type = snap.type === 32768 && subtype !== null ? null : snap.type;
    const key = (type ?? 0) | (subtype ?? 0);
    const slice = types.get(key);
    if (slice)
      slice.value += avg;
    else
      types.set(key, { label: typeLabel(type, subtype), value: avg, color: "" });
    const node = snap.action.node;
    if (node === null) {
      nodeless += avg;
      return;
    }
    const cur = nodes.get(node);
    if (cur)
      cur.value += avg;
    else
      nodes.set(node, { label: NODE_NAME[node], value: avg, color: "" });
  });
  const ranked = (by2) => {
    const out = [...by2.values()].filter((v) => v.value > 0).sort((a, b) => b.value - a.value);
    for (const [i, slice] of out.entries())
      slice.color = sliceColor(hue, i, out.length);
    return out;
  };
  const gap = nodeless > 0 ? [{ label: "None", value: nodeless, color: null }] : [];
  return { kind: "slices", slot, section, types: ranked(types), nodes: [...ranked(nodes), ...gap], total };
}
function pieSvg(slices, total) {
  const font = 20, glyph = font * 0.515, mono = font * 0.6;
  const rail = Math.ceil(Math.max(11 * glyph, 8 * mono));
  const r = 120, lead = 28, lh = Math.round(font * 1.06), pitch = lh + 4;
  const width = 2 * (rail + r + lead + 19);
  const height = Math.max(2 * r + 34, Math.round(width * 0.6));
  const cx = width / 2;
  const cy = height / 2;
  const f = (n) => n.toFixed(2);
  const pct = (s) => `(${fmt(s.value / total * 100, 1)}%)`;
  const wrapAt = 11;
  const linesOf = (label) => {
    const words = label.split(" ");
    if (label.length <= wrapAt || words.length < 2)
      return [label];
    let best = [label], widest = Infinity;
    for (let i = 1; i < words.length; i++) {
      const pair = [words.slice(0, i).join(" "), words.slice(i).join(" ")];
      const longest = Math.max(...pair.map((t) => t.length));
      if (longest < widest) {
        widest = longest;
        best = pair;
      }
    }
    return best;
  };
  const angle = (turn2) => (1 / 8 - 0.25 - turn2) * Math.PI * 2;
  let turn = 0;
  const arcs = slices.map((s) => {
    const from = turn;
    const share = s.value / total;
    turn += share;
    const a = angle(from + share / 2);
    return { s, from, share, a, ox: Math.cos(a) * 7, oy: Math.sin(a) * 7, side: Math.cos(a) >= 0 ? 1 : -1, y: 0 };
  });
  const linesFor = (s) => [...linesOf(s.label), pct(s)];
  const boxH = (l) => linesFor(l.s).length * lh;
  const point = (a, rad) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
  for (const side of [1, -1]) {
    const column = arcs.filter((l) => l.side === side).sort((a, b) => Math.sin(a.a) - Math.sin(b.a));
    let ceiling = 10;
    for (const l of column) {
      const half = boxH(l) / 2;
      l.y = Math.max(cy + (r + lead - 10) * Math.sin(l.a), ceiling + half);
      ceiling = l.y + half + (pitch - lh);
    }
    let floor = height - 10;
    for (const l of [...column].reverse()) {
      const half = boxH(l) / 2;
      l.y = Math.min(l.y, floor - half);
      floor = l.y - half - (pitch - lh);
    }
  }
  const wedge = ({ s, from, share }) => {
    if (s.color === null)
      return "";
    const paint = ` fill="${s.color}" stroke="${s.color}"`;
    if (share > 0.999)
      return `<circle class="wedge" cx="${cx}" cy="${f(cy)}" r="${r}"${paint}/>`;
    const [x0, y0] = point(angle(from), r);
    const [x1, y1] = point(angle(from + share), r);
    return `<path class="wedge" d="M${cx},${f(cy)} L${f(x0)},${f(y0)} A${r},${r} 0 ${share > 0.5 ? 1 : 0},0 ${f(x1)},${f(y1)} Z"${paint}/>`;
  };
  const leader = ({ s, a, side, y, ox, oy }) => {
    const [px, py] = point(a, r);
    const [bx2, by2] = point(a, r + lead - 14);
    const out = cx + side * (r + lead);
    const tail = `${f(out - side * 30)},${f(y)} ${f(out)},${f(y)}`;
    const curve = (dx, dy) => `M${f(px + dx)},${f(py + dy)} C${f(bx2 + dx)},${f(by2 + dy)} ${tail}`;
    return `<path class="leader" d="${curve(0, 0)}" style="--d-out:path('${curve(ox, oy)}')" fill="none" stroke="${s.color ?? "var(--faint)"}" stroke-width="2" stroke-linecap="round"/>`;
  };
  const groups = arcs.map((arc) => `<g class="slice" style="--ox:${f(arc.ox)}px;--oy:${f(arc.oy)}px">${wedge(arc)}${leader(arc)}</g>`).join("");
  const labels = arcs.map(({ s, side, y }) => {
    const at = cx + side * (r + lead);
    const x = f(at + side * 7);
    const lines = linesFor(s);
    const last = lines.length - 1;
    const top = y - last * lh / 2;
    return `<text text-anchor="${side > 0 ? "start" : "end"}" dominant-baseline="middle">` + lines.map((t, i) => `<tspan class="${i === last ? "pc" : "nm"}" x="${x}" y="${f(top + i * lh)}">${esc(t)}</tspan>`).join("") + `</text>`;
  }).join("");
  return `<svg class="pie" viewBox="0 0 ${width} ${f(height)}" font-size="${font}" role="img">${groups}${labels}</svg>`;
}
var pieFigure = (heading, slices, total) => `<figure class="piefig"><figcaption>${esc(heading)}</figcaption><div class="chartwrap">${pieSvg(slices, total)}</div></figure>`;
function teamCell(sections, section, slotHue) {
  const bars = [];
  const acts = [];
  const by2 = /* @__PURE__ */ new Map();
  let total = 0;
  sections.forEach((lines) => {
    let own = 0;
    const field = /* @__PURE__ */ new Map();
    eachHit(lines, null, (snap, avg) => {
      own += avg;
      if (snap.action.tag !== ActionTag.OffField && snap.action.cast !== 6)
        return;
      const key = `${snap.slot} ${snap.action.name}`;
      field.set(key, (field.get(key) ?? 0) + avg);
    });
    const actOf = (snap, dmg) => {
      let act = snap.action;
      while (act.cancelOf ?? act.formOf)
        act = act.cancelOf ?? act.formOf;
      const key = `${snap.slot} ${act.name}`;
      let at = by2.get(key);
      if (at === void 0) {
        at = acts.push({ name: act.name, color: slotHue.get(snap.slot) ?? TUNE_BREAK_ENEMY.color, dmg: 0, casts: 0 }) - 1;
        by2.set(key, at);
      }
      acts[at].dmg += dmg;
      acts[at].casts++;
      return at;
    };
    for (const line of lines) {
      if (line.aggregate) {
        if (line.avg <= 0)
          continue;
        const at = actOf(line.snap, line.avg);
        bars.push({ dmg: line.avg, frames: 0, color: acts[at].color, act: at });
        continue;
      }
      eachHit([line], null, (snap, avg) => {
        if (avg <= 0)
          return;
        total += avg;
        if (line.fieldKey !== void 0)
          return;
        if ((field.get(`${snap.slot} ${snap.action.name}`) ?? Infinity) < own * 0.02)
          return;
        const at = actOf(snap, avg);
        const off = !snap.active || snap.tag === ActionTag.OffField;
        const cost = atDelays(snap.delays, () => snap.action.cost(snap.tag));
        let root = snap.action;
        while (root.cancelOf ?? root.formOf)
          root = root.cancelOf ?? root.formOf;
        const frames = off ? root.animFrames : snap.holdCut >= 0 ? snap.holdCut : cost.action + cost.global;
        bars.push({ dmg: avg, frames, color: acts[at].color, act: at });
      });
    }
  });
  return { kind: "team", section, total, bars, acts };
}
function barChart(bars) {
  const width = 480, height = 210, left = 2, right = 2, top = 10, foot = 12;
  const plotW = width - left - right, plotH = height - top - foot;
  const f = (n) => n.toFixed(2);
  const peak = Math.max(...bars.map((b) => b.dmg));
  const weights = bars.map((b) => Math.max(b.frames, 60));
  const unit2 = plotW / weights.reduce((a, w) => a + w, 0);
  const lit = (hex) => `#${[1, 3, 5].map((k) => Math.min(255, Math.round(parseInt(hex.slice(k, k + 2), 16) * 1.35)).toString(16).padStart(2, "0")).join("")}`;
  let x = left;
  const rects = bars.map((b, i) => {
    const h = b.dmg / peak * plotH, slot = weights[i] * unit2;
    const rect2 = `<rect data-act="${b.act}" x="${f(x)}" y="${f(top + plotH - h)}" width="${f(Math.max(slot * 0.9, 0.6))}" height="${f(h)}" fill="${b.color}" style="--lit:${lit(b.color)}"/>`;
    x += slot;
    return rect2;
  }).join("");
  return `<svg class="bars" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img"><line class="axis" vector-effect="non-scaling-stroke" x1="${left}" y1="${top + plotH}" x2="${width - right}" y2="${top + plotH}"/>` + rects + `</svg>`;
}
function distBody(cell) {
  if (!cell || cell.total <= 0)
    return `<div class="pies"><p class="nodist">No damage in this section.</p></div>`;
  const section = cell.section ? ` (${cell.section})` : "";
  if (cell.kind === "team") {
    shownChart = cell;
    return `<div class="teampanes"><figure class="piefig"><figcaption>Damage Over Time${section}</figcaption><div class="chartwrap">${barChart(cell.bars)}</div></figure></div>`;
  }
  return `<div class="pies">${pieFigure(`${cell.slot} Damage Distribution${section}`, cell.types, cell.total)}${pieFigure(`${cell.slot} Node Priority${section}`, cell.nodes, cell.total)}</div>`;
}
var shownChart = null;
var distCells = /* @__PURE__ */ new Map();
var distRows = [];
var distributionRow = (selected) => `<div class="rtrow dist"><div class="c distbody">${distBody(distCells.get(selected))}</div></div>`;
var barPop = null;
var barPopAct = null;
var barPopSize = { width: 0, height: 0 };
function showBarPop(act, total, x, y) {
  if (!barPop) {
    barPop = document.createElement("div");
    barPop.className = "barpop";
    document.body.append(barPop);
  }
  barPop.hidden = false;
  if (act !== barPopAct) {
    barPopAct = act;
    barPop.style.setProperty("--own", act.color);
    barPop.innerHTML = `<span class="nm">${esc(act.name)}${act.casts > 1 ? ` x${act.casts}` : ""}</span><span class="v">${fmt(act.dmg)}</span><span class="pct">${fmt(act.dmg / total * 100, 1)}%</span>`;
    barPopSize = barPop.getBoundingClientRect();
  }
  const { width, height } = barPopSize;
  barPop.style.left = `${x - width < 0 ? x : x - width}px`;
  barPop.style.top = `${y - height}px`;
}
var hideBarPop = () => {
  if (!barPop)
    return;
  barPop.hidden = true;
  barPopAct = null;
};
var BAR_GEOMETRY = /* @__PURE__ */ new WeakMap();
function barGeometry(svg) {
  let g = BAR_GEOMETRY.get(svg);
  if (g)
    return g;
  g = { lefts: [], acts: [], byAct: /* @__PURE__ */ new Map() };
  for (const r of svg.querySelectorAll("rect[data-act]")) {
    const act = Number(r.dataset.act);
    g.lefts.push(r.x.baseVal.value);
    g.acts.push(act);
    const own = g.byAct.get(act);
    if (own)
      own.push(r);
    else
      g.byAct.set(act, [r]);
  }
  BAR_GEOMETRY.set(svg, g);
  return g;
}
function wireBarHover(body) {
  let lit = [];
  const light = (rects) => {
    if (rects === lit)
      return;
    for (const r of lit)
      r.classList.remove("lit");
    for (const r of rects)
      r.classList.add("lit");
    lit = rects;
  };
  const NONE = [];
  let last = null, queued2 = false;
  const update = () => {
    queued2 = false;
    const e = last;
    if (!e)
      return;
    const svg = e.target.closest("svg.bars");
    const g = svg ? barGeometry(svg) : null;
    if (!svg || !g || !shownChart || !g.lefts.length) {
      light(NONE);
      hideBarPop();
      return;
    }
    const box = svg.getBoundingClientRect(), view = svg.viewBox.baseVal;
    const at = (e.clientX - box.left) / box.width * view.width;
    let lo = 0, hi = g.lefts.length - 1;
    while (lo < hi) {
      const mid = lo + hi + 1 >> 1;
      if (g.lefts[mid] <= at)
        lo = mid;
      else
        hi = mid - 1;
    }
    const act = g.acts[lo];
    light(g.byAct.get(act) ?? NONE);
    showBarPop(shownChart.acts[act], shownChart.total, e.clientX, e.clientY);
  };
  body.addEventListener("mousemove", (e) => {
    last = e;
    if (queued2)
      return;
    queued2 = true;
    requestAnimationFrame(update);
  });
  body.addEventListener("mouseleave", () => {
    last = null;
    light(NONE);
    hideBarPop();
  });
}
function wireDistribution(root) {
  const table = root.querySelector(".rtable.dpr");
  const body = root.querySelector(".c.distbody");
  if (!table || !body)
    return;
  table.addEventListener("click", (e) => {
    const hit = e.target?.closest(".c[data-dist], .c[data-dist-row]");
    if (!hit)
      return;
    const key = hit.dataset.dist ?? `${hit.dataset.distRow}|${table.dataset.totalCol}`;
    const cell = table.querySelector(`.c[data-dist="${key}"]`);
    for (const c of table.querySelectorAll(".c[data-dist]"))
      c.classList.toggle("sel", c === cell);
    body.innerHTML = distBody(distCells.get(key));
    const [slot, col] = key.split("|");
    syncCell(slot === TEAM_ROW && col === table.dataset.totalCol ? null : `${distRows.indexOf(slot)}${col}`);
  });
  wireBarHover(body);
}

// dist/src/page/cellpick.js
var HOLD = 500;
var touching = false;
var shutting = null;
addEventListener("pointerdown", (e) => {
  touching = e.pointerType === "touch";
  const open = document.querySelector(".ctxmenu, body > .pop");
  shutting = touching && open && !open.contains(e.target) ? e : null;
}, true);
addEventListener("contextmenu", (e) => {
  if (!touching)
    return;
  e.preventDefault();
  e.stopImmediatePropagation();
}, true);
function swallowClick(wait = 0) {
  const swallow = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };
  addEventListener("click", swallow, { capture: true, once: true });
  setTimeout(() => removeEventListener("click", swallow, true), wait);
}
var watch = null;
function watchTouch(e, cell, tap, long = () => {
}) {
  if (watch?.event === e || shutting === e)
    return;
  if (watch)
    clearTimeout(watch.timer);
  const r = cell?.getBoundingClientRect();
  const w = {
    event: e,
    x: e.clientX,
    y: e.clientY,
    w: r?.width ?? 0,
    h: r?.height ?? 0,
    tap,
    long,
    fired: false,
    scrolled: false,
    timer: setTimeout(() => {
      if (watch !== w)
        return;
      w.fired = true;
      if (cell)
        w.long();
    }, HOLD)
  };
  watch = w;
}
addEventListener("pointercancel", (e) => {
  if (watch && e.pointerType === "touch")
    watch.scrolled = true;
}, true);
addEventListener("touchmove", (e) => {
  const t = e.touches[0];
  if (!watch || watch.fired || !t)
    return;
  if (Math.abs(t.clientX - watch.x) <= watch.w && Math.abs(t.clientY - watch.y) <= watch.h)
    return;
  clearTimeout(watch.timer);
  watch = null;
}, { passive: true, capture: true });
addEventListener("touchend", () => {
  if (shutting) {
    shutting = null;
    dropPanel();
    swallowClick(600);
    return;
  }
  const w = watch;
  if (!w)
    return;
  watch = null;
  clearTimeout(w.timer);
  if (w.fired)
    swallowClick(600);
  else if (!w.scrolled)
    w.tap();
}, true);
function scrollerOf(el, axis) {
  for (let at = el.parentElement; at; at = at.parentElement) {
    const s = getComputedStyle(at);
    const flow = axis === "x" ? s.overflowX : s.overflowY;
    const room = axis === "x" ? at.scrollWidth > at.clientWidth : at.scrollHeight > at.clientHeight;
    if (room && (flow === "auto" || flow === "scroll"))
      return at;
  }
  return document.scrollingElement ?? document.documentElement;
}
var EDGE = 48;
var STEP = 18;
function grabDot(e, host) {
  e.preventDefault();
  e.stopPropagation();
  e.target.setPointerCapture?.(e.pointerId);
  const [from] = host.corners();
  let cx = e.clientX, cy = e.clientY;
  let to = host.corners()[1];
  const sx = scrollerOf(host.grid, "x"), sy = scrollerOf(host.grid, "y");
  const [[rFirst, cFirst], [rLast, cLast]] = host.limits();
  const [ax, ay] = host.edgePoint(from[0], from[1]);
  const past = (edge, after, first, last) => after ? edge < last ? edge + 1 : edge - 1 : edge > first ? edge - 1 : edge + 1;
  const aim = () => {
    const z = zoom(), x = cx / z, y = cy / z;
    const at = host.edgeAt(x, y);
    if (at[0] === from[0])
      at[0] = past(from[0], y >= ay, rFirst, rLast);
    if (at[1] === from[1])
      at[1] = past(from[1], x >= ax, cFirst, cLast);
    if (at[0] === to[0] && at[1] === to[1])
      return;
    to = at;
    host.aim(from, to);
  };
  let raf = 0;
  const roll = () => {
    raf = 0;
    const speed = (near) => near < EDGE ? Math.ceil(STEP * (1 - Math.max(0, near) / EDGE)) : 0;
    const dx = speed(innerWidth - cx) - speed(cx), dy = speed(innerHeight - cy) - speed(cy);
    if (!dx && !dy)
      return;
    sx.scrollLeft += dx;
    sy.scrollTop += dy;
    aim();
    raf = requestAnimationFrame(roll);
  };
  const move = (m) => {
    if (m.pointerId !== e.pointerId)
      return;
    [cx, cy] = [m.clientX, m.clientY];
    aim();
    if (!raf)
      raf = requestAnimationFrame(roll);
  };
  const up = (u) => {
    if (u.pointerId !== e.pointerId)
      return;
    removeEventListener("pointermove", move);
    removeEventListener("pointerup", up);
    removeEventListener("pointercancel", up);
    if (raf)
      cancelAnimationFrame(raf);
    swallowClick(600);
    host.done();
  };
  addEventListener("pointermove", move);
  addEventListener("pointerup", up);
  addEventListener("pointercancel", up);
}
function makeDot(parent, grab) {
  const dot = parent.appendChild(document.createElement("div"));
  dot.className = "celldot";
  dot.addEventListener("pointerdown", grab);
  return dot;
}

// dist/src/page/filterbar.js
var app = document.getElementById("app");
var searchText = "";
var searchAt = -1;
function focusSearch() {
  const search = document.querySelector("#optionSearch");
  if (!search)
    return;
  search.focus({ preventScroll: true });
  search.setSelectionRange(search.value.length, search.value.length);
}
function clearSearch() {
  searchText = "";
  searchAt = -1;
  const input = document.querySelector("#optionSearch");
  if (input)
    input.value = "";
  const box = document.getElementById("searchResults");
  if (box)
    box.innerHTML = "";
}
function searchCandidates() {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  const add = (kind, value, rest = {}) => {
    if (value && !seen.has(`${kind}|${value}`)) {
      seen.add(`${kind}|${value}`);
      out.push({ kind, value, ...rest });
    }
  };
  for (const members of Object.values(TEAMS)) {
    for (const m of members) {
      add("resonator", m.name);
      if (axisOpen(m, filters, "weapons")) {
        const levels = /* @__PURE__ */ new Set([...sequenceLevels(m, filters, true), ...sequenceLevels(m, filters, false)]);
        for (const level of levels)
          for (const i of eligibleWeapons(m, filters)) {
            add("weapon", weaponTag(m, level, weaponBase(m.loadout.weapons[i])));
            if (axisUsed(m, filters, "refines"))
              for (const w of m.loadout.refinements[i])
                add("weapon", weaponTag(m, level, w.name));
          }
      }
      if (axisUsed(m, filters, "refines"))
        for (const i of eligibleWeapons(m, filters))
          for (const w of m.loadout.refinements[i])
            add("refine", `${m.name} R${w.refinement}`);
      if (axisOpen(m, filters, "echoes"))
        for (const e of echoPicks(m, members))
          add("echo", echoLabel(m.loadout, m.loadout.echoLoadouts[e]));
      for (const tag of sequenceTagsOf(m, filters))
        if (tag)
          add("sequence", tag);
    }
  }
  for (const [name, mode] of resonatorFilters) {
    if (mode !== "include")
      continue;
    for (const axis of AXES) {
      if (axis === "refines" || filters[axis].includes(name) || !comparable(name, axis))
        continue;
      add("compare", `${name} ${AXIS_LABEL[axis]}`, { axis, resonator: name });
    }
  }
  return out;
}
function searchRank(value, text) {
  const name = value.toLowerCase();
  const at = name.indexOf(text);
  if (at !== -1)
    return [0, 0, at];
  let hit = 0, i = -1, from = -1, to = -1;
  for (const ch of text) {
    const found = name.indexOf(ch, i + 1);
    if (found < 0)
      continue;
    [i, to, hit] = [found, found, hit + 1];
    if (from < 0)
      from = found;
  }
  return hit < 2 ? null : [1, text.length - hit, to - from];
}
function searchHits() {
  const text = searchText.trim().toLowerCase();
  if (!text)
    return [];
  return searchCandidates().map((c) => ({ ...c, rank: searchRank(c.value, text) })).filter((c) => c.rank !== null).sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || a.rank[2] - b.rank[2] || a.value.localeCompare(b.value)).slice(0, 10);
}
function cycleSearch(step) {
  const n = searchHits().length;
  if (!n)
    return;
  searchAt = (searchAt + 1 + step + n + 1) % (n + 1) - 1;
  drawSearch();
  document.querySelector(".sresult.sel")?.scrollIntoView({ block: "nearest" });
}
var searchChoice = () => searchHits()[searchAt < 0 ? 0 : searchAt];
function drawSearch() {
  const box = document.getElementById("searchResults");
  if (box)
    box.innerHTML = searchResults();
}
function searchResults() {
  if (!searchText.trim())
    return "";
  const KIND_LABEL = {
    resonator: "Resonator",
    weapon: "Weapon",
    echo: "Echo",
    sequence: "Sequence",
    refine: "Refine",
    compare: "Compare"
  };
  const hits = searchHits();
  if (!hits.length)
    return `<div class="sresult none">no matches</div>`;
  return hits.map(({ kind, value, axis, resonator }, i) => {
    const hue = (kind === "resonator" ? RESONATOR_HUE.get(value) : kind === "compare" ? RESONATOR_HUE.get(resonator ?? "") : kind === "sequence" ? RESONATOR_HUE.get(tagOwner(value)) : void 0) ?? TUNE_BREAK_ENEMY.color;
    return `<button type="button" class="sresult${i === searchAt ? " sel" : ""}" data-kind="${kind}" data-value="${esc(value)}"` + (axis ? ` data-axis="${axis}"` : "") + (resonator ? ` data-resonator="${esc(resonator)}"` : "") + ` style="--mem:${hue}" title="${kind === "compare" ? `Compare ${esc(resonator ?? "")}'s ${esc(AXIS_LABEL[axis].toLowerCase())}` : `Add ${esc(value)} to the filters`}. The chip it makes is where it comes back off."><span class="sact inc"><span class="sname">${esc(value)}<span class="skind">${KIND_LABEL[kind]}</span></span></span></button>`;
  }).join("");
}
var openHelp = /* @__PURE__ */ new Set(["readme"]);
function comparisonFilters() {
  const note = (id, label, lines, extra = "") => {
    const open = openHelp.has(id);
    return `<div class="tcopt note${open ? " open" : ""}" data-note="${id}"><div class="tcopt-head"><button type="button" class="tcopt-name" data-help="${id}" aria-expanded="${open}">${esc(label)}<span class="arrow">\u203A</span></button></div><div class="tcopt-desc"${open ? "" : " hidden"}><ul>${lines.map((l) => `<li>${l}</li>`).join("")}${extra}</ul></div></div>`;
  };
  return `<div class="tcfilters">
    <div class="tcfilter-row note">
      ${note("readme", "README", README, `<li><button type="button" class="tutstart">How do I use this website? ${CLICK} here.</button></li>`)}
      ${matrixBox(filters.matrix.length > 0, openHelp.has("matrix"))}
      ${costBox(filters.cost, openHelp.has("cost"))}
      <div class="tcsearchrow">
        <div class="tcsearch">
          <input id="optionSearch" type="search" placeholder="Add resonator or comparison..."
            autocomplete="off" spellcheck="false" value="${esc(searchText)}">
          <div class="tcsearch-results" id="searchResults">${searchResults()}</div>
        </div>
        ${resonatorChips()}
      </div>
    </div>
  </div>`;
}
var AXIS_LABEL = {
  weapons: "Weapons",
  echoes: "Sonatas",
  mainstats: "Mainstats",
  substats: "Substat Investment",
  sequences: "Sequences",
  refines: "Weapon Refines"
};
var scopedLabel = (s) => s.on === "sequence" ? `${s.resonator} S${s.value}` : s.on === "refine" ? `${s.resonator} R${s.value}` : s.value;
function resonatorChips() {
  const inc = [], exc = [];
  const bucket = (mode) => mode === "include" ? inc : exc;
  const MODE_TITLE = { include: "these", exclude: "none of these" };
  for (const [name, mode] of resonatorFilters) {
    bucket(mode).push(`<button type="button" class="rchip" data-resonator="${esc(name)}" style="--mem:${RESONATOR_HUE.get(name) ?? TUNE_BREAK_ENEMY.color}" title="${esc(name)} \u2014 teams fielding ${MODE_TITLE[mode]}. ${CLICK} to remove.">${esc(name)}</button>`);
  }
  for (const [kind, map] of Object.entries(OPTION_FILTER_MAPS)) {
    for (const [name, mode] of map) {
      const hue = kind === "sequence" || kind === "refine" ? RESONATOR_HUE.get(tagOwner(name)) : kind === "weapon" ? RESONATOR_HUE.get(weaponOwner(name)) : void 0;
      bucket(mode).push(`<button type="button" class="rchip" data-kind="${kind}" data-value="${esc(name)}"` + (hue ? ` style="--mem:${hue}"` : "") + ` title="${esc(name)} \u2014 rows using ${MODE_TITLE[mode]}. ${CLICK} to remove.">${esc(name)}</button>`);
    }
  }
  for (const s of filters.scoped) {
    if (s.on === "rank") {
      inc.push(`<button type="button" class="rchip" data-scoped="${esc(scopedKey(s))}" style="--mem:${RESONATOR_HUE.get(s.resonator) ?? TUNE_BREAK_ENEMY.color}" title="Showing ${esc(s.resonator)} ${esc(s.value)} beside their own rank. ${CLICK} to remove.">${esc(s.resonator)} ${esc(s.value)}</button>`);
      continue;
    }
    inc.push(`<button type="button" class="rchip" data-scoped="${esc(scopedKey(s))}" style="--mem:${RESONATOR_HUE.get(s.resonator) ?? TUNE_BREAK_ENEMY.color}" title="Comparing ${esc(scopedLabel(s))}'s ${AXIS_LABEL[s.axis].toLowerCase()}. ${CLICK} to remove.">${esc(scopedLabel(s))} ${AXIS_LABEL[s.axis]}</button>`);
  }
  for (const axis of AXES) {
    for (const name of filters[axis]) {
      inc.push(`<button type="button" class="rchip" data-axis="${axis}" data-resonator="${esc(name)}" style="--mem:${RESONATOR_HUE.get(name) ?? TUNE_BREAK_ENEMY.color}" title="Comparing ${esc(name)}'s ${AXIS_LABEL[axis].toLowerCase()}. ${CLICK} to remove.">${esc(name)} ${AXIS_LABEL[axis]}</button>`);
    }
  }
  const pins = [];
  for (const key of pinnedRows) {
    const row = rowFromKey(key);
    if (!row)
      continue;
    const lead = row.members.find((m) => m.mainDps) ?? row.members[0];
    const builds = row.members.map((m, i) => {
      const c = row.combo[i];
      return `${m.name} S${c.sequence}: ${weaponBase(c.weapon)} R${c.weapon.refinement}, ${echoLabel(m.loadout, c.echo)}`;
    });
    pins.push(`<button type="button" class="rchip" data-pin="${esc(key)}" style="--mem:${lead.color}" title="${esc(builds.join("\n"))}
Shown whatever the other filters say. ${CLICK} to unpin.">${esc(row.members.map((m) => m.name).join(" / "))}</button>`);
  }
  const section = (label, chips2) => chips2.length ? `<div class="chipsec"><span class="chiplabel">${label}</span><div class="chiprow">${chips2.join("")}</div></div>` : "";
  const chips = section("Shown", inc) + section("Hidden", exc);
  return (chips ? `<div class="tcchips">${chips}<button type="button" class="clearall"><span>Clear Filters</span></button></div>` : "") + (pins.length ? `<div class="tcpins">${section("Pinned", pins)}<button type="button" class="clearpins"><span>Clear Pins</span></button></div>` : "");
}
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".tcopt-name");
  const id = btn?.dataset.help;
  if (!btn || !id)
    return;
  const box = btn.closest(".tcopt");
  const open = !openHelp.has(id);
  if (open)
    openHelp.add(id);
  else
    openHelp.delete(id);
  box.classList.toggle("open", open);
  btn.setAttribute("aria-expanded", String(open));
  box.querySelector(".tcopt-desc").hidden = !open;
});
document.addEventListener("input", (e) => {
  const input = e.target;
  if (input.id !== "optionSearch")
    return;
  searchText = input.value;
  searchAt = -1;
  drawSearch();
});
document.addEventListener("focusin", (e) => {
  if (!e.target.closest?.(".tcsearch"))
    return;
  const box = document.getElementById("searchResults");
  if (box)
    box.hidden = false;
});
var pressing = false;
document.addEventListener("pointerdown", () => {
  pressing = true;
}, true);
document.addEventListener("pointerup", () => {
  pressing = false;
}, true);
document.addEventListener("click", (e) => {
  if (e.target.closest?.(".tcsearch"))
    return;
  const box = document.getElementById("searchResults");
  if (box)
    box.hidden = true;
}, true);
app.addEventListener("scroll", (e) => {
  if (!e.target.classList?.contains("tcside"))
    return;
  const box = document.getElementById("searchResults");
  if (box)
    box.hidden = true;
}, true);
document.addEventListener("focusout", (e) => {
  if (!e.target.closest?.(".tcsearch"))
    return;
  if (e.relatedTarget?.closest?.(".tcsearch"))
    return;
  if (pressing)
    return;
  const box = document.getElementById("searchResults");
  if (box)
    box.hidden = true;
});

// dist/src/page/table.js
var app2 = document.getElementById("app");
var topbar = document.getElementById("topbar");
var refresh = async () => {
};
var onRefresh = (fn) => {
  refresh = fn;
};
var lastPoint = [0, 0];
addEventListener("pointerdown", (e) => {
  lastPoint = [e.clientX, e.clientY];
}, true);
addEventListener("keydown", () => {
  const r = document.activeElement?.getBoundingClientRect();
  if (r && (r.width || r.height))
    lastPoint = [r.left, r.bottom];
}, true);
function rowCapWarning(total) {
  document.querySelector(".rowcap")?.remove();
  if (total === null)
    return;
  const pop = document.createElement("div");
  pop.className = "ctxmenu rowcap";
  pop.textContent = `That would open ${fmt(total)} rows, which is over the ${fmt(ROW_CAP)} cap. Try using less comparisons, removing a resonator, or hiding resonators.`;
  document.body.appendChild(pop);
  const [x, y] = lastPoint;
  const r = pop.getBoundingClientRect();
  pop.style.left = `${Math.max(6, Math.min(x, innerWidth - r.width - 6))}px`;
  pop.style.top = `${Math.max(6, Math.min(y, innerHeight - r.height - 6))}px`;
  const close = () => {
    pop.remove();
    removeEventListener("click", close, true);
    removeEventListener("keydown", close, true);
    removeEventListener("scroll", close, true);
  };
  setTimeout(() => {
    addEventListener("click", close, true);
    addEventListener("keydown", close, true);
    addEventListener("scroll", close, true);
  });
}
function withRowCap(change, apply = () => void refresh()) {
  const undo = change();
  const total = prospectiveRows();
  if (total > ROW_CAP) {
    undo();
    rowCapWarning(total);
    focusAfterDraw = void 0;
    return;
  }
  rowCapWarning(null);
  syncHash();
  apply();
}
function redrawPins() {
  const rows = teamRows();
  if (!rows.every((row) => results.has(row.key))) {
    void refresh();
    return;
  }
  setVisibleRows(rows);
  renderComparison();
}
function setFilter(map, name, mode) {
  withRowCap(() => {
    const was = map.get(name);
    if (was === mode)
      map.delete(name);
    else
      map.set(name, mode);
    return () => {
      if (was === void 0)
        map.delete(name);
      else
        map.set(name, was);
    };
  });
}
function setCompare(name, axis) {
  withRowCap(() => {
    const on = !filters[axis].includes(name);
    const paired = axis === "refines" && on ? ["weapons"] : axis === "weapons" && !on ? ["refines"] : [];
    const before = /* @__PURE__ */ new Map();
    for (const a of [axis, ...paired]) {
      before.set(a, [...filters[a]]);
      const at = filters[a].indexOf(name);
      if (on && at < 0)
        filters[a].push(name);
      if (!on && at >= 0)
        filters[a].splice(at, 1);
    }
    const kept = Object.values(OPTION_FILTER_MAPS).map((map) => [...map]);
    pruneGearFilters();
    return () => {
      for (const [a, list] of before)
        filters[a] = list;
      Object.values(OPTION_FILTER_MAPS).forEach((map, i) => {
        map.clear();
        for (const [n, mode] of kept[i])
          map.set(n, mode);
      });
    };
  });
}
function togglePin(key) {
  withRowCap(() => {
    const was = pinnedRows.has(key);
    if (was)
      pinnedRows.delete(key);
    else
      pinnedRows.add(key);
    return () => {
      if (was)
        pinnedRows.add(key);
      else
        pinnedRows.delete(key);
    };
  }, redrawPins);
}
function setScoped(s) {
  withRowCap(() => {
    const key = scopedKey(s);
    const at = filters.scoped.findIndex((x) => scopedKey(x) === key);
    if (at >= 0)
      filters.scoped.splice(at, 1);
    else
      filters.scoped.push(s);
    return () => {
      if (at >= 0)
        filters.scoped.splice(at, 0, s);
      else
        filters.scoped.pop();
    };
  });
}
var MENU_AXES = ["weapons", "sequences", "echoes", "mainstats"];
function scopedItems(resonator, on, value) {
  const ranks = () => Object.values(TEAMS).some((members) => members.some((m) => m.name === resonator && m.loadout.refinements.some((r) => r.length > 1 && weaponBase(r[0]) === value)));
  const axes = on === "echo" ? ["mainstats"] : on === "weapon" ? ["refines", "echoes", "mainstats"] : ["echoes", "mainstats"];
  const s = (axis) => ({ resonator, on, value, axis });
  const set = (axis) => filters.scoped.some((x) => scopedKey(x) === scopedKey(s(axis)));
  return axes.filter((axis) => axis === "refines" ? ranks() && (set(axis) || !filters.refines.includes(resonator)) : comparable(resonator, axis)).map((axis) => ({
    axis,
    label: `${set(axis) ? "Stop comparing" : "Compare"} ${scopedLabel(s(axis))} ${AXIS_LABEL[axis].toLowerCase()}`,
    run: () => setScoped(s(axis))
  }));
}
function rankItems(run, pos) {
  const [m, combo] = [run.members[pos], run.combo[pos]];
  const here = filters.scoped.filter((s) => s.resonator === m.name && s.on === "rank" && rankShown(s.value).sequence === combo.sequence);
  const own = here.find((s) => rankShown(s.value).weapon === combo.weapon.name);
  const stop = own ? [{ label: `Stop showing ${combo.weapon.name}`, run: () => setScoped(own) }] : [];
  if (compares(m, filters, "refines", combo))
    return stop;
  const ranks = m.loadout.refinements.find((r) => r.some((w) => w.name === combo.weapon.name)) ?? [];
  const unranked = (c) => c.key.split(".").filter((_, k) => k !== 4).join(".");
  const twin = (other) => other.teamKey === run.teamKey && other.combo.every((c, k) => k === pos ? unranked(c) === unranked(combo) : c.key === run.combo[k].key);
  const shown = /* @__PURE__ */ new Set([
    ...(tableView?.sorted ?? []).filter(([, other]) => twin(other)).map(([, other]) => other.combo[pos].weapon.name),
    ...here.map((s) => rankShown(s.value).weapon),
    combo.weapon.name
  ]);
  return [...ranks.filter((w) => !shown.has(w.name)).map((w) => ({
    label: `Show ${w.name}`,
    run: () => setScoped({ resonator: m.name, on: "rank", value: rankValue(w.name, combo.sequence), axis: "refines" })
  })), ...stop];
}
function cellRun(el, resonator) {
  const run = results.get(el.closest(".trow")?.dataset.team ?? "");
  const pos = run?.members.findIndex((m) => m.name === resonator) ?? -1;
  return run && pos >= 0 ? { run, pos } : void 0;
}
function showMenu(x, y, items, onClose) {
  document.querySelector(".ctxmenu")?.dispatchEvent(new Event("closemenu"));
  document.querySelector(".ctxmenu")?.remove();
  const menu = document.createElement("div");
  menu.className = "ctxmenu";
  menu.innerHTML = items.map((it, i) => `<button type="button" class="ctxitem" data-i="${i}">${esc(it.label)}</button>`).join("");
  document.body.appendChild(menu);
  menu.style.left = `${Math.max(6, Math.min(x, innerWidth - menu.getBoundingClientRect().width - 6))}px`;
  menu.style.top = `${y}px`;
  const close = () => {
    menu.remove();
    removeEventListener("click", onOutside, true);
    removeEventListener("contextmenu", onOutside, true);
    removeEventListener("keydown", onKey, true);
    removeEventListener("scroll", close, true);
    onClose?.();
  };
  const onItem = (e) => {
    const item = e.target.closest(".ctxitem");
    if (!item || !menu.contains(item))
      return;
    e.stopPropagation();
    e.preventDefault();
    const it = items[Number(item.dataset.i)];
    const run = e.type === "contextmenu" ? it.alt : it.run;
    if (!run)
      return;
    close();
    run();
  };
  menu.addEventListener("click", onItem);
  menu.addEventListener("contextmenu", onItem);
  const onOutside = (e) => {
    if (!e.target.closest(".ctxmenu"))
      close();
  };
  const onKey = (e) => {
    if (e.key === "Escape")
      close();
  };
  menu.addEventListener("closemenu", close);
  setTimeout(() => {
    addEventListener("click", onOutside, true);
    addEventListener("contextmenu", onOutside, true);
    addEventListener("keydown", onKey, true);
    addEventListener("scroll", close, true);
  });
  return menu;
}
var PIN_MARK = `<svg class="pinmark" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 9V4h1a1 1 0 0 0 0-2H7a1 1 0 0 0 0 2h1v5a3 3 0 0 1-3 3v2h5.97v7l1 1 1-1v-7H19v-2a3 3 0 0 1-3-3z"/></svg>`;
var pinCell = (key) => {
  const on = pinnedRows.has(key);
  return `<div class="c pin${on ? " on" : ""}" data-pin="${esc(key)}" title="${CLICK} to ${on ? "unpin this row" : "pin this row, shown whatever the other filters say"}">${PIN_MARK}</div>`;
};
function optionCell(kind, value, color, lines = [value], resonator = "") {
  const style = kind === "weapon" && value ? `--mem:${color};color:${color}` : `--mem:${color}`;
  if (!value)
    return `<div class="c option" style="${style}"></div>`;
  return `<div class="c option" data-kind="${kind}" data-value="${esc(value)}"${resonator ? ` data-resonator="${esc(resonator)}"` : ""} style="${style}">${lines.map(esc).join("<br>")}</div>`;
}
var hueShown = true;
var personalOpen = [false, false, false];
var cmpDrawn = /* @__PURE__ */ new Set();
var teamMode = "dpr";
var TEAM_HEAD = { dpr: "Team Avg DPR", dps: "Team DPS" };
var wholeDamage = (run) => run.sectionTotals.reduce((a, b) => a + b, 0);
var teamFigure = (run) => Math.floor(wholeDamage(run) / (teamMode === "dpr" ? Math.max(1, run.sectionTotals.length) : run.seconds));
var personalFigure = (run, name) => Math.floor(run.sectionBySlot.reduce((a, by2) => a + (by2.get(name) ?? 0), 0) / Math.max(1, run.sectionTotals.length));
var loopTime = (run) => `${(run.sectionSeconds[run.sectionSeconds.length - 1] ?? 0).toFixed(1)}s`;
var teamText = (run) => fmt(teamFigure(run)) + (teamMode === "dpr" ? loopTime(run) : "");
var teamHtml = (run) => fmt(teamFigure(run)) + (teamMode === "dpr" ? `<sub class="looptime">${loopTime(run)}</sub>` : "");
var pctTrunc = (ratio) => `${fmt(Math.trunc(ratio * 1e3) / 10, 1, true)}%`;
var tableView = null;
function comparisonTable(rows) {
  const seq = (run) => run.combo.reduce((n, c) => n + c.sequence, 0);
  const rank = (run) => run.combo.reduce((n, c) => n + c.weapon.refinement, 0);
  const LEVELS = [
    (c) => c.highSubs ? "h" : "",
    (_, p) => p[3],
    (_, p) => p[0],
    (_, p) => p[4],
    (_, p) => p[1]
  ];
  const keyed = rows.map((row) => {
    const run = results.get(row.key);
    const pinned = pinnedRows.has(row.key);
    const parts = run.combo.map((c) => c.key.split("."));
    const keys = [`${pinned ? "pin|" : ""}${run.teamKey}`];
    for (const level of LEVELS)
      keys.push(`${keys[keys.length - 1]}|${run.combo.map((c, i) => level(c, parts[i])).join("-")}`);
    return { pair: [row.key, run], run, keys, pinned };
  });
  const groupBest = /* @__PURE__ */ new Map();
  for (const { run, keys } of keyed)
    for (const k of keys) {
      const held = groupBest.get(k);
      if (!held || teamFigure(run) > teamFigure(held))
        groupBest.set(k, run);
    }
  const sorted = keyed.sort((a, b) => {
    if (a.pinned !== b.pinned)
      return a.pinned ? -1 : 1;
    for (let i = 0; i < a.keys.length; i++) {
      const [ka, kb] = [a.keys[i], b.keys[i]];
      if (ka === kb)
        continue;
      const [ra, rb] = [groupBest.get(ka), groupBest.get(kb)];
      return teamFigure(rb) - teamFigure(ra) || seq(rb) - seq(ra) || rank(rb) - rank(ra) || (ka < kb ? -1 : 1);
    }
    return teamFigure(b.run) - teamFigure(a.run) || seq(b.run) - seq(a.run) || rank(b.run) - rank(a.run);
  }).map((k) => k.pair);
  const GEAR_AXES = ["weapons", "echoes", "mainstats", "substats"];
  const CMP_AXES = [...GEAR_AXES, "sequences", "refines"];
  const shows = (m, axis) => axisUsed(m, filters, axis);
  const showsRow = (m, axis, combo) => compares(m, filters, axis, combo);
  const AXIS_HEAD = { weapons: "Weapon", echoes: "Echo Set", mainstats: "Mainstats", substats: "Substats" };
  const gearKey = (c, axis) => {
    const [w, e, , seq2, ref, ...rest] = c.key.split(".");
    const anyRank = axis === "weapons" || axis === "refines";
    return [axis === "weapons" ? "*" : w, axis === "echoes" ? "*" : e, "*", axis === "sequences" ? "*" : seq2, anyRank ? "*" : ref, rest.includes("m"), axis === "substats" || axis === null ? "*" : rest.includes("h")].join("|");
  };
  const twinKey = (run, pos, axis) => `${run.teamKey}|${pos}|${axis}|${run.combo.map((c, k) => gearKey(c, k === pos ? axis : null)).join("-")}`;
  const openAt = { weapons: [false, false, false], echoes: [false, false, false], mainstats: [false, false, false], substats: [false, false, false], sequences: [false, false, false], refines: [false, false, false] };
  for (const row of rows) {
    row.members.forEach((m, pos) => {
      for (const axis of CMP_AXES)
        if (shows(m, axis))
          openAt[axis][pos] = true;
    });
  }
  const optionOf = (axis, m, c) => axis === "weapons" ? c.weapon.name : axis === "echoes" ? echoLabel(m.loadout, c.echo) : axis === "mainstats" ? c.mainstat.name : axis === "substats" ? subsLabel(c) : axis === "sequences" ? String(c.sequence) : String(c.weapon.refinement);
  const seenAt = /* @__PURE__ */ new Map();
  for (const row of rows) {
    row.members.forEach((m, pos) => {
      for (const axis of CMP_AXES) {
        if (!shows(m, axis))
          continue;
        const key = `${axis}|${pos}|${m.name}`;
        let seen = seenAt.get(key);
        if (!seen)
          seenAt.set(key, seen = /* @__PURE__ */ new Set());
        seen.add(optionOf(axis, m, row.combo[pos]));
      }
    });
  }
  const soloWeapon = [false, false, false];
  for (const axis of CMP_AXES) {
    openAt[axis].forEach((open, pos) => {
      if (!open)
        return;
      const choices = [...seenAt].some(([key, seen]) => key.startsWith(`${axis}|${pos}|`) && seen.size > 1);
      if (choices)
        return;
      if (axis === "weapons")
        soloWeapon[pos] = true;
      else
        openAt[axis][pos] = false;
    });
  }
  const worn = /* @__PURE__ */ new Map();
  for (const row of rows) {
    row.members.forEach((m, pos) => {
      if (axisOpen(m, filters, "weapons") || !shownRanks(m, filters).length)
        return;
      const key = `${row.teamKey}|${pos}`;
      worn.set(key, (worn.get(key) ?? /* @__PURE__ */ new Set()).add(weaponBase(row.combo[pos].weapon)));
    });
  }
  const multiWeapon = new Set([...worn].filter(([, seen]) => seen.size > 1).map(([key]) => key));
  for (const key of multiWeapon) {
    const pos = Number(key.slice(key.lastIndexOf("|") + 1));
    if (!openAt.weapons[pos])
      soloWeapon[pos] = true;
    openAt.weapons[pos] = true;
  }
  const weaponCell = (run, m, pos) => axisOpen(m, filters, "weapons") || multiWeapon.has(`${run.teamKey}|${pos}`);
  const cmpAt = (axis, i) => !openAt[axis][i] ? false : axis === "weapons" ? !soloWeapon[i] : axis === "refines" ? !cmpAt("weapons", i) : true;
  const onScreen = new Set(rows.map((r) => r.key));
  const teamsOnScreen = new Set(rows.map((r) => r.teamKey));
  const openAxes = CMP_AXES.filter((axis) => openAt[axis].some((_, pos) => cmpAt(axis, pos)));
  const offeredAt = /* @__PURE__ */ new Map();
  for (const row of rows) {
    row.members.forEach((m, pos) => {
      for (const axis of openAxes) {
        if (!cmpAt(axis, pos))
          continue;
        const key = `${axis}|${pos}|${row.teamKey}`;
        let seen = offeredAt.get(key);
        if (!seen)
          offeredAt.set(key, seen = /* @__PURE__ */ new Set());
        seen.add(optionOf(axis, m, row.combo[pos]));
      }
    });
  }
  const twins = /* @__PURE__ */ new Map();
  for (const [key, run] of results) {
    if (!openAxes.length || !teamsOnScreen.has(run.teamKey))
      continue;
    run.members.forEach((m, pos) => {
      for (const axis of openAxes) {
        if (!cmpAt(axis, pos))
          continue;
        const twin = twinKey(run, pos, axis);
        const list = twins.get(twin) ?? [];
        const offered = offeredAt.get(`${axis}|${pos}|${run.teamKey}`)?.has(optionOf(axis, m, run.combo[pos])) ?? false;
        list.push({ combo: run.combo[pos], dpr: personalFigure(run, m.name), shown: onScreen.has(key), offered });
        twins.set(twin, list);
      }
    });
  }
  const ranked = (m) => axisUsed(m, filters, "refines") || shownRanks(m, filters).length > 0;
  const bestOf = (pool, run, pos, axis) => {
    const shownWeapons = axis === "weapons" ? [...offeredAt.get(`weapons|${pos}|${run.teamKey}`) ?? []].map((n) => n.replace(/ R\d$/, "")) : [];
    const leftmost = run.members[pos].loadout.weapons.find(
      (w) => w.tier !== 0
      /* Tier.Limited */
    );
    const baseWeapon = leftmost && shownWeapons.includes(weaponBase(leftmost)) ? leftmost : void 0;
    let base = -Infinity;
    for (const t of pool) {
      if (axis === "weapons") {
        if (t.combo.weapon.tier === 0 || baseWeapon && weaponBase(t.combo.weapon) !== weaponBase(baseWeapon))
          continue;
        if (ranked(run.members[pos]) && t.combo.key.split(".")[4] !== "r0")
          continue;
      }
      if (axis === "refines" && t.combo.key.split(".")[4] !== "r0")
        continue;
      if (axis === "substats" && t.combo.highSubs)
        continue;
      if (axis === "sequences" && (t.combo.sequence !== sequenceLevels(run.members[pos], filters)[0] || !ranked(run.members[pos]) && t.combo.key.split(".")[4] !== "r0"))
        continue;
      if (t.dpr > base)
        base = t.dpr;
    }
    return base;
  };
  const gearRatio = (run, pos, axis) => {
    const dpr = personalFigure(run, run.members[pos].name);
    const all = twins.get(twinKey(run, pos, axis)) ?? [];
    const shown = all.filter((t) => t.shown);
    const offered = all.filter((t) => t.offered);
    const base = bestOf([...shown, ...offered], run, pos, axis);
    if (base > 0)
      return dpr / base;
    const left = shown.length ? shown : offered;
    if (!left.length)
      return null;
    const low = Math.min(...left.map((t) => t.dpr));
    return low > 0 ? dpr / low : null;
  };
  const gearCompare = (run, pos, axis) => {
    const ratio = gearRatio(run, pos, axis);
    return ratio == null ? "" : pctTrunc(ratio);
  };
  for (let i = 0; i < personalOpen.length; i++)
    for (const axis of CMP_AXES) {
      const key = `${axis}|${i}`;
      if (!openAt[axis][i])
        cmpDrawn.delete(key);
      else if (!cmpDrawn.has(key)) {
        cmpDrawn.add(key);
        personalOpen[i] = true;
      }
    }
  const dprAt = (i) => !!personalOpen[i];
  const rowHtml = (key, run, rank2) => {
    const grand = teamFigure(run);
    const memberNames = run.members.map((m) => m.name).join("|");
    const memberCell = (m, combo, i) => {
      const seqTag = sequenceTag(m, combo);
      const inCell = weaponCell(run, m, i);
      const refTag = axisUsed(m, filters, "refines") && !inCell ? refineTag(m, combo) : null;
      const name = `<div class="c name res" data-resonator="${esc(m.name)}"` + (seqTag ? ` data-sequence="${esc(seqTag)}" data-seq-gate="${combo.sequence}"` : "") + (refTag ? ` data-refine="${esc(refTag)}" data-ref-gate="${combo.weapon.refinement}"` : "") + ` style="--mem:${m.color};color:${m.color}"><span class="res-label">${esc(memberLabel(m, combo, inCell))}</span></div>`;
      const dpr = dprAt(i) ? `<div class="c num slotdpr" style="--mem:${m.color}">${fmt(personalFigure(run, m.name))}</div>` : "";
      const seqCmp = cmpAt("sequences", i) ? `<div class="c num slotcompare" style="--mem:${m.color}">${axisOpen(m, filters, "sequences") ? gearCompare(run, i, "sequences") : ""}</div>` : "";
      const refCmp = cmpAt("refines", i) ? `<div class="c num slotcompare" style="--mem:${m.color}">${compares(m, filters, "refines", combo) ? gearCompare(run, i, "refines") : ""}</div>` : "";
      const gear = GEAR_AXES.map((axis) => {
        if (!openAt[axis][i])
          return "";
        const open = axis === "weapons" ? inCell : showsRow(m, axis, combo);
        const cell = axis === "weapons" ? optionCell("weapon", open ? combo.weapon.name : "", open ? weaponHue(combo.weapon) : m.color, [combo.weapon.name], m.name) : axis === "echoes" ? optionCell("echo", open ? echoLabel(m.loadout, combo.echo) : "", m.color, open ? echoLines(m.loadout, combo.echo) : [], m.name) : `<div class="c option"${open ? ` data-stat="${axis}" data-resonator="${esc(m.name)}"` : ""} style="--mem:${m.color}">${open ? esc(axis === "mainstats" ? combo.mainstat.name : subsLabel(combo)) : ""}</div>`;
        return cell + (cmpAt(axis, i) ? `<div class="c num slotcompare" style="--mem:${m.color}">${open ? gearCompare(run, i, axis) : ""}</div>` : "");
      }).join("");
      return name + seqCmp + refCmp + gear + dpr;
    };
    const memberCells = run.members.map((m, i) => memberCell(m, run.combo[i], i)).join("");
    return `<div class="trow${rank2.pinned ? " isbaseline" : ""}" style="--hue:${rank2.hue}" data-team="${esc(key)}" data-team-key="${esc(run.teamKey)}" data-members="${esc(memberNames)}" data-total="${grand}">` + pinCell(key) + memberCells + `<div class="c num total teamdpr" title="${CLICK} to view the team's damage breakdown"${deferredPop("dpr", key)}>${teamHtml(run)}</div><div class="c num total baseline" data-team="${esc(key)}" title="${CLICK} to measure every team against this one">${rank2.pct}</div><div class="c gotodetail" data-team="${esc(key)}">view rotation<span class="arrow">\u203A</span></div></div>`;
  };
  const memberHead = (n, i) => `<div class="c slothead${dprAt(i) ? " open" : ""}" data-slot="${i}" title="${CLICK} to ${dprAt(i) ? "hide" : "show"} this slot's Personal DPR">Slot ${n}<span class="arrow">\u203A</span></div>` + (cmpAt("sequences", i) ? `<div class="c num">Compare</div>` : "") + (cmpAt("refines", i) ? `<div class="c num">Compare</div>` : "") + GEAR_AXES.map((axis) => openAt[axis][i] ? `<div class="c">${AXIS_HEAD[axis]}</div>${cmpAt(axis, i) ? `<div class="c num">Compare</div>` : ""}` : "").join("") + (dprAt(i) ? `<div class="c num">Personal</div>` : "");
  const head = `<div class="trow thead"><div class="c pinhead">Pin</div>` + memberHead(3, 0) + memberHead(2, 1) + memberHead(1, 2) + `<div class="c num dprhead" title="${CLICK} to switch between DPR and DPS">${TEAM_HEAD[teamMode]}</div><div class="c num huehead" title="${CLICK} to colour the column by rank">Compare</div><div class="c"></div></div>`;
  const posCols = (i) => `max-content${cmpAt("sequences", i) ? " max-content" : ""}${cmpAt("refines", i) ? " max-content" : ""}${GEAR_AXES.map((axis) => openAt[axis][i] ? ` max-content${cmpAt(axis, i) ? " max-content" : ""}` : "").join("")}${dprAt(i) ? " max-content" : ""}`;
  const gridStyle = `grid-template-columns:max-content ${posCols(0)} ${posCols(1)} ${posCols(2)} max-content max-content max-content`;
  const rowLines = (run) => Math.max(1, ...run.members.map((m, i) => openAt.echoes[i] && axisOpen(m, filters, "echoes") ? echoLines(m.loadout, run.combo[i].echo).length : 1));
  const lines = sorted.map(([, run]) => rowLines(run));
  const extra = [0];
  for (const n of lines)
    extra.push(extra[extra.length - 1] + n - 1);
  const ranks = rankAll(sorted);
  const widest = (a, b) => b.length > a.length ? b : a;
  const blank = () => ["", "", ""];
  const wide = {
    name: blank(),
    dpr: blank(),
    seqcmp: blank(),
    refcmp: blank(),
    total: "",
    pct: "",
    gear: { weapons: blank(), echoes: blank(), mainstats: blank(), substats: blank() },
    cmp: { weapons: blank(), echoes: blank(), mainstats: blank(), substats: blank() }
  };
  sorted.forEach(([, run], i) => {
    run.members.forEach((m, pos) => {
      const combo = run.combo[pos];
      wide.name[pos] = widest(wide.name[pos], memberLabel(m, combo, weaponCell(run, m, pos)));
      wide.dpr[pos] = widest(wide.dpr[pos], fmt(personalFigure(run, m.name)));
      if (axisOpen(m, filters, "sequences"))
        wide.seqcmp[pos] = widest(wide.seqcmp[pos], gearCompare(run, pos, "sequences"));
      if (compares(m, filters, "refines", combo))
        wide.refcmp[pos] = widest(wide.refcmp[pos], gearCompare(run, pos, "refines"));
      for (const axis of GEAR_AXES) {
        if (!(axis === "weapons" ? weaponCell(run, m, pos) : showsRow(m, axis, combo)))
          continue;
        const text = axis === "weapons" ? [combo.weapon.name] : axis === "echoes" ? echoLines(m.loadout, combo.echo) : axis === "mainstats" ? [combo.mainstat.name] : [subsLabel(combo)];
        for (const line of text)
          wide.gear[axis][pos] = widest(wide.gear[axis][pos], line);
        if (showsRow(m, axis, combo))
          wide.cmp[axis][pos] = widest(wide.cmp[axis][pos], gearCompare(run, pos, axis));
      }
    });
    wide.total = widest(wide.total, teamText(run));
    wide.pct = widest(wide.pct, ranks[i].pct);
  });
  const ghostPos = (i) => `<div class="c name res"><span class="res-label">${esc(wide.name[i])}</span></div>` + (cmpAt("sequences", i) ? `<div class="c num slotcompare">${esc(wide.seqcmp[i])}</div>` : "") + (cmpAt("refines", i) ? `<div class="c num slotcompare">${esc(wide.refcmp[i])}</div>` : "") + GEAR_AXES.map((axis) => openAt[axis][i] ? `<div class="c option">${esc(wide.gear[axis][i])}</div>${cmpAt(axis, i) ? `<div class="c num slotcompare">${esc(wide.cmp[axis][i])}</div>` : ""}` : "").join("") + (dprAt(i) ? `<div class="c num slotdpr">${esc(wide.dpr[i])}</div>` : "");
  const ghost = () => `<div class="trow tghost" aria-hidden="true"><div class="c pin">${PIN_MARK}</div>` + ghostPos(0) + ghostPos(1) + ghostPos(2) + `<div class="c num total">${esc(widest(wide.total, TEAM_HEAD[teamMode]))}</div><div class="c num total baseline">${esc(wide.pct)}</div><div class="c gotodetail">view rotation<span class="arrow">\u203A</span></div></div>`;
  tableView = { sorted, ranks, head, ghost, rowHtml, lines, extra };
  return `<main><div class="tclayout"><aside class="tcside">${comparisonFilters()}</aside><div class="tcbody"><h2 class="summary-label" id="teamCount">${fmt(sorted.length)} teams<span class="hint">${CLICK} on a Resonator to filter and compare sequences, weapons, echoes</span></h2><div class="tcwrap"><div class="tgrid${hueShown ? " hued" : ""}" style="${gridStyle}">${head}${ghost()}</div></div></div></div></main>`;
}
var rowHeight = 30;
var lineHeight = 17;
var measured = false;
var OVERSCAN = 40;
var drawnFrom = -1;
var drawnTo = -1;
var baselineTeam = null;
var BEST_HUE = 0;
var BASELINE_HUE = 120;
var WORST_HUE = 280;
function setBaseline(team) {
  baselineTeam = baselineTeam === team ? null : team;
  if (tableView) {
    tableView.ranks = rankAll(tableView.sorted);
    drawWindow(true);
  }
}
function rankAll(sorted) {
  const totals = sorted.map(([, run]) => teamFigure(run));
  const pinned = baselineTeam == null ? -1 : sorted.findIndex(([key]) => key === baselineTeam);
  const base = pinned >= 0 ? totals[pinned] : Math.min(...totals);
  const maxRatio = Math.max(...totals.map((t) => base ? t / base : 1), 1);
  const minRatio = Math.min(...totals.map((t) => base ? t / base : 1), 1);
  return totals.map((t, i) => {
    const ratio = base ? t / base : 1;
    const away = ratio >= 1 ? maxRatio > 1 ? (ratio - 1) / (maxRatio - 1) : 0 : minRatio < 1 ? (1 - ratio) / (1 - minRatio) : 0;
    const hue = ratio >= 1 ? BASELINE_HUE - away * (BASELINE_HUE - BEST_HUE) : BASELINE_HUE + away * (WORST_HUE - BASELINE_HUE);
    return { hue, pct: pctTrunc(ratio), pinned: i === pinned };
  });
}
function drawWindow(force = false, scrollTop) {
  const view = tableView;
  const main = app2.querySelector("main");
  const grid = main?.querySelector(".tgrid");
  if (!view || !main || !grid)
    return;
  const n = view.sorted.length;
  const top = scrollTop ?? main.scrollTop;
  const headCell = grid.querySelector(".thead .c");
  const headH = headCell ? rect(headCell).height : 0;
  const rowsTop = rect(grid).top - rect(main).top + main.scrollTop + headH;
  const rowTop = (i) => i * rowHeight + view.extra[i] * lineHeight;
  const rowAt = (y) => {
    let lo = 0, hi = n;
    while (lo < hi) {
      const mid = lo + hi >> 1;
      if (rowTop(mid + 1) <= y)
        lo = mid + 1;
      else
        hi = mid;
    }
    return lo;
  };
  const seenFrom = Math.max(0, rowAt(top - rowsTop));
  const seenTo = Math.min(n, rowAt(top + main.clientHeight - rowsTop) + 1);
  const inside = seenFrom >= drawnFrom + (drawnFrom > 0 ? OVERSCAN / 2 : 0) && seenTo <= drawnTo - (drawnTo < n ? OVERSCAN / 2 : 0);
  if (!force && inside)
    return;
  const from = Math.max(0, seenFrom - OVERSCAN), to = Math.min(n, seenTo + OVERSCAN);
  const spacer = (a, b) => b > a ? `<div class="vspace" style="height:${rowTop(b) - rowTop(a)}px"></div>` : "";
  let body = "";
  for (let i = from; i < to; i++) {
    const [key, run] = view.sorted[i];
    body += view.rowHtml(key, run, view.ranks[i]);
  }
  grid.innerHTML = view.head + view.ghost() + spacer(0, from) + body + spacer(to, n);
  drawnFrom = from;
  drawnTo = to;
  if (!measured && to - from >= 2) {
    measured = true;
    const cells = [...grid.querySelectorAll(".trow:not(.thead) > .c.teamdpr")];
    const heights = cells.slice(0, -1).map((c, j) => [rect(cells[j + 1]).top - rect(c).top, view.lines[from + j]]);
    const single = heights.find(([, k]) => k === 1), stacked = heights.find(([, k]) => k > 1);
    const base = single ? single[0] : stacked ? stacked[0] - lineHeight * (stacked[1] - 1) : rowHeight;
    const perLine = stacked ? (stacked[0] - base) / (stacked[1] - 1) : lineHeight;
    if (Math.abs(base - rowHeight) > 0.25 || Math.abs(perLine - lineHeight) > 0.25) {
      rowHeight = base;
      lineHeight = perLine;
      drawWindow(true, scrollTop);
    }
  }
}
var block = null;
var blockBox = null;
var blockDot = null;
var dotAt = null;
var blockPress = null;
var blocking = false;
var bx = 0;
var by = 0;
var copyMenu = null;
var COPY_MODE_KEY = "wuwa.copyMode";
var copyMode = "discord";
try {
  if (localStorage.getItem(COPY_MODE_KEY) === "sheets")
    copyMode = "sheets";
} catch {
}
var rowTopOf = (i) => i * rowHeight + tableView.extra[i] * lineHeight;
function clearBlock() {
  block = null;
  dotAt = null;
  blockBox?.remove();
  blockBox = null;
  blockDot?.remove();
  blockDot = null;
  copyMenu?.remove();
  copyMenu = null;
}
function pickable(target) {
  const cell = target.closest?.(".tgrid .c");
  const row = cell?.parentElement;
  if (!cell || !row)
    return null;
  const at = [...row.children].indexOf(cell);
  return at > 0 && at < row.children.length - 1 ? cell : null;
}
function blockCellAt(grid, x, y) {
  const heads = [...grid.querySelectorAll(".thead > .c")].map(rect);
  let col = 1;
  while (col < heads.length - 1 && x >= heads[col + 1].left)
    col++;
  const head = heads[0];
  if (y < head.bottom)
    return [-1, col];
  const at = y - rect(grid).top - head.height;
  let lo = 0, hi = tableView.sorted.length - 1;
  while (lo < hi) {
    const mid = lo + hi + 1 >> 1;
    if (rowTopOf(mid) <= at)
      lo = mid;
    else
      hi = mid - 1;
  }
  return [lo, col];
}
function blockEdgeAt(grid, x, y) {
  const heads = [...grid.querySelectorAll(".thead > .c")].map(rect);
  const n = tableView.sorted.length;
  const at = y - rect(grid).top;
  const edgeY = (e) => e < 0 ? 0 : heads[0].height + rowTopOf(e);
  let lo = -1, hi = n;
  while (lo < hi) {
    const mid = lo + hi + 1 >> 1;
    if (edgeY(mid) <= at)
      lo = mid;
    else
      hi = mid - 1;
  }
  const row = lo < n && edgeY(lo + 1) - at < at - edgeY(lo) ? lo + 1 : lo;
  let col = 1;
  for (let c = 2; c < heads.length; c++)
    if (Math.abs(heads[c].left - x) < Math.abs(heads[col].left - x))
      col = c;
  return [row, col];
}
var MENU_GAP = 4;
var DOT_CLEAR = 6;
function paintBlock() {
  const wrap = app2.querySelector(".tcwrap");
  const grid = wrap?.querySelector(".tgrid");
  if (!block || !wrap || !grid)
    return;
  const heads = [...grid.querySelectorAll(".thead > .c")].map(rect);
  const w = rect(wrap), g = rect(grid);
  const y = (i) => i < 0 ? 0 : heads[0].height + rowTopOf(i);
  if (!blockBox?.isConnected) {
    blockBox = wrap.appendChild(document.createElement("div"));
    blockBox.className = "cellbox";
  }
  const top = g.top - w.top + y(block.r0);
  blockBox.style.left = `${heads[block.c0].left - w.left}px`;
  blockBox.style.top = `${top}px`;
  blockBox.style.width = `${heads[block.c1].right - heads[block.c0].left}px`;
  blockBox.style.height = `${g.top - w.top + y(block.r1 + 1) - top}px`;
  if (block.touch) {
    if (!blockDot?.isConnected)
      blockDot = makeDot(wrap, grabBlockDot);
    const [r, c] = dotAt ?? [block.r1 + 1, block.c1 + 1];
    blockDot.style.left = `${heads[c].left - w.left}px`;
    blockDot.style.top = `${g.top - w.top + y(r)}px`;
  }
  if (copyMenu) {
    copyMenu.style.left = `${heads[block.c1].right - w.left - copyMenu.offsetWidth}px`;
    copyMenu.style.top = `${g.top - w.top + y(block.r1 + 1) + MENU_GAP + (block.touch ? DOT_CLEAR : 0)}px`;
  }
}
function showCopyMenu() {
  const wrap = app2.querySelector(".tcwrap");
  const tracks = app2.querySelectorAll(".tgrid .thead > .c").length;
  if (!block || !wrap || block.c1 < 1 || block.c0 > tracks - 2)
    return;
  copyMenu?.remove();
  const item = (mode, label) => `<button type="button" class="ctxitem" data-copy="${mode}">${label}</button>`;
  copyMenu = wrap.appendChild(document.createElement("div"));
  copyMenu.className = "copymenu";
  copyMenu.innerHTML = item("sheets", "Copy to Sheets") + item("discord", "Copy to Discord");
  paintBlock();
}
function measureFromBlock(grid) {
  if (!block || block.r1 <= block.r0 || !tableView)
    return;
  const compare = [...grid.querySelectorAll(".thead > .c")].findIndex((c) => c.classList.contains("huehead"));
  const bottom = tableView.sorted[block.r1]?.[0];
  if (bottom && block.c0 <= compare && compare <= block.c1 && baselineTeam !== bottom) {
    baselineTeam = bottom;
    tableView.ranks = rankAll(tableView.sorted);
    drawWindow(true);
  }
}
function trackTableBlock() {
  const grid = app2.querySelector(".tgrid");
  if (!blocking || !grid || !tableView?.sorted.length)
    return;
  const [row, col] = blockCellAt(grid, bx, by);
  if (!block)
    block = { ar: row, ac: col, r0: row, r1: row, c0: col, c1: col, touch: false };
  if ((row !== block.ar || col !== block.ac) && blockPress)
    blockPress.moved = true;
  block.r0 = Math.min(block.ar, row);
  block.r1 = Math.max(block.ar, row);
  block.c0 = Math.min(block.ac, col);
  block.c1 = Math.max(block.ac, col);
  measureFromBlock(grid);
  paintBlock();
}
var blockRaf = 0;
var queueBlock = () => {
  if (blockRaf)
    return;
  blockRaf = requestAnimationFrame(() => {
    blockRaf = 0;
    trackTableBlock();
  });
};
function pickTouched(row, col) {
  clearBlock();
  block = { ar: row, ac: col, r0: row, r1: row, c0: col, c1: col, touch: true };
  paintBlock();
}
function grabBlockDot(e) {
  const grid = app2.querySelector(".tgrid");
  const held = block;
  if (!grid || !held)
    return;
  copyMenu?.remove();
  copyMenu = null;
  grabDot(e, {
    grid,
    corners: () => [[held.r0, held.c0], [held.r1 + 1, held.c1 + 1]],
    edgeAt: (x, y) => blockEdgeAt(grid, x, y),
    edgePoint: (r, c) => {
      const heads = [...grid.querySelectorAll(".thead > .c")].map(rect);
      return [heads[c].left, rect(grid).top + (r < 0 ? 0 : heads[0].height + rowTopOf(r))];
    },
    limits: () => [[-1, 1], [tableView.sorted.length, grid.querySelectorAll(".thead > .c").length - 1]],
    aim: (from, to) => {
      const [r0, r1] = from[0] <= to[0] ? [from[0], to[0]] : [to[0], from[0]];
      const [c0, c1] = from[1] <= to[1] ? [from[1], to[1]] : [to[1], from[1]];
      dotAt = to;
      block = { ar: r0, ac: c0, r0, r1: r1 - 1, c0, c1: c1 - 1, touch: true };
      paintBlock();
    },
    done: () => {
      dotAt = null;
      measureFromBlock(grid);
      showCopyMenu();
    }
  });
}
addEventListener("pointerdown", (e) => {
  const target = e.target;
  if (target.closest?.(".copymenu, .celldot"))
    return;
  const cell = pickable(target);
  const grid = app2.querySelector(".tgrid");
  if (e.pointerType === "touch") {
    if (!cell || !grid || !tableView?.sorted.length) {
      watchTouch(e, null, clearBlock);
      return;
    }
    const scale2 = zoom();
    const [row, col] = blockCellAt(grid, e.clientX / scale2, e.clientY / scale2);
    watchTouch(e, cell, () => pickTouched(row, col), () => {
      pickTouched(row, col);
      showCopyMenu();
    });
    return;
  }
  clearBlock();
  if (e.button !== 0 || !cell || !grid || !tableView?.sorted.length)
    return;
  const scale = zoom();
  blockPress = { at: performance.now(), scale, moved: false };
  [bx, by] = [e.clientX / scale, e.clientY / scale];
  blocking = true;
  dropPanel();
  holdPanels(true);
  trackTableBlock();
});
addEventListener("pointermove", (e) => {
  if (!blockPress || e.pointerType === "touch")
    return;
  bx = e.clientX / blockPress.scale;
  by = e.clientY / blockPress.scale;
  queueBlock();
});
var endBlockPress = (e) => {
  const press = blockPress;
  if (!press || e.pointerType === "touch")
    return;
  if (blockRaf) {
    cancelAnimationFrame(blockRaf);
    blockRaf = 0;
    trackTableBlock();
  }
  blockPress = null;
  blocking = false;
  holdPanels(false);
  if (!press.moved && performance.now() - press.at < HOLD)
    return;
  showCopyMenu();
  swallowClick();
};
addEventListener("pointerup", endBlockPress);
addEventListener("pointercancel", endBlockPress);
addEventListener("scroll", () => {
  if (blocking)
    queueBlock();
}, true);
var cellText = (c) => {
  c.querySelectorAll("sub, .arrow").forEach((el) => el.remove());
  c.querySelectorAll("br").forEach((br) => br.replaceWith(" / "));
  return (c.textContent ?? "").trim();
};
function copyTableBlock(mode) {
  const view = tableView;
  const tracks = app2.querySelectorAll(".tgrid .thead > .c").length;
  if (!block || !view)
    return;
  const c0 = Math.max(block.c0, 1), c1 = Math.min(block.c1, tracks - 2);
  if (c0 > c1)
    return;
  const tpl = document.createElement("template");
  const lines = [];
  for (let i = block.r0; i <= block.r1; i++) {
    const at = view.sorted[i];
    tpl.innerHTML = i < 0 ? view.head : view.rowHtml(at[0], at[1], view.ranks[i]);
    const cells = [...tpl.content.firstElementChild.children].slice(c0, c1 + 1);
    lines.push(cells.flatMap((c) => {
      if (mode !== "sheets" || teamMode !== "dpr")
        return [cellText(c)];
      if (c.classList.contains("dprhead"))
        return [cellText(c), "Loop Time"];
      if (!c.classList.contains("teamdpr"))
        return [cellText(c)];
      const time = (c.querySelector(".looptime")?.textContent ?? "").replace(/s$/, "");
      return [cellText(c), time];
    }));
  }
  copyBlock(lines, mode);
}
addEventListener("keydown", (e) => {
  if (e.key === "Escape")
    clearBlock();
  if (!block || !tableView || e.key !== "c" || !(e.ctrlKey || e.metaKey) || e.altKey || !app2.querySelector(".tgrid"))
    return;
  const loose = getSelection();
  if (loose && !loose.isCollapsed)
    return;
  e.preventDefault();
  copyTableBlock(copyMode);
});
document.addEventListener("click", (e) => {
  const mode = e.target.closest(".copymenu .ctxitem")?.dataset.copy;
  if (!mode)
    return;
  copyMode = mode;
  try {
    localStorage.setItem(COPY_MODE_KEY, mode);
  } catch {
  }
  copyTableBlock(mode);
  copyMenu?.remove();
  copyMenu = null;
});
var sideFit = new ResizeObserver((entries) => {
  for (const e of entries) {
    const el = e.target;
    el.style.marginBottom = el.closest(".tclayout")?.classList.contains("stack") ? "" : `-${el.offsetHeight}px`;
  }
});
function fitSide() {
  const layout = app2.querySelector(".tclayout");
  const side = app2.querySelector(".tcside");
  const head = app2.querySelector(".tgrid .trow.thead");
  const first = head?.firstElementChild, last = head?.lastElementChild;
  const main = app2.querySelector("main");
  if (!layout || !side || !first || !last || !main)
    return;
  layout.classList.remove("stack");
  main.classList.remove("stack");
  const table = rect(last).right - rect(first).left;
  let room = layout.clientWidth;
  const beside = room - table - (parseFloat(getComputedStyle(layout).columnGap) || 0);
  const stacked = !(getComputedStyle(layout).flexDirection === "row" && beside >= 370);
  if (!stacked)
    room = beside;
  else {
    layout.classList.add("stack");
    main.classList.add("stack");
    const cs = getComputedStyle(main);
    room = main.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    side.style.width = `${Math.min(room, table)}px`;
    side.style.marginInline = table < room ? "auto" : "0";
  }
  side.style.maxHeight = stacked ? "" : `${main.clientHeight}px`;
  if (!stacked) {
    side.style.width = "";
    side.style.marginInline = "";
  }
  side.style.marginBottom = stacked ? "" : `-${side.offsetHeight}px`;
  const label = app2.querySelector(".tcbody > .summary-label");
  if (label)
    main.style.setProperty("--headtop", `${label.offsetHeight}px`);
  sideFit.disconnect();
  sideFit.observe(side);
}
function rowElementAt(i) {
  const sorted = tableView?.sorted;
  if (!sorted?.length)
    return null;
  const key = sorted[Math.min(i, sorted.length - 1)][0];
  return [...app2.querySelectorAll(".tgrid .trow[data-team]")].find((el) => el.dataset.team === key) ?? null;
}
var tableScrollTop = 0;
var rememberTableScroll = () => {
  if (app2.querySelector(".tgrid"))
    tableScrollTop = app2.querySelector("main")?.scrollTop ?? 0;
};
var openingFocus = !matchMedia("(pointer: coarse)").matches;
for (const type of ["pointerdown", "keydown", "wheel"]) {
  addEventListener(type, () => {
    openingFocus = false;
  }, { capture: true, once: true });
}
function renderComparison() {
  topbar.hidden = true;
  clearPops();
  const scrollTop = app2.querySelector(".tgrid") ? app2.querySelector("main")?.scrollTop ?? 0 : tableScrollTop;
  clearBlock();
  app2.innerHTML = comparisonTable(visibleRows);
  app2.className = "";
  measured = false;
  drawnFrom = drawnTo = -1;
  fitSide();
  drawWindow(true, scrollTop);
  const main = app2.querySelector("main");
  main.scrollTop = scrollTop;
  if (openingFocus)
    focusAfterDraw ??= null;
  const back = focusAfterDraw;
  focusAfterDraw = void 0;
  if (back !== void 0) {
    const chip = back === null ? void 0 : [...app2.querySelectorAll(CHIP_RING)].find((el) => chipSig(el) === back);
    if (chip)
      chip.focus({ preventScroll: true });
    else
      focusSearch();
  }
  let queued2 = false;
  main.addEventListener("scroll", () => {
    if (queued2)
      return;
    queued2 = true;
    requestAnimationFrame(() => {
      queued2 = false;
      drawWindow();
    });
  }, { passive: true });
}
addEventListener("resize", () => {
  fitSide();
  drawWindow(true);
});
document.addEventListener("click", (e) => {
  const key = e.target.closest(".c.pin")?.dataset.pin;
  if (key)
    togglePin(key);
});
document.addEventListener("click", (e) => {
  const el = e.target.closest(".c.baseline");
  if (el?.dataset.team)
    setBaseline(el.dataset.team);
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".c.huehead"))
    return;
  hueShown = !hueShown;
  document.querySelector(".tgrid")?.classList.toggle("hued", hueShown);
});
document.addEventListener("click", (e) => {
  const slot = e.target.closest(".c.slothead")?.dataset.slot;
  if (slot === void 0)
    return;
  personalOpen[Number(slot)] = !personalOpen[Number(slot)];
  renderComparison();
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".c.dprhead"))
    return;
  teamMode = teamMode === "dpr" ? "dps" : "dpr";
  renderComparison();
});
document.addEventListener("change", (e) => {
  const select = e.target;
  if (select.id !== "cost")
    return;
  withRowCap(() => {
    const was = filters.cost;
    filters.cost = select.value;
    return () => {
      filters.cost = was;
      select.value = was;
    };
  });
});
document.addEventListener("change", (e) => {
  const box = e.target;
  if (box.id !== "matrixToggle")
    return;
  withRowCap(() => {
    const was = filters.matrix;
    filters.matrix = box.checked ? [...MATRIX_RESONATORS] : [];
    return () => {
      filters.matrix = was;
      box.checked = was.length > 0;
    };
  });
});
var openNameMenu = (el, x, y) => {
  const resonator = el.dataset.resonator ?? "";
  const row = cellRun(el, resonator);
  const compareItem = (axis) => ({
    label: `${filters[axis].includes(resonator) ? "Stop comparing" : "Compare"} ${resonator} ${AXIS_LABEL[axis].toLowerCase()}`,
    run: () => setCompare(resonator, axis)
  });
  const scopedBlock = (tag, on, gate, map) => tag ? [
    { label: `Show only ${tag} teams`, run: () => setFilter(map, tag, "include"), alt: () => setFilter(map, tag, "exclude") },
    { label: `Hide ${tag} teams`, run: () => setFilter(map, tag, "exclude") },
    ...scopedItems(resonator, on, gate).sort((a, b) => AXES.indexOf(a.axis) - AXES.indexOf(b.axis))
  ] : [];
  const items = [
    // nothing to offer once they are already the ones shown — the bubble is where that comes back off
    ...resonatorFilters.get(resonator) === "include" ? [] : [{
      label: `Show ${resonator} teams`,
      run: () => setFilter(resonatorFilters, resonator, "include"),
      alt: () => setFilter(resonatorFilters, resonator, "exclude")
    }],
    { label: `Hide ${resonator} teams`, run: () => setFilter(resonatorFilters, resonator, "exclude") },
    // every axis this resonator has more than one option on, the substat spread last of all —
    // it is the one that says how the whole build is invested rather than which pick it wears.
    // A kit with no chain nodes yet says so where its sequence compare would sit, and the line
    // does nothing when pressed.
    // refines are not among them: a weapon's are compared from its own cell (`openOptionMenu`),
    // and a rank shown one at a time below
    ...MENU_AXES.flatMap((axis) => comparable(resonator, axis) ? [compareItem(axis)] : axis === "sequences" ? [{ label: "Sequences Not Implemented!", run: () => {
    } }] : []),
    ...comparable(resonator, "substats") ? [compareItem("substats")] : [],
    ...scopedBlock(el.dataset.sequence, "sequence", el.dataset.seqGate ?? "", sequenceFilters),
    // with no weapon compare the row's own weapon takes its other ranks from here
    ...row && !axisOpen(row.run.members[row.pos], filters, "weapons") ? rankItems(row.run, row.pos) : [],
    ...scopedBlock(el.dataset.refine, "refine", el.dataset.refGate ?? "", refineFilters)
  ];
  showMenu(x, y, items);
};
var openNameMenuAt = (e) => {
  const el = e.target.closest(".c.name.res");
  if (!el?.dataset.resonator)
    return;
  e.preventDefault();
  openNameMenu(el, e.clientX, e.clientY);
};
document.addEventListener("click", openNameMenuAt);
document.addEventListener("contextmenu", openNameMenuAt);
var optionPick = (e) => {
  const el = e.target.closest(".c.option");
  const kind = el?.dataset.kind;
  const value = el?.dataset.value;
  return kind && value ? [OPTION_FILTER_MAPS[kind], value] : void 0;
};
var openOptionMenu = (e) => {
  const pick = optionPick(e);
  if (!pick)
    return;
  e.preventDefault();
  const [x, y] = [e.clientX, e.clientY];
  const [map, key] = pick;
  const el = e.target.closest(".c.option");
  const kind = el.dataset.kind;
  const resonator = el.dataset.resonator ?? "";
  const row = cellRun(el, resonator);
  const base = kind === "weapon" ? key.replace(/ R\d$/, "") : key;
  const tag = (name) => kind === "weapon" && row ? weaponTag(row.run.members[row.pos], row.run.combo[row.pos].sequence, name) : name;
  const ranked = kind === "weapon" && (filters.refines.includes(resonator) || filters.scoped.some((s) => s.resonator === resonator && s.axis === "refines"));
  const axis = kind === "weapon" ? "weapons" : "echoes";
  const word = kind === "weapon" ? "weapons" : "sonatas";
  const items = [
    // the pick's own filters lead, so "Show only" is the top line whatever else the cell offers
    { label: `Show only ${base}`, run: () => setFilter(map, tag(base), "include"), alt: () => setFilter(map, tag(base), "exclude") },
    { label: `Hide ${base}`, run: () => setFilter(map, tag(base), "exclude") },
    ...ranked ? [
      { label: `Show only ${key}`, run: () => setFilter(map, tag(key), "include"), alt: () => setFilter(map, tag(key), "exclude") },
      { label: `Hide ${key}`, run: () => setFilter(map, tag(key), "exclude") }
    ] : [],
    // the weapon's own refines compare, then the ranks it would open shown one at a time
    ...resonator && kind === "weapon" ? scopedItems(resonator, "weapon", base).flatMap((it) => it.axis === "refines" && row ? [it, ...rankItems(row.run, row.pos)] : [it]) : [],
    ...resonator && ranked ? scopedItems(resonator, "weaponRank", key) : [],
    ...resonator && kind === "echo" ? scopedItems(resonator, "echo", key) : [],
    // ...and last, the compares that opened this column, offered back as a way to close it
    ...filters[axis].includes(resonator) ? [{ label: `Stop comparing ${word}`, run: () => setCompare(resonator, axis) }] : [],
    // a refines compare left on from an old link can still be closed here
    ...kind === "weapon" && filters.refines.includes(resonator) ? [{ label: `Stop comparing ${AXIS_LABEL.refines.toLowerCase()}`, run: () => setCompare(resonator, "refines") }] : [],
    ...filters.scoped.filter((s) => s.resonator === resonator && s.axis === axis).map((s) => ({ label: `Stop comparing ${scopedLabel(s)} ${word}`, run: () => setScoped(s) }))
  ];
  showMenu(x, y, items);
};
document.addEventListener("click", openOptionMenu);
document.addEventListener("contextmenu", openOptionMenu);
var openStatMenu = (e) => {
  const el = e.target.closest(".c.option[data-stat]");
  if (!el)
    return;
  e.preventDefault();
  const [x, y] = [e.clientX, e.clientY];
  const axis = el.dataset.stat;
  const resonator = el.dataset.resonator ?? "";
  const word = axis === "mainstats" ? "mainstats" : "substats";
  const items = [
    ...filters[axis].includes(resonator) ? [{ label: `Stop comparing ${word}`, run: () => setCompare(resonator, axis) }] : [],
    ...filters.scoped.filter((s) => s.resonator === resonator && s.axis === axis).map((s) => ({ label: `Stop comparing ${scopedLabel(s)} ${word}`, run: () => setScoped(s) })),
    ...axis === "substats" && comparable(resonator, "mainstats") ? [{
      label: `${filters.mainstats.includes(resonator) ? "Stop comparing" : "Compare"} ${resonator} mainstats`,
      run: () => setCompare(resonator, "mainstats")
    }] : []
  ];
  showMenu(x, y, items);
};
document.addEventListener("click", openStatMenu);
document.addEventListener("contextmenu", openStatMenu);
var applySearchHit = (hit) => {
  if (hit.kind === "compare") {
    if (hit.resonator && hit.axis)
      setCompare(hit.resonator, hit.axis);
    return;
  }
  setFilter(hit.kind === "resonator" ? resonatorFilters : OPTION_FILTER_MAPS[hit.kind], hit.value, "include");
};
var searchPick = (e) => {
  const el = e.target.closest(".sresult");
  const kind = el?.dataset.kind;
  const value = el?.dataset.value;
  if (!kind || !value)
    return void 0;
  return { kind, value, axis: el.dataset.axis, resonator: el.dataset.resonator };
};
var takeSearchHit = (hit) => {
  const coarse2 = matchMedia("(pointer: coarse)").matches;
  clearSearch();
  if (!coarse2)
    focusAfterDraw = null;
  applySearchHit(hit);
  if (coarse2)
    document.querySelector("#optionSearch")?.blur();
  else
    focusSearch();
};
var addSearchHit = (e) => {
  const hit = searchPick(e);
  if (!hit)
    return;
  e.preventDefault();
  takeSearchHit(hit);
};
document.addEventListener("click", addSearchHit);
document.addEventListener("contextmenu", addSearchHit);
document.addEventListener("mousedown", (e) => {
  if (e.target.closest?.(".rchip"))
    e.preventDefault();
});
var removeChip = (e) => {
  const chip = e.target.closest(".rchip");
  if (!chip)
    return;
  e.preventDefault();
  const axis = chip.dataset.axis;
  if (axis) {
    setCompare(chip.dataset.resonator ?? "", axis);
    return;
  }
  const pin = chip.dataset.pin;
  if (pin) {
    togglePin(pin);
    return;
  }
  const scoped = chip.dataset.scoped;
  if (scoped) {
    const s = filters.scoped.find((x) => scopedKey(x) === scoped);
    if (s)
      setScoped(s);
    return;
  }
  const name = chip.dataset.resonator;
  const kind = chip.dataset.kind;
  const map = name ? resonatorFilters : kind ? OPTION_FILTER_MAPS[kind] : void 0;
  const key = name ?? chip.dataset.value;
  const was = map && key ? map.get(key) : void 0;
  if (!map || !key || was === void 0)
    return;
  withRowCap(() => {
    map.delete(key);
    return () => map.set(key, was);
  });
};
document.addEventListener("click", removeChip);
document.addEventListener("contextmenu", removeChip);
document.addEventListener("click", (e) => {
  if (!e.target.closest(".clearall"))
    return;
  if (!matchMedia("(pointer: coarse)").matches)
    focusAfterDraw = null;
  withRowCap(() => {
    const maps = [resonatorFilters, ...Object.values(OPTION_FILTER_MAPS)];
    const kept = maps.map((map) => [...map]);
    const compares2 = AXES.map((axis) => [...filters[axis]]);
    const scoped = [...filters.scoped];
    for (const map of maps)
      map.clear();
    for (const axis of AXES)
      filters[axis] = [];
    filters.scoped = [];
    return () => {
      maps.forEach((map, i) => {
        for (const [n, mode] of kept[i])
          map.set(n, mode);
      });
      AXES.forEach((axis, i) => {
        filters[axis] = compares2[i];
      });
      filters.scoped = scoped;
    };
  });
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".clearpins"))
    return;
  if (!matchMedia("(pointer: coarse)").matches)
    focusAfterDraw = null;
  withRowCap(() => {
    const pins = [...pinnedRows];
    pinnedRows.clear();
    return () => {
      for (const key of pins)
        pinnedRows.add(key);
    };
  }, redrawPins);
});
var chipSig = (el) => el.classList.contains("clearall") ? "clearall" : el.classList.contains("clearpins") ? "clearpins" : [el.dataset.axis, el.dataset.scoped, el.dataset.pin, el.dataset.kind, el.dataset.resonator, el.dataset.value].join("\0");
var focusAfterDraw;
var CHIP_RING = ".tcchips .rchip, .tcchips .clearall, .tcpins .rchip, .tcpins .clearpins";
var tabRing = () => {
  const search = document.querySelector("#optionSearch");
  return search ? [search, ...document.querySelectorAll(CHIP_RING)] : [];
};
document.addEventListener("keydown", (e) => {
  if (e.key !== "Tab")
    return;
  const el = e.target;
  if (el?.id === "optionSearch" && searchHits().length)
    return;
  const ring = tabRing();
  const at = el ? ring.indexOf(el) : -1;
  if (!ring.length || at < 0 && el !== document.body)
    return;
  e.preventDefault();
  ring[at < 0 ? e.shiftKey ? ring.length - 1 : 0 : (at + (e.shiftKey ? -1 : 1) + ring.length) % ring.length].focus();
});
document.addEventListener("keydown", (e) => {
  const step = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : 0;
  if (!step || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey)
    return;
  const ring = tabRing();
  if (!ring.length)
    return;
  const el = e.target;
  const at = el ? ring.indexOf(el) : -1;
  if (at === 0) {
    const vertical = e.key === "ArrowUp" || e.key === "ArrowDown";
    if (vertical && searchHits().length) {
      e.preventDefault();
      cycleSearch(step);
      return;
    }
    if (!vertical && el.value)
      return;
  }
  if (at < 0 && (el?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el?.tagName ?? "")))
    return;
  e.preventDefault();
  ring[at < 0 ? Math.min(1, ring.length - 1) : Math.min(Math.max(at + step, 0), ring.length - 1)].focus();
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== "Backspace" || e.ctrlKey || e.metaKey || e.altKey)
    return;
  const chip = e.target.closest(".rchip");
  if (!chip)
    return;
  e.preventDefault();
  const ring = tabRing();
  const next = ring[ring.indexOf(chip) + 1];
  focusAfterDraw = next?.classList.contains("rchip") ? chipSig(next) : null;
  chip.click();
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || e.ctrlKey || e.metaKey || e.altKey)
    return;
  const el = e.target;
  if (el && (["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(el.tagName) || el.isContentEditable))
    return;
  const search = document.querySelector("#optionSearch");
  if (!search)
    return;
  e.preventDefault();
  focusSearch();
});
document.addEventListener("keydown", (e) => {
  if (e.target.id !== "optionSearch")
    return;
  if (e.key === "Tab" && searchHits().length) {
    e.preventDefault();
    cycleSearch(e.shiftKey ? -1 : 1);
    return;
  }
  if (e.key !== "Enter")
    return;
  const hit = searchChoice();
  if (!hit)
    return;
  e.preventDefault();
  takeSearchHit(hit);
});

// dist/src/page/tutorial.js
var DONE_KEY = "wuwa.tutorialDone";
var STAGE_KEY = "wuwa.tutorialStage";
var done = false;
function dismissed() {
  if (done)
    return true;
  try {
    return localStorage.getItem(DONE_KEY) === "1";
  } catch {
    return false;
  }
}
var TEXT = [
  "Start Tutorial",
  "Switch between DPS and DPR mode",
  `Try ${CLICKING} on a resonator to show only their teams`,
  `${CLICK} that resonator again and compare their weapons`,
  "Search to add another resonator or comparison",
  `Try ${CLICKING} a filter bubble to remove it`,
  "Try viewing a team's rotation and loadout",
  "Hover over equipment to see its stats and buffs",
  `${CLICK} on a member's damage number to see their damage distribution and node leveling priority`,
  `${CLICK} on the team total for a loop to see its damage over time`,
  "Scroll down to read the rotation, buffs, and stats"
];
var DETAIL_STAGE = 7;
var HEAD = 14;
var shownNow = () => [...resonatorFilters].filter(([, mode]) => mode === "include").map(([name]) => name);
var comparedNow = () => [...filters.scoped.map(scopedKey), ...AXES.flatMap((axis) => filters[axis].map((name) => `${axis}|${name}`))];
var shownBefore = /* @__PURE__ */ new Set();
var comparedBefore = /* @__PURE__ */ new Set();
function baseline() {
  shownBefore = new Set(shownNow());
  comparedBefore = new Set(comparedNow());
}
function added(now, before) {
  for (const key of before)
    if (!now.includes(key))
      before.delete(key);
  return now.some((key) => !before.has(key));
}
var showing = () => added(shownNow(), shownBefore);
var comparing = () => added(comparedNow(), comparedBefore);
var atBasePage = () => AXES.every((axis) => filters[axis].length === 0) && !filters.scoped.length && [resonatorFilters, weaponFilters, echoFilters, sequenceFilters, refineFilters].every((m) => m.size === 0);
var firstChip = () => document.querySelector(".tcchips .rchip");
function substatsCell() {
  const row = [...document.querySelectorAll(".rtable.loadout .rtrow")].find((r) => r.querySelector(".c.lbl")?.textContent === "Substats");
  const cells = [...row?.children ?? []].filter((c) => !c.classList.contains("lbl"));
  return cells[2] ?? cells[cells.length - 1] ?? null;
}
function totalCell() {
  const rows = [...document.querySelectorAll(".rtable.dpr .rtrow:not(.rthead):not(.total)")];
  return (rows[2] ?? rows[rows.length - 1])?.querySelector(".c.tot[data-dist]") ?? null;
}
var loopCell = () => document.querySelector(`.rtable.dpr .rtrow.total [data-dist$="|3"]`);
function actionRow(n) {
  const rows = [...document.querySelectorAll(".rotation-block .grid .r")].filter((r) => !r.classList.contains("head") && !r.classList.contains("totalrow") && !r.closest(".parts") && !r.closest(".spill"));
  const row = rows[n] ?? rows[rows.length - 1];
  return row?.querySelector(".c.action") ?? row ?? null;
}
function scrolledFar() {
  const main = document.querySelector("main");
  const log = document.querySelector(".rotation-block .gridwrap");
  if (!main || !log)
    return false;
  const mainR = rect(main);
  return rect(log).top <= mainR.top + mainR.height * 0.3;
}
function restoreStage() {
  try {
    const n = Number(localStorage.getItem(STAGE_KEY));
    return Number.isInteger(n) && n >= 0 && n < TEXT.length ? n : 0;
  } catch {
    return 0;
  }
}
function setStage(n) {
  stage = n;
  try {
    localStorage.setItem(STAGE_KEY, String(n));
  } catch {
  }
}
var stage = restoreStage();
var started = false;
var layer = null;
var overlay = document.getElementById("loading");
var sawDps = false;
function settle() {
  if (stage === 1 && teamMode === "dps")
    sawDps = true;
  else if (stage === 1 && sawDps) {
    setStage(2);
    baseline();
  }
  if (stage === 2 && showing())
    setStage(3);
  else if (stage === 3 && !showing())
    setStage(2);
  if (stage === 3 && comparing())
    setStage(4);
  if (stage === 5 && !firstChip())
    setStage(4);
}
function build() {
  const el = document.createElement("div");
  el.className = "tut";
  el.innerHTML = `<svg class="tut-arrow" aria-hidden="true"><defs><marker id="tutHead" markerUnits="userSpaceOnUse" markerWidth="14" markerHeight="12" refX="0" refY="6" orient="auto"><path d="M0,0 L14,6 L0,12 Z"></path></marker></defs><path class="tut-path" marker-end="url(#tutHead)" d=""></path></svg><div class="tut-box" role="dialog" aria-label="Tutorial"><p></p><button type="button" class="tut-begin">${TEXT[0]}<span class="arrow">\u203A</span></button><div class="tut-buttons"><button type="button" class="tut-skip">Skip Tutorial</button></div></div>`;
  el.querySelector(".tut-begin").addEventListener("click", () => {
    sawDps = false;
    setStage(1);
    place();
  });
  el.querySelector(".tut-skip").addEventListener("click", () => {
    done = true;
    try {
      localStorage.setItem(DONE_KEY, "1");
    } catch {
    }
    hideTutorial();
  });
  return el;
}
function mark(anchor) {
  for (const el of document.querySelectorAll(".tut-target"))
    el.classList.remove("tut-target");
  anchor?.classList.add("tut-target");
}
function placeDetail(box, path, mainR) {
  const width = Math.max(240, Math.min(330, mainR.width - 24));
  box.style.width = `${width}px`;
  box.style.left = `${mainR.left + (mainR.width - width) / 2}px`;
  box.style.top = `8px`;
  const anchor = stage === DETAIL_STAGE ? substatsCell() : stage === DETAIL_STAGE + 1 ? totalCell() : stage === DETAIL_STAGE + 2 ? loopCell() : actionRow(19);
  mark(anchor);
  const anchorR = anchor ? rect(anchor) : null;
  if (!anchorR) {
    path.setAttribute("d", "");
    return;
  }
  const boxR = rect(box);
  const [bx2, by2] = [boxR.left + boxR.width / 2, boxR.bottom];
  const side = anchorR.left > mainR.right - 16 ? 1 : anchorR.right < mainR.left + 16 ? -1 : 0;
  if (side) {
    const tx2 = side > 0 ? mainR.right - 4 : mainR.left + 4;
    const ty2 = Math.min(Math.max(anchorR.top + anchorR.height / 2, by2 + 40), mainR.bottom - 20);
    const end = tx2 - side * HEAD;
    path.setAttribute("d", `M ${bx2} ${by2} C ${bx2} ${by2 + 60}, ${end - side * 60} ${ty2}, ${end} ${ty2}`);
    return;
  }
  if (stage === DETAIL_STAGE + 1 || stage === DETAIL_STAGE + 2) {
    const tx2 = anchorR.left - 4, ty2 = anchorR.top + anchorR.height / 2;
    path.setAttribute("d", `M ${bx2} ${by2} C ${bx2} ${by2 + 60}, ${tx2 - HEAD - 60} ${ty2}, ${tx2 - HEAD} ${ty2}`);
    return;
  }
  const tx = anchorR.left + anchorR.width / 2;
  const ty = Math.min(anchorR.top - 4, mainR.bottom - 4);
  const bend = Math.max(12, Math.min(70, (ty - HEAD - by2) * 0.5));
  path.setAttribute("d", `M ${bx2} ${by2} C ${bx2} ${by2 + bend}, ${tx} ${ty - HEAD - bend}, ${tx} ${ty - HEAD}`);
}
function place() {
  if (!layer || layer.hidden)
    return;
  settle();
  const box = layer.querySelector(".tut-box");
  const path = layer.querySelector(".tut-path");
  const main = document.querySelector("main");
  if (!main)
    return;
  const text = layer.querySelector("p");
  text.textContent = TEXT[stage];
  text.hidden = stage === 0;
  layer.querySelector(".tut-begin").hidden = stage !== 0;
  if (stage >= DETAIL_STAGE) {
    placeDetail(box, path, rect(main));
    return;
  }
  const layout = document.querySelector(".tclayout");
  const table = document.querySelector(".tcbody");
  const filterbar = document.querySelector(".tcfilters");
  const search = document.querySelector(".tcsearch");
  if (!layout || !table || !filterbar || !search)
    return;
  const stacked = layout.classList.contains("stack");
  const items = [...document.querySelector(".ctxmenu:not(.rowcap)")?.querySelectorAll(".ctxitem") ?? []];
  const compares2 = items.filter((item) => item.textContent?.startsWith("Compare"));
  const line = stage === 2 ? items[0] : compares2.find((item) => item.textContent?.includes("weapon")) ?? compares2[0];
  const headCell = document.querySelector(".tgrid .trow.thead .c");
  const below = headCell ? rect(headCell).bottom : rect(main).top;
  const already = new Set(shownNow());
  let first;
  let fresh;
  for (const row of document.querySelectorAll(".tgrid .trow[data-team]")) {
    const cells = [...row.querySelectorAll(".c.name.res")];
    const cell = cells[2] ?? cells[cells.length - 1];
    if (!cell || rect(cell).top < below - 1)
      continue;
    first ??= cell;
    const spare = already.has(cell.dataset.resonator ?? "") ? cells.find((c) => !already.has(c.dataset.resonator ?? "")) : cell;
    if (!spare)
      continue;
    fresh = spare;
    break;
  }
  const column = (stage === 2 ? fresh : void 0) ?? first;
  const chips = [...document.querySelectorAll(".tcchips .rchip")];
  const anchor = stage === 0 ? null : stage === 1 ? document.querySelector(".tgrid .c.dprhead") : stage === 4 ? search : stage === 5 ? stacked ? chips[chips.length - 1] : chips[0] : stage === 6 ? rowElementAt(0)?.querySelector(".gotodetail") : line ?? column;
  mark(anchor);
  const anchorR = anchor ? rect(anchor) : null;
  const mainR = rect(main), layoutR = rect(layout), tableR = rect(table), filterR = rect(filterbar);
  const aside = stage > 3 || stacked;
  const [from, to] = aside ? [filterR.left, filterR.right] : [layoutR.left, tableR.left];
  box.style.width = stage === 0 ? "max-content" : `${Math.max(240, Math.min(330, to - from - 40))}px`;
  const { width, height: boxH } = rect(box);
  const ideal = stage === 0 && !aside ? to - width - 20 : (from + to - width) / 2;
  const middle = Math.min(Math.max(ideal, mainR.left + 12), mainR.right - width - 12);
  box.style.left = `${stacked && stage === 6 ? mainR.left + 12 : middle}px`;
  const list = document.getElementById("searchResults");
  const listR = list?.childElementCount ? rect(list) : null;
  const under = stage === 4 && listR ? Math.max(filterR.bottom, listR.bottom) : filterR.bottom;
  const top = aside ? under + 16 : mainR.top + mainR.height * 0.2;
  const clear = stacked && stage < 4 && anchorR ? Math.min(top, anchorR.top - boxH - 40) : top;
  box.style.top = `${Math.min(Math.max(clear, mainR.top + 12), mainR.bottom - boxH - 12)}px`;
  if (!anchorR || anchorR.top > mainR.bottom || anchorR.bottom < mainR.top || anchorR.right < mainR.left || anchorR.left > mainR.right && stage !== 6) {
    path.setAttribute("d", "");
    return;
  }
  const boxR = rect(box);
  const by2 = boxR.top + boxR.height / 2;
  const bow = Math.min(100, boxR.left - mainR.left - 8);
  if (stage === 6 && !stacked) {
    const [tx2, ty2] = [anchorR.left + anchorR.width / 2, anchorR.bottom + 4];
    path.setAttribute("d", `M ${boxR.left} ${by2} C ${boxR.left - bow} ${by2}, ${tx2} ${ty2 + HEAD + 90}, ${tx2} ${ty2 + HEAD}`);
    return;
  }
  if (stage === 6 && stacked && anchorR.right <= mainR.right) {
    const [tx2, ty2] = [anchorR.left + anchorR.width / 2, anchorR.top - 4];
    path.setAttribute("d", `M ${boxR.right} ${by2} C ${boxR.right + 40} ${by2}, ${tx2} ${ty2 - HEAD - 40}, ${tx2} ${ty2 - HEAD}`);
    return;
  }
  if (stage === 6 && anchorR.right > mainR.right) {
    const [tx2, ty2] = [mainR.right - 14, anchorR.top + anchorR.height / 2];
    path.setAttribute("d", `M ${boxR.right} ${by2} C ${boxR.right + 30} ${by2}, ${tx2 - HEAD - 30} ${ty2}, ${tx2 - HEAD} ${ty2}`);
    return;
  }
  if (stage === 1 && !stacked) {
    const cx = boxR.left + boxR.width / 2;
    const [ax, ay] = [anchorR.left + anchorR.width / 2, anchorR.top - 4];
    const peak = Math.max(mainR.top + 8, ay - HEAD - 60);
    path.setAttribute("d", `M ${cx} ${boxR.top} C ${cx} ${peak}, ${ax} ${peak}, ${ax} ${ay - HEAD}`);
    return;
  }
  const [tx, ty] = [anchorR.left - 4, anchorR.top + anchorR.height / 2];
  if (stage === 4 || stage === 5) {
    const bx3 = boxR.left;
    if (!stacked) {
      path.setAttribute("d", tx - HEAD - bow >= mainR.left ? `M ${bx3} ${by2} C ${bx3 - bow} ${by2}, ${tx - HEAD - bow} ${ty}, ${tx - HEAD} ${ty}` : `M ${bx3} ${by2} C ${bx3 - bow} ${by2}, ${anchorR.left + anchorR.width / 2} ${ty + HEAD + 70}, ${anchorR.left + anchorR.width / 2} ${ty + HEAD}`);
      return;
    }
    const cx = boxR.left + boxR.width / 2;
    const [ax, ay] = [anchorR.left + anchorR.width / 2, anchorR.bottom + 4];
    const bend = Math.max(12, Math.min(70, (boxR.top - ay - HEAD) * 0.5));
    path.setAttribute("d", `M ${cx} ${boxR.top} C ${cx} ${boxR.top - bend}, ${ax} ${ay + HEAD + bend}, ${ax} ${ay + HEAD}`);
    return;
  }
  if (stacked && stage < 4) {
    const bx3 = boxR.left + boxR.width / 2;
    const [cx, cy] = [anchorR.left + anchorR.width / 2, anchorR.top - 4];
    const bend = Math.max(12, Math.min(70, (cy - HEAD - boxR.bottom) * 0.5));
    path.setAttribute("d", `M ${bx3} ${boxR.bottom} C ${bx3} ${boxR.bottom + bend}, ${cx} ${cy - HEAD - bend}, ${cx} ${cy - HEAD}`);
    return;
  }
  const bx2 = boxR.right, dx = tx - bx2;
  if (dx >= 80) {
    path.setAttribute("d", `M ${bx2} ${by2} C ${bx2 + dx * 0.5} ${by2}, ${tx - HEAD - dx * 0.5} ${ty}, ${tx - HEAD} ${ty}`);
    return;
  }
  if (ty > by2) {
    path.setAttribute("d", `M ${bx2} ${by2} C ${bx2 + 70} ${by2}, ${tx} ${ty - HEAD - 70}, ${tx} ${ty - HEAD}`);
    return;
  }
  const [ex, ey] = [tx - HEAD * 0.7, ty + HEAD * 0.7];
  path.setAttribute("d", `M ${bx2} ${by2} C ${bx2 + (ex - bx2) * 0.9} ${by2}, ${ex - 45} ${ey + 45}, ${ex} ${ey}`);
}
function maybeShowTutorial(force = false) {
  if (!overlay?.hidden)
    return;
  if (dismissed())
    return;
  if (!force && !started && stage === 0 && !atBasePage()) {
    hideTutorial();
    return;
  }
  const ready = stage >= DETAIL_STAGE ? document.querySelector(".rtable.loadout") : document.querySelector(".tgrid .trow[data-team]");
  if (!ready) {
    hideTutorial();
    return;
  }
  if (!layer) {
    layer = build();
    document.body.appendChild(layer);
    baseline();
  }
  layer.hidden = false;
  started = true;
  place();
}
function hideTutorial() {
  if (layer)
    layer.hidden = true;
  mark(null);
}
var typing;
document.addEventListener("click", (e) => {
  if (!layer || layer.hidden || stage !== 4 || typing !== void 0)
    return;
  if (!e.target.closest?.("#optionSearch"))
    return;
  const input = document.querySelector("#optionSearch");
  const cells = [...rowElementAt(0)?.querySelectorAll(".c.name.res") ?? []];
  const top = (cells[2] ?? cells[cells.length - 1])?.dataset.resonator;
  const shown = [top, ...[...document.querySelectorAll(".c.name.res")].map((c) => c.dataset.resonator)];
  const onScreen = new Set(visibleRows.flatMap((row) => row.members.map((m) => m.name)));
  const unseen = Object.values(TEAMS).flat().map((m) => m.name).find((n) => !onScreen.has(n) && !resonatorFilters.has(n));
  const name = unseen ?? shown.find((n) => n && !resonatorFilters.has(n)) ?? top;
  if (!input || input.value || !name)
    return;
  const text = name;
  let at = 0;
  const key = () => {
    input.value = text.slice(0, ++at);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    typing = at < text.length ? setTimeout(key, 50) : void 0;
  };
  typing = setTimeout(key, 50);
}, true);
function searchUsed() {
  if (!layer || layer.hidden || stage !== 4)
    return;
  setStage(5);
  place();
}
document.addEventListener("click", (e) => {
  if (e.target.closest?.(".sresult[data-value]"))
    searchUsed();
}, true);
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.id === "optionSearch" && searchChoice())
    searchUsed();
}, true);
document.addEventListener("click", (e) => {
  if (!layer || layer.hidden || stage !== 5)
    return;
  if (!e.target.closest?.(".tcchips .rchip, .tcchips .clearall"))
    return;
  setStage(6);
  place();
}, true);
document.addEventListener("click", (e) => {
  if (!layer || layer.hidden || stage !== 6)
    return;
  if (!e.target.closest?.(".gotodetail"))
    return;
  setStage(DETAIL_STAGE);
}, true);
var hoverTimer;
var hovered = (e) => e.target.closest?.(".rtable.loadout .c.has");
document.addEventListener("pointerover", (e) => {
  if (!layer || layer.hidden || stage !== DETAIL_STAGE || !hovered(e))
    return;
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => {
    setStage(DETAIL_STAGE + 1);
    place();
  }, 1e3);
}, true);
document.addEventListener("pointerout", (e) => {
  const from = hovered(e);
  if (!from || e.relatedTarget instanceof Element && e.relatedTarget.closest(".rtable.loadout .c.has") === from)
    return;
  clearTimeout(hoverTimer);
}, true);
document.addEventListener("click", (e) => {
  if (!layer || layer.hidden || stage !== DETAIL_STAGE || !hovered(e))
    return;
  clearTimeout(hoverTimer);
  setStage(DETAIL_STAGE + 1);
  place();
}, true);
document.addEventListener("click", (e) => {
  if (!layer || layer.hidden)
    return;
  const cell = e.target.closest?.(".dist-cell, [data-dist-row]");
  if (!cell)
    return;
  if (stage === DETAIL_STAGE + 1)
    setStage(DETAIL_STAGE + 2);
  else if (stage === DETAIL_STAGE + 2 && cell.closest(".rtrow.total"))
    setStage(DETAIL_STAGE + 3);
  else
    return;
  place();
}, true);
function finish() {
  done = true;
  try {
    localStorage.setItem(DONE_KEY, "1");
  } catch {
  }
  hideTutorial();
}
document.addEventListener("click", (e) => {
  if (!e.target.closest?.(".tutstart"))
    return;
  try {
    localStorage.removeItem(DONE_KEY);
  } catch {
  }
  done = false;
  sawDps = false;
  setStage(1);
  baseline();
  maybeShowTutorial(true);
}, true);
if (overlay) {
  new MutationObserver(() => {
    if (overlay.hidden)
      maybeShowTutorial();
    else
      hideTutorial();
  }).observe(overlay, { attributes: true, attributeFilter: ["hidden"] });
}
new MutationObserver(() => {
  if (layer && !layer.hidden)
    place();
}).observe(document.body, { childList: true });
var queued = false;
addEventListener("scroll", () => {
  if (!layer || layer.hidden || queued)
    return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    if (stage === DETAIL_STAGE + 3 && scrolledFar()) {
      finish();
      return;
    }
    place();
    requestAnimationFrame(place);
  });
}, true);
var remeasure = () => {
  if (layer && !layer.hidden)
    requestAnimationFrame(place);
};
document.addEventListener("input", remeasure, true);
document.addEventListener("click", remeasure, true);
document.addEventListener("focusout", remeasure, true);
addEventListener("resize", () => {
  if (!layer || layer.hidden)
    return;
  place();
  requestAnimationFrame(place);
});

export {
  esc,
  lazyPop,
  zoom,
  rect,
  copyBlock,
  clearPops,
  popover,
  hitsPopover,
  infoPopover,
  framesPopover,
  buffsPopover,
  equippedGear,
  loadoutTable,
  dprTable,
  drivePanel,
  dropPanel,
  holdPanels,
  panelOpenOn,
  wireSourcePanels,
  wireDistribution,
  HOLD,
  swallowClick,
  watchTouch,
  grabDot,
  makeDot,
  onRefresh,
  rowCapWarning,
  showMenu,
  teamFigure,
  personalFigure,
  pctTrunc,
  rememberTableScroll,
  renderComparison,
  maybeShowTutorial
};
