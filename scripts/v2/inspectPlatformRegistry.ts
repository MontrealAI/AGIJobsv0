import { ethers, network } from 'hardhat';
import type { Contract } from 'ethers';
import {
  loadPlatformRegistryConfig,
  loadTokenConfig,
  type PlatformRegistryConfig,
} from '../config';
import { collectPlatformRegistryState } from './lib/platformRegistryInspector';
import { formatToken, normaliseAddress } from './lib/utils';

interface CliOptions {
  json: boolean;
  configPath?: string;
  platformRegistryAddress?: string;
  fromBlock?: number;
  toBlock?: number;
  batchSize?: number;
  noLogs?: boolean;
}

function parseInteger(value: string | undefined, label: string): number {
  if (value === undefined) {
    throw new Error(`${label} requires a numeric value`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return parsed;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--json':
        options.json = true;
        break;
      case '--config': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error('--config requires a path');
        }
        options.configPath = value;
        i += 1;
        break;
      }
      case '--platform-registry':
      case '--platformRegistry': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error('--platform-registry requires an address');
        }
        options.platformRegistryAddress = value;
        i += 1;
        break;
      }
      case '--from-block':
      case '--fromBlock':
        options.fromBlock = parseInteger(argv[i + 1], arg);
        i += 1;
        break;
      case '--to-block':
      case '--toBlock':
        options.toBlock = parseInteger(argv[i + 1], arg);
        i += 1;
        break;
      case '--batch-size':
      case '--batchSize':
        options.batchSize = parseInteger(argv[i + 1], arg);
        i += 1;
        break;
      case '--no-logs':
      case '--skip-logs':
        options.noLogs = true;
        break;
      default:
        if (arg.startsWith('--')) {
          throw new Error(`Unrecognised flag: ${arg}`);
        }
        break;
    }
  }
  return options;
}

function normaliseMap(map?: Record<string, boolean>): Map<string, boolean> {
  const result = new Map<string, boolean>();
  if (!map) {
    return result;
  }
  for (const [key, value] of Object.entries(map)) {
    try {
      result.set(ethers.getAddress(key), Boolean(value));
    } catch (_) {
      // ignore invalid addresses; config loader should already sanitise
    }
  }
  return result;
}

function ensurePlatformRegistryAddress(
  config: PlatformRegistryConfig,
  override?: string,
  fallback?: string
): string {
  const candidate = override || config.address || fallback;
  if (!candidate) {
    throw new Error('Platform registry address is not configured');
  }
  const address = ethers.getAddress(candidate);
  if (address === ethers.ZeroAddress) {
    throw new Error('Platform registry address cannot be the zero address');
  }
  return address;
}

function printDivider(): void {
  console.log(''.padEnd(72, '-'));
}

function formatBlockInfo(
  blockNumber: number | null,
  txHash: string | null
): string {
  if (blockNumber === null) {
    return 'unknown';
  }
  const tx = txHash ? `, tx ${txHash}` : '';
  return `block ${blockNumber}${tx}`;
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));

  const { config: tokenConfig } = loadTokenConfig({
    network: network.name,
    chainId: network.config?.chainId,
  });

  const { config: registryConfig, path: configPath } = loadPlatformRegistryConfig({
    network: network.name,
    chainId: network.config?.chainId,
    path: cli.configPath,
  });

  const fallbackAddress = normaliseAddress(tokenConfig.modules?.platformRegistry, {
    allowZero: false,
  });

  const platformRegistryAddress = ensurePlatformRegistryAddress(
    registryConfig,
    cli.platformRegistryAddress,
    fallbackAddress
  );

  const platformRegistry = (await ethers.getContractAt(
    'contracts/v2/PlatformRegistry.sol:PlatformRegistry',
    platformRegistryAddress
  )) as Contract;

  const provider = ethers.provider;
  const latestBlock = await provider.getBlockNumber();

  const toBlock = cli.toBlock !== undefined ? cli.toBlock : latestBlock;
  const fromBlock = cli.fromBlock !== undefined ? cli.fromBlock : 0;
  if (fromBlock > toBlock) {
    throw new Error('--from-block cannot be greater than --to-block');
  }

  const configRegistrars = normaliseMap(registryConfig.registrars);
  const configBlacklist = normaliseMap(registryConfig.blacklist);

  const state = await collectPlatformRegistryState({
    platformRegistry,
    fromBlock,
    toBlock,
    batchSize: cli.batchSize,
    skipLogs: cli.noLogs ?? false,
    registrarAddressesToProbe: configRegistrars.keys(),
    blacklistAddressesToProbe: configBlacklist.keys(),
  });

  const decimals =
    typeof tokenConfig.decimals === 'number' ? tokenConfig.decimals : 18;
  const symbol =
    typeof tokenConfig.symbol === 'string' && tokenConfig.symbol
      ? tokenConfig.symbol
      : 'tokens';

  const registrarSummaries = Array.from(state.registrars.entries()).map(
    ([address, snapshot]) => ({
      address,
      allowed: snapshot.value,
      lastUpdatedBlock: snapshot.lastUpdatedBlock,
      transactionHash: snapshot.transactionHash,
      config: configRegistrars.get(address),
    })
  );
  registrarSummaries.sort((a, b) => a.address.localeCompare(b.address));

  const blacklistSummaries = Array.from(state.blacklist.entries()).map(
    ([address, snapshot]) => ({
      address,
      blacklisted: snapshot.value,
      lastUpdatedBlock: snapshot.lastUpdatedBlock,
      transactionHash: snapshot.transactionHash,
      config: configBlacklist.get(address),
    })
  );
  blacklistSummaries.sort((a, b) => a.address.localeCompare(b.address));

  const configRegistrarSet = new Set(configRegistrars.keys());
  registrarSummaries.forEach((entry) => configRegistrarSet.delete(entry.address));
  const missingRegistrarConfigs = Array.from(configRegistrarSet);

  const configBlacklistSet = new Set(configBlacklist.keys());
  blacklistSummaries.forEach((entry) => configBlacklistSet.delete(entry.address));
  const missingBlacklistConfigs = Array.from(configBlacklistSet);

  const output = {
    network: network.name,
    configPath,
    platformRegistry: platformRegistryAddress,
    core: {
      owner: state.owner,
      stakeManager: state.stakeManager,
      reputationEngine: state.reputationEngine,
      pauser: state.pauser,
      minPlatformStake: state.minPlatformStake.toString(),
      minPlatformStakeFormatted: formatToken(
        state.minPlatformStake,
        decimals,
        symbol
      ),
    },
    events: state.metadata,
    registrars: {
      entries: registrarSummaries,
      missingConfigEntries: missingRegistrarConfigs,
    },
    blacklist: {
      entries: blacklistSummaries,
      missingConfigEntries: missingBlacklistConfigs,
    },
  };

  if (cli.json) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  console.log(`PlatformRegistry inspection on network: ${network.name}`);
  console.log(`Configuration file: ${configPath}`);
  console.log(`PlatformRegistry address: ${platformRegistryAddress}`);
  printDivider();
  console.log('Core configuration:');
  console.log(`  Owner:            ${state.owner}`);
  console.log(`  StakeManager:     ${state.stakeManager}`);
  console.log(`  ReputationEngine: ${state.reputationEngine}`);
  console.log(
    `  Pauser:           ${state.pauser ?? 'not configured (owner-only pause)'}`
  );
  console.log(
    `  Min platform stake: ${formatToken(
      state.minPlatformStake,
      decimals,
      symbol
    )} (${state.minPlatformStake.toString()} base units)`
  );
  printDivider();
  console.log(
    `Events scanned from block ${state.metadata.fromBlock} to ${state.metadata.toBlock} ` +
      `(registrar events: ${state.metadata.registrarEvents}, blacklist events: ${state.metadata.blacklistEvents})`
  );
  printDivider();

  const activeRegistrars = registrarSummaries.filter((entry) => entry.allowed);
  const inactiveRegistrars = registrarSummaries.filter((entry) => !entry.allowed);

  console.log(`Active registrars (${activeRegistrars.length}):`);
  if (activeRegistrars.length === 0) {
    console.log('  • none');
  } else {
    activeRegistrars.forEach((entry) => {
      const configNote =
        entry.config === undefined
          ? 'not in config'
          : entry.config
          ? 'configured ✅'
          : 'configured as revoked ⚠️';
      console.log(
        `  • ${entry.address} — ${formatBlockInfo(
          entry.lastUpdatedBlock,
          entry.transactionHash
        )} (${configNote})`
      );
    });
  }

  console.log(`\nRevoked registrars (${inactiveRegistrars.length}):`);
  if (inactiveRegistrars.length === 0) {
    console.log('  • none');
  } else {
    inactiveRegistrars.forEach((entry) => {
      const configNote =
        entry.config === undefined
          ? 'not in config'
          : entry.config
          ? 'configured as active ⚠️'
          : 'configured ✅';
      console.log(
        `  • ${entry.address} — ${formatBlockInfo(
          entry.lastUpdatedBlock,
          entry.transactionHash
        )} (${configNote})`
      );
    });
  }

  if (missingRegistrarConfigs.length > 0) {
    console.log('\nWarning: configuration file is missing registrar entries for:');
    missingRegistrarConfigs.forEach((address) => console.log(`  • ${address}`));
  }

  printDivider();

  const activeBlacklist = blacklistSummaries.filter((entry) => entry.blacklisted);
  const clearedBlacklist = blacklistSummaries.filter((entry) => !entry.blacklisted);

  console.log(`Blacklisted operators (${activeBlacklist.length}):`);
  if (activeBlacklist.length === 0) {
    console.log('  • none');
  } else {
    activeBlacklist.forEach((entry) => {
      const configNote =
        entry.config === undefined
          ? 'not in config'
          : entry.config
          ? 'configured ✅'
          : 'configured as cleared ⚠️';
      console.log(
        `  • ${entry.address} — ${formatBlockInfo(
          entry.lastUpdatedBlock,
          entry.transactionHash
        )} (${configNote})`
      );
    });
  }

  console.log(`\nCleared blacklist entries (${clearedBlacklist.length}):`);
  if (clearedBlacklist.length === 0) {
    console.log('  • none');
  } else {
    clearedBlacklist.forEach((entry) => {
      const configNote =
        entry.config === undefined
          ? 'not in config'
          : entry.config
          ? 'configured as blacklisted ⚠️'
          : 'configured ✅';
      console.log(
        `  • ${entry.address} — ${formatBlockInfo(
          entry.lastUpdatedBlock,
          entry.transactionHash
        )} (${configNote})`
      );
    });
  }

  if (missingBlacklistConfigs.length > 0) {
    console.log('\nWarning: configuration file is missing blacklist entries for:');
    missingBlacklistConfigs.forEach((address) => console.log(`  • ${address}`));
  }

  printDivider();
  console.log('Inspection complete. Re-run with --json for machine-readable output.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
