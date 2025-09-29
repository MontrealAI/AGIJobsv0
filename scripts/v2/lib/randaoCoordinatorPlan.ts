import { ethers } from 'ethers';
import type { Contract, ContractRunner } from 'ethers';
import { type RandaoCoordinatorConfig } from '../../config';
import { type ModulePlan, type PlannedAction } from './types';

const ABI = [
  'function commitWindow() view returns (uint256)',
  'function revealWindow() view returns (uint256)',
  'function deposit() view returns (uint256)',
  'function treasury() view returns (address)',
  'function token() view returns (address)',
  'function setCommitWindow(uint256)',
  'function setRevealWindow(uint256)',
  'function setDeposit(uint256)',
  'function setTreasury(address)',
  'function setToken(address)'
];

const TOKEN_METADATA_ABI = [
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)'
];

type TokenMetadata = {
  symbol: string;
  decimals: number;
};

export interface RandaoCoordinatorPlanInput {
  randao: Contract;
  config: RandaoCoordinatorConfig;
  configPath?: string;
}

function formatSeconds(value: bigint | number | undefined): string {
  if (value === undefined) {
    return 'unset';
  }
  const seconds = typeof value === 'bigint' ? Number(value) : value;
  if (!Number.isFinite(seconds)) {
    return value.toString();
  }
  if (seconds === 0) {
    return '0 seconds';
  }
  if (seconds % 3600 === 0) {
    const hours = seconds / 3600;
    return `${hours} hour${hours === 1 ? '' : 's'} (${seconds}s)`;
  }
  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${minutes} minute${minutes === 1 ? '' : 's'} (${seconds}s)`;
  }
  return `${seconds} seconds`;
}

async function fetchTokenMetadata(
  randao: Contract,
  tokenAddress: string
): Promise<TokenMetadata> {
  const defaultMetadata: TokenMetadata = { symbol: 'AGIALPHA', decimals: 18 };
  if (!tokenAddress || tokenAddress === ethers.ZeroAddress) {
    return defaultMetadata;
  }

  const runner: ContractRunner | null =
    (randao.runner as ContractRunner | null) ?? randao.provider ?? null;
  if (!runner) {
    return defaultMetadata;
  }

  const contract = new ethers.Contract(tokenAddress, TOKEN_METADATA_ABI, runner);
  let symbol = defaultMetadata.symbol;
  let decimals = defaultMetadata.decimals;

  try {
    const resolved = await contract.symbol();
    if (typeof resolved === 'string' && resolved.length > 0) {
      symbol = resolved;
    }
  } catch (_) {
    // ignore symbol failures
  }

  try {
    const resolved = await contract.decimals();
    const parsed = Number(resolved);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 255) {
      decimals = parsed;
    }
  } catch (_) {
    // ignore decimals failures
  }

  return { symbol, decimals };
}

function formatTokenAmount(amount: bigint, metadata: TokenMetadata): string {
  const decimals = Number.isFinite(metadata.decimals)
    ? Number(metadata.decimals)
    : 18;
  const symbol = metadata.symbol ?? 'TOKEN';
  return `${ethers.formatUnits(amount, decimals)} ${symbol}`;
}

export async function buildRandaoCoordinatorPlan(
  input: RandaoCoordinatorPlanInput
): Promise<ModulePlan> {
  const { randao, config, configPath } = input;
  const address = await randao.getAddress();
  const iface = new ethers.Interface(ABI);

  const [
    currentCommitWindow,
    currentRevealWindow,
    currentDeposit,
    currentTreasury,
    currentToken
  ] = await Promise.all([
    randao.commitWindow(),
    randao.revealWindow(),
    randao.deposit(),
    randao.treasury(),
    randao.token()
  ]);

  const currentTokenAddress = ethers.getAddress(currentToken);
  const currentTokenMetadata = await fetchTokenMetadata(randao, currentTokenAddress);
  let desiredTokenAddress = currentTokenAddress;
  let desiredTokenMetadata = currentTokenMetadata;

  const actions: PlannedAction[] = [];
  const warnings: string[] = [];

  if (config.token !== undefined) {
    const desired = ethers.getAddress(config.token);
    desiredTokenAddress = desired;
    if (desired !== currentTokenAddress) {
      desiredTokenMetadata = await fetchTokenMetadata(randao, desired);
      actions.push({
        label: 'Update deposit token',
        method: 'setToken',
        args: [desired],
        current: currentTokenAddress,
        desired
      });
    }
  } else {
    warnings.push('token missing from configuration; leaving current value.');
  }

  if (config.commitWindow !== undefined) {
    const desired = BigInt(config.commitWindow);
    if (currentCommitWindow !== desired) {
      actions.push({
        label: 'Update commit window',
        method: 'setCommitWindow',
        args: [desired],
        current: formatSeconds(currentCommitWindow),
        desired: formatSeconds(desired)
      });
    }
  } else {
    warnings.push('commitWindow missing from configuration; leaving current value.');
  }

  if (config.revealWindow !== undefined) {
    const desired = BigInt(config.revealWindow);
    if (currentRevealWindow !== desired) {
      actions.push({
        label: 'Update reveal window',
        method: 'setRevealWindow',
        args: [desired],
        current: formatSeconds(currentRevealWindow),
        desired: formatSeconds(desired)
      });
    }
  } else {
    warnings.push('revealWindow missing from configuration; leaving current value.');
  }

  if (config.deposit !== undefined) {
    const desired = ethers.getBigInt(config.deposit);
    if (currentDeposit !== desired) {
      actions.push({
        label: 'Update deposit requirement',
        method: 'setDeposit',
        args: [desired],
        current: formatTokenAmount(currentDeposit, currentTokenMetadata),
        desired: formatTokenAmount(desired, desiredTokenMetadata)
      });
    }
  } else {
    warnings.push('deposit missing from configuration; leaving current value.');
  }

  if (config.treasury !== undefined) {
    const desired = ethers.getAddress(config.treasury);
    if (ethers.getAddress(currentTreasury) !== desired) {
      actions.push({
        label: 'Update treasury address',
        method: 'setTreasury',
        args: [desired],
        current: ethers.getAddress(currentTreasury),
        desired
      });
    }
  } else {
    warnings.push('treasury missing from configuration; leaving current value.');
  }

  return {
    module: 'RandaoCoordinator',
    address,
    configPath,
    actions,
    warnings: warnings.length ? warnings : undefined,
    iface,
    contract: randao
  };
}
