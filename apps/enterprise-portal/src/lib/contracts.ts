import { Contract, JsonRpcProvider, Signer } from 'ethers';
import { jobRegistryAbi } from './abis/jobRegistry';
import { taxPolicyAbi } from './abis/taxPolicy';
import { certificateNftAbi } from './abis/certificateNft';
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
