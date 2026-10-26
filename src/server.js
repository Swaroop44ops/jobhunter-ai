import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import { JobRepository } from './db/database.js';
import { runJobDiscovery } from './scrapers/aggregator.js';
import { processJobApplication } from './automation/engine.js';
import { loadProfile } from './matcher/matcher.js';
import { generateCoverLetter } from './ai/advisor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.resolve(__dirname, '../public')));
app.use('/data/screenshots', express.static(path.resolve(__dirname, '../data/screenshots')));
app.use('/data/resumes', express.static(path.resolve(__dirname, '../data/resumes')));

// Ensure resumes folder exists
const RESUMES_DIR = path.resolve(__dirname, '../data/resumes');
if (!fs.existsSync(RESUMES_DIR)) {
  fs.mkdirSync(RESUMES_DIR, { recursive: true });
}

// Stats
app.get('/api/stats', (req, res) => {
  try {
    const stats = JobRepository.getStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Jobs list with filters
app.get('/api/jobs', (req, res) => {
  try {
    const { status, minScore, search, location, datePosted, limit } = req.query;
    const jobs = JobRepository.getAllJobs({
      status: status || undefined,
      minScore: minScore ? parseInt(minScore, 10) : undefined,
      location: location || undefined,
      search: search || undefined,
      datePosted: datePosted || undefined,
      limit: limit ? parseInt(limit, 10) : 100
    });
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Resume upload endpoint
app.post('/api/upload-resume', async (req, res) => {
  try {
    const { filename, base64Content } = req.body;
    if (!filename || !base64Content) {
      return res.status(400).json({ error: 'Filename and base64Content are required' });
    }

    const cleanFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const targetPath = path.join(RESUMES_DIR, cleanFilename);
    const buffer = Buffer.from(base64Content, 'base64');
    fs.writeFileSync(targetPath, buffer);

    const relPath = `data/resumes/${cleanFilename}`;
    let profile = loadProfile();

    // Auto-extract profile data if it is a PDF
    if (cleanFilename.toLowerCase().endsWith('.pdf')) {
      try {
        const { extractTextFromPdf, parseResumeTextToProfile } = await import('./ai/resume_parser.js');
        const text = await extractTextFromPdf(targetPath);
        const parsedProfile = parseResumeTextToProfile(text, relPath);
        profile = {
          ...parsedProfile,
          personal: {
            ...parsedProfile.personal,
            resumePath: relPath
          }
        };
      } catch (parseErr) {
        console.warn('Could not auto-parse resume:', parseErr.message);
        profile.personal = profile.personal || {};
        profile.personal.resumePath = relPath;
      }
    } else {
      profile.personal = profile.personal || {};
      profile.personal.resumePath = relPath;
    }

    const profilePath = path.resolve(__dirname, '../config/profile.json');
    fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2), 'utf8');

    JobRepository.log(null, 'INFO', `Resume uploaded & auto-extracted profile: ${cleanFilename}`);

    res.json({
      success: true,
      filename: cleanFilename,
      resumePath: relPath,
      profile,
      sizeBytes: buffer.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Auto-extract profile from current active resume
app.post('/api/extract-profile-from-resume', async (req, res) => {
  try {
    const profile = loadProfile();
    const resumePath = profile.personal?.resumePath || 'data/resumes/Swaroop_HG_FullStack.pdf';
    const { extractTextFromPdf, parseResumeTextToProfile } = await import('./ai/resume_parser.js');
    const text = await extractTextFromPdf(resumePath);
    const parsed = parseResumeTextToProfile(text, resumePath);

    const profilePath = path.resolve(__dirname, '../config/profile.json');
    fs.writeFileSync(profilePath, JSON.stringify(parsed, null, 2), 'utf8');

    JobRepository.log(null, 'INFO', `Profile re-extracted from resume: ${resumePath}`);
    res.json({ success: true, profile: parsed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Single job details
app.get('/api/jobs/:id', (req, res) => {
  try {
    const job = JobRepository.getJobById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update job status manually
app.post('/api/jobs/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    JobRepository.updateJobStatus(req.params.id, status);
    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trigger search & discovery across all portals
app.post('/api/search', async (req, res) => {
  try {
    const { keywords, location } = req.body;
    const results = await runJobDiscovery({ keywords, location });
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Apply to a job (Copilot or Auto)
app.post('/api/apply/:id', async (req, res) => {
  try {
    const job = JobRepository.getJobById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const mode = req.body.mode || 'copilot'; // 'copilot' or 'auto'
    const result = await processJobApplication(job, { mode, keepOpen: mode === 'copilot' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Batch apply to top matches
app.post('/api/batch-apply', async (req, res) => {
  try {
    const limit = parseInt(req.body.limit || '3', 10);
    const mode = req.body.mode || 'copilot';
    const minScore = parseInt(req.body.minScore || '60', 10);

    const candidates = JobRepository.getAllJobs({
      status: 'DISCOVERED',
      minScore,
      limit
    });

    if (candidates.length === 0) {
      return res.json({ message: 'No eligible jobs found for batch apply.', applied: 0 });
    }

    // Process asynchronously or sequentially
    const results = [];
    for (const job of candidates) {
      const outcome = await processJobApplication(job, { mode, keepOpen: false });
      results.push({ id: job.id, title: job.title, company: job.company, outcome });
    }

    res.json({ success: true, count: results.length, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Profile management
app.get('/api/profile', (req, res) => {
  try {
    const profile = loadProfile();
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/profile', (req, res) => {
  try {
    const profilePath = path.resolve(__dirname, '../config/profile.json');
    fs.writeFileSync(profilePath, JSON.stringify(req.body, null, 2), 'utf8');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generate cover letter preview
app.get('/api/cover-letter/:id', async (req, res) => {
  try {
    const job = JobRepository.getJobById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    const profile = loadProfile();
    const letter = await generateCoverLetter(job, profile);
    res.json({ letter });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Logs
app.get('/api/logs', (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '50', 10);
    const logs = JobRepository.getRecentLogs(limit);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  const url = `http://localhost:${PORT}`;
  console.log(`================================================`);
  console.log(`🚀 JobHunter AI Server running on port ${PORT}`);
  console.log(`================================================`);

  // Auto-open browser if --open or -o flag is passed
  const shouldOpen = process.argv.includes('--open') || process.argv.includes('-o') || process.env.AUTO_OPEN === 'true';
  if (shouldOpen) {
    console.log(`🌐 Opening browser at ${url}...`);
    const startCmd = process.platform === 'win32'
      ? `start "" "${url}"`
      : process.platform === 'darwin'
      ? `open "${url}"`
      : `xdg-open "${url}"`;
    exec(startCmd, (err) => {
      if (err) console.warn('Could not automatically open browser:', err.message);
    });
  }
});
