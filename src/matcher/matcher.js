import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function loadProfile() {
  const profilePath = path.resolve(__dirname, '../../config/profile.json');
  if (fs.existsSync(profilePath)) {
    try {
      return JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    } catch (e) {
      console.error('Error parsing profile.json:', e);
    }
  }
  const examplePath = path.resolve(__dirname, '../../config/profile.example.json');
  return JSON.parse(fs.readFileSync(examplePath, 'utf8'));
}

export function hasSkill(text, skill) {
  if (!text || !skill) return false;
  const s = skill.toLowerCase().trim();
  const t = text.toLowerCase();

  // Smart special-case for .NET / C#
  if (s === '.net' || s === 'dotnet' || s === '.net core' || s === 'asp.net') {
    return t.includes('.net') || t.includes('dotnet') || t.includes('c#') || t.includes('asp.net');
  }
  if (s === 'c#' || s === 'csharp') {
    return t.includes('c#') || t.includes('csharp') || t.includes('.net');
  }
  if (s === 'c++') {
    return t.includes('c++');
  }

  // General alphanumeric word boundary
  const escaped = s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const regex = new RegExp(`\\b${escaped}\\b`, 'i');
  return regex.test(text);
}

export function evaluateJobFit(job, profile = null, customKeywords = []) {
  if (!profile) {
    profile = loadProfile();
  }

  const reasons = [];
  let score = 0;

  const title = (job.title || '').toLowerCase();
  const description = (job.description || '').toLowerCase();
  const company = (job.company || '').toLowerCase();
  const location = (job.location || '').toLowerCase();

  const prefs = profile.preferences || {};
  const blacklistCompanies = (prefs.blacklistCompanies || []).map(c => c.toLowerCase());
  const blacklistKeywords = (prefs.blacklistKeywords || []).map(k => k.toLowerCase());
  
  // Combine profile target titles with any active search query
  const targetTitles = [
    ...(customKeywords || []),
    ...(prefs.targetTitles || [])
  ].map(t => t.toLowerCase());

  const targetLocations = (prefs.targetLocations || []).map(l => l.toLowerCase());
  const skills = [
    ...(customKeywords || []),
    ...(prefs.skills || [])
  ];

  // 1. Check Blacklist
  for (const bComp of blacklistCompanies) {
    if (bComp && company.includes(bComp)) {
      return {
        score: 0,
        reasons: [`Blacklisted company: ${job.company}`],
        isBlacklisted: true
      };
    }
  }

  for (const bWord of blacklistKeywords) {
    if (bWord && (title.includes(bWord) || description.includes(bWord))) {
      return {
        score: 0,
        reasons: [`Blacklisted keyword found: ${bWord}`],
        isBlacklisted: true
      };
    }
  }

  // 2. Title Relevance (Up to 45 points)
  let titleMatchFound = false;
  for (const tTitle of targetTitles) {
    if (hasSkill(title, tTitle) || title.includes(tTitle)) {
      score += 45;
      reasons.push(`Title matches target: "${job.title}"`);
      titleMatchFound = true;
      break;
    }
  }

  if (!titleMatchFound) {
    // Partial word overlap
    const titleWords = title.split(/\s+/).filter(w => w.length > 2);
    const targetWords = new Set(targetTitles.flatMap(t => t.split(/\s+/).filter(w => w.length > 2)));
    const overlap = titleWords.filter(w => targetWords.has(w));
    if (overlap.length > 0) {
      score += 25;
      reasons.push(`Partial title match: ${overlap.join(', ')}`);
    } else {
      score += 10;
    }
  }

  // 3. Skill Overlap (Up to 40 points)
  const matchedSkills = [];
  const checkedSkills = new Set();
  for (const skill of skills) {
    const sLower = skill.toLowerCase();
    if (checkedSkills.has(sLower)) continue;
    checkedSkills.add(sLower);

    if (hasSkill(description, skill) || hasSkill(title, skill)) {
      matchedSkills.push(skill);
    }
  }

  if (skills.length > 0) {
    const skillRatio = matchedSkills.length / Math.min(skills.length, 6);
    const skillPoints = Math.round(Math.min(40, skillRatio * 40));
    score += skillPoints;
    if (matchedSkills.length > 0) {
      reasons.push(`Skills matched: ${matchedSkills.slice(0, 6).join(', ')}`);
    }
  }

  // 4. Location / Remote Check (Up to 15 points)
  const isIndiaTarget = targetLocations.some(l => l.includes('india') || l.includes('bengaluru') || l.includes('bangalore'));
  const isJobInIndia = location.includes('india') || location.includes('bengaluru') || location.includes('bangalore') || location.includes('pune') || location.includes('hyderabad') || location.includes('mumbai') || location.includes('delhi');
  const isJobRemote = location.includes('remote') || description.includes('remote') || title.includes('remote');

  if (isIndiaTarget && isJobInIndia) {
    score += 15;
    reasons.push(`Target location: ${job.location}`);
  } else if (isJobRemote) {
    score += 10;
    reasons.push('Remote friendly');
  } else if (targetLocations.some(l => location.includes(l))) {
    score += 10;
    reasons.push(`Location matched: ${job.location}`);
  } else {
    // Non-matching on-site foreign location (e.g. USA, UK, Czechia)
    score = Math.max(0, score - 30);
    reasons.push(`Location outside target: ${job.location}`);
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    reasons,
    isBlacklisted: false,
    matchedSkills
  };
}
