#!/usr/bin/env ts-node
import fs from 'fs';
import path from 'path';
import process from 'process';
import { config as loadEnv } from 'dotenv';
import {
  JsonRpcProvider,
  type Network as EthersNetwork,
  getAddress,
  ZeroAddress,
} from 'ethers';
import {
  inferNetworkKey,
  loadTokenConfig,
  loadDeploymentPlan,
  loadEnsConfig,
  loadIdentityRegistryConfig,
  loadJobRegistryConfig,
  loadStakeManagerConfig,
  loadPlatformRegistryConfig,
  loadPlatformIncentivesConfig,
  loadTaxPolicyConfig,
} from '../config';

loadEnv();

type SupportedNetwork = 'mainnet' | 'sepolia';
type CheckStatus = 'pass' | 'warn' | 'fail';

interface CheckResult {
  category: string;
  name: string;
  status: CheckStatus;
  detail: string;
  suggestion?: string;
}

interface CliOptions {
  network: SupportedNetwork;
  json: boolean;
}

const NETWORK_CHAIN_IDS: Record<SupportedNetwork, number> = {
  mainnet: 1,
  sepolia: 11155111,
};

const NETWORK_LABEL: Record<SupportedNetwork, string> = {
  mainnet: 'Ethereum Mainnet',
  sepolia: 'Sepolia Testnet',
};

const ENV_PRIORITY: Record<SupportedNetwork, { privateKey: string[]; rpcUrl: string[] }> = {
  mainnet: {
    privateKey: ['MAINNET_PRIVATE_KEY'],
    rpcUrl: ['MAINNET_RPC_URL'],
  },
  sepolia: {
    privateKey: ['SEPOLIA_PRIVATE_KEY', 'TESTNET_PRIVATE_KEY'],
    rpcUrl: ['SEPOLIA_RPC_URL', 'TESTNET_RPC_URL'],
  },
};

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  let requestedNetwork: string | undefined;
  let json = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--network' || arg === '-n') {
      requestedNetwork = args[i + 1];
      i += 1;
    } else if (arg.startsWith('--network=')) {
      requestedNetwork = arg.split('=')[1];
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
  }

  const resolvedNetwork =
    inferNetworkKey(requestedNetwork) ||
    inferNetworkKey(process.env.TRUFFLE_NETWORK) ||
    inferNetworkKey(process.env.AGJ_NETWORK) ||
    inferNetworkKey(process.env.AGIALPHA_NETWORK) ||
    inferNetworkKey(process.env.HARDHAT_NETWORK) ||
    inferNetworkKey(process.env.NETWORK) ||
    'mainnet';

  if (!resolvedNetwork) {
    throw new Error(
      'Unable to resolve target network. Provide --network mainnet|sepolia or set TRUFFLE_NETWORK.'
    );
  }

  return { network: resolvedNetwork, json };
}

function printUsage(): void {
  const usage = `Usage: ts-node truffle-preflight.ts [--network mainnet|sepolia] [--json]\n`;
  process.stdout.write(usage);
}

function findFirstEnv(keys: string[]): string | null {
  for (const key of keys) {
    if (!key) continue;
    const value = process.env[key];
    if (value !== undefined) {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }
  return null;
}

function validatePrivateKey(envKeys: string[], label: string): CheckResult {
  const value = findFirstEnv(envKeys);
  if (!value) {
    return {
      category: 'Environment',
      name: `${label} private key`,
      status: 'fail',
      detail: `Missing ${label} private key in environment (${envKeys.join(', ')})`,
      suggestion: `Add ${envKeys[0]} to your .env file.`,
    };
  }
  const hex = value.startsWith('0x') || value.startsWith('0X') ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    return {
      category: 'Environment',
      name: `${label} private key`,
      status: 'fail',
      detail: 'Private key must be a 32-byte hex string (64 hex chars, optional 0x prefix).',
    };
  }
  if (/^0+$/.test(hex)) {
    return {
      category: 'Environment',
      name: `${label} private key`,
      status: 'fail',
      detail: 'Private key cannot be zero.',
    };
  }
  return {
    category: 'Environment',
    name: `${label} private key`,
    status: 'pass',
    detail: 'Private key format looks correct (hardware wallet strongly recommended).',
  };
}

function validateRpcUrlFormat(envKeys: string[], label: string): CheckResult {
  const value = findFirstEnv(envKeys);
  if (!value) {
    return {
      category: 'Environment',
      name: `${label} RPC URL`,
      status: 'fail',
      detail: `Missing RPC URL in environment (${envKeys.join(', ')})`,
      suggestion: `Set ${envKeys[0]} in .env to your HTTPS provider endpoint.`,
    };
  }
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol)) {
      return {
        category: 'Environment',
        name: `${label} RPC URL`,
        status: 'fail',
        detail: `Unsupported RPC protocol: ${parsed.protocol}`,
      };
    }
    return {
      category: 'Environment',
      name: `${label} RPC URL`,
      status: 'pass',
      detail: `RPC URL format valid (${parsed.host}).`,
    };
  } catch (error) {
    return {
      category: 'Environment',
      name: `${label} RPC URL`,
      status: 'fail',
      detail: `Invalid URL (${(error as Error).message}).`,
    };
  }
}

async function validateRpcConnectivity(
  envKeys: string[],
  expectedChainId: number,
  label: string
): Promise<CheckResult> {
  const value = findFirstEnv(envKeys);
  if (!value) {
    return {
      category: 'Environment',
      name: `${label} RPC connectivity`,
      status: 'fail',
      detail: `Cannot test connectivity: ${envKeys.join(', ')} not configured.`,
    };
  }
  const provider = new JsonRpcProvider(value);
  try {
    const network: EthersNetwork = await provider.getNetwork();
    if (Number(network.chainId) !== expectedChainId) {
      return {
        category: 'Environment',
        name: `${label} RPC connectivity`,
        status: 'fail',
        detail: `RPC endpoint returned unexpected chainId ${network.chainId}. Expected ${expectedChainId}.`,
      };
    }
    const latestBlock = await provider.getBlockNumber();
    return {
      category: 'Environment',
      name: `${label} RPC connectivity`,
      status: 'pass',
      detail: `Connected (chainId ${network.chainId}, latest block ${latestBlock}).`,
    };
  } catch (error) {
    return {
      category: 'Environment',
      name: `${label} RPC connectivity`,
      status: 'fail',
      detail: `RPC call failed: ${(error as Error).message}`,
    };
  } finally {
    provider.destroy?.();
  }
}

function checkOptionalEnv(name: string, description: string): CheckResult {
  const value = findFirstEnv([name]);
  if (!value) {
    return {
      category: 'Environment',
      name: description,
      status: 'warn',
      detail: `${name} not configured.`,
      suggestion: `Add ${name} to .env when ready.`,
    };
  }
  return {
    category: 'Environment',
    name: description,
    status: 'pass',
    detail: `${name} present.`,
  };
}

function ensureFileExists(filePath: string, category: string, name: string): CheckResult {
  if (!fs.existsSync(filePath)) {
    return {
      category,
      name,
      status: 'fail',
      detail: `${filePath} not found.`,
    };
  }
  return {
    category,
    name,
    status: 'pass',
    detail: `${filePath} located.`,
  };
}

function checkTokenAndPlan(network: SupportedNetwork): CheckResult[] {
  const results: CheckResult[] = [];
  let normalisedToken: string | undefined;
  try {
    const { config: tokenConfig, path: tokenPath } = loadTokenConfig({ network });
    if (!tokenConfig.address) {
      results.push({
        category: 'Configuration',
        name: 'Token configuration',
        status: 'fail',
        detail: `${tokenPath} missing AGIALPHA address.`,
      });
    } else {
      const normalised = getAddress(tokenConfig.address);
      normalisedToken = normalised;
      results.push({
        category: 'Configuration',
        name: 'Token configuration',
        status: 'pass',
        detail: `${tokenPath} loaded (${normalised}).`,
      });
      const envToken = findFirstEnv(['AGIALPHA_TOKEN']);
      if (envToken) {
        try {
          const envAddress = getAddress(envToken);
          if (envAddress !== normalised) {
      results.push({
        category: 'Configuration',
        name: 'AGIALPHA_TOKEN alignment',
        status: 'fail',
        detail: `Environment token ${envAddress} does not match ${normalised}.`,
              suggestion: 'Update AGIALPHA_TOKEN or config/agialpha.*.json to match.',
            });
          } else {
            results.push({
              category: 'Configuration',
              name: 'AGIALPHA_TOKEN alignment',
              status: 'pass',
              detail: 'Environment token matches configuration.',
            });
          }
        } catch (error) {
          results.push({
            category: 'Configuration',
            name: 'AGIALPHA_TOKEN alignment',
            status: 'fail',
            detail: `Invalid AGIALPHA_TOKEN address: ${(error as Error).message}.`,
          });
        }
      } else {
        results.push({
          category: 'Configuration',
          name: 'AGIALPHA_TOKEN alignment',
          status: 'warn',
          detail: 'AGIALPHA_TOKEN not set; migrations will use config file value.',
          suggestion: 'Set AGIALPHA_TOKEN in .env for clarity.',
        });
      }
    }
  } catch (error) {
    results.push({
      category: 'Configuration',
      name: 'Token configuration',
      status: 'fail',
      detail: `Failed to load token config: ${(error as Error).message}`,
    });
  }

  const { plan, exists, path: planPath } = loadDeploymentPlan({ network, optional: true });
  if (!exists || !planPath) {
    results.push({
      category: 'Configuration',
      name: 'deployment-config',
      status: 'warn',
      detail: `deployment-config/${network}.json missing. Defaults will be used.`,
    });
  } else {
    results.push({
      category: 'Configuration',
      name: 'deployment-config',
      status: 'pass',
      detail: `${planPath} loaded.`,
    });
    if (plan.agialpha) {
      try {
        const planToken = getAddress(plan.agialpha);
        if (!normalisedToken) {
          throw new Error('Token configuration not available for comparison');
        }
        if (planToken !== normalisedToken) {
          results.push({
            category: 'Configuration',
            name: 'Token address consistency',
            status: 'fail',
            detail: `deployment-config token ${planToken} differs from config token ${normalisedToken}.`,
          });
        } else {
          results.push({
            category: 'Configuration',
            name: 'Token address consistency',
            status: 'pass',
            detail: 'Token address consistent across config and deployment plan.',
          });
        }
      } catch (error) {
        results.push({
          category: 'Configuration',
          name: 'Token address consistency',
          status: 'fail',
          detail: `Invalid token in deployment-config: ${(error as Error).message}.`,
        });
      }
    } else {
      results.push({
        category: 'Configuration',
        name: 'Token address consistency',
        status: 'warn',
        detail: 'deployment-config missing agialpha field; config token will be used.',
      });
    }
    if (!plan.governance || plan.governance === ZeroAddress) {
      results.push({
        category: 'Configuration',
        name: 'Governance address',
        status: 'warn',
        detail: 'Governance address is unset or zero. Update before production deployment.',
      });
    } else {
      results.push({
        category: 'Configuration',
        name: 'Governance address',
        status: 'pass',
        detail: `Governance target: ${plan.governance}.`,
      });
    }
  }

  return results;
}

function checkEns(network: SupportedNetwork): CheckResult[] {
  const results: CheckResult[] = [];
  try {
    const { config: ensConfig, path: ensPath } = loadEnsConfig({ network });
    if (!ensConfig.registry) {
      results.push({
        category: 'ENS',
        name: 'Registry address',
        status: 'fail',
        detail: `${ensPath} missing registry address.`,
      });
    } else {
      results.push({
        category: 'ENS',
        name: 'Registry address',
        status: 'pass',
        detail: `ENS registry configured: ${ensConfig.registry}.`,
      });
    }
    const roots = ensConfig.roots ?? {};
    const agentRoot = roots.agent?.node;
    const clubRoot = roots.club?.node;
    if (!agentRoot || !isAddressish(agentRoot)) {
      results.push({
        category: 'ENS',
        name: 'Agent root node',
        status: 'fail',
        detail: 'Agent root missing or invalid. Run npm run namehash:mainnet.',
      });
    } else {
      results.push({
        category: 'ENS',
        name: 'Agent root node',
        status: 'pass',
        detail: `Agent node ${agentRoot}.`,
      });
    }
    if (!clubRoot || !isAddressish(clubRoot)) {
      results.push({
        category: 'ENS',
        name: 'Club root node',
        status: 'fail',
        detail: 'Club root missing or invalid. Ensure config/ens.*.json is updated.',
      });
    } else {
      results.push({
        category: 'ENS',
        name: 'Club root node',
        status: 'pass',
        detail: `Club node ${clubRoot}.`,
      });
    }
  } catch (error) {
    results.push({
      category: 'ENS',
      name: 'Configuration',
      status: 'fail',
      detail: `Failed to load ENS config: ${(error as Error).message}`,
    });
  }
  return results;
}

function isAddressish(value: string): boolean {
  if (!value) return false;
  const normalised = value.startsWith('0x') || value.startsWith('0X') ? value : `0x${value}`;
  return /^0x[0-9a-fA-F]{64}$/.test(normalised);
}

function checkModuleConfigs(network: SupportedNetwork): CheckResult[] {
  const results: CheckResult[] = [];
  const loaders: Array<[
    () => void,
    string,
    string
  ]> = [
    [() => loadIdentityRegistryConfig({ network }), 'Identity registry config', 'config/identity-registry*.json'],
    [() => loadJobRegistryConfig({ network }), 'Job registry config', 'config/job-registry*.json'],
    [() => loadStakeManagerConfig({ network }), 'Stake manager config', 'config/stake-manager*.json'],
    [() => loadPlatformRegistryConfig({ network }), 'Platform registry config', 'config/platform-registry*.json'],
    [
      () => loadPlatformIncentivesConfig({ network }),
      'Platform incentives config',
      'config/platform-incentives*.json',
    ],
    [() => loadTaxPolicyConfig({ network }), 'Tax policy config', 'config/tax-policy*.json'],
  ];

  for (const [loader, name, hint] of loaders) {
    try {
      const { path: configPath } = loader() as { path: string };
      results.push({
        category: 'Configuration',
        name,
        status: 'pass',
        detail: `${configPath} loaded.`,
      });
    } catch (error) {
      results.push({
        category: 'Configuration',
        name,
        status: 'fail',
        detail: `Unable to load ${hint}: ${(error as Error).message}`,
      });
    }
  }
  return results;
}

function checkMigrationsBundle(): CheckResult[] {
  const migrations = [
    'migrations/1_initial_migration.js',
    'migrations/2_deploy_protocol.js',
    'migrations/3_wire_protocol.js',
    'migrations/4_configure_ens.js',
    'migrations/5_transfer_ownership.js',
  ];
  return migrations.map((filePath, index) =>
    ensureFileExists(filePath, 'Migrations', `Step ${index + 1}`)
  );
}

function checkTruffleScripts(): CheckResult[] {
  const results: CheckResult[] = [];
  try {
    const pkgJsonPath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    const scripts = packageJson.scripts ?? {};
    if (scripts['migrate:mainnet']) {
      results.push({
        category: 'Tooling',
        name: 'npm run migrate:mainnet',
        status: 'pass',
        detail: 'migrate:mainnet script present.',
      });
    } else {
      results.push({
        category: 'Tooling',
        name: 'npm run migrate:mainnet',
        status: 'fail',
        detail: 'package.json missing migrate:mainnet script.',
      });
    }
    if (scripts['migrate:preflight']) {
      results.push({
        category: 'Tooling',
        name: 'npm run migrate:preflight',
        status: 'pass',
        detail: 'migrate:preflight script present.',
      });
    } else {
      results.push({
        category: 'Tooling',
        name: 'npm run migrate:preflight',
        status: 'warn',
        detail: 'migrate:preflight script missing. Add shortcut to run preflight checks.',
      });
    }
  } catch (error) {
    results.push({
      category: 'Tooling',
      name: 'package.json',
      status: 'fail',
      detail: `Unable to read package.json: ${(error as Error).message}`,
    });
  }
  return results;
}

function checkTruffleConfig(network: SupportedNetwork): CheckResult[] {
  const results: CheckResult[] = [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const truffleConfig = require('../../truffle-config');
    const entry = truffleConfig?.networks?.[network];
    if (!entry) {
      results.push({
        category: 'Tooling',
        name: `truffle-config ${network}`,
        status: 'fail',
        detail: `truffle-config.js missing ${network} network definition.`,
      });
    } else {
      results.push({
        category: 'Tooling',
        name: `truffle-config ${network}`,
        status: 'pass',
        detail: `${network} network_id=${entry.network_id ?? 'unknown'}.`,
      });
    }
  } catch (error) {
    results.push({
      category: 'Tooling',
      name: 'truffle-config.js',
      status: 'fail',
      detail: `Unable to load truffle-config.js: ${(error as Error).message}`,
    });
  }
  return results;
}

function checkAddressBook(expectedToken: string): CheckResult[] {
  const filePath = path.join(process.cwd(), 'docs', 'deployment-addresses.json');
  if (!fs.existsSync(filePath)) {
    return [
      {
        category: 'Post-Deploy',
        name: 'deployment-addresses.json',
        status: 'warn',
        detail: 'Address book not found. It will be created during migration.',
      },
    ];
  }
  try {
    const contents = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, string>;
    const results: CheckResult[] = [
      {
        category: 'Post-Deploy',
        name: 'deployment-addresses.json',
        status: 'pass',
        detail: 'Address book present.',
      },
    ];
    if (contents.token) {
      try {
        const token = getAddress(contents.token);
        if (token !== expectedToken) {
          results.push({
            category: 'Post-Deploy',
            name: 'Token address entry',
            status: 'fail',
            detail: `Address book token ${token} differs from config token ${expectedToken}.`,
          });
        } else {
          results.push({
            category: 'Post-Deploy',
            name: 'Token address entry',
            status: 'pass',
            detail: 'Token entry matches configuration.',
          });
        }
      } catch (error) {
        results.push({
          category: 'Post-Deploy',
          name: 'Token address entry',
          status: 'fail',
          detail: `Invalid token entry: ${(error as Error).message}`,
        });
      }
    }
    const zeroAddresses = Object.entries(contents)
      .filter(([key]) => key !== '_comment' && key !== 'token')
      .filter(([, value]) => value === ZeroAddress);
    if (zeroAddresses.length === 0) {
      results.push({
        category: 'Post-Deploy',
        name: 'Module address placeholders',
        status: 'pass',
        detail: 'All module addresses populated.',
      });
    } else {
      results.push({
        category: 'Post-Deploy',
        name: 'Module address placeholders',
        status: 'warn',
        detail: `${zeroAddresses.length} module entries still zero. Update after deployment.`,
      });
    }
    return results;
  } catch (error) {
    return [
      {
        category: 'Post-Deploy',
        name: 'deployment-addresses.json',
        status: 'fail',
        detail: `Failed to parse address book: ${(error as Error).message}`,
      },
    ];
  }
}

function summarise(checks: CheckResult[]): { pass: number; warn: number; fail: number } {
  return checks.reduce(
    (summary, check) => {
      summary[check.status] += 1;
      return summary;
    },
    { pass: 0, warn: 0, fail: 0 }
  );
}

function printHumanReadable(
  network: SupportedNetwork,
  checks: CheckResult[],
  summary: { pass: number; warn: number; fail: number }
): void {
  const divider = '-'.repeat(72);
  console.log(divider);
  console.log(`AGIJobs v0 Truffle Preflight — ${NETWORK_LABEL[network]}`);
  console.log(divider);
  for (const check of checks) {
    const badge =
      check.status === 'pass' ? '✅' : check.status === 'warn' ? '⚠️ ' : '❌';
    console.log(`${badge} [${check.category}] ${check.name}`);
    console.log(`    ${check.detail}`);
    if (check.suggestion) {
      console.log(`    ↳ ${check.suggestion}`);
    }
  }
  console.log(divider);
  console.log(
    `Summary: ${summary.pass} pass · ${summary.warn} warn · ${summary.fail} fail`
  );
  console.log(divider);
}

async function main(): Promise<void> {
  const options = parseArgs();
  const checks: CheckResult[] = [];
  const envPriority = ENV_PRIORITY[options.network];
  const label = NETWORK_LABEL[options.network];

  checks.push(validatePrivateKey(envPriority.privateKey, label));
  checks.push(validateRpcUrlFormat(envPriority.rpcUrl, label));
  checks.push(await validateRpcConnectivity(envPriority.rpcUrl, NETWORK_CHAIN_IDS[options.network], label));
  checks.push(checkOptionalEnv('ETHERSCAN_API_KEY', 'Etherscan API key'));
  checks.push(checkOptionalEnv('GOVERNANCE_ADDRESS', 'Governance override (env)'));

  checks.push(...checkTokenAndPlan(options.network));
  checks.push(...checkEns(options.network));
  checks.push(...checkModuleConfigs(options.network));
  checks.push(...checkMigrationsBundle());
  checks.push(...checkTruffleConfig(options.network));
  checks.push(...checkTruffleScripts());

  try {
    const tokenAddress = getAddress(loadTokenConfig({ network: options.network }).config.address);
    checks.push(...checkAddressBook(tokenAddress));
  } catch (error) {
    checks.push({
      category: 'Post-Deploy',
      name: 'deployment-addresses.json',
      status: 'warn',
      detail: `Unable to cross-check address book token: ${(error as Error).message}`,
    });
  }

  const summary = summarise(checks);
  if (options.json) {
    process.stdout.write(
      `${JSON.stringify({ network: options.network, summary, checks }, null, 2)}\n`
    );
  } else {
    printHumanReadable(options.network, checks, summary);
  }

  if (summary.fail > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Preflight failed:', error);
  process.exitCode = 1;
});
