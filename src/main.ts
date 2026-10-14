import { Menu, Notice, Plugin, TFile, setIcon } from "obsidian";
import { AnnotateModal } from "./annotateModal";
import { isImageFile, resolveImageFromElement } from "./resolveImage";

interface PendingCtx {
	file: TFile;
	time: number;
}

export default class ImageAnnotatEPlugin extends Plugin {
	private pendingCtx: PendingCtx | null = null;
	private lastCtx: { target: EventTarget | null; evt: MouseEvent; time: number } | null =
		null;

	async onload(): Promise<void> {
		// File explorer / tab header — append to Obsidian's menu
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (!(file instanceof TFile) || !isImageFile(file)) return;
				this.addAnnotateMenuItem(menu, file);
			})
		);

		// Live Preview / editor — append when Obsidian builds editor-menu
		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu) => {
				const ctx = this.lastCtx;
				if (!ctx || Date.now() - ctx.time > 1500) return;
				const file = resolveImageFromElement(
					this.app,
					ctx.target as HTMLElement
				);
				if (!file) return;
				this.addAnnotateMenuItem(menu, file);
				this.pendingCtx = null;
			})
		);

		// Capture: remember what was right-clicked (do NOT preventDefault)
		this.registerDomEvent(
			document,
			"contextmenu",
			(evt: MouseEvent) => {
				this.lastCtx = { target: evt.target, evt, time: Date.now() };
			},
			true
		);

		// Bubble: after Obsidian opens its menu, inject Annotate into it
		this.registerDomEvent(document, "contextmenu", (evt: MouseEvent) => {
			const target = evt.target as HTMLElement | null;
			if (!target) return;

			const img =
				target instanceof HTMLImageElement
					? target
					: (target.closest("img") as HTMLImageElement | null);
			if (!img) return;
			if (img.closest(".iae-modal, .workspace-ribbon, .titlebar")) return;

			const inNote =
				img.closest(".markdown-preview-view") ||
				img.closest(".markdown-source-view") ||
				img.closest(".cm-editor") ||
				img.closest(".image-embed") ||
				img.closest(".internal-embed") ||
				img.closest(".view-content");
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
				) as HTMLImageElement | null;
				if (img) {
					const file = resolveImageFromElement(this.app, img);
					if (file) {
						this.openAnnotator(file);
						return;
					}
				}
				new Notice("Right-click an image and choose Annotate.");
			},
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
			},
		});
	}

	private addAnnotateMenuItem(menu: Menu, file: TFile): void {
		menu.addSeparator();
		menu.addItem((item) => {
			item
				.setTitle("Annotate")
				.setIcon("pencil")
				.onClick(() => this.openAnnotator(file));
		});
	}

	/** Inject into Obsidian's already-open `.menu` (reading view / fallback). */
	private injectAnnotateIntoNativeMenu(): void {
		const pending = this.pendingCtx;
		if (!pending || Date.now() - pending.time > 800) return;

		const menus = Array.from(document.querySelectorAll(".menu"));
		const menuEl = menus[menus.length - 1] as HTMLElement | undefined;
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
		setIcon(icon, "pencil");

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

	openAnnotator(file: TFile): void {
		new AnnotateModal(this.app, file).open();
	}
}
