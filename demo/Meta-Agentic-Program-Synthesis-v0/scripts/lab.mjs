import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { candidates, matches, candidate } from '../workbench/model.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bytes = fs.readFileSync(path.join(root, 'workbench/cases.json'));
const taskId = process.argv[2] || 'normalize';
const task = JSON.parse(bytes).cases.find((item) => item.id === taskId);
if (!task) throw new Error('Choose normalize, ledger or catalog.');
const digest = createHash('sha256').update(bytes).digest('hex');
let tested = 0;
for (const program of candidates()) {
  tested++;
  if (matches(task, program)) {
    console.log(
      JSON.stringify(candidate(task, program, tested, digest), null, 2)
    );
    break;
  }
}
