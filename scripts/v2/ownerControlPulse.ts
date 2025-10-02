import { promises as fs } from 'fs';
import path from 'path';
import {
  verifyOwnerControl,
  type ModuleCheck,
  type OwnerControlSummary,
} from './lib/ownerControlVerification';

type OutputFormat = 'human' | 'markdown' | 'json';

type Severity = 'pass' | 'warn' | 'fail' | 'info';

type PulseCliOptions = {
  format: OutputFormat;
  outPath?: string;
  configNetwork?: string;
  modules?: string[];
  skip?: string[];
  addressBookPath?: string;
  addressOverrides: Record<string, string>;
};

type HealthGrade = 'green' | 'amber' | 'red';

type PulseCheck = {
  key: string;
  label: string;
  status: ModuleCheck['status'];
  severity: Severity;
  address?: string;
  expected?: string;
  owner?: string;
  pending?: string | null;
  primaryNote?: string;
  notes: string[];
};

type PulseReport = {
  metadata: {
    chainId: bigint;
    networkName: string;
    hardhatNetwork: string;
    signer?: string | null;
    configPath: string;
    addressBookPath: string;
  };
  summary: OwnerControlSummary;
  healthScore: number;
  healthGrade: HealthGrade;
  healthNarrative: string[];
  checks: PulseCheck[];
  recommendations: string[];
};

type CliFlags = {
  formatSetByCli: boolean;
};

function parseBooleanEnv(value?: string | null): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const normalised = value.trim().toLowerCase();
  if (!normalised) {
    return undefined;
  }
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalised)) {
    return true;
  }
  if (['0', 'false', 'no', 'n', 'off'].includes(normalised)) {
    return false;
  }
  return undefined;
}

function parseList(value?: string): string[] | undefined {
  if (!value) {
    return undefined;
  }
  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return entries.length > 0 ? entries : undefined;
}

function parseOverridesEnv(value?: string | null): Record<string, string> | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (entries.length === 0) {
    return undefined;
  }
  const overrides: Record<string, string> = {};
  for (const entry of entries) {
    const [key, addr] = entry.split('=');
    if (!key || !addr) {
      throw new Error(
        `OWNER_PULSE_ADDRESS_OVERRIDES entries must be <module>=<address>; received "${entry}"`
      );
    }
    overrides[key.trim()] = addr.trim();
  }
  return overrides;
}

function parseArgs(argv: string[]): { options: PulseCliOptions; flags: CliFlags } {
  const options: PulseCliOptions = {
    format: 'human',
    addressOverrides: {},
  };
  const flags: CliFlags = { formatSetByCli: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--format': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error('--format requires a value');
        }
        const normalised = value.trim().toLowerCase();
        if (['human', 'text'].includes(normalised)) {
          options.format = 'human';
        } else if (['markdown', 'md'].includes(normalised)) {
          options.format = 'markdown';
        } else if (normalised === 'json') {
          options.format = 'json';
        } else {
          throw new Error(`Unknown format ${value}`);
        }
        flags.formatSetByCli = true;
        i += 1;
        break;
      }
      case '--json':
        options.format = 'json';
        flags.formatSetByCli = true;
        break;
      case '--markdown':
        options.format = 'markdown';
        flags.formatSetByCli = true;
        break;
      case '--out':
      case '--output': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error(`${arg} requires a path`);
        }
        options.outPath = value;
        i += 1;
        break;
      }
      case '--network':
      case '--config-network': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error(`${arg} requires a value`);
        }
        options.configNetwork = value;
        i += 1;
        break;
      }
      case '--modules':
      case '--include': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error(`${arg} requires a comma-separated list`);
        }
        options.modules = value
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean);
        i += 1;
        break;
      }
      case '--skip':
      case '--exclude': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error(`${arg} requires a comma-separated list`);
        }
        options.skip = value
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean);
        i += 1;
        break;
      }
      case '--address-book': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error('--address-book requires a file path');
        }
        options.addressBookPath = value;
        i += 1;
        break;
      }
      case '--address':
      case '--module-address': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error(`${arg} requires <module>=<address>`);
        }
        const [key, addr] = value.split('=');
        if (!key || !addr) {
          throw new Error(`${arg} expects <module>=<address>`);
        }
        options.addressOverrides[key.trim()] = addr.trim();
        i += 1;
        break;
      }
      case '--help':
      case '-h':
        console.log(`Usage: npx hardhat run --no-compile scripts/v2/ownerControlPulse.ts [options]

Options:
  --network <name>             Override configuration network key
  --modules <a,b>              Only include the listed modules
  --skip <a,b>                 Skip the listed modules
  --format <human|markdown|json>
  --json                       Shortcut for --format json
  --markdown                   Shortcut for --format markdown
  --out <path>                 Write output to file in addition to stdout
  --address-book <path>        Custom deployment address book
  --address <module=address>   Override module address for this run
  --help                       Show this message
`);
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { options, flags };
}

function statusSeverity(status: ModuleCheck['status']): Severity {
  switch (status) {
    case 'ok':
      return 'pass';
    case 'missing-address':
    case 'missing-expected':
      return 'warn';
    case 'skipped':
      return 'info';
    case 'mismatch':
    case 'error':
    default:
      return 'fail';
  }
}

function severityIcon(severity: Severity): string {
  switch (severity) {
    case 'pass':
      return '✅';
    case 'warn':
      return '⚠️';
    case 'fail':
      return '❌';
    case 'info':
    default:
      return '⏭️';
  }
}

function formatScore(score: number): string {
  return `${Math.round(score)} / 100`;
}

function computeHealth(summary: OwnerControlSummary, results: ModuleCheck[]): {
  score: number;
  grade: HealthGrade;
  narrative: string[];
} {
  const weights = {
    mismatch: 35,
    missingAddress: 30,
    missingExpected: 20,
    error: 45,
    skipped: 10,
  };

  const penalty =
    summary.mismatch * weights.mismatch +
    summary.missingAddress * weights.missingAddress +
    summary.missingExpected * weights.missingExpected +
    summary.error * weights.error +
    summary.skipped * weights.skipped;

  const score = Math.max(0, 100 - penalty);

  let grade: HealthGrade = 'green';
  if (score < 60) {
    grade = 'red';
  } else if (score < 85) {
    grade = 'amber';
  }

  const narrative: string[] = [];
  if (summary.mismatch > 0) {
    narrative.push(`${summary.mismatch} module(s) report on-chain owner mismatches.`);
  }
  if (summary.missingAddress > 0) {
    narrative.push(`${summary.missingAddress} module address entries missing.`);
  }
  if (summary.missingExpected > 0) {
    narrative.push(`${summary.missingExpected} module(s) missing expected owner in config.`);
  }
  if (summary.error > 0) {
    narrative.push(`${summary.error} module(s) returned on-chain access errors.`);
  }
  if (summary.skipped > 0) {
    narrative.push(`${summary.skipped} module(s) marked as skip in owner-control.json.`);
  }
  if (narrative.length === 0) {
    narrative.push('All modules align with expected governance plan.');
  }

  const flaggedPending = results.filter(
    (check) => check.pendingOwner && check.pendingOwner !== check.expectedOwner
  );
  if (flaggedPending.length > 0) {
    narrative.push(
      `${flaggedPending.length} module(s) have pending owners awaiting acceptOwnership.`
    );
  }

  return { score, grade, narrative };
}

function buildPulseChecks(results: ModuleCheck[]): PulseCheck[] {
  return results.map((result) => ({
    key: result.key,
    label: result.label,
    status: result.status,
    severity: statusSeverity(result.status),
    address: result.address,
    expected: result.expectedOwner,
    owner: result.currentOwner,
    pending: result.pendingOwner ?? null,
    primaryNote: result.notes[0],
    notes: result.notes,
  }));
}

function buildRecommendations(summary: OwnerControlSummary, results: ModuleCheck[]): string[] {
  const actions: string[] = [];
  if (summary.mismatch > 0) {
    actions.push('Queue ownership transfers or update owner-control.json for mismatched modules.');
  }
  if (summary.missingAddress > 0) {
    actions.push(
      'Populate module addresses via config/modules.<key>.address or docs/deployment-addresses.json.'
    );
  }
  if (summary.missingExpected > 0) {
    actions.push('Set ownerControl.owner/governance fields so every module has a target owner.');
  }
  if (summary.error > 0) {
    actions.push('Inspect ABI compatibility and RPC health for modules returning on-chain errors.');
  }
  const pending = results.filter((result) => result.pendingOwner);
  if (pending.length > 0) {
    actions.push(
      'Have the pending owners execute acceptOwnership to finalise governance rotations.'
    );
  }
  if (summary.skipped > 0) {
    actions.push('Review modules marked skip:true to confirm intentional exclusion from checks.');
  }
  if (actions.length === 0) {
    actions.push('No action required—record this pulse with the control surface artefacts.');
  }
  return actions;
}

function toMarkdown(report: PulseReport): string {
  const header = `# Owner Control Pulse

- **Network:** ${report.metadata.networkName} (chainId ${report.metadata.chainId})
- **Hardhat profile:** ${report.metadata.hardhatNetwork}
- **Config:** ${report.metadata.configPath}
- **Address book:** ${report.metadata.addressBookPath}
- **Signer:** ${report.metadata.signer ?? 'n/a'}
- **Health:** ${formatScore(report.healthScore)} (${report.healthGrade.toUpperCase()})
`;

  const narrative = report.healthNarrative.map((line) => `- ${line}`).join('\n');
  const recommendations = report.recommendations.map((line) => `- ${line}`).join('\n');

  const tableHeader = '| Module | Status | On-chain Owner | Expected Owner | Primary Note |\n| --- | --- | --- | --- | --- |';
  const rows = report.checks
    .map((check) => {
      const icon = severityIcon(check.severity);
      const owner = check.owner ?? '—';
      const expected = check.expected ?? '—';
      const note = check.primaryNote ? check.primaryNote.replace(/\n/g, ' ') : '—';
      return `| ${check.label} | ${icon} ${check.status} | ${owner} | ${expected} | ${note} |`;
    })
    .join('\n');

  const mermaid = [
    '```mermaid',
    'flowchart LR',
    '  Config[Config Targets] --> Pulse(Owner Control Pulse)',
    `  Pulse -->|Health ${Math.round(report.healthScore)}| Grade[[${report.healthGrade.toUpperCase()}]]`,
    '  Pulse --> Modules[Module Checks]',
    `  Modules --> Mismatch{Mismatch: ${report.summary.mismatch}}`,
    `  Modules --> MissingAddress{Missing Address: ${report.summary.missingAddress}}`,
    `  Modules --> MissingExpected{Missing Expected: ${report.summary.missingExpected}}`,
    `  Modules --> Errors{Errors: ${report.summary.error}}`,
    `  Modules --> Skipped{Skipped: ${report.summary.skipped}}`,
    '```',
  ].join('\n');

  return [header, '## Health Narrative', narrative, '## Module Summary', tableHeader, rows, mermaid, '## Recommended Actions', recommendations].join('\n\n');
}

function toHuman(report: PulseReport): string {
  const lines: string[] = [];
  lines.push('AGIJobs Owner Control Pulse');
  lines.push('----------------------------');
  lines.push(`Network: ${report.metadata.networkName} (chainId ${report.metadata.chainId})`);
  lines.push(`Hardhat profile: ${report.metadata.hardhatNetwork}`);
  lines.push(`Config: ${report.metadata.configPath}`);
  lines.push(`Address book: ${report.metadata.addressBookPath}`);
  lines.push(`Signer: ${report.metadata.signer ?? 'n/a'}`);
  lines.push(`Health: ${formatScore(report.healthScore)} (${report.healthGrade.toUpperCase()})`);
  lines.push('');
  lines.push('Narrative:');
  for (const entry of report.healthNarrative) {
    lines.push(`  - ${entry}`);
  }
  lines.push('');
  lines.push('Modules:');
  lines.push('  Module                         Status      Owner                               Expected');
  lines.push('  -------------------------------------------------------------------------------');
  for (const check of report.checks) {
    const name = check.label.padEnd(30);
    const status = `${severityIcon(check.severity)} ${check.status}`.padEnd(12);
    const owner = (check.owner ?? '—').padEnd(35);
    const expected = check.expected ?? '—';
    lines.push(`  ${name}${status}${owner}${expected}`);
    if (check.primaryNote) {
      lines.push(`      ↳ ${check.primaryNote}`);
    }
  }
  lines.push('');
  lines.push('Recommended Actions:');
  for (const action of report.recommendations) {
    lines.push(`  - ${action}`);
  }
  return lines.join('\n');
}

function toJson(report: PulseReport): any {
  return {
    metadata: {
      chainId: report.metadata.chainId.toString(),
      networkName: report.metadata.networkName,
      hardhatNetwork: report.metadata.hardhatNetwork,
      signer: report.metadata.signer,
      configPath: report.metadata.configPath,
      addressBookPath: report.metadata.addressBookPath,
    },
    summary: report.summary,
    health: {
      score: report.healthScore,
      grade: report.healthGrade,
      narrative: report.healthNarrative,
    },
    checks: report.checks.map((check) => ({
      key: check.key,
      label: check.label,
      status: check.status,
      severity: check.severity,
      address: check.address,
      owner: check.owner,
      expected: check.expected,
      pending: check.pending,
      notes: check.notes,
    })),
    recommendations: report.recommendations,
  };
}

function applyEnvDefaults(options: PulseCliOptions, flags: CliFlags): PulseCliOptions {
  const resolved: PulseCliOptions = { ...options };

  if (!flags.formatSetByCli) {
    const envFormat = process.env.OWNER_PULSE_FORMAT?.trim().toLowerCase();
    if (envFormat === 'json') {
      resolved.format = 'json';
    } else if (envFormat === 'markdown' || envFormat === 'md') {
      resolved.format = 'markdown';
    } else if (envFormat === 'human' || envFormat === 'text') {
      resolved.format = 'human';
    }
    const envJson = parseBooleanEnv(process.env.OWNER_PULSE_JSON);
    if (envJson) {
      resolved.format = 'json';
    }
  }

  if (!resolved.configNetwork && process.env.OWNER_PULSE_NETWORK) {
    resolved.configNetwork = process.env.OWNER_PULSE_NETWORK.trim();
  }

  if (!resolved.modules && process.env.OWNER_PULSE_MODULES) {
    resolved.modules = parseList(process.env.OWNER_PULSE_MODULES);
  }

  const envSkip = parseList(process.env.OWNER_PULSE_SKIP);
  if (envSkip && envSkip.length > 0) {
    const existing = new Set(resolved.skip ?? []);
    envSkip.forEach((entry) => existing.add(entry));
    resolved.skip = Array.from(existing);
  }

  if (!resolved.addressBookPath && process.env.OWNER_PULSE_ADDRESS_BOOK) {
    resolved.addressBookPath = process.env.OWNER_PULSE_ADDRESS_BOOK.trim();
  }

  const envOverrides = parseOverridesEnv(process.env.OWNER_PULSE_ADDRESS_OVERRIDES);
  if (envOverrides) {
    const merged: Record<string, string> = { ...envOverrides };
    for (const [key, value] of Object.entries(resolved.addressOverrides)) {
      merged[key] = value;
    }
    resolved.addressOverrides = merged;
  }

  if (!resolved.outPath && process.env.OWNER_PULSE_OUT) {
    resolved.outPath = process.env.OWNER_PULSE_OUT.trim();
  }

  return resolved;
}

async function main() {
  const { options: cliOptions, flags } = parseArgs(process.argv.slice(2));
  const options = applyEnvDefaults(cliOptions, flags);

  const verification = await verifyOwnerControl({
    configNetwork: options.configNetwork,
    modules: options.modules,
    skip: options.skip,
    addressBookPath: options.addressBookPath,
    addressOverrides: options.addressOverrides,
  });

  const summary = verification.summary;
  const health = computeHealth(summary, verification.results);
  const report: PulseReport = {
    metadata: verification.metadata,
    summary,
    healthScore: health.score,
    healthGrade: health.grade,
    healthNarrative: health.narrative,
    checks: buildPulseChecks(verification.results),
    recommendations: buildRecommendations(summary, verification.results),
  };

  let output: string;
  let jsonOutput: any | null = null;
  switch (options.format) {
    case 'markdown':
      output = toMarkdown(report);
      break;
    case 'json':
      jsonOutput = toJson(report);
      output = JSON.stringify(jsonOutput, null, 2);
      break;
    case 'human':
    default:
      output = toHuman(report);
      break;
  }

  console.log(output);

  if (options.outPath) {
    const outFile = path.resolve(options.outPath);
    const data = options.format === 'json' ? output : `${output}\n`;
    await fs.mkdir(path.dirname(outFile), { recursive: true });
    await fs.writeFile(outFile, data, 'utf8');
  }

  if (options.format !== 'json') {
    // Always emit machine-readable JSON to aid automations when stdout is human/markdown.
    const fallback = jsonOutput ?? toJson(report);
    process.stdout.write('\n');
    process.stdout.write('---\n');
    process.stdout.write('JSON snapshot:\n');
    process.stdout.write(JSON.stringify(fallback, null, 2));
    process.stdout.write('\n');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
