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
const state = load('state.json');
const governance = load('governance.json');
const thermostat = load('thermostat.json');

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
    parts.push('| Role | Address | Amount | Balance (before → after) | Tx |');
    parts.push('| --- | --- | --- | --- | --- |');
    for (const entry of stake.entries as Array<Record<string, unknown>>) {
      const before = entry.balanceBefore ?? 'n/a';
      const after = entry.balanceAfter ?? 'n/a';
      parts.push(
        `| ${entry.role} | \`${entry.address}\` | ${entry.amount} | ${before} → ${after} | \`${entry.txHash}\` |`
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

  if (state && state.timeline) {
    parts.push(section('Lifecycle States'));
    parts.push('| Step | State | Success | Reward | Stake | Deadline | Assigned |');
    parts.push('| --- | --- | --- | --- | --- | --- | --- |');
    for (const entry of state.timeline as Array<Record<string, unknown>>) {
      parts.push(`| ${entry.step} | ${entry.state} | ${entry.success} | ${entry.reward} | ${entry.stake} | ${entry.deadline} | ${entry.assignedAt} |`);
    }
  }

  if (governance && governance.actions) {
    parts.push(section('Governance Controls'));
    parts.push('| Target | Method | Tx | Notes |');
    parts.push('| --- | --- | --- | --- |');
    for (const action of governance.actions as Array<Record<string, unknown>>) {
      const args = Array.isArray(action.args) && action.args.length
        ? ` (${action.args.join(', ')})`
        : '';
      const notes = Array.isArray(action.notes)
        ? action.notes.join('<br/>')
        : action.notes || '';
      parts.push(
        `| ${action.target} | ${action.method}${args} | \`${action.txHash}\` | ${notes} |`
      );
    }
  }

  if (thermostat) {
    parts.push(section('Thermostat (updateThermodynamics.ts)'));
    if (thermostat.command) {
      parts.push(`- Command: \`${thermostat.command}\``);
    }
    if (thermostat.exitCode !== undefined) {
      parts.push(`- Exit code: ${thermostat.exitCode}`);
    }
    if (thermostat.success !== undefined) {
      parts.push(`- Success: ${thermostat.success}`);
    }
    if (thermostat.stdout) {
      parts.push('- Stdout:\n```\n' + thermostat.stdout + '\n```');
    }
    if (thermostat.stderr) {
      parts.push('- Stderr:\n```\n' + thermostat.stderr + '\n```');
    }
    if (thermostat.error) {
      parts.push(`- Error: ${thermostat.error}`);
    }
  }

  fs.writeFileSync(mdFile, parts.join('\n') + '\n');
  console.log('Wrote ' + mdFile);
})();
