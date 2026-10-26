import { chromium } from 'playwright';
import { applyGenericExternal } from '../src/automation/adapters/generic_external.js';
import { loadProfile } from '../src/matcher/matcher.js';

async function runExternalApplyTest() {
  console.log('Testing Generic External Apply Adapter with careerspage.io...');

  const profile = loadProfile();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const job = {
    id: 'test-dtc-external',
    title: 'Senior .NET Developer',
    company: 'DTC Infotech Pvt. Ltd.',
    url: 'https://careerspage.io/dtc-infotech-pvt-ltd/senior-net-developer-dt101?src=37',
    platform: 'External'
  };

  await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  const result = await applyGenericExternal(page, job, profile, { mode: 'auto' });
  console.log('Result:', JSON.stringify({
    success: result.success,
    keepOpen: result.keepOpen,
    requiresUserAction: result.requiresUserAction,
    message: result.message
  }, null, 2));

  console.log('Logs captured:');
  result.logs.forEach(l => console.log('  ', l));

  // Verify form inputs were populated
  const firstNameVal = await page.$eval('#application_first_name', el => el.value).catch(() => '');
  const lastNameVal = await page.$eval('#application_last_name', el => el.value).catch(() => '');
  const emailVal = await page.$eval('#application_email', el => el.value).catch(() => '');
  const phoneVal = await page.$eval('#application_mobile_number', el => el.value).catch(() => '');

  console.log('Populated values:');
  console.log('  First Name:', firstNameVal);
  console.log('  Last Name:', lastNameVal);
  console.log('  Email:', emailVal);
  console.log('  Phone:', phoneVal);

  if (!firstNameVal || !emailVal) {
    throw new Error('Form fields were not populated properly!');
  }

  if (!result.success || !result.keepOpen) {
    throw new Error('Adapter did not return success with keepOpen!');
  }

  console.log(' External Apply Test Passed with 100% success!');
  await browser.close();
}

runExternalApplyTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
