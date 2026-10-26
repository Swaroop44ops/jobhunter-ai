#!/usr/bin/env node
import { runJobDiscovery } from './scrapers/aggregator.js';
import { processJobApplication } from './automation/engine.js';
import { JobRepository } from './db/database.js';

const command = process.argv[2] || 'help';

async function main() {
  switch (command) {
    case 'search': {
      console.log('🔍 Starting job discovery across platforms...');
      const results = await runJobDiscovery();
      console.log('✅ Job discovery completed:');
      console.log(`   Total scanned: ${results.totalScanned}`);
      console.log(`   New jobs:      ${results.newJobs}`);
      console.log(`   Updated jobs:  ${results.updatedJobs}`);
      console.log(`   Skipped:       ${results.skipped}`);
      break;
    }

    case 'apply': {
      const jobId = process.argv[3];
      const mode = process.argv[4] || 'copilot';

      if (jobId) {
        const job = JobRepository.getJobById(jobId);
        if (!job) {
          console.error(`❌ Job with ID ${jobId} not found.`);
          process.exit(1);
        }
        console.log(`🚀 Applying to ${job.title} at ${job.company} (${mode} mode)...`);
        const res = await processJobApplication(job, { mode, keepOpen: true });
        console.log('Result:', res);
      } else {
        // Apply to top queued or high-match job
        const topJobs = JobRepository.getAllJobs({ minScore: 60, status: 'DISCOVERED', limit: 5 });
        if (topJobs.length === 0) {
          console.log('No eligible discovered jobs found with match score >= 60. Run "npm run search" first!');
          return;
        }
        const target = topJobs[0];
        console.log(`🎯 Top match found: [Score ${target.match_score}%] ${target.title} at ${target.company}`);
        console.log(`🚀 Launching application in ${mode} mode...`);
        const res = await processJobApplication(target, { mode, keepOpen: true });
        console.log('Result:', res);
      }
      break;
    }

    case 'list': {
      const filterArg = process.argv[3];
      // Try search filter first, then location
      let jobs = JobRepository.getAllJobs({
        search: filterArg || undefined,
        limit: 25
      });
      if (jobs.length === 0 && filterArg) {
        jobs = JobRepository.getAllJobs({
          location: filterArg,
          limit: 25
        });
      }
      console.log(`📋 Showing top jobs matching "${filterArg || 'all'}" (Total: ${jobs.length}):`);
      console.table(
        jobs.map(j => ({
          ID: j.id,
          Score: `${j.match_score}%`,
          Title: j.title.slice(0, 34),
          Company: j.company.slice(0, 18),
          Location: (j.location || 'Remote').slice(0, 24),
          Platform: j.platform || j.source
        }))
      );
      break;
    }

    default:
      console.log(`
JobHunter AI - Command Line Interface
=====================================
Usage:
  node src/cli.js search             Discover & score jobs from multiple sources
  node src/cli.js list               Show top discovered jobs in database
  node src/cli.js apply [id] [mode]  Apply to a job (modes: copilot, auto)
  npm start                          Launch interactive Web Dashboard (recommended)
`);
  }
}

main().catch(err => {
  console.error('Fatal CLI Error:', err);
  process.exit(1);
});
