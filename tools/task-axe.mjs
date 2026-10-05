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
  ["website", "/", null],
  ["website + form errors", "/", `(async () => { document.querySelector('#demo form button[type=submit]').click(); await new Promise(r => setTimeout(r, 400)); })()`],
  ["website + FAQ open", "/", `(async () => { document.querySelectorAll('#faq details').forEach(d => d.open = true); })()`],
  ["website + tour tab 2", "/", `(async () => { const t = [...document.querySelectorAll('#tour [role=tab]')][1]; t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); t.click(); await new Promise(r => setTimeout(r, 800)); })()`],
  ["overview", "/app", null],
  ["overview + work-order dialog", "/app", `(async () => { document.querySelector('article[aria-labelledby^="att-"] button:not([aria-haspopup])').click(); await new Promise(r => setTimeout(r, 700)); document.querySelector('[role=dialog] input').value=''; })()`],
  ["assets", "/app/assets", null],
  ["assets filtered to nothing", "/app/assets?q=zzzz", null],
  ["asset detail", "/app/assets/AYT-CMP-301", null],
  ["asset detail (offline asset)", "/app/assets/CBI-FAN-203", null],
  ["asset detail + table view", "/app/assets/RYG-PMP-303", `(async () => { document.querySelector('figure button[aria-pressed]').click(); await new Promise(r => setTimeout(r, 400)); })()`],
  ["alerts", "/app/alerts", null],
  ["alerts + snooze menu", "/app/alerts?id=AL-2482", `(async () => { const b = document.querySelector('aside button[aria-haspopup="menu"]'); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' })); await new Promise(r => setTimeout(r, 500)); })()`],
  ["work orders", "/app/work-orders", null],
  ["work orders + detail sheet", "/app/work-orders?wo=WO-1047", null],
  ["settings / thresholds", "/app/settings", null],
  ["settings / rules", "/app/settings", `(async () => { const t = [...document.querySelectorAll('[role=tab]')][1]; t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); t.focus(); t.click(); await new Promise(r => setTimeout(r, 1200)); })()`],
  ["settings / users", "/app/settings", `(async () => { const t = [...document.querySelectorAll('[role=tab]')][2]; t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); t.focus(); t.click(); await new Promise(r => setTimeout(r, 1200)); })()`],
];

export default async function (page) {
  await page.viewport(1440, 900);
  // LOCALE=th node tools/cdp.mjs tools/task-axe.mjs  → audit the Thai UI
  const locale = process.env.LOCALE ?? "en";
  await page.goto(BASE + "/", 1500);
  await page.eval(`document.cookie = "pdm-locale=${locale}; path=/; max-age=31536000"; true`);
  console.log("locale:", locale);
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
