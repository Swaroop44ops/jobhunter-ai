import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

async function readResume() {
  const dataBuffer = fs.readFileSync('data/resumes/Swaroop_HG_FullStack.pdf');
  const data = await pdf(dataBuffer);
  console.log('=== RESUME TEXT ===');
  console.log(data.text);
}

readResume().catch(console.error);
