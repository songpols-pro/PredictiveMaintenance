const OUT = "E:/POP/CLAUDE/Monitor/screenshots/website";
export default async function (page) {
  await page.media([{ name: "prefers-color-scheme", value: "light" }]);
  for (const locale of ["th", "en"]) {
    await page.viewport(1440, 900);
    await page.goto("http://localhost:3000/", 1500);
    await page.eval(`document.cookie = "pdm-locale=${locale}; path=/"; true`);
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      await page.viewport(w, h);
      await page.goto("http://localhost:3000/", 4000);
      await page.eval(`document.querySelectorAll('nextjs-portal').forEach(n => n.remove()); true`);
      const info = await page.eval(`({ lang: document.documentElement.lang, title: document.title, h1: document.querySelector('h1')?.innerText, sw: document.documentElement.scrollWidth, vw: innerWidth })`);
      console.log(locale, w, JSON.stringify(info));
      await page.shot(`${OUT}/home-${locale}-${w}.png`, true);
    }
  }
}
