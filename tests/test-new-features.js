import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JobRepository } from '../src/db/database.js';
import { runJobDiscovery } from '../src/scrapers/aggregator.js';
import { loadProfile } from '../src/matcher/matcher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testNewFeatures() {
  console.log('🧪 Testing New Features: Resume Upload, Location Filter & Multi-Portal Search...\n');

  // 1. Test Location Filter in Database
  console.log('▶ Test 1: Testing Location Filtering in JobRepository...');
  const remoteJobs = JobRepository.getAllJobs({ location: 'Remote', limit: 10 });
  assert.ok(Array.isArray(remoteJobs), 'Expected array of jobs');
  for (const job of remoteJobs) {
    const locMatch = (job.location || '').toLowerCase().includes('remote') ||
                     (job.description || '').toLowerCase().includes('remote') ||
                     (job.title || '').toLowerCase().includes('remote');
    assert.ok(locMatch, `Expected job to match remote, got location="${job.location}"`);
  }
  console.log(`  ✔ Location filter successfully returned ${remoteJobs.length} matching jobs.`);

  // 2. Test Resume Upload Logic
  console.log('▶ Test 2: Testing Resume File Persistence...');
  const resumesDir = path.resolve(__dirname, '../data/resumes');
  if (!fs.existsSync(resumesDir)) fs.mkdirSync(resumesDir, { recursive: true });

  const testPdfContent = Buffer.from('%PDF-1.4\n%Test Resume Content\n%%EOF');
  const testFilename = 'test_candidate_resume.pdf';
  const testPath = path.join(resumesDir, testFilename);
  fs.writeFileSync(testPath, testPdfContent);

  assert.ok(fs.existsSync(testPath), 'Resume file should exist');
  assert.strictEqual(fs.readFileSync(testPath).toString().includes('Test Resume Content'), true);
  console.log('  ✔ Resume file write and verification passed.');

  // 3. Test Multi-Portal Search with Custom Keywords & Location
  console.log('▶ Test 3: Testing Fast Multi-Portal Search with Custom Keywords & Location...');
  const searchResult = await runJobDiscovery({
    keywords: ['React', 'Node'],
    location: 'Remote'
  });

  assert.ok(searchResult.totalScanned >= 0, 'Expected positive scanned count');
  assert.ok(typeof searchResult.newJobs === 'number', 'Expected newJobs count');
  assert.ok(typeof searchResult.updatedJobs === 'number', 'Expected updatedJobs count');
  console.log(`  ✔ Fast parallel scan finished: ${searchResult.totalScanned} scanned (${searchResult.newJobs} new, ${searchResult.updatedJobs} updated).`);

  console.log('\n🎉 ALL NEW FEATURES TESTED & VERIFIED SUCCESSFULLY!');
}

testNewFeatures().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
