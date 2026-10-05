// Captures the product screenshots used in the marketing "See the product" section.
import { writeFileSync } from "node:fs";
const OUT = "E:/POP/CLAUDE/Monitor/pdm-app/public/marketing";
const SHOTS = [["overview", "/app"], ["asset", "/app/assets/RYG-PMP-303"], ["alerts", "/app/alerts"], ["workOrders", "/app/work-orders"]];
export default async function (page) {
  await page.media([{ name: "prefers-color-scheme", value: "light" }]);
  await page.viewport(1440, 900);
  for (const locale of ["en", "th"]) {
    await page.goto("http://localhost:3000/app", 2500);
    await page.eval(`document.cookie = "pdm-locale=${locale}; path=/"; true`);
    for (const [name, path] of SHOTS) {
      await page.goto("http://localhost:3000" + path, 4500);
      // Hide the Next.js dev indicator so it doesn't end up in marketing images.
      await page.eval(`document.querySelectorAll('nextjs-portal').forEach(n => n.remove()); true`);
      await page.sleep(300);
      const { data } = await page.send("Page.captureScreenshot", { format: "webp", quality: 82 });
      writeFileSync(`${OUT}/${locale}/${name}.webp`, Buffer.from(data, "base64"));
      console.log(locale, name, Math.round(Buffer.from(data, "base64").length / 1024) + " KB");
    }
  }
}
