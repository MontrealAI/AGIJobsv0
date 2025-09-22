import { ethers, network } from 'hardhat';
import type { Contract } from 'ethers';
import {
  loadThermodynamicsConfig,
  loadTokenConfig,
  type RoleShareInput,
} from '../config';

interface CliOptions {
  execute: boolean;
  configPath?: string;
  rewardEngineAddress?: string;
  thermostatAddress?: string;
}

interface PlannedAction {
  label: string;
  method: string;
  args: any[];
  contract: Contract;
  current?: string;
  desired?: string;
  notes?: string[];
}

type RoleKey = 'agent' | 'validator' | 'operator' | 'employer';

const ROLE_KEYS: RoleKey[] = ['agent', 'validator', 'operator', 'employer'];
const ROLE_INDEX: Record<RoleKey, number> = {
  agent: 0,
  validator: 1,
  operator: 2,
  employer: 3,
};

const WAD = 1000000000000000000n;

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { execute: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--execute') {
      options.execute = true;
    } else if (arg === '--config') {
      const value = argv[i + 1];
      if (!value) throw new Error('--config requires a file path');
      options.configPath = value;
      i += 1;
    } else if (arg === '--reward-engine' || arg === '--rewardEngine') {
      const value = argv[i + 1];
      if (!value) throw new Error('--reward-engine requires an address');
      options.rewardEngineAddress = value;
      i += 1;
    } else if (arg === '--thermostat') {
      const value = argv[i + 1];
      if (!value) throw new Error('--thermostat requires an address');
      options.thermostatAddress = value;
      i += 1;
    }
  }
  return options;
}

function sameAddress(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  return ethers.getAddress(a) === ethers.getAddress(b);
}

function formatAddress(address: string): string {
  return ethers.getAddress(address);
}

function formatBigint(value: bigint): string {
  return value.toString();
}

function describeArgs(args: any[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'bigint') return arg.toString();
      if (typeof arg === 'string') return arg;
      if (typeof arg === 'boolean') return arg ? 'true' : 'false';
      return JSON.stringify(arg);
    })
    .join(', ');
}

function parseBigInt(value: unknown, label: string): bigint | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const asString = typeof value === 'string' ? value.trim() : String(value);
  if (!/^[-+]?\d+$/.test(asString)) {
    throw new Error(`${label} must be an integer value`);
  }
  return BigInt(asString);
}

function parseUnsigned(value: unknown, label: string): bigint | undefined {
  const parsed = parseBigInt(value, label);
  if (parsed !== undefined && parsed < 0n) {
    throw new Error(`${label} cannot be negative`);
  }
  return parsed;
}

function parseRoleShare(
  value: RoleShareInput | undefined,
  role: RoleKey
): bigint | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    if (value.wad !== undefined && value.wad !== null && value.wad !== '') {
      const wad = parseUnsigned(value.wad, `${role} roleShares.wad`);
      if (wad === undefined) return undefined;
      if (wad > WAD) {
        throw new Error(`${role} role share cannot exceed 100%`);
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

  const stringValue = typeof value === 'string' ? value.trim() : String(value);
  if (!stringValue) return undefined;
  const percent = Number(stringValue);
  if (!Number.isFinite(percent)) {
    throw new Error(`${role} role share must be a finite number`);
  }
  if (percent < 0 || percent > 100) {
    throw new Error(`${role} role share percent must be between 0 and 100`);
  }
  return ethers.parseUnits(percent.toString(), 16);
}

function ensureAddress(
  value: string | undefined,
  label: string,
  allowZero = false
): string {
  if (!value) throw new Error(`${label} is not configured`);
  const address = formatAddress(value);
  if (!allowZero && address === ethers.ZeroAddress) {
    throw new Error(`${label} cannot be the zero address`);
  }
  return address;
}

async function executeActions(
  actions: PlannedAction[],
  execute: boolean
): Promise<void> {
  if (!actions.length) {
    console.log('No changes required.');
    return;
  }

  console.log('\nPlanned actions:');
  for (const action of actions) {
    const details = [
      `- ${action.label}: ${action.method}(${describeArgs(action.args)})`,
    ];
    if (action.current !== undefined) {
      details.push(`    current: ${action.current}`);
    }
    if (action.desired !== undefined) {
      details.push(`    desired: ${action.desired}`);
    }
    if (action.notes && action.notes.length) {
      for (const note of action.notes) {
        details.push(`    note: ${note}`);
      }
    }
    console.log(details.join('\n'));
  }

  if (!execute) {
    console.log('\nDry run complete. Re-run with --execute to apply changes.');
    return;
  }

  for (const action of actions) {
    console.log(`\nExecuting ${action.label}...`);
    const tx = await (action.contract as any)[action.method](...action.args);
    console.log(`  tx: ${tx.hash}`);
    await tx.wait();
    console.log('  confirmed');
  }
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));

  const { config: tokenConfig } = loadTokenConfig({
    network: network.name,
    chainId: network.config?.chainId,
  });

  const { config: thermoConfig, path: thermoConfigPath } =
    loadThermodynamicsConfig({
      network: network.name,
      chainId: network.config?.chainId,
      path: cli.configPath,
    });

  console.log(`Loaded thermodynamics config from ${thermoConfigPath}`);

  const rewardEngineConfig = thermoConfig.rewardEngine || {};
  const thermostatConfig = thermoConfig.thermostat || {};

  const rewardEngineCandidate =
    cli.rewardEngineAddress ||
    rewardEngineConfig.address ||
    tokenConfig.modules?.rewardEngine;
  if (!rewardEngineCandidate) {
    throw new Error('Reward engine address is not configured');
  }

  const rewardEngineAddress = ensureAddress(
    rewardEngineCandidate,
    'Reward engine address',
    false
  );

  const rewardEngine = (await ethers.getContractAt(
    'contracts/v2/RewardEngineMB.sol:RewardEngineMB',
    rewardEngineAddress
  )) as Contract;

  let thermostatAddress: string | undefined;
  if (cli.thermostatAddress) {
    thermostatAddress = formatAddress(cli.thermostatAddress);
  } else if (thermostatConfig.address) {
    thermostatAddress = formatAddress(thermostatConfig.address);
  } else if (rewardEngineConfig.thermostat) {
    thermostatAddress = formatAddress(rewardEngineConfig.thermostat);
  }

  const thermostat =
    thermostatAddress && thermostatAddress !== ethers.ZeroAddress
      ? ((await ethers.getContractAt(
          'contracts/v2/Thermostat.sol:Thermostat',
          thermostatAddress
        )) as Contract)
      : undefined;

  const signer = await ethers.getSigner();
  const signerAddress = await signer.getAddress();

  const rewardOwner = await rewardEngine.owner();
  if (cli.execute && !sameAddress(rewardOwner, signerAddress)) {
    throw new Error(
      `Signer ${signerAddress} is not the governance owner ${rewardOwner}`
    );
  }
  if (!sameAddress(rewardOwner, signerAddress)) {
    console.warn(
      `Warning: connected signer ${signerAddress} is not the governance owner ${rewardOwner}. Running in dry-run mode.`
    );
  }

  if (thermostat) {
    const thermoOwner = await thermostat.owner();
    if (cli.execute && !sameAddress(thermoOwner, signerAddress)) {
      throw new Error(
        `Signer ${signerAddress} is not the thermostat governance owner ${thermoOwner}`
      );
    }
    if (!sameAddress(thermoOwner, signerAddress)) {
      console.warn(
        `Warning: connected signer ${signerAddress} is not the thermostat governance owner ${thermoOwner}. Running in dry-run mode.`
      );
    }
  }

  const [
    currentKappa,
    currentMaxProofs,
    currentTreasury,
    currentThermostat,
    currentTemperature,
  ] = await Promise.all([
    rewardEngine.kappa(),
    rewardEngine.maxProofs(),
    rewardEngine.treasury(),
    rewardEngine.thermostat(),
    rewardEngine.temperature(),
  ]);

  const currentRoleShares = await Promise.all(
    ROLE_KEYS.map((role) => rewardEngine.roleShare(ROLE_INDEX[role]))
  );

  const currentMu = await Promise.all(
    ROLE_KEYS.map((role) => rewardEngine.mu(ROLE_INDEX[role]))
  );

  const currentBaseline = await Promise.all(
    ROLE_KEYS.map((role) => rewardEngine.baselineEnergy(ROLE_INDEX[role]))
  );

  const actions: PlannedAction[] = [];
  const rewardEngineWithSigner = rewardEngine.connect(signer);
  const thermostatWithSigner = thermostat?.connect(signer);

  const desiredKappa = parseUnsigned(
    rewardEngineConfig.kappa,
    'rewardEngine.kappa'
  );
  if (desiredKappa !== undefined && desiredKappa !== currentKappa) {
    actions.push({
      label: 'Update reward kappa',
      contract: rewardEngineWithSigner,
      method: 'setKappa',
      args: [desiredKappa],
      current: formatBigint(currentKappa),
      desired: formatBigint(desiredKappa),
    });
  }

  const desiredMaxProofs = parseUnsigned(
    rewardEngineConfig.maxProofs,
    'rewardEngine.maxProofs'
  );
  if (desiredMaxProofs !== undefined && desiredMaxProofs !== currentMaxProofs) {
    actions.push({
      label: 'Update max proofs',
      contract: rewardEngineWithSigner,
      method: 'setMaxProofs',
      args: [desiredMaxProofs],
      current: formatBigint(currentMaxProofs),
      desired: formatBigint(desiredMaxProofs),
    });
  }

  if (rewardEngineConfig.treasury) {
    const desiredTreasury = ensureAddress(
      rewardEngineConfig.treasury,
      'rewardEngine.treasury',
      true
    );
    if (!sameAddress(desiredTreasury, currentTreasury)) {
      actions.push({
        label: 'Update reward treasury',
        contract: rewardEngineWithSigner,
        method: 'setTreasury',
        args: [desiredTreasury],
        current: formatAddress(currentTreasury),
        desired: desiredTreasury,
      });
    }
  }

  if (rewardEngineConfig.thermostat !== undefined) {
    const desiredThermostat = rewardEngineConfig.thermostat
      ? formatAddress(rewardEngineConfig.thermostat)
      : ethers.ZeroAddress;
    if (!sameAddress(desiredThermostat, currentThermostat)) {
      actions.push({
        label: 'Update reward thermostat',
        contract: rewardEngineWithSigner,
        method: 'setThermostat',
        args: [desiredThermostat],
        current: formatAddress(currentThermostat),
        desired: desiredThermostat,
      });
    }
  }

  const desiredTemperature = parseUnsigned(
    rewardEngineConfig.temperature,
    'rewardEngine.temperature'
  );
  if (
    desiredTemperature !== undefined &&
    desiredTemperature !== currentTemperature
  ) {
    actions.push({
      label: 'Update fallback temperature',
      contract: rewardEngineWithSigner,
      method: 'setTemperature',
      args: [desiredTemperature],
      current: formatBigint(currentTemperature),
      desired: formatBigint(desiredTemperature),
    });
  }

  if (
    rewardEngineConfig.settlers &&
    Object.keys(rewardEngineConfig.settlers).length
  ) {
    const settlerEntries = Object.entries(rewardEngineConfig.settlers);
    const currentSettlers = await Promise.all(
      settlerEntries.map(([address]) => rewardEngine.settlers(address))
    );

    settlerEntries.forEach(([address, desired], index) => {
      const desiredBool = Boolean(desired);
      if (currentSettlers[index] !== desiredBool) {
        actions.push({
          label: `Update settler ${address}`,
          contract: rewardEngineWithSigner,
          method: 'setSettler',
          args: [address, desiredBool],
          current: currentSettlers[index] ? 'true' : 'false',
          desired: desiredBool ? 'true' : 'false',
        });
      }
    });
  }

  const desiredShares: Record<RoleKey, bigint> = {
    ...({} as Record<RoleKey, bigint>),
  };
  let sharesChanged = false;
  for (const role of ROLE_KEYS) {
    const desiredShare = parseRoleShare(
      rewardEngineConfig.roleShares?.[role],
      role
    );
    if (desiredShare !== undefined) {
      desiredShares[role] = desiredShare;
      const currentShare = currentRoleShares[ROLE_INDEX[role]];
      if (desiredShare !== currentShare) sharesChanged = true;
    } else {
      desiredShares[role] = currentRoleShares[ROLE_INDEX[role]];
    }
  }

  if (sharesChanged) {
    const sum = ROLE_KEYS.reduce((acc, role) => acc + desiredShares[role], 0n);
    if (sum !== WAD) {
      throw new Error(
        `Role share totals must equal 100%. Provided sum: ${sum.toString()}`
      );
    }
    actions.push({
      label: 'Rebalance role shares',
      contract: rewardEngineWithSigner,
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
      rewardEngineConfig.mu?.[role],
      `rewardEngine.mu.${role}`
    );
    const current = currentMu[ROLE_INDEX[role]];
    if (desiredMu !== undefined && desiredMu !== current) {
      actions.push({
        label: `Update mu for ${role}`,
        contract: rewardEngineWithSigner,
        method: 'setMu',
        args: [ROLE_INDEX[role], desiredMu],
        current: formatBigint(current),
        desired: formatBigint(desiredMu),
      });
    }
  }

  for (const role of ROLE_KEYS) {
    const desiredBaseline = parseBigInt(
      rewardEngineConfig.baselineEnergy?.[role],
      `rewardEngine.baselineEnergy.${role}`
    );
    const current = currentBaseline[ROLE_INDEX[role]];
    if (desiredBaseline !== undefined && desiredBaseline !== current) {
      actions.push({
        label: `Update baseline energy for ${role}`,
        contract: rewardEngineWithSigner,
        method: 'setBaselineEnergy',
        args: [ROLE_INDEX[role], desiredBaseline],
        current: formatBigint(current),
        desired: formatBigint(desiredBaseline),
      });
    }
  }

  if (thermostat && thermostatWithSigner) {
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

    const desiredSystemTemp = parseBigInt(
      thermostatConfig.systemTemperature,
      'thermostat.systemTemperature'
    );
    if (
      desiredSystemTemp !== undefined &&
      desiredSystemTemp !== currentSystemTemp
    ) {
      actions.push({
        label: 'Set thermostat system temperature',
        contract: thermostatWithSigner,
        method: 'setSystemTemperature',
        args: [desiredSystemTemp],
        current: formatBigint(currentSystemTemp),
        desired: formatBigint(desiredSystemTemp),
      });
    }

    const bounds = thermostatConfig.bounds || {};
    const desiredMinTemp = parseBigInt(bounds.min, 'thermostat.bounds.min');
    const desiredMaxTemp = parseBigInt(bounds.max, 'thermostat.bounds.max');
    if (
      desiredMinTemp !== undefined &&
      desiredMaxTemp !== undefined &&
      (desiredMinTemp !== currentMinTemp || desiredMaxTemp !== currentMaxTemp)
    ) {
      actions.push({
        label: 'Update thermostat bounds',
        contract: thermostatWithSigner,
        method: 'setTemperatureBounds',
        args: [desiredMinTemp, desiredMaxTemp],
        current: `${formatBigint(currentMinTemp)}-${formatBigint(
          currentMaxTemp
        )}`,
        desired: `${formatBigint(desiredMinTemp)}-${formatBigint(
          desiredMaxTemp
        )}`,
      });
    }

    const integralBounds = thermostatConfig.integralBounds || {};
    const desiredIntegralMin = parseBigInt(
      integralBounds.min,
      'thermostat.integralBounds.min'
    );
    const desiredIntegralMax = parseBigInt(
      integralBounds.max,
      'thermostat.integralBounds.max'
    );
    if (
      desiredIntegralMin !== undefined &&
      desiredIntegralMax !== undefined &&
      (desiredIntegralMin !== currentIntegralMin ||
        desiredIntegralMax !== currentIntegralMax)
    ) {
      actions.push({
        label: 'Update integral bounds',
        contract: thermostatWithSigner,
        method: 'setIntegralBounds',
        args: [desiredIntegralMin, desiredIntegralMax],
        current: `${formatBigint(currentIntegralMin)}-${formatBigint(
          currentIntegralMax
        )}`,
        desired: `${formatBigint(desiredIntegralMin)}-${formatBigint(
          desiredIntegralMax
        )}`,
      });
    }

    const pid = thermostatConfig.pid || {};
    const desiredKp = parseBigInt(pid.kp, 'thermostat.pid.kp');
    const desiredKi = parseBigInt(pid.ki, 'thermostat.pid.ki');
    const desiredKd = parseBigInt(pid.kd, 'thermostat.pid.kd');
    if (
      desiredKp !== undefined &&
      desiredKi !== undefined &&
      desiredKd !== undefined &&
      (desiredKp !== currentKp ||
        desiredKi !== currentKi ||
        desiredKd !== currentKd)
    ) {
      actions.push({
        label: 'Update PID gains',
        contract: thermostatWithSigner,
        method: 'setPID',
        args: [desiredKp, desiredKi, desiredKd],
        current: `${formatBigint(currentKp)},${formatBigint(
          currentKi
        )},${formatBigint(currentKd)}`,
        desired: `${formatBigint(desiredKp)},${formatBigint(
          desiredKi
        )},${formatBigint(desiredKd)}`,
      });
    }

    const weights = thermostatConfig.kpiWeights || {};
    const desiredEmission = parseBigInt(
      weights.emission,
      'thermostat.kpiWeights.emission'
    );
    const desiredBacklog = parseBigInt(
      weights.backlog,
      'thermostat.kpiWeights.backlog'
    );
    const desiredSla = parseBigInt(weights.sla, 'thermostat.kpiWeights.sla');
    if (
      desiredEmission !== undefined &&
      desiredBacklog !== undefined &&
      desiredSla !== undefined &&
      (desiredEmission !== currentWEmission ||
        desiredBacklog !== currentWBacklog ||
        desiredSla !== currentWSla)
    ) {
      actions.push({
        label: 'Update KPI weights',
        contract: thermostatWithSigner,
        method: 'setKPIWeights',
        args: [desiredEmission, desiredBacklog, desiredSla],
        current: `${formatBigint(currentWEmission)},${formatBigint(
          currentWBacklog
        )},${formatBigint(currentWSla)}`,
        desired: `${formatBigint(desiredEmission)},${formatBigint(
          desiredBacklog
        )},${formatBigint(desiredSla)}`,
      });
    }

    if (thermostatConfig.roleTemperatures) {
      for (const [roleKey, value] of Object.entries(
        thermostatConfig.roleTemperatures
      )) {
        const normalisedKey = roleKey.toLowerCase() as RoleKey;
        if (!ROLE_KEYS.includes(normalisedKey)) {
          throw new Error(`Unknown thermostat role key: ${roleKey}`);
        }
        if (
          value === null ||
          value === 'unset' ||
          value === 'remove' ||
          value === 'clear'
        ) {
          actions.push({
            label: `Unset temperature override for ${normalisedKey}`,
            contract: thermostatWithSigner,
            method: 'unsetRoleTemperature',
            args: [ROLE_INDEX[normalisedKey]],
          });
          continue;
        }
        const desiredTemp = parseBigInt(
          value,
          `thermostat.roleTemperatures.${normalisedKey}`
        );
        if (desiredTemp === undefined) continue;
        const currentTemp = await thermostat.getRoleTemperature(
          ROLE_INDEX[normalisedKey]
        );
        if (desiredTemp !== currentTemp) {
          actions.push({
            label: `Set temperature override for ${normalisedKey}`,
            contract: thermostatWithSigner,
            method: 'setRoleTemperature',
            args: [ROLE_INDEX[normalisedKey], desiredTemp],
            current: formatBigint(currentTemp),
            desired: formatBigint(desiredTemp),
          });
        }
      }
    }
  }

  await executeActions(
    actions,
    cli.execute && sameAddress(rewardOwner, signerAddress)
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
