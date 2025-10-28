import { Contract, ContractRunner, Interface } from 'ethers';
import stakeManagerAbi from '../../../../scripts/v2/lib/prebuilt/StakeManager.json';
import feePoolAbi from '../../../../scripts/v2/lib/prebuilt/FeePool.json';
import jobRegistryAbi from '../../../../scripts/v2/lib/prebuilt/JobRegistry.json';
import identityRegistryAbi from '../../../../scripts/v2/lib/prebuilt/IdentityRegistry.json';

const PLATFORM_INCENTIVES_ABI = new Interface([
  'function stakeAndActivate(uint256 amount) external',
  'function acknowledgeStakeAndActivate(uint256 amount) external',
  'function stakeManager() external view returns (address)',
  'event Activated(address indexed operator, uint256 amount)'
]);

const PLATFORM_REGISTRY_ABI = new Interface([
  'function registered(address operator) external view returns (bool)',
  'function minPlatformStake() external view returns (uint256)',
  'function stakeManager() external view returns (address)',
  'function blacklist(address operator) external view returns (bool)'
]);

const ERC20_ABI = new Interface([
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)'
]);

const SYSTEM_PAUSE_ABI = new Interface([
  'function paused() external view returns (bool)'
]);

export type StakeManagerContract = Contract;
export type PlatformIncentivesContract = Contract;
export type PlatformRegistryContract = Contract;
export type FeePoolContract = Contract;
export type IdentityRegistryContract = Contract;
export type JobRegistryContract = Contract;
export type Erc20Contract = Contract;
export type SystemPauseContract = Contract;

export function connectStakeManager(address: string, runner: ContractRunner): StakeManagerContract {
  return new Contract(address, stakeManagerAbi.abi, runner);
}

export function connectPlatformIncentives(
  address: string,
  runner: ContractRunner
): PlatformIncentivesContract {
  return new Contract(address, PLATFORM_INCENTIVES_ABI, runner);
}

export function connectPlatformRegistry(
  address: string,
  runner: ContractRunner
): PlatformRegistryContract {
  return new Contract(address, PLATFORM_REGISTRY_ABI, runner);
}

export function connectFeePool(address: string, runner: ContractRunner): FeePoolContract {
  return new Contract(address, feePoolAbi.abi, runner);
}

export function connectJobRegistry(address: string, runner: ContractRunner): JobRegistryContract {
  return new Contract(address, jobRegistryAbi.abi, runner);
}

export function connectIdentityRegistry(
  address: string,
  runner: ContractRunner
): IdentityRegistryContract {
  return new Contract(address, identityRegistryAbi.abi, runner);
}

export function connectToken(address: string, runner: ContractRunner): Erc20Contract {
  return new Contract(address, ERC20_ABI, runner);
}

export function connectSystemPause(address: string, runner: ContractRunner): SystemPauseContract {
  return new Contract(address, SYSTEM_PAUSE_ABI, runner);
}
