#!/usr/bin/env ts-node
import path from 'path';
import { promises as fs } from 'fs';
import crypto from 'crypto';
import { ethers } from 'ethers';
import {
  loadOwnerControlConfig,
  loadDeploymentPlan,
  type LoadOptions,
  type OwnerControlConfig,
} from '../config';

type Severity = 'info' | 'warn' | 'critical';

interface CliOptions {
  network?: string;
  proposal?: string;
  dryRun: boolean;
  json: boolean;
  help?: boolean;
}

interface Issue {
  severity: Severity;
  message: string;
  recommendation?: string;
}

interface ProposalAction {
  target: string;
  value: bigint;
  signature?: string;
  calldata?: string;
  description?: string;
}

interface ProposalReport {
  exists: boolean;
  path: string;
  actions: ProposalAction[];
  checksum?: string;
  metadata?: Record<string, unknown>;
  issues: Issue[];
}

interface UpgradeSummary {
  network?: string;
  owner?: string;
  timelock?: string;
  modulesChecked: number;
  modulesMissingOwner: string[];
  modulesMissingGovernance: string[];
  deploymentPlanPath?: string;
}

interface ExecutionPlan {
  summary: UpgradeSummary;
  proposal: ProposalReport;
  issues: Issue[];
}

const SEVERITY_ORDER: Record<Severity, number> = {
  info: 0,
  warn: 1,
  critical: 2,
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    dryRun: false,
    json: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--network': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error('--network requires a value');
        }
        options.network = value;
        i += 1;
        break;
      }
      case '--proposal': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error('--proposal requires a value');
        }
        options.proposal = value;
        i += 1;
        break;
      }
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--json':
        options.json = true;
        break;
      default:
        if (arg.startsWith('-')) {
          throw new Error(`Unknown flag ${arg}`);
        }
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`Usage: npm run owner:upgrade -- [options]\n\n` +
    `Queues an upgrade bundle into the governance timelock with full owner visibility.\n\n` +
    `Options:\n` +
    `  --network <name>      Network tag to resolve configuration (default: infer)\n` +
    `  --proposal <path>     Path to the encoded governance bundle (default: governance_bundle.json)\n` +
    `  --dry-run             Analyse configuration without requiring a proposal file\n` +
    `  --json                Emit machine-readable JSON summary\n` +
    `  -h, --help            Show this message\n`);
}

function normaliseAddress(value?: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    return ethers.getAddress(trimmed);
  } catch (_error) {
    return undefined;
  }
}

function ensureArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }
  return [];
}

async function loadProposal(filePath: string, dryRun: boolean): Promise<ProposalReport> {
  const resolved = path.resolve(filePath);
  const issues: Issue[] = [];
  try {
    const raw = await fs.readFile(resolved, 'utf8');
    const checksum = crypto.createHash('sha256').update(raw).digest('hex');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const actionsRaw = ensureArray<Record<string, unknown>>(parsed.actions);
    const actions: ProposalAction[] = actionsRaw.map((action, index) => {
      const target = normaliseAddress(typeof action.target === 'string' ? action.target : undefined);
      const valueBigInt = (() => {
        if (typeof action.value === 'number') {
          return BigInt(Math.trunc(action.value));
        }
        if (typeof action.value === 'string') {
          try {
            return BigInt(action.value);
          } catch (_error) {
            return BigInt(0);
          }
        }
        return BigInt(0);
      })();

      if (!target) {
        issues.push({
          severity: 'critical',
          message: `Action #${index + 1} is missing a valid target address`,
          recommendation: 'Provide a deployed contract address for each action target.',
        });
      }

      const signature = typeof action.signature === 'string' ? action.signature : undefined;
      const calldata = typeof action.calldata === 'string' ? action.calldata : undefined;
      if (!signature && !calldata) {
        issues.push({
          severity: 'warn',
          message: `Action #${index + 1} is missing call data details`,
          recommendation: 'Include either a function signature or calldata payload.',
        });
      }

      return {
        target: target ?? ethers.ZeroAddress,
        value: valueBigInt,
        signature,
        calldata,
        description: typeof action.description === 'string' ? action.description : undefined,
      };
    });

    if (actions.length === 0) {
      issues.push({
        severity: 'warn',
        message: 'Proposal contains no actions; nothing will be queued.',
        recommendation: 'Populate the actions array with timelock operations.',
      });
    }

    return {
      exists: true,
      path: resolved,
      actions,
      checksum,
      metadata: typeof parsed.metadata === 'object' ? (parsed.metadata as Record<string, unknown>) : undefined,
      issues,
    };
  } catch (error) {
    if (dryRun) {
      return {
        exists: false,
        path: resolved,
        actions: [],
        issues: [
          {
            severity: 'warn',
            message: `Proposal file not found at ${resolved}`,
            recommendation: 'Generate the upgrade bundle before executing for real.',
          },
        ],
      };
    }

    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Proposal file not found at ${resolved}. Pass --dry-run to skip file validation.`);
    }
    throw error;
  }
}

function analyseOwnerConfig(config: OwnerControlConfig): UpgradeSummary {
  const governance = normaliseAddress(typeof config.governance === 'string' ? config.governance : undefined);
  const owner = normaliseAddress(typeof config.owner === 'string' ? config.owner : undefined);

  const modules = config.modules ?? {};
  const moduleEntries = Object.entries(modules);

  const modulesMissingOwner: string[] = [];
  const modulesMissingGovernance: string[] = [];

  for (const [key, moduleConfig] of moduleEntries) {
    const moduleOwner = normaliseAddress(typeof moduleConfig.owner === 'string' ? moduleConfig.owner : undefined);
    const moduleGovernance = normaliseAddress(
      typeof moduleConfig.governance === 'string' ? moduleConfig.governance : undefined,
    );

    if (!moduleOwner) {
      modulesMissingOwner.push(key);
    }
    if (!moduleGovernance) {
      modulesMissingGovernance.push(key);
    }
  }

  return {
    owner,
    timelock: governance,
    modulesChecked: moduleEntries.length,
    modulesMissingOwner,
    modulesMissingGovernance,
  };
}

function mergeIssues(...groups: Issue[][]): Issue[] {
  return groups.reduce<Issue[]>((acc, group) => acc.concat(group), []);
}

function highestSeverity(issues: Issue[]): Severity {
  return issues.reduce<Severity>((level, issue) => {
    return SEVERITY_ORDER[issue.severity] > SEVERITY_ORDER[level] ? issue.severity : level;
  }, 'info');
}

function formatEtherValue(value: bigint): string {
  if (value === BigInt(0)) {
    return '0 ETH';
  }
  return `${ethers.formatEther(value)} ETH`;
}

function renderHuman(plan: ExecutionPlan): void {
  const { summary, proposal, issues } = plan;
  const status = highestSeverity(issues);
  const statusLabel =
    status === 'critical' ? '❌ Action required' : status === 'warn' ? '⚠️ Review suggested' : '✅ Ready to queue';

  console.log('┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`┃ Owner upgrade readiness :: ${statusLabel}`);
  console.log('┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  console.log('Network context');
  console.log('────────────────');
  console.log(`• Network tag: ${plan.summary.network ?? 'auto'}`);
  console.log(`• Owner signer: ${summary.owner ?? '⚠️ unset'}`);
  console.log(`• Governance timelock: ${summary.timelock ?? '⚠️ unset'}`);
  console.log(`• Modules tracked: ${summary.modulesChecked}`);
  if (summary.modulesMissingOwner.length > 0) {
    console.log(`  ↳ Missing owner binding for: ${summary.modulesMissingOwner.join(', ')}`);
  }
  if (summary.modulesMissingGovernance.length > 0) {
    console.log(`  ↳ Missing governance binding for: ${summary.modulesMissingGovernance.join(', ')}`);
  }
  if (summary.deploymentPlanPath) {
    console.log(`• Deployment plan: ${summary.deploymentPlanPath}`);
  }
  console.log('');

  console.log('Proposal bundle');
  console.log('────────────────');
  if (!proposal.exists) {
    console.log(`• No bundle located (${proposal.path})`);
  } else {
    console.log(`• Source: ${proposal.path}`);
    console.log(`• Actions: ${proposal.actions.length}`);
    if (proposal.checksum) {
      console.log(`• SHA256: ${proposal.checksum}`);
    }
    proposal.actions.forEach((action, index) => {
      console.log(`  [${index + 1}] target=${action.target} value=${formatEtherValue(action.value)}`);
      if (action.signature) {
        console.log(`      signature=${action.signature}`);
      }
      if (action.calldata) {
        console.log(`      calldata=${action.calldata}`);
      }
      if (action.description) {
        console.log(`      note=${action.description}`);
      }
    });
  }
  console.log('');

  if (issues.length > 0) {
    console.log('Guardrails & remediation');
    console.log('────────────────────────');
    for (const issue of issues) {
      const marker = issue.severity === 'critical' ? '❌' : issue.severity === 'warn' ? '⚠️' : 'ℹ️';
      console.log(`${marker} ${issue.message}`);
      if (issue.recommendation) {
        console.log(`    → ${issue.recommendation}`);
      }
    }
    console.log('');
  }

  console.log('Execution checklist');
  console.log('───────────────────');
  if (status === 'critical') {
    console.log('• Resolve critical findings before queuing the upgrade.');
  } else {
    console.log('• Confirm operator signers retain timelock proposer / executor roles.');
    console.log('• Re-run this command without --dry-run once the proposal bundle is final.');
    console.log(
      `• Schedule each action via the TimelockController (Hardhat, Safe, or direct RPC) using data from ${proposal.path}.`,
    );
    console.log('• Monitor timelock events and execute once the delay window elapses.');
  }
}

function renderJson(plan: ExecutionPlan): void {
  console.log(
    JSON.stringify(
      {
        status: highestSeverity(plan.issues),
        summary: plan.summary,
        proposal: {
          path: plan.proposal.path,
          exists: plan.proposal.exists,
          checksum: plan.proposal.checksum,
          actions: plan.proposal.actions.map((action) => ({
            target: action.target,
            value: action.value.toString(),
            signature: action.signature,
            calldata: action.calldata,
            description: action.description,
          })),
          issues: plan.proposal.issues,
        },
        issues: plan.issues,
      },
      null,
      2,
    ),
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const proposalPath = options.proposal ?? 'governance_bundle.json';

  const loadOptions: LoadOptions = { network: options.network };
  const ownerResult = loadOwnerControlConfig(loadOptions);
  const deploymentPlan = loadDeploymentPlan({ network: options.network, optional: true });

  const summary = analyseOwnerConfig(ownerResult.config);
  summary.network = ownerResult.network ?? options.network;
  summary.deploymentPlanPath = deploymentPlan?.path;

  const proposal = await loadProposal(proposalPath, options.dryRun);

  const issues: Issue[] = [];
  if (!summary.owner) {
    issues.push({
      severity: 'critical',
      message: 'Owner account is unset in owner-control configuration.',
      recommendation: `Populate owner-control.json with the production owner address for network ${
        summary.network ?? 'mainnet'
      }.`,
    });
  }
  if (!summary.timelock) {
    issues.push({
      severity: 'critical',
      message: 'Governance timelock address is unset.',
      recommendation: 'Set the governance field in owner-control configuration to the TimelockController address.',
    });
  }
  if (summary.modulesMissingOwner.length > 0) {
    issues.push({
      severity: 'warn',
      message: `Modules missing owner binding: ${summary.modulesMissingOwner.join(', ')}`,
      recommendation: 'Update owner-control.json to track each module owner for auditability.',
    });
  }
  if (summary.modulesMissingGovernance.length > 0) {
    issues.push({
      severity: 'warn',
      message: `Modules missing governance binding: ${summary.modulesMissingGovernance.join(', ')}`,
      recommendation: 'Ensure each governable contract lists the timelock address for accurate verification.',
    });
  }

  const plan: ExecutionPlan = {
    summary,
    proposal,
    issues: mergeIssues(issues, proposal.issues),
  };

  if (options.json) {
    renderJson(plan);
  } else {
    renderHuman(plan);
  }

  const exitSeverity = highestSeverity(plan.issues);
  if (exitSeverity === 'critical') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('❌ Owner upgrade orchestration failed');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
