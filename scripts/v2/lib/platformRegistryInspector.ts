import { ethers } from 'ethers';
import type { Contract, ContractRunner, Log, Provider } from 'ethers';

export interface AddressSnapshot {
  value: boolean;
  lastUpdatedBlock: number | null;
  transactionHash: string | null;
}

export interface PlatformRegistryState {
  owner: string;
  stakeManager: string;
  reputationEngine: string;
  pauser: string | null;
  minPlatformStake: bigint;
  registrars: Map<string, AddressSnapshot>;
  blacklist: Map<string, AddressSnapshot>;
  metadata: {
    fromBlock: number;
    toBlock: number;
    batchSize: number;
    registrarEvents: number;
    blacklistEvents: number;
  };
}

export interface CollectPlatformRegistryStateOptions {
  platformRegistry: Contract;
  fromBlock?: number;
  toBlock?: number;
  batchSize?: number;
  skipLogs?: boolean;
  addressesToProbe?: Iterable<string>;
  registrarAddressesToProbe?: Iterable<string>;
  blacklistAddressesToProbe?: Iterable<string>;
  provider?: Provider;
}

type AddressEvent = {
  address: string;
  value: boolean;
  blockNumber: number;
  transactionHash: string;
};

type AddressEventInfo = {
  blockNumber: number;
  transactionHash: string;
  value: boolean;
};

function resolveProvider(
  contract: Contract,
  explicit?: Provider
): Provider {
  if (explicit) {
    return explicit;
  }

  const runner: ContractRunner | null | undefined = contract.runner;
  if (runner && typeof (runner as any).provider === 'object') {
    const provider = (runner as any).provider as Provider;
    if (provider) {
      return provider;
    }
  }

  if ((contract as any).provider) {
    return (contract as any).provider as Provider;
  }

  if (ethers.getDefaultProvider) {
    try {
      const defaultProvider = ethers.getDefaultProvider();
      if (defaultProvider) {
        return defaultProvider;
      }
    } catch (_) {
      // ignore default provider errors
    }
  }

  if (ethers.provider) {
    return ethers.provider;
  }

  throw new Error('Unable to resolve a provider for PlatformRegistry introspection');
}

function coerceBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'bigint') {
    return value !== 0n;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === '0' || trimmed === 'false') {
      return false;
    }
    if (trimmed === '1' || trimmed === 'true') {
      return true;
    }
  }
  return Boolean(value);
}

function normaliseAddresses(values?: Iterable<string>): string[] {
  if (!values) {
    return [];
  }
  const unique = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    try {
      unique.add(ethers.getAddress(value));
    } catch (_) {
      // ignore malformed addresses
    }
  }
  return Array.from(unique);
}

async function fetchAddressEvents(
  provider: Provider,
  iface: ethers.Interface,
  address: string,
  eventName: string,
  addressIndex: number,
  statusIndex: number | null,
  fromBlock: number,
  toBlock: number,
  batchSize: number
): Promise<AddressEvent[]> {
  const fragment = iface.getEvent(eventName);
  const topic = fragment.topicHash;
  const inputNames = fragment.inputs.map((input) => input.name || '');
  const events: AddressEvent[] = [];
  let start = fromBlock;
  while (start <= toBlock) {
    const end = Math.min(start + batchSize - 1, toBlock);
    const logs: Log[] = await provider.getLogs({
      address,
      topics: [topic],
      fromBlock: start,
      toBlock: end,
    });
    for (const log of logs) {
      try {
        const parsed = iface.parseLog(log);
        const args = parsed.args as any;
        const addressValue =
          args[addressIndex] ?? args[inputNames[addressIndex] || addressIndex];
        const statusValue =
          statusIndex === null
            ? undefined
            : args[statusIndex] ?? args[inputNames[statusIndex] || statusIndex];
        const parsedAddress = ethers.getAddress(String(addressValue));
        const parsedValue =
          statusIndex === null ? false : coerceBoolean(statusValue);
        events.push({
          address: parsedAddress,
          value: parsedValue,
          blockNumber: log.blockNumber ?? 0,
          transactionHash: log.transactionHash,
        });
      } catch (_) {
        // ignore logs that fail to parse
      }
    }
    start = end + 1;
  }
  return events;
}

function latestEventInfo(events: AddressEvent[]): Map<string, AddressEventInfo> {
  const map = new Map<string, AddressEventInfo>();
  events.forEach((event) => {
    map.set(event.address, {
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      value: event.value,
    });
  });
  return map;
}

export async function collectPlatformRegistryState(
  options: CollectPlatformRegistryStateOptions
): Promise<PlatformRegistryState> {
  const contract = options.platformRegistry;
  const provider = resolveProvider(contract, options.provider);

  const batchSize = Math.max(1, options.batchSize ?? 50_000);
  const toBlock = options.toBlock ?? (await provider.getBlockNumber());
  const requestedFrom = options.fromBlock ?? 0;
  if (requestedFrom > toBlock) {
    throw new Error('fromBlock cannot be greater than toBlock');
  }
  const fromBlock = Math.max(0, requestedFrom);

  const [
    owner,
    stakeManager,
    reputationEngine,
    minPlatformStake,
    pauser,
    contractAddress,
  ] = await Promise.all([
    contract.owner(),
    contract.stakeManager(),
    contract.reputationEngine(),
    contract.minPlatformStake(),
    contract.pauser(),
    contract.getAddress(),
  ]);

  const registrars = new Map<string, AddressSnapshot>();
  const blacklist = new Map<string, AddressSnapshot>();

  let registrarEvents: AddressEvent[] = [];
  let blacklistEvents: AddressEvent[] = [];

  if (!options.skipLogs) {
    const iface = contract.interface;
    registrarEvents = await fetchAddressEvents(
      provider,
      iface,
      contractAddress,
      'RegistrarUpdated',
      0,
      1,
      fromBlock,
      toBlock,
      batchSize
    );
    blacklistEvents = await fetchAddressEvents(
      provider,
      iface,
      contractAddress,
      'Blacklisted',
      0,
      1,
      fromBlock,
      toBlock,
      batchSize
    );
  }

  const registrarEventInfo = latestEventInfo(registrarEvents);
  const blacklistEventInfo = latestEventInfo(blacklistEvents);

  const registrarAddresses = new Set<string>(
    normaliseAddresses(options.registrarAddressesToProbe)
  );
  const blacklistAddresses = new Set<string>(
    normaliseAddresses(options.blacklistAddressesToProbe)
  );

  const generalProbeAddresses = normaliseAddresses(options.addressesToProbe);
  generalProbeAddresses.forEach((address) => {
    registrarAddresses.add(address);
    blacklistAddresses.add(address);
  });

  registrarEventInfo.forEach((_, address) => registrarAddresses.add(address));
  blacklistEventInfo.forEach((_, address) => blacklistAddresses.add(address));

  const registrarStatuses = await Promise.all(
    Array.from(registrarAddresses).map(async (address) => {
      const value = await contract.registrars(address);
      return { address, value: coerceBoolean(value) };
    })
  );

  registrarStatuses.forEach(({ address, value }) => {
    const info = registrarEventInfo.get(address);
    registrars.set(address, {
      value,
      lastUpdatedBlock: info?.blockNumber ?? null,
      transactionHash: info?.transactionHash ?? null,
    });
  });

  const blacklistStatuses = await Promise.all(
    Array.from(blacklistAddresses).map(async (address) => {
      const value = await contract.blacklist(address);
      return { address, value: coerceBoolean(value) };
    })
  );

  blacklistStatuses.forEach(({ address, value }) => {
    const info = blacklistEventInfo.get(address);
    blacklist.set(address, {
      value,
      lastUpdatedBlock: info?.blockNumber ?? null,
      transactionHash: info?.transactionHash ?? null,
    });
  });

  return {
    owner: ethers.getAddress(owner),
    stakeManager: ethers.getAddress(stakeManager),
    reputationEngine: ethers.getAddress(reputationEngine),
    pauser: pauser === ethers.ZeroAddress ? null : ethers.getAddress(pauser),
    minPlatformStake: BigInt(minPlatformStake),
    registrars,
    blacklist,
    metadata: {
      fromBlock,
      toBlock,
      batchSize,
      registrarEvents: registrarEvents.length,
      blacklistEvents: blacklistEvents.length,
    },
  };
}
