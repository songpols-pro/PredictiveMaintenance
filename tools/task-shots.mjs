const OUT = "E:/POP/CLAUDE/Monitor/screenshots";
const SCREENS = [["1-overview", "/"], ["2-assets", "/assets"], ["3-asset-detail", "/assets/RYG-PMP-303"], ["4-alerts", "/alerts"], ["5-work-orders", "/work-orders"], ["6-settings", "/settings"]];
export default async function (page) {
  for (const [w, h] of [[1440, 900], [1024, 768]]) {
    for (const scheme of ["light", "dark"]) {
      if (w === 1024 && scheme === "dark") continue;
      await page.media([{ name: "prefers-color-scheme", value: scheme }]);
      await page.viewport(w, h);
      for (const [name, path] of SCREENS) {
        await page.goto("http://localhost:3000" + path, 3200);
        await page.shot(`${OUT}/${name}-${w}-${scheme}.png`, true);
      }
    }
  }
  console.log("done");
}
