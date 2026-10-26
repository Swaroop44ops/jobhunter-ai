async function test() {
  const q = 'React';
  const url = `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(q)}&limit=15`;
  console.log('Fetching Remotive:', url);
  try {
    const res = await fetch(url);
    console.log('Status:', res.status);
    const data = await res.json();
    console.log('Jobs count:', (data.jobs || []).length);
    if (data.jobs?.length > 0) {
      console.log('First job:', data.jobs[0].title, 'at', data.jobs[0].company_name, 'location:', data.jobs[0].candidate_required_location);
    }
  } catch (e) {
    console.error(e.message);
  }
}
test();
