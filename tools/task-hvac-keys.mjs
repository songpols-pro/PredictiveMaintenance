// Keyboard walk on /hvac: focus a device card link, open its detail with Enter, close with Escape,
// check focus returns to the card; acknowledge an alarm by keyboard.
const BASE = process.env.BASE ?? "http://localhost:3000";
export default async function (page) {
  await page.viewport(1440, 900);
  await page.goto(BASE + "/hvac", 3000);
  const desc = `(() => { const a = document.activeElement; return (a.getAttribute('aria-label') || a.textContent || a.tagName).trim().slice(0, 60); })()`;
  await page.tab(1);
  console.log("1st tab:", await page.eval(desc));
  // Jump to the CHILLER-2 card link and open it.
  await page.eval(`document.querySelector('a[href="/hvac?device=CH-2"]').focus(); true`);
  console.log("focused:", await page.eval(desc));
  await page.key("Enter", "Enter", 13);
  await page.sleep(1200);
  console.log("dialog open:", await page.eval(`!!document.querySelector('[role=dialog]')`), "focus in dialog:", await page.eval(`!!document.activeElement.closest('[role=dialog]')`), "title:", await page.eval(`document.querySelector('[role=dialog] h2')?.textContent`));
  await page.key("Escape", "Escape", 27);
  await page.sleep(800);
  console.log("after Esc → dialog:", await page.eval(`!!document.querySelector('[role=dialog]')`), "focus:", await page.eval(desc), "url:", await page.eval(`location.search || '(none)'`));
  // Alarms: Tab to the first Acknowledge button and press Space.
  await page.goto(BASE + "/hvac/alarms", 3000);
  await page.eval(`[...document.querySelectorAll('main button')].find(b => b.textContent.trim() === 'Acknowledge').focus(); true`);
  console.log("focused:", await page.eval(desc));
  await page.key(" ", "Space", 32);
  await page.sleep(500);
  console.log("acknowledged rows:", await page.eval(`[...document.querySelectorAll('tbody tr')].map(r => r.cells[4].innerText).join(' | ')`), "badge:", await page.eval(`document.querySelector('aside nav a[href="/hvac/alarms"] .sr-only')?.textContent ?? 'none'`), "focus now:", await page.eval(desc));
}
