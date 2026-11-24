/**
 * A picture of laid-out cells, drawn onto a canvas from their computed styles the way the page
 * paints them: backgrounds, inset box-shadows, borders, images and text. Enough for the table's
 * cells (flat colours, icons, one line of text per node); gradients, SVG and drop shadows are left out.
 */
import { zoom } from "./panels.js";

/** Split a computed list ("a, b") on the commas outside parentheses. */
function splitTop(list: string): string[] {
  const out: string[] = [];
  let depth = 0, from = 0;
  for (let i = 0; i < list.length; i++) {
    const ch = list[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      out.push(list.slice(from, i).trim());
      from = i + 1;
    }
  }
  out.push(list.slice(from).trim());
  return out;
}

const clear = (color: string): boolean => color === "transparent" || /^rgba\(.*,\s*0\)$/.test(color);

/** One element's own box: background, inset shadows (as solid bars) and borders. */
function paintBox(ctx: CanvasRenderingContext2D, st: CSSStyleDeclaration, r: DOMRect): void {
  const radius = [st.borderTopLeftRadius, st.borderTopRightRadius, st.borderBottomRightRadius, st.borderBottomLeftRadius].map((v) => parseFloat(v) || 0);
  if (!clear(st.backgroundColor)) {
    ctx.fillStyle = st.backgroundColor;
    ctx.beginPath();
    ctx.roundRect(r.left, r.top, r.width, r.height, radius);
    ctx.fill();
  }
  if (st.boxShadow !== "none") {
    for (const s of splitTop(st.boxShadow)) {
      if (!/\binset\b/.test(s)) continue;
      const [x = 0, y = 0, blur = 0, spread = 0] = (s.match(/-?[\d.]+px/g) ?? []).map(parseFloat);
      const color = s.replace(/-?[\d.]+px/g, "").replace(/\binset\b/, "").trim();
      if (blur || clear(color)) continue;
      ctx.fillStyle = color;
      const left = Math.max(0, x + spread), right = Math.max(0, -x + spread), top = Math.max(0, y + spread), bottom = Math.max(0, -y + spread);
      if (left) ctx.fillRect(r.left, r.top, left, r.height);
      if (right) ctx.fillRect(r.right - right, r.top, right, r.height);
      if (top) ctx.fillRect(r.left, r.top, r.width, top);
      if (bottom) ctx.fillRect(r.left, r.bottom - bottom, r.width, bottom);
    }
  }
  const side = (w: string, style: string, color: string, draw: (n: number) => void): void => {
    const n = parseFloat(w) || 0;
    if (!n || style === "none" || style === "hidden" || clear(color)) return;
    ctx.fillStyle = color;
    draw(n);
  };
  side(st.borderTopWidth, st.borderTopStyle, st.borderTopColor, (n) => ctx.fillRect(r.left, r.top, r.width, n));
  side(st.borderBottomWidth, st.borderBottomStyle, st.borderBottomColor, (n) => ctx.fillRect(r.left, r.bottom - n, r.width, n));
  side(st.borderLeftWidth, st.borderLeftStyle, st.borderLeftColor, (n) => ctx.fillRect(r.left, r.top, n, r.height));
  side(st.borderRightWidth, st.borderRightStyle, st.borderRightColor, (n) => ctx.fillRect(r.right - n, r.top, n, r.height));
}

const cased = (text: string, transform: string): string =>
  transform === "uppercase" ? text.toUpperCase() : transform === "lowercase" ? text.toLowerCase()
  : transform === "capitalize" ? text.replace(/\b\p{L}/gu, (c) => c.toUpperCase()) : text;

/** A text node, a line at a time where it wraps, at the places the page set it. */
function paintText(ctx: CanvasRenderingContext2D, node: Text, box: (r: DOMRect) => DOMRect): void {
  const data = node.data;
  const first = data.search(/\S/);
  if (first < 0) return;
  const last = data.length - (data.length - data.trimEnd().length);
  const st = getComputedStyle(node.parentElement!);
  if (st.visibility !== "visible") return;
  ctx.font = `${st.fontStyle} ${st.fontWeight} ${st.fontSize} ${st.fontFamily}`;
  ctx.fillStyle = st.color;
  ctx.letterSpacing = st.letterSpacing === "normal" ? "0px" : st.letterSpacing;
  ctx.textBaseline = "alphabetic";
  const range = document.createRange();
  const draw = (from: number, to: number, r: DOMRect): void => {
    const text = cased(data.slice(from, to).replace(/\s+/g, " "), st.textTransform);
    const m = ctx.measureText(text);
    const pad = (r.height - m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2;
    ctx.fillText(text, r.left, r.top + pad + m.fontBoundingBoxAscent);
  };
  // a turned marker (a heading's arrow) is drawn turned about its own centre
  if (st.transform !== "none") {
    const [a = 1, b = 0, c = 0, d = 1] = (st.transform.match(/-?[\d.e]+/g) ?? []).map(Number);
    const r = box(node.parentElement!.getBoundingClientRect());
    ctx.save();
    ctx.translate(r.left + r.width / 2, r.top + r.height / 2);
    ctx.transform(a, b, c, d, 0, 0);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(cased(data.slice(first, last), st.textTransform), 0, 0);
    ctx.restore();
    return;
  }
  range.setStart(node, first);
  range.setEnd(node, last);
  const rects = range.getClientRects();
  if (rects.length <= 1) {
    if (rects[0]) draw(first, last, box(rects[0]));
    return;
  }
  // wrapped: each line is the run of characters sharing a top
  let from = first, top = NaN, lead: DOMRect | null = null;
  for (let i = first; i <= last; i++) {
    let r: DOMRect | undefined;
    if (i < last) {
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      r = range.getClientRects()[0];
    }
    if (i === last || (r && Math.abs(r.top - top) > 1)) {
      if (lead) draw(from, i, box(lead));
      if (r) {
        from = i;
        top = r.top;
        lead = r;
      }
    }
  }
}

/** Everything inside one cell, in document order. */
function paintInside(ctx: CanvasRenderingContext2D, el: Element, box: (r: DOMRect) => DOMRect): void {
  for (const n of el.childNodes) {
    if (n instanceof Text) {
      paintText(ctx, n, box);
      continue;
    }
    if (!(n instanceof HTMLElement)) continue;
    const st = getComputedStyle(n);
    if (st.display === "none" || st.visibility !== "visible") continue;
    const r = box(n.getBoundingClientRect());
    paintBox(ctx, st, r);
    if (n instanceof HTMLImageElement) {
      if (n.complete && n.naturalWidth) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(r.left, r.top, r.width, r.height, parseFloat(st.borderTopLeftRadius) || 0);
        ctx.clip();
        ctx.drawImage(n, r.left, r.top, r.width, r.height);
        ctx.restore();
      }
      continue;
    }
    paintInside(ctx, n, box);
  }
}

/** The picture of `cells` (each on screen and laid out), cropped to their bounds over `bg`. */
export async function snapshotCells(cells: HTMLElement[], bg: string): Promise<Blob> {
  await document.fonts.ready;
  const imgs = cells.flatMap((c) => [...c.querySelectorAll("img")]);
  await Promise.all(imgs.map((i) => i.decode().catch(() => undefined)));
  const z = zoom();
  const box = (r: DOMRect): DOMRect => new DOMRect(r.x / z, r.y / z, r.width / z, r.height / z);
  const rs = cells.map((c) => box(c.getBoundingClientRect()));
  const left = Math.min(...rs.map((r) => r.left)), top = Math.min(...rs.map((r) => r.top));
  const width = Math.max(...rs.map((r) => r.right)) - left, height = Math.max(...rs.map((r) => r.bottom)) - top;
  const scale = Math.max(2, devicePixelRatio || 1);
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.translate(-left, -top);
  ctx.fillStyle = bg;
  ctx.fillRect(left, top, width, height);
  cells.forEach((c, i) => {
    const r = rs[i]!;
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.left, r.top, r.width, r.height);
    ctx.clip();
    paintBox(ctx, getComputedStyle(c), r);
    paintInside(ctx, c, box);
    ctx.restore();
  });
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no image"))), "image/png"));
}
