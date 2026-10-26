async function test() {
  const url = 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=React%20Developer&location=India&start=0';
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    }
  });

  const html = await res.text();
  console.log('Total HTML length:', html.length);

  // Look for items
  const items = html.split(/<li[^>]*>/).slice(1);
  console.log('Li items count:', items.length);

  let parsed = 0;
  for (let i = 0; i < items.length; i++) {
    const card = items[i];
    const titleMatch = card.match(/<h3 class="base-search-card__title"[^>]*>([\s\S]*?)<\/h3>/);
    const linkMatch = card.match(/<a class="base-card__full-link[^"]*"[^>]*href="([^"]+)"/);
    const companyMatch = card.match(/<h4 class="base-search-card__subtitle"[^>]*>([\s\S]*?)<\/h4>/);
    const locMatch = card.match(/<span class="job-search-card__location"[^>]*>([\s\S]*?)<\/span>/);

    if (titleMatch) {
      console.log(`[${i}] Title:`, titleMatch[1].trim());
      console.log(`    Link found?`, !!linkMatch, linkMatch ? linkMatch[1].split('?')[0] : 'NONE');
      console.log(`    Company:`, companyMatch ? companyMatch[1].replace(/<[^>]+>/g, '').trim() : 'NONE');
      console.log(`    Location:`, locMatch ? locMatch[1].trim() : 'NONE');
      if (titleMatch && linkMatch) parsed++;
    } else {
      console.log(`[${i}] No title in item, snippet:`, card.slice(0, 100));
    }
  }
  console.log('Total successfully parsed:', parsed);
}

test();
