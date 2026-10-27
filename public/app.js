// State
let currentJobs = [];
let activeModalJob = null;

// DOM Elements
const jobsTableBody = document.getElementById('jobs-table-body');
const searchInput = document.getElementById('search-input');
const filterStatus = document.getElementById('filter-status');
const filterDate = document.getElementById('filter-date');
const filterScore = document.getElementById('filter-score');
const filterLocation = document.getElementById('filter-location');
const scoreVal = document.getElementById('score-val');
const btnRunSearch = document.getElementById('btn-run-search');
const btnBatchApply = document.getElementById('btn-batch-apply');
const btnSaveProfile = document.getElementById('btn-save-profile');
const btnRefreshLogs = document.getElementById('btn-refresh-logs');
const logsContainer = document.getElementById('logs-container');

// Multi-Portal Search Elements
const portalKeywords = document.getElementById('portal-keywords');
const portalLocation = document.getElementById('portal-location');
const btnPortalSearch = document.getElementById('btn-portal-search');

// Resume Elements
const quickResumeUpload = document.getElementById('quick-resume-upload');
const quickResumeLabel = document.getElementById('quick-resume-label');
const profileResumeUpload = document.getElementById('profile-resume-upload');
const profResumeDisplay = document.getElementById('prof-resume-display');
const resumeStatusBadge = document.getElementById('resume-status-badge');

// Job Modal Elements
const jobModal = document.getElementById('job-modal');
const btnCloseModal = document.getElementById('btn-close-modal');
const modalTitle = document.getElementById('modal-title');
const modalCompany = document.getElementById('modal-company');
const modalScore = document.getElementById('modal-score');
const modalReasons = document.getElementById('modal-reasons');
const modalCoverLetter = document.getElementById('modal-cover-letter');
const modalLink = document.getElementById('modal-link');
const modalBtnCopilot = document.getElementById('modal-btn-copilot');
const modalBtnAuto = document.getElementById('modal-btn-auto');

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  loadStats();
  loadJobs();
  loadProfile();
  loadLogs();

  // Polling for stats and logs
  setInterval(loadStats, 10000);
  setInterval(loadLogs, 8000);

  // Filter events
  searchInput.addEventListener('input', debounce(loadJobs, 300));
  if (filterLocation) filterLocation.addEventListener('input', debounce(loadJobs, 300));
  filterStatus.addEventListener('change', loadJobs);
  if (filterDate) filterDate.addEventListener('change', loadJobs);
  filterScore.addEventListener('input', (e) => {
    scoreVal.innerText = `${e.target.value}%`;
    loadJobs();
  });

  // Action events
  btnRunSearch.addEventListener('click', handleRunSearch);
  if (btnPortalSearch) btnPortalSearch.addEventListener('click', handlePortalSearch);
  btnBatchApply.addEventListener('click', handleBatchApply);
  btnSaveProfile.addEventListener('click', handleSaveProfile);
  btnRefreshLogs.addEventListener('click', loadLogs);
  btnCloseModal.addEventListener('click', () => jobModal.classList.add('hidden'));

  // Resume Upload events
  const btnExtractResume = document.getElementById('btn-extract-resume');
  if (btnExtractResume) {
    btnExtractResume.addEventListener('click', handleExtractResume);
  }

  if (quickResumeUpload) {
    quickResumeUpload.addEventListener('change', (e) => {
      if (e.target.files?.[0]) uploadResumeFile(e.target.files[0]);
    });
  }
  if (profileResumeUpload) {
    profileResumeUpload.addEventListener('change', (e) => {
      if (e.target.files?.[0]) uploadResumeFile(e.target.files[0]);
    });
  }

  modalBtnCopilot.addEventListener('click', () => {
    if (activeModalJob) handleApply(activeModalJob.id, 'copilot');
  });
  modalBtnAuto.addEventListener('click', () => {
    if (activeModalJob) handleApply(activeModalJob.id, 'auto');
  });
});

// Tab Navigation
function setupTabs() {
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => {
        t.classList.remove('active', 'text-indigo-600', 'border-b-2', 'border-indigo-600');
        t.classList.add('text-slate-500');
      });
      tab.classList.add('active', 'text-indigo-600', 'border-b-2', 'border-indigo-600');
      tab.classList.remove('text-slate-500');

      const target = tab.dataset.tab;
      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
      document.getElementById(`tab-${target}`).classList.remove('hidden');
    });
  });
}

// Stats
async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    document.getElementById('stat-total').innerText = data.total || 0;
    document.getElementById('stat-high-match').innerText = data.highMatch || 0;
    document.getElementById('stat-queued').innerText = data.queued || 0;
    document.getElementById('stat-applied').innerText = data.applied || 0;
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

// Jobs Table
async function loadJobs() {
  const query = (searchInput.value || (portalKeywords ? portalKeywords.value : '')).trim();
  const status = filterStatus.value;
  const minScore = filterScore.value;
  const location = (filterLocation && filterLocation.value ? filterLocation.value : (portalLocation ? portalLocation.value : '')).trim();
  const datePosted = filterDate ? filterDate.value : '';

  const url = new URL('/api/jobs', window.location.origin);
  if (query) url.searchParams.set('search', query);
  if (status) url.searchParams.set('status', status);
  if (minScore > 0) url.searchParams.set('minScore', minScore);
  if (location) url.searchParams.set('location', location);
  if (datePosted) url.searchParams.set('datePosted', datePosted);

  try {
    const res = await fetch(url);
    currentJobs = await res.json();
    renderJobs(currentJobs);
  } catch (err) {
    jobsTableBody.innerHTML = `
      <tr>
        <td colspan="5" class="px-6 py-6 text-center text-red-500">
          Failed to load jobs.
        </td>
      </tr>
    `;
  }
}

function formatTimeAgo(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return 'Just now';
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return '1d ago';
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths}mo ago`;
}

function renderJobs(jobs) {
  if (jobs.length === 0) {
    jobsTableBody.innerHTML = `
      <tr>
        <td colspan="5" class="px-6 py-8 text-center text-slate-400">
          No jobs found matching your filters. Click "Run Discovery Scan" to find new postings!
        </td>
      </tr>
    `;
    return;
  }

  jobsTableBody.innerHTML = jobs.map(job => {
    const score = job.match_score || 0;
    let badgeClass = 'badge-low';
    if (score >= 70) badgeClass = 'badge-high';
    else if (score >= 40) badgeClass = 'badge-mid';

    let statusBadge = 'bg-slate-100 text-slate-600';
    if (job.status === 'APPLIED') statusBadge = 'bg-emerald-100 text-emerald-700';
    else if (job.status === 'QUEUED') statusBadge = 'bg-amber-100 text-amber-700';
    else if (job.status === 'FAILED') statusBadge = 'bg-rose-100 text-rose-700';

    return `
      <tr class="hover:bg-slate-50/80 transition cursor-pointer" onclick="openJobModal('${job.id}')">
        <td class="px-6 py-4">
          <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${badgeClass}">
            ${score}% Match
          </span>
        </td>
        <td class="px-6 py-4">
          <div class="font-semibold text-slate-800">${escapeHtml(job.title)}</div>
          <div class="text-xs text-slate-500 flex items-center space-x-2 mt-0.5">
            <span><i class="fa-regular fa-building text-slate-400"></i> ${escapeHtml(job.company)}</span>
            <span>&bull;</span>
            <span><i class="fa-solid fa-location-dot text-slate-400"></i> ${escapeHtml(job.location || 'Remote')}</span>
            ${(job.posted_at || job.created_at) ? `
              <span>&bull;</span>
              <span class="inline-flex items-center text-indigo-600 font-medium">
                <i class="fa-regular fa-clock text-indigo-400 mr-1"></i> ${formatTimeAgo(job.posted_at || job.created_at)}
              </span>
            ` : ''}
          </div>
        </td>
        <td class="px-6 py-4">
          <span class="inline-block px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs font-medium">
            ${escapeHtml(job.platform || job.source)}
          </span>
        </td>
        <td class="px-6 py-4">
          <span class="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${statusBadge}">
            ${job.status}
          </span>
        </td>
        <td class="px-6 py-4 text-right" onclick="event.stopPropagation()">
          <div class="flex items-center justify-end space-x-2">
            <button onclick="handleApply('${job.id}', 'copilot')" class="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-medium transition shadow-sm" title="Fill form & pause for your review">
              Copilot
            </button>
            <button onclick="handleApply('${job.id}', 'auto')" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium transition shadow-sm" title="Fully automated submission">
              Auto
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Modal View
window.openJobModal = async function(jobId) {
  const job = currentJobs.find(j => j.id === jobId);
  if (!job) return;

  activeModalJob = job;
  modalTitle.innerText = job.title;
  modalCompany.innerText = `${job.company} • ${job.location || 'Remote'} • Source: ${job.source}${job.posted_at ? ' • Posted: ' + formatTimeAgo(job.posted_at) : ''}`;
  
  const score = job.match_score || 0;
  modalScore.innerText = `${score}% Match`;
  modalScore.className = `inline-block px-2.5 py-0.5 rounded-full text-xs font-bold mb-2 ${score >= 70 ? 'badge-high' : score >= 40 ? 'badge-mid' : 'badge-low'}`;

  // Reasons
  let reasons = [];
  try {
    reasons = JSON.parse(job.match_reasons || '[]');
  } catch (e) {
    reasons = [job.match_reasons];
  }
  modalReasons.innerHTML = reasons.length > 0 
    ? reasons.map(r => `<div class="flex items-center space-x-2"><i class="fa-solid fa-check text-emerald-500 text-xs"></i><span>${escapeHtml(r)}</span></div>`).join('')
    : '<p class="text-slate-400">No specific match reasons recorded.</p>';

  modalLink.href = job.url;
  modalCoverLetter.innerText = 'Generating tailored cover letter preview...';
  jobModal.classList.remove('hidden');

  try {
    const res = await fetch(`/api/cover-letter/${job.id}`);
    const data = await res.json();
    modalCoverLetter.innerText = data.letter || 'Could not generate cover letter.';
  } catch (e) {
    modalCoverLetter.innerText = 'Error loading cover letter.';
  }
};

// Apply Actions
window.handleApply = async function(jobId, mode) {
  const job = currentJobs.find(j => j.id === jobId) || activeModalJob;
  const label = mode === 'copilot' ? 'Copilot (assisted review)' : 'Auto-Apply';
  
  if (!confirm(`Launch ${label} for "${job?.title || 'this job'}"? The browser will open to populate application details.`)) {
    return;
  }

  showToast(`Starting ${label}... Check the opened browser window.`);
  
  try {
    const res = await fetch(`/api/apply/${jobId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode })
    });
    const result = await res.json();

    if (result.success) {
      showToast(`Success: ${result.message}`);
    } else {
      showToast(`Finished: ${result.message || result.error || 'Check logs'}`);
    }

    loadStats();
    loadJobs();
    loadLogs();
  } catch (err) {
    showToast(`Error during application: ${err.message}`);
  }
};

// Batch Apply
async function handleBatchApply() {
  if (!confirm('Batch apply will queue the top 3 highest matching jobs and fill applications in Copilot mode. Proceed?')) {
    return;
  }

  showToast('Launching batch runner...');
  try {
    const res = await fetch('/api/batch-apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 3, mode: 'copilot', minScore: 50 })
    });
    const data = await res.json();
    showToast(`Batch completed: ${data.count || 0} jobs processed.`);
    loadStats();
    loadJobs();
    loadLogs();
  } catch (err) {
    showToast(`Batch apply error: ${err.message}`);
  }
}

// Discovery Scan
async function handleRunSearch() {
  btnRunSearch.disabled = true;
  btnRunSearch.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><span>Scanning Boards...</span>`;

  try {
    const res = await fetch('/api/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    const data = await res.json();
    const r = data.results || {};
    showToast(`Scan complete! Scanned ${r.totalScanned || 0} live postings: ${r.newJobs || 0} brand new, ${r.updatedJobs || 0} existing.`);
    loadStats();
    loadJobs();
    loadLogs();
  } catch (err) {
    showToast(`Search error: ${err.message}`);
  } finally {
    btnRunSearch.disabled = false;
    btnRunSearch.innerHTML = `<i class="fa-solid fa-bolt"></i><span>Run Discovery Scan</span>`;
  }
}

// Multi-Portal Fast Search
async function handlePortalSearch() {
  const kw = (portalKeywords?.value || '').trim();
  const loc = (portalLocation?.value || 'Bengaluru').trim();

  if (btnPortalSearch) {
    btnPortalSearch.disabled = true;
    btnPortalSearch.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><span>Searching All...</span>`;
  }

  // Immediately synchronize the filter toolbar inputs
  if (searchInput && kw) searchInput.value = kw;
  if (filterLocation && loc) filterLocation.value = loc;

  try {
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keywords: kw, location: loc })
    });
    const data = await res.json();
    const r = data.results || {};
    showToast(`Search Done: ${r.totalScanned || 0} jobs scanned (${r.newJobs || 0} new, ${r.updatedJobs || 0} updated).`);
    loadStats();
    loadJobs();
    loadLogs();
  } catch (err) {
    showToast(`Portal search error: ${err.message}`);
  } finally {
    if (btnPortalSearch) {
      btnPortalSearch.disabled = false;
      btnPortalSearch.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i><span>Search All</span>`;
    }
  }
}

// Resume Upload Handler
async function uploadResumeFile(file) {
  if (!file) return;

  showToast(`Uploading resume: ${file.name}...`);
  const reader = new FileReader();
  reader.onload = async () => {
    const base64Content = reader.result.split(',')[1];
    try {
      const res = await fetch('/api/upload-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          base64Content
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Resume uploaded: ${data.filename}`);
        if (quickResumeLabel) quickResumeLabel.innerText = data.filename;
        if (profResumeDisplay) profResumeDisplay.innerText = data.resumePath;
        if (resumeStatusBadge) {
          resumeStatusBadge.innerText = 'Uploaded';
          resumeStatusBadge.className = 'px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800';
        }
        loadProfile();
        loadLogs();
      } else {
        showToast(`Upload failed: ${data.error}`);
      }
    } catch (err) {
      showToast(`Upload error: ${err.message}`);
    }
  };
  reader.readAsDataURL(file);
}

// Auto-Extract Profile from Resume Handler
async function handleExtractResume() {
  const btn = document.getElementById('btn-extract-resume');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><span>Extracting...</span>`;
  }

  showToast('Extracting contact info, skills, and experience from resume...');
  try {
    const res = await fetch('/api/extract-profile-from-resume', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('Profile successfully extracted from resume!');
      loadProfile();
    } else {
      showToast('Failed to extract: ' + (data.error || 'Unknown error'));
    }
  } catch (err) {
    showToast('Extraction error: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles text-amber-300"></i><span>Auto-Extract Profile</span>`;
    }
  }
}

// Profile
async function loadProfile() {
  try {
    const res = await fetch('/api/profile');
    const prof = await res.json();

    const p = prof.personal || {};
    const pr = prof.preferences || {};
    const a = prof.answers || {};

    if (p.resumePath) {
      const filename = p.resumePath.split('/').pop().split('\\').pop();
      if (quickResumeLabel) quickResumeLabel.innerText = filename;
      if (profResumeDisplay) profResumeDisplay.innerText = p.resumePath;
    }

    document.getElementById('prof-firstName').value = p.firstName || '';
    document.getElementById('prof-lastName').value = p.lastName || '';
    document.getElementById('prof-email').value = p.email || '';
    document.getElementById('prof-phone').value = p.phone || '';
    document.getElementById('prof-linkedin').value = p.linkedin || '';
    document.getElementById('prof-github').value = p.github || '';

    document.getElementById('prof-targetTitles').value = (pr.targetTitles || []).join(', ');
    document.getElementById('prof-skills').value = (pr.skills || []).join(', ');
    document.getElementById('prof-yoe').value = pr.yearsOfExperience || 3;
    document.getElementById('prof-salary').value = pr.minSalary || 90000;

    document.getElementById('prof-descExperience').value = a.describeExperience || '';
    document.getElementById('prof-whyCompany').value = a.whyCompany || '';
  } catch (err) {
    console.error('Failed to load profile:', err);
  }
}

async function handleSaveProfile(e) {
  e.preventDefault();
  const profileData = {
    personal: {
      firstName: document.getElementById('prof-firstName').value,
      lastName: document.getElementById('prof-lastName').value,
      email: document.getElementById('prof-email').value,
      phone: document.getElementById('prof-phone').value,
      linkedin: document.getElementById('prof-linkedin').value,
      github: document.getElementById('prof-github').value,
      resumePath: 'data/sample_resume.pdf'
    },
    workAuthorization: {
      authorizedInUS: 'yes',
      requireSponsorship: 'no'
    },
    preferences: {
      targetTitles: document.getElementById('prof-targetTitles').value.split(',').map(s => s.trim()).filter(Boolean),
      skills: document.getElementById('prof-skills').value.split(',').map(s => s.trim()).filter(Boolean),
      yearsOfExperience: parseInt(document.getElementById('prof-yoe').value || '3', 10),
      minSalary: parseInt(document.getElementById('prof-salary').value || '90000', 10),
      targetLocations: ['Remote', 'United States'],
      blacklistCompanies: ['SpamCorp'],
      blacklistKeywords: ['Clearance Required', 'TS/SCI']
    },
    answers: {
      describeExperience: document.getElementById('prof-descExperience').value,
      whyCompany: document.getElementById('prof-whyCompany').value,
      gender: 'Decline to identify',
      veteran: 'Not a veteran',
      disability: 'Decline to self-identify'
    }
  };

  try {
    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profileData)
    });
    if (res.ok) {
      showToast('Profile configuration saved successfully!');
    }
  } catch (err) {
    showToast(`Error saving profile: ${err.message}`);
  }
}

// Logs
async function loadLogs() {
  try {
    const res = await fetch('/api/logs?limit=40');
    const logs = await res.json();
    if (logs.length === 0) {
      logsContainer.innerHTML = '<p class="text-slate-500">No activity logs recorded yet.</p>';
      return;
    }

    logsContainer.innerHTML = logs.map(l => {
      let color = 'text-slate-300';
      if (l.level === 'WARN') color = 'text-amber-400';
      if (l.level === 'ERROR') color = 'text-rose-400';
      return `<div class="${color}"><span class="text-slate-500">[${new Date(l.created_at).toLocaleTimeString()}]</span> <span class="font-bold">${l.level}</span>: ${escapeHtml(l.message)}</div>`;
    }).join('');
  } catch (err) {
    console.error('Failed to load logs:', err);
  }
}

// Utilities
function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'fixed bottom-5 right-5 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-xl text-sm z-50 transition transform';
  toast.innerText = msg;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

function debounce(fn, ms) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
