import type { Contract } from 'ethers';
import { ethers } from 'ethers';
import type { EnergyOracleConfig } from '../../config';
import { ModulePlan, PlannedAction } from './types';

export interface EnergyOraclePlanInput {
  oracle: Contract;
  config: EnergyOracleConfig;
  configPath?: string;
  ownerAddress: string;
  retainUnknown?: boolean;
}

function dedupeSorted(addresses: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  addresses.forEach((addr) => {
    const normalised = ethers.getAddress(addr);
    if (!seen.has(normalised)) {
      seen.add(normalised);
      result.push(normalised);
    }
  });
  result.sort((a, b) => a.localeCompare(b));
  return result;
}

export async function buildEnergyOraclePlan(
  input: EnergyOraclePlanInput
): Promise<ModulePlan> {
  const { oracle, config, configPath, ownerAddress } = input;
  const retainUnknown =
    input.retainUnknown ?? config.retainUnknown ?? false;

  const [oracleAddress, currentSignersRaw] = await Promise.all([
    oracle.getAddress(),
    oracle.getSigners(),
  ]);

  const currentSigners = dedupeSorted(currentSignersRaw);
  const desiredSigners = dedupeSorted(config.signers ?? []);

  const currentSet = new Set(currentSigners);
  const desiredSet = new Set(desiredSigners);

  const actions: PlannedAction[] = [];
  const warnings: string[] = [];

  desiredSigners.forEach((addr) => {
    if (!currentSet.has(addr)) {
      actions.push({
        label: `Authorize signer ${addr}`,
        method: 'setSigner',
        args: [addr, true],
        current: 'unauthorised',
        desired: 'authorised',
      });
    }
  });

  if (!retainUnknown) {
    currentSigners.forEach((addr) => {
      if (!desiredSet.has(addr)) {
        actions.push({
          label: `Revoke signer ${addr}`,
          method: 'setSigner',
          args: [addr, false],
          current: 'authorised',
          desired: 'revoked',
        });
      }
    });
  } else if (desiredSigners.length === 0 && currentSigners.length > 0) {
    warnings.push(
      'retainUnknown is enabled and no desired signers are specified; existing signers will be left unchanged.'
    );
  }

  const plan: ModulePlan = {
    module: 'EnergyOracle',
    address: ethers.getAddress(oracleAddress),
    actions,
    configPath,
    warnings: warnings.length ? warnings : undefined,
    metadata: {
      ownerAddress: ethers.getAddress(ownerAddress),
      retainUnknown,
      currentSigners,
      desiredSigners,
    },
    iface: oracle.interface,
    contract: oracle,
  };

  return plan;
}
