#!/usr/bin/env ts-node
import fs from 'fs';
import path from 'path';

type GovernanceLog = {
  actions?: Array<Record<string, any>>;
  thermostat?: Array<Record<string, string>>;
};

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

  const deploy = load('deploy.json');
  const stake = load('stake.json');
  const governance = load('governance.json');
  const mission = load('mission.json');
  const missionJobs: Array<Record<string, any>> =
    mission && Array.isArray(mission.jobs) ? mission.jobs : [];

  if (mission) {
    parts.push(section('Mission Summary'));
    if (mission.description) {
      parts.push(String(mission.description));
    }
    const summaryLines: string[] = [];
    if (mission.scope) {
      summaryLines.push('Scope: ' + mission.scope);
    }
    if (mission.version) {
      summaryLines.push('Version: ' + mission.version);
    }
    if (missionJobs.length > 0) {
      summaryLines.push('Jobs executed: ' + missionJobs.length);
    }
    if (summaryLines.length > 0) {
      parts.push('- ' + summaryLines.join('\n- '));
    }
  }
  const governance = load('governance.json') as GovernanceLog | null;

  if (deploy && deploy.contracts) {
    parts.push(section('Deployment Summary'));
    parts.push('| Module | Address |');
    parts.push('| --- | --- |');
    for (const [name, address] of Object.entries(
      deploy.contracts as Record<string, string>
    )) {
      parts.push('| ' + name + ' | `' + address + '` |');
    }
  }

  const fallbackPost = missionJobs.length === 0 ? load('postJob.json') : null;
  const fallbackSubmit = missionJobs.length === 0 ? load('submit.json') : null;
  const fallbackValidate =
    missionJobs.length === 0 ? load('validate.json') : null;
  const fallbackFinalize =
    missionJobs.length === 0 ? load('finalize.json') : null;

  if (missionJobs.length === 0 && fallbackPost) {
    parts.push(section('Job Creation'));
    parts.push('- **Job ID**: ' + fallbackPost.jobId);
    if (fallbackPost.txHash)
      parts.push('- **Transaction**: `' + fallbackPost.txHash + '`');
    if (fallbackPost.reward) parts.push('- **Reward**: ' + fallbackPost.reward);
    if (fallbackPost.deadline)
      parts.push('- **Deadline**: ' + fallbackPost.deadline);
    if (fallbackPost.specHash)
      parts.push('- **Spec hash**: `' + fallbackPost.specHash + '`');
  if (post) {
    parts.push(section('Job Creation'));
    parts.push('- **Job ID**: ' + post.jobId);
    if (post.txHash) parts.push('- **Transaction**: `' + post.txHash + '`');
    if (post.reward) parts.push('- **Reward**: ' + post.reward);
    if (post.deadline) parts.push('- **Deadline**: ' + post.deadline);
    if (post.specHash) parts.push('- **Spec hash**: `' + post.specHash + '`');
    if (post.specUri) parts.push('- **Spec URI**: ' + post.specUri);
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

  if (missionJobs.length === 0 && fallbackSubmit) {
    parts.push(section('Submission'));
    parts.push('- **Worker**: `' + fallbackSubmit.worker + '`');
    if (fallbackSubmit.txHash)
      parts.push('- **Transaction**: `' + fallbackSubmit.txHash + '`');
    if (fallbackSubmit.resultURI)
      parts.push('- **Result URI**: ' + fallbackSubmit.resultURI);
  }

  if (
    missionJobs.length === 0 &&
    fallbackValidate &&
    fallbackValidate.validators
  ) {
    parts.push(section('Validation'));
    for (const validator of fallbackValidate.validators as Array<
      Record<string, unknown>
    >) {
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
    if (fallbackValidate.finalizeTx) {
      parts.push('- Finalize tx: `' + fallbackValidate.finalizeTx + '`');
    }
  }

  if (
    missionJobs.length === 0 &&
    fallbackFinalize &&
    fallbackFinalize.payouts
  ) {
    parts.push(section('Payouts'));
    for (const [address, payout] of Object.entries(
      fallbackFinalize.payouts as Record<string, any>
    )) {
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

  if (missionJobs.length > 0) {
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
        parts.push('- **Job ID**: ' + post.jobId);
        if (post.txHash) parts.push('- **Transaction**: `' + post.txHash + '`');
        if (post.reward) parts.push('- **Reward**: ' + post.reward);
        if (post.deadline) parts.push('- **Deadline**: ' + post.deadline);
        if (post.specHash)
          parts.push('- **Spec hash**: `' + post.specHash + '`');
      }

      const submit = job.receipts?.submit
        ? load(job.receipts.submit)
        : load(path.join('jobs', jobSlug, 'submit.json'));
      if (submit) {
        parts.push('- **Worker**: `' + submit.worker + '`');
        if (submit.txHash)
          parts.push('- **Submission tx**: `' + submit.txHash + '`');
        if (submit.resultURI)
          parts.push('- **Result URI**: ' + submit.resultURI);
      }

      const validate = job.receipts?.validate
        ? load(job.receipts.validate)
        : load(path.join('jobs', jobSlug, 'validate.json'));
      if (validate && validate.validators) {
        parts.push('- **Validators**:');
        for (const validator of validate.validators as Array<
          Record<string, unknown>
        >) {
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
      if (finalize && finalize.payouts) {
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

  if (governance && governance.thermostat) {
    const updates = governance.thermostat as Array<Record<string, string>>;
    if (updates.length > 0) {
      parts.push(section('Governance Tuning'));
      for (const update of updates) {
        const tx = update.txHash ? ` (tx: \`${update.txHash}\`)` : '';
        parts.push(
          `- ${update.action}: ${update.before} → ${update.after}${tx}`
        );
      }
    }
  }
  if (governance && Array.isArray(governance.actions)) {
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
          '  - Before: ' + renderKeyValues(action.before as Record<string, string>)
        );
      }
      if (action.after) {
        parts.push(
          '  - After: ' +
            renderKeyValues(action.after as Record<string, string>)
          '  - After: ' + renderKeyValues(action.after as Record<string, string>)
        );
      }
    }
  }

  fs.writeFileSync(mdFile, parts.join('\n') + '\n');
  console.log('Wrote ' + mdFile);
})();
