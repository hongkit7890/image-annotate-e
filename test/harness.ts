import { TFile } from "obsidian";
import { AnnotateModal } from "../src/annotateModal";

declare const IMAGE_B64: string;

(window as any).__notices = [];

function b64ToBuffer(b64: string): ArrayBuffer {
	const bin = atob(b64);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out.buffer;
}

function drag(canvas: HTMLCanvasElement, pts: [number, number][], altKey = false) {
	const r = canvas.getBoundingClientRect();
	const at = (fx: number, fy: number) => ({
		clientX: r.left + fx * r.width,
		clientY: r.top + fy * r.height,
		pointerId: 1,
		bubbles: true,
		altKey,
	});
	canvas.dispatchEvent(new PointerEvent("pointerdown", at(...pts[0])));
	for (const p of pts.slice(1)) canvas.dispatchEvent(new PointerEvent("pointermove", at(...p)));
	canvas.dispatchEvent(new PointerEvent("pointerup", at(...pts[pts.length - 1])));
}

function px(ctx: CanvasRenderingContext2D, fx: number, fy: number, c: HTMLCanvasElement) {
	const d = ctx.getImageData(Math.floor(fx * c.width), Math.floor(fy * c.height), 1, 1).data;
	return `${d[0]},${d[1]},${d[2]},${d[3]}`;
}

async function run() {
	const out: Record<string, unknown> = {};
	try {
		const file = new TFile("Pasted image.png", "Pasted image.png", "png");
		let savedBytes = 0;
		const app = {
			vault: {
				readBinary: async () => b64ToBuffer(IMAGE_B64),
				modifyBinary: async (_f: unknown, buf: ArrayBuffer) => {
					savedBytes = buf.byteLength;
				},
				getResourcePath: () => "app://vault/Pasted%20image.png?1000",
				getAbstractFileByPath: () => null,
				getFiles: () => [file],
			},
			metadataCache: {
				getFirstLinkpathDest: (p: string) => (p === file.name ? file : null),
			},
			workspace: { getActiveFile: () => null },
		};
		const embed = document.body.createDiv({ cls: "internal-embed image-embed" });
		embed.setAttribute("src", file.name);
		const noteImg = embed.createEl("img", { attr: { src: "app://vault/Pasted%20image.png?1000" } });
		const otherImg = document.body.createEl("img", { attr: { src: "app://vault/other.png?1" } });
		const modal = new AnnotateModal(app as any, file);
		const show = (s: string) => (document.getElementById("result")!.textContent = s);
		show("opening");
		await (modal as any).open();
		show("opened");
		await new Promise((r) => setTimeout(r, 50));
		show("waited");

		const canvas = document.querySelector(".iae-stage canvas") as HTMLCanvasElement;
		for (let i = 0; i < 100 && canvas.getBoundingClientRect().width <= 300; i++) {
			await new Promise((r) => setTimeout(r, 20));
		}
		const ctx = canvas.getContext("2d")!;
		const rect = canvas.getBoundingClientRect();
		out.canvasSize = `${canvas.width}x${canvas.height}`;
		out.displaySize = `${Math.round(rect.width)}x${Math.round(rect.height)}`;
		out.pixelBefore = px(ctx, 0.5, 0.6, canvas);
		out.defaultTool = document.querySelector(".iae-tool.is-active")?.textContent;
		const sk = (k: string, ctrl = false) =>
			document.dispatchEvent(new KeyboardEvent("keydown", { key: k, ctrlKey: ctrl, bubbles: true }));
		const active = () => document.querySelector(".iae-tool.is-active")?.textContent;
		const shortcutResults: string[] = [];
		for (const k of ["v", "p", "t", "s", "a", "b", "u"]) {
			sk(k);
			shortcutResults.push(`${k}=${active()}`);
		}
		out.shortcuts = shortcutResults.join(" ");
		sk("r");
		out.shortcut_r_size = `${canvas.width}x${canvas.height}`;
		sk("z", true);
		out.shortcut_r_undo_size = `${canvas.width}x${canvas.height}`;
		sk("a");

		const codeEl = document.querySelector(".iae-color-code") as HTMLInputElement;
		out.defaultCode = codeEl.value;
		const enterCode = (v: string) => {
			codeEl.value = v;
			codeEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
			return `${(document.querySelector(".iae-color-swatch") as HTMLInputElement).value} ${codeEl.value}${codeEl.classList.contains("is-invalid") ? " invalid" : ""}`;
		};
		out.code_rgb = enterCode("rgb(0, 128, 255)");
		out.code_csv = enterCode("255,0,0");
		out.code_short = enterCode("#ABC");
		out.code_bad = enterCode("300,0,0");
		out.code_hex = enterCode("7852ee");

		const tool = (label: string) =>
			(Array.from(document.querySelectorAll(".iae-tool")) as HTMLElement[])
				.find((b) => b.textContent?.includes(label))!
				.click();
		tool("Pen");
		drag(canvas, [
			[0.3, 0.6],
			[0.5, 0.6],
			[0.7, 0.6],
		]);
		out.penPixel = px(ctx, 0.5, 0.6, canvas);

		tool("Highlight");
		out.highlightPickerColor = (document.querySelector(".iae-color-swatch") as HTMLInputElement).value;
		drag(canvas, [
			[0.05, 0.97],
			[0.15, 0.97],
		]);
		out.highlightPixel = px(ctx, 0.1, 0.97, canvas);

		const typeText = (fx: number, fy: number, text: string) => {
			const r = canvas.getBoundingClientRect();
			canvas.dispatchEvent(
				new PointerEvent("pointerdown", {
					clientX: r.left + fx * r.width,
					clientY: r.top + fy * r.height,
					pointerId: 1,
					bubbles: true,
				})
			);
			const input = document.querySelector(".iae-text-input") as HTMLInputElement;
			input.value = text;
			input.dispatchEvent(new Event("input"));
			return input;
		};
		const countColors = (fx: number, fy: number, fw: number, fh: number) => {
			const d = ctx.getImageData(
				Math.floor(fx * canvas.width), Math.floor(fy * canvas.height),
				Math.floor(fw * canvas.width), Math.floor(fh * canvas.height)
			).data;
			let red = 0, white = 0;
			for (let i = 0; i < d.length; i += 4) {
				if (d[i] > 190 && d[i + 1] < 80 && d[i + 2] < 80) red++;
				if (d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245) white++;
			}
			return { red, white };
		};

		tool("Text");
		const input = typeText(0.05, 0.62, "ABC");
		const cs = getComputedStyle(input);
		out.textInputBg = cs.backgroundColor;
		out.textInputBorder = cs.borderTopStyle;
		out.textInputWidthPx = Math.round(input.getBoundingClientRect().width);
		input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		out.textInputGone = !document.querySelector(".iae-text-input");
		// region over the dark grey "System Announcement" button so the white outline is measurable
		out.textWithBorder = countColors(0.04, 0.61, 0.1, 0.06);

		(document.querySelector(".iae-border-row input[type=checkbox]") as HTMLInputElement).click();
		typeText(0.05, 0.7, "ABC");
		tool("Arrow");
		out.textNoBorder = countColors(0.04, 0.69, 0.1, 0.06);
		(document.querySelector(".iae-border-row input[type=checkbox]") as HTMLInputElement).click();

		tool("Arrow");
		out.arrowPickerColor = (document.querySelector(".iae-color-swatch") as HTMLInputElement).value;
		drag(canvas, [
			[0.2, 0.9],
			[0.4, 0.8],
		]);
		out.arrowPixel = px(ctx, 0.3, 0.85, canvas);
		drag(canvas, [
			[0.55, 0.35],
			[0.7, 0.2],
		]);
		const action = (label: string) =>
			(Array.from(document.querySelectorAll(".iae-action-btn")) as HTMLElement[])
				.find((b) => b.textContent === label)!
				.click();
		action("Clear");
		out.penPixelAfterClear = px(ctx, 0.5, 0.6, canvas);
		action("Undo");
		out.penPixelAfterUndo = px(ctx, 0.5, 0.6, canvas);
		const key = (k: string, shift = false) =>
			document.dispatchEvent(
				new KeyboardEvent("keydown", { key: k, ctrlKey: true, shiftKey: shift, bubbles: true })
			);
		action("Clear");
		key("z");
		out.ctrlZ_expectPink = px(ctx, 0.5, 0.6, canvas);
		key("y");
		out.ctrlY_expectWhite = px(ctx, 0.5, 0.6, canvas);
		key("z");
		key("z", true);
		out.ctrlShiftZ_expectWhite = px(ctx, 0.5, 0.6, canvas);
		key("z");

		const isRed = (fx: number, fy: number) => {
			const [r, g, b] = px(ctx, fx, fy, canvas).split(",").map(Number);
			return Math.abs(r - 120) < 20 && Math.abs(g - 82) < 20 && Math.abs(b - 238) < 20;
		};
		const count = () => (modal as any).objects.length as number;
		const plainKey = (k: string) =>
			document.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));

		tool("Select");
		out.select_tool = document.querySelector(".iae-tool.is-active")?.textContent;
		const n0 = count();
		drag(canvas, [
			[0.3, 0.85],
			[0.3, 0.8],
			[0.3, 0.75],
		]);
		out.move_oldSpotRed_expectFalse = isRed(0.3, 0.85);
		out.move_newSpotRed_expectTrue = isRed(0.3, 0.75);
		out.move_countSame = count() === n0;

		drag(canvas, [
			[0.3, 0.75],
			[0.4, 0.75],
			[0.5, 0.75],
		], true);
		out.altCopy_originalStillRed = isRed(0.3, 0.75);
		out.altCopy_copyRed = isRed(0.5, 0.75);
		out.altCopy_countPlus1 = count() === n0 + 1;

		key("c");
		key("v");
		out.paste_countPlus2 = count() === n0 + 2;
		key("d");
		out.duplicate_countPlus3 = count() === n0 + 3;
		plainKey("Delete");
		out.delete_countPlus2 = count() === n0 + 2;
		key("z");
		out.undoDelete_countPlus3 = count() === n0 + 3;

		drag(canvas, [[0.01, 0.01], [0.01, 0.01]]);
		out.clickEmpty_deselects = (modal as any).selected === null;
		drag(canvas, [[0.5, 0.75], [0.5, 0.75]]);
		out.clickCopy_selects = (modal as any).selected !== null;

		plainKey("Enter");
		for (let i = 0; i < 200 && !savedBytes; i++) await new Promise((r) => setTimeout(r, 20));
		await new Promise((r) => setTimeout(r, 50));
		out.savedBytes = savedBytes;
		out.noteImgSrc = noteImg.getAttribute("src");
		out.otherImgSrc = otherImg.getAttribute("src");

		tool("Text");
		typeText(0.35, 0.05, "Typing here");
		out.activeTool = document.querySelector(".iae-tool.is-active")?.textContent;
		out.hint = document.querySelector(".iae-hint")?.textContent;
	} catch (e) {
		out.error = String((e as Error)?.stack ?? e);
	}
	out.notices = (window as any).__notices;
	document.getElementById("result")!.textContent = JSON.stringify(out);
}

run();
