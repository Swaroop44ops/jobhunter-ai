import dotenv from 'dotenv';
dotenv.config();

/**
 * Intelligent question answering and cover letter generator.
 * Uses Gemini or OpenAI API if configured, otherwise falls back to
 * smart context-aware template heuristic engine.
 */
export async function answerQuestion(questionText, context = {}, profile = {}) {
  const qLower = (questionText || '').toLowerCase();
  const answers = profile.answers || {};
  const workAuth = profile.workAuthorization || {};
  const prefs = profile.preferences || {};
  const personal = profile.personal || {};

  // 1. Check for standard Work Authorization questions
  if (qLower.includes('authorized') || qLower.includes('legally authorized') || qLower.includes('right to work') || qLower.includes('eligib')) {
    return 'Yes';
  }
  if (qLower.includes('sponsorship') || qLower.includes('require visa') || qLower.includes('require sponsorship') || qLower.includes('need sponsorship')) {
    return workAuth.requireSponsorship === 'yes' ? 'Yes' : 'No';
  }
  if (qLower.includes('citizen') || qLower.includes('nationality')) {
    return workAuth.citizenship || 'Indian';
  }

  // 2. CTC, Salary & Compensation questions (India & Global)
  if (qLower.includes('current ctc') || qLower.includes('current salary') || qLower.includes('current compensation') || qLower.includes('present ctc')) {
    return answers.currentCTC || String(prefs.currentSalary || '8,00,000');
  }
  if (qLower.includes('expected ctc') || qLower.includes('expected salary') || qLower.includes('expected compensation') || qLower.includes('salary expectation')) {
    return answers.expectedCTC || String(prefs.minSalary || '12,00,000');
  }
  if (qLower.includes('ctc') || qLower.includes('salary') || qLower.includes('compensation') || qLower.includes('expected pay')) {
    return answers.expectedCTC || String(prefs.minSalary || '12,00,000');
  }

  // 3. Notice period & Availability
  if (qLower.includes('notice period') || qLower.includes('serving notice') || qLower.includes('how soon') || qLower.includes('start date') || qLower.includes('availability') || qLower.includes('joining time')) {
    return answers.noticePeriod || `${prefs.noticePeriodWeeks || 4} weeks (30 days)`;
  }

  // 4. Location, Relocation & Work Mode
  if (qLower.includes('relocate') || qLower.includes('relocation') || qLower.includes('hybrid') || qLower.includes('on-site') || qLower.includes('work from office') || qLower.includes('willing to travel')) {
    return 'Yes';
  }
  if (qLower.includes('current location') || qLower.includes('current city') || qLower.includes('where are you currently based')) {
    return personal.city || 'Bengaluru';
  }
  if (qLower.includes('preferred location')) {
    return (prefs.targetLocations && prefs.targetLocations[0]) || 'Bengaluru';
  }

  // 5. Experience / Numerical questions
  if (qLower.includes('years of experience') || qLower.includes('how many years') || qLower.includes('total experience') || qLower.includes('relevant experience')) {
    for (const skill of (prefs.skills || [])) {
      if (qLower.includes(skill.toLowerCase())) {
        return String(prefs.yearsOfExperience || 3);
      }
    }
    return String(prefs.yearsOfExperience || 3);
  }

  // 6. Current Company & Role
  if (qLower.includes('current company') || qLower.includes('current employer') || qLower.includes('present company')) {
    return answers.currentCompany || 'Software Solutions';
  }
  if (qLower.includes('current designation') || qLower.includes('current role') || qLower.includes('current title') || qLower.includes('present role')) {
    return answers.currentRole || '.NET Developer';
  }

  // 7. Education & Qualifications
  if (qLower.includes('highest qualification') || qLower.includes('degree') || qLower.includes('education')) {
    return answers.highestDegree || 'Bachelor of Engineering (B.E.) / B.Tech';
  }

  // 8. Equal Opportunity / Demographics
  if (qLower.includes('gender')) return answers.gender || 'Male';
  if (qLower.includes('veteran')) return answers.veteran || 'Not a veteran';
  if (qLower.includes('disability')) return answers.disability || 'No';

  // 5. Check if an LLM is configured (e.g. GEMINI_API_KEY)
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const prompt = `You are filling out a job application on behalf of ${personal.firstName} ${personal.lastName}.
Candidate profile:
Skills: ${(prefs.skills || []).join(', ')}
Years of experience: ${prefs.yearsOfExperience}
Applying for: ${context.jobTitle || 'Software Engineer'} at ${context.company || 'the company'}.
Application Question: "${questionText}"

Provide a concise, professional, first-person answer (1 to 3 sentences maximum):`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });

      if (response.ok) {
        const data = await response.json();
        const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (candidateText) {
          return candidateText.trim();
        }
      }
    } catch (err) {
      console.warn('Gemini API call failed, falling back to heuristics:', err.message);
    }
  }

  // 6. Context-aware fallback for open-ended questions
  if (qLower.includes('why') && (qLower.includes('company') || qLower.includes('us') || qLower.includes('role'))) {
    return answers.whyCompany || `I am excited by ${context.company || 'your team'}'s engineering excellence and looking forward to contributing my full-stack skills to build great products.`;
  }

  if (qLower.includes('describe') || qLower.includes('summary') || qLower.includes('background')) {
    return answers.describeExperience || `Software developer with ${prefs.yearsOfExperience || 3}+ years of hands-on experience building web applications, APIs, and scalable distributed systems using ${(prefs.skills || []).slice(0, 4).join(', ')}.`;
  }

  return 'Available upon request during the interview process.';
}

export async function generateCoverLetter(job, profile) {
  const personal = profile.personal || {};
  const prefs = profile.preferences || {};
  const skills = (prefs.skills || []).slice(0, 5).join(', ');

  const letter = `Dear Hiring Team at ${job.company},

I am writing to express my strong interest in the ${job.title} position. With my background in software engineering and hands-on expertise in ${skills}, I am confident in my ability to make an immediate, positive impact on your projects.

Throughout my career, I have focused on delivering clean, testable code and architecting scalable web applications. The opportunity to contribute to ${job.company}'s mission and collaborate with your talented team is extremely appealing to me.

Thank you for your time and consideration. I welcome the opportunity to discuss how my technical skills and experience align with your team's goals.

Sincerely,
${personal.firstName} ${personal.lastName}
${personal.email} | ${personal.phone}
${personal.portfolio || personal.linkedin || ''}
`;

  return letter;
}
