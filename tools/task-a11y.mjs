// Manual-walk stand-ins: keyboard order, focus visibility, focus return, reflow, zoom, reduced motion.
const BASE = "http://localhost:3000";
const PAGES = ["/", "/app", "/app/assets", "/app/assets/RYG-PMP-303", "/app/alerts", "/app/work-orders", "/app/settings"];

const focusInfo = `(() => {
  const el = document.activeElement;
  const cs = getComputedStyle(el);
  const name = (el.getAttribute('aria-label') || el.innerText || el.value || el.id || el.tagName).trim().replace(/\\s+/g, ' ').slice(0, 50);
  return { tag: el.tagName, name, outline: cs.outlineStyle + ' ' + cs.outlineWidth };
})()`;

export default async function (page) {
  await page.media([{ name: "prefers-color-scheme", value: "light" }]);
  const locale = process.env.LOCALE ?? "en";
  await page.goto(BASE + "/", 1500);
  await page.eval(`document.cookie = "pdm-locale=${locale}; path=/; max-age=31536000"; true`);
  console.log("locale:", locale);

  // 1. Keyboard order + focus visibility on the overview
  await page.viewport(1440, 900);
  await page.goto(BASE + "/app", 3000);
  const order = [];
  for (let i = 0; i < 16; i++) {
    await page.tab();
    order.push(await page.eval(focusInfo));
  }
  console.log("TAB ORDER (overview):");
  order.forEach((f, i) => console.log(`  ${String(i + 1).padStart(2)} ${f.tag.padEnd(6)} ${f.outline.padEnd(12)} ${f.name}`));

  // Skip link moves focus to main
  await page.goto(BASE + "/app", 2500);
  await page.tab();
  await page.key("Enter", "Enter", 13);
  await page.sleep(300);
  console.log("SKIP LINK ->", await page.eval(`document.activeElement.id || document.activeElement.tagName`));

  // 2. Focus moves into the dialog, Esc returns it to the opener, creating returns it to the asset link
  await page.goto(BASE + "/app", 3000);
  const open1 = await page.eval(`(async () => {
    const trigger = document.querySelector('article[aria-labelledby="att-RYG-MTR-204"] button');
    trigger.setAttribute('data-test-opener', '1');
    trigger.focus(); trigger.click(); await new Promise(r => setTimeout(r, 600));
    return document.querySelector('[role="dialog"]').contains(document.activeElement);
  })()`);
  await page.key("Escape", "Escape", 27);
  await page.sleep(700);
  const afterEsc = await page.eval(`document.activeElement.hasAttribute('data-test-opener')`);
  const created = await page.eval(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    document.querySelector('[data-test-opener]').click(); await sleep(600);
    document.querySelector('[role="dialog"] button[type="submit"]').click(); await sleep(2000);
    return { dialogClosed: !document.querySelector('[role="dialog"]'), focus: document.activeElement.id };
  })()`);
  console.log("DIALOG FOCUS:", JSON.stringify({ focusMovedIntoDialog: open1, escReturnsFocusToOpener: afterEsc, ...created }));

  // 3. Alerts list arrow-key navigation
  await page.goto(BASE + "/app/alerts", 3000);
  const arrows = await page.eval(`(() => {
    const first = document.querySelector('button[data-alert]');
    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    const second = document.activeElement;
    return { movedDown: second !== first && second.hasAttribute('data-alert') };
  })()`);
  console.log("ALERT LIST ARROWS:", JSON.stringify(arrows));

  // 4. Reflow at 320 px and 5. 200% zoom (720 px CSS width at 2x)
  for (const [label, w, h, scale] of [["320px", 320, 640, 1], ["200% zoom", 720, 450, 2]]) {
    await page.viewport(w, h, scale);
    for (const p of PAGES) {
      await page.goto(BASE + p, 2500);
      const r = await page.eval(`(() => {
        const sw = document.documentElement.scrollWidth, vw = window.innerWidth;
        // Find widest offenders outside of intentional scroll containers.
        const offenders = [...document.querySelectorAll('main *')].filter(el => {
          const rect = el.getBoundingClientRect();
          if (rect.right <= vw + 1) return false;
          let p = el.parentElement;
          while (p) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') return false; p = p.parentElement; }
          return true;
        }).slice(0, 3).map(el => el.tagName + '.' + (el.className.baseVal ?? el.className).toString().split(' ').slice(0, 3).join('.'));
        return { pageScrollsSideways: sw > vw + 1, sw, vw, offenders };
      })()`);
      console.log(`${label.padEnd(10)} ${p.padEnd(22)} ${JSON.stringify(r)}`);
    }
  }

  // 6. Reduced motion
  await page.viewport(1440, 900);
  await page.media([{ name: "prefers-reduced-motion", value: "reduce" }, { name: "prefers-color-scheme", value: "light" }]);
  await page.goto(BASE + "/app", 200);
  const rm = await page.eval(`(() => { const s = document.querySelector('.animate-pulse'); return s ? getComputedStyle(s).animationDuration : 'no skeleton on screen'; })()`);
  console.log("REDUCED MOTION skeleton animation-duration:", rm);
}
