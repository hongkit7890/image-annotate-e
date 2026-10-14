var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => ImageAnnotatEPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian3 = require("obsidian");

// src/annotateModal.ts
var import_obsidian2 = require("obsidian");

// src/annotations.ts
function normRect(a, b) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y)
  };
}
function textFontSize(a) {
  return (12 + a.thickness * 2.5) * a.s;
}
function badgeRadius(a) {
  return (9 + a.thickness * 1.5) * a.s;
}
function borderWidth(a) {
  return (1.5 + a.thickness * 0.3) * a.s;
}
function highlightWidth(a) {
  return Math.max(12, a.thickness * 4) * a.s;
}
function arrowGeometry(a) {
  const dx = a.b.x - a.a.x;
  const dy = a.b.y - a.a.y;
  const len = Math.hypot(dx, dy);
  let neck = (2.5 + a.thickness * 1) * a.s;
  let headHalf = neck * 2.6;
  let headLen = headHalf * 1.8;
  const maxHead = len * 0.6;
  if (headLen > maxHead && headLen > 0) {
    const k = maxHead / headLen;
    neck *= k;
    headHalf *= k;
    headLen *= k;
  }
  return { len, ux: dx / (len || 1), uy: dy / (len || 1), neck, headHalf, headLen };
}
function drawAnnotation(ctx, a) {
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  switch (a.kind) {
    case "pen":
    case "highlight":
      drawFreehand(ctx, a);
      break;
    case "arrow":
      drawArrow(ctx, a);
      break;
    case "rect":
    case "ellipse":
      drawShape(ctx, a);
      break;
    case "badge":
      drawBadge(ctx, a);
      break;
    case "text":
      drawText(ctx, a);
      break;
  }
  ctx.restore();
}
function tracePolyline(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  if (pts.length === 1) ctx.lineTo(pts[0].x + 0.01, pts[0].y + 0.01);
  for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
}
function drawFreehand(ctx, a) {
  if (a.points.length === 0) return;
  tracePolyline(ctx, a.points);
  if (a.kind === "highlight") {
    ctx.globalCompositeOperation = "multiply";
    ctx.strokeStyle = hexToRgba(a.color, 0.35);
    ctx.lineWidth = highlightWidth(a);
    ctx.stroke();
    return;
  }
  const w = a.thickness * a.s;
  if (a.border) {
    ctx.strokeStyle = a.border;
    ctx.lineWidth = w + borderWidth(a) * 2;
    ctx.stroke();
  }
  ctx.strokeStyle = a.color;
  ctx.lineWidth = w;
  ctx.stroke();
}
function drawArrow(ctx, a) {
  const g = arrowGeometry(a);
  if (g.len < 2) return;
  const nx = -g.uy;
  const ny = g.ux;
  const tail = g.neck * 0.2;
  const notch = g.headLen * 0.78;
  const pt = (along, side) => [
    a.b.x - g.ux * along + nx * side,
    a.b.y - g.uy * along + ny * side
  ];
  const poly = [
    [a.a.x + nx * tail, a.a.y + ny * tail],
    pt(notch, g.neck),
    pt(g.headLen, g.headHalf),
    [a.b.x, a.b.y],
    pt(g.headLen, -g.headHalf),
    pt(notch, -g.neck),
    [a.a.x - nx * tail, a.a.y - ny * tail]
  ];
  ctx.beginPath();
  ctx.moveTo(poly[0][0], poly[0][1]);
  for (const [x, y] of poly.slice(1)) ctx.lineTo(x, y);
  ctx.closePath();
  ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
  ctx.shadowBlur = 4 * a.s;
  ctx.shadowOffsetY = 1 * a.s;
  if (a.border) {
    ctx.strokeStyle = a.border;
    ctx.lineWidth = Math.max(3, g.neck * 0.7);
    ctx.stroke();
    ctx.shadowColor = "transparent";
  }
  ctx.fillStyle = a.color;
  ctx.fill();
}
function drawShape(ctx, a) {
  const { x, y, w, h } = normRect(a.a, a.b);
  const lw = a.thickness * a.s;
  ctx.beginPath();
  if (a.kind === "ellipse") {
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else {
    ctx.rect(x, y, w, h);
  }
  if (a.border) {
    ctx.strokeStyle = a.border;
    ctx.lineWidth = lw + borderWidth(a) * 2;
    ctx.stroke();
  }
  ctx.strokeStyle = a.color;
  ctx.lineWidth = lw;
  ctx.stroke();
}
function drawBadge(ctx, a) {
  const r = badgeRadius(a);
  ctx.beginPath();
  ctx.arc(a.p.x, a.p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = a.color;
  ctx.fill();
  if (a.border) {
    ctx.strokeStyle = a.border;
    ctx.lineWidth = 2 * a.s;
    ctx.stroke();
  }
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${Math.floor(r * 1.1)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(a.label, a.p.x, a.p.y + a.s);
}
function drawText(ctx, a) {
  const fs = textFontSize(a);
  ctx.font = `bold ${fs}px sans-serif`;
  ctx.textBaseline = "top";
  if (a.border) {
    ctx.strokeStyle = a.border;
    ctx.lineWidth = fs * 0.16;
    ctx.strokeText(a.text, a.p.x, a.p.y);
  }
  ctx.fillStyle = a.color;
  ctx.fillText(a.text, a.p.x, a.p.y);
}
function annotationBounds(ctx, a) {
  switch (a.kind) {
    case "pen":
    case "highlight": {
      const pad = (a.kind === "highlight" ? highlightWidth(a) : a.thickness * a.s + borderWidth(a) * 2) / 2;
      const xs = a.points.map((p) => p.x);
      const ys = a.points.map((p) => p.y);
      return padRect(
        { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) },
        pad
      );
    }
    case "arrow": {
      const g = arrowGeometry(a);
      return padRect(normRect(a.a, a.b), g.headHalf);
    }
    case "rect":
    case "ellipse":
      return padRect(normRect(a.a, a.b), a.thickness * a.s / 2 + borderWidth(a));
    case "badge": {
      const r = badgeRadius(a);
      return { x: a.p.x - r, y: a.p.y - r, w: r * 2, h: r * 2 };
    }
    case "text": {
      const fs = textFontSize(a);
      ctx.save();
      ctx.font = `bold ${fs}px sans-serif`;
      const w = ctx.measureText(a.text).width;
      ctx.restore();
      return padRect({ x: a.p.x, y: a.p.y, w, h: fs }, fs * 0.1);
    }
  }
}
function hitTest(ctx, a, p, tol) {
  switch (a.kind) {
    case "pen":
    case "highlight": {
      const half = (a.kind === "highlight" ? highlightWidth(a) : a.thickness * a.s + borderWidth(a) * 2) / 2;
      return distToPolyline(p, a.points) <= half + tol;
    }
    case "arrow": {
      const g = arrowGeometry(a);
      const nearHead = Math.hypot(p.x - a.b.x, p.y - a.b.y) <= g.headLen + tol;
      return nearHead || distToSegment(p, a.a, a.b) <= g.neck + tol;
    }
    case "rect": {
      const r = normRect(a.a, a.b);
      const edge = a.thickness * a.s / 2 + borderWidth(a) + tol;
      const inOuter = inRect(p, padRect(r, edge));
      const inInner = r.w > edge * 2 && r.h > edge * 2 && inRect(p, padRect(r, -edge));
      return inOuter && !inInner;
    }
    case "ellipse": {
      const r = normRect(a.a, a.b);
      const rx = r.w / 2 || 1;
      const ry = r.h / 2 || 1;
      const d = Math.hypot((p.x - (r.x + rx)) / rx, (p.y - (r.y + ry)) / ry);
      return Math.abs(d - 1) * Math.min(rx, ry) <= a.thickness * a.s / 2 + borderWidth(a) + tol;
    }
    case "badge":
      return Math.hypot(p.x - a.p.x, p.y - a.p.y) <= badgeRadius(a) + tol;
    case "text":
      return inRect(p, padRect(annotationBounds(ctx, a), tol));
  }
}
function mapAnnotation(a, f) {
  switch (a.kind) {
    case "pen":
    case "highlight":
      a.points = a.points.map(f);
      break;
    case "arrow":
    case "rect":
    case "ellipse":
      a.a = f(a.a);
      a.b = f(a.b);
      break;
    case "badge":
    case "text":
      a.p = f(a.p);
      break;
  }
}
function translateAnnotation(a, dx, dy) {
  mapAnnotation(a, (p) => ({ x: p.x + dx, y: p.y + dy }));
}
function cloneAnnotation(a) {
  return JSON.parse(JSON.stringify(a));
}
function padRect(r, pad) {
  return { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 };
}
function inRect(p, r) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}
function distToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
function distToPolyline(p, pts) {
  if (pts.length === 1) return Math.hypot(p.x - pts[0].x, p.y - pts[0].y);
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) best = Math.min(best, distToSegment(p, pts[i - 1], pts[i]));
  return best;
}
function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${alpha})`;
}

// src/resolveImage.ts
var import_obsidian = require("obsidian");
var IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp)$/i;
function isImageFile(file) {
  return IMAGE_EXT.test(`.${file.extension}`) || IMAGE_EXT.test(file.name);
}
function cleanLinkpath(raw) {
  let e = (raw || "").trim();
  e = e.replace(/^app:\/\/local\/[^/]+\//i, "");
  e = e.replace(/^app:\/\//i, "");
  e = e.split("#")[0].split("?")[0].split("|")[0];
  try {
    e = decodeURIComponent(e);
  } catch {
  }
  return e.replace(/^\/+/, "");
}
function isExternal(src) {
  return /^(https?:|data:|blob:|file:)/i.test(src.trim());
}
function resolveImageFromElement(app, el) {
  const img = el instanceof HTMLImageElement ? el : el.closest("img");
  if (!img) {
    const embedOnly = el.closest(".internal-embed") || el.closest(".image-embed") || el.closest(".media-embed");
    if (embedOnly) {
      const linkpath = embedOnly.getAttribute("src");
      if (linkpath) return resolveLinkpath(app, linkpath);
    }
    return null;
  }
  const embed = img.closest(".internal-embed") || img.closest(".image-embed") || img.closest(".media-embed");
  if (embed) {
    const linkpath = embed.getAttribute("src");
    if (linkpath) {
      const file = resolveLinkpath(app, linkpath);
      if (file) return file;
    }
  }
  const alt = img.getAttribute("alt");
  if (alt && IMAGE_EXT.test(alt)) {
    const file = resolveLinkpath(app, alt);
    if (file) return file;
  }
  const attrSrc = img.getAttribute("src");
  if (attrSrc && !isExternal(attrSrc)) {
    const file = resolveLinkpath(app, attrSrc);
    if (file) return file;
  }
  return resolveFromSrcUrl(app, img.src);
}
function refreshImageEmbeds(app, file) {
  const base = app.vault.getResourcePath(file);
  const fresh = `${base}${base.includes("?") ? "&" : "?"}iae=${Date.now()}`;
  let count = 0;
  for (const img of Array.from(document.querySelectorAll("img"))) {
    if (img.closest(".iae-modal")) continue;
    if (resolveImageFromElement(app, img) !== file) continue;
    img.src = fresh;
    count++;
  }
  return count;
}
function resolveLinkpath(app, linkpath) {
  const cleaned = cleanLinkpath(linkpath);
  if (!cleaned || isExternal(cleaned)) return null;
  const sourcePath = app.workspace.getActiveFile()?.path ?? "";
  const dest = app.metadataCache.getFirstLinkpathDest(cleaned, sourcePath);
  if (dest instanceof import_obsidian.TFile && isImageFile(dest)) return dest;
  const byPath = app.vault.getAbstractFileByPath(cleaned);
  if (byPath instanceof import_obsidian.TFile && isImageFile(byPath)) return byPath;
  const base = cleaned.split("/").pop() ?? "";
  if (!base) return null;
  const activeFolder = app.workspace.getActiveFile()?.parent?.path ?? "";
  const files = app.vault.getFiles().filter(isImageFile);
  return files.find((f) => f.name === base && f.parent?.path === activeFolder) || files.find((f) => f.name === base) || null;
}
function resolveFromSrcUrl(app, src) {
  if (!src) return null;
  try {
    const url = new URL(src);
    let path = cleanLinkpath(url.pathname);
    const files = app.vault.getFiles().filter(isImageFile);
    let best = null;
    for (const file of files) {
      if (path === file.path || path.endsWith("/" + file.path) || path.endsWith(file.path)) {
        if (!best || file.path.length > best.path.length) best = file;
      }
    }
    if (best) return best;
    const basename = path.split("/").pop() ?? "";
    if (basename) {
      const activeFolder = app.workspace.getActiveFile()?.parent?.path ?? "";
      return files.find((f) => f.name === basename && f.parent?.path === activeFolder) || files.find((f) => f.name === basename) || null;
    }
  } catch {
  }
  return null;
}

// src/annotateModal.ts
var COLORS = [
  "#7852ee",
  "#d32f2f",
  "#e91e8c",
  "#fb8c00",
  "#fdd835",
  "#43a047",
  "#1e88e5",
  "#8e24aa",
  "#212121",
  "#ffffff"
];
var HINTS = {
  select: "Click a drawing to select it. Drag to move, Alt+drag or Ctrl+D to copy, Ctrl+C / Ctrl+V to copy and paste, Delete to remove.",
  pen: "Freehand draw.",
  text: "Click where you want to add text.",
  highlight: "Highlight with a thick translucent stroke.",
  shapes: "Drag to draw a shape.",
  arrow: "Drag to draw an arrow.",
  badge: "Click to place a numbered badge.",
  blur: "Drag a rectangle to blur/pixelate that area.",
  crop: "Drag to select a crop region, then release to apply."
};
var AnnotateModal = class extends import_obsidian2.Modal {
  constructor(app, file) {
    super(app);
    this.cropOverlay = null;
    this.toolButtons = /* @__PURE__ */ new Map();
    this.resizeObserver = null;
    this.tool = "arrow";
    this.color = "#7852ee";
    this.highlightColor = "#ffeb3b";
    this.borderOn = true;
    this.borderColor = "#ffffff";
    this.thickness = 4;
    this.shapeKind = "rect";
    this.badgeCounter = 1;
    /** Image pixels, including blur/crop/rotate. Never mutated in place, so history can share it. */
    this.base = null;
    this.originalBase = null;
    /** Drawings, rendered over `base` in order. */
    this.objects = [];
    this.draft = null;
    this.selected = null;
    this.clipboard = null;
    this.pasteCount = 0;
    this.blurPreview = null;
    this.drawing = false;
    this.start = null;
    this.last = null;
    this.dragMoved = false;
    this.undoStack = [];
    this.redoStack = [];
    this.textEdit = null;
    this.saving = false;
    this.file = file;
  }
  async onOpen() {
    const { contentEl, modalEl } = this;
    modalEl.addClass("iae-modal");
    contentEl.empty();
    contentEl.addClass("iae-modal-content");
    const shell = contentEl.createDiv({ cls: "iae-shell" });
    this.buildToolbar(shell);
    this.stageWrap = shell.createDiv({ cls: "iae-stage-wrap" });
    this.hintEl = this.stageWrap.createDiv({ cls: "iae-hint" });
    this.setHint(`Loading ${this.file.name}\u2026`);
    this.stage = this.stageWrap.createDiv({ cls: "iae-stage" });
    this.canvas = this.stage.createEl("canvas");
    const ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      new import_obsidian2.Notice("Could not initialize canvas.");
      this.close();
      return;
    }
    this.ctx = ctx;
    this.setTool("arrow");
    this.bindCanvasEvents();
    this.bindShortcuts();
    this.resizeObserver = new ResizeObserver(() => this.fitStage());
    this.resizeObserver.observe(this.stageWrap);
    try {
      await this.loadImage();
      this.setHint("Drag to draw an arrow, or pick another tool.");
    } catch (err) {
      console.error("ImageAnnotatE load failed", err);
      new import_obsidian2.Notice(`Failed to load image: ${this.file.path}`);
      this.setHint("Failed to load image. Try Annotate from the file explorer.");
    }
  }
  onClose() {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.finishText(false);
    this.contentEl.empty();
  }
  buildToolbar(parent) {
    const bar = parent.createDiv({ cls: "iae-toolbar" });
    const tools = [
      { id: "select", label: "Select", icon: selectIcon, key: "V" },
      { id: "pen", label: "Pen", icon: penIcon, key: "P" },
      { id: "text", label: "Text", icon: textIcon, key: "T" },
      { id: "highlight", label: "Highlight", icon: highlightIcon },
      { id: "shapes", label: "Shapes", icon: shapesIcon, key: "S" },
      { id: "arrow", label: "Arrow", icon: arrowIcon, key: "A" },
      { id: "badge", label: "Badge", icon: badgeIcon, key: "B" }
    ];
    for (const t of tools) {
      const btn = makeToolButton(bar, t.label, t.icon, t.key ? `${t.label} (${t.key})` : t.label);
      btn.addEventListener("click", () => this.setTool(t.id));
      this.toolButtons.set(t.id, btn);
    }
    bar.createDiv({ cls: "iae-sep" });
    const rotateBtn = makeToolButton(bar, "Rotate", rotateIcon, "Rotate (R)");
    rotateBtn.addEventListener("click", () => this.rotateImage());
    const blurBtn = makeToolButton(bar, "Blur", blurIcon, "Blur (U)");
    blurBtn.addEventListener("click", () => this.setTool("blur"));
    this.toolButtons.set("blur", blurBtn);
    const cropBtn = makeToolButton(bar, "Crop", cropIcon);
    cropBtn.addEventListener("click", () => this.setTool("crop"));
    this.toolButtons.set("crop", cropBtn);
    bar.createDiv({ cls: "iae-sep" });
    const colorWrap = bar.createDiv({ cls: "iae-tool" });
    const colorInput = colorWrap.createEl("input", {
      cls: "iae-color-swatch",
      attr: { type: "color", value: this.color, title: "Color (C)" }
    });
    this.colorInput = colorInput;
    colorInput.addEventListener("input", () => this.setActiveColor(colorInput.value));
    const code = colorWrap.createEl("input", {
      cls: "iae-color-code",
      attr: { type: "text", spellcheck: "false", title: "Hex (#7852EE) or RGB (120, 82, 238)" }
    });
    this.colorCode = code;
    const applyCode = () => {
      const parsed = parseColor(code.value);
      code.toggleClass("is-invalid", !parsed);
      if (parsed) this.setActiveColor(parsed);
    };
    code.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        ev.stopPropagation();
        applyCode();
        if (!code.hasClass("is-invalid")) code.blur();
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation();
        this.syncColorUI();
        code.blur();
      }
    });
    code.addEventListener("blur", () => {
      if (parseColor(code.value)) applyCode();
      else this.syncColorUI();
    });
    const palette = bar.createDiv({ cls: "iae-tool iae-palette" });
    for (const c of COLORS) {
      const sw = palette.createEl("button", {
        cls: "iae-palette-swatch",
        attr: { type: "button", title: c }
      });
      sw.setCssStyles({ background: c });
      sw.addEventListener("click", () => this.setActiveColor(c));
    }
    const borderWrap = bar.createDiv({ cls: "iae-tool iae-border" });
    const borderRow = borderWrap.createDiv({ cls: "iae-border-row" });
    const borderToggle = borderRow.createEl("input", {
      attr: { type: "checkbox", title: "Show border" }
    });
    borderToggle.checked = this.borderOn;
    const borderSwatch = borderRow.createEl("input", {
      cls: "iae-color-swatch iae-border-swatch",
      attr: { type: "color", value: this.borderColor, title: "Border color" }
    });
    borderWrap.createSpan({ cls: "iae-tool-label", text: "Border" });
    borderToggle.addEventListener("change", () => {
      this.borderOn = borderToggle.checked;
      borderSwatch.disabled = !this.borderOn;
      this.styleTextInput();
    });
    borderSwatch.addEventListener("input", () => {
      this.borderColor = borderSwatch.value;
      this.styleTextInput();
    });
    const thick = bar.createDiv({ cls: "iae-thickness" });
    appendSvg(thick, thicknessIcon);
    const range = thick.createEl("input", {
      attr: { type: "range", min: "1", max: "40", value: String(this.thickness) }
    });
    range.addEventListener("input", () => {
      this.thickness = Number(range.value);
      this.styleTextInput();
    });
    thick.createSpan({ cls: "iae-tool-label", text: "Thickness" });
    bar.createDiv({ cls: "iae-sep" });
    const actions = bar.createDiv({ cls: "iae-actions" });
    const undo = actions.createEl("button", { cls: "iae-action-btn", text: "Undo" });
    undo.addEventListener("click", () => this.undo());
    const clear = actions.createEl("button", { cls: "iae-action-btn", text: "Clear" });
    clear.addEventListener("click", () => this.clearAnnotations());
    const cancel = actions.createEl("button", { cls: "iae-action-btn", text: "Cancel" });
    cancel.addEventListener("click", () => this.close());
    const save = actions.createEl("button", {
      cls: "iae-action-btn primary",
      text: "Save",
      attr: { title: "Save (Enter)" }
    });
    save.addEventListener("click", () => void this.save());
  }
  setTool(tool) {
    this.finishText(true);
    this.clearCropOverlay();
    if (tool === "shapes" && this.tool === "shapes") {
      this.shapeKind = this.shapeKind === "rect" ? "ellipse" : "rect";
    }
    this.tool = tool;
    if (tool !== "select" && this.selected) {
      this.selected = null;
      this.render();
    }
    if (tool === "shapes") {
      this.setHint(
        this.shapeKind === "rect" ? "Shapes: rectangle (click again for ellipse)." : "Shapes: ellipse (click again for rectangle)."
      );
    } else {
      this.setHint(HINTS[tool]);
    }
    for (const [id, btn] of this.toolButtons) {
      btn.toggleClass("is-active", id === tool);
    }
    this.stage.toggleClass("is-select", tool === "select");
    this.stage.toggleClass("is-text", tool === "text");
    this.canvas.style.cursor = "";
    this.syncColorUI();
  }
  /** Highlight keeps its own color so the other tools' color is not affected. */
  setActiveColor(c) {
    if (this.tool === "highlight") this.highlightColor = c;
    else this.color = c;
    this.syncColorUI();
    this.styleTextInput();
  }
  syncColorUI() {
    const c = this.tool === "highlight" ? this.highlightColor : this.color;
    this.colorInput.value = c;
    this.colorCode.value = c.toUpperCase();
    this.colorCode.removeClass("is-invalid");
  }
  setHint(text) {
    this.hintEl.setText(text);
  }
  async loadImage() {
    const mime = mimeForFile(this.file);
    const errors = [];
    const data = await this.app.vault.readBinary(this.file);
    const bytes = new Uint8Array(data);
    if (bytes.byteLength < 8) {
      throw new Error(`File is empty or unreadable (${bytes.byteLength} bytes)`);
    }
    try {
      const blob = new Blob([bytes], { type: mime });
      const bitmap = await createImageBitmap(blob);
      this.applyImageSource(bitmap);
      bitmap.close();
      return;
    } catch (e) {
      errors.push(`createImageBitmap: ${String(e)}`);
    }
    try {
      const blob = new Blob([bytes], { type: mime });
      const url = URL.createObjectURL(blob);
      try {
        const img = await loadHtmlImage(url);
        this.applyImageSource(img);
        return;
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      errors.push(`blobUrl: ${String(e)}`);
    }
    try {
      const b64 = arrayBufferToBase64(bytes);
      const img = await loadHtmlImage(`data:${mime};base64,${b64}`);
      this.applyImageSource(img);
      return;
    } catch (e) {
      errors.push(`dataUrl: ${String(e)}`);
    }
    throw new Error(errors.join(" | "));
  }
  applyImageSource(source) {
    const w = "naturalWidth" in source && typeof source.naturalWidth === "number" ? source.naturalWidth : source.width;
    const h = "naturalHeight" in source && typeof source.naturalHeight === "number" ? source.naturalHeight : source.height;
    if (!w || !h) {
      throw new Error(`Decoded image has invalid size ${w}x${h}`);
    }
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.globalCompositeOperation = "source-over";
    this.ctx.clearRect(0, 0, w, h);
    this.ctx.drawImage(source, 0, 0);
    this.base = this.ctx.getImageData(0, 0, w, h);
    this.originalBase = this.base;
    this.objects = [];
    this.undoStack = [];
    this.redoStack = [];
    requestAnimationFrame(() => {
      this.fitStage();
      requestAnimationFrame(() => this.fitStage());
    });
  }
  fitStage() {
    if (!this.canvas || !this.stageWrap) return;
    if (!this.canvas.width || !this.canvas.height) return;
    const maxW = Math.max(120, this.stageWrap.clientWidth - 32);
    const maxH = Math.max(120, this.stageWrap.clientHeight - 32);
    const scale = Math.min(1, maxW / this.canvas.width, maxH / this.canvas.height);
    const displayW = Math.max(1, Math.floor(this.canvas.width * scale));
    const displayH = Math.max(1, Math.floor(this.canvas.height * scale));
    this.canvas.style.width = `${displayW}px`;
    this.canvas.style.height = `${displayH}px`;
  }
  /** Canvas pixels per on-screen pixel, so sizes look the same at any image resolution. */
  screenScale() {
    const w = this.canvas.getBoundingClientRect().width;
    return w > 0 ? Math.max(1, this.canvas.width / w) : 1;
  }
  /** Composites the image, drawings, and (unless exporting) editing overlays. */
  render(forExport = false) {
    if (!this.base) return;
    if (this.canvas.width !== this.base.width || this.canvas.height !== this.base.height) {
      this.canvas.width = this.base.width;
      this.canvas.height = this.base.height;
      this.fitStage();
    }
    this.ctx.putImageData(this.base, 0, 0);
    for (const o of this.objects) drawAnnotation(this.ctx, o);
    if (forExport) return;
    if (this.draft) drawAnnotation(this.ctx, this.draft);
    if (this.blurPreview) {
      const s = this.screenScale();
      const { x, y, w, h } = normRect(this.blurPreview.a, this.blurPreview.b);
      this.ctx.save();
      this.ctx.strokeStyle = "rgba(255,255,255,0.9)";
      this.ctx.setLineDash([6 * s, 4 * s]);
      this.ctx.lineWidth = 2 * s;
      this.ctx.strokeRect(x, y, w, h);
      this.ctx.restore();
    }
    if (this.selected) this.drawSelection(this.selected);
  }
  drawSelection(a) {
    const s = this.screenScale();
    const r = annotationBounds(this.ctx, a);
    const pad = 4 * s;
    this.ctx.save();
    this.ctx.lineWidth = 1.5 * s;
    this.ctx.setLineDash([5 * s, 4 * s]);
    this.ctx.strokeStyle = "#ffffff";
    this.ctx.strokeRect(r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2);
    this.ctx.lineDashOffset = 5 * s;
    this.ctx.strokeStyle = "#1a73e8";
    this.ctx.strokeRect(r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2);
    this.ctx.restore();
  }
  style(color = this.color) {
    return {
      color,
      border: this.borderOn ? this.borderColor : null,
      thickness: this.thickness,
      s: this.screenScale()
    };
  }
  bindCanvasEvents() {
    this.canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    this.canvas.addEventListener("pointermove", (e) => this.onPointerMove(e));
    this.canvas.addEventListener("pointerup", (e) => this.onPointerUp(e));
    this.canvas.addEventListener("pointercancel", (e) => {
      if (this.drawing) this.onPointerUp(e);
    });
  }
  bindShortcuts() {
    const run = (action) => (evt) => {
      const focused = document.activeElement;
      if (focused instanceof HTMLInputElement && focused.type === "text") return true;
      const handled = action();
      if (handled === false) return true;
      evt.preventDefault();
      return false;
    };
    this.scope.register(["Mod"], "z", run(() => this.undo()));
    this.scope.register(["Mod", "Shift"], "z", run(() => this.redo()));
    this.scope.register(["Mod"], "y", run(() => this.redo()));
    this.scope.register(["Mod"], "c", run(() => this.copySelected()));
    this.scope.register(["Mod"], "v", run(() => this.paste()));
    this.scope.register(["Mod"], "d", run(() => this.duplicateSelected()));
    this.scope.register([], "Delete", run(() => this.deleteSelected()));
    this.scope.register([], "Backspace", run(() => this.deleteSelected()));
    const nudges = [
      ["ArrowLeft", -1, 0],
      ["ArrowRight", 1, 0],
      ["ArrowUp", 0, -1],
      ["ArrowDown", 0, 1]
    ];
    for (const [key, dx, dy] of nudges) {
      this.scope.register([], key, run(() => this.nudgeSelected(dx, dy, 1)));
      this.scope.register(["Shift"], key, run(() => this.nudgeSelected(dx, dy, 10)));
    }
    const keys = [
      ["v", () => this.setTool("select")],
      ["p", () => this.setTool("pen")],
      ["t", () => this.setTool("text")],
      ["s", () => this.setTool("shapes")],
      ["a", () => this.setTool("arrow")],
      ["b", () => this.setTool("badge")],
      ["u", () => this.setTool("blur")],
      ["r", () => this.rotateImage()],
      ["c", () => this.openColorPicker()],
      ["Enter", () => void this.save()]
    ];
    for (const [key, action] of keys) this.scope.register([], key, run(action));
  }
  openColorPicker() {
    const picker = this.colorInput;
    try {
      if (picker.showPicker) picker.showPicker();
      else picker.click();
    } catch {
      picker.click();
    }
  }
  canvasPoint(e) {
    const rect = this.canvas.getBoundingClientRect();
    const rw = rect.width || 1;
    const rh = rect.height || 1;
    const x = (e.clientX - rect.left) / rw * this.canvas.width;
    const y = (e.clientY - rect.top) / rh * this.canvas.height;
    return { x, y };
  }
  hitObject(p) {
    const tol = 6 * this.screenScale();
    for (let i = this.objects.length - 1; i >= 0; i--) {
      if (hitTest(this.ctx, this.objects[i], p, tol)) return this.objects[i];
    }
    return null;
  }
  onPointerDown(e) {
    e.preventDefault();
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
    }
    const p = this.canvasPoint(e);
    if (this.tool === "text") {
      this.beginTextAt(p, e);
      return;
    }
    this.finishText(true);
    if (this.tool === "select") {
      const hit = this.hitObject(p);
      if (hit && e.altKey) {
        this.pushUndo();
        const copy = cloneAnnotation(hit);
        this.objects.push(copy);
        this.selected = copy;
        this.dragMoved = true;
      } else {
        this.selected = hit;
        this.dragMoved = false;
      }
      this.render();
      if (this.selected) {
        this.drawing = true;
        this.start = p;
        this.last = p;
      }
      return;
    }
    if (this.tool === "badge") {
      this.addObject({ kind: "badge", p, label: String(this.badgeCounter++), ...this.style() });
      return;
    }
    this.drawing = true;
    this.start = p;
    this.last = p;
    if (this.tool === "pen") {
      this.draft = { kind: "pen", points: [p], ...this.style() };
    } else if (this.tool === "highlight") {
      this.draft = { kind: "highlight", points: [p], ...this.style(this.highlightColor) };
    }
    this.render();
  }
  onPointerMove(e) {
    const p = this.canvasPoint(e);
    if (this.tool === "select" && !this.drawing) {
      this.canvas.style.cursor = this.hitObject(p) ? "move" : "default";
      return;
    }
    if (!this.drawing || !this.start) return;
    if (this.tool === "select" && this.selected && this.last) {
      if (!this.dragMoved) {
        this.pushUndo();
        this.dragMoved = true;
      }
      translateAnnotation(this.selected, p.x - this.last.x, p.y - this.last.y);
      this.last = p;
      this.render();
      return;
    }
    if (this.draft && (this.draft.kind === "pen" || this.draft.kind === "highlight")) {
      this.draft.points.push(p);
    } else if (this.tool === "arrow") {
      this.draft = { kind: "arrow", a: this.start, b: p, ...this.style() };
    } else if (this.tool === "shapes") {
      this.draft = { kind: this.shapeKind, a: this.start, b: p, ...this.style() };
    } else if (this.tool === "blur") {
      this.blurPreview = { a: this.start, b: p };
    } else if (this.tool === "crop") {
      this.updateCropOverlay(this.start, p);
    }
    this.last = p;
    this.render();
  }
  onPointerUp(e) {
    if (!this.drawing || !this.start) return;
    this.drawing = false;
    const p = this.canvasPoint(e);
    const start = this.start;
    this.start = null;
    this.last = null;
    if (this.tool === "select") return;
    const draft = this.draft;
    this.draft = null;
    this.blurPreview = null;
    this.clearCropOverlay();
    if (draft && (draft.kind === "pen" || draft.kind === "highlight")) {
      this.addObject(draft);
    } else if (this.tool === "arrow") {
      if (Math.hypot(p.x - start.x, p.y - start.y) >= 2) {
        this.addObject({ kind: "arrow", a: start, b: p, ...this.style() });
      } else this.render();
    } else if (this.tool === "shapes") {
      const r = normRect(start, p);
      if (r.w > 2 || r.h > 2) {
        this.addObject({ kind: this.shapeKind, a: start, b: p, ...this.style() });
      } else this.render();
    } else if (this.tool === "blur") {
      const r = normRect(start, p);
      if (r.w > 2 && r.h > 2) {
        this.pushUndo();
        this.base = pixelate(this.base, r.x, r.y, r.w, r.h, Math.max(6, Math.floor(this.thickness * 2)));
      }
      this.render();
    } else if (this.tool === "crop") {
      const r = normRect(start, p);
      if (r.w > 8 && r.h > 8) this.applyCrop(r.x, r.y, r.w, r.h);
      else this.render();
    }
  }
  addObject(a) {
    this.pushUndo();
    this.objects.push(a);
    this.render();
  }
  copySelected() {
    if (!this.selected) return false;
    this.clipboard = cloneAnnotation(this.selected);
    this.pasteCount = 0;
    this.setHint("Copied. Press Ctrl+V to paste.");
  }
  paste() {
    if (!this.clipboard) return false;
    this.pasteCount++;
    this.insertCopy(this.clipboard, this.pasteCount);
  }
  duplicateSelected() {
    if (!this.selected) return false;
    this.insertCopy(this.selected, 1);
  }
  insertCopy(source, steps) {
    const copy = cloneAnnotation(source);
    const off = 16 * this.screenScale() * steps;
    translateAnnotation(copy, off, off);
    this.pushUndo();
    this.objects.push(copy);
    if (this.tool !== "select") this.setTool("select");
    this.selected = copy;
    this.render();
  }
  deleteSelected() {
    if (!this.selected) return false;
    this.pushUndo();
    this.objects = this.objects.filter((o) => o !== this.selected);
    this.selected = null;
    this.render();
  }
  nudgeSelected(dx, dy, step) {
    if (!this.selected) return false;
    const d = step * this.screenScale();
    this.pushUndo();
    translateAnnotation(this.selected, dx * d, dy * d);
    this.render();
  }
  beginTextAt(p, e) {
    this.finishText(true);
    const s = this.screenScale();
    const input = document.createElement("input");
    input.type = "text";
    input.className = "iae-text-input";
    input.style.left = `${p.x / s}px`;
    input.style.top = `${p.y / s}px`;
    this.stage.appendChild(input);
    this.textEdit = { input, p };
    this.styleTextInput();
    input.focus();
    input.addEventListener("input", () => this.styleTextInput());
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        ev.stopPropagation();
        this.finishText(true);
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation();
        this.finishText(false);
      }
    });
    input.addEventListener("blur", () => this.finishText(true));
    e.stopPropagation();
  }
  /** Makes the live text input look like the text that will be drawn. */
  styleTextInput() {
    const input = this.textEdit?.input;
    if (!input) return;
    const fs = textFontSize({ thickness: this.thickness, s: 1 });
    input.style.fontSize = `${fs}px`;
    input.style.color = this.color;
    input.style.caretColor = this.color;
    const o = Math.max(1, Math.round(fs * 0.08));
    input.style.textShadow = this.borderOn ? [
      [o, 0],
      [-o, 0],
      [0, o],
      [0, -o],
      [o, o],
      [-o, -o],
      [o, -o],
      [-o, o]
    ].map(([x, y]) => `${x}px ${y}px 0 ${this.borderColor}`).join(", ") : "none";
    this.ctx.save();
    this.ctx.font = `bold ${fs}px sans-serif`;
    const width = this.ctx.measureText(input.value).width;
    this.ctx.restore();
    input.style.width = `${Math.ceil(width) + o * 2 + 4}px`;
  }
  /** Adds the pending text (if `commit`) and removes the input. Safe to call repeatedly. */
  finishText(commit) {
    const edit = this.textEdit;
    if (!edit) return;
    this.textEdit = null;
    const value = edit.input.value.trim();
    edit.input.remove();
    if (!commit || !value) return;
    this.addObject({ kind: "text", p: edit.p, text: value, ...this.style() });
  }
  updateCropOverlay(a, b) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = rect.width / this.canvas.width;
    const scaleY = rect.height / this.canvas.height;
    const r = normRect(a, b);
    if (!this.cropOverlay) {
      this.cropOverlay = this.stage.createDiv({ cls: "iae-crop-overlay" });
    }
    this.cropOverlay.style.left = `${r.x * scaleX}px`;
    this.cropOverlay.style.top = `${r.y * scaleY}px`;
    this.cropOverlay.style.width = `${r.w * scaleX}px`;
    this.cropOverlay.style.height = `${r.h * scaleY}px`;
  }
  clearCropOverlay() {
    if (this.cropOverlay) {
      this.cropOverlay.remove();
      this.cropOverlay = null;
    }
  }
  applyCrop(x, y, w, h) {
    if (!this.base) return;
    x = Math.max(0, Math.floor(x));
    y = Math.max(0, Math.floor(y));
    w = Math.min(this.base.width - x, Math.floor(w));
    h = Math.min(this.base.height - y, Math.floor(h));
    this.pushUndo();
    this.ctx.putImageData(this.base, 0, 0);
    this.base = this.ctx.getImageData(x, y, w, h);
    for (const o of this.objects) translateAnnotation(o, -x, -y);
    this.selected = null;
    this.render();
    this.setHint("Cropped. Save when ready.");
  }
  rotateImage() {
    if (!this.base) return;
    this.finishText(true);
    const src = this.base;
    const w = src.width;
    const h = src.height;
    const rotated = new ImageData(h, w);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const si = (y * w + x) * 4;
        const di = (x * h + (h - 1 - y)) * 4;
        rotated.data[di] = src.data[si];
        rotated.data[di + 1] = src.data[si + 1];
        rotated.data[di + 2] = src.data[si + 2];
        rotated.data[di + 3] = src.data[si + 3];
      }
    }
    this.pushUndo();
    this.base = rotated;
    for (const o of this.objects) mapAnnotation(o, (p) => ({ x: h - p.y, y: p.x }));
    this.render();
    this.setHint("Rotated 90\xB0.");
  }
  snapshot() {
    return { base: this.base, objects: cloneAnnotation(this.objects) };
  }
  restore(entry) {
    this.base = entry.base;
    this.objects = entry.objects;
    this.selected = null;
    this.render();
  }
  pushUndo() {
    if (!this.base) return;
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
  }
  /** Restore the image as it was when the editor opened; undoable. */
  clearAnnotations() {
    if (!this.originalBase) return;
    this.finishText(false);
    this.clearCropOverlay();
    this.pushUndo();
    this.base = this.originalBase;
    this.objects = [];
    this.selected = null;
    this.badgeCounter = 1;
    this.render();
    this.setHint("Cleared all annotations. Use Undo to bring them back.");
  }
  undo() {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(this.snapshot());
    this.restore(prev);
  }
  redo() {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.snapshot());
    this.restore(next);
  }
  async save() {
    if (this.saving) return;
    this.saving = true;
    this.finishText(true);
    try {
      this.render(true);
      const mime = mimeForFile(this.file);
      const blob = await new Promise(
        (resolve) => this.canvas.toBlob(resolve, mime, 0.95)
      );
      this.render();
      if (!blob) throw new Error("Failed to encode image");
      const buffer = await blob.arrayBuffer();
      await this.app.vault.modifyBinary(this.file, buffer);
      refreshImageEmbeds(this.app, this.file);
      new import_obsidian2.Notice(`Saved annotations to ${this.file.name}`);
      this.close();
    } catch (err) {
      console.error(err);
      new import_obsidian2.Notice("Failed to save annotated image.");
    } finally {
      this.saving = false;
    }
  }
};
function pixelate(src, x, y, w, h, block) {
  const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
  x = Math.max(0, Math.floor(x));
  y = Math.max(0, Math.floor(y));
  w = Math.min(src.width - x, Math.floor(w));
  h = Math.min(src.height - y, Math.floor(h));
  if (w <= 0 || h <= 0) return out;
  const d = out.data;
  const stride = src.width * 4;
  for (let by = y; by < y + h; by += block) {
    for (let bx = x; bx < x + w; bx += block) {
      const bw = Math.min(block, x + w - bx);
      const bh = Math.min(block, y + h - by);
      let r = 0, g = 0, b = 0, a = 0;
      for (let py = by; py < by + bh; py++) {
        for (let px = bx; px < bx + bw; px++) {
          const i = py * stride + px * 4;
          r += d[i];
          g += d[i + 1];
          b += d[i + 2];
          a += d[i + 3];
        }
      }
      const n = bw * bh;
      for (let py = by; py < by + bh; py++) {
        for (let px = bx; px < bx + bw; px++) {
          const i = py * stride + px * 4;
          d[i] = r / n;
          d[i + 1] = g / n;
          d[i + 2] = b / n;
          d[i + 3] = a / n;
        }
      }
    }
  }
  return out;
}
function parseColor(input) {
  const v = input.trim();
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split("").map((c) => c + c).join("") : hex[1];
    return `#${h.toLowerCase()}`;
  }
  const rgb = /^(?:rgb\s*\(\s*)?(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*\)?$/i.exec(v);
  if (rgb) {
    const parts = rgb.slice(1, 4).map(Number);
    if (parts.some((n) => n > 255)) return null;
    return `#${parts.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
  }
  return null;
}
function loadHtmlImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = url;
  });
}
function mimeForFile(file) {
  const ext = file.extension.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "bmp") return "image/bmp";
  return "image/png";
}
function arrayBufferToBase64(bytes) {
  let binary = "";
  const chunk = 32768;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
function appendSvg(parent, svgMarkup) {
  const doc = new DOMParser().parseFromString(svgMarkup, "image/svg+xml");
  const svg = doc.documentElement;
  if (svg.nodeName.toLowerCase() === "svg") {
    parent.appendChild(parent.ownerDocument.importNode(svg, true));
  }
}
function makeToolButton(parent, label, icon, title) {
  const btn = parent.createEl("button", {
    cls: "iae-tool",
    attr: { type: "button", title: title ?? label }
  });
  appendSvg(btn, icon);
  btn.createSpan({ cls: "iae-tool-label", text: label });
  return btn;
}
var selectIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M5 3l13 8-6 1.5L9 19z"/><path d="M12 12.5l5 6"/></svg>`;
var penIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20l4.5-1 11-11a2.1 2.1 0 00-3-3l-11 11L4 20z"/><path d="M13.5 6.5l3 3"/></svg>`;
var textIcon = `<svg viewBox="0 0 24 24" fill="currentColor"><text x="3" y="17" font-size="14" font-family="Georgia, serif" font-weight="700">A</text><text x="12" y="17" font-size="14" font-family="Georgia, serif" font-weight="700">I</text></svg>`;
var highlightIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 16l3 3 11-11-3-3L5 16z"/><path d="M4 20h16" stroke-width="3" opacity=".35"/></svg>`;
var shapesIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="11" height="11" rx="1"/><circle cx="16" cy="15" r="5"/></svg>`;
var arrowIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 19L19 5"/><path d="M9 5h10v10"/></svg>`;
var badgeIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>`;
var rotateIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 12a8 8 0 0113.7-5.7L20 8"/><path d="M20 3v5h-5"/><rect x="7" y="10" width="8" height="8" rx="1"/></svg>`;
var blurIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 2"/><circle cx="9" cy="10" r="1.2" fill="currentColor" stroke="none"/><circle cx="14" cy="13" r="1.6" fill="currentColor" stroke="none" opacity=".6"/></svg>`;
var cropIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3v12a3 3 0 003 3h12"/><path d="M18 21V9a3 3 0 00-3-3H3"/></svg>`;
var thicknessIcon = `<svg viewBox="0 0 24 12" width="22" height="12" fill="none" stroke="currentColor"><path d="M2 2h20" stroke-width="1"/><path d="M2 6h20" stroke-width="2"/><path d="M2 10h20" stroke-width="3.5"/></svg>`;

// src/main.ts
var ImageAnnotatEPlugin = class extends import_obsidian3.Plugin {
  constructor() {
    super(...arguments);
    this.pendingCtx = null;
    this.lastCtx = null;
  }
  async onload() {
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (!(file instanceof import_obsidian3.TFile) || !isImageFile(file)) return;
        this.addAnnotateMenuItem(menu, file);
      })
    );
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu) => {
        const ctx = this.lastCtx;
        if (!ctx || Date.now() - ctx.time > 1500) return;
        const file = resolveImageFromElement(
          this.app,
          ctx.target
        );
        if (!file) return;
        this.addAnnotateMenuItem(menu, file);
        this.pendingCtx = null;
      })
    );
    this.registerDomEvent(
      document,
      "contextmenu",
      (evt) => {
        this.lastCtx = { target: evt.target, evt, time: Date.now() };
      },
      true
    );
    this.registerDomEvent(document, "contextmenu", (evt) => {
      const target = evt.target;
      if (!target) return;
      const img = target instanceof HTMLImageElement ? target : target.closest("img");
      if (!img) return;
      if (img.closest(".iae-modal, .workspace-ribbon, .titlebar")) return;
      const inNote = img.closest(".markdown-preview-view") || img.closest(".markdown-source-view") || img.closest(".cm-editor") || img.closest(".image-embed") || img.closest(".internal-embed") || img.closest(".view-content");
      if (!inNote) return;
      const file = resolveImageFromElement(this.app, img);
      if (!file) return;
      this.pendingCtx = { file, time: Date.now() };
      window.setTimeout(() => this.injectAnnotateIntoNativeMenu(), 40);
    });
    this.addCommand({
      id: "annotate-active-image",
      name: "Annotate image under cursor / selection",
      callback: () => {
        const img = document.querySelector(
          ".markdown-preview-view img:hover, .image-embed:hover img, .cm-editor img:hover"
        );
        if (img) {
          const file = resolveImageFromElement(this.app, img);
          if (file) {
            this.openAnnotator(file);
            return;
          }
        }
        new import_obsidian3.Notice("Right-click an image and choose Annotate.");
      }
    });
    this.addCommand({
      id: "annotate-file",
      name: "Annotate current image file",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (file && isImageFile(file)) {
          if (!checking) this.openAnnotator(file);
          return true;
        }
        return false;
      }
    });
  }
  addAnnotateMenuItem(menu, file) {
    menu.addSeparator();
    menu.addItem((item) => {
      item.setTitle("Annotate").setIcon("pencil").onClick(() => this.openAnnotator(file));
    });
  }
  /** Inject into Obsidian's already-open `.menu` (reading view / fallback). */
  injectAnnotateIntoNativeMenu() {
    const pending = this.pendingCtx;
    if (!pending || Date.now() - pending.time > 800) return;
    const menus = Array.from(document.querySelectorAll(".menu"));
    const menuEl = menus[menus.length - 1];
    if (!menuEl) return;
    const already = Array.from(menuEl.querySelectorAll(".menu-item-title")).some(
      (el) => el.textContent?.trim() === "Annotate"
    );
    if (already || menuEl.querySelector(".iae-menu-item")) return;
    const sep = document.createElement("div");
    sep.className = "menu-separator";
    const item = document.createElement("div");
    item.className = "menu-item iae-menu-item";
    const icon = document.createElement("div");
    icon.className = "menu-item-icon";
    (0, import_obsidian3.setIcon)(icon, "pencil");
    const title = document.createElement("div");
    title.className = "menu-item-title";
    title.textContent = "Annotate";
    item.appendChild(icon);
    item.appendChild(title);
    item.addEventListener("click", () => {
      document.body.click();
      this.openAnnotator(pending.file);
    });
    menuEl.appendChild(sep);
    menuEl.appendChild(item);
  }
  openAnnotator(file) {
    new AnnotateModal(this.app, file).open();
  }
};
