import crypto from 'crypto';

export async function fetchRemotiveJobs(keyword = 'Developer') {
  const jobs = [];
  try {
    const url = `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(keyword)}&limit=25`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!res.ok) return jobs;

    const data = await res.json();
    const rawJobs = data.jobs || [];

    for (const item of rawJobs) {
      if (!item.title || !item.url) continue;

      let platform = 'Remotive';
      const applyUrl = item.url;
      if (applyUrl.includes('greenhouse.io')) platform = 'Greenhouse';
      else if (applyUrl.includes('lever.co')) platform = 'Lever';

      const id = 'rem-' + (item.id || crypto.createHash('md5').update(applyUrl).digest('hex').slice(0, 10));

      jobs.push({
        id,
        source: 'Remotive',
        title: item.title,
        company: item.company_name || 'Unknown',
        location: item.candidate_required_location || 'Worldwide Remote',
        url: applyUrl,
        description: item.description?.replace(/<[^>]+>/g, ' ') || '',
        salary: item.salary || null,
        platform,
        posted_at: item.publication_date ? new Date(item.publication_date).toISOString() : new Date().toISOString()
      });
    }
  } catch (err) {
    console.warn('Error fetching Remotive jobs:', err.message);
  }

  return jobs;
}
