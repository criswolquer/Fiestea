import { db } from "./db";
import type { Item, Mask, Page, PaperColor, Point, Shape, Stroke, TemplateId, TextBox } from "./types";

export const PAPER: Record<PaperColor, { bg: string; line: string; strong: string }> = {
  white: { bg: "#ffffff", line: "#d6dde8", strong: "#f2a3a3" },
  cream: { bg: "#fbf6e9", line: "#e0d6bd", strong: "#e7a58f" },
  dark: { bg: "#1f2227", line: "#3a3f48", strong: "#7a4b52" },
  green: { bg: "#1f3a2e", line: "#2f5545", strong: "#58806c" },
};

export const TEMPLATES: { id: TemplateId; label: string }[] = [
  { id: "blank", label: "En blanco" },
  { id: "lined", label: "Rayado" },
  { id: "narrow", label: "Rayado estrecho" },
  { id: "grid", label: "Cuadrícula" },
  { id: "dotted", label: "Puntos" },
  { id: "cornell", label: "Cornell" },
  { id: "music", label: "Pentagrama" },
  { id: "todo", label: "Lista de tareas" },
  { id: "weekly", label: "Planificador semanal" },
];

/* ---------- image cache (backgrounds and pasted images) ---------- */

const imageCache = new Map<string, Promise<ImageBitmap | null>>();

export function loadImage(blobId: string): Promise<ImageBitmap | null> {
  let p = imageCache.get(blobId);
  if (!p) {
    p = db.blobs.get(blobId).then((b) => (b ? createImageBitmap(b) : null)).catch(() => null);
    imageCache.set(blobId, p);
  }
  return p;
}

/** Synchronous lookup used while drawing; returns null until the bitmap is ready. */
const ready = new Map<string, ImageBitmap>();
export async function preloadPageImages(page: Page): Promise<void> {
  const ids: string[] = [];
  if (page.backgroundBlobId) ids.push(page.backgroundBlobId);
  for (const l of page.layers) for (const it of l.items) if (it.type === "image") ids.push(it.blobId);
  await Promise.all(
    ids.map(async (id) => {
      const bmp = await loadImage(id);
      if (bmp) ready.set(id, bmp);
    }),
  );
}

/* ---------- paper ---------- */

export function drawPaper(ctx: CanvasRenderingContext2D, page: Page): void {
  const { width: W, height: H } = page;
  const c = PAPER[page.paper];
  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, W, H);

  const bg = page.backgroundBlobId ? ready.get(page.backgroundBlobId) : undefined;
  if (bg) {
    ctx.drawImage(bg, 0, 0, page.bgW ?? W, page.bgH ?? H);
    return;
  }

  ctx.save();
  ctx.strokeStyle = c.line;
  ctx.fillStyle = c.line;
  ctx.lineWidth = 1;
  const hline = (y: number) => {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  };
  const vline = (x: number, y0 = 0, y1 = H) => {
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y1);
    ctx.stroke();
  };

  switch (page.template) {
    case "lined":
    case "narrow": {
      const gap = page.template === "lined" ? 36 : 26;
      for (let y = 110; y < H - 20; y += gap) hline(y);
      ctx.strokeStyle = c.strong;
      vline(80);
      break;
    }
    case "grid":
      for (let y = 25; y < H; y += 25) hline(y);
      for (let x = 25; x < W; x += 25) vline(x);
      break;
    case "dotted":
      for (let y = 25; y < H; y += 25)
        for (let x = 25; x < W; x += 25) {
          ctx.beginPath();
          ctx.arc(x, y, 1.4, 0, Math.PI * 2);
          ctx.fill();
        }
      break;
    case "cornell": {
      for (let y = 110; y < H - 220; y += 32) hline(y);
      ctx.strokeStyle = c.strong;
      ctx.lineWidth = 2;
      hline(80);
      vline(W * 0.3, 80, H - 200);
      hline(H - 200);
      ctx.fillStyle = c.strong;
      ctx.font = "14px system-ui";
      ctx.fillText("Ideas clave", 16, 104);
      ctx.fillText("Apuntes", W * 0.3 + 16, 104);
      ctx.fillText("Resumen", 16, H - 176);
      break;
    }
    case "music": {
      let y = 110;
      while (y + 48 < H - 40) {
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.moveTo(50, y + i * 10);
          ctx.lineTo(W - 50, y + i * 10);
          ctx.stroke();
        }
        y += 100;
      }
      break;
    }
    case "todo": {
      for (let y = 120; y < H - 30; y += 44) {
        hline(y + 10);
        ctx.strokeRect(40, y - 14, 18, 18);
      }
      break;
    }
    case "weekly": {
      const days = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo", "Notas"];
      const top = 70;
      const rows = 4;
      const rh = (H - top - 20) / rows;
      ctx.font = "15px system-ui";
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 8; i++) {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = 20 + col * ((W - 40) / 2);
        const y = top + row * rh;
        ctx.strokeRect(x, y, (W - 40) / 2, rh);
        ctx.fillText(days[i], x + 12, y + 24);
      }
      break;
    }
    case "blank":
      break;
  }
  ctx.restore();
}

/* ---------- strokes ---------- */

function mid(a: Point, b: Point): [number, number] {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

function smoothPath(ctx: CanvasRenderingContext2D, pts: Point[]): void {
  ctx.beginPath();
  if (pts.length === 1) {
    ctx.moveTo(pts[0][0], pts[0][1]);
    ctx.lineTo(pts[0][0] + 0.01, pts[0][1]);
    return;
  }
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const [mx, my] = mid(pts[i], pts[i + 1]);
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last[0], last[1]);
}

/** Variable-width stroke: one short segment per point pair, width driven by pressure or speed. */
function variableWidth(ctx: CanvasRenderingContext2D, s: Stroke, widthAt: (i: number) => number): void {
  const pts = s.points;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (pts.length < 3) {
    ctx.lineWidth = widthAt(0);
    smoothPath(ctx, pts);
    ctx.stroke();
    return;
  }
  let prev = mid(pts[0], pts[1]);
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  ctx.lineTo(prev[0], prev[1]);
  ctx.lineWidth = widthAt(0);
  ctx.stroke();
  for (let i = 1; i < pts.length - 1; i++) {
    const m = mid(pts[i], pts[i + 1]);
    ctx.beginPath();
    ctx.moveTo(prev[0], prev[1]);
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
    ctx.lineWidth = widthAt(i);
    ctx.stroke();
    prev = m;
  }
}

function pressureOf(p: Point): number {
  // Mouse and finger report 0.5 (or 0); keep a sensible default.
  return p[2] > 0 ? p[2] : 0.5;
}

export function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke, alphaMul = 1): void {
  const pts = s.points;
  if (!pts.length) return;
  ctx.save();
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.globalAlpha = alphaMul;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  switch (s.pen) {
    case "pen":
      variableWidth(ctx, s, (i) => s.width * (0.55 + 0.9 * pressureOf(pts[i])));
      break;
    case "fountain": {
      // Width depends on stroke direction like a chisel nib, plus pressure.
      variableWidth(ctx, s, (i) => {
        const a = pts[Math.max(0, i - 1)];
        const b = pts[Math.min(pts.length - 1, i + 1)];
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const nib = Math.abs(Math.sin(ang - Math.PI / 4));
        return s.width * (0.35 + 1.3 * nib) * (0.6 + 0.8 * pressureOf(pts[i]));
      });
      break;
    }
    case "brush": {
      // Width shrinks with speed, like ink running out on fast strokes.
      variableWidth(ctx, s, (i) => {
        const a = pts[Math.max(0, i - 1)];
        const b = pts[i];
        const speed = Math.hypot(b[0] - a[0], b[1] - a[1]);
        return s.width * Math.max(0.35, 2.2 - speed / 10) * (0.5 + pressureOf(b));
      });
      break;
    }
    case "pencil": {
      ctx.globalAlpha = 0.75 * alphaMul;
      variableWidth(ctx, s, (i) => s.width * (0.4 + 0.6 * pressureOf(pts[i])));
      // Graphite grain: a lighter offset pass.
      ctx.globalAlpha = 0.25 * alphaMul;
      ctx.lineWidth = Math.max(0.6, s.width * 0.4);
      ctx.beginPath();
      pts.forEach((p, i) => {
        const j = ((i * 7919) % 5) / 5 - 0.4;
        if (i === 0) ctx.moveTo(p[0] + j, p[1] - j);
        else ctx.lineTo(p[0] + j, p[1] - j);
      });
      ctx.stroke();
      break;
    }
    case "highlighter":
      ctx.globalAlpha = 0.35 * alphaMul;
      ctx.lineCap = "butt";
      ctx.lineJoin = "round";
      ctx.lineWidth = s.width * 4;
      smoothPath(ctx, pts);
      ctx.stroke();
      break;
    case "dashed":
    case "dotted":
      ctx.lineWidth = s.width;
      ctx.setLineDash(s.pen === "dashed" ? [s.width * 3, s.width * 2.5] : [0.1, s.width * 2.2]);
      smoothPath(ctx, pts);
      ctx.stroke();
      break;
    case "wavy":
      ctx.lineWidth = s.width;
      wavyPath(ctx, pts, Math.max(3, s.width * 1.6), Math.max(10, s.width * 5));
      ctx.stroke();
      break;
  }
  ctx.restore();
}

function wavyPath(ctx: CanvasRenderingContext2D, pts: Point[], amp: number, wavelength: number): void {
  ctx.beginPath();
  if (pts.length < 2) {
    smoothPath(ctx, pts);
    return;
  }
  // Resample along the path, offsetting perpendicular by a sine of distance travelled.
  let dist = 0;
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (seg === 0) continue;
    const nx = -(b[1] - a[1]) / seg;
    const ny = (b[0] - a[0]) / seg;
    const steps = Math.max(1, Math.ceil(seg / 2));
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      const d = dist + seg * t;
      const off = Math.sin((d / wavelength) * Math.PI * 2) * amp;
      ctx.lineTo(a[0] + (b[0] - a[0]) * t + nx * off, a[1] + (b[1] - a[1]) * t + ny * off);
    }
    dist += seg;
  }
}

/* ---------- shapes, text, images ---------- */

export function drawShape(ctx: CanvasRenderingContext2D, s: Shape): void {
  ctx.save();
  ctx.strokeStyle = s.color;
  ctx.lineWidth = s.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (s.dashed) ctx.setLineDash([s.width * 3, s.width * 2.5]);
  const { x1, y1, x2, y2 } = s;
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const w = Math.abs(x2 - x1);
  const h = Math.abs(y2 - y1);
  ctx.beginPath();
  switch (s.shape) {
    case "line":
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      break;
    case "arrow": {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const head = Math.max(12, s.width * 4);
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - head * Math.cos(ang - 0.45), y2 - head * Math.sin(ang - 0.45));
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - head * Math.cos(ang + 0.45), y2 - head * Math.sin(ang + 0.45));
      break;
    }
    case "rect":
      ctx.rect(x, y, w, h);
      break;
    case "ellipse":
      ctx.ellipse(x + w / 2, y + h / 2, Math.max(1, w / 2), Math.max(1, h / 2), 0, 0, Math.PI * 2);
      break;
    case "triangle":
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
      ctx.closePath();
      break;
  }
  ctx.stroke();
  ctx.restore();
}

export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(" ");
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxW && line) {
        out.push(line);
        line = w;
      } else line = test;
    }
    out.push(line);
  }
  return out;
}

export function drawText(ctx: CanvasRenderingContext2D, t: TextBox): void {
  ctx.save();
  ctx.fillStyle = t.color;
  ctx.font = `${t.size}px "Segoe UI", system-ui, sans-serif`;
  ctx.textBaseline = "top";
  const lines = wrapText(ctx, t.text, t.w);
  lines.forEach((l, i) => ctx.fillText(l, t.x, t.y + i * t.size * 1.3));
  ctx.restore();
}

export function textHeight(t: TextBox): number {
  const c = document.createElement("canvas").getContext("2d")!;
  c.font = `${t.size}px "Segoe UI", system-ui, sans-serif`;
  return wrapText(c, t.text, t.w).length * t.size * 1.3;
}

export function drawItem(ctx: CanvasRenderingContext2D, it: Item, alpha = 1): void {
  switch (it.type) {
    case "stroke":
      drawStroke(ctx, it, alpha);
      break;
    case "shape":
      ctx.globalAlpha = alpha;
      drawShape(ctx, it);
      ctx.globalAlpha = 1;
      break;
    case "text":
      ctx.globalAlpha = alpha;
      drawText(ctx, it);
      ctx.globalAlpha = 1;
      break;
    case "image": {
      const bmp = ready.get(it.blobId);
      if (bmp) {
        ctx.globalAlpha = alpha;
        ctx.drawImage(bmp, it.x, it.y, it.w, it.h);
        ctx.globalAlpha = 1;
      }
      break;
    }
  }
}

export function drawMask(ctx: CanvasRenderingContext2D, m: Mask, revealed: boolean): void {
  ctx.save();
  if (revealed) {
    ctx.strokeStyle = m.color;
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 2;
    ctx.strokeRect(m.x, m.y, m.w, m.h);
  } else {
    ctx.fillStyle = m.color;
    ctx.fillRect(m.x, m.y, m.w, m.h);
    ctx.fillStyle = "rgba(255,255,255,.85)";
    ctx.font = "600 14px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (m.w > 60 && m.h > 24) ctx.fillText("Toca para ver", m.x + m.w / 2, m.y + m.h / 2);
  }
  ctx.restore();
}

export interface RenderOptions {
  activeLayer?: number;
  /** Fade layers other than the active one. */
  dimOthers?: boolean;
  revealed?: Set<string>;
  hideMasks?: boolean;
}

export function renderPage(ctx: CanvasRenderingContext2D, page: Page, opts: RenderOptions = {}): void {
  drawPaper(ctx, page);
  page.layers.forEach((layer, i) => {
    if (!layer.visible) return;
    const alpha = opts.dimOthers && opts.activeLayer !== undefined && i !== opts.activeLayer ? 0.35 : 1;
    for (const it of layer.items) drawItem(ctx, it, alpha);
  });
  if (!opts.hideMasks) for (const m of page.masks) drawMask(ctx, m, opts.revealed?.has(m.id) ?? false);
}

/** Renders a page to a new canvas at the given scale (for thumbnails, export and AI). */
export async function pageToCanvas(page: Page, scale: number, opts: RenderOptions = {}): Promise<HTMLCanvasElement> {
  await preloadPageImages(page);
  const c = document.createElement("canvas");
  c.width = Math.round(page.width * scale);
  c.height = Math.round(page.height * scale);
  const ctx = c.getContext("2d")!;
  ctx.scale(scale, scale);
  renderPage(ctx, page, opts);
  return c;
}

/* ---------- geometry helpers ---------- */

export function itemBounds(it: Item): { x: number; y: number; w: number; h: number } {
  switch (it.type) {
    case "stroke": {
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const p of it.points) {
        minX = Math.min(minX, p[0]);
        minY = Math.min(minY, p[1]);
        maxX = Math.max(maxX, p[0]);
        maxY = Math.max(maxY, p[1]);
      }
      const pad = it.width * (it.pen === "highlighter" ? 2 : 1);
      return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
    }
    case "shape":
      return {
        x: Math.min(it.x1, it.x2) - it.width,
        y: Math.min(it.y1, it.y2) - it.width,
        w: Math.abs(it.x2 - it.x1) + it.width * 2,
        h: Math.abs(it.y2 - it.y1) + it.width * 2,
      };
    case "text":
      return { x: it.x, y: it.y, w: it.w, h: textHeight(it) };
    case "image":
      return { x: it.x, y: it.y, w: it.w, h: it.h };
  }
}

function distToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  let t = len ? ((px - ax) * dx + (py - ay) * dy) / len : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Whether an eraser circle at (x, y) with radius r touches the item. */
export function hitItem(it: Item, x: number, y: number, r: number): boolean {
  const b = itemBounds(it);
  if (x < b.x - r || x > b.x + b.w + r || y < b.y - r || y > b.y + b.h + r) return false;
  switch (it.type) {
    case "stroke": {
      const tol = r + it.width * (it.pen === "highlighter" ? 2 : 0.5);
      const p = it.points;
      if (p.length === 1) return Math.hypot(p[0][0] - x, p[0][1] - y) <= tol;
      for (let i = 1; i < p.length; i++) if (distToSeg(x, y, p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]) <= tol) return true;
      return false;
    }
    case "shape": {
      const tol = r + it.width;
      const { x1, y1, x2, y2 } = it;
      if (it.shape === "line" || it.shape === "arrow") return distToSeg(x, y, x1, y1, x2, y2) <= tol;
      const minX = Math.min(x1, x2),
        maxX = Math.max(x1, x2),
        minY = Math.min(y1, y2),
        maxY = Math.max(y1, y2);
      if (it.shape === "ellipse") {
        const cx = (minX + maxX) / 2,
          cy = (minY + maxY) / 2,
          rx = Math.max(1, (maxX - minX) / 2),
          ry = Math.max(1, (maxY - minY) / 2);
        const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
        return Math.abs(d - 1) * Math.min(rx, ry) <= tol;
      }
      if (it.shape === "triangle") {
        const ax = (minX + maxX) / 2;
        return (
          distToSeg(x, y, ax, minY, maxX, maxY) <= tol ||
          distToSeg(x, y, maxX, maxY, minX, maxY) <= tol ||
          distToSeg(x, y, minX, maxY, ax, minY) <= tol
        );
      }
      return (
        distToSeg(x, y, minX, minY, maxX, minY) <= tol ||
        distToSeg(x, y, maxX, minY, maxX, maxY) <= tol ||
        distToSeg(x, y, maxX, maxY, minX, maxY) <= tol ||
        distToSeg(x, y, minX, maxY, minX, minY) <= tol
      );
    }
    case "text":
    case "image":
      return true;
  }
}

/**
 * Recognises a hand-drawn stroke as a straight line, rectangle, ellipse or triangle
 * ("hold to snap"). Returns null when nothing fits well.
 */
export function recognizeShape(pts: Point[]): Omit<Shape, "id" | "color" | "width"> | null {
  if (pts.length < 4) return null;
  const b = itemBounds({ id: "", type: "stroke", pen: "pen", color: "", width: 0, points: pts });
  const first = pts[0];
  const last = pts[pts.length - 1];
  const diag = Math.hypot(b.w, b.h);
  if (diag < 20) return null;

  let pathLen = 0;
  for (let i = 1; i < pts.length; i++) pathLen += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const chord = Math.hypot(last[0] - first[0], last[1] - first[1]);

  // Open stroke that is nearly straight -> line.
  if (chord > 0.85 * pathLen) {
    return { type: "shape", shape: "line", x1: first[0], y1: first[1], x2: last[0], y2: last[1] };
  }
  // Closed strokes only from here.
  if (chord > 0.25 * diag) return null;

  const x = b.x,
    y = b.y,
    w = b.w,
    h = b.h;
  const cx = x + w / 2,
    cy = y + h / 2;

  // Ellipse fit: mean deviation of normalised radius from 1.
  let ellErr = 0;
  for (const p of pts) ellErr += Math.abs(Math.hypot((p[0] - cx) / (w / 2), (p[1] - cy) / (h / 2)) - 1);
  ellErr /= pts.length;

  // Rectangle fit: mean distance to the nearest box edge, normalised.
  let rectErr = 0;
  for (const p of pts) {
    const d = Math.min(Math.abs(p[0] - x), Math.abs(p[0] - (x + w)), Math.abs(p[1] - y), Math.abs(p[1] - (y + h)));
    rectErr += d / Math.min(w, h);
  }
  rectErr /= pts.length;

  // Triangle fit: distance to the three edges of an isosceles triangle in the box.
  let triErr = 0;
  for (const p of pts) {
    const d = Math.min(
      distToSeg(p[0], p[1], cx, y, x + w, y + h),
      distToSeg(p[0], p[1], x + w, y + h, x, y + h),
      distToSeg(p[0], p[1], x, y + h, cx, y),
    );
    triErr += d / Math.min(w, h);
  }
  triErr /= pts.length;

  const best = Math.min(ellErr, rectErr, triErr);
  if (best > 0.16) return null;
  const shape = best === rectErr ? "rect" : best === ellErr ? "ellipse" : "triangle";
  return { type: "shape", shape, x1: x, y1: y, x2: x + w, y2: y + h };
}
