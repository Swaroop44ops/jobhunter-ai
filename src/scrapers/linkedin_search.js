import crypto from 'crypto';

export async function fetchLinkedInJobs(keywords = 'Software Engineer', location = 'India', maxPages = 2) {
  const jobs = [];
  
  for (let page = 0; page < maxPages; page++) {
    const start = page * 25;
    try {
      const encodedKw = encodeURIComponent(keywords);
      const encodedLoc = encodeURIComponent(location);
      const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodedKw}&location=${encodedLoc}&start=${start}`;

      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });

      if (!res.ok) {
        console.warn(`LinkedIn guest search returned HTTP ${res.status}`);
        break;
      }

      const html = await res.text();
      const items = html.split(/<li[^>]*>/).slice(1);
      if (items.length === 0) break;

      for (const cardHtml of items) {
        const titleMatch = cardHtml.match(/<h3 class="base-search-card__title"[^>]*>([\s\S]*?)<\/h3>/);
        const companyMatch = cardHtml.match(/<h4 class="base-search-card__subtitle"[^>]*>([\s\S]*?)<\/h4>/);
        const locMatch = cardHtml.match(/<span class="job-search-card__location"[^>]*>([\s\S]*?)<\/span>/);
        const linkMatch = cardHtml.match(/<a class="base-card__full-link[^"]*"[^>]*href="([^"]+)"/);

        if (titleMatch && linkMatch) {
          const title = titleMatch[1].trim();
          const company = companyMatch ? companyMatch[1].replace(/<[^>]+>/g, '').trim() : 'Unknown';
          const loc = locMatch ? locMatch[1].trim() : location;
          const link = linkMatch[1].split('?')[0];

          let posted_at = new Date().toISOString();
          const timeMatch = cardHtml.match(/<time[^>]*datetime="([^"]+)"[^>]*>/i);
          if (timeMatch && timeMatch[1]) {
            const parsed = new Date(timeMatch[1]);
            if (!isNaN(parsed.getTime())) {
              posted_at = parsed.toISOString();
            }
          } else {
            const relMatch = cardHtml.match(/<time[^>]*class="[^"]*job-search-card__listdate[^"]*"[^>]*>([\s\S]*?)<\/time>/i);
            if (relMatch) {
              const txt = relMatch[1].replace(/<[^>]+>/g, '').trim().toLowerCase();
              const now = Date.now();
              if (txt.includes('hour') || txt.includes('minute') || txt.includes('just now')) {
                posted_at = new Date(now).toISOString();
              } else if (txt.includes('day')) {
                const d = parseInt(txt) || 1;
                posted_at = new Date(now - d * 24 * 3600 * 1000).toISOString();
              } else if (txt.includes('week')) {
                const w = parseInt(txt) || 1;
                posted_at = new Date(now - w * 7 * 24 * 3600 * 1000).toISOString();
              } else if (txt.includes('month')) {
                const m = parseInt(txt) || 1;
                posted_at = new Date(now - m * 30 * 24 * 3600 * 1000).toISOString();
              }
            }
          }

          const id = 'li-' + crypto.createHash('md5').update(link).digest('hex').slice(0, 10);
          jobs.push({
            id,
            source: 'LinkedIn',
            title,
            company,
            location: loc,
            url: link,
            description: `${title} at ${company}. Located in ${loc}.`,
            platform: 'LinkedIn',
            posted_at
          });
        }
      }
    } catch (err) {
      console.warn('Error fetching LinkedIn jobs:', err.message);
      break;
    }
  }

  return jobs;
}
