// Demo-request form when sending fails: retry message, focus, kept values, axe on that state.
// Make Firestore unreachable first: run a production build with no Firebase settings
// (fails at once), or point FIRESTORE_EMULATOR_HOST at a stopped emulator (fails after the 15 s timeout).
import { readFileSync } from "node:fs";

const AXE = readFileSync(new URL("../pdm-app/node_modules/axe-core/axe.min.js", import.meta.url), "utf8");
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const OUT = "E:/POP/CLAUDE/Monitor/screenshots/website";
const BASE = process.env.BASE ?? "http://localhost:3000";

export default async function (page) {
  await page.viewport(1440, 900);
  for (const locale of ["en", "th"]) {
    await page.goto(BASE + "/", 800);
    await page.eval(`document.cookie = "pdm-locale=${locale}; path=/"; true`);
    await page.goto(BASE + "/", 3500);
    const r = await page.eval(`(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const form = document.querySelector('#demo form');
      const set = (el, v) => { const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
      set(form.querySelector('input[autocomplete=name]'), 'Somsri Jaidee');
      set(form.querySelector('input[autocomplete=organization]'), 'Example Plant');
      set(form.querySelector('input[autocomplete=email]'), 'somsri@example.com');
      set(form.querySelector('input[autocomplete=tel]'), '081 234 5678');
      const trigger = form.querySelector('button[role=combobox]');
      trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' })); await sleep(400);
      document.querySelector('[role=option]')?.click(); await sleep(300);
      form.querySelector('button[role=checkbox]').click(); await sleep(100);
      const t0 = performance.now();
      form.querySelector('button[type=submit]').click();
      while (!form.querySelector('[role=alert]') && !document.querySelector('#demo h3[tabindex]') && performance.now() - t0 < 25000) await sleep(250);
      await sleep(300);
      return {
        seconds: Math.round((performance.now() - t0) / 100) / 10,
        alert: form.querySelector('[role=alert]')?.innerText.replace(/\\s+/g, ' '),
        focus: document.activeElement.getAttribute('role'),
        keptName: form.querySelector('input[autocomplete=name]').value,
        honeypotHidden: form.querySelector('input[name=website]').closest('[aria-hidden=true]') !== null,
      };
    })()`);
    console.log(locale, JSON.stringify(r));
    await page.eval(AXE + "; true");
    const axe = await page.eval(`(async () => {
      const r = await axe.run(document, { runOnly: { type: 'tag', values: ${JSON.stringify(TAGS)} } });
      return { rules: r.passes.length + r.violations.length + r.incomplete.length + r.inapplicable.length, violations: r.violations.map(v => v.impact + ' ' + v.id + ' x' + v.nodes.length + ' :: ' + v.nodes[0].target.join(' ')) };
    })()`);
    console.log(locale, "axe", JSON.stringify(axe));
    await page.eval(`document.querySelector('#demo').scrollIntoView(); true`);
    await page.sleep(300);
    await page.shot(`${OUT}/form-send-error-${locale}.png`, false);
  }
}
