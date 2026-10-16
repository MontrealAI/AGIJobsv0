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

function transactionHash(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^0x[0-9a-fA-F]{64}$/.test(value) &&
    !/^0x0{64}$/.test(value)
  );
}

// The runner writes uint256 IDs as decimal strings. Accept safe JSON integers
// as an equivalent representation without coercing other JSON types.
function canonicalJobId(value: unknown): string | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  }
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) return null;
  return BigInt(value) <= (1n << 256n) - 1n ? value : null;
}

function validationFinalization(validate: any): string {
  const label = '- Validation finalization tx (ValidationModule.finalize): ';
  return transactionHash(validate?.finalizeTx)
    ? label + '`' + validate.finalizeTx + '`'
    : label + 'unavailable (missing or invalid validate.json.finalizeTx).';
}

function settlementSummary(
  finalize: any,
  validate: any,
  expectedJobIds: unknown[],
  placeholder: boolean
): { lines: string[]; usable: boolean } {
  const label = '- Settlement tx (JobRegistry.finalize): ';
  const unavailable = (reason: string) => ({
    lines: [label + 'unavailable (' + reason + ').'],
    usable: false,
  });
  if (placeholder || finalize?.evidenceClass === 'placeholder') {
    return unavailable('placeholder fixture; no settlement executed');
  }
  if (!transactionHash(finalize?.txHash)) {
    return unavailable('missing or invalid finalize.json.txHash');
  }
  if (
    transactionHash(validate?.finalizeTx) &&
    finalize.txHash.toLowerCase() === validate.finalizeTx.toLowerCase()
  ) {
    return unavailable('conflicts with validation finalization tx');
  }
  const finalJobId = canonicalJobId(finalize.jobId);
  if (finalJobId === null) {
    return unavailable('missing or invalid finalize.json.jobId');
  }
  const jobIds = expectedJobIds
    .filter((value) => value !== undefined)
    .map(canonicalJobId);
  if (jobIds.some((jobId) => jobId === null)) {
    return unavailable(
      'invalid job ID in mission, creation, or validation summary'
    );
  }
  if (jobIds.length === 0) {
    return unavailable('no job ID to compare');
  }
  if (jobIds.some((jobId) => jobId !== finalJobId)) {
    return unavailable('finalize.json.jobId does not match this job');
  }
  return { lines: [label + '`' + finalize.txHash + '`'], usable: true };
}

function recordedPayouts(payouts: unknown): {
  lines: string[];
  malformed: boolean;
} {
  if (payouts == null) return { lines: [], malformed: false };
  if (typeof payouts !== 'object' || Array.isArray(payouts)) {
    return { lines: [], malformed: true };
  }
  const lines: string[] = [];
  let malformed = false;
  for (const [address, payout] of Object.entries(payouts)) {
    if (
      !payout ||
      !['before', 'after', 'delta'].every(
        (key) =>
          typeof payout[key] === 'string' &&
          /^-?\d+(?:\.\d+)?$/.test(payout[key])
      )
    ) {
      malformed = true;
      continue;
    }
    lines.push(
      `${address}: ${payout.before} → ${payout.after} (Δ ${payout.delta})`
    );
  }
  return { lines, malformed };
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
  const placeholder =
    mission?.evidenceClass === 'placeholder' ||
    deploy?.evidenceClass === 'placeholder';
  if (placeholder) {
    parts.push(
      '**PLACEHOLDER FIXTURE — no on-chain work or settlement was executed.**'
    );
  }
  parts.push(
    'Evidence scope: this report renders saved receipt summaries; it does not independently verify transaction execution, settlement, or payouts.'
  );
  if (net === 'localhost' || String(deploy?.chainId) === '31337') {
    parts.push(
      'Local demo scope: disposable-chain transactions, mock tokens, and fixture identities/work. Transaction hashes are shown without public explorer links.'
    );
  }
  parts.push(
    'Result-hash scope: the AURORA runner hashes the result URI string, including placeholder URIs; it does not fetch or verify the referenced artifact content.'
  );

  if (mission) {
    parts.push(section('Mission Summary'));
    if (mission.description) {
      parts.push(String(mission.description));
    }
    const summaryLines: string[] = [];
    if (mission.scope) summaryLines.push('Scope: ' + mission.scope);
    if (mission.version) summaryLines.push('Version: ' + mission.version);
    if (Array.isArray(mission.jobs) && mission.jobs.length > 0) {
      summaryLines.push(
        (placeholder ? 'Configured fixture jobs: ' : 'Jobs executed: ') +
          mission.jobs.length
      );
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
      if (submit.resultURI) parts.push('- **Result URI**: ' + submit.resultURI);
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
    }
    parts.push(validationFinalization(validate));
    parts.push(section('Settlement'));
    const settlement = settlementSummary(
      finalize,
      validate,
      [post?.jobId, validate?.jobId],
      placeholder
    );
    parts.push(...settlement.lines);
    if (settlement.usable) {
      const payouts = recordedPayouts(finalize.payouts);
      if (payouts.lines.length > 0) {
        parts.push(section('Payouts'));
        parts.push(...payouts.lines.map((line) => '- ' + line));
      }
      if (payouts.malformed) {
        parts.push(
          '- Payout data: unavailable for malformed balance-change entries.'
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
        if (post.specHash)
          parts.push('- **Spec hash**: `' + post.specHash + '`');
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
        for (const validator of validate.validators as Array<
          Record<string, unknown>
        >) {
          parts.push(
            `  - ${validator.address}: commit \`${validator.commitTx}\`, reveal \`${validator.revealTx}\``
          );
        }
      }
      parts.push(validationFinalization(validate));

      const finalize = job.receipts?.finalize
        ? load(job.receipts.finalize)
        : load(path.join('jobs', jobSlug, 'finalize.json'));
      const settlement = settlementSummary(
        finalize,
        validate,
        [job.jobId, post?.jobId, validate?.jobId],
        placeholder
      );
      parts.push(...settlement.lines);
      if (settlement.usable) {
        const payouts = recordedPayouts(finalize.payouts);
        if (payouts.lines.length > 0) {
          parts.push('- **Payouts**:');
          parts.push(...payouts.lines.map((line) => '  - ' + line));
        }
        if (payouts.malformed) {
          parts.push(
            '- Payout data: unavailable for malformed balance-change entries.'
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
      parts.push(`- ${update.action}: ${update.before} → ${update.after}${tx}`);
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
