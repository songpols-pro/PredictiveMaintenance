// Screenshots of the chiller plant module (/hvac) at the mock-up's 1920×1080 and a 1366 laptop.
// LOCALE=th for Thai, THEME=dark for the dark theme. Output: screenshots/hvac/
const OUT = "E:/POP/CLAUDE/Monitor/screenshots/hvac";
const BASE = process.env.BASE ?? "http://localhost:3000";
const LOCALE = process.env.LOCALE ?? "en";
const ONLY = process.env.ONLY ?? "";
const THEME = process.env.THEME ?? "light";

const SHOTS = [
  ["1-plant", "/hvac", null],
  ["2-device-chiller", "/hvac?device=CH-2", null],
  ["3-device-ahu", "/hvac?device=AHU-3", null],
  ["4-power", "/hvac/power", null],
  ["5-meter", "/hvac/power?meter=PM-CH-1", null],
  ["6-trend", "/hvac/trend?points=CH-1.chwOut,CH-2.chwOut,PLANT.ret,CH-1.kw,CH-2.kw,CH-3.running&range=h24&step=5", null],
  [
    "7-report",
    "/hvac/report",
    `(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const sums = [...document.querySelectorAll('form details summary')];
      sums[0].click(); await sleep(200);
      const boxes = [...document.querySelectorAll('form details')[0].querySelectorAll('button[role=checkbox]')];
      boxes[1].click(); await sleep(50); boxes[4].click(); await sleep(50);
      sums[sums.length - 1].click(); await sleep(200);
      document.querySelectorAll('form details')[sums.length - 1].querySelector('button[role=checkbox]').click(); await sleep(100);
      document.querySelector('form button[type=submit]').click(); await sleep(1200);
      return true;
    })()`,
  ],
  ["8-alarms", "/hvac/alarms", null],
  ["9-alarm-logs", "/hvac/alarms/logs", null],
];

export default async function (page) {
  const { mkdirSync } = await import("node:fs");
  mkdirSync(OUT, { recursive: true });
  await page.goto(BASE + "/hvac", 800);
  await page.eval(`document.cookie = "pdm-locale=${LOCALE}; path=/"; localStorage.setItem("theme", "system"); true`);
  await page.media([{ name: "prefers-color-scheme", value: THEME }]);
  for (const [w, h] of [
    [1920, 1080],
    [1366, 768],
  ]) {
    await page.viewport(w, h);
    for (const [name, path, script] of SHOTS) {
      if (ONLY && !name.includes(ONLY)) continue;
      await page.goto(BASE + path, 3500);
      if (script) await page.eval(script);
      await page.shot(`${OUT}/${name}-${w}-${THEME}-${LOCALE}.png`, false);
      console.log(name, w, THEME, LOCALE);
    }
  }
}
