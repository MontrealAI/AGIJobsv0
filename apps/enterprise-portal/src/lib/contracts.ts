import { Contract, JsonRpcProvider, Signer } from 'ethers';
import { jobRegistryAbi } from './abis/jobRegistry';
import { taxPolicyAbi } from './abis/taxPolicy';
import { certificateNftAbi } from './abis/certificateNft';
import { validationModuleAbi } from './abis/validationModule';
import { stakeManagerAbi } from './abis/stakeManager';
import { erc20Abi } from './abis/erc20';
import { loadPortalConfiguration } from './config';

export const portalConfig = loadPortalConfiguration();

export const createReadOnlyProvider = (): JsonRpcProvider => {
  return new JsonRpcProvider(portalConfig.rpcUrl, portalConfig.chainId);
};

const providerCache = new Map<string, Contract>();

export const getJobRegistryContract = (signerOrProvider?: Signer | JsonRpcProvider) => {
  const conn = signerOrProvider ?? createReadOnlyProvider();
  const key = `jobRegistry:${conn instanceof JsonRpcProvider ? 'provider' : 'signer'}`;
  if (!signerOrProvider && providerCache.has(key)) {
    return providerCache.get(key)!;
  }
  const contract = new Contract(portalConfig.jobRegistryAddress, jobRegistryAbi, conn);
  if (!signerOrProvider) {
    providerCache.set(key, contract);
  }
  return contract;
};

export const getTaxPolicyContract = (signerOrProvider?: Signer | JsonRpcProvider) => {
  const conn = signerOrProvider ?? createReadOnlyProvider();
  const key = `taxPolicy:${conn instanceof JsonRpcProvider ? 'provider' : 'signer'}`;
  if (!signerOrProvider && providerCache.has(key)) {
    return providerCache.get(key)!;
  }
  const contract = new Contract(portalConfig.taxPolicyAddress, taxPolicyAbi, conn);
  if (!signerOrProvider) {
    providerCache.set(key, contract);
  }
  return contract;
};

export const getCertificateNFTContract = (signerOrProvider?: Signer | JsonRpcProvider) => {
  const conn = signerOrProvider ?? createReadOnlyProvider();
  const key = `certificate:${conn instanceof JsonRpcProvider ? 'provider' : 'signer'}`;
  if (!signerOrProvider && providerCache.has(key)) {
    return providerCache.get(key)!;
  }
  const contract = new Contract(portalConfig.certificateNFTAddress, certificateNftAbi, conn);
  if (!signerOrProvider) {
    providerCache.set(key, contract);
  }
  return contract;
};

export const getValidationModuleContract = (
  signerOrProvider?: Signer | JsonRpcProvider
) => {
  const address = portalConfig.validationModuleAddress;
  if (!address) return undefined;
  const conn = signerOrProvider ?? createReadOnlyProvider();
  const key = `validationModule:${conn instanceof JsonRpcProvider ? 'provider' : 'signer'}`;
  if (!signerOrProvider && providerCache.has(key)) {
    return providerCache.get(key)!;
  }
  const contract = new Contract(address, validationModuleAbi, conn);
  if (!signerOrProvider) {
    providerCache.set(key, contract);
  }
  return contract;
};

export const getStakeManagerContract = (
  signerOrProvider?: Signer | JsonRpcProvider
) => {
  const address = portalConfig.stakeManagerAddress;
  if (!address) return undefined;
  const conn = signerOrProvider ?? createReadOnlyProvider();
  const key = `stakeManager:${conn instanceof JsonRpcProvider ? 'provider' : 'signer'}`;
  if (!signerOrProvider && providerCache.has(key)) {
    return providerCache.get(key)!;
  }
  const contract = new Contract(address, stakeManagerAbi, conn);
  if (!signerOrProvider) {
    providerCache.set(key, contract);
  }
  return contract;
};

export const getStakingTokenContract = (
  signerOrProvider?: Signer | JsonRpcProvider
) => {
  const address = portalConfig.stakingTokenAddress;
  if (!address) return undefined;
  const conn = signerOrProvider ?? createReadOnlyProvider();
  const key = `stakingToken:${conn instanceof JsonRpcProvider ? 'provider' : 'signer'}`;
  if (!signerOrProvider && providerCache.has(key)) {
    return providerCache.get(key)!;
  }
  const contract = new Contract(address, erc20Abi, conn);
  if (!signerOrProvider) {
    providerCache.set(key, contract);
  }
  return contract;
};
