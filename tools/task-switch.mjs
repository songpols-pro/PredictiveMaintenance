// Switch language from the top-bar menu without a reload; data and chrome must both follow.
export default async function (page) {
  await page.viewport(1440, 900);
  await page.goto("http://localhost:3000/", 1000);
  await page.eval(`document.cookie = "pdm-locale=en; path=/"; true`);
  await page.goto("http://localhost:3000/assets/RYG-PMP-303", 3000);
  const before = await page.eval(`({ lang: document.documentElement.lang, h1: document.querySelector('h1').innerText, mode: document.querySelector('#sum-mode')?.parentElement?.querySelector('p')?.innerText })`);
  const r = await page.eval(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const trigger = document.querySelector('button[aria-label^="Language"]');
    trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }));
    await sleep(400);
    const item = [...document.querySelectorAll('[role="menuitemradio"]')].find(i => i.getAttribute('lang') === 'th');
    const itemLang = item?.getAttribute('lang');
    item.click();
    await sleep(2500);
    return { itemLang, lang: document.documentElement.lang, h1: document.querySelector('h1').innerText, mode: document.querySelector('#sum-mode')?.parentElement?.querySelector('p')?.innerText, nav: document.querySelector('nav a[aria-current="page"]')?.innerText, cookie: document.cookie, title: document.title };
  })()`);
  console.log("before:", JSON.stringify(before));
  console.log("after: ", JSON.stringify(r));
}
