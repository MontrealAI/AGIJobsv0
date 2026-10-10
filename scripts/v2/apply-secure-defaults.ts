import { promises as fs } from 'fs';
import path from 'path';
import parseDuration from '../utils/parseDuration';
import { ethers } from 'hardhat';
import { AGIALPHA_DECIMALS } from '../constants';
const { validateOneclickConfig } = require('./lib/oneclick-config.cjs');

type Configuration = {
  chainId?: number | string;
  econ?: Record<string, any>;
  secureDefaults?: Record<string, any>;
};
type AddressBook = Record<string, any>;
export type GovernanceAction = {
  label: string;
  to: string;
  data: string;
  requiredCaller: string;
};
const managed = [
  'jobRegistry',
  'stakeManager',
  'validationModule',
  'disputeModule',
  'platformRegistry',
  'feePool',
  'reputationEngine',
  'arbitratorCommittee',
];
const contractNames: Record<string, string> = {
  jobRegistry: 'JobRegistry',
  validationModule: 'ValidationModule',
  stakeManager: 'StakeManager',
  systemPause: 'SystemPause',
};

function address(book: AddressBook, key: string): string {
  const value = book.contracts?.[contractNames[key]] ?? book[key];
  if (!value || !ethers.isAddress(value) || value === ethers.ZeroAddress)
    throw new Error(`${contractNames[key]} address missing or invalid`);
  return ethers.getAddress(value);
}
function seconds(value: string | number): number {
  return typeof value === 'number' || /^[0-9]+$/.test(value)
    ? Number(value)
    : Number(parseDuration(value, 's'));
}

/** Reads and validates every requested action before any transaction is sent. */
export async function planSecureDefaults(
  config: Configuration,
  book: AddressBook
): Promise<GovernanceAction[]> {
  validateOneclickConfig(config, AGIALPHA_DECIMALS);
  const chainId = (await ethers.provider.getNetwork()).chainId;
  for (const source of [config, book]) {
    if (source.chainId !== undefined && BigInt(source.chainId) !== chainId)
      throw new Error(
        'Configuration or deployment report chain ID does not match the connected chain'
      );
  }
  const contracts: Record<string, any> = {};
  for (const key of ['jobRegistry', 'validationModule', 'stakeManager']) {
    const target = address(book, key);
    if ((await ethers.provider.getCode(target)) === '0x')
      throw new Error(`${contractNames[key]} has no deployed code`);
    contracts[key] = await ethers.getContractAt(
      `contracts/v2/${contractNames[key]}.sol:${contractNames[key]}`,
      target
    );
  }
  const pauseValue = book.contracts?.SystemPause ?? book.systemPause;
  const pause =
    pauseValue && pauseValue !== ethers.ZeroAddress
      ? await ethers.getContractAt('SystemPause', address(book, 'systemPause'))
      : undefined;
  const pauseAddress = pause ? await pause.getAddress() : undefined;
  const actions: GovernanceAction[] = [];
  const enqueue = async (
    contract: any,
    method: string,
    args: any[],
    label: string
  ) => {
    const target = await contract.getAddress();
    const owner = ethers.getAddress(await contract.owner());
    const data = contract.interface.encodeFunctionData(method, args);
    if (pause && owner === pauseAddress) {
      // Refuse an address book that points at a different managed deployment.
      let known = false;
      for (const key of managed)
        if (ethers.getAddress(await pause[key]()) === target) known = true;
      if (!known)
        throw new Error(`${label}: target is not managed by SystemPause`);
      actions.push({
        label,
        to: pauseAddress!,
        data: pause.interface.encodeFunctionData('executeGovernanceCall', [
          target,
          data,
        ]),
        requiredCaller: ethers.getAddress(await pause.owner()),
      });
    } else {
      actions.push({ label, to: target, data, requiredCaller: owner });
    }
  };
  const econ = config.econ ?? {};
  const defaults = config.secureDefaults ?? {};
  const units = (value: string | number) =>
    ethers.parseUnits(String(value), AGIALPHA_DECIMALS);
  if (econ.minStake !== undefined)
    await enqueue(
      contracts.stakeManager,
      'setMinStake',
      [units(econ.minStake)],
      'Set minimum stake'
    );
  if (
    ['employerSlashPct', 'treasurySlashPct', 'validatorSlashRewardPct'].some(
      (key) => econ[key] !== undefined
    )
  ) {
    // Preserve the historical config defaults, validated as a complete distribution.
    await enqueue(
      contracts.stakeManager,
      'setSlashingDistribution',
      [
        econ.employerSlashPct ?? 0,
        econ.treasurySlashPct ?? 100,
        econ.validatorSlashRewardPct ?? 0,
      ],
      'Set slashing distribution'
    );
  }
  for (const [setting, fallback, method] of [
    ['validatorCommitWindowSeconds', 'commitWindow', 'setCommitWindow'],
    ['validatorRevealWindowSeconds', 'revealWindow', 'setRevealWindow'],
  ]) {
    const value = defaults[setting] ?? econ[fallback];
    if (value !== undefined)
      await enqueue(
        contracts.validationModule,
        method,
        [seconds(value)],
        `Set ${fallback}`
      );
  }
  if (defaults.maxJobRewardAgia !== undefined || econ.jobStake !== undefined) {
    const reward =
      defaults.maxJobRewardAgia === undefined
        ? await contracts.jobRegistry.maxJobReward()
        : units(defaults.maxJobRewardAgia);
    const stake =
      econ.jobStake === undefined
        ? await contracts.jobRegistry.jobStake()
        : units(econ.jobStake);
    await enqueue(
      contracts.jobRegistry,
      'setJobParameters',
      [reward, stake],
      'Set job reward limit and stake'
    );
  }
  if (defaults.maxJobDurationSeconds !== undefined)
    await enqueue(
      contracts.jobRegistry,
      'setJobDurationLimit',
      [defaults.maxJobDurationSeconds],
      'Set job duration limit'
    );
  if (defaults.pauseOnLaunch) {
    if (!pause)
      throw new Error('SystemPause address is required for pauseOnLaunch');
    // pauseAll reverts if any module is already paused. Handle mixed states safely.
    for (const key of managed) {
      const target = await pause[key]();
      const module = await ethers.getContractAt(
        [
          'function owner() view returns (address)',
          'function paused() view returns (bool)',
          'function pause()',
        ],
        target
      );
      if (ethers.getAddress(await module.owner()) !== pauseAddress)
        throw new Error(`${key} is not owned by SystemPause`);
      if (!(await module.paused()))
        await enqueue(module, 'pause', [], `Pause ${key}`);
    }
  }
  return actions;
}

export async function applySecureDefaults(
  config: Configuration,
  book: AddressBook,
  options: { dryRun?: boolean; signer?: any } = {}
) {
  const actions = await planSecureDefaults(config, book);
  if (options.dryRun) return actions;
  const signer = options.signer ?? (await ethers.getSigners())[0];
  if (!signer)
    throw new Error(
      'Execution requires a connected governance signer; use ONECLICK_DRY_RUN=1 to prepare calls'
    );
  const caller = ethers.getAddress(await signer.getAddress());
  for (const action of actions) {
    if (action.requiredCaller !== caller)
      throw new Error(
        `${action.label} requires governance ${action.requiredCaller}; prepare the calls with ONECLICK_DRY_RUN=1 for your multisig or timelock`
      );
    // Validate all independent setters before the first mutation.
    await ethers.provider.call({
      from: caller,
      to: action.to,
      data: action.data,
    });
  }
  for (const action of actions) {
    const tx = await signer.sendTransaction({
      to: action.to,
      data: action.data,
    });
    console.log(`${action.label}: submitted ${tx.hash}`);
    await tx.wait();
    console.log(`${action.label}: confirmed`);
  }
  return actions;
}

export async function main(argv = process.argv.slice(2)) {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    if (
      !argv[i].startsWith('--') ||
      !['config', 'addresses', 'dry-run', 'help'].includes(key) ||
      args[key] !== undefined
    )
      throw new Error(`Unknown or duplicate option: ${argv[i]}`);
    if (key === 'dry-run' || key === 'help') args[key] = true;
    else {
      if (!argv[i + 1] || argv[i + 1].startsWith('--'))
        throw new Error(`Missing value for --${key}`);
      args[key] = argv[++i];
    }
  }
  if (args.help) {
    console.log(
      'Set ONECLICK_CONFIG and ONECLICK_ADDRESSES. ONECLICK_DRY_RUN=1 prints governance calls without transactions. Run with Hardhat --network <reviewed-network>.'
    );
    return;
  }
  const configPath = String(
    args.config ??
      process.env.ONECLICK_CONFIG ??
      path.join('deployment-config', 'deployer.sample.json')
  );
  const addressesPath = String(
    args.addresses ??
      process.env.ONECLICK_ADDRESSES ??
      path.join('docs', 'deployment-addresses.json')
  );
  const config = JSON.parse(
    await fs.readFile(path.resolve(configPath), 'utf8')
  );
  const book = JSON.parse(
    await fs.readFile(path.resolve(addressesPath), 'utf8')
  );
  const dryRun =
    args['dry-run'] === true || process.env.ONECLICK_DRY_RUN === '1';
  const actions = await applySecureDefaults(config, book, { dryRun });
  if (dryRun)
    console.log(
      JSON.stringify(
        {
          schema: 'agi-jobs/governance-calls/v1',
          chainId: String((await ethers.provider.getNetwork()).chainId),
          readOnly: true,
          actions,
        },
        null,
        2
      )
    );
}
if (require.main === module)
  main().catch(() => {
    console.error(
      'Secure-defaults operation failed. Check the reviewed config, chain, module ownership and transaction receipts before retrying. Use ONECLICK_DRY_RUN=1 to inspect the required governance calls.'
    );
    process.exitCode = 1;
  });
