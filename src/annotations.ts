export interface Point {
	x: number;
	y: number;
}

export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

/**
 * `s` is canvas pixels per screen pixel when the annotation was made, so sizes
 * stay as they looked on screen regardless of image resolution.
 */
interface StyleBase {
	color: string;
	border: string | null;
	thickness: number;
	s: number;
}

export type Annotation =
	| (StyleBase & { kind: "pen"; points: Point[] })
	| (StyleBase & { kind: "highlight"; points: Point[] })
	| (StyleBase & { kind: "arrow"; a: Point; b: Point })
	| (StyleBase & { kind: "rect" | "ellipse"; a: Point; b: Point })
	| (StyleBase & { kind: "badge"; p: Point; label: string })
	| (StyleBase & { kind: "text"; p: Point; text: string });

export function normRect(a: Point, b: Point): Rect {
	return {
		x: Math.min(a.x, b.x),
		y: Math.min(a.y, b.y),
		w: Math.abs(a.x - b.x),
		h: Math.abs(a.y - b.y),
	};
}

export function textFontSize(a: { thickness: number; s: number }): number {
	return (12 + a.thickness * 2.5) * a.s;
}

function badgeRadius(a: { thickness: number; s: number }): number {
	return (9 + a.thickness * 1.5) * a.s;
}

function borderWidth(a: { thickness: number; s: number }): number {
	return (1.5 + a.thickness * 0.3) * a.s;
}

function highlightWidth(a: { thickness: number; s: number }): number {
	return Math.max(12, a.thickness * 4) * a.s;
}

function arrowGeometry(a: Extract<Annotation, { kind: "arrow" }>) {
	const dx = a.b.x - a.a.x;
	const dy = a.b.y - a.a.y;
	const len = Math.hypot(dx, dy);
	let neck = (2.5 + a.thickness * 1.0) * a.s;
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

export function drawAnnotation(ctx: CanvasRenderingContext2D, a: Annotation): void {
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

function tracePolyline(ctx: CanvasRenderingContext2D, pts: Point[]): void {
	ctx.beginPath();
	ctx.moveTo(pts[0].x, pts[0].y);
	if (pts.length === 1) ctx.lineTo(pts[0].x + 0.01, pts[0].y + 0.01);
	for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
}

function drawFreehand(
	ctx: CanvasRenderingContext2D,
	a: Extract<Annotation, { kind: "pen" | "highlight" }>
): void {
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

function drawArrow(ctx: CanvasRenderingContext2D, a: Extract<Annotation, { kind: "arrow" }>): void {
	const g = arrowGeometry(a);
	if (g.len < 2) return;
	const nx = -g.uy;
	const ny = g.ux;
	const tail = g.neck * 0.2;
	const notch = g.headLen * 0.78;
	const pt = (along: number, side: number): [number, number] => [
		a.b.x - g.ux * along + nx * side,
		a.b.y - g.uy * along + ny * side,
	];
	const poly: [number, number][] = [
		[a.a.x + nx * tail, a.a.y + ny * tail],
		pt(notch, g.neck),
		pt(g.headLen, g.headHalf),
		[a.b.x, a.b.y],
		pt(g.headLen, -g.headHalf),
		pt(notch, -g.neck),
		[a.a.x - nx * tail, a.a.y - ny * tail],
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

function drawShape(
	ctx: CanvasRenderingContext2D,
	a: Extract<Annotation, { kind: "rect" | "ellipse" }>
): void {
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

function drawBadge(ctx: CanvasRenderingContext2D, a: Extract<Annotation, { kind: "badge" }>): void {
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

function drawText(ctx: CanvasRenderingContext2D, a: Extract<Annotation, { kind: "text" }>): void {
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

export function annotationBounds(ctx: CanvasRenderingContext2D, a: Annotation): Rect {
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
			return padRect(normRect(a.a, a.b), (a.thickness * a.s) / 2 + borderWidth(a));
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

/** True if `p` is on the visible part of the annotation, within `tol` canvas pixels. */
export function hitTest(ctx: CanvasRenderingContext2D, a: Annotation, p: Point, tol: number): boolean {
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
			const edge = (a.thickness * a.s) / 2 + borderWidth(a) + tol;
			const inOuter = inRect(p, padRect(r, edge));
			const inInner = r.w > edge * 2 && r.h > edge * 2 && inRect(p, padRect(r, -edge));
			return inOuter && !inInner;
		}
		case "ellipse": {
			const r = normRect(a.a, a.b);
			const rx = r.w / 2 || 1;
			const ry = r.h / 2 || 1;
			const d = Math.hypot((p.x - (r.x + rx)) / rx, (p.y - (r.y + ry)) / ry);
			return Math.abs(d - 1) * Math.min(rx, ry) <= (a.thickness * a.s) / 2 + borderWidth(a) + tol;
		}
		case "badge":
			return Math.hypot(p.x - a.p.x, p.y - a.p.y) <= badgeRadius(a) + tol;
		case "text":
			return inRect(p, padRect(annotationBounds(ctx, a), tol));
	}
}

/** Applies `f` to every point of the annotation, in place. */
export function mapAnnotation(a: Annotation, f: (p: Point) => Point): void {
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

export function translateAnnotation(a: Annotation, dx: number, dy: number): void {
	mapAnnotation(a, (p) => ({ x: p.x + dx, y: p.y + dy }));
}

export function cloneAnnotation<T extends Annotation | Annotation[]>(a: T): T {
	return JSON.parse(JSON.stringify(a)) as T;
}

function padRect(r: Rect, pad: number): Rect {
	return { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 };
}

function inRect(p: Point, r: Rect): boolean {
	return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

function distToSegment(p: Point, a: Point, b: Point): number {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const len2 = dx * dx + dy * dy;
	const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
	return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function distToPolyline(p: Point, pts: Point[]): number {
	if (pts.length === 1) return Math.hypot(p.x - pts[0].x, p.y - pts[0].y);
	let best = Infinity;
	for (let i = 1; i < pts.length; i++) best = Math.min(best, distToSegment(p, pts[i - 1], pts[i]));
	return best;
}

export function hexToRgba(hex: string, alpha: number): string {
	const h = hex.replace("#", "");
	const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
	const n = parseInt(full, 16);
	return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
