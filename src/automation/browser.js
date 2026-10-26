import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USER_DATA_DIR = path.resolve(__dirname, '../../data/browser_profile');
if (!fs.existsSync(USER_DATA_DIR)) {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
}

export async function launchBrowser(options = {}) {
  const isCloud = process.env.HEADLESS === 'true' || process.env.RENDER === 'true' || (process.platform === 'linux' && !process.env.DISPLAY);
  const headless = options.headless ?? isCloud;

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless,
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--start-maximized'
    ],
    slowMo: 50 // Adds small natural delay
  });

  return context;
}

export async function humanType(page, selector, text) {
  if (!text) return;
  const element = await page.waitForSelector(selector, { timeout: 5000 }).catch(() => null);
  if (!element) return false;

  await element.click();
  // Clear existing input
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');

  for (const char of text) {
    await page.keyboard.type(char, { delay: Math.floor(Math.random() * 30) + 10 });
  }
  return true;
}

export async function captureScreenshot(page, filename) {
  const screenshotDir = path.resolve(__dirname, '../../data/screenshots');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }
  const filePath = path.join(screenshotDir, filename);
  await page.screenshot({ path: filePath, fullPage: true }).catch(() => {});
  return filePath;
}
