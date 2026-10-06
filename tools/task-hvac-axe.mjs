// axe-core on every chiller plant (/hvac) screen and state, plus a 320 px reflow check. LOCALE=th for Thai.
import { readFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const LOCALE = process.env.LOCALE ?? "en";
const THEME = process.env.THEME ?? "light";
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const AXE = readFileSync(new URL("../pdm-app/node_modules/axe-core/axe.min.js", import.meta.url), "utf8");

const RUN = `(async () => {
  const r = await axe.run(document, { runOnly: { type: 'tag', values: ${JSON.stringify(TAGS)} } });
  return { rules: r.passes.length + r.violations.length + r.incomplete.length + r.inapplicable.length,
    violations: r.violations.map(v => v.impact + ' ' + v.id + ' x' + v.nodes.length + ' :: ' + v.nodes.slice(0, 2).map(n => n.target.join(' ') + ' → ' + n.failureSummary.split('\\n').slice(1, 2).join('')).join(' || ')) };
})()`;

const sleep = (ms) => `await new Promise(r => setTimeout(r, ${ms}));`;
const openMenu = () => `const b = document.querySelector('header svg.lucide-flask-conical').closest('button'); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' })); ${sleep(400)}`;

const STATES = [
  ["plant", "/hvac", null],
  ["plant + chiller detail", "/hvac?device=CH-2", null],
  ["plant + AHU detail", "/hvac?device=AHU-3", null],
  ["plant + pump detail", "/hvac?device=CHP-1", null],
  ["plant + control kit detail", "/hvac?device=CP-1", null],
  ["plant + demo menu open", "/hvac", `(async () => { ${openMenu()} })()`],
  [
    "plant + connection lost",
    "/hvac",
    `(async () => { ${openMenu()} [...document.querySelectorAll('[role=menuitemradio]')][1].click(); ${sleep(600)} })()`,
  ],
  ["power", "/hvac/power", null],
  ["power + meter detail", "/hvac/power?meter=PM-CH-2", null],
  ["power + chart table", "/hvac/power", `(async () => { document.querySelector('figure button[aria-pressed]').click(); ${sleep(400)} })()`],
  ["trend empty", "/hvac/trend", null],
  ["trend with charts", "/hvac/trend?points=CH-1.chwOut,CH-2.chwOut,CH-1.kw,CH-3.running,PM-CH-1.pf&range=h24&step=15", null],
  ["trend + point picker", "/hvac/trend?points=CH-1.chwOut", `(async () => { [...document.querySelectorAll('button')].find(b => b.querySelector('svg.lucide-list-checks')).click(); ${sleep(500)} })()`],
  ["trend custom range error", "/hvac/trend?points=CH-1.chwOut&range=custom", `(async () => {
      const inputs = document.querySelectorAll('input[type=datetime-local]');
      const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
      set(inputs[0], '2026-10-06T10:00'); set(inputs[1], '2026-10-05T10:00'); ${sleep(100)}
      [...document.querySelectorAll('button')].find(b => b.className.includes('bg-primary') && !b.querySelector('svg')).click(); ${sleep(300)} })()`],
  ["report empty", "/hvac/report", null],
  [
    "report with results",
    "/hvac/report",
    `(async () => {
      document.querySelectorAll('form details summary')[0].click(); ${sleep(150)}
      const boxes = document.querySelectorAll('form details')[0].querySelectorAll('button[role=checkbox]');
      boxes[1].click(); boxes[4].click(); ${sleep(100)}
      document.querySelector('form button[type=submit]').click(); ${sleep(800)} })()`,
  ],
  ["alarms active", "/hvac/alarms", null],
  ["alarm logs", "/hvac/alarms/logs", null],
];

export default async function (page) {
  await page.goto(BASE + "/hvac", 800);
  await page.eval(`document.cookie = "pdm-locale=${LOCALE}; path=/"; true`);
  await page.media([{ name: "prefers-color-scheme", value: THEME }]);
  await page.viewport(1440, 900);
  for (const [name, path, script] of STATES) {
    await page.goto(BASE + path, 3000);
    if (script) await page.eval(script);
    await page.eval(AXE + "; true");
    const r = await page.eval(RUN);
    console.log(`${LOCALE}/${THEME} ${name.padEnd(30)} rules=${r.rules} violations=${r.violations.length}`);
    for (const v of r.violations) console.log("      " + v);
  }
  // Reflow: no horizontal scrolling at 320 CSS px (WCAG 1.4.10).
  await page.viewport(320, 640);
  for (const path of ["/hvac", "/hvac/power", "/hvac/trend?points=CH-1.chwOut", "/hvac/report", "/hvac/alarms", "/hvac/alarms/logs"]) {
    await page.goto(BASE + path, 3000);
    const w = await page.eval(`({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth, wide: [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.right > document.documentElement.clientWidth + 1 && getComputedStyle(e).position !== 'fixed' && !e.closest('[role=region]') && r.width > 0; }).slice(0, 3).map(e => e.tagName + '.' + String(e.className).slice(0, 60)) })`);
    console.log(`${LOCALE} reflow 320 ${path.padEnd(32)} scrollWidth=${w.scroll} client=${w.client} ${w.scroll > w.client ? "OVERFLOW " + JSON.stringify(w.wide) : "ok"}`);
  }
}
