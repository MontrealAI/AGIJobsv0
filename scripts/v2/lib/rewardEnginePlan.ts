import type { Contract } from 'ethers';
import { ethers } from 'ethers';
import type { RewardEngineThermoConfig, RoleShareInput } from '../../config';
import { ModulePlan, PlannedAction } from './types';
import {
  describeArgs,
  normaliseAddress,
  parseBigInt,
  sameAddress,
} from './utils';

const ROLE_KEYS = ['agent', 'validator', 'operator', 'employer'] as const;

const ROLE_INDEX: Record<(typeof ROLE_KEYS)[number], number> = {
  agent: 0,
  validator: 1,
  operator: 2,
  employer: 3,
};

const WAD = 1000000000000000000n;

function parseRoleShare(
  value: RoleShareInput | undefined,
  role: (typeof ROLE_KEYS)[number]
): bigint | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    if (value.wad !== undefined && value.wad !== null && value.wad !== '') {
      const wad = parseBigInt(value.wad, `rewardEngine.roleShares.${role}.wad`);
      if (wad === undefined) {
        return undefined;
      }
      if (wad < 0n) {
        throw new Error(
          `rewardEngine.roleShares.${role}.wad cannot be negative`
        );
      }
      return wad;
    }
    if (
      value.percent !== undefined &&
      value.percent !== null &&
      value.percent !== ''
    ) {
      return parseRoleShare(value.percent, role);
    }
  }

  const asString =
    typeof value === 'string' ? value.trim() : value.toString().trim();
  if (!asString) {
    return undefined;
  }
  const percent = Number(asString);
  if (!Number.isFinite(percent)) {
    throw new Error(
      `rewardEngine.roleShares.${role} must be a finite percentage or wad`
    );
  }
  if (percent < 0 || percent > 100) {
    throw new Error(
      `rewardEngine.roleShares.${role} must be between 0 and 100 percent`
    );
  }
  return ethers.parseUnits(percent.toString(), 16);
}

function formatBigint(value: bigint): string {
  return value.toString();
}

function parseUnsigned(value: unknown, label: string): bigint | undefined {
  const parsed = parseBigInt(value, label);
  if (parsed === undefined) {
    return undefined;
  }
  if (parsed < 0n) {
    throw new Error(`${label} cannot be negative`);
  }
  return parsed;
}

function parseBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  const normalised = value.toString().trim().toLowerCase();
  if (!normalised) {
    return undefined;
  }
  if (['true', '1', 'yes', 'y', 'on'].includes(normalised)) {
    return true;
  }
  if (['false', '0', 'no', 'n', 'off'].includes(normalised)) {
    return false;
  }
  throw new Error(`Unable to parse boolean value for ${value}`);
}

export interface RewardEnginePlanInput {
  rewardEngine: Contract;
  config: RewardEngineThermoConfig;
  configPath?: string;
}

export async function buildRewardEnginePlan(
  input: RewardEnginePlanInput
): Promise<ModulePlan> {
  const { rewardEngine, config, configPath } = input;
  const iface = rewardEngine.interface;

  const [
    currentTreasury,
    currentThermostat,
    currentFeePool,
    currentReputation,
    currentEnergyOracle,
    currentKappa,
    currentMaxProofs,
    currentTemperature,
  ] = await Promise.all([
    rewardEngine.treasury(),
    rewardEngine.thermostat(),
    rewardEngine.feePool(),
    rewardEngine.reputation(),
    rewardEngine.energyOracle(),
    rewardEngine.kappa(),
    rewardEngine.maxProofs(),
    rewardEngine.temperature(),
  ]);

  const currentRoleShares = await Promise.all(
    ROLE_KEYS.map((_, index) => rewardEngine.roleShare(index))
  );
  const currentMu = await Promise.all(
    ROLE_KEYS.map((_, index) => rewardEngine.mu(index))
  );
  const currentBaseline = await Promise.all(
    ROLE_KEYS.map((_, index) => rewardEngine.baselineEnergy(index))
  );

  const actions: PlannedAction[] = [];

  const desiredTreasury = normaliseAddress(config.treasury, {
    allowZero: false,
  });
  if (
    desiredTreasury &&
    !sameAddress(desiredTreasury, ethers.getAddress(currentTreasury))
  ) {
    actions.push({
      label: `Update treasury to ${desiredTreasury}`,
      method: 'setTreasury',
      args: [desiredTreasury],
      current: ethers.getAddress(currentTreasury),
      desired: desiredTreasury,
    });
  }

  const desiredThermostat = normaliseAddress(config.thermostat);
  const currentThermostatAddr = ethers.getAddress(currentThermostat);
  if (
    desiredThermostat !== undefined &&
    !sameAddress(
      desiredThermostat,
      currentThermostatAddr === ethers.ZeroAddress
        ? ethers.ZeroAddress
        : currentThermostatAddr
    )
  ) {
    actions.push({
      label: `Point to thermostat ${desiredThermostat}`,
      method: 'setThermostat',
      args: [desiredThermostat],
      current: currentThermostatAddr,
      desired: desiredThermostat,
    });
  }

  const desiredFeePool = normaliseAddress(config.feePool, { allowZero: false });
  if (
    desiredFeePool &&
    !sameAddress(desiredFeePool, ethers.getAddress(currentFeePool))
  ) {
    actions.push({
      label: `Update fee pool to ${desiredFeePool}`,
      method: 'setFeePool',
      args: [desiredFeePool],
      current: ethers.getAddress(currentFeePool),
      desired: desiredFeePool,
    });
  }

  const desiredReputation = normaliseAddress(config.reputation, {
    allowZero: false,
  });
  if (
    desiredReputation &&
    !sameAddress(desiredReputation, ethers.getAddress(currentReputation))
  ) {
    actions.push({
      label: `Update reputation engine to ${desiredReputation}`,
      method: 'setReputationEngine',
      args: [desiredReputation],
      current: ethers.getAddress(currentReputation),
      desired: desiredReputation,
    });
  }

  const desiredEnergyOracle = normaliseAddress(config.energyOracle, {
    allowZero: false,
  });
  if (
    desiredEnergyOracle &&
    !sameAddress(desiredEnergyOracle, ethers.getAddress(currentEnergyOracle))
  ) {
    actions.push({
      label: `Update energy oracle to ${desiredEnergyOracle}`,
      method: 'setEnergyOracle',
      args: [desiredEnergyOracle],
      current: ethers.getAddress(currentEnergyOracle),
      desired: desiredEnergyOracle,
    });
  }

  const desiredShares: Record<(typeof ROLE_KEYS)[number], bigint> = {
    agent: currentRoleShares[0],
    validator: currentRoleShares[1],
    operator: currentRoleShares[2],
    employer: currentRoleShares[3],
  };
  let sharesChanged = false;
  for (const role of ROLE_KEYS) {
    const desired = parseRoleShare(config.roleShares?.[role], role);
    if (desired !== undefined) {
      desiredShares[role] = desired;
      const index = ROLE_INDEX[role];
      if (desired !== currentRoleShares[index]) {
        sharesChanged = true;
      }
    }
  }

  if (sharesChanged) {
    const total = ROLE_KEYS.reduce<bigint>(
      (acc, role) => acc + desiredShares[role],
      0n
    );
    if (total !== WAD) {
      throw new Error(
        `Role share totals must equal 100%. Provided sum: ${total.toString()}`
      );
    }
    actions.push({
      label: 'Rebalance role shares',
      method: 'setRoleShares',
      args: ROLE_KEYS.map((role) => desiredShares[role]),
      notes: ROLE_KEYS.map(
        (role, index) =>
          `${role}: ${formatBigint(currentRoleShares[index])} -> ${formatBigint(
            desiredShares[role]
          )}`
      ),
    });
  }

  for (const role of ROLE_KEYS) {
    const desiredMu = parseBigInt(
      config.mu?.[role],
      `rewardEngine.mu.${role}`,
      { allowNegative: true }
    );
    const index = ROLE_INDEX[role];
    if (desiredMu !== undefined && desiredMu !== currentMu[index]) {
      actions.push({
        label: `Update mu for ${role}`,
        method: 'setMu',
        args: [index, desiredMu],
        current: formatBigint(currentMu[index]),
        desired: formatBigint(desiredMu),
      });
    }
  }

  for (const role of ROLE_KEYS) {
    const desiredBaseline = parseBigInt(
      config.baselineEnergy?.[role],
      `rewardEngine.baselineEnergy.${role}`,
      { allowNegative: true }
    );
    const index = ROLE_INDEX[role];
    if (
      desiredBaseline !== undefined &&
      desiredBaseline !== currentBaseline[index]
    ) {
      actions.push({
        label: `Update baseline energy for ${role}`,
        method: 'setBaselineEnergy',
        args: [index, desiredBaseline],
        current: formatBigint(currentBaseline[index]),
        desired: formatBigint(desiredBaseline),
      });
    }
  }

  const desiredKappa = parseUnsigned(config.kappa, 'rewardEngine.kappa');
  if (desiredKappa !== undefined && desiredKappa !== currentKappa) {
    actions.push({
      label: `Set kappa to ${desiredKappa.toString()}`,
      method: 'setKappa',
      args: [desiredKappa],
      current: currentKappa.toString(),
      desired: desiredKappa.toString(),
    });
  }

  const desiredMaxProofs = parseUnsigned(
    config.maxProofs,
    'rewardEngine.maxProofs'
  );
  if (desiredMaxProofs !== undefined && desiredMaxProofs !== currentMaxProofs) {
    actions.push({
      label: `Update max proofs to ${desiredMaxProofs.toString()}`,
      method: 'setMaxProofs',
      args: [desiredMaxProofs],
      current: currentMaxProofs.toString(),
      desired: desiredMaxProofs.toString(),
    });
  }

  const desiredTemperature = parseBigInt(
    config.temperature,
    'rewardEngine.temperature',
    { allowNegative: false }
  );
  if (
    desiredTemperature !== undefined &&
    desiredTemperature !== currentTemperature
  ) {
    actions.push({
      label: `Set fallback temperature to ${desiredTemperature.toString()}`,
      method: 'setTemperature',
      args: [desiredTemperature],
      current: currentTemperature.toString(),
      desired: desiredTemperature.toString(),
    });
  }

  if (config.settlers && Object.keys(config.settlers).length) {
    const entries = Object.entries(config.settlers);
    const currentStates = await Promise.all(
      entries.map(([address]) => rewardEngine.settlers(address))
    );
    entries.forEach(([address, desired], index) => {
      const desiredBool = parseBoolean(desired);
      if (desiredBool === undefined) {
        return;
      }
      if (currentStates[index] !== desiredBool) {
        actions.push({
          label: `${
            desiredBool ? 'Authorize' : 'Revoke'
          } settler ${ethers.getAddress(address)}`,
          method: 'setSettler',
          args: [ethers.getAddress(address), desiredBool],
          current: currentStates[index] ? 'true' : 'false',
          desired: desiredBool ? 'true' : 'false',
        });
      }
    });
  }

  return {
    module: 'RewardEngineMB',
    address: rewardEngine.target as string,
    actions,
    configPath,
    iface,
    contract: rewardEngine,
  };
}

export function renderRewardEnginePlan(plan: ModulePlan): string {
  if (plan.actions.length === 0) {
    return 'All tracked parameters already match the configuration.';
  }
  const lines: string[] = [];
  plan.actions.forEach((action, index) => {
    const data = plan.iface?.encodeFunctionData(action.method, action.args);
    lines.push(`${index + 1}. ${action.label}`);
    if (action.current !== undefined) {
      lines.push(`   Current: ${action.current}`);
    }
    if (action.desired !== undefined) {
      lines.push(`   Desired: ${action.desired}`);
    }
    action.notes?.forEach((note) => lines.push(`   Note: ${note}`));
    lines.push(`   Method: ${action.method}(${describeArgs(action.args)})`);
    if (data) {
      lines.push(`   Calldata: ${data}`);
    }
    lines.push('');
  });
  return lines.join('\n');
}
