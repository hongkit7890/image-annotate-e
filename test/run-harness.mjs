import esbuild from "esbuild";
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer-core";

const imagePath = process.argv[2];
const browser = process.argv[3];
const outDir = path.resolve("test/out");
fs.mkdirSync(outDir, { recursive: true });

const b64 = fs.readFileSync(imagePath).toString("base64");

const result = await esbuild.build({
	entryPoints: ["test/harness.ts"],
	bundle: true,
	write: false,
	format: "iife",
	target: "es2020",
	alias: { obsidian: "./test/mock-obsidian.ts" },
	define: { IMAGE_B64: JSON.stringify(b64) },
});

const css = fs.readFileSync("styles.css", "utf8");
const html = `<!doctype html><html><head><style>
html,body{margin:0;height:100%;background:#1e1e1e;font-family:sans-serif}
.modal-container{position:fixed;inset:0;display:flex;align-items:center;justify-content:center}
.modal{position:relative;background:#2b2b2b;border-radius:8px}
button{display:inline-flex;align-items:center;justify-content:center;border:0;padding:4px 12px;height:30px;white-space:nowrap}
button:not(.clickable-icon){background-color:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2),0 0 0 1px rgba(0,0,0,.12)}
#result{position:fixed;left:0;bottom:0;color:#0f0;font-size:10px;white-space:pre-wrap;z-index:99}
${css}</style></head><body><pre id="result">pending</pre>
<script>${result.outputFiles[0].text}</script></body></html>`;
const htmlPath = path.join(outDir, "harness.html");
fs.writeFileSync(htmlPath, html);

const url = "file:///" + htmlPath.replace(/\\/g, "/");
const chrome = await puppeteer.launch({ executablePath: browser, headless: true });
const page = await chrome.newPage();
await page.setViewport({ width: 1600, height: 1000 });
await page.goto(url);
await page.waitForFunction(
	() => document.getElementById("result").textContent.startsWith("{"),
	{ timeout: 20000 }
);
const resultText = await page.$eval("#result", (el) => el.textContent);
fs.writeFileSync(path.join(outDir, "result.json"), resultText);
console.log(resultText);
await page.screenshot({ path: path.join(outDir, "harness.png") });
const toolbar = await page.$(".iae-toolbar");
await toolbar.screenshot({ path: path.join(outDir, "toolbar.png") });
await chrome.close();
