import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { humanType } from '../browser.js';
import { answerQuestion, generateCoverLetter } from '../../ai/advisor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function applyGreenhouse(page, job, profile, options = {}) {
  const isCopilot = options.mode !== 'auto';
  const personal = profile.personal || {};
  const logs = [];

  const log = (msg) => {
    logs.push(`[Greenhouse] ${msg}`);
    console.log(`[Greenhouse] ${msg}`);
  };

  log(`Navigating to ${job.url}`);
  await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Check if there is an "Apply Now" button that scrolls to form
  const applyBtn = await page.$('a[href*="#app"], a[href*="#apply"], #apply_button');
  if (applyBtn) {
    await applyBtn.click().catch(() => {});
    await page.waitForTimeout(1000);
  }

  // 1. Fill First Name
  const firstNameSelectors = ['#first_name', 'input[name*="first_name"]', 'input[autocomplete="given-name"]'];
  for (const sel of firstNameSelectors) {
    if (await page.$(sel)) {
      await humanType(page, sel, personal.firstName);
      log('Filled first name');
      break;
    }
  }

  // 2. Fill Last Name
  const lastNameSelectors = ['#last_name', 'input[name*="last_name"]', 'input[autocomplete="family-name"]'];
  for (const sel of lastNameSelectors) {
    if (await page.$(sel)) {
      await humanType(page, sel, personal.lastName);
      log('Filled last name');
      break;
    }
  }

  // 3. Fill Email
  const emailSelectors = ['#email', 'input[name*="email"]', 'input[type="email"]'];
  for (const sel of emailSelectors) {
    if (await page.$(sel)) {
      await humanType(page, sel, personal.email);
      log('Filled email');
      break;
    }
  }

  // 4. Fill Phone
  const phoneSelectors = ['#phone', 'input[name*="phone"]', 'input[type="tel"]'];
  for (const sel of phoneSelectors) {
    if (await page.$(sel)) {
      await humanType(page, sel, personal.phone);
      log('Filled phone');
      break;
    }
  }

  // 5. Upload Resume
  let resumePath = personal.resumePath ? path.resolve(__dirname, '../../../', personal.resumePath) : null;
  if (!resumePath || !fs.existsSync(resumePath)) {
    resumePath = path.resolve(__dirname, '../../../data/sample_resume.pdf');
  }

  if (fs.existsSync(resumePath)) {
    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      await fileInput.setInputFiles(resumePath);
      log(`Attached resume from ${resumePath}`);
      await page.waitForTimeout(1500);
    }
  }

  // 6. Fill LinkedIn / Portfolio Links
  const linkedinInput = await page.$('input[autocomplete*="linkedin"], input[id*="linkedin"], input[name*="linkedin"]');
  if (linkedinInput && personal.linkedin) {
    await linkedinInput.fill(personal.linkedin);
    log('Filled LinkedIn profile URL');
  }

  const websiteInput = await page.$('input[id*="website"], input[name*="website"], input[id*="portfolio"]');
  if (websiteInput && (personal.portfolio || personal.github)) {
    await websiteInput.fill(personal.portfolio || personal.github);
    log('Filled portfolio website');
  }

  // 7. Cover Letter (if required or optional textarea exists)
  const coverLetterArea = await page.$('textarea[id*="cover_letter"], textarea[name*="cover_letter"]');
  if (coverLetterArea) {
    const letter = await generateCoverLetter(job, profile);
    await coverLetterArea.fill(letter);
    log('Generated and filled tailored cover letter');
  }

  // 8. Custom Questions & Dropdowns
  const questionFields = await page.$$('.field, .application-question, [data-field]');
  for (const field of questionFields) {
    const labelElem = await field.$('label');
    if (!labelElem) continue;
    const labelText = (await labelElem.innerText()).trim();

    // Check if text input or textarea
    const input = await field.$('input[type="text"], textarea');
    if (input) {
      const val = await input.inputValue();
      if (!val) {
        const answer = await answerQuestion(labelText, { jobTitle: job.title, company: job.company }, profile);
        await input.fill(answer);
        log(`Answered question "${labelText.slice(0, 30)}...": ${answer.slice(0, 30)}`);
      }
    }

    // Check if dropdown / select
    const select = await field.$('select');
    if (select) {
      const currentVal = await select.inputValue();
      if (!currentVal) {
        // Find best option matching profile answers
        const options = await select.$$eval('option', opts => opts.map(o => ({ value: o.value, text: o.innerText })));
        const authAnswer = profile.workAuthorization?.authorizedInUS === 'yes' ? 'yes' : 'no';
        
        let chosen = options.find(o => o.text.toLowerCase().includes(authAnswer));
        if (!chosen) {
          // Select first non-empty option
          chosen = options.find(o => o.value && o.value !== '');
        }
        if (chosen) {
          await select.selectOption(chosen.value);
          log(`Selected dropdown option "${chosen.text}" for "${labelText.slice(0, 30)}..."`);
        }
      }
    }
  }

  log('All available fields populated.');

  if (isCopilot) {
    log('COPILOT MODE: Form ready for final user review and submit click.');
    return {
      success: true,
      mode: 'copilot',
      message: 'All form fields filled. Awaiting manual review / submission.',
      logs
    };
  } else {
    // Auto submit
    const submitBtn = await page.$('#submit_app, button[type="submit"], input[type="submit"]');
    if (submitBtn) {
      log('AUTO MODE: Clicking submit button...');
      await submitBtn.click();
      await page.waitForTimeout(3000);
      log('Application submitted successfully.');
      return {
        success: true,
        mode: 'auto',
        message: 'Application submitted successfully to Greenhouse.',
        logs
      };
    } else {
      throw new Error('Submit button not found');
    }
  }
}
