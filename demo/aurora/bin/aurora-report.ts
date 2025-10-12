#!/usr/bin/env ts-node
import fs from 'fs';
import path from 'path';

const networkFromEnv = process.env.AGI_DEMO_NETWORK || process.env.NETWORK;
const net = networkFromEnv && networkFromEnv.length > 0 ? networkFromEnv : 'localhost';
const outDir = path.join('reports', net, 'aurora', 'receipts');
const mdFile = path.join('reports', net, 'aurora', 'aurora-report.md');

function load(name: string) {
  const p = path.join(outDir, name);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

function line(s = '') {
  return `${s}\n`;
}

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

  if (deploy) parts.push(line(`- **Deployment manifest**: ${deploy.manifest ?? 'n/a'}`));
  if (post) parts.push(line(`- **JobCreated**: id=${post.jobId}, tx=\`${post.txHash ?? 'n/a'}\``));
  if (submit) parts.push(line(`- **JobSubmitted**: worker=${submit.worker ?? 'unknown'}, tx=\`${submit.txHash ?? 'n/a'}\``));
  if (validate)
    parts.push(
      line(
        `- **Validation**: commitTx=\`${validate.commitTx ?? 'n/a'}\`, revealTx=\`${validate.revealTx ?? 'n/a'}\`, finalizeTx=\`${validate.finalizeTx ?? 'n/a'}\``,
      ),
    );
  if (finalize)
    parts.push(
      line(
        `- **Payouts**: ${finalize.payouts ? JSON.stringify(finalize.payouts) : 'n/a'} (tx=\`${finalize.txHash ?? 'n/a'}\`)`,
      ),
    );

  fs.writeFileSync(mdFile, parts.join('\n'));
  console.log(`Wrote ${mdFile}`);
})();
