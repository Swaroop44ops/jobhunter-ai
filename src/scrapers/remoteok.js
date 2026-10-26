import crypto from 'crypto';

export async function fetchRemoteOKJobs(keywords = ['engineer', 'developer']) {
  const jobs = [];
  try {
    const res = await fetch('https://remoteok.com/api', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!res.ok) {
      console.warn(`RemoteOK returned HTTP ${res.status}`);
      return jobs;
    }

    const data = await res.json();
    // First item is legal info, slice it off
    const rawJobs = Array.isArray(data) ? data.slice(1) : [];

    for (const item of rawJobs) {
      if (!item.position || !item.url) continue;

      const titleLower = item.position.toLowerCase();
      const tags = (item.tags || []).join(' ').toLowerCase();

      // Check if matches any keyword
      const matches = keywords.some(k => titleLower.includes(k.toLowerCase()) || tags.includes(k.toLowerCase()));
      if (!matches) continue;

      // Detect if apply url is greenhouse, lever or native
      let platform = 'RemoteOK';
      const applyUrl = item.apply_url || item.url;
      if (applyUrl.includes('greenhouse.io')) platform = 'Greenhouse';
      else if (applyUrl.includes('lever.co')) platform = 'Lever';

      const id = 'rok-' + (item.id || crypto.createHash('md5').update(applyUrl).digest('hex').slice(0, 10));

      jobs.push({
        id,
        source: 'RemoteOK',
        title: item.position,
        company: item.company || 'Unknown',
        location: item.location || 'Remote',
        url: applyUrl,
        description: item.description || '',
        salary: item.salary_min && item.salary_max ? `$${item.salary_min} - $${item.salary_max}` : null,
        platform,
        posted_at: item.date ? new Date(item.date).toISOString() : new Date().toISOString()
      });
    }
  } catch (err) {
    console.warn('Error fetching RemoteOK jobs:', err.message);
  }

  return jobs;
}
