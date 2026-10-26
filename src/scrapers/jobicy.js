import crypto from 'crypto';

export async function fetchJobicyJobs(count = 35, keyword = '') {
  const jobs = [];
  try {
    // If keyword is provided, determine tag
    let tag = 'dev';
    const kwLower = (keyword || '').toLowerCase();
    if (kwLower.includes('python')) tag = 'python';
    else if (kwLower.includes('react')) tag = 'react';
    else if (kwLower.includes('node')) tag = 'nodejs';
    else if (kwLower.includes('data')) tag = 'data-science';

    const url = `https://jobicy.com/api/v2/remote-jobs?count=${count}&tag=${tag}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!res.ok) {
      return jobs;
    }

    const data = await res.json();
    const rawJobs = data.jobs || [];

    for (const item of rawJobs) {
      if (!item.jobTitle || !item.url) continue;

      let platform = 'Jobicy';
      const applyUrl = item.url;
      if (applyUrl.includes('greenhouse.io')) platform = 'Greenhouse';
      else if (applyUrl.includes('lever.co')) platform = 'Lever';
      else if (applyUrl.includes('linkedin.com')) platform = 'LinkedIn';

      const id = 'jby-' + (item.id || crypto.createHash('md5').update(applyUrl).digest('hex').slice(0, 10));

      jobs.push({
        id,
        source: 'Jobicy',
        title: item.jobTitle,
        company: item.companyName || 'Unknown',
        location: item.jobGeo || 'Remote',
        url: applyUrl,
        description: item.jobDescription || item.jobExcerpt || '',
        salary: item.annualSalaryMin && item.annualSalaryMax ? `$${item.annualSalaryMin} - $${item.annualSalaryMax}` : null,
        platform,
        posted_at: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString()
      });
    }
  } catch (err) {
    console.warn('Error fetching Jobicy jobs:', err.message);
  }

  return jobs;
}
