async function test() {
  const q = 'React Developer';
  const l = 'India';
  const url = `https://in.indeed.com/rss?q=${encodeURIComponent(q)}&l=${encodeURIComponent(l)}`;
  console.log('Fetching Indeed RSS:', url);

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    console.log('Indeed RSS status:', res.status);
    const xml = await res.text();
    console.log('XML length:', xml.length);
    console.log('Snippet:', xml.slice(0, 400));
  } catch (e) {
    console.error('Indeed error:', e.message);
  }
}
test();
