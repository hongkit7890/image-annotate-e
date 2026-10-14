type DomInfo = { cls?: string; text?: string; attr?: Record<string, string> };

function apply(el: HTMLElement, o?: DomInfo | string): HTMLElement {
	if (typeof o === "string") o = { cls: o };
	if (o?.cls) el.className = o.cls;
	if (o?.text) el.textContent = o.text;
	if (o?.attr) for (const [k, v] of Object.entries(o.attr)) el.setAttribute(k, v);
	return el;
}

const P = HTMLElement.prototype as any;
P.createEl = function (tag: string, o?: DomInfo) {
	const el = apply(document.createElement(tag), o);
	this.appendChild(el);
	return el;
};
P.createDiv = function (o?: DomInfo) {
	return this.createEl("div", o);
};
P.createSpan = function (o?: DomInfo) {
	return this.createEl("span", o);
};
P.empty = function () {
	this.innerHTML = "";
};
P.addClass = function (c: string) {
	this.classList.add(c);
};
P.hasClass = function (c: string) {
	return this.classList.contains(c);
};
P.removeClass = function (c: string) {
	this.classList.remove(c);
};
P.toggleClass = function (c: string, on: boolean) {
	this.classList.toggle(c, on);
};
P.setText = function (t: string) {
	this.textContent = t;
};
P.setCssStyles = function (styles: Record<string, string>) {
	Object.assign(this.style, styles);
};

export class Notice {
	constructor(msg: string) {
		(window as any).__notices.push(msg);
	}
}

export class TFile {
	constructor(public path: string, public name: string, public extension: string) {}
}

type KeyHandler = (evt: KeyboardEvent) => boolean | void;

export class Scope {
	private handlers: { mods: string[]; key: string; fn: KeyHandler }[] = [];
	constructor() {
		document.addEventListener("keydown", (evt) => {
			for (const h of this.handlers) {
				const want = (m: string) => h.mods.includes(m);
				if (
					evt.key.toLowerCase() === h.key.toLowerCase() &&
					evt.ctrlKey === want("Mod") &&
					evt.shiftKey === want("Shift")
				) {
					if (h.fn(evt) === false) evt.preventDefault();
					return;
				}
			}
		});
	}
	register(mods: string[], key: string, fn: KeyHandler) {
		this.handlers.push({ mods, key, fn });
	}
}

export class Modal {
	modalEl: HTMLElement;
	contentEl: HTMLElement;
	scope = new Scope();
	constructor(public app: any) {
		const container = document.body.createDiv({ cls: "modal-container" });
		this.modalEl = container.createDiv({ cls: "modal" });
		this.modalEl.createDiv({ cls: "modal-close-button" });
		this.contentEl = this.modalEl.createDiv({ cls: "modal-content" });
	}
	open() {
		return (this as any).onOpen();
	}
	close() {}
}

export class App {}
