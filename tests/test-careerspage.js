import { chromium } from 'playwright';

async function testCareersPage() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const url = 'https://careerspage.io/dtc-infotech-pvt-ltd/senior-net-developer-dt101?src=37';
  console.log('Navigating to', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  console.log('Title:', await page.title());

  // Look for apply button
  const applyBtn = await page.$('button:has-text("APPLY"), a:has-text("APPLY"), button:has-text("Apply")');
  console.log('Apply button found on landing page:', !!applyBtn);
  if (applyBtn) {
    console.log('Button text:', await applyBtn.innerText());
    await applyBtn.click();
    await page.waitForTimeout(2000);
    console.log('New URL after click:', page.url());
  }

  // Check form inputs on apply page
  const fileInput = await page.$('input[type="file"]');
  console.log('File input found:', !!fileInput);
  if (fileInput) {
    console.log('File input accept:', await fileInput.getAttribute('accept'));
    console.log('File input name:', await fileInput.getAttribute('name'));
  }

  const inputs = await page.$$eval('input', els => els.map(el => ({
    name: el.name,
    id: el.id,
    type: el.type,
    placeholder: el.placeholder
  })));
  console.log('Inputs found:', JSON.stringify(inputs, null, 2));

  // Check for captcha
  const recaptcha = await page.$('iframe[src*="recaptcha"], .g-recaptcha');
  console.log('reCAPTCHA found:', !!recaptcha);

  await browser.close();
}

testCareersPage().catch(console.error);
