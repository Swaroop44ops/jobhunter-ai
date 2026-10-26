import crypto from 'crypto';

// Top tech companies on Greenhouse with engineering teams in India and globally
const DEFAULT_BOARDS = [
  'inmobi',
  'elastic',
  'twilio',
  'thoughtworks',
  'cloudflare',
  'stripe',
  'gitlab',
  'figma',
  'discord',
  'reddit',
  'affirm',
  'hashicorp'
];

export async function fetchGreenhouseJobs(boardTokens = DEFAULT_BOARDS, keywords = ['engineer', 'developer']) {
  const jobs = [];

  for (const board of boardTokens) {
    try {
      const url = `https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (!res.ok) continue;

      const data = await res.json();
      const rawJobs = data.jobs || [];

      for (const item of rawJobs) {
        if (!item.title || !item.absolute_url) continue;

        const titleLower = item.title.toLowerCase();
        const matches = keywords.some(k => titleLower.includes(k.toLowerCase()));
        if (!matches) continue;

        const id = 'gh-' + item.id;
        jobs.push({
          id,
          source: 'Greenhouse',
          title: item.title,
          company: board.charAt(0).toUpperCase() + board.slice(1),
          location: item.location?.name || 'Multiple Locations',
          url: item.absolute_url,
          description: (item.content || '').replace(/<[^>]+>/g, ' '),
          platform: 'Greenhouse',
          posted_at: item.updated_at ? new Date(item.updated_at).toISOString() : new Date().toISOString()
        });
      }
    } catch (err) {
      // Continue silently
    }
  }

  return jobs;
}
