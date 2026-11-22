import {
  HOLD,
  buffsPopover,
  cachedGains,
  clearPops,
  copyBlock,
  distributionTable,
  dprTable,
  drivePanel,
  dropPanel,
  equippedGear,
  esc,
  framesPopover,
  grabDot,
  hitsPopover,
  holdPanels,
  infoPopover,
  lazyPop,
  loadoutTable,
  makeDot,
  maybeShowTutorial,
  panelOpenOn,
  pctTrunc,
  personalFigure,
  popover,
  rect,
  rememberTableScroll,
  rowCapWarning,
  showMenu,
  substatGains,
  substatValueTable,
  swallowClick,
  teamFigure,
  watchTouch,
  wireDistribution,
  wireSourcePanels,
  zoom
} from "./chunk-NCL6WAZD.js";
import {
  FALLBACK_HUE,
  GROUPED_COLUMNS,
  PAD_DIGITS_COLUMNS,
  RATE_SECTIONS,
  ROW_CAP,
  TEAMS,
  admitBuild,
  admitTeam,
  applyHash,
  barReset,
  buildReport,
  cancelQueued,
  detailFor,
  digitsOf,
  discardRestoredSolves,
  echoLabelHtml,
  ensureBestPicks,
  filters,
  fmt,
  fmtPct,
  fmtPctCell,
  gearShut,
  hashTeam,
  iconOf,
  loadSolves,
  overlayHide,
  overlayNow,
  overlayPhase,
  pageUrl,
  paint,
  picksOfKey,
  prospectiveRows,
  pruneGearFilters,
  reopenDetail,
  results,
  routeTeam,
  rowFromKey,
  saveSolves,
  showError,
  snapshotFilters,
  solveQuiet,
  solvedRows,
  syncHash,
  tagFilters,
  tagTeam,
  weaponHue,
  workerPool
} from "./chunk-DU4TDG6K.js";
import {
  ActionTag,
  CONCERTO_UNIT,
  ENEMY_MAX_OFFTUNE,
  ENERGY_UNIT,
  ER_TOLERANCE,
  RESOURCE_NAME,
  SCALING_NAME,
  TUNE_BREAK_ENEMY,
  comboOf,
  compares,
  echoPicks,
  erRollsFor,
  gateOf,
  hitsOf,
  loadoutName,
  mainstatRanking,
  menuStats,
  runTeam,
  scopedOpen,
  sequenceLevels,
  statLabel,
  weaponBase
} from "./chunk-RLABIZFI.js";

// dist/src/page/pickmenu.js
var FIELDS = ["weapon", "echo", "mainstat", "sequence", "refine", "highSubs"];
var picksOf = (run) => picksOfKey(`${run.teamKey}-${run.combo.map((c) => c.key).join("-")}`);
var switchTo = async () => {
};
var onSwitch = (fn) => {
  switchTo = fn;
};
var solveQuiet2 = async () => {
};
var onSolve = (fn) => {
  solveQuiet2 = fn;
};
function choices(run, i, kind) {
  const m = run.members[i], l = m.loadout;
  const cur = picksOf(run)[i];
  const choice = (label, axis, pick, is, free) => ({ label, axis, pick, is, free, current: is(cur) });
  const regear = ["echo", "mainstat"];
  if (kind === "sequences") {
    return sequenceLevels(m, { ...filters, sequences: [...filters.sequences, m.name] }).map((n) => choice(loadoutName(l, n), "sequences", { ...cur, sequence: n }, (p) => p.sequence === n, regear));
  }
  if (kind === "weapons") {
    const ranks = l.refinements[cur.weapon];
    return [
      ...l.weapons.map((w, k) => choice(weaponBase(w), "weapons", { ...cur, weapon: k, refine: Math.min(cur.refine, l.refinements[k].length - 1) }, (p) => p.weapon === k, regear)),
      // the worn weapon's other ranks, by their own names ("Discord R2")
      ...ranks.length > 1 ? ranks.map((w, r) => choice(w.name, "refines", { ...cur, refine: r }, (p) => p.weapon === cur.weapon && p.refine === r, regear)) : []
    ];
  }
  if (kind === "sonata" || kind === "mainslot") {
    const setsOf = (e) => l.echoLoadouts[e].sets.map((g) => g.name).join(" + ");
    const slotOf = (e) => l.echoLoadouts[e].mainslot.name;
    const [labelOf, otherOf] = kind === "sonata" ? [setsOf, slotOf] : [slotOf, setsOf];
    const echoes = echoPicks(m, run.members);
    return [...new Set(echoes.map(labelOf))].map((label) => {
      const wearing = echoes.filter((e) => labelOf(e) === label);
      const held = wearing.find((e) => otherOf(e) === otherOf(cur.echo));
      return choice(label, "echoes", { ...cur, echo: held ?? wearing[0] }, (p) => labelOf(p.echo) === label, held === void 0 ? regear : ["mainstat"]);
    });
  }
  if (kind === "mainstats") {
    return mainstatRanking(run.teamKey, run.members, picksOf(run), i).map(({ mainstat: k, run: ranked }) => ({ ...choice(l.mainstats[k].name, "mainstats", { ...cur, mainstat: k }, (p) => p.mainstat === k, []), run: ranked }));
  }
  return [false, true].map((h) => {
    const combo = run.combo.map((c, j) => j === i ? comboOf(l, { ...cur, highSubs: h }) : c);
    const name = l.spread(h, erRollsFor(run.teamKey, run.members, combo)[i]).name;
    return choice(name, "substats", { ...cur, highSubs: h }, (p) => p.highSubs === h, regear);
  });
}
function canPick(run, i, kind) {
  if (kind === "mainstats")
    return run.members[i].loadout.mainstats.length > 1;
  return choices(run, i, kind).length > 1;
}
function closest(rows, cur, i, c) {
  let best = null;
  let score = [];
  for (const row of rows) {
    const picks = picksOfKey(row.key);
    const off = picks.reduce((n, p, j) => n + FIELDS.filter((f) => j === i ? !c.free.includes(f) && p[f] !== c.pick[f] : p[f] !== cur[j][f]).length, 0);
    const s = [Number(!c.is(picks[i])), off, -teamFigure(results.get(row.key))];
    const at = s.findIndex((v, k) => v !== score[k]);
    if (!best || at >= 0 && s[at] < score[at]) {
      best = row;
      score = s;
    }
  }
  return best;
}
function opened(m, axis, gate, from = filters) {
  const f = structuredClone(from);
  if (compares(m, f, axis, gate))
    return f;
  if (axis === "refines")
    f.scoped.push({ resonator: m.name, on: "weapon", value: weaponBase(gate.weapon), axis: "refines" });
  else
    f[axis].push(m.name);
  return f;
}
function shutCompare(m, axis, gate) {
  for (const a of axis === "weapons" ? ["weapons", "refines"] : [axis])
    filters[a] = filters[a].filter((n) => n !== m.name);
  filters.scoped = filters.scoped.filter((s) => s.resonator !== m.name || s.axis !== axis || !scopedOpen(m, { ...filters, scoped: [s] }, axis, gate));
  pruneGearFilters();
}
function take(run, i, c) {
  const m = run.members[i];
  const cur = picksOf(run);
  const gate = gateOf(m.loadout, c.pick);
  const undo = snapshotFilters();
  const admit = () => {
    admitTeam(run.teamKey);
    admitBuild(run.members, cur.map((p, j) => comboOf(run.members[j].loadout, j === i ? c.pick : p)));
    return prospectiveRows();
  };
  const shut = {
    setUp: () => {
      undo();
      shutCompare(m, c.axis, gate);
      return admit() <= ROW_CAP;
    },
    choose: (rows) => {
      const row = closest(rows, cur, i, c);
      return row && c.is(picksOfKey(row.key)[i]) ? row : null;
    }
  };
  const open = {
    setUp: () => {
      undo();
      Object.assign(filters, opened(m, c.axis, gate));
      const total = admit();
      rowCapWarning(total > ROW_CAP ? total : null);
      return total <= ROW_CAP;
    },
    choose: (rows) => closest(rows, cur, i, c)
  };
  void switchTo(run.teamKey, [shut, open], undo);
}
var LOOK = [
  "font-family",
  "font-size",
  "font-weight",
  "font-variant-numeric",
  "line-height",
  "letter-spacing",
  "text-transform",
  "text-align",
  "white-space",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "border-top-width",
  "border-top-style",
  "border-top-color"
];
function ratios(m, owns) {
  const l = m.loadout, axis = owns[0]?.[0].axis;
  const low = Math.min(...owns.map(([c]) => c.pick.sequence));
  const ranked = owns.some(([c]) => c.axis === "refines");
  const keep = axis === "weapons" ? (c) => l.weapons[c.pick.weapon].tier !== 0 && (!ranked || c.pick.refine === 0) : axis === "refines" ? (c) => c.pick.refine === 0 : axis === "sequences" ? (c) => c.pick.sequence === low : axis === "substats" ? (c) => !c.pick.highSubs : () => true;
  const pool = owns.filter(([c]) => keep(c)).map(([, v]) => v);
  const base = pool.length ? Math.max(...pool) : Math.min(...owns.map(([, v]) => v));
  return base > 0 ? owns.map(([c, v]) => [c, v / base]) : [];
}
async function showRatios(run, i, list, boxes, cell2) {
  const m = run.members[i];
  const cur = picksOf(run);
  const gate = gateOf(m.loadout, cur[i]);
  const axes = [...new Set(list.map((c) => c.axis))];
  const groups = axes.includes("refines") ? [axes] : axes.map((a) => [a]);
  for (const group of groups) {
    const axis = group[0];
    const own = list.filter((c) => group.includes(c.axis));
    let owns;
    if (axis === "mainstats")
      owns = own.map((c) => [c, personalFigure(c.run, m.name)]);
    else {
      const f = group.reduce((at, a) => opened(m, a, gate, at), filters);
      await solveQuiet2(run.teamKey, f);
      const rows = solvedRows(run.teamKey, f);
      owns = own.flatMap((c) => {
        const row = closest(rows, cur, i, c);
        return row && c.is(picksOfKey(row.key)[i]) ? [[c, personalFigure(results.get(row.key), m.name)]] : [];
      });
    }
    if (!cell2.classList.contains("picking"))
      return;
    for (const [c, ratio] of ratios(m, owns)) {
      const box = c.current ? c.axis === axes[0] ? cell2 : void 0 : boxes.get(c);
      if (!box)
        continue;
      const tag = box.appendChild(document.createElement("span"));
      tag.className = "pickpct";
      tag.textContent = pctTrunc(ratio);
      scrollIfCut(box, tag);
    }
  }
}
function scrollIfCut(box, tag) {
  const name = document.createElement("span");
  name.className = "pickname";
  for (const node of [...box.childNodes])
    if (node !== tag)
      name.appendChild(node);
  box.insertBefore(name, tag);
  const cs = getComputedStyle(box);
  const room = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - tag.offsetWidth;
  const over = name.scrollWidth - room;
  if (over <= 0)
    return;
  name.style.setProperty("--shift", `${-over}px`);
  name.style.setProperty("--dur", `${Math.max(1.5, over / 30) / 0.6}s`);
  name.classList.add("scrolls");
}
function dressAs(menu, cell2) {
  const cs = getComputedStyle(cell2);
  let ground = "";
  for (let at = cell2; at && !ground; at = at.parentElement) {
    const bg = getComputedStyle(at).backgroundColor;
    if (bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent")
      ground = bg;
  }
  const look = LOOK.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(";");
  const r = cell2.getBoundingClientRect();
  menu.classList.add("pickdrop");
  menu.style.setProperty("--pickground", ground);
  cell2.style.setProperty("--pickground", ground);
  menu.style.left = `${r.left}px`;
  menu.style.width = `${r.width}px`;
  for (const box of menu.querySelectorAll(".ctxitem")) {
    box.style.cssText += `;${look};color:${cs.color};background-color:${ground};box-shadow:${cs.boxShadow}`;
    if (box.scrollWidth > box.clientWidth)
      box.title = box.textContent ?? "";
  }
}
var openPickMenu = (e) => {
  const el = e.target.closest(".rtable.loadout .c[data-pick]");
  const key = el ? routeTeam() : null;
  const run = key ? results.get(key) : void 0;
  if (!el || !run)
    return;
  e.preventDefault();
  if (reopened === el)
    return;
  openCell = el;
  const i = Number(el.dataset.slot);
  const list = choices(run, i, el.dataset.pick);
  const offered = list.filter((c) => !c.current);
  const items = offered.map((c) => ({ label: c.label, run: () => take(run, i, c) }));
  const r = el.getBoundingClientRect();
  dropPanel();
  holdPanels(true);
  const box = document.body.appendChild(document.createElement("div"));
  box.className = "pickbox";
  const frame = (at) => {
    const b = at.getBoundingClientRect();
    box.style.cssText = `left:${b.left}px;top:${b.top}px;width:${b.width}px;height:${b.height}px`;
  };
  frame(el);
  el.classList.add("picking");
  const menu = showMenu(r.left, r.bottom - 1, items, () => {
    holdPanels(false);
    box.remove();
    el.classList.remove("picking");
    openCell = null;
    el.querySelector(".pickpct")?.remove();
    const name = el.querySelector(".pickname");
    if (name)
      name.replaceWith(...name.childNodes);
    el.style.removeProperty("--pickground");
  });
  dressAs(menu, el);
  const boxes = new Map(offered.map((c, n) => [c, menu.querySelectorAll(".ctxitem")[n]]));
  const l = run.members[i].loadout;
  for (const [c, b] of boxes) {
    if (c.axis === "echoes")
      b.innerHTML = echoLabelHtml(b.textContent ?? "", esc);
    if (c.axis !== "weapons" && c.axis !== "refines")
      continue;
    const w = l.refinements[c.pick.weapon][c.pick.refine];
    b.style.color = weaponHue(w);
    b.insertAdjacentHTML("afterbegin", iconOf(w));
  }
  void showRatios(run, i, list, boxes, el);
  menu.addEventListener("mouseover", (ev) => frame(ev.target.closest(".ctxitem") ?? el));
  menu.addEventListener("mouseleave", () => frame(el));
};
var openCell = null;
var reopened = null;
for (const type of ["click", "contextmenu"]) {
  addEventListener(type, (e) => {
    reopened = openCell?.contains(e.target) ? openCell : null;
  }, true);
}
document.addEventListener("click", openPickMenu);
document.addEventListener("contextmenu", openPickMenu);

// dist/src/page/detail.js
var app = document.getElementById("app");
var topbar = document.getElementById("topbar");
var BUFF_UNDERLINE_COLUMNS = /* @__PURE__ */ new Set(["mv", "energy", "concerto", "offtune"]);
var RUNNING_COLUMNS = /* @__PURE__ */ new Set(["concerto", "energy", "offtune"]);
var isRunning = (key) => RUNNING_COLUMNS.has(key) || key.startsWith("gauge:");
var colWidth = (c) => {
  const num = c.align === "left" ? 0 : 1, p = c.pad ?? { cw: 0, cpad: 0, npad: 0 };
  return `calc(var(--cw) * ${(c.width ?? 0) + p.cw} + var(--cpad) * ${1 + p.cpad} + var(--npad) * ${num + p.npad})`;
};
function cell(col, { cls = [], html = "", pop = "", style = "", attr = "" } = {}) {
  const classes = ["c", col.align === "left" ? "" : "num", ...cls].filter(Boolean).join(" ");
  return `<span class="${classes}"${style ? ` style="${style}"` : ""}${attr}${pop}>${html}</span>`;
}
var TAG_KIND = {
  [ActionTag.InstaCancel]: "insta",
  [ActionTag.InstaDodge]: "insta",
  [ActionTag.InstaJump]: "insta",
  [ActionTag.InstaSwap]: "insta",
  [ActionTag.SwapCancel]: "swap",
  [ActionTag.MashSwap]: "swap",
  [ActionTag.MashCancel]: "easy",
  [ActionTag.HoldCancel]: "easy",
  [ActionTag.OffField]: "field",
  [ActionTag.DodgeCancel]: "dash",
  [ActionTag.JumpCancel]: "jump",
  [ActionTag.Cancel]: "cancel",
  [ActionTag.HitCancel]: "hit",
  [ActionTag.DodgeOnHit]: "hit",
  [ActionTag.JumpOnHit]: "hit",
  [ActionTag.TimedCancel]: "timed"
};
var TAG_NOTE = {
  [ActionTag.InstaCancel]: "After casting, input the next action instantly",
  [ActionTag.InstaDodge]: "After casting, dodge instantly",
  [ActionTag.InstaJump]: "After casting, jump instantly",
  [ActionTag.InstaSwap]: "After casting, swap instantly",
  [ActionTag.Cancel]: "After the final hit, input the next action to cancel endlag",
  [ActionTag.DodgeCancel]: "After the final hit, dodge to cancel endlag",
  [ActionTag.JumpCancel]: "After the final hit, jump to cancel endlag",
  [ActionTag.SwapCancel]: "After the final hit, swap to cancel endlag",
  [ActionTag.MashSwap]: "After casting, mash swap to swap out the moment it allows",
  [ActionTag.MashCancel]: "After casting, mash the next input to cancel when available",
  [ActionTag.HoldCancel]: "After casting, hold the next input to cancel when available",
  [ActionTag.HitCancel]: "After the first hit, input the next action",
  [ActionTag.DodgeOnHit]: "After the first hit, dodge",
  [ActionTag.JumpOnHit]: "After the first hit, jump",
  [ActionTag.TimedCancel]: "Input the next action on the frame shown"
};
function stepRow(columns, row, slotHue, gearByMember, { part = false, caret = true, bars = null } = {}) {
  const snap = "line" in row ? row.line.snap : row.snap;
  const aggregate = "line" in row && !!row.line.aggregate;
  return columns.map((col) => {
    if (!bars || aggregate || !(col.key === FORTE_KEY || RUNNING_COLUMNS.has(col.key))) {
      return cell(col, cellParts(col, row, slotHue, gearByMember, part, caret));
    }
    if (col.key !== FORTE_KEY) {
      const p = cellParts(col, row, slotHue, gearByMember, part, caret);
      const cap = col.key === "energy" ? bars.energyCap.get(snap.member) ?? 0 : col.key === "concerto" ? CONCERTO_CAP : OFFTUNE_CAP;
      return cell(col, { cls: ["barcell"], attr: p.attr, pop: p.pop, html: barHtml([{ color: BAR_COLOR[col.key], fill: Number(row.raw[col.key]) / cap, text: p.html, cls: p.cls }]) });
    }
    const hue = slotHue.get(snap.member) ?? FALLBACK_HUE;
    const gauges = bars.forte.get(snap.member) ?? [];
    return cell(col, { cls: ["barcell"], html: barHtml(gauges.map(({ key, cap }) => {
      const name = key.slice("gauge:".length);
      const p = cellParts({ ...bars.gauge, key, label: name, full: name }, row, slotHue, gearByMember, part, caret);
      return { color: hue, fill: Number(row.raw[key]) / cap, text: p.html, cls: p.cls, pop: p.pop };
    })) });
  }).join("");
}
function cellParts(col, row, slotHue, gearByMember, part, caret) {
  {
    const v = row.raw[col.key];
    const sources = row.sources[col.key];
    let attr = "";
    if (isRunning(col.key)) {
      if ("line" in row && row.line.aggregate)
        return { cls: [], html: "", pop: "", style: "", attr: "" };
      const act = ("line" in row ? row.line.snap : row.snap).action, cast = act.cast;
      const spend = col.key === "offtune" ? cast === 8 && act.castOfftune < 0 : col.key === "energy" ? act.castEnergy < 0 : col.key === "concerto" && cast === 6;
      const before = Number(row.raw[`before:${col.key}`]) || 0;
      if (!spend)
        attr = ` data-val="${Number(v) || 0}" data-before="${before}"`;
      if (!spend && col.key === "energy")
        attr += ` data-gen="${Number(row.raw["gen:energy"]) || 0}"`;
      const fed = (sources ?? []).some((r) => !RATE_SECTIONS.has(r.section ?? ""));
      const moved2 = (raw) => Math.abs((Number(raw[col.key]) || 0) - (Number(raw[`before:${col.key}`]) || 0)) >= 1e-9;
      const blank = "parts" in row && row.parts.length ? !row.parts.some((p) => moved2(p.raw) || (p.sources[col.key] ?? []).some((r) => !RATE_SECTIONS.has(r.section ?? ""))) : !fed && !moved2(row.raw);
      if (blank)
        return { cls: [], html: "", pop: "", style: "", attr };
    }
    const cls = [];
    if (col.key === "action")
      cls.push(part ? "name" : "action");
    if (col.key === "avg")
      cls.push("avg");
    if (col.key === "member")
      cls.push("member");
    if (BUFF_UNDERLINE_COLUMNS.has(col.key) && row.buffed.has(col.key))
      cls.push("buffed");
    if (col.key.startsWith("gauge:") && Number(row.raw[`clear:${col.key}`]))
      cls.push("buffed");
    if (isRunning(col.key) && Number(row.raw[`short:${col.key}`]))
      cls.push("negative");
    if (col.key === "action" && row.raw["short:buff"])
      cls.push("negative");
    const text = col.percent && typeof v === "number" ? `${fmtPctCell(v, col.key, PAD_DIGITS_COLUMNS.has(col.key))}%` : esc(fmt(v, digitsOf(row.raw, col), PAD_DIGITS_COLUMNS.has(col.key), GROUPED_COLUMNS.has(col.key)));
    let html = sources && text ? `<span class="has">${text}</span>` : text;
    if (col.key === "action" && caret && !part && "parts" in row && row.parts.length) {
      html = `${html}<span class="caret">\u25B8</span>`;
    }
    const tag = col.key === "action" ? String(row.raw["tag:action"] ?? "") : "";
    if (tag) {
      const own = tag.startsWith("cancel @ ") ? ActionTag.TimedCancel : tag;
      const kind = TAG_KIND[own] ?? "cancel", note = TAG_NOTE[own];
      const tagPop = note ? lazyPop(`<span class="pop note">${esc(note)}</span>`) : "";
      html = `<span class="ctag ctag-${kind}"${tagPop}>${esc(tag.toUpperCase())}</span>${html}`;
    }
    const suffix = col.key === "mv" && row.scaling !== null ? ` ${SCALING_NAME[row.scaling]}` : "";
    let pop = "";
    if (col.key === "action") {
      const group = "parts" in row && row.parts.length > 0;
      pop = group ? "" : infoPopover(row.info, slotHue);
    } else if (col.key === "time") {
      const snaps = "line" in row ? row.line.members?.length ? row.line.members : [row.line.snap] : [row.snap];
      pop = framesPopover(snaps);
    } else if (col.key === "member") {
      const snap = "line" in row ? row.line.snap : row.snap;
      const gear = gearByMember.get(snap.member) ?? [];
      pop = buffsPopover(snap.member, gear, snap.heldLocal, snap.heldGlobal, snap.heldEnemy, slotHue);
    } else if (col.key === "avg") {
      pop = text ? hitsPopover(row.hits) : "";
    } else if (text) {
      pop = popover(col, sources, row.raw[`moved:${col.key}`] ?? v, slotHue, suffix, String(row.raw[`empty:${col.key}`] ?? ""));
    }
    const mem = col.key === "member" ? rowHue("line" in row ? row.line.snap : row.snap, slotHue) : slotHue.get(String(v)) ?? FALLBACK_HUE;
    const style = col.key === "member" ? `--mem:${mem};color:${mem}` : col.key === "avg" ? `--mem:${slotHue.get(String(row.raw["member"] ?? "")) ?? FALLBACK_HUE}` : "";
    if (col.key === "avg" && typeof v === "number")
      attr = ` data-avg="${v}"`;
    if (col.key === "time") {
      const snaps = "line" in row ? row.line.members?.length ? row.line.members : [row.line.snap] : [row.snap];
      const frames = snaps.reduce((n, s) => n + (s.active ? s.frames : 0) + (s.swapFrames ?? 0), 0);
      attr = ` data-frames="${frames}"`;
    }
    return { cls, html, pop, style, attr };
  }
}
var FORTE_KEY = "forte";
var GAUGE_KEYS = [
  3,
  4,
  5,
  6,
  7
  /* Resource.Forte5 */
].map((r) => `gauge:${RESOURCE_NAME[r]}`);
var BAR_COLOR = { concerto: "#ffffff", energy: "#f5c542", offtune: "#c4c7cc" };
var CONCERTO_CAP = 1e4 / CONCERTO_UNIT;
var OFFTUNE_CAP = ENEMY_MAX_OFFTUNE / 1e4;
function forteUse(report) {
  const seen = /* @__PURE__ */ new Map();
  const read = (snap, raw) => {
    const m = seen.get(snap.member) ?? { caps: [0, 0, 0, 0, 0], peak: [0, 0, 0, 0, 0] };
    seen.set(snap.member, m);
    GAUGE_KEYS.forEach((key, i) => {
      if (snap.maxForte[i])
        m.caps[i] = snap.maxForte[i] * snap.forteScale[i];
      m.peak[i] = Math.max(m.peak[i], Math.abs(Number(raw[key]) || 0));
    });
  };
  for (const row of report.rows) {
    if (row.line.aggregate)
      continue;
    read(row.line.snap, row.raw);
    for (const p of row.parts)
      read(p.snap, p.raw);
  }
  const out = /* @__PURE__ */ new Map();
  for (const [member, { caps, peak }] of seen) {
    const used = GAUGE_KEYS.flatMap((key, i) => caps[i] || peak[i] > 1e-9 ? [{ key, cap: caps[i] || peak[i] }] : []);
    if (used.length)
      out.set(member, used);
  }
  return out;
}
var barHtml = (bars) => `<span class="rbars">${bars.map((b) => `<span class="rbar${b.text ? "" : " empty"}" style="--bar:${b.color};--fill:${Math.max(0, Math.min(1, b.fill || 0))}"${b.pop ?? ""}><span class="rfill"></span><span class="rtext${b.cls.length ? ` ${b.cls.join(" ")}` : ""}">${b.text}</span></span>`).join("")}</span>`;
var rowHue = (snap, slotHue) => snap.slot === TUNE_BREAK_ENEMY.name ? TUNE_BREAK_ENEMY.color : slotHue.get(snap.member) ?? FALLBACK_HUE;
function partRows(columns, parts, slotHue, gearByMember, fieldOf, bars) {
  return parts.map((p) => {
    const hue = rowHue(p.snap, slotHue);
    const field = fieldOf.get(p.snap);
    const mark = field === void 0 ? "" : ` data-fh="${field}"`;
    return `<div class="r${p.short ? " short" : ""}" style="--m:${hue}"${mark}>${stepRow(columns, p, slotHue, gearByMember, { part: true, bars })}</div>`;
  }).join("");
}
var loopBar = (columns, n) => `<div class="step loopbar" aria-hidden="true"><div class="r short loop">` + columns.map((c) => cell(c, { cls: c.key === "action" ? ["action"] : [], html: c.key === "action" ? `LOOP ${n}` : "" })).join("") + `</div></div>`;
function rotationTable(report, slotHue, gearByMember, starts, bars) {
  const columns = report.columns;
  const cols = columns.map(colWidth).join(" ");
  const head = columns.map((c) => cell(c, { html: esc(c.label), cls: RESOURCE_COLUMN(c.key) || c.key === FORTE_KEY ? ["rhead"] : [] })).join("");
  const fieldIds = /* @__PURE__ */ new Map();
  const fieldId = (key) => {
    const seen = fieldIds.get(key);
    if (seen !== void 0)
      return seen;
    fieldIds.set(key, fieldIds.size);
    return fieldIds.size - 1;
  };
  const fieldOf = /* @__PURE__ */ new Map();
  for (const row of report.rows) {
    const line = row.line;
    if (line.fieldKey === void 0 || line.aggregate)
      continue;
    const id = fieldId(line.fieldKey);
    for (const snap of hitsOf(line))
      fieldOf.set(snap, id);
  }
  const out = [];
  let spilling = false;
  const closeBlock = () => {
    if (spilling) {
      out.push("</div></div>");
      spilling = false;
    }
  };
  report.rows.forEach((row, i) => {
    const loop = starts.get(i);
    if (loop !== void 0) {
      closeBlock();
      out.push(loopBar(columns, loop));
    }
    const snap = row.line.snap;
    const hue = rowHue(snap, slotHue);
    const style = ` style="--m:${hue}"`;
    const cells = stepRow(columns, row, slotHue, gearByMember, { bars });
    const shortCls = row.short ? " short" : "";
    const key = row.line.fieldKey;
    const mark = key === void 0 || row.line.aggregate ? "" : ` data-fh="${fieldId(key)}"`;
    if (row.line.aggregate) {
      closeBlock();
      const id2 = `fg${fieldId(key)}`;
      out.push(`<div class="step chain"${style}><input class="tgl" type="checkbox" id="${id2}"><label class="r${shortCls}" for="${id2}">${cells}</label></div>`);
      return;
    }
    if (row.line.spill && spilling) {
      if (row.parts.length) {
        const id2 = `x${i}`;
        out.push(`<div class="chain"${style}${mark}><input class="tgl" type="checkbox" id="${id2}"><label class="r${shortCls}" for="${id2}">${cells}</label><div class="parts">${partRows(columns, row.parts, slotHue, gearByMember, fieldOf, bars)}</div></div>`);
        return;
      }
      out.push(`<div class="r${shortCls}"${style}${mark}>${stepRow(columns, row, slotHue, gearByMember, { caret: false, bars })}</div>`);
      return;
    }
    closeBlock();
    if (!row.parts.length) {
      out.push(`<div class="step"${style}${mark}><div class="r${shortCls}">${cells}</div></div>`);
      return;
    }
    const id = `x${i}`;
    out.push(`<div class="step chain"${style}${mark}><input class="tgl" type="checkbox" id="${id}"><label class="r${shortCls}" for="${id}">${cells}</label><div class="parts">${partRows(columns, row.parts, slotHue, gearByMember, fieldOf, bars)}</div><div class="spill">`);
    spilling = true;
  });
  closeBlock();
  const fieldRules = [...fieldIds.values()].map((n) => `.grid:has(#fg${n}:checked) .step[data-fh="${n}"]{display:block}.grid:has(#fg${n}:checked) .r[data-fh="${n}"]{display:grid}`).join("");
  const totalRow = columns.map((c) => cell(c)).join("");
  return `<div class="gridwrap">${fieldRules ? `<style>${fieldRules}</style>` : ""}<div class="grid" style="--cols:${cols}">
    <div class="r head">${head}</div>
    ${out.join("")}
    <div class="r totalrow">${totalRow}</div>
  </div></div>`;
}
function energyRequirements(run) {
  const { needs } = detailFor(run);
  const erOf = erRollsFor(run.teamKey, run.members, run.combo);
  const cells = /* @__PURE__ */ new Map();
  run.members.forEach((m, idx) => {
    const own = /* @__PURE__ */ new Map();
    cells.set(m.name, own);
    const combo = run.combo[idx];
    const { bar, minEr, constant, gen } = needs.get(m.name);
    const row = (what, figure, note = "") => `<tr><td class="k">${esc(what)}</td><td class="v">${figure}</td><td class="n">${note}</td></tr>`;
    const line = (what, need, held) => {
      const met = need <= held + ER_TOLERANCE;
      return { met, html: row(what, `<span class="${met ? "need-met" : "need-miss"}">${fmtPct(need)}%</span>`, met ? "(Met)" : "(Not Met)") };
    };
    const tag = (need, met, lines) => {
      const tip = lazyPop(`<span class="pop tip"><table>${lines.join("")}</table></span>`);
      return `<span class="erneed has"${tip}>> <span class="erreq ${met ? "er-met" : "er-under"}">${fmtPct(need)}%</span></span>`;
    };
    if (bar != null || minEr) {
      const lines = [];
      if (minEr)
        lines.push(line("Energy Regen requirement for kit", minEr, constant));
      if (bar != null)
        lines.push(line("Energy Regen requirement", bar, constant));
      if (bar != null && gen) {
        const pt = (v) => fmt(v / ENERGY_UNIT, 2, true);
        const gained = (text, v) => ({ met: true, html: row(text, pt(v)) });
        lines.push(gained(`${m.name} energy gen`, gen.hit + gen.flat), ...gen.shared.map(([ally, v]) => gained(`${ally} energy shared`, v)), gained("Total energy gen", gen.hit + gen.flat + gen.shared.reduce((n, [, v]) => n + v, 0)));
      }
      const need = Math.max(bar ?? 0, minEr);
      own.set(statLabel(
        11
        /* Stat.ER */
      ), tag(need, need <= constant + ER_TOLERANCE, lines.map((l) => l.html)));
    }
    const minCr = m.loadout.minCritRate;
    if (minCr) {
      const cr = menuStats(m.loadout.pieces(combo.weapon, combo.echo, combo.mainstat, combo.sequence, combo.matrix !== null, combo.highSubs, erOf[idx])).reduce((n, e) => n + (e.stat === 9 ? e.value : 0), 0);
      const kit = line("Kit Crit Rate Requirement", minCr, cr);
      own.set(statLabel(
        9
        /* Stat.CritRate */
      ), tag(minCr, kit.met, [kit.html]));
    }
  });
  return cells;
}
var loopReports = /* @__PURE__ */ new WeakMap();
function loopReport(run) {
  const seen = loopReports.get(run);
  if (seen)
    return seen;
  const [, loop = [], ...later] = run.rotationLines;
  const opened2 = new Set(loop.filter((l) => l.aggregate).map((l) => l.fieldKey));
  const lines = [
    ...loop.filter((l) => l.aggregate || l.fieldKey === void 0 || opened2.has(l.fieldKey)),
    ...later.flat().filter((l) => !l.aggregate && l.fieldKey !== void 0 && opened2.has(l.fieldKey))
  ];
  const first = loop.find((l) => !l.aggregate);
  const origin = first ? Math.min(...(first.members?.length ? first.members : [first.snap]).map((s) => s.frame)) : 0;
  const report = buildReport(lines, origin);
  loopReports.set(run, report);
  return report;
}
var shownReport = (run) => rotView === "loop" ? { ...loopReport(run), columns: detailFor(run).report.columns } : detailFor(run).report;
function page(run) {
  const report = shownReport(run);
  const lines = run.rotationLines;
  const { members } = run;
  const slotHue = new Map([...members.map((m) => [m.name, m.color]), [TUNE_BREAK_ENEMY.name, TUNE_BREAK_ENEMY.color]]);
  const erRolls = erRollsFor(run.teamKey, run.members, run.combo);
  const gearByMember = new Map(members.map((m, i) => [m.name, equippedGear(m, run.combo[i], erRolls[i]).map(([, g]) => g)]));
  const starts = /* @__PURE__ */ new Map();
  if (rotView === "full")
    lines.reduce((n, sec, k) => {
      if (k)
        starts.set(n, k);
      return n + sec.length;
    }, 0);
  const panes = {
    team: loadoutTable(run, energyRequirements(run), (slot, kind) => canPick(run, slot, kind)),
    contribution: dprTable(run, lines),
    distribution: distributionTable(run, lines),
    substats: substatValueTable(run, cachedGains(run) ?? null)
  };
  const tabs = TABS.map(([key, label]) => `<button type="button" class="rtab${key === tab ? " on" : ""}" data-tab="${key}">${label}</button>`).join("");
  return `<main>
  <div class="rtables">
    <div class="rtabs" role="tablist">${tabs}</div>
    <div class="rpanes">${TABS.map(([key]) => `<div class="rpane${key === tab ? " on" : ""}" data-pane="${key}">${panes[key]}</div>`).join("")}</div>
  </div>
  <div class="rotation-block">
    <div class="logbar">
      <div class="rtabs" role="tablist">${[["full", "Full Rotation"], ["loop", "Loop Rotation"]].map(([key, label]) => `<button type="button" class="rtab${key === rotView ? " on" : ""}" data-rot="${key}">${label}</button>`).join("")}</div>
      <div class="rtabs" role="tablist">${[["resources", "Resources"], ["stats", "Stats"]].map(([key, label]) => `<button type="button" class="rtab${key === logView ? " on" : ""}" data-log="${key}">${label}</button>`).join("")}</div>
    </div>
    ${rotationTable({ ...report, columns: shownColumns(run) }, slotHue, gearByMember, starts, logView === "resources" ? barsOf(run, report) : null)}
  </div>
</main>`;
}
var TABS = [["team", "Team & Gear"], ["distribution", "Node Priority"], ["substats", "Substat Value"], ["contribution", "Contribution"]];
var VIEW_KEY = "wuwa.teamViews";
var savedViews = (() => {
  try {
    return JSON.parse(localStorage.getItem(VIEW_KEY) ?? "{}");
  } catch {
    return {};
  }
})();
var saveViews = () => {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify({ tab, log: logView, rot: rotView }));
  } catch {
  }
};
var tab = TABS.find(([k]) => k === savedViews.tab)?.[0] ?? "team";
var logView = savedViews.log === "stats" ? "stats" : "resources";
var rotView = savedViews.rot === "loop" ? "loop" : "full";
var STAT_COLUMNS = /* @__PURE__ */ new Set(["mv", "scaler", "dmgBonus", "amp", "cr", "cd", "effDef", "effRes", "dealt"]);
var RESOURCE_COLUMN = (key) => key === "concerto" || key === "energy" || key === "offtune" || key.startsWith("gauge:");
function shownColumns(run) {
  const report = shownReport(run), full = detailFor(run).report;
  const own = viewColumns(report, full, logView), other = viewColumns(report, full, logView === "stats" ? "resources" : "stats");
  const sum = (cs) => ({ cw: cs.reduce((n, c) => n + (c.width ?? 0), 0), cpad: cs.length, npad: cs.filter((c) => c.align !== "left").length });
  const a = sum(own), b = sum(other);
  const pad = { cw: b.cw - a.cw, cpad: b.cpad - a.cpad, npad: b.npad - a.npad };
  const css = getComputedStyle(document.documentElement), v = (k) => parseFloat(css.getPropertyValue(k)) || 0;
  const px2 = pad.cw * v("--cw") + pad.cpad * v("--cpad") + pad.npad * v("--npad");
  return px2 > 0 ? own.map((c) => c.key === "action" ? { ...c, pad } : c) : own;
}
function viewColumns(report, full, view) {
  if (view === "stats")
    return report.columns.filter((c) => !RESOURCE_COLUMN(c.key));
  const gauges = report.columns.filter((c) => c.key.startsWith("gauge:"));
  const slots = Math.max(0, ...[...forteUse(full).values()].map((g) => g.length));
  const width = Math.max(...gauges.map((c) => c.width ?? 0), 6);
  const cells = Math.max(slots, 1.5);
  const forte = { ...gauges[0], key: FORTE_KEY, label: "forte", full: "Forte", width: width * cells + (cells - 1) };
  const after = report.columns.some((c) => c.key === "concerto") ? "concerto" : gauges[0]?.key;
  return report.columns.flatMap((c) => [
    ...STAT_COLUMNS.has(c.key) || c.key.startsWith("gauge:") ? [] : RUNNING_COLUMNS.has(c.key) ? [{ ...c, width: width * 1.5 + 0.5 }] : [c],
    ...c.key === after && slots ? [forte] : []
  ]);
}
function barsOf(run, report) {
  const gauge = report.columns.find((c) => c.key.startsWith("gauge:")) ?? { key: GAUGE_KEYS[0], label: "", digits: 2 };
  return {
    energyCap: new Map(run.members.map((m) => [m.name, (m.loadout.resonator.maxEnergy ?? 0) / ENERGY_UNIT])),
    forte: forteUse(report),
    gauge
  };
}
var shownKey = "";
function renderDetail(key) {
  shownKey = key;
  rememberTableScroll();
  topbar.hidden = false;
  clearPops();
  const run = results.get(key);
  app.innerHTML = page(run);
  app.className = "";
  wireColumnDrag(app, shownColumns(run));
  wireCellSelect(app);
  wireDistribution(app);
  wireBlockSelect(app.querySelector(".rtable.distpies"), distCopy);
  wireBlockSelect(app.querySelector(".rtable.dpr"), (sel) => sel.cells.slice(sel.r0, sel.r1 + 1).map((row) => row.slice(sel.c0, sel.c1 + 1).map((c) => (c.textContent ?? "").trim())));
  const lbl = app.querySelector(".rtable.loadout .c.lbl");
  if (lbl)
    app.querySelector(".rpanes")?.style.setProperty("--lblw", `${lbl.getBoundingClientRect().width / zoom()}px`);
  fitPies(app);
  if (tab === "substats")
    fillSubstats();
}
function fillSubstats() {
  const key = shownKey, run = results.get(key);
  if (!run || cachedGains(run))
    return;
  void substatGains(run, () => shownKey !== key || results.get(key) !== run).then((gains) => {
    const pane = app.querySelector('.rpane[data-pane="substats"]');
    if (gains && pane && shownKey === key && results.get(key) === run)
      pane.innerHTML = substatValueTable(run, gains);
  }).catch(showError);
}
function fitPies(root) {
  const pies = [...root.querySelectorAll(".rtable.distpies svg.pie")].map((svg) => {
    const vb = svg.viewBox.baseVal, b = svg.getBBox();
    const left = Math.max(vb.x, b.x - 6), right = Math.min(vb.x + vb.width, b.x + b.width + 6);
    const top = Math.max(vb.y, b.y - 9), bottom = Math.min(vb.y + vb.height, b.y + b.height + 9);
    svg.setAttribute("viewBox", `${left} ${top} ${right - left} ${bottom - top}`);
    const wrap = svg.parentElement, cell2 = wrap.parentElement;
    return { wrap, w: right - left, h: bottom - top, room: [cell2.clientWidth - 8, cell2.clientHeight - 8] };
  });
  const scale = Math.min(0.6, ...pies.map((p) => Math.min(p.room[0] / p.w, p.room[1] / p.h)));
  for (const p of pies) {
    p.wrap.style.width = `${Math.floor(p.w * scale)}px`;
    p.wrap.style.height = `${Math.floor(p.h * scale)}px`;
  }
}
app.addEventListener("click", (e) => {
  const btn = e.target.closest(".rtab[data-tab]");
  if (!btn)
    return;
  tab = btn.dataset.tab;
  saveViews();
  dropPanel();
  clearTableSel();
  for (const el of app.querySelectorAll(".rtab[data-tab], .rpane"))
    el.classList.toggle("on", (el.dataset.tab ?? el.dataset.pane) === tab);
  if (tab === "substats")
    fillSubstats();
});
var tableSel = null;
function clearTableSel() {
  tableSel?.box.remove();
  tableSel = null;
}
function cellAt(cells, cell2) {
  for (let r = 0; r < cells.length; r++) {
    const c = cells[r].indexOf(cell2);
    if (c >= 0)
      return [r, c];
  }
  return null;
}
function aimTableSel(r, c) {
  const sel = tableSel;
  if (!sel)
    return;
  sel.r0 = Math.min(sel.ar, r);
  sel.r1 = Math.max(sel.ar, r);
  sel.c0 = Math.min(sel.ac, c);
  sel.c1 = Math.max(sel.ac, c);
  const t = rect(sel.table), a = rect(sel.cells[sel.r0][sel.c0]), b = rect(sel.cells[sel.r1][sel.c1]);
  Object.assign(sel.box.style, { left: `${a.left - t.left}px`, top: `${a.top - t.top}px`, width: `${b.right - a.left}px`, height: `${b.bottom - a.top}px` });
}
function wireBlockSelect(table, copy) {
  clearTableSel();
  if (!table)
    return;
  const cells = [...table.querySelectorAll(":scope > .rtrow:not(.dist)")].map((r) => [...r.children]);
  let dragging = false;
  const start = (r, c) => {
    dropPanel();
    clearBlock();
    clearTableSel();
    const box = table.appendChild(document.createElement("div"));
    box.className = "cellbox";
    tableSel = { table, cells, ar: r, ac: c, r0: r, r1: r, c0: c, c1: c, box, copy };
    aimTableSel(r, c);
  };
  table.addEventListener("pointerdown", (e) => {
    const at = cellAt(cells, e.target.closest(".c"));
    if (e.button !== 0 || !at)
      return;
    if (e.pointerType === "touch") {
      watchTouch(e, cells[at[0]][at[1]], () => start(...at), () => start(...at));
      return;
    }
    e.preventDefault();
    table.setPointerCapture(e.pointerId);
    start(...at);
    dragging = true;
  });
  table.addEventListener("pointermove", (e) => {
    if (!dragging)
      return;
    const at = cellAt(cells, document.elementFromPoint(e.clientX, e.clientY)?.closest(".c") ?? null);
    if (at)
      aimTableSel(...at);
  });
  const end = () => {
    dragging = false;
  };
  table.addEventListener("pointerup", end);
  table.addEventListener("pointercancel", end);
}
addEventListener("pointerdown", (e) => {
  if (tableSel && !tableSel.table.contains(e.target))
    clearTableSel();
}, true);
function distCopy(sel) {
  const out = [];
  for (let r = sel.r0; r <= sel.r1; r++) {
    const row = sel.cells[r].slice(sel.c0, sel.c1 + 1);
    const slices = row.map((c) => c.dataset.slices ? JSON.parse(c.dataset.slices) : null);
    const n = Math.max(1, ...slices.map((s) => s?.length ?? 0));
    for (let i = 0; i < n; i++) {
      out.push(row.flatMap((c, k) => {
        const text = i ? "" : (c.textContent ?? "").trim();
        if (sel.c0 + k === 0)
          return [text];
        const s = slices[k];
        return s ? s[i] ?? ["", ""] : [text, ""];
      }));
    }
  }
  return out;
}
addEventListener("keydown", (e) => {
  if (!tableSel || e.key !== "c" || !(e.ctrlKey || e.metaKey) || e.altKey)
    return;
  const loose = getSelection();
  if (loose && !loose.isCollapsed)
    return;
  e.preventDefault();
  copyBlock(tableSel.copy(tableSel));
});
var COLUMN_ORDER_KEY = "wuwa.logColumns";
var savedOrder = () => {
  try {
    return JSON.parse(localStorage.getItem(COLUMN_ORDER_KEY) ?? "[]");
  } catch {
    return [];
  }
};
function orderedKeys(columns) {
  const out = savedOrder().filter((k) => columns.some((c) => c.key === k));
  columns.forEach((c, i) => {
    if (out.includes(c.key))
      return;
    const prev = columns.slice(0, i).reverse().find((p) => out.includes(p.key));
    out.splice(prev ? out.indexOf(prev.key) + 1 : 0, 0, c.key);
  });
  return out;
}
var logColumns = [];
var logOrder = [];
var logStyle = null;
function applyColumnOrder(root) {
  const grid = root.querySelector(".gridwrap .grid");
  if (!grid || !logColumns.length)
    return;
  const at = new Map(logOrder.map((k, i) => [k, i]));
  const visual = [...logColumns].sort((a, b) => at.get(a.key) - at.get(b.key));
  grid.style.setProperty("--cols", visual.map(colWidth).join(" "));
  const rules = logColumns.map((c, i) => `.grid .r>.c:nth-child(${i + 1}){order:${at.get(c.key)}}`);
  if (!logStyle)
    logStyle = document.head.appendChild(document.createElement("style"));
  logStyle.textContent = rules.join("");
}
function offsetsOf(order, width) {
  const out = /* @__PURE__ */ new Map();
  let x = 0;
  for (const key of order) {
    out.set(key, x);
    x += width.get(key) ?? 0;
  }
  return out;
}
function columnBox(grid, left, width) {
  const box = grid.appendChild(document.createElement("div"));
  box.className = "colbox";
  box.style.left = `${left}px`;
  box.style.width = `${width}px`;
  return box;
}
var selected = null;
var selBox = null;
function trackBox(grid, key) {
  const cell2 = grid.querySelector(`:scope > .r.head > .c[data-col="${CSS.escape(key)}"]`);
  if (!cell2)
    return null;
  const g = rect(grid);
  const c = rect(cell2);
  return { left: c.left - g.left, width: c.width };
}
function paintSelection(root) {
  selBox?.remove();
  selBox = null;
  if (!selected)
    return;
  clearBlock();
  const grid = root.querySelector(".gridwrap .grid");
  const track = grid && trackBox(grid, selected);
  if (grid && track)
    selBox = columnBox(grid, track.left, track.width);
}
function cellBox(grid) {
  const box = grid.appendChild(document.createElement("div"));
  box.className = "cellbox";
  return box;
}
function doubled(row, held) {
  const chain = row.parentElement;
  const tgl = chain?.classList.contains("chain") ? chain.querySelector(":scope > .tgl") : null;
  if (!tgl?.checked)
    return false;
  const field = tgl.id.startsWith("fg") ? tgl.id.slice(2) : "";
  const opened2 = field ? chain.closest(".grid").querySelectorAll(`.r[data-fh="${field}"], [data-fh="${field}"] .r`) : chain.querySelectorAll(":scope > .parts .r");
  return [...opened2].some((r) => held.has(r));
}
function blockPanel(sel) {
  let dmg = 0, dmgCells = 0;
  let frames = 0, timeCells = 0;
  let gained = 0, tuneCells = 0, tuneDigits = 2;
  let energy = 0, energyCells = 0, energyDigits = 2;
  const held = new Set(sel.rows.slice(sel.r0, sel.r1 + 1));
  const rows = blockCells(sel);
  for (let i = 0; i < rows.length; i++) {
    if (doubled(sel.rows[sel.r0 + i], held))
      continue;
    for (const c of rows[i]) {
      if (c.dataset.avg !== void 0) {
        dmg += Number(c.dataset.avg) || 0;
        dmgCells++;
        continue;
      }
      if (c.dataset.frames !== void 0) {
        frames += Number(c.dataset.frames) || 0;
        timeCells++;
        continue;
      }
      if (c.dataset.val === void 0)
        continue;
      const col = logColumns[[...c.parentElement.children].indexOf(c)];
      if (col.key === "energy") {
        energy += Number(c.dataset.gen) || 0;
        energyDigits = col.digits ?? 2;
        energyCells++;
        continue;
      }
      if (col.key !== "offtune")
        continue;
      gained += (Number(c.dataset.val) || 0) - (Number(c.dataset.before) || 0);
      tuneDigits = col.digits ?? 2;
      tuneCells++;
    }
  }
  const lines = dmgCells > 1 ? [["Total Dmg", fmt(dmg, 0)]] : [];
  if (timeCells > 1)
    lines.push(["Total Time", `${(frames / 60).toFixed(2)}s`]);
  if (energyCells)
    lines.push(["Total Energy", fmt(energy, energyDigits, true, false)]);
  if (tuneCells)
    lines.push(["Total Offtune", fmt(gained, tuneDigits, true, false)]);
  if (!lines.length)
    return "";
  return `<span class="pop stat"><table>` + lines.map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td class="v">${esc(v)}</td></tr>`).join("") + `</table></span>`;
}
var cellSel = null;
var cellSelBox = null;
var cellSelDot = null;
var holding = false;
var px = 0;
var py = 0;
var pressScale = 1;
function clearBlock() {
  cellSel = null;
  cellSelBox?.remove();
  cellSelBox = null;
  cellSelDot?.remove();
  cellSelDot = null;
}
function rowSpan(sel, i, gridTop) {
  const seen = sel.span[i];
  if (seen)
    return seen;
  if (i === 0 && sel.rows.length > 1) {
    const below = rowSpan(sel, 1, gridTop)[0];
    return sel.span[0] = [below - rect(sel.rows[0]).height, below];
  }
  const r = rect(sel.rows[i]);
  const at = [r.top - gridTop, r.bottom - gridTop];
  sel.span[i] = at;
  return at;
}
function aimBlock(sel, row, col, gridTop) {
  sel.fr = row;
  sel.r0 = Math.min(sel.ar, row);
  sel.r1 = Math.max(sel.ar, row);
  sel.c0 = Math.min(sel.ac, col);
  sel.c1 = Math.max(sel.ac, col);
  const top = rowSpan(sel, sel.r0, gridTop)[0];
  const left = sel.cols[sel.c0].left;
  const box = cellSelBox ?? (cellSelBox = cellBox(sel.grid));
  const bar = barOf(sel);
  const g = bar ? rect(sel.grid) : null, b = bar ? rect(bar) : null;
  box.style.left = `${b ? b.left - g.left - 3 : left}px`;
  box.style.top = `${top}px`;
  box.style.width = `${b ? b.width + 6 : sel.cols[sel.c1].right - left}px`;
  box.style.height = `${rowSpan(sel, sel.r1, gridTop)[1] - top}px`;
  paintCellDot(sel, gridTop);
}
var edgeTop = (sel, r, gridTop) => r < sel.rows.length ? rowSpan(sel, r, gridTop)[0] : rowSpan(sel, sel.rows.length - 1, gridTop)[1];
var edgeLeft = (sel, c) => c < sel.cols.length ? sel.cols[c].left : sel.cols[sel.cols.length - 1].right;
function paintCellDot(sel, gridTop) {
  if (!sel.touch)
    return;
  const dot = cellSelDot ?? (cellSelDot = makeDot(sel.grid, grabCellDot));
  const [r, c] = sel.dot ?? [sel.r1 + 1, sel.c1 + 1];
  dot.style.left = `${edgeLeft(sel, c)}px`;
  dot.style.top = `${edgeTop(sel, r, gridTop)}px`;
}
function edgeAt(sel, x, y) {
  const g = rect(sel.grid);
  const at = y - g.top, n = sel.rows.length;
  let r = Math.min(Math.max(sel.fr, 0), n);
  while (r < n && edgeTop(sel, r + 1, g.top) <= at)
    r++;
  while (r > 0 && edgeTop(sel, r, g.top) > at)
    r--;
  if (r < n && edgeTop(sel, r + 1, g.top) - at < at - edgeTop(sel, r, g.top))
    r++;
  sel.fr = Math.min(r, n - 1);
  let c = 0;
  for (let k = 1; k <= sel.cols.length; k++)
    if (Math.abs(edgeLeft(sel, k) - (x - g.left)) < Math.abs(edgeLeft(sel, c) - (x - g.left)))
      c = k;
  return [r, c];
}
function grabCellDot(e) {
  const sel = cellSel;
  if (!sel)
    return;
  dropPanel();
  const rows = [...sel.grid.querySelectorAll(".r")].filter((r) => r.offsetParent);
  const r0 = rows.indexOf(sel.rows[sel.r0]), r1 = rows.indexOf(sel.rows[sel.r1]);
  if (r0 < 0 || r1 < 0) {
    clearBlock();
    return;
  }
  Object.assign(sel, { rows, span: [], r0, r1, fr: r1 });
  grabDot(e, {
    grid: sel.grid,
    corners: () => [[sel.r0, sel.c0], [sel.r1 + 1, sel.c1 + 1]],
    edgeAt: (x, y) => edgeAt(sel, x, y),
    edgePoint: (r, c) => {
      const g = rect(sel.grid);
      return [g.left + edgeLeft(sel, c), g.top + edgeTop(sel, r, g.top)];
    },
    limits: () => [[0, 0], [sel.rows.length, sel.cols.length]],
    aim: (from, to) => {
      sel.dot = to;
      sel.ar = Math.min(from[0], to[0]);
      sel.ac = Math.min(from[1], to[1]);
      aimBlock(sel, Math.max(from[0], to[0]) - 1, Math.max(from[1], to[1]) - 1, rect(sel.grid).top);
      sel.fr = to[0];
    },
    done: () => {
      sel.dot = void 0;
      const gridTop = rect(sel.grid).top;
      paintCellDot(sel, gridTop);
      const html = sel.r0 === sel.r1 ? "" : blockPanel(sel);
      if (html)
        drivePanel(sel.rows[sel.r1].children[sel.cols[sel.c1].nth], html);
    }
  });
}
var barOf = (sel) => sel.bar && sel.r0 === sel.r1 && sel.c0 === sel.c1 && sel.r0 === sel.ar && sel.c0 === sel.ac ? sel.bar : void 0;
function blockCells(sel) {
  const bar = barOf(sel);
  if (bar)
    return [[bar]];
  const out = [];
  for (let r = sel.r0; r <= sel.r1; r++) {
    const cells = sel.rows[r].children;
    out.push(sel.cols.slice(sel.c0, sel.c1 + 1).map((c) => cells[c.nth]));
  }
  return out;
}
function trackBlock() {
  const sel = cellSel;
  if (!sel)
    return;
  const g = rect(sel.grid);
  const y = py - g.top;
  let row = Math.min(Math.max(sel.fr, 0), sel.rows.length - 1);
  while (row < sel.rows.length - 1 && y > rowSpan(sel, row, g.top)[1])
    row++;
  while (row > 0 && y < rowSpan(sel, row, g.top)[0])
    row--;
  if (sel.rows[row].classList.contains("loop"))
    row = Math.min(Math.max(row + (row > sel.ar ? -1 : 1), 0), sel.rows.length - 1);
  const head = rect(sel.rows[0]);
  if (py >= head.top && py < head.bottom)
    row = 0;
  const x = px - g.left;
  let col = 0;
  while (col < sel.cols.length - 1 && x >= sel.cols[col + 1].left)
    col++;
  aimBlock(sel, row, col, g.top);
  const html = sel.r0 === sel.r1 ? "" : blockPanel(sel);
  if (!html) {
    dropPanel();
    return;
  }
  drivePanel(sel.rows[row].children[sel.cols[col].nth], html);
}
var trackRaf = 0;
function queueTrack() {
  if (trackRaf)
    return;
  trackRaf = requestAnimationFrame(() => {
    trackRaf = 0;
    trackBlock();
  });
}
function flushTrack() {
  if (!trackRaf)
    return;
  cancelAnimationFrame(trackRaf);
  trackRaf = 0;
  trackBlock();
}
addEventListener("scroll", () => {
  if (holding)
    queueTrack();
}, true);
addEventListener("click", (e) => {
  const target = e.target;
  if (target?.closest?.(".gridwrap .grid .chain > label.r") && !target.closest(".c.action"))
    e.preventDefault();
}, true);
var tabbed = false;
addEventListener("keydown", (e) => {
  if (e.key === "Tab")
    tabbed = true;
}, true);
addEventListener("pointerdown", () => {
  tabbed = false;
}, true);
addEventListener("focusin", (e) => {
  const t = e.target;
  if (!tabbed && t instanceof HTMLInputElement && t.matches(".gridwrap .tgl"))
    t.blur();
}, true);
function copyText(c) {
  const tag = c.querySelector(".ctag");
  const name = [...c.childNodes].filter((n) => n !== tag).map((n) => n.textContent ?? "").join("").replace(/[▸▾]/g, "").trim();
  return tag ? `${name} ${(tag.textContent ?? "").trim()}` : name;
}
addEventListener("keydown", (e) => {
  if (!cellSel || e.key !== "c" || !(e.ctrlKey || e.metaKey) || e.altKey)
    return;
  const loose = getSelection();
  if (loose && !loose.isCollapsed)
    return;
  e.preventDefault();
  copyBlock(blockCells(cellSel).filter((row) => !row[0]?.parentElement?.classList.contains("loop")).map((row) => row.map(copyText)));
});
function wireCellSelect(root) {
  clearBlock();
  holding = false;
  const grid = root.querySelector(".gridwrap .grid");
  if (!grid)
    return;
  let pressedAt = 0;
  let closing = false;
  const measure = (cell2) => {
    const g = rect(grid);
    const cols = [...grid.querySelectorAll(":scope > .r.head > .c[data-col]")].map((h, nth) => {
      const r = rect(h);
      return { key: h.dataset.col, nth, left: r.left - g.left, right: r.right - g.left };
    }).sort((a, b) => a.left - b.left);
    const row = cell2.closest(".r");
    const rows = [...grid.querySelectorAll(".r")].filter((r) => r.offsetParent);
    const ar = rows.indexOf(row);
    const ac = cols.findIndex((c) => c.nth === [...row.children].indexOf(cell2));
    return ar < 0 || ac < 0 ? null : { rows, cols, ar, ac };
  };
  const pick = (at, touch, bar) => {
    dropPanel();
    clearTableSel();
    selected = null;
    selBox?.remove();
    selBox = null;
    clearBlock();
    cellSel = { grid, ...at, span: [], fr: at.ar, r0: at.ar, r1: at.ar, c0: at.ac, c1: at.ac, touch, bar };
    aimBlock(cellSel, at.ar, at.ac, rect(grid).top);
  };
  const end = () => {
    flushTrack();
    if (!holding)
      return;
    holding = false;
    holdPanels(false);
    const sel = cellSel;
    const one = sel.r0 === sel.r1 && sel.c0 === sel.c1;
    if (one && performance.now() - pressedAt < HOLD) {
      dropPanel();
      if (closing)
        swallowClick();
      return;
    }
    if (one)
      dropPanel();
    swallowClick();
  };
  grid.addEventListener("pointerdown", (e) => {
    const target = e.target;
    const cell2 = target.closest(".r:not(.head):not(.loop) > .c");
    if (e.button !== 0 || holding || !cell2 || target.closest(".ctag, .celldot, .uncaret"))
      return;
    const at = measure(cell2);
    if (!at)
      return;
    const bar = cell2.querySelectorAll(".rbar").length > 1 ? target.closest(".rbar:not(.empty)") ?? void 0 : void 0;
    closing = panelOpenOn(cell2);
    if (e.pointerType === "touch") {
      const tap = () => {
        pick(at, true, bar);
        if (closing)
          swallowClick(600);
      };
      watchTouch(e, cell2, tap, () => pick(at, true, bar));
      return;
    }
    e.preventDefault();
    cell2.setPointerCapture(e.pointerId);
    holdPanels(true);
    pressScale = zoom();
    px = e.clientX / pressScale;
    py = e.clientY / pressScale;
    pressedAt = performance.now();
    pick(at, false, bar);
    holding = true;
  });
  const firstRow = (tgl) => {
    const rows = tgl.id.startsWith("fg") ? [...grid.querySelectorAll(`[data-fh="${tgl.id.slice(2)}"]`)].map((el) => el.matches(".r") ? el : el.querySelector(".r")) : [...tgl.parentElement.querySelectorAll(":scope > .parts > .r")];
    return rows.find((r) => !!r?.offsetParent);
  };
  grid.addEventListener("change", (e) => {
    const tgl = e.target;
    if (!tgl.matches(".tgl"))
      return;
    grid.querySelectorAll(".uncaret").forEach((u) => u.remove());
    for (const open of grid.querySelectorAll(".tgl:checked")) {
      firstRow(open)?.querySelector(".c.action, .c.name")?.insertAdjacentHTML("beforeend", `<label class="caret uncaret" for="${open.id}">\u25BE</label>`);
    }
    const cell2 = tgl.checked ? grid.querySelector(`.uncaret[for="${tgl.id}"]`)?.parentElement ?? null : grid.querySelector(`label.r[for="${tgl.id}"] > .c.action`);
    const at = cell2 && measure(cell2);
    if (at)
      pick(at, false);
  });
  grid.addEventListener("pointermove", (e) => {
    if (!holding || e.pointerType === "touch")
      return;
    px = e.clientX / pressScale;
    py = e.clientY / pressScale;
    queueTrack();
  });
  grid.addEventListener("pointerup", end);
  grid.addEventListener("pointercancel", end);
}
var dragStyle = null;
var liftRule = null;
var liftBox = null;
var slideRules = /* @__PURE__ */ new Map();
var slideNow = /* @__PURE__ */ new Map();
var slideTo = /* @__PURE__ */ new Map();
var slideRaf = 0;
function stepSlides() {
  slideRaf = 0;
  let moving = false;
  for (const [key, rule] of slideRules) {
    const to = slideTo.get(key) ?? 0;
    const at = slideNow.get(key) ?? 0;
    if (at === to)
      continue;
    const next = Math.abs(to - at) < 0.5 ? to : at + (to - at) * 0.3;
    slideNow.set(key, next);
    rule.style.transform = `translateX(${next}px)`;
    if (next !== to)
      moving = true;
  }
  if (moving)
    slideRaf = requestAnimationFrame(stepSlides);
}
function openDrag(grid, d) {
  const nth = (key) => logColumns.findIndex((c) => c.key === key) + 1;
  const others = d.order.filter((k) => k !== d.key);
  const rules = [
    `.grid .r>.c:nth-child(${d.nth}){transform:translateX(0px);transition:none;z-index:6;background-color:color-mix(in srgb, var(--m, var(--surface)) 4%, var(--surface))}`,
    `.grid .r>.c.member:nth-child(${d.nth}){background-color:color-mix(in srgb, var(--mem, var(--surface)) 10%, var(--surface))}`,
    `.grid .r.head>.c:nth-child(${d.nth}),.grid .r.totalrow>.c:nth-child(${d.nth}){background-color:var(--surface-3)}`
  ];
  const slideAt = rules.length;
  for (const key of others)
    rules.push(`.grid .r>.c:nth-child(${nth(key)}){transform:translateX(0px)}`);
  if (!dragStyle)
    dragStyle = document.head.appendChild(document.createElement("style"));
  dragStyle.textContent = rules.join("");
  const sheet = dragStyle.sheet;
  liftRule = sheet?.cssRules[0] ?? null;
  slideRules.clear();
  slideNow.clear();
  slideTo.clear();
  others.forEach((key, i) => {
    const rule = sheet?.cssRules[slideAt + i];
    if (rule)
      slideRules.set(key, rule);
  });
  clearBlock();
  const track = trackBox(grid, d.key);
  liftBox = columnBox(grid, track?.left ?? d.home, track?.width ?? d.width.get(d.key));
  liftBox.style.transition = "none";
  if (selBox && selected === d.key)
    selBox.style.display = "none";
}
function slideDrag(d) {
  const from = offsetsOf(d.order, d.width);
  const rest = d.order.filter((k) => k !== d.key);
  rest.splice(d.at, 0, d.key);
  const to = offsetsOf(rest, d.width);
  for (const key of slideRules.keys())
    slideTo.set(key, to.get(key) - from.get(key));
  if (!slideRaf)
    slideRaf = requestAnimationFrame(stepSlides);
  if (selBox && selected && selected !== d.key) {
    selBox.style.transform = `translateX(${to.get(selected) - from.get(selected)}px)`;
  }
}
function closeDrag() {
  if (slideRaf)
    cancelAnimationFrame(slideRaf);
  slideRaf = 0;
  dragStyle?.remove();
  dragStyle = null;
  liftRule = null;
  liftBox?.remove();
  liftBox = null;
  slideRules.clear();
}
function wireColumnDrag(root, columns) {
  logColumns = columns;
  logOrder = orderedKeys(columns);
  closeDrag();
  selected = null;
  selBox = null;
  applyColumnOrder(root);
  const head = root.querySelector(".gridwrap .grid > .r.head");
  if (!head)
    return;
  const cells = [...head.querySelectorAll(":scope > .c")];
  cells.forEach((el, i) => {
    el.dataset.col = columns[i].key;
  });
  let drag = null;
  let lifted = false;
  let settling = false;
  let moveX = 0;
  let moveRaf = 0;
  const LIFT_AT = 3;
  head.addEventListener("pointerdown", (e) => {
    const cell2 = e.target.closest(".c[data-col]");
    if (e.button !== 0 || drag || settling || !cell2)
      return;
    e.preventDefault();
    cell2.setPointerCapture(e.pointerId);
    const width = new Map(cells.map((c) => [c.dataset.col, rect(c).width]));
    const key = cell2.dataset.col;
    const offsets = offsetsOf(logOrder, width);
    const scale = zoom();
    drag = {
      key,
      nth: cells.indexOf(cell2) + 1,
      order: logOrder,
      width,
      home: offsets.get(key),
      span: [...width.values()].reduce((n, w) => n + w, 0),
      startX: e.clientX / scale,
      scale,
      at: logOrder.indexOf(key)
    };
    lifted = false;
  });
  const aimDrag = () => {
    moveRaf = 0;
    if (!drag)
      return;
    const w = drag.width.get(drag.key);
    const dx = Math.min(drag.span - w - drag.home, Math.max(-drag.home, moveX - drag.startX));
    const { width, key } = drag;
    const rest = drag.order.filter((k) => k !== key);
    const edge = drag.home + dx;
    let at = drag.at;
    let slot = rest.slice(0, at).reduce((n, k) => n + width.get(k), 0);
    for (; ; ) {
      const after = rest[at];
      if (after !== void 0 && edge - slot > width.get(after) / 2) {
        slot += width.get(after);
        at++;
        continue;
      }
      const before = rest[at - 1];
      if (before !== void 0 && slot - edge > width.get(before) / 2) {
        slot -= width.get(before);
        at--;
        continue;
      }
      break;
    }
    if (at !== drag.at) {
      drag.at = at;
      slideDrag(drag);
    }
    if (liftRule)
      liftRule.style.transform = `translateX(${dx}px)`;
    if (liftBox)
      liftBox.style.transform = `translateX(${dx}px)`;
  };
  head.addEventListener("pointermove", (e) => {
    if (!drag)
      return;
    moveX = e.clientX / drag.scale;
    if (!lifted) {
      if (Math.abs(moveX - drag.startX) < LIFT_AT)
        return;
      lifted = true;
      document.body.classList.add("coldrag");
      openDrag(head.parentElement, drag);
    }
    if (!moveRaf)
      moveRaf = requestAnimationFrame(aimDrag);
  });
  const drop = () => {
    if (!drag)
      return;
    if (moveRaf) {
      cancelAnimationFrame(moveRaf);
      aimDrag();
    }
    const d = drag;
    drag = null;
    document.body.classList.remove("coldrag");
    const next = d.order.filter((k) => k !== d.key);
    next.splice(d.at, 0, d.key);
    logOrder = next;
    const full = savedOrder(), shown = new Set(next);
    let j = 0;
    const merged = full.filter((k) => shown.has(k)).length === next.length ? full.map((k) => shown.has(k) ? next[j++] : k) : [...next, ...full.filter((k) => !shown.has(k))];
    try {
      localStorage.setItem(COLUMN_ORDER_KEY, JSON.stringify(merged));
    } catch {
    }
    const rest = offsetsOf(next, d.width).get(d.key) - offsetsOf(d.order, d.width).get(d.key);
    settling = true;
    if (liftRule) {
      liftRule.style.transition = "transform .16s ease";
      liftRule.style.transform = `translateX(${rest}px)`;
    }
    if (liftBox) {
      liftBox.style.transition = "";
      liftBox.style.transform = `translateX(${rest}px)`;
    }
    setTimeout(() => {
      settling = false;
      closeDrag();
      applyColumnOrder(root);
      paintSelection(root);
    }, 170);
  };
  head.addEventListener("pointerup", () => {
    if (!drag)
      return;
    if (lifted) {
      drop();
      return;
    }
    selected = selected === drag.key ? null : drag.key;
    drag = null;
    paintSelection(root);
  });
  head.addEventListener("pointercancel", () => {
    if (lifted)
      drop();
    else
      drag = null;
  });
}
app.addEventListener("click", (e) => {
  const btn = e.target.closest(".rtab[data-log], .rtab[data-rot]");
  if (!btn || !shownKey)
    return;
  const log = btn.dataset.log, rot = btn.dataset.rot;
  if ((log ?? logView) === logView && (rot ?? rotView) === rotView)
    return;
  logView = log ?? logView;
  rotView = rot ?? rotView;
  saveViews();
  const y = app.querySelector("main")?.scrollTop ?? 0, x = app.querySelector("main")?.scrollLeft ?? 0;
  renderDetail(shownKey);
  app.querySelector("main")?.scrollTo(x, y);
});

// dist/src/page/team.js
var app2 = document.getElementById("app");
var backLink = document.getElementById("backLink");
var came = (() => {
  const from = document.referrer ? new URL(document.referrer) : null;
  if (!from || from.origin !== location.origin)
    return null;
  return /\/value(\.html)?$/.test(from.pathname) ? "value" : /\/team(\.html)?$/.test(from.pathname) ? null : "table";
})();
var moved = false;
var show = (key) => {
  renderDetail(key);
  maybeShowTutorial();
};
var generation = 0;
async function switchTo2(teamKey, attempts, undo) {
  const gen = ++generation;
  const stale = () => gen !== generation;
  cancelQueued();
  barReset();
  try {
    for (const attempt of attempts) {
      if (!attempt.setUp())
        continue;
      moved = true;
      await ensureBestPicks([[teamKey, TEAMS[teamKey]]], structuredClone(filters), stale);
      if (stale())
        return;
      saveSolves();
      const row = attempt.choose(solvedRows(teamKey));
      if (!row)
        continue;
      admitBuild(row.members, row.combo);
      await overlayNow("Running Rotation\u2026", 1);
      if (stale())
        return;
      reopenDetail(row.key);
      show(row.key);
      overlayHide();
      return;
    }
  } catch (err) {
    if (!stale())
      showError(err);
    return;
  }
  undo();
  overlayHide();
}
async function bootDetail() {
  let key = hashTeam();
  const pending = key && !rowFromKey(key) ? tagTeam(key) : null;
  if (pending) {
    overlayPhase("Solving Team\u2026", true);
    await paint();
    await solveQuiet(pending, gearShut(tagFilters(key)));
    key = hashTeam();
  }
  const row = key ? rowFromKey(key) : null;
  if (!key || !row)
    return false;
  overlayPhase("Running Rotation\u2026", true);
  await paint();
  results.set(key, runTeam(row.teamKey, row.members, row.combo, true));
  renderDetail(key);
  overlayHide();
  maybeShowTutorial();
  return true;
}
async function boot() {
  onSwitch(switchTo2);
  onSolve(solveQuiet);
  applyHash();
  await loadSolves();
  let shown = await bootDetail().catch((err) => {
    if (!discardRestoredSolves())
      throw err;
    console.warn("restored solves failed to load; solving the roster here instead", err);
    return null;
  });
  if (shown === null)
    shown = await bootDetail();
  if (!shown) {
    location.replace("./");
    return;
  }
  syncHash();
  const idle = globalThis.requestIdleCallback ?? ((fn) => setTimeout(fn, 500));
  idle(() => {
    workerPool();
  });
  addEventListener("hashchange", () => location.reload());
  wireSourcePanels(app2);
  backLink.addEventListener("click", (e) => {
    e.preventDefault();
    if (came === "value" || came === "table" && !moved) {
      history.back();
      return;
    }
    location.assign(pageUrl(null));
  });
}
boot().catch(showError);
