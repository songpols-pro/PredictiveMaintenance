// Tiny Chrome DevTools Protocol driver for QA: screenshots, state previews and keyboard checks.
// Usage: node tools/cdp.mjs <task-file.mjs>   (task file default-exports async (page) => {...})
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), "pdm-cdp-"));
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });

async function targetWs() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(200);
  }
  throw new Error("Chrome did not start");
}

const ws = new WebSocket(await targetWs());
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let seq = 0;
const pending = new Map();
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { ok, fail } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? fail(new Error(msg.error.message)) : ok(msg.result);
  }
});
const send = (method, params = {}) =>
  new Promise((ok, fail) => {
    const id = ++seq;
    pending.set(id, { ok, fail });
    ws.send(JSON.stringify({ id, method, params }));
  });

await send("Page.enable");
await send("Runtime.enable");

const page = {
  send,
  sleep,
  async viewport(width, height, scale = 1) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile: false });
  },
  async media(features) {
    await send("Emulation.setEmulatedMedia", { features });
  },
  async goto(url, wait = 2500) {
    await send("Page.navigate", { url });
    await sleep(wait);
  },
  async eval(expression) {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  },
  async key(key, code = key, keyCode = 0, modifiers = 0) {
    await send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: keyCode, modifiers });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: keyCode, modifiers });
  },
  async tab(times = 1, shift = false) {
    for (let i = 0; i < times; i++) await this.key("Tab", "Tab", 9, shift ? 8 : 0);
  },
  async shot(path, fullPage = true) {
    let clip;
    if (fullPage) {
      const { contentSize } = await send("Page.getLayoutMetrics");
      clip = { x: 0, y: 0, width: contentSize.width, height: Math.min(contentSize.height, 6000), scale: 1 };
    }
    const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: fullPage, clip });
    writeFileSync(path, Buffer.from(data, "base64"));
  },
};

try {
  const task = (await import(pathToFileURL(resolve(process.argv[2])).href)).default;
  await task(page);
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  ws.close();
  chrome.kill();
}
