import { ethers, network } from 'hardhat';
import type { Contract } from 'ethers';
import { loadHamiltonianMonitorConfig } from '../config';
import { describeArgs, sameAddress } from './lib/utils';

interface CliOptions {
  execute: boolean;
  configPath?: string;
  monitorAddress?: string;
  json?: boolean;
}

interface PlannedAction {
  label: string;
  method: 'setWindow' | 'resetHistory' | 'record';
  args: Array<string | bigint | boolean>;
  contract: Contract;
  notes?: string[];
}

interface SerialisedAction
  extends Omit<PlannedAction, 'contract' | 'args'> {
  args: Array<string | boolean>;
}

interface RecordEntry {
  d: bigint;
  u: bigint;
  note?: string;
  timestamp?: string;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { execute: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--execute') {
      options.execute = true;
    } else if (arg === '--config') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('--config requires a file path');
      }
      options.configPath = value;
      i += 1;
    } else if (arg === '--monitor' || arg === '--address') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('--monitor requires an address');
      }
      options.monitorAddress = value;
      i += 1;
    } else if (arg === '--json') {
      options.json = true;
    }
  }
  return options;
}

function bigintToString(value: bigint): string {
  return value.toString();
}

function mapRecord(entry: {
  d: string;
  u: string;
  note?: string;
  timestamp?: string;
}): RecordEntry {
  return {
    d: BigInt(entry.d),
    u: BigInt(entry.u),
    note: entry.note,
    timestamp: entry.timestamp,
  };
}

function serialiseActions(actions: PlannedAction[]): SerialisedAction[] {
  return actions.map(({ contract: _contract, args, ...rest }) => ({
    ...rest,
    args: args.map((value) =>
      typeof value === 'bigint' ? value.toString() : String(value)
    ),
  }));
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));

  const { config, path: configPath } = loadHamiltonianMonitorConfig({
    network: network.name,
    chainId: network.config?.chainId,
    path: cli.configPath,
  });

  const monitorCandidate = cli.monitorAddress || config.address;
  if (!monitorCandidate) {
    throw new Error('Hamiltonian monitor address is not configured');
  }

  const monitorAddress = ethers.getAddress(monitorCandidate);
  if (monitorAddress === ethers.ZeroAddress) {
    throw new Error('Hamiltonian monitor address cannot be the zero address');
  }

  const monitorRead = await ethers.getContractAt(
    'contracts/v2/HamiltonianMonitor.sol:HamiltonianMonitor',
    monitorAddress
  );

  const signer = await ethers.getSigner();
  const signerAddress = await signer.getAddress();
  const ownerAddress = await monitorRead.owner();
  const isOwner = sameAddress(ownerAddress, signerAddress);

  if (cli.execute && !isOwner) {
    throw new Error(
      `Signer ${signerAddress} is not the governance owner ${ownerAddress}`
    );
  }

  if (!isOwner) {
    console.warn(
      `Warning: connected signer ${signerAddress} is not the governance owner ${ownerAddress}. Running in dry-run mode.`
    );
  }

  const monitor = monitorRead.connect(signer);

  const currentWindow = BigInt((await monitorRead.window()).toString());
  const [dHistoryRaw, uHistoryRaw] = await monitorRead.history();
  const dHistory = dHistoryRaw.map((value: bigint | number | string) =>
    BigInt(value.toString())
  );
  const uHistory = uHistoryRaw.map((value: bigint | number | string) =>
    BigInt(value.toString())
  );

  const desiredWindow = config.window ? BigInt(config.window) : undefined;
  const resetRequested = Boolean(config.resetHistory);
  const configuredRecords = Array.isArray(config.records)
    ? config.records.map(mapRecord)
    : [];

  const actions: PlannedAction[] = [];
  let resetsHistory = false;

  if (resetRequested && desiredWindow !== undefined) {
    resetsHistory = true;
    actions.push({
      label: `Set window to ${desiredWindow} and reset history`,
      method: 'setWindow',
      args: [desiredWindow, true],
      contract: monitor,
      notes: [
        `previous window: ${currentWindow}`,
        `clearing ${dHistory.length} stored observations`,
      ],
    });
  } else {
    if (desiredWindow !== undefined && desiredWindow !== currentWindow) {
      actions.push({
        label: `Set window to ${desiredWindow}`,
        method: 'setWindow',
        args: [desiredWindow, false],
        contract: monitor,
        notes: [`previous window: ${currentWindow}`],
      });
    }

    if (resetRequested) {
      resetsHistory = true;
      actions.push({
        label: 'Reset dissipation/utility history',
        method: 'resetHistory',
        args: [],
        contract: monitor,
        notes: [`clearing ${dHistory.length} stored observations`],
      });
    }
  }

  let recordMatchesTail = false;
  if (!resetsHistory && configuredRecords.length > 0) {
    if (dHistory.length >= configuredRecords.length) {
      const start = dHistory.length - configuredRecords.length;
      recordMatchesTail = configuredRecords.every((entry, index) => {
        return (
          dHistory[start + index] === entry.d &&
          uHistory[start + index] === entry.u
        );
      });
    }
  }

  if (configuredRecords.length > 0 && !recordMatchesTail) {
    configuredRecords.forEach((entry, index) => {
      const notes: string[] = [];
      if (entry.timestamp) {
        notes.push(`timestamp: ${entry.timestamp}`);
      }
      if (entry.note) {
        notes.push(`note: ${entry.note}`);
      }
      actions.push({
        label: `Record observation #${index + 1}`,
        method: 'record',
        args: [entry.d, entry.u],
        contract: monitor,
        notes,
      });
    });
  }

  const summary = {
    address: monitorAddress,
    configPath,
    currentWindow: bigintToString(currentWindow),
    desiredWindow: desiredWindow ? bigintToString(desiredWindow) : undefined,
    resetRequested,
    existingObservations: dHistory.length,
    recordCount: configuredRecords.length,
    actions: serialiseActions(actions),
    recordsAlreadyApplied: recordMatchesTail,
  };

  if (cli.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log('HamiltonianMonitor:', monitorAddress);
  console.log('Configuration file:', configPath);
  console.log(`Current window: ${summary.currentWindow}`);
  if (summary.desiredWindow) {
    console.log(`Desired window: ${summary.desiredWindow}`);
  }
  console.log(`Stored observations: ${summary.existingObservations}`);
  if (configuredRecords.length > 0) {
    console.log(`Configured records: ${configuredRecords.length}`);
  }
  if (recordMatchesTail && configuredRecords.length > 0) {
    console.log(
      'Configured records match the most recent on-chain observations; no record transactions are required.'
    );
  }

  if (actions.length === 0) {
    console.log('No changes required.');
    return;
  }

  console.log(`Planned actions (${actions.length}):`);
  actions.forEach((action, index) => {
    console.log(`\n${index + 1}. ${action.label}`);
    console.log(`   Method: ${action.method}(${describeArgs(action.args)})`);
    action.notes?.forEach((note) => {
      console.log(`   Note: ${note}`);
    });
  });

  if (!cli.execute || !isOwner) {
    console.log(
      '\nDry run complete. Re-run with --execute once governance is ready to submit transactions.'
    );
    return;
  }

  console.log('\nSubmitting transactions...');
  for (const action of actions) {
    console.log(`Executing ${action.method}...`);
    const tx = await (action.contract as any)[action.method](...action.args);
    console.log(`   Tx hash: ${tx.hash}`);
    const receipt = await tx.wait();
    if (receipt?.status !== 1n) {
      throw new Error(`Transaction for ${action.method} failed`);
    }
    console.log('   Confirmed');
  }
  console.log('All transactions confirmed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
