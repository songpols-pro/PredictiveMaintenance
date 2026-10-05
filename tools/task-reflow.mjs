// Quick 320px reflow check in both languages.
const PAGES = ["/", "/app", "/app/assets", "/app/assets/RYG-PMP-303", "/app/alerts", "/app/work-orders", "/app/settings"];
export default async function (page) {
  for (const locale of ["en", "th"]) {
    await page.viewport(320, 640);
    await page.goto("http://localhost:3000/", 1200);
    await page.eval(`document.cookie = "pdm-locale=${locale}; path=/"; true`);
    for (const p of PAGES) {
      await page.goto("http://localhost:3000" + p, 2500);
      const r = await page.eval(`({ sw: document.documentElement.scrollWidth, vw: innerWidth })`);
      console.log(locale, p.padEnd(22), r.sw > r.vw + 1 ? "SCROLLS SIDEWAYS " + r.sw : "ok");
    }
  }
}
