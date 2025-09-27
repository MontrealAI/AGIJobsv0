import { ethers, network } from 'hardhat';
import type { Contract, TransactionResponse } from 'ethers';
import { loadTokenConfig, loadTaxPolicyConfig } from '../config';

interface CliOptions {
  execute: boolean;
  configPath?: string;
  address?: string;
  skipAcknowledgers?: boolean;
}

interface PlannedAction {
  label: string;
  method: string;
  args: any[];
  summary: string;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { execute: false };
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
    } else if (arg === '--address') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('--address requires a contract address');
      }
      options.address = value;
      i += 1;
    } else if (
      arg === '--skip-acknowledgers' ||
      arg === '--skipAcknowledgers'
    ) {
      options.skipAcknowledgers = true;
    }
  }
  return options;
}

function sameAddress(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  try {
    return ethers.getAddress(a) === ethers.getAddress(b);
  } catch {
    return false;
  }
}

function summariseText(label: string, value: string): string {
  if (!value) {
    return `${label}: <empty>`;
  }
  const trimmed = value.trim();
  if (trimmed.length <= 96) {
    return `${label}: ${trimmed}`;
  }
  return `${label}: ${trimmed.slice(0, 93)}... (${trimmed.length} chars)`;
}

async function resolveContractAddress(
  cli: CliOptions,
  configAddress?: string,
  moduleAddress?: string
): Promise<string> {
  const candidates = [cli.address, configAddress, moduleAddress];
  for (const candidate of candidates) {
    if (candidate) {
      return ethers.getAddress(candidate);
    }
  }
  throw new Error(
    'TaxPolicy address not provided. Supply --address, set "address" in the config, or populate agialpha.modules.taxPolicy.'
  );
}

async function sendTransaction(
  contract: Contract,
  method: string,
  args: any[]
) {
  const tx: TransactionResponse = await contract[method](...args);
  console.log(`Submitted ${method} -> ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(
    `Confirmed in block ${
      receipt.blockNumber
    }. Gas used: ${receipt.gasUsed?.toString()}`
  );
  return receipt;
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));

  const { config: tokenConfig } = loadTokenConfig({
    network: network.name,
    chainId: network.config?.chainId,
  });

  const { config: taxConfig, path: configPath } = loadTaxPolicyConfig({
    network: network.name,
    chainId: network.config?.chainId,
    path: cli.configPath,
  });

  const taxPolicyAddress = await resolveContractAddress(
    cli,
    taxConfig.address,
    tokenConfig.modules?.taxPolicy
  );

  const taxPolicy = (await ethers.getContractAt(
    'contracts/v2/TaxPolicy.sol:TaxPolicy',
    taxPolicyAddress
  )) as Contract;

  const signer = await ethers.getSigner();
  const signerAddress = await signer.getAddress();
  const ownerAddress = await taxPolicy.owner();

  if (cli.execute && !sameAddress(ownerAddress, signerAddress)) {
    throw new Error(
      `Signer ${signerAddress} is not the TaxPolicy owner ${ownerAddress}`
    );
  }

  if (!sameAddress(ownerAddress, signerAddress)) {
    console.warn(
      `Connected signer ${signerAddress} is not the TaxPolicy owner ${ownerAddress}. Running in dry-run mode.`
    );
  }

  const [currentUri, currentAcknowledgement, currentVersion] =
    await Promise.all([
      taxPolicy.policyURI(),
      taxPolicy.acknowledgement(),
      taxPolicy.policyVersion(),
    ]);

  const desiredUri =
    taxConfig.policyURI !== undefined ? taxConfig.policyURI.trim() : undefined;
  const desiredAcknowledgement =
    taxConfig.acknowledgement !== undefined
      ? taxConfig.acknowledgement.trim()
      : undefined;

  const currentUriTrimmed = (currentUri ?? '').trim();
  const currentAckTrimmed = (currentAcknowledgement ?? '').trim();

  const planned: PlannedAction[] = [];

  const uriChanged =
    desiredUri !== undefined && desiredUri !== currentUriTrimmed;
  const ackChanged =
    desiredAcknowledgement !== undefined &&
    desiredAcknowledgement !== currentAckTrimmed;

  if (uriChanged && ackChanged) {
    planned.push({
      label: 'Update policy URI and acknowledgement',
      method: 'setPolicy',
      args: [desiredUri, desiredAcknowledgement],
      summary: 'setPolicy(newURI, newAcknowledgement)',
    });
  } else if (uriChanged) {
    planned.push({
      label: 'Update policy URI',
      method: 'setPolicyURI',
      args: [desiredUri],
      summary: 'setPolicyURI(newURI)',
    });
  } else if (ackChanged) {
    planned.push({
      label: 'Update acknowledgement text',
      method: 'setAcknowledgement',
      args: [desiredAcknowledgement],
      summary: 'setAcknowledgement(newAcknowledgement)',
    });
  }

  if (!cli.skipAcknowledgers && taxConfig.acknowledgers) {
    const ackEntries = Object.entries(taxConfig.acknowledgers).map(
      ([address, allowed]) => ({
        address: ethers.getAddress(address),
        allowed: Boolean(allowed),
      })
    );

    ackEntries.sort((a, b) => a.address.localeCompare(b.address));

    const currentFlags = await Promise.all(
      ackEntries.map((entry) => taxPolicy.acknowledgerAllowed(entry.address))
    );

    const updates = ackEntries.filter((entry, index) => {
      return currentFlags[index] !== entry.allowed;
    });

    if (updates.length === 1) {
      const [update] = updates;
      planned.push({
        label: `Set acknowledger ${update.address}`,
        method: 'setAcknowledger',
        args: [update.address, update.allowed],
        summary: `setAcknowledger(${update.address}, ${update.allowed})`,
      });
    } else if (updates.length > 1) {
      const addresses = updates.map((entry) => entry.address);
      const allowedFlags = updates.map((entry) => entry.allowed);
      planned.push({
        label: `Batch update ${updates.length} acknowledgers`,
        method: 'setAcknowledgers',
        args: [addresses, allowedFlags],
        summary: `setAcknowledgers([${addresses.join(', ')}], [${allowedFlags.join(', ')}])`,
      });
    }
  }

  if (taxConfig.revokeAcknowledgements && taxConfig.revokeAcknowledgements.length > 0) {
    const revocations = Array.from(
      new Set(
        taxConfig.revokeAcknowledgements.map((address) => ethers.getAddress(address))
      )
    ).sort((a, b) => a.localeCompare(b));

    const versions = await Promise.all(
      revocations.map((address) => taxPolicy.acknowledgedVersion(address))
    );

    const pending = revocations.filter((_, index) => versions[index] !== 0n);

    if (pending.length === 1) {
      planned.push({
        label: `Revoke acknowledgement for ${pending[0]}`,
        method: 'revokeAcknowledgement',
        args: [pending[0]],
        summary: `revokeAcknowledgement(${pending[0]})`,
      });
    } else if (pending.length > 1) {
      planned.push({
        label: `Revoke acknowledgements for ${pending.length} users`,
        method: 'revokeAcknowledgements',
        args: [pending],
        summary: `revokeAcknowledgements([${pending.join(', ')}])`,
      });
    }
  }

  if (taxConfig.bumpVersion) {
    planned.push({
      label: 'Bump policy version',
      method: 'bumpPolicyVersion',
      args: [],
      summary: 'bumpPolicyVersion()',
    });
  }

  console.log('TaxPolicy maintenance plan');
  console.log('---------------------------');
  console.log(`Config file: ${configPath}`);
  console.log(`Contract: ${taxPolicyAddress}`);
  console.log(summariseText('Current acknowledgement', currentAcknowledgement));
  console.log(`Current policy URI: ${currentUri || '<unset>'}`);
  console.log(`Current policy version: ${currentVersion.toString()}`);

  if (desiredAcknowledgement !== undefined) {
    console.log(
      summariseText('Desired acknowledgement', desiredAcknowledgement)
    );
  }
  if (desiredUri !== undefined) {
    console.log(`Desired policy URI: ${desiredUri || '<unset>'}`);
  }

  if (planned.length === 0) {
    console.log('\nNo changes required.');
    return;
  }

  console.log('\nPlanned actions:');
  for (const action of planned) {
    console.log(`- ${action.label}: ${action.summary}`);
  }

  if (!cli.execute) {
    console.log('\nDry run complete. Re-run with --execute to apply changes.');
    return;
  }

  console.log('\nExecuting updates...');
  for (const action of planned) {
    const contractWithSigner = taxPolicy.connect(signer);
    await sendTransaction(contractWithSigner, action.method, action.args);
  }

  console.log('All updates applied successfully.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
