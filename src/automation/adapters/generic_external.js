import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { humanType } from '../browser.js';
import { answerQuestion, generateCoverLetter } from '../../ai/advisor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Universal Adaptive Form Filler for any external application portal:
 * - Multi-step wizard navigation (Step 1 -> Next -> Step 2 -> ... -> Submit)
 * - Automated resume attachment (PDF/DOCX)
 * - Contact, Indian market specifics (Notice period, Current/Expected CTC, Relocation)
 * - Dynamic AI-assisted screening question answering
 * - Dropdown, radio, and checkbox auto-resolution
 * - Intelligent detection of Captcha, OTP, and Login gates with seamless Copilot review handoff
 */
export async function applyGenericExternal(page, job, profile, options = {}) {
  const isCopilot = options.mode !== 'auto';
  const personal = profile.personal || {};
  const prefs = profile.preferences || {};
  const logs = [];

  const log = (msg) => {
    logs.push(`[AdaptiveApply] ${msg}`);
    console.log(`[AdaptiveApply] ${msg}`);
  };

  log(`Analyzing application portal: ${page.url()}`);
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(2000);

  // 1. Landing Gateway: Check if on a job description page requiring click to enter form
  const hasInteractiveForm = await page.$('form, input[type="file"], input[type="email"], #application_first_name').catch(() => null);
  if (!hasInteractiveForm) {
    const entrySelectors = [
      'button:has-text("APPLY")',
      'a:has-text("APPLY")',
      'button:has-text("Apply Now")',
      'a:has-text("Apply Now")',
      'button:has-text("Apply")',
      'a:has-text("Apply")',
      'a[href*="/apply"]',
      'button[id*="apply"]',
      '.apply-btn',
      'button:has-text("Apply Manually")',
      'button:has-text("Quick Apply")'
    ];

    for (const sel of entrySelectors) {
      try {
        const btn = await page.$(sel);
        if (btn && await btn.isVisible().catch(() => false)) {
          log(`Found portal entry button ("${sel}"). Navigating to application form...`);
          await btn.click().catch(() => {});
          await page.waitForLoadState('domcontentloaded').catch(() => {});
          await page.waitForTimeout(2500);
          break;
        }
      } catch (e) {}
    }
  }

  log(`Active application view: ${page.url()}`);

  let resumeAttached = false;
  let maxSteps = 8;
  let currentStep = 0;
  let submitted = false;
  let requiresUserAction = false;
  let userActionReason = '';

  while (currentStep < maxSteps && !submitted) {
    currentStep++;
    log(`--- Step ${currentStep} of Application Flow ---`);
    await page.waitForTimeout(1000);

    // A. Attach Resume if not attached and file input exists
    if (!resumeAttached) {
      const fileInput = await page.$('input[type="file"]').catch(() => null);
      if (fileInput) {
        let resumePath = personal.resumePath ? path.resolve(__dirname, '../../../', personal.resumePath) : null;
        if (!resumePath || !fs.existsSync(resumePath)) {
          resumePath = path.resolve(__dirname, '../../../data/resumes/Swaroop_HG_FullStack.pdf');
        }
        if (!fs.existsSync(resumePath)) {
          resumePath = path.resolve(__dirname, '../../../data/sample_resume.pdf');
        }

        if (fs.existsSync(resumePath)) {
          try {
            await fileInput.setInputFiles(resumePath);
            log(`Attached resume (${path.basename(resumePath)})`);
            resumeAttached = true;
            await page.waitForTimeout(1500);
          } catch (fErr) {
            log(`File attach notice: ${fErr.message}`);
          }
        }
      }
    }

    // B. Auto-fill all visible text / email / phone / number inputs on current step
    await fillVisibleInputs(page, profile, job, log);

    // C. Fill textareas (Cover letter, why join, summary)
    await fillTextareas(page, profile, job, log);

    // D. Resolve Select dropdowns (Notice period, Gender, Experience, Country)
    await resolveSelectDropdowns(page, profile, log);

    // E. Resolve Radio buttons & Terms checkboxes
    await resolveRadiosAndCheckboxes(page, profile, log);

    await page.waitForTimeout(1000);

    // Check for CAPTCHA before submitting
    const captchaDetected = await detectCaptcha(page);
    if (captchaDetected) {
      log('⚠️ CAPTCHA DETECTED: Pausing automated clicks. Current step fields populated & resume attached.');
      requiresUserAction = true;
      userActionReason = 'Please complete the CAPTCHA checkbox ("I\'m not a robot") in the browser window and click Submit.';
      break;
    }

    // Check for Login / Account Creation Password barrier (e.g. Workday)
    const passwordInput = await page.$('input[type="password"]:not([id*="dummy"])').catch(() => null);
    if (passwordInput && await passwordInput.isVisible().catch(() => false)) {
      log('🔐 ACCOUNT SIGN-IN REQUIRED: This portal requires creating or entering account credentials.');
      requiresUserAction = true;
      userActionReason = 'Please sign in or set your password in the browser window to proceed with submission.';
      break;
    }

    // Check for OTP / Verification Code barrier
    const otpInput = await page.$('input[name*="otp" i], input[id*="otp" i], input[placeholder*="otp" i], input[name*="code" i]').catch(() => null);
    if (otpInput && await otpInput.isVisible().catch(() => false)) {
      log('📱 VERIFICATION CODE REQUIRED: Portal sent a verification code to your email/phone.');
      requiresUserAction = true;
      userActionReason = 'Please enter the verification code received on your phone or email.';
      break;
    }

    await page.waitForTimeout(1000);

    // F. Determine next navigation action
    // 1. Check for Final Submit Button
    const submitBtn = await findSubmitButton(page);
    const nextBtn = await findNextStepButton(page);

    if (submitBtn && (!nextBtn || currentStep >= 2)) {
      if (isCopilot) {
        log('COPILOT MODE: All application fields populated up to final review screen.');
        return {
          success: true,
          keepOpen: true,
          mode: 'copilot',
          message: 'Application form filled and ready for your final review in the browser.',
          logs
        };
      } else {
        // Auto mode
        log('AUTO MODE: Clicking final submit button...');
        await submitBtn.click().catch(() => {});
        await page.waitForTimeout(3500);
        submitted = true;
        return {
          success: true,
          keepOpen: false,
          mode: 'auto',
          message: 'Application submitted successfully to careers portal.',
          logs
        };
      }
    } else if (nextBtn) {
      log('Advancing to next step of application wizard...');
      await nextBtn.click().catch(() => {});
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      await page.waitForTimeout(2000);
    } else {
      // No explicit next or submit button, likely single page completed
      log('Reached end of form fields on this page.');
      break;
    }
  }

  await page.bringToFront();

  if (requiresUserAction) {
    return {
      success: true,
      keepOpen: true,
      requiresUserAction: true,
      mode: options.mode,
      message: `Form fields populated & resume attached! ${userActionReason}`,
      logs
    };
  }

  return {
    success: true,
    keepOpen: isCopilot || !submitted,
    mode: options.mode,
    message: isCopilot 
      ? 'Application populated and open for your review.' 
      : 'Application form completed. Please check the open browser window.',
    logs
  };
}

// -------------------------------------------------------------
// Helper: Detect Captchas (reCAPTCHA, hCaptcha, Turnstile, Geetest)
// -------------------------------------------------------------
async function detectCaptcha(page) {
  const captchaSelectors = [
    'iframe[src*="recaptcha"]',
    'iframe[title*="reCAPTCHA"]',
    '.g-recaptcha',
    'iframe[src*="hcaptcha"]',
    'iframe[src*="turnstile"]',
    '#recaptcha',
    '[data-sitekey]'
  ];

  for (const sel of captchaSelectors) {
    const el = await page.$(sel).catch(() => null);
    if (el && await el.isVisible().catch(() => false)) {
      return true;
    }
  }
  return false;
}

// -------------------------------------------------------------
// Helper: Fill Visible Inputs on Current Step
// -------------------------------------------------------------
async function fillVisibleInputs(page, profile, job, log) {
  const personal = profile.personal || {};
  const prefs = profile.preferences || {};
  const answers = profile.answers || {};

  const inputs = await page.$$('input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"]):not([type="password"])').catch(() => []);

  for (const input of inputs) {
    try {
      const isVis = await input.isVisible().catch(() => false);
      if (!isVis) continue;

      const curVal = await input.inputValue().catch(() => '');
      if (curVal && curVal.trim()) continue; // Skip already populated fields

      const name = (await input.getAttribute('name').catch(() => '') || '').toLowerCase();
      const id = (await input.getAttribute('id').catch(() => '') || '').toLowerCase();
      const placeholder = (await input.getAttribute('placeholder').catch(() => '') || '').toLowerCase();
      const labelText = (await getAssociatedLabel(page, input)).toLowerCase();
      const combined = `${name} ${id} ${placeholder} ${labelText}`;

      // First Name
      if (combined.includes('first') && combined.includes('name')) {
        if (personal.firstName) {
          await input.fill(personal.firstName).catch(() => {});
          log(`Filled first name: ${personal.firstName}`);
        }
      }
      // Last Name
      else if (combined.includes('last') && combined.includes('name')) {
        if (personal.lastName) {
          await input.fill(personal.lastName).catch(() => {});
          log(`Filled last name: ${personal.lastName}`);
        }
      }
      // Full Name
      else if (combined.includes('name') && !combined.includes('company') && !combined.includes('file')) {
        const full = personal.fullName || `${personal.firstName || ''} ${personal.lastName || ''}`.trim();
        if (full) {
          await input.fill(full).catch(() => {});
          log(`Filled full name: ${full}`);
        }
      }
      // Email
      else if (combined.includes('email')) {
        if (personal.email) {
          await input.fill(personal.email).catch(() => {});
          log(`Filled email: ${personal.email}`);
        }
      }
      // Phone / Mobile
      else if (combined.includes('phone') || combined.includes('mobile') || combined.includes('tel') || combined.includes('contact number')) {
        if (personal.phone) {
          await input.fill(personal.phone).catch(() => {});
          log(`Filled phone: ${personal.phone}`);
        }
      }
      // City / Location
      else if (combined.includes('city') || combined.includes('current location') || combined.includes('current city')) {
        if (personal.city) {
          await input.fill(personal.city).catch(() => {});
          log(`Filled city: ${personal.city}`);
        }
      }
      // State
      else if (combined.includes('state') || combined.includes('province')) {
        if (personal.state) {
          await input.fill(personal.state).catch(() => {});
        }
      }
      // Postal / Pin Code
      else if (combined.includes('postal') || combined.includes('pin') || combined.includes('zip')) {
        if (personal.postalCode) {
          await input.fill(personal.postalCode).catch(() => {});
        }
      }
      // Current CTC / Salary (Indian market)
      else if (combined.includes('current') && (combined.includes('ctc') || combined.includes('salary') || combined.includes('package'))) {
        const val = answers.currentCTC || String(prefs.currentSalary || '8,00,000');
        await input.fill(val).catch(() => {});
        log(`Filled current CTC: ${val}`);
      }
      // Expected CTC / Salary (Indian market)
      else if ((combined.includes('expected') || combined.includes('target')) && (combined.includes('ctc') || combined.includes('salary') || combined.includes('compensation'))) {
        const val = answers.expectedCTC || String(prefs.minSalary || '12,00,000');
        await input.fill(val).catch(() => {});
        log(`Filled expected CTC: ${val}`);
      }
      // General CTC / Salary
      else if (combined.includes('ctc') || combined.includes('salary') || combined.includes('compensation') || combined.includes('expected pay')) {
        const val = answers.expectedCTC || String(prefs.minSalary || '12,00,000');
        await input.fill(val).catch(() => {});
        log(`Filled compensation: ${val}`);
      }
      // Notice Period
      else if (combined.includes('notice') || combined.includes('availability') || combined.includes('joining')) {
        const val = answers.noticePeriod || `${prefs.noticePeriodWeeks || 4} weeks (30 days)`;
        await input.fill(val).catch(() => {});
        log(`Filled notice period: ${val}`);
      }
      // Total Years of Experience
      else if (combined.includes('experience') || combined.includes('exp in years') || combined.includes('total exp')) {
        const val = String(prefs.yearsOfExperience || 3);
        await input.fill(val).catch(() => {});
        log(`Filled years of experience: ${val}`);
      }
      // Current Company
      else if (combined.includes('company') || combined.includes('employer') || combined.includes('organization')) {
        const val = answers.currentCompany || 'Software Solutions';
        await input.fill(val).catch(() => {});
        log(`Filled company: ${val}`);
      }
      // Current Designation
      else if (combined.includes('designation') || combined.includes('title') || combined.includes('role')) {
        const val = answers.currentRole || '.NET Developer';
        await input.fill(val).catch(() => {});
        log(`Filled designation: ${val}`);
      }
      // LinkedIn
      else if (combined.includes('linkedin')) {
        if (personal.linkedin) {
          await input.fill(personal.linkedin).catch(() => {});
          log('Filled LinkedIn profile URL');
        }
      }
      // GitHub / Portfolio
      else if (combined.includes('github') || combined.includes('portfolio') || combined.includes('website')) {
        if (personal.github || personal.portfolio) {
          await input.fill(personal.github || personal.portfolio).catch(() => {});
          log('Filled portfolio URL');
        }
      }
      // Dynamic screening question fallback
      else if (labelText && labelText.length > 5) {
        const answer = await answerQuestion(labelText, { jobTitle: job.title, company: job.company }, profile);
        if (answer) {
          await input.fill(answer).catch(() => {});
          log(`Answered question "${labelText.slice(0, 35)}...": ${answer}`);
        }
      }
    } catch (e) {}
  }
}

// -------------------------------------------------------------
// Helper: Fill Textareas (Cover letter, summary, custom answers)
// -------------------------------------------------------------
async function fillTextareas(page, profile, job, log) {
  const textareas = await page.$$('textarea').catch(() => []);
  for (const ta of textareas) {
    try {
      const isVis = await ta.isVisible().catch(() => false);
      if (!isVis) continue;

      const curVal = await ta.inputValue().catch(() => '');
      if (curVal && curVal.trim()) continue;

      const labelText = await getAssociatedLabel(page, ta);
      const combined = `${await ta.getAttribute('name').catch(() => '')} ${labelText}`.toLowerCase();

      if (combined.includes('cover') || combined.includes('letter')) {
        const letter = await generateCoverLetter(job, profile);
        await ta.fill(letter).catch(() => {});
        log('Filled tailored cover letter');
      } else {
        const answer = await answerQuestion(labelText || 'Brief background', { jobTitle: job.title, company: job.company }, profile);
        await ta.fill(answer).catch(() => {});
        log(`Filled textarea: ${answer.slice(0, 40)}...`);
      }
    } catch (e) {}
  }
}

// -------------------------------------------------------------
// Helper: Resolve Select Dropdowns
// -------------------------------------------------------------
async function resolveSelectDropdowns(page, profile, log) {
  const selects = await page.$$('select').catch(() => []);
  for (const sel of selects) {
    try {
      const isVis = await sel.isVisible().catch(() => false);
      if (!isVis) continue;

      const labelText = await getAssociatedLabel(page, sel);
      const name = (await sel.getAttribute('name').catch(() => '') || '').toLowerCase();
      const combined = `${name} ${labelText}`.toLowerCase();

      const options = await sel.$$eval('option', opts => opts.map(o => ({ value: o.value, text: o.innerText.trim() })));
      if (options.length <= 1) continue;

      // Notice period
      if (combined.includes('notice') || combined.includes('availability')) {
        const match = options.find(o => o.text.includes('30') || o.text.toLowerCase().includes('1 month') || o.text.toLowerCase().includes('immediate') || o.text.toLowerCase().includes('15'));
        if (match) {
          await sel.selectOption(match.value).catch(() => {});
          log(`Selected notice period: ${match.text}`);
        }
      }
      // Work Authorization
      else if (combined.includes('authorized') || combined.includes('legal') || combined.includes('eligib')) {
        const match = options.find(o => o.text.toLowerCase() === 'yes' || o.text.toLowerCase().startsWith('yes'));
        if (match) await sel.selectOption(match.value).catch(() => {});
      }
      // Visa sponsorship
      else if (combined.includes('sponsorship') || combined.includes('visa')) {
        const match = options.find(o => o.text.toLowerCase() === 'no' || o.text.toLowerCase().startsWith('no'));
        if (match) await sel.selectOption(match.value).catch(() => {});
      }
      // Country
      else if (combined.includes('country')) {
        const match = options.find(o => o.text.toLowerCase().includes('india'));
        if (match) await sel.selectOption(match.value).catch(() => {});
      }
      // Gender
      else if (combined.includes('gender')) {
        const match = options.find(o => o.text.toLowerCase() === 'male' || o.text.toLowerCase().includes('decline'));
        if (match) await sel.selectOption(match.value).catch(() => {});
      }
      // Experience
      else if (combined.includes('experience') || combined.includes('exp')) {
        const match = options.find(o => o.text.includes('3') || o.text.includes('2-4') || o.text.includes('3-5'));
        if (match) await sel.selectOption(match.value).catch(() => {});
      }
    } catch (e) {}
  }
}

// -------------------------------------------------------------
// Helper: Resolve Radios and Checkboxes
// -------------------------------------------------------------
async function resolveRadiosAndCheckboxes(page, profile, log) {
  // Terms and conditions
  const checkboxes = await page.$$('input[type="checkbox"]').catch(() => []);
  for (const cb of checkboxes) {
    try {
      const isVis = await cb.isVisible().catch(() => false);
      if (!isVis) continue;

      const isChecked = await cb.isChecked().catch(() => false);
      if (isChecked) continue;

      const label = (await getAssociatedLabel(page, cb)).toLowerCase();
      if (label.includes('agree') || label.includes('term') || label.includes('consent') || label.includes('privacy') || label.includes('certify')) {
        await cb.check().catch(() => {});
        log('Agreed to application privacy & terms statement');
      }
    } catch (e) {}
  }

  // Radios (Yes / No questions)
  const radios = await page.$$('input[type="radio"]').catch(() => []);
  for (const r of radios) {
    try {
      const isVis = await r.isVisible().catch(() => false);
      if (!isVis) continue;

      const val = (await r.getAttribute('value').catch(() => '') || '').toLowerCase();
      const label = (await getAssociatedLabel(page, r)).toLowerCase();
      const name = (await r.getAttribute('name').catch(() => '') || '').toLowerCase();
      const combined = `${name} ${label} ${val}`.toLowerCase();

      if (combined.includes('authorized') || combined.includes('legal') || combined.includes('relocate') || combined.includes('hybrid') || combined.includes('on-site')) {
        if (val === 'yes' || val === 'true' || val === '1' || label === 'yes') {
          await r.check().catch(() => {});
        }
      } else if (combined.includes('sponsorship') || combined.includes('visa')) {
        if (val === 'no' || val === 'false' || val === '0' || label === 'no') {
          await r.check().catch(() => {});
        }
      }
    } catch (e) {}
  }
}

// -------------------------------------------------------------
// Helper: Get Associated Label
// -------------------------------------------------------------
async function getAssociatedLabel(page, element) {
  return await element.evaluate(el => {
    if (el.id) {
      const lbl = document.querySelector(`label[for="${el.id}"]`);
      if (lbl && lbl.innerText) return lbl.innerText.trim();
    }
    const parentLabel = el.closest('label');
    if (parentLabel && parentLabel.innerText) return parentLabel.innerText.trim();

    const prev = el.previousElementSibling;
    if (prev && (prev.tagName === 'LABEL' || prev.tagName === 'SPAN' || prev.tagName === 'P')) {
      return prev.innerText.trim();
    }

    const parent = el.parentElement;
    if (parent) {
      const pLabel = parent.querySelector('label, .label, [class*="label"]');
      if (pLabel && pLabel.innerText) return pLabel.innerText.trim();
    }

    return el.getAttribute('placeholder') || el.getAttribute('aria-label') || el.getAttribute('name') || '';
  }).catch(() => '');
}

// -------------------------------------------------------------
// Helper: Find Next Step Button
// -------------------------------------------------------------
async function findNextStepButton(page) {
  const nextSelectors = [
    'button:has-text("Next")',
    'button:has-text("Continue")',
    'button:has-text("Save & Continue")',
    'button:has-text("Save and Continue")',
    'button:has-text("Proceed")',
    'a:has-text("Next")',
    'a:has-text("Continue")',
    '[data-testid*="next"]',
    'button[id*="next"]'
  ];

  for (const sel of nextSelectors) {
    const btn = await page.$(sel).catch(() => null);
    if (btn && await btn.isVisible().catch(() => false)) {
      return btn;
    }
  }
  return null;
}

// -------------------------------------------------------------
// Helper: Find Final Submit Button
// -------------------------------------------------------------
async function findSubmitButton(page) {
  const submitSelectors = [
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("Submit Application")',
    'button:has-text("Submit")',
    'button:has-text("APPLY")',
    'button:has-text("Apply")',
    '[data-testid*="submit"]'
  ];

  for (const sel of submitSelectors) {
    const btn = await page.$(sel).catch(() => null);
    if (btn && await btn.isVisible().catch(() => false)) {
      const txt = (await btn.innerText().catch(() => '')).toLowerCase();
      // Avoid false positive matching search or next buttons
      if (!txt.includes('search') && !txt.includes('next') && !txt.includes('filter')) {
        return btn;
      }
    }
  }
  return null;
}
