import { App, TFile } from "obsidian";

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp)$/i;

export function isImageFile(file: TFile): boolean {
	return IMAGE_EXT.test(`.${file.extension}`) || IMAGE_EXT.test(file.name);
}

function cleanLinkpath(raw: string): string {
	let e = (raw || "").trim();
	e = e.replace(/^app:\/\/local\/[^/]+\//i, "");
	e = e.replace(/^app:\/\//i, "");
	e = e.split("#")[0].split("?")[0].split("|")[0];
	try {
		e = decodeURIComponent(e);
	} catch {
		/* ignore */
	}
	return e.replace(/^\/+/, "");
}

function isExternal(src: string): boolean {
	return /^(https?:|data:|blob:|file:)/i.test(src.trim());
}

/** Resolve a vault image file from a right-clicked <img> / embed element. */
export function resolveImageFromElement(app: App, el: HTMLElement): TFile | null {
	const img = el instanceof HTMLImageElement ? el : el.closest("img");
	if (!img) {
		// Might have right-clicked the embed wrapper
		const embedOnly =
			el.closest(".internal-embed") ||
			el.closest(".image-embed") ||
			el.closest(".media-embed");
		if (embedOnly) {
			const linkpath = embedOnly.getAttribute("src");
			if (linkpath) return resolveLinkpath(app, linkpath);
		}
		return null;
	}

	const embed =
		img.closest(".internal-embed") ||
		img.closest(".image-embed") ||
		img.closest(".media-embed");

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

/**
 * Reload every displayed <img> of `file`. Obsidian caches images by URL, so
 * open notes keep showing the old pixels after modifyBinary() unless the
 * src changes.
 */
export function refreshImageEmbeds(app: App, file: TFile): number {
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

function resolveLinkpath(app: App, linkpath: string): TFile | null {
	const cleaned = cleanLinkpath(linkpath);
	if (!cleaned || isExternal(cleaned)) return null;

	const sourcePath = app.workspace.getActiveFile()?.path ?? "";
	const dest = app.metadataCache.getFirstLinkpathDest(cleaned, sourcePath);
	if (dest instanceof TFile && isImageFile(dest)) return dest;

	// Exact vault path
	const byPath = app.vault.getAbstractFileByPath(cleaned);
	if (byPath instanceof TFile && isImageFile(byPath)) return byPath;

	// Basename fallback
	const base = cleaned.split("/").pop() ?? "";
	if (!base) return null;
	const activeFolder = app.workspace.getActiveFile()?.parent?.path ?? "";
	const files = app.vault.getFiles().filter(isImageFile);
	return (
		files.find((f) => f.name === base && f.parent?.path === activeFolder) ||
		files.find((f) => f.name === base) ||
		null
	);
}

function resolveFromSrcUrl(app: App, src: string): TFile | null {
	if (!src) return null;

	try {
		const url = new URL(src);
		let path = cleanLinkpath(url.pathname);

		// Match longest vault file path suffix
		const files = app.vault.getFiles().filter(isImageFile);
		let best: TFile | null = null;
		for (const file of files) {
			if (
				path === file.path ||
				path.endsWith("/" + file.path) ||
				path.endsWith(file.path)
			) {
				if (!best || file.path.length > best.path.length) best = file;
			}
		}
		if (best) return best;

		const basename = path.split("/").pop() ?? "";
		if (basename) {
			const activeFolder = app.workspace.getActiveFile()?.parent?.path ?? "";
			return (
				files.find((f) => f.name === basename && f.parent?.path === activeFolder) ||
				files.find((f) => f.name === basename) ||
				null
			);
		}
	} catch {
		/* ignore */
	}

	return null;
}
