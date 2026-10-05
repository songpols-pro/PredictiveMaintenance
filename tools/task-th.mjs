// Screens in Thai (cookie pdm-locale=th), light theme, 1440 and 1024.
const OUT = "E:/POP/CLAUDE/Monitor/screenshots/th";
const SCREENS = [["1-overview", "/app"], ["2-assets", "/app/assets"], ["3-asset-detail", "/app/assets/RYG-PMP-303"], ["4-alerts", "/app/alerts"], ["5-work-orders", "/app/work-orders"], ["6-settings", "/app/settings"]];
export default async function (page) {
  await page.media([{ name: "prefers-color-scheme", value: "light" }]);
  await page.viewport(1440, 900);
  await page.goto("http://localhost:3000/", 1500);
  await page.eval(`document.cookie = "pdm-locale=th; path=/; max-age=31536000"; true`);
  for (const [w, h] of [[1440, 900], [1024, 768]]) {
    await page.viewport(w, h);
    for (const [name, path] of SCREENS) {
      await page.goto("http://localhost:3000" + path, 3500);
      if (w === 1440) {
        const info = await page.eval(`({ lang: document.documentElement.lang, title: document.title, h1: document.querySelector('h1')?.innerText })`);
        console.log(name, JSON.stringify(info));
      }
      await page.shot(`${OUT}/${name}-${w}.png`, true);
    }
  }
}
