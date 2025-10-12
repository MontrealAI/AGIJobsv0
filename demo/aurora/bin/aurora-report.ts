#!/usr/bin/env ts-node
import fs from 'fs';
import path from 'path';

const net = process.env.CHAIN_ID === '31337' ? 'localhost' : (process.env.NETWORK || 'localhost');
const outDir = path.join('reports', net, 'aurora', 'receipts');
const mdFile = path.join('reports', net, 'aurora', 'aurora-report.md');

function load(name: string) {
  const p = path.join(outDir, name);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

function line(s='') { return s + '\n'; }

(async () => {
  fs.mkdirSync(path.dirname(mdFile), { recursive: true });
  const parts: string[] = [];
  parts.push('# Project AURORA — Mission Report');
  parts.push('');
  const deploy = load('deploy.json');
  const post = load('postJob.json');
  const submit = load('submit.json');
  const validate = load('validate.json');
  const finalize = load('finalize.json');

  if (deploy) parts.push(line(`- **Deployed**: \`${deploy.txHash}\``));
  if (post) parts.push(line(`- **JobCreated**: id=${post.jobId}, tx=\`${post.txHash}\``));
  if (submit) parts.push(line(`- **JobSubmitted**: worker=${submit.worker}, tx=\`${submit.txHash}\``));
  if (validate) parts.push(line(`- **Validation**: commits=${validate.commits}, reveals=${validate.reveals}`));
  if (finalize) parts.push(line(`- **Finalized**: tx=\`${finalize.txHash}\`, payouts=${JSON.stringify(finalize.payouts)}`));

  fs.writeFileSync(mdFile, parts.join('\n'));
  console.log(`Wrote ${mdFile}`);
})();
