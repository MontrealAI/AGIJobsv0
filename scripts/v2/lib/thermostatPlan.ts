import type { Contract } from 'ethers';
import type { ThermostatConfigInput } from '../../config';
import { ModulePlan, PlannedAction } from './types';
import { describeArgs, parseBigInt } from './utils';

const ROLE_KEYS = ['agent', 'validator', 'operator', 'employer'] as const;
const ROLE_INDEX: Record<(typeof ROLE_KEYS)[number], number> = {
  agent: 0,
  validator: 1,
  operator: 2,
  employer: 3,
};

function parseSigned(
  value: unknown,
  label: string,
  { allowZero = false }: { allowZero?: boolean } = {}
): bigint | undefined {
  const parsed = parseBigInt(value, label, { allowNegative: true });
  if (parsed === undefined) {
    return undefined;
  }
  if (!allowZero && parsed === 0n) {
    throw new Error(`${label} cannot be zero`);
  }
  return parsed;
}

function parsePositive(value: unknown, label: string): bigint | undefined {
  const parsed = parseBigInt(value, label, { allowNegative: false });
  if (parsed === undefined) {
    return undefined;
  }
  if (parsed <= 0n) {
    throw new Error(`${label} must be greater than zero`);
  }
  return parsed;
}

export interface ThermostatPlanInput {
  thermostat: Contract;
  config: ThermostatConfigInput;
  configPath?: string;
}

export async function buildThermostatPlan(
  input: ThermostatPlanInput
): Promise<ModulePlan> {
  const { thermostat, config, configPath } = input;
  const iface = thermostat.interface;

  const [
    currentSystemTemp,
    currentMinTemp,
    currentMaxTemp,
    currentIntegralMin,
    currentIntegralMax,
    currentKp,
    currentKi,
    currentKd,
    currentWEmission,
    currentWBacklog,
    currentWSla,
  ] = await Promise.all([
    thermostat.systemTemperature(),
    thermostat.minTemp(),
    thermostat.maxTemp(),
    thermostat.integralMin(),
    thermostat.integralMax(),
    thermostat.kp(),
    thermostat.ki(),
    thermostat.kd(),
    thermostat.wEmission(),
    thermostat.wBacklog(),
    thermostat.wSla(),
  ]);

  const actions: PlannedAction[] = [];

  const desiredSystemTemp = parsePositive(
    config.systemTemperature,
    'thermostat.systemTemperature'
  );
  if (
    desiredSystemTemp !== undefined &&
    desiredSystemTemp !== currentSystemTemp
  ) {
    actions.push({
      label: `Set system temperature to ${desiredSystemTemp.toString()}`,
      method: 'setSystemTemperature',
      args: [desiredSystemTemp],
      current: currentSystemTemp.toString(),
      desired: desiredSystemTemp.toString(),
    });
  }

  const desiredMin = parsePositive(config.bounds?.min, 'thermostat.bounds.min');
  const desiredMax = parsePositive(config.bounds?.max, 'thermostat.bounds.max');
  const boundsMin = desiredMin ?? currentMinTemp;
  const boundsMax = desiredMax ?? currentMaxTemp;
  if (desiredMin !== undefined || desiredMax !== undefined) {
    if (boundsMax <= boundsMin) {
      throw new Error('thermostat bounds must satisfy max > min > 0');
    }
  }
  if (boundsMin !== currentMinTemp || boundsMax !== currentMaxTemp) {
    actions.push({
      label: `Update temperature bounds (${boundsMin.toString()} - ${boundsMax.toString()})`,
      method: 'setTemperatureBounds',
      args: [boundsMin, boundsMax],
      current: `${currentMinTemp.toString()} - ${currentMaxTemp.toString()}`,
      desired: `${boundsMin.toString()} - ${boundsMax.toString()}`,
    });
  }

  const desiredIntegralMin = parseSigned(
    config.integralBounds?.min,
    'thermostat.integralBounds.min',
    { allowZero: true }
  );
  const desiredIntegralMax = parseSigned(
    config.integralBounds?.max,
    'thermostat.integralBounds.max',
    { allowZero: true }
  );
  const integralMin = desiredIntegralMin ?? currentIntegralMin;
  const integralMax = desiredIntegralMax ?? currentIntegralMax;
  if (desiredIntegralMin !== undefined || desiredIntegralMax !== undefined) {
    if (integralMax <= integralMin) {
      throw new Error(
        'thermostat integral bounds must satisfy max > min when both provided'
      );
    }
  }
  if (
    integralMin !== currentIntegralMin ||
    integralMax !== currentIntegralMax
  ) {
    actions.push({
      label: `Update integral bounds (${integralMin.toString()} - ${integralMax.toString()})`,
      method: 'setIntegralBounds',
      args: [integralMin, integralMax],
      current: `${currentIntegralMin.toString()} - ${currentIntegralMax.toString()}`,
      desired: `${integralMin.toString()} - ${integralMax.toString()}`,
    });
  }

  const desiredKp = parseSigned(config.pid?.kp, 'thermostat.pid.kp', {
    allowZero: true,
  });
  const desiredKi = parseSigned(config.pid?.ki, 'thermostat.pid.ki', {
    allowZero: true,
  });
  const desiredKd = parseSigned(config.pid?.kd, 'thermostat.pid.kd', {
    allowZero: true,
  });
  const kp = desiredKp ?? currentKp;
  const ki = desiredKi ?? currentKi;
  const kd = desiredKd ?? currentKd;
  if (kp !== currentKp || ki !== currentKi || kd !== currentKd) {
    actions.push({
      label: 'Update PID gains',
      method: 'setPID',
      args: [kp, ki, kd],
      current: `kp=${currentKp.toString()}, ki=${currentKi.toString()}, kd=${currentKd.toString()}`,
      desired: `kp=${kp.toString()}, ki=${ki.toString()}, kd=${kd.toString()}`,
    });
  }

  const desiredWEmission = parseSigned(
    config.kpiWeights?.emission,
    'thermostat.kpiWeights.emission',
    { allowZero: true }
  );
  const desiredWBacklog = parseSigned(
    config.kpiWeights?.backlog,
    'thermostat.kpiWeights.backlog',
    { allowZero: true }
  );
  const desiredWSla = parseSigned(
    config.kpiWeights?.sla,
    'thermostat.kpiWeights.sla',
    { allowZero: true }
  );
  const wEmission = desiredWEmission ?? currentWEmission;
  const wBacklog = desiredWBacklog ?? currentWBacklog;
  const wSla = desiredWSla ?? currentWSla;
  if (
    wEmission !== currentWEmission ||
    wBacklog !== currentWBacklog ||
    wSla !== currentWSla
  ) {
    actions.push({
      label: 'Update KPI weights',
      method: 'setKPIWeights',
      args: [wEmission, wBacklog, wSla],
      current: `emission=${currentWEmission.toString()}, backlog=${currentWBacklog.toString()}, sla=${currentWSla.toString()}`,
      desired: `emission=${wEmission.toString()}, backlog=${wBacklog.toString()}, sla=${wSla.toString()}`,
    });
  }

  const targetSystemTemp = desiredSystemTemp ?? currentSystemTemp;

  if (config.roleTemperatures) {
    const entries = Object.entries(config.roleTemperatures);
    for (const [roleKey, value] of entries) {
      if (!ROLE_KEYS.includes(roleKey as (typeof ROLE_KEYS)[number])) {
        continue;
      }
      const role = roleKey as (typeof ROLE_KEYS)[number];
      const index = ROLE_INDEX[role];
      if (value === null) {
        const current = await thermostat.getRoleTemperature(index);
        if (current !== targetSystemTemp) {
          actions.push({
            label: `Clear role temperature override for ${role}`,
            method: 'unsetRoleTemperature',
            args: [index],
            current: current.toString(),
            desired: targetSystemTemp.toString(),
          });
        }
        continue;
      }
      const desiredRoleTemp = parsePositive(
        value,
        `thermostat.roleTemperatures.${role}`
      );
      if (desiredRoleTemp === undefined) {
        continue;
      }
      const current = await thermostat.getRoleTemperature(index);
      if (desiredRoleTemp !== current) {
        actions.push({
          label: `Set ${role} role temperature to ${desiredRoleTemp.toString()}`,
          method: 'setRoleTemperature',
          args: [index, desiredRoleTemp],
          current: current.toString(),
          desired: desiredRoleTemp.toString(),
        });
      }
    }
  }

  return {
    module: 'Thermostat',
    address: thermostat.target as string,
    actions,
    configPath,
    iface,
    contract: thermostat,
  };
}

export function renderThermostatPlan(plan: ModulePlan): string {
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
    lines.push(`   Method: ${action.method}(${describeArgs(action.args)})`);
    if (data) {
      lines.push(`   Calldata: ${data}`);
    }
    lines.push('');
  });
  return lines.join('\n');
}
