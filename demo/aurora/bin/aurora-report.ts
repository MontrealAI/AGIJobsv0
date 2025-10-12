#!/usr/bin/env ts-node
import fs from 'fs';
import path from 'path';

const net = process.env.NETWORK || (process.env.CHAIN_ID === '31337' ? 'localhost' : 'localhost');
const outDir = path.join('reports', net, 'aurora', 'receipts');
const mdFile = path.join('reports', net, 'aurora', 'aurora-report.md');

function load(name: string) {
  const p = path.join(outDir, name);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

function section(title: string): string {
  return '\n## ' + title + '\n';
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
  const stake = load('stake.json');

  if (deploy && deploy.contracts) {
    parts.push(section('Deployment Summary'));
    parts.push('| Module | Address |');
    parts.push('| --- | --- |');
    for (const [name, address] of Object.entries(deploy.contracts as Record<string, string>)) {
      parts.push('| ' + name + ' | `' + address + '` |');
    }
  }

  if (post) {
    parts.push(section('Job Creation'));
    parts.push('- **Job ID**: ' + post.jobId);
    if (post.txHash) parts.push('- **Transaction**: `' + post.txHash + '`');
    if (post.reward) parts.push('- **Reward**: ' + post.reward);
    if (post.deadline) parts.push('- **Deadline**: ' + post.deadline);
    if (post.specHash) parts.push('- **Spec hash**: `' + post.specHash + '`');
  }

  if (stake && stake.entries) {
    parts.push(section('Stake Operations'));
    for (const entry of stake.entries as Array<Record<string, unknown>>) {
      parts.push(
        '- ' +
          entry.role +
          ' `' +
          entry.address +
          '` staked ' +
          entry.amount +
          ' (tx: `' +
          entry.txHash +
          '`)'
      );
    }
  }

  if (submit) {
    parts.push(section('Submission'));
    parts.push('- **Worker**: `' + submit.worker + '`');
    if (submit.txHash) parts.push('- **Transaction**: `' + submit.txHash + '`');
    if (submit.resultURI) parts.push('- **Result URI**: ' + submit.resultURI);
  }

  if (validate && validate.validators) {
    parts.push(section('Validation'));
    for (const validator of validate.validators as Array<Record<string, unknown>>) {
      parts.push(
        '- Validator `' +
          validator.address +
          '` commit: `' +
          validator.commitTx +
          '`, reveal: `' +
          validator.revealTx +
          '`'
      );
    }
    if (validate.finalizeTx) {
      parts.push('- Finalize tx: `' + validate.finalizeTx + '`');
    }
  }

  if (finalize && finalize.payouts) {
    parts.push(section('Payouts'));
    for (const [address, payout] of Object.entries(finalize.payouts as Record<string, any>)) {
      parts.push(
        '- ' +
          address +
          ': balance ' +
          payout.before +
          ' → ' +
          payout.after +
          ' (delta ' +
          payout.delta +
          ')'
      );
    }
  }

  fs.writeFileSync(mdFile, parts.join('\n') + '\n');
  console.log('Wrote ' + mdFile);
})();
