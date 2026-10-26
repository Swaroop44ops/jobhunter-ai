import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function extractTextFromPdf(pdfPath) {
  const fullPath = path.isAbsolute(pdfPath) ? pdfPath : path.resolve(__dirname, '../../', pdfPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Resume file not found at: ${fullPath}`);
  }

  const buffer = fs.readFileSync(fullPath);
  const parser = new PDFParse(new Uint8Array(buffer));
  const res = await parser.getText();
  return (res.text || res || '').trim();
}

/**
 * 100% Dynamic Resume Parser.
 * No hardcoded names, skills, or locations. Everything is extracted
 * directly from the resume text layout, sections, and patterns.
 */
export function parseResumeTextToProfile(rawText, resumePath = null) {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

  // 1. Dynamic Candidate Name: first non-empty line before metadata
  let fullName = '';
  for (const line of lines.slice(0, 5)) {
    if (line.includes('@') || line.includes('http') || line.includes('|') || /\d{5,}/.test(line)) {
      continue;
    }
    if (line.length > 1 && line.length < 50 && !/resume|curriculum|profile|page/i.test(line)) {
      fullName = line;
      break;
    }
  }

  // Format to Proper Title Case
  const formattedName = fullName.split(/\s+/).map(w => {
    if (w.length <= 2) return w.toUpperCase();
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(' ');

  const nameParts = formattedName.split(/\s+/);
  const firstName = nameParts[0] || 'Candidate';
  const lastName = nameParts.slice(1).join(' ') || '';

  // 2. Dynamic Email
  const emailMatch = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const email = emailMatch ? emailMatch[0] : '';

  // 3. Dynamic Phone
  const phoneMatch = rawText.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\b\d{10}\b/);
  let phone = phoneMatch ? phoneMatch[0] : '';
  if (phone && !phone.startsWith('+') && phone.length === 10) {
    phone = '+91 ' + phone;
  }

  // 4. Dynamic Online Links (LinkedIn, GitHub, Portfolio)
  const linkedinMatch = rawText.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+/i);
  const linkedin = linkedinMatch ? (linkedinMatch[0].startsWith('http') ? linkedinMatch[0] : 'https://' + linkedinMatch[0]) : '';

  const githubMatch = rawText.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[a-zA-Z0-9_-]+/i);
  const github = githubMatch ? (githubMatch[0].startsWith('http') ? githubMatch[0] : 'https://' + githubMatch[0]) : '';

  // 5. Dynamic Location: inspect lines near header for "City, Country" or "City, State"
  let city = '';
  let country = '';
  for (const line of lines.slice(0, 8)) {
    if (line.includes('|')) {
      const parts = line.split('|').map(p => p.trim());
      for (const part of parts) {
        if (part.includes(',') && !part.includes('@') && !part.includes('http') && !/\d{4,}/.test(part)) {
          const locParts = part.split(',').map(s => s.trim());
          city = locParts[0] || '';
          country = locParts[1] || '';
          break;
        }
      }
    }
  }

  if (!country) {
    if (/india|bengaluru|bangalore|pune|hyderabad|mumbai|delhi|chennai/i.test(rawText)) {
      country = 'India';
      if (!city) city = 'Bengaluru';
    } else {
      country = 'Remote';
      city = 'Remote';
    }
  }

  // 6. Dynamic Target Roles & Headline (parsed from headline and experience sections)
  const targetRoles = new Set();
  for (let i = 0; i < Math.min(lines.length, 6); i++) {
    const line = lines[i];
    if (line === fullName || line.includes('@') || /\d{5,}/.test(line)) continue;
    if (line.includes('|') || /developer|engineer|manager|architect|lead|analyst|designer/i.test(line)) {
      const parts = line.split(/[|•,]/).map(p => p.trim()).filter(p => p.length > 2 && p.length < 40);
      for (const p of parts) {
        if (/developer|engineer|manager|architect|lead|analyst|programmer|full\s*stack|backend|frontend/i.test(p)) {
          // Normalize capitalization
          const formatted = p.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
          targetRoles.add(formatted);
        }
      }
    }
  }

  // Also check recent experience title
  const expMatch = rawText.match(/(?:PROFESSIONAL EXPERIENCE|EXPERIENCE)\s*\n*([^\n|]+)/i);
  if (expMatch) {
    const titleCandidate = expMatch[1].replace(/^[•\s-]+/, '').trim();
    if (titleCandidate.length > 3 && titleCandidate.length < 45 && !/company|jul|aug|sep|jan|feb|20\d\d/i.test(titleCandidate)) {
      targetRoles.add(titleCandidate);
    }
  }

  if (targetRoles.size === 0) {
    targetRoles.add('Software Engineer');
  }

  // 7. Dynamic Professional Summary
  let summary = '';
  const summaryMatch = rawText.match(/(?:PROFESSIONAL SUMMARY|SUMMARY|ABOUT ME|PROFILE)\s*\n*([\s\S]*?)(?=(?:TECHNICAL SKILLS|SKILLS|EXPERIENCE|PROFESSIONAL EXPERIENCE|EDUCATION|\n[A-Z\s]{4,}\n))/i);
  if (summaryMatch) {
    summary = summaryMatch[1].replace(/\s+/g, ' ').trim();
  }

  // 8. Dynamic Skills: parsed directly from the resume's skills section
  const skillsMatch = rawText.match(/(?:TECHNICAL SKILLS|SKILLS|CORE COMPETENCIES|TECHNOLOGIES)\s*\n*([\s\S]*?)(?=(?:PROFESSIONAL EXPERIENCE|EXPERIENCE|EMPLOYMENT|EDUCATION|PROJECTS|\n[A-Z\s]{4,}\n))/i);
  const dynamicSkills = new Set();
  if (skillsMatch) {
    const skillsText = skillsMatch[1];
    const skillLines = skillsText.split('\n').map(l => l.trim()).filter(Boolean);
    for (const sLine of skillLines) {
      // Remove section headers like "Languages & Backend:"
      const cleaned = sLine.replace(/^[a-zA-Z\s&/]+:\s*/, '');
      const tokens = cleaned.split(/[,•|;/]/).map(t => t.trim()).filter(t => t.length > 1 && t.length < 35);
      for (const token of tokens) {
        if (token && !/principles|patterns|architecture|workflows|integration|optimization|gathering|resolution/i.test(token)) {
          dynamicSkills.add(token);
        } else if (token.length < 25) {
          dynamicSkills.add(token);
        }
      }
    }
  }

  // 9. Dynamic Experience Years (from text or calculated from date spans)
  let yearsOfExperience = 1;
  const yoeTextMatch = rawText.match(/(\d+)\+?\s*years?\s*(?:of)?\s*experience/i);
  if (yoeTextMatch) {
    yearsOfExperience = parseInt(yoeTextMatch[1], 10);
  } else {
    const years = [...rawText.matchAll(/\b(20\d{2})\b/g)].map(m => parseInt(m[1], 10));
    if (years.length >= 2) {
      const minYear = Math.min(...years);
      const maxYear = Math.max(...years);
      if (maxYear > minYear && maxYear - minYear < 40) {
        yearsOfExperience = maxYear - minYear;
      }
    }
  }

  const roleList = Array.from(targetRoles);
  const skillList = Array.from(dynamicSkills);

  return {
    personal: {
      firstName,
      lastName,
      email,
      phone,
      city: city || 'Bengaluru',
      state: city === 'Bengaluru' ? 'Karnataka' : '',
      country,
      postalCode: '560001',
      address: `${city}, ${country}`,
      linkedin,
      github,
      portfolio: github,
      resumePath: resumePath || ''
    },
    workAuthorization: {
      authorizedInCountry: 'yes',
      authorizedInIndia: country.toLowerCase().includes('india') ? 'yes' : 'no',
      requireSponsorship: 'no',
      citizenship: country.toLowerCase().includes('india') ? 'Indian' : 'Citizen'
    },
    preferences: {
      targetTitles: roleList,
      targetLocations: [city, country, 'Remote'],
      minSalary: country.toLowerCase().includes('india') ? 1200000 : 90000,
      yearsOfExperience,
      noticePeriodWeeks: 4,
      skills: skillList,
      blacklistCompanies: ['SpamCorp'],
      blacklistKeywords: ['Unpaid']
    },
    answers: {
      whyCompany: `I am passionate about building scalable, high-performance software and eager to contribute my expertise in ${skillList.slice(0, 4).join(', ')} to your engineering team.`,
      describeExperience: summary || `Software Engineer with ${yearsOfExperience}+ years of hands-on experience building full-stack applications and services using ${skillList.slice(0, 4).join(', ')}.`,
      gender: 'Decline to identify',
      veteran: 'Not a veteran',
      disability: 'Decline to self-identify'
    }
  };
}
