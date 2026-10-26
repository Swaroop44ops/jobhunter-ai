import { JobRepository } from '../src/db/database.js';

console.log('Testing Date Posted Filter & Timestamps...');

// 1. Insert jobs with known dates
const now = Date.now();
const jobToday = {
  id: 'test-date-1',
  title: 'Senior .NET Developer',
  company: 'Tech India',
  location: 'Bengaluru, India',
  url: 'https://example.com/test-job-today',
  description: 'C# .NET Core Azure',
  platform: 'LinkedIn',
  posted_at: new Date(now - 2 * 60 * 60 * 1000).toISOString() // 2 hours ago
};

const jobWeekAgo = {
  id: 'test-date-2',
  title: 'Full Stack .NET Engineer',
  company: 'Global Solutions',
  location: 'Hyderabad, India',
  url: 'https://example.com/test-job-week-ago',
  description: 'ASP.NET MVC SQL Server',
  platform: 'Greenhouse',
  posted_at: new Date(now - 4 * 24 * 60 * 60 * 1000).toISOString() // 4 days ago
};

const jobOld = {
  id: 'test-date-3',
  title: '.NET Architect',
  company: 'Legacy Corp',
  location: 'Mumbai, India',
  url: 'https://example.com/test-job-old',
  description: 'WPF C# .NET',
  platform: 'Jobicy',
  posted_at: new Date(now - 40 * 24 * 60 * 60 * 1000).toISOString() // 40 days ago
};

JobRepository.upsertJob(jobToday);
JobRepository.upsertJob(jobWeekAgo);
JobRepository.upsertJob(jobOld);

// 2. Query 24h filter
const jobs24h = JobRepository.getAllJobs({ datePosted: '24h' });
console.log(`[24h Filter] Total found: ${jobs24h.length}`);
const hasToday = jobs24h.some(j => j.id === 'test-date-1');
const hasWeek = jobs24h.some(j => j.id === 'test-date-2');
const hasOld = jobs24h.some(j => j.id === 'test-date-3');

console.log(` - Has 2h ago job: ${hasToday} (Expected: true)`);
console.log(` - Has 4d ago job: ${hasWeek} (Expected: false)`);
console.log(` - Has 40d ago job: ${hasOld} (Expected: false)`);

if (!hasToday || hasWeek || hasOld) {
  throw new Error('24h date filter failed!');
}

// 3. Query 7d filter
const jobs7d = JobRepository.getAllJobs({ datePosted: '7d' });
console.log(`[7d Filter] Total found: ${jobs7d.length}`);
const hasToday7d = jobs7d.some(j => j.id === 'test-date-1');
const hasWeek7d = jobs7d.some(j => j.id === 'test-date-2');
const hasOld7d = jobs7d.some(j => j.id === 'test-date-3');

console.log(` - Has 2h ago job: ${hasToday7d} (Expected: true)`);
console.log(` - Has 4d ago job: ${hasWeek7d} (Expected: true)`);
console.log(` - Has 40d ago job: ${hasOld7d} (Expected: false)`);

if (!hasToday7d || !hasWeek7d || hasOld7d) {
  throw new Error('7d date filter failed!');
}

// 4. Query 30d filter
const jobs30d = JobRepository.getAllJobs({ datePosted: '30d' });
console.log(`[30d Filter] Total found: ${jobs30d.length}`);
const hasOld30d = jobs30d.some(j => j.id === 'test-date-3');
console.log(` - Has 40d ago job in 30d: ${hasOld30d} (Expected: false)`);
if (hasOld30d) {
  throw new Error('30d date filter failed!');
}

console.log(' All Date Posted Filter tests passed successfully!');
