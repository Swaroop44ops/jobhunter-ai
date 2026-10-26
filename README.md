# JobHunter AI 🎯🤖
### Autonomous Job Discovery & Auto-Apply Copilot

An intelligent, multi-platform job discovery, resume matching, and automated application system powered by Playwright, Node.js, and SQLite.

---

## 🌟 Key Features

- **Multi-Source Job Aggregator**: Automatically aggregates opportunities from **RemoteOK**, **Jobicy**, **Greenhouse direct company boards** (GitLab, Figma, Discord, Reddit, Affirm, Stripe), and **LinkedIn public feeds**.
- **Fit Scoring & Skill Matching**: Scores postings from 0% to 100% based on title overlap, core skills, remote status, and automatically skips blacklisted companies and keywords.
- **Dual Application Modes**:
  - **Copilot / Assisted Mode (Recommended)**: Automatically navigates to the job, fills in personal info, answers custom form questions, uploads resume, and pauses at the final review screen for your 1-click confirmation.
  - **Full-Auto Mode**: Completely handles form filling and submission for standardized ATS applications (Greenhouse, Lever, etc.).
- **Smart Form Answering**: Fills work authorization, years of experience, salary requirements, demographic disclosures, and generates tailored cover letters. Optionally integrates with Gemini or OpenAI API for open-ended questions.
- **Persistent Browser Profile**: Keeps cookies and login sessions saved in `data/browser_profile/` so you only have to log in or solve 2FA/CAPTCHA once.
- **Modern Web Dashboard**: Real-time KPI counters, searchable table with fit score badges, candidate profile editor, and live bot execution logs.

---

## 🚀 Quick Start

### 1. Launch the Web Dashboard
```bash
npm start
```
Open your browser and navigate to:
```
http://localhost:3000
```

### 2. Configure Your Profile & Resume
- In the Web Dashboard, click the **Profile & Criteria** tab (or edit `config/profile.json` directly).
- Update your contact details, target roles, skills, and expected salary.
- Place your PDF resume at `data/sample_resume.pdf` (or update `resumePath` in your profile).

### 3. Run Job Discovery
Click **Run Discovery Scan** in the web dashboard header, or run from the command line:
```bash
npm run search
```

### 4. Review & Apply
- Click any job row to view the match breakdown and preview a tailored cover letter.
- Click **Copilot** to watch the browser fill out the application and wait for your review.
- Or click **Batch Apply Top Matches** to apply across your top matched listings.

---

## 💻 CLI Commands

```bash
# Scan and score jobs from all platforms
npm run search

# List top scored jobs in your terminal
node src/cli.js list

# Apply to a specific job by ID (in Copilot or Auto mode)
node src/cli.js apply <jobId> copilot
node src/cli.js apply <jobId> auto

# Run test suite
npm test
```

---

## 🛡️ Anti-Bot Safety & Best Practices

- Always test new platforms in **Copilot Mode** first to verify that your session and fields are correctly populated.
- For LinkedIn Easy Apply, keep human typing delays enabled and avoid applying to more than 25-30 jobs per day to maintain account health.
