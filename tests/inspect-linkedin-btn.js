import { chromium } from 'playwright';

async function testLinkedInApply() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  const url = 'https://in.linkedin.com/jobs/view/senior-net-developer-at-dtc-infotech-pvt-ltd-4355381819/';
  console.log('Navigating to', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
  await page.waitForTimeout(3000);

  console.log('Page URL:', page.url());
  console.log('Page Title:', await page.title());

  // Search for apply buttons
  const buttons = await page.$$eval('button, a', els => {
    return els
      .filter(el => (el.innerText || '').toLowerCase().includes('apply'))
      .map(el => ({
        tag: el.tagName,
        text: (el.innerText || '').trim(),
        href: el.getAttribute('href'),
        className: el.className,
        id: el.id
      }));
  });

  console.log('Found buttons containing "apply":', JSON.stringify(buttons, null, 2));

  await browser.close();
}

testLinkedInApply().catch(console.error);
