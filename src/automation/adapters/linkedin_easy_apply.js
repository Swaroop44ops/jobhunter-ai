import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { humanType } from '../browser.js';
import { answerQuestion } from '../../ai/advisor.js';
import { applyGenericExternal } from './generic_external.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function applyLinkedInEasyApply(page, job, profile, options = {}) {
  const isCopilot = options.mode !== 'auto';
  const personal = profile.personal || {};
  const logs = [];

  const log = (msg) => {
    logs.push(`[LinkedIn] ${msg}`);
    console.log(`[LinkedIn] ${msg}`);
  };

  log(`Navigating to ${job.url}`);
  try {
    await page.goto(job.url, { waitUntil: 'load', timeout: 35000 });
  } catch (navErr) {
    log(`Initial navigation load warning: ${navErr.message}. Waiting for DOM...`);
    await page.waitForLoadState('domcontentloaded').catch(() => {});
  }

  // Allow client-side hydration and redirects to settle
  await page.waitForTimeout(2500);
  await page.waitForLoadState('networkidle').catch(() => {});

  // 1. Safe Login Check using Context Cookies (doesn't crash on redirects)
  const currentUrl = page.url();
  const cookies = await page.context().cookies();
  const isLoggedIn = cookies.some(c => c.name === 'li_at' && c.value);
  const isAuthWall = currentUrl.includes('/login') || currentUrl.includes('/checkpoint/') || currentUrl.includes('/authwall');

  if (!isLoggedIn || isAuthWall) {
    log('USER ACTION REQUIRED: Please sign in to LinkedIn in the browser window.');
    if (isCopilot) {
      log('Browser window is visible. Waiting up to 60 seconds for you to sign in...');
      // Wait for login cookie
      await page.waitForFunction(
        () => document.cookie.includes('li_at'),
        { timeout: 60000 }
      ).catch(() => {});
      await page.waitForTimeout(2000);
    } else {
      throw new Error('Not logged into LinkedIn. Please launch once in Copilot mode to save your session.');
    }
  }

  // Re-verify URL after possible login redirect
  const activeUrl = page.url();
  if (activeUrl.includes('/login') || activeUrl.includes('/checkpoint/')) {
    log('Waiting for authentication completion...');
    await page.waitForTimeout(3000);
  }

  // 2. Look for Easy Apply button
  const easyApplySelectors = [
    'button.jobs-apply-button:has-text("Easy Apply")',
    'button:has-text("Easy Apply")',
    '.jobs-s-apply button:has-text("Easy Apply")',
    '[data-control-name="jobdetails_topcard_inapply"]'
  ];

  let easyApplyBtn = null;
  for (const sel of easyApplySelectors) {
    try {
      easyApplyBtn = await page.waitForSelector(sel, { timeout: 3000, state: 'visible' });
      if (easyApplyBtn) break;
    } catch (e) {
      // Continue to next selector
    }
  }

  // Check if it's an external "Apply" button (e.g. company careers website)
  if (!easyApplyBtn) {
    const externalSelectors = [
      'button.jobs-apply-button',
      'a.jobs-apply-button',
      'button.top-card-layout__cta',
      'a.top-card-layout__cta',
      'button:has-text("Apply")',
      'a:has-text("Apply")',
      '[data-control-name="jobdetails_topcard_apply"]',
      '.jobs-s-apply button',
      '.jobs-s-apply a'
    ];

    let externalApplyBtn = null;
    for (const sel of externalSelectors) {
      try {
        const el = await page.$(sel);
        if (el && await el.isVisible().catch(() => false)) {
          externalApplyBtn = el;
          break;
        }
      } catch (e) {}
    }

    if (externalApplyBtn) {
      const btnText = (await externalApplyBtn.innerText().catch(() => 'Apply')).trim();
      log(`Detected external company application: "${btnText}". Redirecting to company careers portal...`);

      let targetPage = page;
      try {
        const [popup] = await Promise.all([
          page.context().waitForEvent('page', { timeout: 8000 }).catch(() => null),
          externalApplyBtn.click().catch(() => {})
        ]);

        await page.waitForTimeout(2000);

        // Check if LinkedIn opened an intermediary "You are applying on company site" modal
        const continueBtn = await page.$(
          'button:has-text("Continue"), button:has-text("Apply on company site"), [data-control-name="continue_unify"]'
        ).catch(() => null);

        if (continueBtn && await continueBtn.isVisible().catch(() => false)) {
          log('Confirming LinkedIn external application redirect...');
          const [modalPopup] = await Promise.all([
            page.context().waitForEvent('page', { timeout: 8000 }).catch(() => null),
            continueBtn.click().catch(() => {})
          ]);
          if (modalPopup) targetPage = modalPopup;
        } else if (popup) {
          targetPage = popup;
        } else {
          const pages = page.context().pages();
          if (pages.length > 1) {
            targetPage = pages[pages.length - 1];
          }
        }
      } catch (err) {
        log(`Notice during external navigation: ${err.message}`);
      }

      await targetPage.bringToFront();
      log(`Switched to external careers page: ${targetPage.url()}`);

      // Run external form filler
      const extResult = await applyGenericExternal(targetPage, job, profile, options);
      return {
        ...extResult,
        logs: [...logs, ...(extResult.logs || [])]
      };
    }

    log('No Apply or Easy Apply button detected on this posting (may be closed or requires manual login).');
    return {
      success: false,
      mode: isCopilot ? 'copilot' : 'auto',
      message: 'No Apply or Easy Apply button found. Job may require manual sign-in or is no longer accepting applicants.',
      logs
    };
  }

  log('Found Easy Apply button. Clicking to open application modal...');
  await easyApplyBtn.click();
  await page.waitForTimeout(2000);

  // 3. Multi-Step Modal Navigator
  let maxSteps = 10;
  let currentStep = 0;

  while (currentStep < maxSteps) {
    currentStep++;
    log(`Processing modal step ${currentStep}...`);
    await page.waitForTimeout(1000);

    // Fill common contact fields
    const phoneInput = await page.$('input[id*="phoneNumber"], input[name*="phoneNumber"]').catch(() => null);
    if (phoneInput) {
      const val = await phoneInput.inputValue().catch(() => '');
      if (!val && personal.phone) {
        await phoneInput.fill(personal.phone).catch(() => {});
        log('Filled phone number');
      }
    }

    // Fill email if empty
    const emailInput = await page.$('input[id*="email"], input[name*="email"]').catch(() => null);
    if (emailInput) {
      const val = await emailInput.inputValue().catch(() => '');
      if (!val && personal.email) {
        await emailInput.fill(personal.email).catch(() => {});
        log('Filled email address');
      }
    }

    // Custom questions on current modal view
    const formQuestions = await page.$$('.jobs-easy-apply-form-section__grouping, .fb-dash-form-element').catch(() => []);
    for (const q of formQuestions) {
      try {
        const label = await q.$('label');
        if (!label) continue;
        const labelText = (await label.innerText()).trim();

        // Check text / numerical input
        const textInput = await q.$('input[type="text"], input[type="number"], textarea');
        if (textInput) {
          const val = await textInput.inputValue();
          if (!val) {
            const ans = await answerQuestion(labelText, { jobTitle: job.title, company: job.company }, profile);
            await textInput.fill(ans);
            log(`Answered "${labelText.slice(0, 25)}...": ${ans}`);
          }
        }

        // Radio button options
        const radioGroups = await q.$$('input[type="radio"]');
        if (radioGroups.length > 0) {
          const checked = await q.$('input[type="radio"]:checked');
          if (!checked) {
            const yesRadio = await q.$('input[value="Yes"], input[value="true"], label:has-text("Yes")');
            if (yesRadio) {
              await yesRadio.click();
              log(`Selected "Yes" for "${labelText.slice(0, 25)}..."`);
            } else {
              await radioGroups[0].click();
            }
          }
        }
      } catch (qErr) {
        // Continue to next question
      }
    }

    // Check for Next, Review, or Submit buttons
    const submitBtn = await page.$(
      'button[aria-label="Submit application"], button:has-text("Submit application")'
    ).catch(() => null);

    const reviewBtn = await page.$(
      'button[aria-label="Review your application"], button:has-text("Review")'
    ).catch(() => null);

    const nextBtn = await page.$(
      'button[aria-label="Continue to next step"], button:has-text("Next")'
    ).catch(() => null);

    if (submitBtn) {
      log('Reached Final Application Submission Step!');
      if (isCopilot) {
        log('COPILOT MODE: Application fully filled and paused at Review screen for your confirmation.');
        return {
          success: true,
          mode: 'copilot',
          message: 'All questions filled. Review screen reached. Click Submit in the browser window!',
          logs
        };
      } else {
        log('AUTO MODE: Submitting application...');
        await submitBtn.click();
        await page.waitForTimeout(3000);
        return {
          success: true,
          mode: 'auto',
          message: 'Application submitted via LinkedIn Easy Apply!',
          logs
        };
      }
    }

    if (reviewBtn) {
      log('Clicking "Review" button...');
      await reviewBtn.click();
      await page.waitForTimeout(1500);
      continue;
    }

    if (nextBtn) {
      log('Clicking "Next" button...');
      await nextBtn.click();
      await page.waitForTimeout(1500);
      continue;
    }

    break;
  }

  return {
    success: true,
    mode: isCopilot ? 'copilot' : 'auto',
    message: 'Finished steps on LinkedIn form.',
    logs
  };
}
