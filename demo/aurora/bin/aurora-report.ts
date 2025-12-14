#!/usr/bin/env ts-node
import fs from 'fs';
import path from 'path';

interface GovernanceLog {
  actions?: Array<Record<string, any>>;
  thermostat?: Array<Record<string, string>>;
}

const net =
  process.env.NETWORK ||
  (process.env.CHAIN_ID === '31337' ? 'localhost' : 'localhost');
const scope = process.env.AURORA_REPORT_SCOPE || 'aurora';
const reportTitle =
  process.env.AURORA_REPORT_TITLE ||
  (scope === 'aurora'
    ? 'Project AURORA — Mission Report'
    : `Mission Report — ${scope
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())}`);

const outDir = path.join('reports', net, scope, 'receipts');
const reportFileName =
  scope === 'aurora' ? 'aurora-report.md' : `${scope}-report.md`;
const mdFile = path.join('reports', net, scope, reportFileName);

function load(relativePath: string) {
  const p = path.join(outDir, relativePath);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

function section(title: string): string {
  return '\n## ' + title + '\n';
}

function renderKeyValues(record: Record<string, string>): string {
  return Object.entries(record)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ');
}

(async () => {
  fs.mkdirSync(path.dirname(mdFile), { recursive: true });

  const parts: string[] = [];
  parts.push(`# ${reportTitle}`);
  parts.push('');

  const mission = load('mission.json');
  const deploy = load('deploy.json');
  const stake = load('stake.json');
  const governance = load('governance.json') as GovernanceLog | null;

  if (mission) {
    parts.push(section('Mission Summary'));
    if (mission.description) {
      parts.push(String(mission.description));
    }
    const summaryLines: string[] = [];
    if (mission.scope) summaryLines.push('Scope: ' + mission.scope);
    if (mission.version) summaryLines.push('Version: ' + mission.version);
    if (Array.isArray(mission.jobs) && mission.jobs.length > 0) {
      summaryLines.push('Jobs executed: ' + mission.jobs.length);
    }
    if (summaryLines.length > 0) {
      parts.push('- ' + summaryLines.join('\n- '));
    }
  }

  if (deploy?.contracts && Object.keys(deploy.contracts).length > 0) {
    parts.push(section('Deployment Summary'));
    parts.push('| Module | Address |');
    parts.push('| --- | --- |');
    for (const [name, address] of Object.entries(
      deploy.contracts as Record<string, string>
    )) {
      parts.push('| ' + name + ' | `' + address + '` |');
    }
  }

  const missionJobs: Array<Record<string, any>> =
    mission && Array.isArray(mission.jobs) ? mission.jobs : [];

  if (missionJobs.length === 0) {
    const post = load('postJob.json');
    const submit = load('submit.json');
    const validate = load('validate.json');
    const finalize = load('finalize.json');

    if (post) {
      parts.push(section('Job Creation'));
      parts.push('- **Job ID**: ' + (post.jobId || 'n/a'));
      if (post.txHash) parts.push('- **Transaction**: `' + post.txHash + '`');
      if (post.reward) parts.push('- **Reward**: ' + post.reward);
      if (post.deadline) parts.push('- **Deadline**: ' + post.deadline);
      if (post.specHash) parts.push('- **Spec hash**: `' + post.specHash + '`');
      if (post.specUri) parts.push('- **Spec URI**: ' + post.specUri);
    }

    if (submit) {
      parts.push(section('Job Submission'));
      if (submit.worker) parts.push('- **Worker**: `' + submit.worker + '`');
      if (submit.txHash)
        parts.push('- **Submission tx**: `' + submit.txHash + '`');
      if (submit.resultURI)
        parts.push('- **Result URI**: ' + submit.resultURI);
    }

    if (validate) {
      parts.push(section('Validation Phase'));
      if (validate.validators && Array.isArray(validate.validators)) {
        parts.push('- **Validators**:');
        for (const validator of validate.validators as Array<
          Record<string, unknown>
        >) {
          parts.push(
            `  - ${validator.address}: commit \`${validator.commitTx}\`, reveal \`${validator.revealTx}\``
          );
        }
      }
      if (validate.finalizeTx) {
        parts.push('- Finalize tx: `' + validate.finalizeTx + '`');
      }
    }

    if (finalize?.payouts && Object.keys(finalize.payouts).length > 0) {
      parts.push(section('Payouts'));
      for (const [address, payout] of Object.entries(
        finalize.payouts as Record<string, any>
      )) {
        parts.push(
          `- ${address}: ${payout.before} → ${payout.after} (Δ ${payout.delta})`
        );
      }
    }
  } else {
    for (const job of missionJobs) {
      const jobName = typeof job.name === 'string' ? job.name : 'Mission Job';
      const jobSlug =
        typeof job.slug === 'string'
          ? job.slug
          : jobName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

      parts.push(section(`Job — ${jobName}`));
      if (job.notes) {
        parts.push('*' + String(job.notes) + '*');
      }

      const post = job.receipts?.post
        ? load(job.receipts.post)
        : load(path.join('jobs', jobSlug, 'post.json'));
      if (post) {
        parts.push('- **Job ID**: ' + (post.jobId || 'n/a'));
        if (post.txHash) parts.push('- **Transaction**: `' + post.txHash + '`');
        if (post.reward) parts.push('- **Reward**: ' + post.reward);
        if (post.deadline) parts.push('- **Deadline**: ' + post.deadline);
        if (post.specHash) parts.push('- **Spec hash**: `' + post.specHash + '`');
        if (post.specUri) parts.push('- **Spec URI**: ' + post.specUri);
      }

      const submit = job.receipts?.submit
        ? load(job.receipts.submit)
        : load(path.join('jobs', jobSlug, 'submit.json'));
      if (submit) {
        if (submit.worker) parts.push('- **Worker**: `' + submit.worker + '`');
        if (submit.txHash)
          parts.push('- **Submission tx**: `' + submit.txHash + '`');
        if (submit.resultURI)
          parts.push('- **Result URI**: ' + submit.resultURI);
      }

      const validate = job.receipts?.validate
        ? load(job.receipts.validate)
        : load(path.join('jobs', jobSlug, 'validate.json'));
      if (validate?.validators && Array.isArray(validate.validators)) {
        parts.push('- **Validators**:');
        for (const validator of validate.validators as Array<Record<string, unknown>>) {
          parts.push(
            `  - ${validator.address}: commit \`${validator.commitTx}\`, reveal \`${validator.revealTx}\``
          );
        }
        if (validate.finalizeTx) {
          parts.push('- Finalize tx: `' + validate.finalizeTx + '`');
        }
      }

      const finalize = job.receipts?.finalize
        ? load(job.receipts.finalize)
        : load(path.join('jobs', jobSlug, 'finalize.json'));
      if (finalize?.payouts && Object.keys(finalize.payouts).length > 0) {
        parts.push('- **Payouts**:');
        for (const [address, payout] of Object.entries(
          finalize.payouts as Record<string, any>
        )) {
          parts.push(
            `  - ${address}: ${payout.before} → ${payout.after} (Δ ${payout.delta})`
          );
        }
      }
    }
  }

  if (stake?.entries && Array.isArray(stake.entries)) {
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

  if (governance?.thermostat && governance.thermostat.length > 0) {
    parts.push(section('Thermostat Tuning'));
    for (const update of governance.thermostat) {
      const tx = update.txHash ? ` (tx: \`${update.txHash}\`)` : '';
      parts.push(
        `- ${update.action}: ${update.before} → ${update.after}${tx}`
      );
    }
  }

  if (governance?.actions && governance.actions.length > 0) {
    parts.push(section('Governance & Controls'));
    for (const action of governance.actions) {
      const header =
        '- **' +
        action.target +
        '.' +
        action.method +
        '** (' +
        action.type +
        ') — tx `' +
        action.txHash +
        '`';
      parts.push(header);
      if (action.notes) {
        parts.push('  - Notes: ' + action.notes);
      }
      if (action.params) {
        parts.push('  - Params: ' + JSON.stringify(action.params));
      }
      if (action.before) {
        parts.push(
          '  - Before: ' +
            renderKeyValues(action.before as Record<string, string>)
        );
      }
      if (action.after) {
        parts.push(
          '  - After: ' +
            renderKeyValues(action.after as Record<string, string>)
        );
      }
    }
  }

  fs.writeFileSync(mdFile, parts.join('\n') + '\n');
  console.log('Wrote ' + mdFile);
})();
