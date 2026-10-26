import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');

async function testDynamicParser() {
  const buf = fs.readFileSync('data/resumes/Swaroop_HG_FullStack.pdf');
  const parser = new PDFParse(new Uint8Array(buf));
  const res = await parser.getText();
  const rawText = res.text || res || '';

  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

  // 1. Dynamic Name: first non-empty line that does not look like metadata
  let fullName = '';
  for (const line of lines.slice(0, 5)) {
    if (line.includes('@') || line.includes('http') || line.includes('|') || /\d{5,}/.test(line)) {
      continue;
    }
    if (line.length > 2 && line.length < 50 && !/resume|curriculum|profile/i.test(line)) {
      fullName = line;
      break;
    }
  }

  // Convert ALL CAPS to Proper Case
  const formattedName = fullName.split(/\s+/).map(w => {
    if (w.length <= 2) return w.toUpperCase();
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(' ');

  const nameParts = formattedName.split(/\s+/);
  const firstName = nameParts[0] || 'Candidate';
  const lastName = nameParts.slice(1).join(' ') || '';

  // 2. Dynamic Headline / Target Roles: lines right after name containing titles or separators
  const targetRoles = [];
  for (let i = 0; i < Math.min(lines.length, 6); i++) {
    const line = lines[i];
    if (line === fullName || line.includes('@') || /\d{5,}/.test(line)) continue;
    if (line.includes('|') || /developer|engineer|manager|architect|lead|analyst|designer/i.test(line)) {
      const parts = line.split(/[|•,]/).map(p => p.trim()).filter(p => p.length > 2 && p.length < 40);
      for (const p of parts) {
        if (/developer|engineer|manager|architect|lead|analyst|programmer|full\s*stack|backend|frontend/i.test(p)) {
          targetRoles.push(p);
        }
      }
    }
  }

  // 3. Dynamic Email
  const emailMatch = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const email = emailMatch ? emailMatch[0] : '';

  // 4. Dynamic Phone
  const phoneMatch = rawText.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\b\d{10}\b/);
  const phone = phoneMatch ? phoneMatch[0] : '';

  // 5. Dynamic Links
  const linkedinMatch = rawText.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+/i);
  const linkedin = linkedinMatch ? (linkedinMatch[0].startsWith('http') ? linkedinMatch[0] : 'https://' + linkedinMatch[0]) : '';

  const githubMatch = rawText.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[a-zA-Z0-9_-]+/i);
  const github = githubMatch ? (githubMatch[0].startsWith('http') ? githubMatch[0] : 'https://' + githubMatch[0]) : '';

  // 6. Dynamic Location: inspect lines near email/phone for "City, Country" or "City, State"
  let location = '';
  for (const line of lines.slice(0, 8)) {
    if (line.includes('|')) {
      const parts = line.split('|').map(p => p.trim());
      for (const part of parts) {
        if (part.includes(',') && !part.includes('@') && !part.includes('http') && !/\d{4,}/.test(part)) {
          location = part;
          break;
        }
      }
    }
  }

  // 7. Dynamic Summary
  let summary = '';
  const summaryMatch = rawText.match(/(?:PROFESSIONAL SUMMARY|SUMMARY|ABOUT ME|PROFILE)\s*\n*([\s\S]*?)(?=(?:TECHNICAL SKILLS|SKILLS|EXPERIENCE|PROFESSIONAL EXPERIENCE|EDUCATION|\n[A-Z\s]{4,}\n))/i);
  if (summaryMatch) {
    summary = summaryMatch[1].replace(/\s+/g, ' ').trim();
  }

  // 8. Dynamic Skills: extract directly from the SKILLS section without any hardcoded dictionary
  const skillsMatch = rawText.match(/(?:TECHNICAL SKILLS|SKILLS|CORE COMPETENCIES|TECHNOLOGIES)\s*\n*([\s\S]*?)(?=(?:PROFESSIONAL EXPERIENCE|EXPERIENCE|EMPLOYMENT|EDUCATION|PROJECTS|\n[A-Z\s]{4,}\n))/i);
  const extractedSkills = new Set();
  if (skillsMatch) {
    const skillsText = skillsMatch[1];
    // Split lines
    const skillLines = skillsText.split('\n').map(l => l.trim()).filter(Boolean);
    for (const sLine of skillLines) {
      // Remove prefixes like "Languages & Backend:", "Frontend:", etc.
      const cleaned = sLine.replace(/^[a-zA-Z\s&]+:\s*/, '');
      // Split by commas, bullets, pipes
      const tokens = cleaned.split(/[,•|;]/).map(t => t.trim()).filter(t => t.length > 1 && t.length < 35);
      for (const token of tokens) {
        // Exclude generic phrases
        if (!/principles|patterns|architecture|workflows|integration|optimization/i.test(token)) {
          extractedSkills.add(token);
        } else if (token.length < 25) {
          extractedSkills.add(token);
        }
      }
    }
  }

  // 9. Dynamic Experience Calculation (from date patterns like Jul 2023 - Sep 2026 or "X years")
  let yoe = 1;
  const yoeTextMatch = rawText.match(/(\d+)\+?\s*years?\s*(?:of)?\s*experience/i);
  if (yoeTextMatch) {
    yoe = parseInt(yoeTextMatch[1], 10);
  } else {
    // Count years from date occurrences
    const years = [...rawText.matchAll(/\b(20\d{2})\b/g)].map(m => parseInt(m[1], 10));
    if (years.length >= 2) {
      const minYear = Math.min(...years);
      const maxYear = Math.max(...years);
      if (maxYear > minYear && maxYear - minYear < 40) {
        yoe = maxYear - minYear;
      }
    }
  }

  console.log('--- DYNAMICALLY EXTRACTED DATA (ZERO HARDCODING) ---');
  console.log('Name:    ', firstName, lastName);
  console.log('Email:   ', email);
  console.log('Phone:   ', phone);
  console.log('Location:', location);
  console.log('LinkedIn:', linkedin);
  console.log('GitHub:  ', github);
  console.log('Roles:   ', targetRoles);
  console.log('YoE:     ', yoe);
  console.log('Summary: ', summary.slice(0, 100) + '...');
  console.log('Skills:  ', Array.from(extractedSkills).slice(0, 15));
}

testDynamicParser();
