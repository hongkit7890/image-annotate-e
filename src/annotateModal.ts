import { App, Modal, Notice, TFile } from "obsidian";
import {
	Annotation,
	Point,
	annotationBounds,
	cloneAnnotation,
	drawAnnotation,
	hitTest,
	mapAnnotation,
	normRect,
	textFontSize,
	translateAnnotation,
} from "./annotations";
import { refreshImageEmbeds } from "./resolveImage";

export type ToolId =
	| "select"
	| "pen"
	| "text"
	| "highlight"
	| "shapes"
	| "arrow"
	| "badge"
	| "blur"
	| "crop";

type ShapeKind = "rect" | "ellipse";

interface HistoryEntry {
	base: ImageData;
	objects: Annotation[];
}

const COLORS = [
	"#7852ee",
	"#d32f2f",
	"#e91e8c",
	"#fb8c00",
	"#fdd835",
	"#43a047",
	"#1e88e5",
	"#8e24aa",
	"#212121",
	"#ffffff",
];

const HINTS: Record<ToolId, string> = {
	select:
		"Click a drawing to select it. Drag to move, Alt+drag or Ctrl+D to copy, Ctrl+C / Ctrl+V to copy and paste, Delete to remove.",
	pen: "Freehand draw.",
	text: "Click where you want to add text.",
	highlight: "Highlight with a thick translucent stroke.",
	shapes: "Drag to draw a shape.",
	arrow: "Drag to draw an arrow.",
	badge: "Click to place a numbered badge.",
	blur: "Drag a rectangle to blur/pixelate that area.",
	crop: "Drag to select a crop region, then release to apply.",
};

export class AnnotateModal extends Modal {
	private file: TFile;
	private canvas!: HTMLCanvasElement;
	private ctx!: CanvasRenderingContext2D;
	private stage!: HTMLDivElement;
	private stageWrap!: HTMLDivElement;
	private hintEl!: HTMLDivElement;
	private cropOverlay: HTMLDivElement | null = null;
	private colorInput!: HTMLInputElement;
	private colorCode!: HTMLInputElement;
	private toolButtons = new Map<ToolId, HTMLButtonElement>();
	private resizeObserver: ResizeObserver | null = null;

	private tool: ToolId = "arrow";
	private color = "#7852ee";
	private highlightColor = "#ffeb3b";
	private borderOn = true;
	private borderColor = "#ffffff";
	private thickness = 4;
	private shapeKind: ShapeKind = "rect";
	private badgeCounter = 1;

	/** Image pixels, including blur/crop/rotate. Never mutated in place, so history can share it. */
	private base: ImageData | null = null;
	private originalBase: ImageData | null = null;
	/** Drawings, rendered over `base` in order. */
	private objects: Annotation[] = [];
	private draft: Annotation | null = null;
	private selected: Annotation | null = null;
	private clipboard: Annotation | null = null;
	private pasteCount = 0;
	private blurPreview: { a: Point; b: Point } | null = null;

	private drawing = false;
	private start: Point | null = null;
	private last: Point | null = null;
	private dragMoved = false;

	private undoStack: HistoryEntry[] = [];
	private redoStack: HistoryEntry[] = [];
	private textEdit: { input: HTMLInputElement; p: Point } | null = null;
	private saving = false;

	constructor(app: App, file: TFile) {
		super(app);
		this.file = file;
	}

	async onOpen(): Promise<void> {
		const { contentEl, modalEl } = this;
		modalEl.addClass("iae-modal");
		contentEl.empty();
		contentEl.addClass("iae-modal-content");

		const shell = contentEl.createDiv({ cls: "iae-shell" });
		this.buildToolbar(shell);

		this.stageWrap = shell.createDiv({ cls: "iae-stage-wrap" });
		this.hintEl = this.stageWrap.createDiv({ cls: "iae-hint" });
		this.setHint(`Loading ${this.file.name}…`);

		this.stage = this.stageWrap.createDiv({ cls: "iae-stage" });
		this.canvas = this.stage.createEl("canvas");
		const ctx = this.canvas.getContext("2d", { willReadFrequently: true });
		if (!ctx) {
			new Notice("Could not initialize canvas.");
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
			new Notice(`Failed to load image: ${this.file.path}`);
			this.setHint("Failed to load image. Try Annotate from the file explorer.");
		}
	}

	onClose(): void {
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
		this.finishText(false);
		this.contentEl.empty();
	}

	private buildToolbar(parent: HTMLElement): void {
		const bar = parent.createDiv({ cls: "iae-toolbar" });

		const tools: { id: ToolId; label: string; icon: string; key?: string }[] = [
			{ id: "select", label: "Select", icon: selectIcon, key: "V" },
			{ id: "pen", label: "Pen", icon: penIcon, key: "P" },
			{ id: "text", label: "Text", icon: textIcon, key: "T" },
			{ id: "highlight", label: "Highlight", icon: highlightIcon },
			{ id: "shapes", label: "Shapes", icon: shapesIcon, key: "S" },
			{ id: "arrow", label: "Arrow", icon: arrowIcon, key: "A" },
			{ id: "badge", label: "Badge", icon: badgeIcon, key: "B" },
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
			attr: { type: "color", value: this.color, title: "Color (C)" },
		});
		this.colorInput = colorInput;
		colorInput.addEventListener("input", () => this.setActiveColor(colorInput.value));

		const code = colorWrap.createEl("input", {
			cls: "iae-color-code",
			attr: { type: "text", spellcheck: "false", title: "Hex (#7852EE) or RGB (120, 82, 238)" },
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
				attr: { type: "button", title: c },
			});
			sw.setCssStyles({ background: c });
			sw.addEventListener("click", () => this.setActiveColor(c));
		}

		const borderWrap = bar.createDiv({ cls: "iae-tool iae-border" });
		const borderRow = borderWrap.createDiv({ cls: "iae-border-row" });
		const borderToggle = borderRow.createEl("input", {
			attr: { type: "checkbox", title: "Show border" },
		});
		borderToggle.checked = this.borderOn;
		const borderSwatch = borderRow.createEl("input", {
			cls: "iae-color-swatch iae-border-swatch",
			attr: { type: "color", value: this.borderColor, title: "Border color" },
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
			attr: { type: "range", min: "1", max: "40", value: String(this.thickness) },
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
			attr: { title: "Save (Enter)" },
		});
		save.addEventListener("click", () => void this.save());
	}

	private setTool(tool: ToolId): void {
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
				this.shapeKind === "rect"
					? "Shapes: rectangle (click again for ellipse)."
					: "Shapes: ellipse (click again for rectangle)."
			);
		} else {
			this.setHint(HINTS[tool]);
		}

		for (const [id, btn] of this.toolButtons) {
			btn.toggleClass("is-active", id === tool);
		}
		this.stage.toggleClass("is-select", tool === "select");
		this.stage.toggleClass("is-text", tool === "text");
		this.canvas.setCssStyles({ cursor: "default" });
		this.syncColorUI();
	}

	/** Highlight keeps its own color so the other tools' color is not affected. */
	private setActiveColor(c: string): void {
		if (this.tool === "highlight") this.highlightColor = c;
		else this.color = c;
		this.syncColorUI();
		this.styleTextInput();
	}

	private syncColorUI(): void {
		const c = this.tool === "highlight" ? this.highlightColor : this.color;
		this.colorInput.value = c;
		this.colorCode.value = c.toUpperCase();
		this.colorCode.removeClass("is-invalid");
	}

	private setHint(text: string): void {
		this.hintEl.setText(text);
	}

	private async loadImage(): Promise<void> {
		const mime = mimeForFile(this.file);
		const errors: string[] = [];

		// Decode from vault bytes only: app:// resource URLs are cross-origin and
		// would taint the canvas, breaking getImageData() and toBlob().
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

	private applyImageSource(source: CanvasImageSource & { width: number; height: number }): void {
		const w =
			"naturalWidth" in source && typeof source.naturalWidth === "number"
				? source.naturalWidth
				: source.width;
		const h =
			"naturalHeight" in source && typeof source.naturalHeight === "number"
				? source.naturalHeight
				: source.height;

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
		// Layout may not be ready on first tick
		window.requestAnimationFrame(() => {
			this.fitStage();
			window.requestAnimationFrame(() => this.fitStage());
		});
	}

	private fitStage(): void {
		if (!this.canvas || !this.stageWrap) return;
		if (!this.canvas.width || !this.canvas.height) return;

		const maxW = Math.max(120, this.stageWrap.clientWidth - 32);
		const maxH = Math.max(120, this.stageWrap.clientHeight - 32);
		const scale = Math.min(1, maxW / this.canvas.width, maxH / this.canvas.height);
		const displayW = Math.max(1, Math.floor(this.canvas.width * scale));
		const displayH = Math.max(1, Math.floor(this.canvas.height * scale));
		this.canvas.setCssStyles({
			width: `${displayW}px`,
			height: `${displayH}px`,
		});
	}

	/** Canvas pixels per on-screen pixel, so sizes look the same at any image resolution. */
	private screenScale(): number {
		const w = this.canvas.getBoundingClientRect().width;
		return w > 0 ? Math.max(1, this.canvas.width / w) : 1;
	}

	/** Composites the image, drawings, and (unless exporting) editing overlays. */
	private render(forExport = false): void {
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

	private drawSelection(a: Annotation): void {
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

	private style(color = this.color) {
		return {
			color,
			border: this.borderOn ? this.borderColor : null,
			thickness: this.thickness,
			s: this.screenScale(),
		};
	}

	private bindCanvasEvents(): void {
		this.canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e));
		this.canvas.addEventListener("pointermove", (e) => this.onPointerMove(e));
		this.canvas.addEventListener("pointerup", (e) => this.onPointerUp(e));
		this.canvas.addEventListener("pointercancel", (e) => {
			if (this.drawing) this.onPointerUp(e);
		});
	}

	private bindShortcuts(): void {
		const run = (action: () => boolean | void) => (evt: KeyboardEvent) => {
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
		const nudges: [string, number, number][] = [
			["ArrowLeft", -1, 0],
			["ArrowRight", 1, 0],
			["ArrowUp", 0, -1],
			["ArrowDown", 0, 1],
		];
		for (const [key, dx, dy] of nudges) {
			this.scope.register([], key, run(() => this.nudgeSelected(dx, dy, 1)));
			this.scope.register(["Shift"], key, run(() => this.nudgeSelected(dx, dy, 10)));
		}

		const keys: [string, () => void][] = [
			["v", () => this.setTool("select")],
			["p", () => this.setTool("pen")],
			["t", () => this.setTool("text")],
			["s", () => this.setTool("shapes")],
			["a", () => this.setTool("arrow")],
			["b", () => this.setTool("badge")],
			["u", () => this.setTool("blur")],
			["r", () => this.rotateImage()],
			["c", () => this.openColorPicker()],
			["Enter", () => void this.save()],
		];
		for (const [key, action] of keys) this.scope.register([], key, run(action));
	}

	private openColorPicker(): void {
		const picker = this.colorInput as HTMLInputElement & { showPicker?: () => void };
		try {
			if (picker.showPicker) picker.showPicker();
			else picker.click();
		} catch {
			picker.click();
		}
	}

	private canvasPoint(e: PointerEvent): Point {
		const rect = this.canvas.getBoundingClientRect();
		const rw = rect.width || 1;
		const rh = rect.height || 1;
		const x = ((e.clientX - rect.left) / rw) * this.canvas.width;
		const y = ((e.clientY - rect.top) / rh) * this.canvas.height;
		return { x, y };
	}

	private hitObject(p: Point): Annotation | null {
		const tol = 6 * this.screenScale();
		for (let i = this.objects.length - 1; i >= 0; i--) {
			if (hitTest(this.ctx, this.objects[i], p, tol)) return this.objects[i];
		}
		return null;
	}

	private onPointerDown(e: PointerEvent): void {
		e.preventDefault();
		try {
			this.canvas.setPointerCapture(e.pointerId);
		} catch {
			/* pointer already released */
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

	private onPointerMove(e: PointerEvent): void {
		const p = this.canvasPoint(e);

		if (this.tool === "select" && !this.drawing) {
			this.canvas.setCssStyles({
				cursor: this.hitObject(p) ? "move" : "default",
			});
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

	private onPointerUp(e: PointerEvent): void {
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
				this.base = pixelate(this.base!, r.x, r.y, r.w, r.h, Math.max(6, Math.floor(this.thickness * 2)));
			}
			this.render();
		} else if (this.tool === "crop") {
			const r = normRect(start, p);
			if (r.w > 8 && r.h > 8) this.applyCrop(r.x, r.y, r.w, r.h);
			else this.render();
		}
	}

	private addObject(a: Annotation): void {
		this.pushUndo();
		this.objects.push(a);
		this.render();
	}

	private copySelected(): boolean | void {
		if (!this.selected) return false;
		this.clipboard = cloneAnnotation(this.selected);
		this.pasteCount = 0;
		this.setHint("Copied. Press Ctrl+V to paste.");
	}

	private paste(): boolean | void {
		if (!this.clipboard) return false;
		this.pasteCount++;
		this.insertCopy(this.clipboard, this.pasteCount);
	}

	private duplicateSelected(): boolean | void {
		if (!this.selected) return false;
		this.insertCopy(this.selected, 1);
	}

	private insertCopy(source: Annotation, steps: number): void {
		const copy = cloneAnnotation(source);
		const off = 16 * this.screenScale() * steps;
		translateAnnotation(copy, off, off);
		this.pushUndo();
		this.objects.push(copy);
		if (this.tool !== "select") this.setTool("select");
		this.selected = copy;
		this.render();
	}

	private deleteSelected(): boolean | void {
		if (!this.selected) return false;
		this.pushUndo();
		this.objects = this.objects.filter((o) => o !== this.selected);
		this.selected = null;
		this.render();
	}

	private nudgeSelected(dx: number, dy: number, step: number): boolean | void {
		if (!this.selected) return false;
		const d = step * this.screenScale();
		this.pushUndo();
		translateAnnotation(this.selected, dx * d, dy * d);
		this.render();
	}

	private beginTextAt(p: Point, e: PointerEvent): void {
		this.finishText(true);
		const s = this.screenScale();

		const input = this.stage.createEl("input", {
			cls: "iae-text-input",
			attr: { type: "text" },
		});
		input.setCssStyles({
			left: `${p.x / s}px`,
			top: `${p.y / s}px`,
		});
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
	private styleTextInput(): void {
		const input = this.textEdit?.input;
		if (!input) return;
		const fs = textFontSize({ thickness: this.thickness, s: 1 });
		const o = Math.max(1, Math.round(fs * 0.08));
		const textShadow = this.borderOn
			? [
					[o, 0], [-o, 0], [0, o], [0, -o],
					[o, o], [-o, -o], [o, -o], [-o, o],
				]
					.map(([x, y]) => `${x}px ${y}px 0 ${this.borderColor}`)
					.join(", ")
			: "none";
		this.ctx.save();
		this.ctx.font = `bold ${fs}px sans-serif`;
		const width = this.ctx.measureText(input.value).width;
		this.ctx.restore();
		input.setCssStyles({
			fontSize: `${fs}px`,
			color: this.color,
			caretColor: this.color,
			textShadow,
			width: `${Math.ceil(width) + o * 2 + 4}px`,
		});
	}

	/** Adds the pending text (if `commit`) and removes the input. Safe to call repeatedly. */
	private finishText(commit: boolean): void {
		const edit = this.textEdit;
		if (!edit) return;
		this.textEdit = null;
		const value = edit.input.value.trim();
		edit.input.remove();
		if (!commit || !value) return;
		this.addObject({ kind: "text", p: edit.p, text: value, ...this.style() });
	}

	private updateCropOverlay(a: Point, b: Point): void {
		const rect = this.canvas.getBoundingClientRect();
		const scaleX = rect.width / this.canvas.width;
		const scaleY = rect.height / this.canvas.height;
		const r = normRect(a, b);
		if (!this.cropOverlay) {
			this.cropOverlay = this.stage.createDiv({ cls: "iae-crop-overlay" });
		}
		this.cropOverlay.setCssStyles({
			left: `${r.x * scaleX}px`,
			top: `${r.y * scaleY}px`,
			width: `${r.w * scaleX}px`,
			height: `${r.h * scaleY}px`,
		});
	}

	private clearCropOverlay(): void {
		if (this.cropOverlay) {
			this.cropOverlay.remove();
			this.cropOverlay = null;
		}
	}

	private applyCrop(x: number, y: number, w: number, h: number): void {
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

	private rotateImage(): void {
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
		this.setHint("Rotated 90°.");
	}

	private snapshot(): HistoryEntry {
		return { base: this.base!, objects: cloneAnnotation(this.objects) };
	}

	private restore(entry: HistoryEntry): void {
		this.base = entry.base;
		this.objects = entry.objects;
		this.selected = null;
		this.render();
	}

	private pushUndo(): void {
		if (!this.base) return;
		this.undoStack.push(this.snapshot());
		if (this.undoStack.length > 50) this.undoStack.shift();
		this.redoStack = [];
	}

	/** Restore the image as it was when the editor opened; undoable. */
	private clearAnnotations(): void {
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

	private undo(): void {
		const prev = this.undoStack.pop();
		if (!prev) return;
		this.redoStack.push(this.snapshot());
		this.restore(prev);
	}

	private redo(): void {
		const next = this.redoStack.pop();
		if (!next) return;
		this.undoStack.push(this.snapshot());
		this.restore(next);
	}

	private async save(): Promise<void> {
		if (this.saving) return;
		this.saving = true;
		this.finishText(true);
		try {
			this.render(true);
			const mime = mimeForFile(this.file);
			const blob = await new Promise<Blob | null>((resolve) =>
				this.canvas.toBlob(resolve, mime, 0.95)
			);
			this.render();
			if (!blob) throw new Error("Failed to encode image");
			const buffer = await blob.arrayBuffer();
			await this.app.vault.modifyBinary(this.file, buffer);
			refreshImageEmbeds(this.app, this.file);
			new Notice(`Saved annotations to ${this.file.name}`);
			this.close();
		} catch (err) {
			console.error(err);
			new Notice("Failed to save annotated image.");
		} finally {
			this.saving = false;
		}
	}
}

/** Returns a copy of `src` with the given area pixelated. */
function pixelate(src: ImageData, x: number, y: number, w: number, h: number, block: number): ImageData {
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

/** Parses "#7852EE", "7852ee", "#abc", "120, 82, 238" or "rgb(120 82 238)" into "#rrggbb". */
export function parseColor(input: string): string | null {
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

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error("Failed to load image"));
		img.src = url;
	});
}

function mimeForFile(file: TFile): string {
	const ext = file.extension.toLowerCase();
	if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
	if (ext === "webp") return "image/webp";
	if (ext === "gif") return "image/gif";
	if (ext === "bmp") return "image/bmp";
	return "image/png";
}

function arrayBufferToBase64(bytes: Uint8Array): string {
	let binary = "";
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return btoa(binary);
}

/** Append an SVG markup string without using innerHTML (review guideline). */
function appendSvg(parent: HTMLElement, svgMarkup: string): void {
	const doc = new DOMParser().parseFromString(svgMarkup, "image/svg+xml");
	const svg = doc.documentElement;
	if (svg.nodeName.toLowerCase() === "svg") {
		parent.appendChild(parent.ownerDocument.importNode(svg, true));
	}
}

function makeToolButton(
	parent: HTMLElement,
	label: string,
	icon: string,
	title?: string,
): HTMLButtonElement {
	const btn = parent.createEl("button", {
		cls: "iae-tool",
		attr: { type: "button", title: title ?? label },
	});
	appendSvg(btn, icon);
	btn.createSpan({ cls: "iae-tool-label", text: label });
	return btn;
}

/* Inline SVG icons matching Evernote-style toolbar */
const selectIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M5 3l13 8-6 1.5L9 19z"/><path d="M12 12.5l5 6"/></svg>`;
const penIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20l4.5-1 11-11a2.1 2.1 0 00-3-3l-11 11L4 20z"/><path d="M13.5 6.5l3 3"/></svg>`;
const textIcon = `<svg viewBox="0 0 24 24" fill="currentColor"><text x="3" y="17" font-size="14" font-family="Georgia, serif" font-weight="700">A</text><text x="12" y="17" font-size="14" font-family="Georgia, serif" font-weight="700">I</text></svg>`;
const highlightIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 16l3 3 11-11-3-3L5 16z"/><path d="M4 20h16" stroke-width="3" opacity=".35"/></svg>`;
const shapesIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="11" height="11" rx="1"/><circle cx="16" cy="15" r="5"/></svg>`;
const arrowIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 19L19 5"/><path d="M9 5h10v10"/></svg>`;
const badgeIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>`;
const rotateIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 12a8 8 0 0113.7-5.7L20 8"/><path d="M20 3v5h-5"/><rect x="7" y="10" width="8" height="8" rx="1"/></svg>`;
const blurIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 2"/><circle cx="9" cy="10" r="1.2" fill="currentColor" stroke="none"/><circle cx="14" cy="13" r="1.6" fill="currentColor" stroke="none" opacity=".6"/></svg>`;
const cropIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3v12a3 3 0 003 3h12"/><path d="M18 21V9a3 3 0 00-3-3H3"/></svg>`;
const thicknessIcon = `<svg viewBox="0 0 24 12" width="22" height="12" fill="none" stroke="currentColor"><path d="M2 2h20" stroke-width="1"/><path d="M2 6h20" stroke-width="2"/><path d="M2 10h20" stroke-width="3.5"/></svg>`;
