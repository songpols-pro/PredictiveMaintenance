// axe-core on every screen, light and dark, plus opened states (dialog, menus, settings tabs).
const BASE = "http://localhost:3000";
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

import { readFileSync } from "node:fs";
// axe-core is a devDependency of the app; inject it straight from node_modules.
const AXE = readFileSync(new URL("../pdm-app/node_modules/axe-core/axe.min.js", import.meta.url), "utf8");

const RUN = `(async () => {
  const r = await axe.run(document, { runOnly: { type: 'tag', values: ${JSON.stringify(TAGS)} } });
  return { rules: r.passes.length + r.violations.length + r.incomplete.length + r.inapplicable.length,
    violations: r.violations.map(v => v.impact + ' ' + v.id + ' x' + v.nodes.length + ' :: ' + v.nodes.slice(0, 2).map(n => n.target.join(' ') + ' → ' + n.failureSummary.split('\\n').slice(1, 2).join('')).join(' || ')) };
})()`;

const STATES = [
  ["overview", "/", null],
  ["overview + work-order dialog", "/", `(async () => { [...document.querySelectorAll('main button')].find(b => b.innerText.includes('Work order')).click(); await new Promise(r => setTimeout(r, 700)); document.querySelector('[role=dialog] input').value=''; })()`],
  ["assets", "/assets", null],
  ["assets filtered to nothing", "/assets?q=zzzz", null],
  ["asset detail", "/assets/AYT-CMP-301", null],
  ["asset detail (offline asset)", "/assets/CBI-FAN-203", null],
  ["asset detail + table view", "/assets/RYG-PMP-303", `(async () => { [...document.querySelectorAll('button')].find(b => b.innerText.includes('View table')).click(); await new Promise(r => setTimeout(r, 400)); })()`],
  ["alerts", "/alerts", null],
  ["alerts + snooze menu", "/alerts?id=AL-2482", `(async () => { const b = [...document.querySelectorAll('aside button')].find(b => b.innerText.includes('Snooze')); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' })); await new Promise(r => setTimeout(r, 500)); })()`],
  ["work orders", "/work-orders", null],
  ["work orders + detail sheet", "/work-orders?wo=WO-1047", null],
  ["settings / thresholds", "/settings", null],
  ["settings / rules", "/settings", `(async () => { const t = [...document.querySelectorAll('[role=tab]')][1]; t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); t.focus(); t.click(); await new Promise(r => setTimeout(r, 1200)); })()`],
  ["settings / users", "/settings", `(async () => { const t = [...document.querySelectorAll('[role=tab]')][2]; t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); t.focus(); t.click(); await new Promise(r => setTimeout(r, 1200)); })()`],
];

export default async function (page) {
  await page.viewport(1440, 900);
  for (const scheme of ["light", "dark"]) {
    await page.media([{ name: "prefers-color-scheme", value: scheme }]);
    for (const [name, path, setup] of STATES) {
      await page.goto(BASE + path, 2800);
      if (setup) await page.eval(setup);
      await page.eval(AXE + ";true");
      const r = await page.eval(RUN);
      console.log(`${scheme.padEnd(5)} ${name.padEnd(32)} rules=${r.rules} violations=${r.violations.length}${r.violations.length ? "\n      " + r.violations.join("\n      ") : ""}`);
    }
  }
}
