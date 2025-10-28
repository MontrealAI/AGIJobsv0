import { Interface, JsonRpcProvider, namehash } from 'ethers';

import { createLogger } from '../utils/telemetry.js';

const logger = createLogger('ens-verifier');

const RESOLVER_INTERFACE = new Interface([
  'function addr(bytes32 node) external view returns (address)',
  'function ownerOf(uint256 id) external view returns (address)'
]);

export interface EnsVerifierConfig {
  providerUrl: string;
  ensRoot: string;
  nameWrapperAddress: string;
}

export interface EnsOwnershipProof {
  fqdn: string;
  owner: string | null;
  resolverAddress: string | null;
  isValid: boolean;
}

export class EnsVerifier {
  private readonly provider: JsonRpcProvider;
  private readonly config: EnsVerifierConfig;

  constructor(config: EnsVerifierConfig) {
    this.provider = new JsonRpcProvider(config.providerUrl);
    this.config = config;
  }

  async resolveAddress(fqdn: string): Promise<string | null> {
    try {
      const resolver = await this.provider.getResolver(fqdn);
      if (!resolver) {
        return null;
      }
      const address = await resolver.getAddress();
      return address ?? null;
    } catch (error) {
      logger.warn({ error, fqdn }, 'Failed to resolve ENS address');
      return null;
    }
  }

  async ownerOf(fqdn: string): Promise<string | null> {
    try {
      const hashed = namehash(fqdn);
      const result = await this.provider.call({
        to: this.config.nameWrapperAddress,
        data: RESOLVER_INTERFACE.encodeFunctionData('ownerOf', [hashed])
      });
      const [owner] = RESOLVER_INTERFACE.decodeFunctionResult('ownerOf', result);
      return (owner as string) ?? null;
    } catch (error) {
      logger.warn({ error, fqdn }, 'Failed to read ENS owner from NameWrapper');
      return null;
    }
  }

  async buildOwnershipProof(fqdn: string, expectedOwner?: string | null): Promise<EnsOwnershipProof> {
    const owner = await this.ownerOf(fqdn);
    const resolverAddress = await this.resolveAddress(fqdn);
    const isValid = Boolean(owner && resolverAddress && (!expectedOwner || owner === expectedOwner));
    return { fqdn, owner, resolverAddress, isValid };
  }
}
