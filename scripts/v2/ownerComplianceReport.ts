#!/usr/bin/env ts-node
import { ethers } from 'ethers';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
  loadTaxPolicyConfig,
  loadOwnerControlConfig,
  loadDeploymentPlan,
} from '../config';

type OutputFormat = 'human' | 'json';

type CliOptions = {
  network?: string;
  address?: string;
  format: OutputFormat;
};

type ConfigSnapshot = {
  path: string;
  network?: string;
  policyURI?: string;
  acknowledgement?: string;
  acknowledgers: string[];
  revokeList: string[];
};

type OnChainSnapshot = {
  status: 'ok' | 'error' | 'skipped';
  reason?: string;
  network?: string;
  policyURI?: string;
  acknowledgement?: string;
  policyVersion?: bigint;
  owner?: string;
  pendingOwner?: string | null;
  taxExempt?: boolean;
};

type Report = {
  generatedAt: string;
  address?: string;
  config: ConfigSnapshot;
  onChain: OnChainSnapshot;
  configSource: string;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { format: 'human' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--network':
      case '--chain': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error(`${arg} requires a value`);
        }
        options.network = value;
        i += 1;
        break;
      }
      case '--address': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error('--address requires a contract address');
        }
        options.address = value;
        i += 1;
        break;
      }
      case '--json':
        options.format = 'json';
        break;
      case '--human':
        options.format = 'human';
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function summariseConfig(
  config: ReturnType<typeof loadTaxPolicyConfig>['config'],
  path: string,
  network?: string,
): ConfigSnapshot {
  const acknowledgers = config.acknowledgers
    ? Object.entries(config.acknowledgers)
        .filter(([, allowed]) => Boolean(allowed))
        .map(([addr]) => addr)
    : [];
  const revokeList = Array.isArray(config.revokeAcknowledgements)
    ? config.revokeAcknowledgements
    : [];
  return {
    path,
    network,
    policyURI: config.policyURI,
    acknowledgement: config.acknowledgement,
    acknowledgers,
    revokeList,
  };
}

function determinePolicyAddress(cli: CliOptions): { address?: string; source: string } {
  if (cli.address) {
    return { address: cli.address, source: 'cli' };
  }

  const ownerConfig = loadOwnerControlConfig({ network: cli.network });
  const taxModule = ownerConfig.config.modules?.taxPolicy;
  if (taxModule?.address) {
    return { address: taxModule.address, source: ownerConfig.path };
  }

  const deployment = loadDeploymentPlan({ network: cli.network, optional: true });
  if (deployment.exists && deployment.plan?.taxPolicy) {
    const candidate = deployment.plan.taxPolicy as { address?: string };
    if (candidate?.address) {
      return { address: candidate.address, source: deployment.path ?? 'deployment plan' };
    }
  }

  return { address: undefined, source: 'not found' };
}

function normaliseAddress(address: string): string | null {
  try {
    return ethers.getAddress(address);
  } catch (error) {
    return null;
  }
}

function formatPreview(text?: string, limit = 140): string {
  if (!text) {
    return 'n/a';
  }
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit)}…`;
}

async function fetchOnChainSnapshot(
  address: string | undefined,
  network?: string,
): Promise<OnChainSnapshot> {
  if (!address) {
    return { status: 'skipped', reason: 'No tax policy address configured.' };
  }

  const checksum = normaliseAddress(address);
  if (!checksum) {
    return { status: 'error', reason: `Invalid tax policy address ${address}` };
  }

  if (!process.env.HARDHAT_NETWORK && network) {
    process.env.HARDHAT_NETWORK = network;
  }

  const hardhatResult = await import('hardhat')
    .then((module) => ({ module }))
    .catch((error: unknown) => ({ error }));
  if (!('module' in hardhatResult)) {
    const reason = hardhatResult.error instanceof Error
      ? hardhatResult.error.message
      : 'Hardhat runtime unavailable';
    return { status: 'skipped', reason };
  }

  const runtimeModule = hardhatResult.module as { default?: HardhatRuntimeEnvironment } &
    HardhatRuntimeEnvironment;
  const runtime = (runtimeModule.default ?? runtimeModule) as HardhatRuntimeEnvironment & {
    ethers: any;
    network: { name: string };
  };
  const hreEthers = runtime.ethers as any;
  const hreNetwork = runtime.network as { name: string };

  try {
    const policy = await hreEthers.getContractAt(
      'contracts/v2/TaxPolicy.sol:TaxPolicy',
      checksum,
    );

    const [policyURI, acknowledgement, version, owner] = await Promise.all([
      policy.policyURI(),
      policy.acknowledgement(),
      policy.policyVersion(),
      policy.owner(),
    ]);

    let pendingOwner: string | null = null;
    await policy
      .pendingOwner()
      .then((candidate: string) => {
        pendingOwner = candidate;
      })
      .catch(() => {
        pendingOwner = null;
      });

    let taxExempt: boolean | undefined;
    await policy
      .isTaxExempt()
      .then((value: boolean) => {
        taxExempt = value;
      })
      .catch(() => {
        taxExempt = undefined;
      });

    return {
      status: 'ok',
      network: hreNetwork.name,
      policyURI,
      acknowledgement,
      policyVersion: version,
      owner,
      pendingOwner,
      taxExempt,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown tax policy query error';
    return { status: 'error', reason };
  }
}

function renderHuman(report: Report): void {
  console.log('━━━ Tax Policy Compliance Report ━━━');
  console.log(`Generated at: ${report.generatedAt}`);
  console.log(`Tax policy address: ${report.address ?? '(not resolved)'}`);
  console.log(`Configuration source: ${report.configSource}`);
  console.log('');

  console.log('Configuration manifest');
  console.log('─────────────────────');
  console.log(`• Path: ${report.config.path}`);
  console.log(`• Network: ${report.config.network ?? 'auto'}`);
  console.log(`• Policy URI: ${report.config.policyURI ?? 'n/a'}`);
  console.log(`• Acknowledgement (preview): ${formatPreview(report.config.acknowledgement)}`);
  console.log(`• Delegated acknowledgers: ${report.config.acknowledgers.length}`);
  if (report.config.revokeList.length > 0) {
    console.log(`• Pending revocations: ${report.config.revokeList.join(', ')}`);
  }
  console.log('');

  console.log('On-chain state');
  console.log('──────────────');
  if (report.onChain.status === 'ok') {
    console.log(`• Network: ${report.onChain.network}`);
    console.log(`• Policy URI: ${report.onChain.policyURI ?? 'n/a'}`);
    console.log(`• Acknowledgement (preview): ${formatPreview(report.onChain.acknowledgement)}`);
    console.log(`• Policy version: ${report.onChain.policyVersion?.toString() ?? 'n/a'}`);
    console.log(`• Owner: ${report.onChain.owner ?? 'n/a'}`);
    if (report.onChain.pendingOwner) {
      console.log(`• Pending owner: ${report.onChain.pendingOwner}`);
    }
    if (report.onChain.taxExempt !== undefined) {
      console.log(`• Tax exempt flag: ${report.onChain.taxExempt ? 'true' : 'false'}`);
    }
  } else {
    console.log(`• Status: ${report.onChain.status.toUpperCase()}`);
    if (report.onChain.reason) {
      console.log(`• Reason: ${report.onChain.reason}`);
    }
  }
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));
  const { config, path: configPath, network } = loadTaxPolicyConfig({ network: cli.network });
  const configSnapshot = summariseConfig(config, configPath, network);
  const resolved = determinePolicyAddress(cli);
  const onChain = await fetchOnChainSnapshot(resolved.address, cli.network ?? network);

  let normalised: string | undefined;
  if (resolved.address) {
    normalised = normaliseAddress(resolved.address) ?? resolved.address;
  }

  const report: Report = {
    generatedAt: new Date().toISOString(),
    address: normalised,
    config: configSnapshot,
    onChain,
    configSource: resolved.source,
  };

  if (cli.format === 'json') {
    console.log(JSON.stringify(report, null, 2));
  } else {
    renderHuman(report);
  }

  if (onChain.status === 'error') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('❌ Tax policy compliance report failed');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
