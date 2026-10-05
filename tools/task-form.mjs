// Demo-request form: error summary focus, field errors, successful submit, focus on success.
export default async function (page) {
  await page.viewport(1440, 900);
  await page.goto("http://localhost:3000/", 1000);
  await page.eval(`document.cookie = "pdm-locale=th; path=/"; true`);
  await page.goto("http://localhost:3000/", 3500);
  const r = await page.eval(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const form = document.querySelector('#demo form');
    form.querySelector('button[type=submit]').click(); await sleep(300);
    const afterEmpty = { focus: document.activeElement.getAttribute('role'), summary: document.activeElement.querySelector('p')?.textContent, invalid: form.querySelectorAll('[aria-invalid=true]').length };
    const set = (el, v) => { const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    const inputs = form.querySelectorAll('input:not([type=checkbox]):not([aria-hidden])');
    set(form.querySelector('input[autocomplete=name]'), 'สมศรี ใจดี');
    set(form.querySelector('input[autocomplete=organization]'), 'โรงงานตัวอย่าง');
    set(form.querySelector('input[autocomplete=email]'), 'somsri@example.com');
    set(form.querySelector('input[autocomplete=tel]'), '081 234 5678');
    // Radix select: open and choose the first option
    const trigger = form.querySelector('button[role=combobox]');
    trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' })); await sleep(400);
    document.querySelector('[role=option]')?.click(); await sleep(300);
    form.querySelector('button[role=checkbox]').click(); await sleep(100);
    form.querySelector('button[type=submit]').click(); await sleep(1500);
    return { afterEmpty, successFocus: document.activeElement.tagName + ': ' + document.activeElement.textContent };
  })()`);
  console.log(JSON.stringify(r, null, 1));
}
