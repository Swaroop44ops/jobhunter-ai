import assert from 'assert';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JobRepository } from '../src/db/database.js';
import { evaluateJobFit } from '../src/matcher/matcher.js';
import { answerQuestion, generateCoverLetter } from '../src/ai/advisor.js';
import { launchBrowser } from '../src/automation/browser.js';
import { applyGreenhouse } from '../src/automation/adapters/greenhouse.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTestSuite() {
  console.log('🧪 Starting JobHunter AI Comprehensive Test Suite...\n');

  // TEST 1: Database Operations
  console.log('▶ Test 1: Testing SQLite Database & JobRepository...');
  const testJob = {
    id: 'test-job-1',
    source: 'TestBoard',
    title: 'Senior Full Stack Engineer',
    company: 'Acme Technologies',
    location: 'Remote',
    url: 'https://example.com/jobs/test-1',
    description: 'We are looking for a Node.js and React developer with PostgreSQL experience.',
    match_score: 85,
    match_reasons: ['Title match', 'Skills: Node.js, React'],
    status: 'DISCOVERED',
    platform: 'Greenhouse'
  };

  JobRepository.upsertJob(testJob);
  const fetched = JobRepository.getJobById('test-job-1');
  assert.strictEqual(fetched.id, 'test-job-1');
  assert.strictEqual(fetched.company, 'Acme Technologies');

  JobRepository.updateJobStatus('test-job-1', 'APPLIED');
  const updated = JobRepository.getJobById('test-job-1');
  assert.strictEqual(updated.status, 'APPLIED');
  assert.ok(updated.applied_at);
  console.log('  ✔ Database upsert, fetch, and status transitions passed.');

  // TEST 2: Job Fit Matcher
  console.log('▶ Test 2: Testing Job Fit Matcher Algorithm...');
  const testProfile = {
    preferences: {
      targetTitles: ['Software Engineer', 'Full Stack Developer'],
      targetLocations: ['Remote'],
      skills: ['JavaScript', 'Node.js', 'React', 'Python', 'SQL'],
      blacklistCompanies: ['SpamCorp'],
      blacklistKeywords: ['Top Secret Clearance']
    }
  };

  // High match
  const highFit = evaluateJobFit({
    title: 'Full Stack Developer',
    company: 'GoodCorp',
    location: 'Remote',
    description: 'Seeking a Full Stack Developer skilled in Node.js, React, and SQL.'
  }, testProfile);
  assert.ok(highFit.score >= 70, `Expected score >= 70, got ${highFit.score}`);
  assert.strictEqual(highFit.isBlacklisted, false);

  // Blacklist match
  const blacklisted = evaluateJobFit({
    title: 'Software Engineer',
    company: 'SpamCorp',
    location: 'Remote',
    description: 'Come work at SpamCorp'
  }, testProfile);
  assert.strictEqual(blacklisted.score, 0);
  assert.strictEqual(blacklisted.isBlacklisted, true);
  console.log('  ✔ Fit scoring, skill weighting, and blacklist filtering passed.');

  // TEST 3: AI Answering & Cover Letter Generation
  console.log('▶ Test 3: Testing AI Question Answering & Cover Letter...');
  const authAns = await answerQuestion('Are you legally authorized to work in the US?', {}, {
    workAuthorization: { authorizedInUS: 'yes' }
  });
  assert.strictEqual(authAns, 'Yes');

  const expAns = await answerQuestion('How many years of experience do you have with Node.js?', {}, {
    preferences: { yearsOfExperience: 4, skills: ['Node.js'] }
  });
  assert.strictEqual(expAns, '4');

  const coverLetter = await generateCoverLetter(testJob, {
    personal: { firstName: 'Alex', lastName: 'Dev', email: 'alex@example.com' },
    preferences: { skills: ['Node.js', 'React'] }
  });
  assert.ok(coverLetter.includes('Acme Technologies'));
  assert.ok(coverLetter.includes('Alex Dev'));
  console.log('  ✔ AI answering and cover letter generation passed.');

  // TEST 4: Browser Automation with Mock Form
  console.log('▶ Test 4: Testing Playwright Form Automation with Local Mock Server...');
  const mockHtml = `
    <!DOCTYPE html>
    <html>
    <body>
      <form id="application_form">
        <input type="text" id="first_name" name="first_name" />
        <input type="text" id="last_name" name="last_name" />
        <input type="email" id="email" name="email" />
        <input type="tel" id="phone" name="phone" />
        <input type="file" id="resume" />
        <input type="text" id="linkedin" autocomplete="custom-question-linkedin" />
        <div class="field">
          <label>Years of experience in Node.js?</label>
          <input type="text" />
        </div>
        <button id="submit_app" type="button" onclick="window.formSubmitted = true;">Submit Application</button>
      </form>
    </body>
    </html>
  `;

  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(mockHtml);
  });

  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const mockUrl = `http://127.0.0.1:${port}`;

  const context = await launchBrowser({ headless: true });
  const page = await context.newPage();

  try {
    const applyResult = await applyGreenhouse(
      page,
      { ...testJob, url: mockUrl },
      {
        personal: {
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@example.com',
          phone: '+1-555-0199',
          linkedin: 'https://linkedin.com/in/janedoe',
          resumePath: 'data/sample_resume.pdf'
        },
        preferences: { yearsOfExperience: 5 }
      },
      { mode: 'auto' }
    );

    assert.strictEqual(applyResult.success, true);
    console.log('  ✔ Mock ATS form automation test passed.');
  } finally {
    await context.close();
    server.close();
  }

  console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! Everything is verified.');
}

runTestSuite().catch(err => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
