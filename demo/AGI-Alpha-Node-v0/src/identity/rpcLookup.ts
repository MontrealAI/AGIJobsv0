import { Contract, JsonRpcProvider, namehash } from 'ethers';
import type { EnsLookup, EnsResolution } from './types';

const ENS_REGISTRY_ABI = [
  'function owner(bytes32 node) external view returns (address)',
  'function resolver(bytes32 node) external view returns (address)'
];

const NAME_WRAPPER_ABI = [
  'function ownerOf(uint256 id) external view returns (address)',
  'function getData(uint256 id) external view returns (address owner, uint32 fuses, uint64 expiry)'
];

const PUBLIC_RESOLVER_ABI = [
  'function addr(bytes32 node) external view returns (address)',
  'function text(bytes32 node, string key) external view returns (string)',
  'function contenthash(bytes32 node) external view returns (bytes)'
];

const TEXT_KEYS = ['agijobs:v2:node', 'url', 'description'];

export interface RpcEnsLookupOptions {
  readonly registry: string;
  readonly nameWrapper: string;
  readonly publicResolver?: string;
}

export class RpcEnsLookup implements EnsLookup {
  private readonly registry: Contract;
  private readonly nameWrapper: Contract;

  constructor(
    private readonly provider: JsonRpcProvider,
    private readonly options: RpcEnsLookupOptions
  ) {
    this.registry = new Contract(options.registry, ENS_REGISTRY_ABI, provider);
    this.nameWrapper = new Contract(options.nameWrapper, NAME_WRAPPER_ABI, provider);
  }

  async resolve(name: string): Promise<EnsResolution> {
    const node = namehash(name);
    const [owner, resolverAddress] = await Promise.all([
      this.registry.owner(node),
      this.registry.resolver(node)
    ]);

    let wrapperOwner: string | undefined;
    let expiry: number | undefined;
    try {
      const tokenId = BigInt(node);
      const data = await this.nameWrapper.getData(tokenId);
      wrapperOwner = data.owner;
      expiry = Number(data.expiry);
    } catch (error) {
      if (!/Execution reverted/i.test((error as Error).message)) {
        throw error;
      }
    }

    const records: Record<string, string> = {};
    let contentHash: string | null = null;

    if (resolverAddress && resolverAddress !== '0x0000000000000000000000000000000000000000') {
      const resolver = new Contract(resolverAddress, PUBLIC_RESOLVER_ABI, this.provider);
      for (const key of TEXT_KEYS) {
        try {
          const value: string = await resolver.text(node, key);
          if (value) {
            records[key] = value;
          }
        } catch (error) {
          if (!/revert|missing/i.test((error as Error).message)) {
            throw error;
          }
        }
      }
      try {
        const rawContent = await resolver.contenthash(node);
        if (rawContent && rawContent !== '0x') {
          contentHash = rawContent;
        }
      } catch (error) {
        if (!/revert|missing/i.test((error as Error).message)) {
          throw error;
        }
      }
    }

    return {
      owner,
      registrant: owner,
      wrapperOwner,
      expiry,
      contentHash,
      records
    };
  }
}
