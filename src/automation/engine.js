import { launchBrowser, captureScreenshot } from './browser.js';
import { applyGreenhouse } from './adapters/greenhouse.js';
import { applyLever } from './adapters/lever.js';
import { applyLinkedInEasyApply } from './adapters/linkedin_easy_apply.js';
import { JobRepository } from '../db/database.js';
import { loadProfile } from '../matcher/matcher.js';

export async function processJobApplication(job, options = {}) {
  const profile = loadProfile();
  const mode = options.mode || 'copilot'; // 'copilot' or 'auto'
  const isHeaded = options.headless !== true;

  JobRepository.updateJobStatus(job.id, 'APPLYING');
  JobRepository.log(job.id, 'INFO', `Starting application process for ${job.title} at ${job.company} (${mode} mode)`);

  let context = null;
  let page = null;

  try {
    context = await launchBrowser({ headless: !isHeaded });
    page = await context.newPage();

    let result;
    const url = job.url.toLowerCase();

    if (url.includes('greenhouse.io') || url.includes('grnh.se') || job.platform === 'Greenhouse') {
      result = await applyGreenhouse(page, job, profile, { mode });
    } else if (url.includes('lever.co') || job.platform === 'Lever') {
      result = await applyLever(page, job, profile, { mode });
    } else if (url.includes('linkedin.com') || job.platform === 'LinkedIn') {
      result = await applyLinkedInEasyApply(page, job, profile, { mode });
    } else {
      // General attempt with Greenhouse or Lever if redirected
      logFallback: {
        JobRepository.log(job.id, 'INFO', `Navigating to generic job posting: ${job.url}`);
        await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        const currentUrl = page.url();
        if (currentUrl.includes('greenhouse.io')) {
          result = await applyGreenhouse(page, { ...job, url: currentUrl }, profile, { mode });
          break logFallback;
        } else if (currentUrl.includes('lever.co')) {
          result = await applyLever(page, { ...job, url: currentUrl }, profile, { mode });
          break logFallback;
        }
        result = {
          success: true,
          mode,
          message: 'Page opened. Application form opened for manual completion.',
          logs: ['Generic job site opened.']
        };
      }
    }

    // Capture screenshot of result
    const screenshotName = `app_${job.id}_${Date.now()}.png`;
    const screenshotPath = await captureScreenshot(page, screenshotName);

    if (result && result.success) {
      const finalStatus = (mode === 'auto' && !result.keepOpen) ? 'APPLIED' : 'QUEUED';
      JobRepository.updateJobStatus(job.id, finalStatus);
      JobRepository.log(job.id, 'INFO', `Application finished: ${result.message}`);
      return {
        success: true,
        status: finalStatus,
        message: result.message,
        screenshot: screenshotPath,
        logs: result.logs
      };
    } else {
      JobRepository.updateJobStatus(job.id, 'FAILED', result?.message || 'Application incomplete');
      return {
        success: false,
        status: 'FAILED',
        message: result?.message || 'Could not complete application automatically.',
        logs: result?.logs
      };
    }
  } catch (err) {
    console.error(`Error processing job ${job.id}:`, err);
    JobRepository.updateJobStatus(job.id, 'FAILED', err.message);
    JobRepository.log(job.id, 'ERROR', `Failure during application: ${err.message}`);

    if (page) {
      await captureScreenshot(page, `error_${job.id}_${Date.now()}.png`).catch(() => {});
    }

    return {
      success: false,
      status: 'FAILED',
      error: err.message
    };
  } finally {
    const shouldKeepOpen = options.keepOpen === true || result?.keepOpen === true;
    if (context && !shouldKeepOpen && mode === 'auto') {
      await context.close().catch(() => {});
    }
  }
}
