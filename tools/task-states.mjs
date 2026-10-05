// Captures loading / empty / error states for every screen via the "Demo state" menu.
const OUT = "E:/POP/CLAUDE/Monitor/screenshots/states";
const BASE = "http://localhost:3000";
const SCREENS = [
  ["overview", "/"],
  ["assets", "/assets"],
  ["asset-detail", "/assets/RYG-PMP-303"],
  ["alerts", "/alerts"],
  ["work-orders", "/work-orders"],
  ["settings", "/settings"],
];

export default async function (page) {
  const { mkdirSync } = await import("node:fs");
  mkdirSync(OUT, { recursive: true });
  await page.viewport(1440, 900);
  await page.media([{ name: "prefers-color-scheme", value: "light" }]);
  for (const mode of ["loading", "empty", "error"]) {
    for (const [name, path] of SCREENS) {
      await page.goto(BASE + path, 1500);
      // Switch the simulation through the module the app uses (same as the top-bar menu).
      await page.eval(`(async () => {
        const trigger = document.querySelector('button[aria-label^="Demo state"]');
        trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }));
        await new Promise(r => setTimeout(r, 300));
        const item = [...document.querySelectorAll('[role="menuitemradio"]')].find(i => i.innerText.toLowerCase().startsWith('${mode}'));
        item.click();
        await new Promise(r => setTimeout(r, 1500));
        return true;
      })()`);
      await page.shot(`${OUT}/${name}-${mode}.png`, false);
      const summary = await page.eval(`document.querySelector('main').innerText.slice(0, 160).replace(/\\n+/g, ' | ')`);
      console.log(mode.padEnd(8), name.padEnd(13), summary);
    }
  }
}
