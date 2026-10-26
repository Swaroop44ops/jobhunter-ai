import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { humanType } from '../browser.js';
import { answerQuestion, generateCoverLetter } from '../../ai/advisor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function applyLever(page, job, profile, options = {}) {
  const isCopilot = options.mode !== 'auto';
  const personal = profile.personal || {};
  const logs = [];

  const log = (msg) => {
    logs.push(`[Lever] ${msg}`);
    console.log(`[Lever] ${msg}`);
  };

  let applyUrl = job.url;
  if (!applyUrl.endsWith('/apply')) {
    applyUrl = applyUrl.replace(/\/$/, '') + '/apply';
  }

  log(`Navigating to ${applyUrl}`);
  await page.goto(applyUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // 1. Full Name
  const fullName = `${personal.firstName} ${personal.lastName}`.trim();
  const nameInput = await page.$('input[name="name"]');
  if (nameInput) {
    await humanType(page, 'input[name="name"]', fullName);
    log('Filled full name');
  }

  // 2. Email
  const emailInput = await page.$('input[name="email"]');
  if (emailInput) {
    await humanType(page, 'input[name="email"]', personal.email);
    log('Filled email');
  }

  // 3. Phone
  const phoneInput = await page.$('input[name="phone"]');
  if (phoneInput) {
    await humanType(page, 'input[name="phone"]', personal.phone);
    log('Filled phone');
  }

  // 4. Current company
  const orgInput = await page.$('input[name="org"]');
  if (orgInput) {
    await humanType(page, 'input[name="org"]', personal.currentCompany || 'Self-Employed / Independent');
    log('Filled current organization');
  }

  // 5. Social & Portfolio links
  const linkedinInput = await page.$('input[name="urls[LinkedIn]"], input[name*="LinkedIn"]');
  if (linkedinInput && personal.linkedin) {
    await linkedinInput.fill(personal.linkedin);
    log('Filled LinkedIn URL');
  }

  const githubInput = await page.$('input[name="urls[GitHub]"], input[name*="GitHub"]');
  if (githubInput && personal.github) {
    await githubInput.fill(personal.github);
    log('Filled GitHub URL');
  }

  const portfolioInput = await page.$('input[name="urls[Portfolio]"], input[name*="Portfolio"], input[name*="Website"]');
  if (portfolioInput && personal.portfolio) {
    await portfolioInput.fill(personal.portfolio);
    log('Filled Portfolio URL');
  }

  // 6. Resume file upload
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

  // 7. Additional Information / Cover Letter
  const commentInput = await page.$('textarea[name="comments"], textarea[name*="additional"]');
  if (commentInput) {
    const letter = await generateCoverLetter(job, profile);
    await commentInput.fill(letter);
    log('Added personalized cover letter note');
  }

  // 8. Custom questions
  const customCards = await page.$$('.application-question, .custom-question');
  for (const card of customCards) {
    const labelElem = await card.$('.text, label');
    if (!labelElem) continue;
    const label = (await labelElem.innerText()).trim();

    const textInput = await card.$('input[type="text"], textarea');
    if (textInput) {
      const val = await textInput.inputValue();
      if (!val) {
        const answer = await answerQuestion(label, { jobTitle: job.title, company: job.company }, profile);
        await textInput.fill(answer);
        log(`Answered "${label.slice(0, 30)}...": ${answer.slice(0, 30)}`);
      }
    }
  }

  log('All Lever form fields populated.');

  if (isCopilot) {
    log('COPILOT MODE: Awaiting manual review and submit click.');
    return {
      success: true,
      mode: 'copilot',
      message: 'All form fields filled. Awaiting manual review / submission.',
      logs
    };
  } else {
    const submitBtn = await page.$('#btn-submit, button[type="submit"]');
    if (submitBtn) {
      log('AUTO MODE: Submitting Lever application...');
      await submitBtn.click();
      await page.waitForTimeout(3000);
      return {
        success: true,
        mode: 'auto',
        message: 'Application submitted successfully to Lever.',
        logs
      };
    } else {
      throw new Error('Lever submit button not found');
    }
  }
}
