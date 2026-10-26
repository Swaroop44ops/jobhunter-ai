import { fetchRemoteOKJobs } from './remoteok.js';
import { fetchJobicyJobs } from './jobicy.js';
import { fetchGreenhouseJobs } from './greenhouse_search.js';
import { fetchLinkedInJobs } from './linkedin_search.js';
import { fetchRemotiveJobs } from './remotive.js';
import { evaluateJobFit, loadProfile } from '../matcher/matcher.js';
import { JobRepository } from '../db/database.js';

export async function runJobDiscovery(options = {}) {
  const profile = loadProfile();
  const prefs = profile.preferences || {};
  
  // Parse keywords: can be array or comma-separated string
  let rawKeywords = options.keywords;
  let keywords = [];
  if (Array.isArray(rawKeywords)) {
    keywords = rawKeywords;
  } else if (typeof rawKeywords === 'string' && rawKeywords.trim()) {
    keywords = rawKeywords.split(',').map(s => s.trim()).filter(Boolean);
  }
  
  if (!keywords || keywords.length === 0) {
    keywords = prefs.targetTitles || ['Software Engineer', 'Developer'];
  }

  // Parse location
  const location = options.location || (prefs.targetLocations && prefs.targetLocations[0]) || 'India';
  const primaryKw = keywords[0] || 'Software Engineer';

  // Smart Query Expansion for special technologies (e.g. .net -> .NET Developer)
  let portalSearchTerm = primaryKw;
  const kwLower = primaryKw.toLowerCase().trim();
  if (kwLower === '.net' || kwLower === 'dotnet') {
    portalSearchTerm = '.NET Developer';
  } else if (kwLower === 'c#' || kwLower === 'csharp') {
    portalSearchTerm = 'C# Developer';
  }

  JobRepository.log(null, 'INFO', `Executing dynamic portal search: Query="${portalSearchTerm}", Location="${location}"`);

  const allRawJobs = [];

  // Run all scrapers in parallel for maximum dynamic coverage
  const scraperPromises = [
    // 1. LinkedIn Live Search (with pagination)
    fetchLinkedInJobs(portalSearchTerm, location, 2).then(jobs => {
      JobRepository.log(null, 'INFO', `LinkedIn Live returned ${jobs.length} dynamic jobs for "${portalSearchTerm}" in ${location}`);
      return jobs;
    }).catch(err => {
      JobRepository.log(null, 'WARN', `LinkedIn search error: ${err.message}`);
      return [];
    }),

    // 2. Remotive Dynamic Search
    fetchRemotiveJobs(portalSearchTerm).then(jobs => {
      JobRepository.log(null, 'INFO', `Remotive returned ${jobs.length} dynamic jobs`);
      return jobs;
    }).catch(err => {
      JobRepository.log(null, 'WARN', `Remotive error: ${err.message}`);
      return [];
    }),

    // 3. RemoteOK
    fetchRemoteOKJobs([primaryKw, portalSearchTerm, ...keywords]).then(jobs => {
      JobRepository.log(null, 'INFO', `RemoteOK returned ${jobs.length} jobs`);
      return jobs;
    }).catch(err => {
      JobRepository.log(null, 'WARN', `RemoteOK error: ${err.message}`);
      return [];
    }),

    // 4. Jobicy
    fetchJobicyJobs(35, portalSearchTerm).then(jobs => {
      JobRepository.log(null, 'INFO', `Jobicy returned ${jobs.length} jobs`);
      return jobs;
    }).catch(err => {
      JobRepository.log(null, 'WARN', `Jobicy error: ${err.message}`);
      return [];
    }),

    // 5. Greenhouse Direct Boards
    fetchGreenhouseJobs(undefined, [primaryKw, portalSearchTerm, ...keywords]).then(jobs => {
      JobRepository.log(null, 'INFO', `Greenhouse boards returned ${jobs.length} jobs`);
      return jobs;
    }).catch(err => {
      JobRepository.log(null, 'WARN', `Greenhouse boards error: ${err.message}`);
      return [];
    })
  ];

  const results = await Promise.allSettled(scraperPromises);
  for (const r of results) {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) {
      allRawJobs.push(...r.value);
    }
  }

  let newCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  // Process & Score Jobs with query weighting
  for (const raw of allRawJobs) {
    const evaluation = evaluateJobFit(raw, profile, [primaryKw, portalSearchTerm, ...keywords]);

    const jobRecord = {
      ...raw,
      match_score: evaluation.score,
      match_reasons: evaluation.reasons,
      status: evaluation.isBlacklisted ? 'SKIPPED' : 'DISCOVERED'
    };

    if (evaluation.isBlacklisted) {
      skippedCount++;
    }

    const { isNew } = JobRepository.upsertJob(jobRecord);
    if (!evaluation.isBlacklisted) {
      if (isNew) newCount++;
      else updatedCount++;
    }
  }

  JobRepository.log(
    null,
    'INFO',
    `Dynamic scan finished: ${allRawJobs.length} live jobs fetched (${newCount} new, ${updatedCount} updated, ${skippedCount} skipped by blacklist).`
  );

  return {
    totalScanned: allRawJobs.length,
    newJobs: newCount,
    updatedJobs: updatedCount,
    skipped: skippedCount
  };
}
