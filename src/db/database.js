import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '../../data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'jobs.db');
const db = new Database(DB_PATH);

// Enable WAL mode for high concurrency
db.pragma('journal_mode = WAL');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    location TEXT,
    url TEXT UNIQUE NOT NULL,
    description TEXT,
    salary TEXT,
    match_score INTEGER DEFAULT 0,
    match_reasons TEXT,
    status TEXT DEFAULT 'DISCOVERED',
    platform TEXT,
    posted_at TEXT,
    applied_at TEXT,
    created_at TEXT NOT NULL,
    error_message TEXT
  );

  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT,
    level TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Safe migration for posted_at column
try {
  db.exec('ALTER TABLE jobs ADD COLUMN posted_at TEXT');
} catch (e) {
  // Column already exists
}

export const JobRepository = {
  upsertJob(job) {
    const existing = db.prepare('SELECT id, status, created_at, posted_at FROM jobs WHERE url = ?').get(job.url);

    const stmt = db.prepare(`
      INSERT INTO jobs (
        id, source, title, company, location, url, description, salary, 
        match_score, match_reasons, status, platform, posted_at, created_at
      ) VALUES (
        @id, @source, @title, @company, @location, @url, @description, @salary,
        @match_score, @match_reasons, @status, @platform, @posted_at, @created_at
      )
      ON CONFLICT(url) DO UPDATE SET
        match_score = excluded.match_score,
        match_reasons = excluded.match_reasons,
        description = COALESCE(excluded.description, jobs.description),
        posted_at = COALESCE(excluded.posted_at, jobs.posted_at)
    `);

    stmt.run({
      id: job.id,
      source: job.source || 'Aggregator',
      title: job.title,
      company: job.company,
      location: job.location || 'Remote',
      url: job.url,
      description: job.description || '',
      salary: job.salary || null,
      match_score: job.match_score || 0,
      match_reasons: JSON.stringify(job.match_reasons || []),
      status: existing ? existing.status : (job.status || 'DISCOVERED'),
      platform: job.platform || 'General',
      posted_at: job.posted_at || (existing ? existing.posted_at : new Date().toISOString()),
      created_at: (existing && existing.created_at) ? existing.created_at : (job.created_at || new Date().toISOString())
    });

    return { isNew: !existing, existingStatus: existing?.status };
  },

  getAllJobs(filters = {}) {
    let sql = 'SELECT * FROM jobs WHERE 1=1';
    const params = [];

    if (filters.status) {
      sql += ' AND status = ?';
      params.push(filters.status);
    }
    if (filters.minScore) {
      sql += ' AND match_score >= ?';
      params.push(filters.minScore);
    }
    if (filters.location) {
      if (filters.location.toLowerCase() === 'remote') {
        sql += ' AND (location LIKE ? OR description LIKE ? OR title LIKE ?)';
        params.push('%remote%', '%remote%', '%remote%');
      } else {
        sql += ' AND location LIKE ?';
        params.push(`%${filters.location}%`);
      }
    }
    if (filters.datePosted) {
      const now = Date.now();
      let cutoff = null;
      if (filters.datePosted === '24h' || filters.datePosted === 'today') {
        cutoff = new Date(now - 24 * 60 * 60 * 1000).toISOString();
      } else if (filters.datePosted === '7d' || filters.datePosted === 'week') {
        cutoff = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
      } else if (filters.datePosted === '30d' || filters.datePosted === 'month') {
        cutoff = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
      }
      if (cutoff) {
        sql += ' AND COALESCE(posted_at, created_at) >= ?';
        params.push(cutoff);
      }
    }
    if (filters.search) {
      const s = filters.search.toLowerCase().trim();
      if (s === '.net' || s === 'dotnet') {
        sql += ' AND (title LIKE ? OR title LIKE ? OR title LIKE ? OR description LIKE ? OR description LIKE ? OR description LIKE ?)';
        params.push('%.net%', '%dotnet%', '%c#%', '%.net%', '%dotnet%', '%c#%');
      } else if (s === 'c#' || s === 'csharp') {
        sql += ' AND (title LIKE ? OR title LIKE ? OR description LIKE ? OR description LIKE ?)';
        params.push('%c#%', '%csharp%', '%c#%', '%csharp%');
      } else {
        sql += ' AND (title LIKE ? OR company LIKE ? OR description LIKE ?)';
        params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
      }
    }

    sql += ' ORDER BY match_score DESC, created_at DESC';
    if (filters.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
    }

    return db.prepare(sql).all(...params);
  },

  getJobById(id) {
    return db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
  },

  updateJobStatus(id, status, errorMessage = null) {
    const stmt = db.prepare(`
      UPDATE jobs 
      SET status = ?, 
          applied_at = CASE WHEN ? = 'APPLIED' THEN ? ELSE applied_at END,
          error_message = ?
      WHERE id = ?
    `);
    const now = new Date().toISOString();
    return stmt.run(status, status, now, errorMessage, id);
  },

  getStats() {
    const total = db.prepare('SELECT COUNT(*) as count FROM jobs').get().count;
    const applied = db.prepare("SELECT COUNT(*) as count FROM jobs WHERE status = 'APPLIED'").get().count;
    const queued = db.prepare("SELECT COUNT(*) as count FROM jobs WHERE status = 'QUEUED'").get().count;
    const highMatch = db.prepare('SELECT COUNT(*) as count FROM jobs WHERE match_score >= 70').get().count;

    return { total, applied, queued, highMatch };
  },

  log(jobId, level, message) {
    const stmt = db.prepare('INSERT INTO logs (job_id, level, message, created_at) VALUES (?, ?, ?, ?)');
    return stmt.run(jobId, level, message, new Date().toISOString());
  },

  getRecentLogs(limit = 50) {
    return db.prepare('SELECT * FROM logs ORDER BY id DESC LIMIT ?').all(limit);
  }
};

export default db;
