import { ethers, network } from 'hardhat';
import { loadTokenConfig } from '../config';

interface CliOptions {
  systemPause?: string;
  json: boolean;
}

interface ModuleDescriptor {
  key:
    | 'jobRegistry'
    | 'stakeManager'
    | 'validationModule'
    | 'disputeModule'
    | 'platformRegistry'
    | 'feePool'
    | 'reputationEngine'
    | 'arbitratorCommittee';
  label: string;
}

interface ModuleReport {
  key: ModuleDescriptor['key'];
  label: string;
  address: string | null;
  owner?: string | null;
  pauser?: string | null;
  paused?: boolean | null;
  ownerMatches?: boolean;
  pauserMatches?: boolean;
  issues: string[];
}

interface CapabilityReport {
  label: string;
  attempted: boolean;
  ok: boolean;
  reason?: string;
}

interface ReportOutput {
  network: string;
  systemPause: string;
  governance: string;
  moduleReports: ModuleReport[];
  capabilities: CapabilityReport[];
  hasFailures: boolean;
}

const MODULE_DESCRIPTORS: ModuleDescriptor[] = [
  { key: 'jobRegistry', label: 'JobRegistry' },
  { key: 'stakeManager', label: 'StakeManager' },
  { key: 'validationModule', label: 'ValidationModule' },
  { key: 'disputeModule', label: 'DisputeModule' },
  { key: 'platformRegistry', label: 'PlatformRegistry' },
  { key: 'feePool', label: 'FeePool' },
  { key: 'reputationEngine', label: 'ReputationEngine' },
  { key: 'arbitratorCommittee', label: 'ArbitratorCommittee' },
];

const MODULE_ABI = [
  'function owner() view returns (address)',
  'function pauser() view returns (address)',
  'function paused() view returns (bool)',
];

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--json':
      case '--output-json':
        options.json = true;
        break;
      case '--system-pause':
      case '--pause': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error(`${arg} requires an address`);
        }
        options.systemPause = value;
        i += 1;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function normaliseAddress(value: string, label: string): string {
  try {
    const address = ethers.getAddress(value);
    if (address === ethers.ZeroAddress) {
      throw new Error(`${label} cannot be the zero address`);
    }
    return address;
  } catch (error) {
    throw new Error(`${label} is not a valid address: ${value}`);
  }
}

function sameAddress(a?: string | null, b?: string | null): boolean {
  if (!a || !b) {
    return false;
  }
  return ethers.getAddress(a) === ethers.getAddress(b);
}

async function inspectModule(
  pauseAddress: string,
  descriptor: ModuleDescriptor
): Promise<ModuleReport> {
  const report: ModuleReport = {
    key: descriptor.key,
    label: descriptor.label,
    address: null,
    issues: [],
  };

  try {
    const pause = await ethers.getContractAt('SystemPause', pauseAddress);
    const address = await pause[descriptor.key]();
    if (address === ethers.ZeroAddress) {
      report.address = null;
      report.issues.push('module address is zero');
      return report;
    }
    report.address = ethers.getAddress(address);
  } catch (error) {
    report.issues.push(`failed to read address: ${(error as Error).message}`);
    return report;
  }

  try {
    const module = await ethers.getContractAt(MODULE_ABI, report.address!);
    report.owner = await module.owner();
    report.pauser = await module.pauser();
    try {
      report.paused = await module.paused();
    } catch (err) {
      report.paused = null;
      report.issues.push(`failed to read paused(): ${(err as Error).message}`);
    }
    report.ownerMatches = sameAddress(report.owner, pauseAddress);
    report.pauserMatches = sameAddress(report.pauser, pauseAddress);
    if (!report.ownerMatches) {
      report.issues.push(
        `owner is ${report.owner ?? 'unknown'}, expected ${pauseAddress}`
      );
    }
    if (!report.pauserMatches) {
      report.issues.push(
        `pauser is ${report.pauser ?? 'unknown'}, expected ${pauseAddress}`
      );
    }
  } catch (error) {
    report.issues.push(`failed to inspect module: ${(error as Error).message}`);
  }

  return report;
}

function formatReason(error: unknown): string {
  if (!error) {
    return 'unknown error';
  }
  if (typeof error === 'string') {
    return error;
  }
  const err = error as { message?: string; shortMessage?: string };
  if (err.shortMessage) {
    return err.shortMessage;
  }
  if (err.message) {
    return err.message;
  }
  return JSON.stringify(error);
}

async function probeCapability(
  pause: any,
  governance: string,
  method: 'pauseAll' | 'unpauseAll',
  shouldAttempt: boolean
): Promise<CapabilityReport> {
  const label = method === 'pauseAll' ? 'Pause all modules' : 'Unpause all modules';
  if (!shouldAttempt) {
    return {
      label,
      attempted: false,
      ok: true,
      reason: 'Skipped (state already satisfies outcome)',
    };
  }
  try {
    await pause[method].staticCall({ from: governance });
    return { label, attempted: true, ok: true };
  } catch (error) {
    return {
      label,
      attempted: true,
      ok: false,
      reason: formatReason(error),
    };
  }
}

async function generateReport(options: CliOptions): Promise<ReportOutput> {
  const { config, path: configPath } = loadTokenConfig({ network: network.name });

  const pauseAddress = options.systemPause
    ? normaliseAddress(options.systemPause, 'SystemPause address')
    : (() => {
        const fromConfig = config.modules?.systemPause as string | undefined;
        if (!fromConfig || fromConfig === ethers.ZeroAddress) {
          throw new Error(
            `SystemPause address missing. Set config.modules.systemPause in ${configPath} or provide --system-pause`
          );
        }
        return normaliseAddress(fromConfig, 'SystemPause config address');
      })();

  const pause = await ethers.getContractAt('SystemPause', pauseAddress);
  const governance = await pause.owner();

  const moduleReports: ModuleReport[] = [];
  for (const descriptor of MODULE_DESCRIPTORS) {
    moduleReports.push(await inspectModule(pauseAddress, descriptor));
  }

  const anyUnpaused = moduleReports.some((module) => module.paused === false);
  const anyPaused = moduleReports.some((module) => module.paused === true);

  const capabilities: CapabilityReport[] = [];
  capabilities.push(await probeCapability(pause, governance, 'pauseAll', anyUnpaused));
  capabilities.push(await probeCapability(pause, governance, 'unpauseAll', anyPaused));

  const hasFailures =
    moduleReports.some((module) => module.issues.length > 0) ||
    capabilities.some((capability) => capability.attempted && !capability.ok);

  return {
    network: network.name,
    systemPause: pauseAddress,
    governance,
    moduleReports,
    capabilities,
    hasFailures,
  };
}

function printHumanReadable(report: ReportOutput): void {
  console.log(`SystemPause readiness — network: ${report.network}`);
  console.log(`SystemPause address : ${report.systemPause}`);
  console.log(`Governance (owner) : ${report.governance}`);
  console.log('');
  console.log('Module wiring:');
  for (const module of report.moduleReports) {
    const status = module.issues.length === 0 ? 'OK' : 'ISSUES';
    console.log(`- ${module.label}: ${status}`);
    console.log(`  address : ${module.address ?? 'not configured'}`);
    console.log(`  owner   : ${module.owner ?? 'unknown'}`);
    console.log(`  pauser  : ${module.pauser ?? 'unknown'}`);
    if (module.paused !== null && module.paused !== undefined) {
      console.log(`  paused  : ${module.paused ? 'yes' : 'no'}`);
    } else {
      console.log('  paused  : unknown');
    }
    if (module.issues.length > 0) {
      for (const issue of module.issues) {
        console.log(`  ⚠ ${issue}`);
      }
    }
  }
  console.log('');
  console.log('Capabilities:');
  for (const capability of report.capabilities) {
    const status = capability.ok ? 'OK' : 'FAIL';
    const attempt = capability.attempted ? 'attempted' : 'skipped';
    if (capability.reason) {
      console.log(`- ${capability.label}: ${status} (${attempt}) — ${capability.reason}`);
    } else {
      console.log(`- ${capability.label}: ${status} (${attempt})`);
    }
  }
  console.log('');
  if (report.hasFailures) {
    console.error('❌ SystemPause verification failed. Review the issues above.');
  } else {
    console.log('✅ SystemPause verification succeeded.');
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const report = await generateReport(options);
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHumanReadable(report);
  }
  if (report.hasFailures) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('SystemPause verification encountered an error:', error);
  process.exitCode = 1;
});
