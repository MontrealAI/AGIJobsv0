import { Wallet, getAddress } from 'ethers';
import { NormalisedAlphaNodeConfig } from '../config';
import { connectPlatformRegistry, connectSystemPause } from './contracts';

export interface GovernanceSnapshot {
  readonly operator: string;
  readonly governance: string;
  readonly paused: boolean;
  readonly operatorIsGovernance: boolean;
  readonly operatorBlacklisted: boolean;
}

export async function fetchGovernanceSnapshot(
  signer: Wallet,
  config: NormalisedAlphaNodeConfig
): Promise<GovernanceSnapshot> {
  const platformRegistry = connectPlatformRegistry(
    config.contracts.platformRegistry,
    signer
  );
  const systemPause = connectSystemPause(config.contracts.systemPause, signer);
  const operatorAddress = getAddress(await signer.getAddress());

  const [governance, paused, blacklisted] = await Promise.all([
    systemPause.governance(),
    systemPause.paused(),
    platformRegistry.blacklist(operatorAddress),
  ]);

  const governanceAddress = getAddress(governance);

  return {
    operator: operatorAddress,
    governance: governanceAddress,
    paused: Boolean(paused),
    operatorIsGovernance:
      governanceAddress.toLowerCase() === operatorAddress.toLowerCase(),
    operatorBlacklisted: Boolean(blacklisted),
  };
}
