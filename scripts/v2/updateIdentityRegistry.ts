import { ethers, network } from 'hardhat';
import type { Contract, BytesLike } from 'ethers';
import {
  loadTokenConfig,
  loadEnsConfig,
  loadIdentityRegistryConfig,
} from '../config';

interface CliOptions {
  execute: boolean;
  configPath?: string;
  address?: string;
  json?: boolean;
}

interface PlannedCall {
  label: string;
  method: string;
  args: (string | number | BytesLike)[];
}

interface SummaryEntry {
  label: string;
  current: string;
  target: string;
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
    } else if (arg === '--json') {
      options.json = true;
    }
  }
  return options;
}

function normaliseAddress(value?: string | null): string | undefined {
  if (!value) return undefined;
  try {
    return ethers.getAddress(value);
  } catch {
    return undefined;
  }
}

function sameAddress(a?: string | null, b?: string | null): boolean {
  const addrA = normaliseAddress(a || undefined);
  const addrB = normaliseAddress(b || undefined);
  if (!addrA || !addrB) return false;
  return addrA === addrB;
}

function describeAddress(label: string, value?: string | null): string {
  const addr = normaliseAddress(value || undefined);
  if (!addr || addr === ethers.ZeroAddress) {
    return `${label}: <unset>`;
  }
  return `${label}: ${addr}`;
}

function hex32(value?: string | BytesLike | null): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  try {
    const bytes = ethers.getBytes(value);
    if (bytes.length !== 32) {
      throw new Error(`expected 32-byte value, received ${bytes.length}`);
    }
    return ethers.hexlify(bytes).toLowerCase();
  } catch (err) {
    throw new Error(`Unable to normalise bytes32: ${(err as Error).message}`);
  }
}

function dedupeAliases(values: string[]): string[] {
  const set = new Set<string>();
  for (const value of values) {
    const normalised = hex32(value);
    if (normalised) {
      set.add(normalised);
    }
  }
  return Array.from(set.values());
}

function collectAliasNodes(
  ...sources: (undefined | null | { aliases?: { node?: string }[] } | string[])
): string[] {
  const nodes: string[] = [];
  for (const source of sources) {
    if (!source) continue;
    if (Array.isArray(source)) {
      for (const entry of source) {
        const normalised = hex32(entry);
        if (normalised) {
          nodes.push(normalised);
        }
      }
      continue;
    }
    if (typeof source === 'object' && Array.isArray(source.aliases)) {
      for (const alias of source.aliases) {
        const normalised = hex32(alias?.node);
        if (normalised) {
          nodes.push(normalised);
        }
      }
    }
  }
  return dedupeAliases(nodes);
}

async function resolveIdentityAddress(
  cli: CliOptions,
  configAddress?: string | null,
  modulesAddress?: string | null
): Promise<string> {
  const candidates = [cli.address, configAddress, modulesAddress];
  for (const value of candidates) {
    const addr = normaliseAddress(value || undefined);
    if (addr && addr !== ethers.ZeroAddress) {
      return addr;
    }
  }
  throw new Error(
    'IdentityRegistry address not provided. Supply --address, set "address" in the identity config, or populate agialpha.modules.identityRegistry.'
  );
}

function formatAliasDiff(
  title: string,
  current: Set<string>,
  desired: Set<string>
): SummaryEntry[] {
  const summary: SummaryEntry[] = [];
  const toAdd: string[] = [];
  const toRemove: string[] = [];
  for (const alias of desired) {
    if (!current.has(alias)) {
      toAdd.push(alias);
    }
  }
  for (const alias of current) {
    if (!desired.has(alias)) {
      toRemove.push(alias);
    }
  }
  if (toAdd.length > 0) {
    summary.push({
      label: `${title} aliases to add`,
      current: '-',
      target: toAdd.join(', '),
    });
  }
  if (toRemove.length > 0) {
    summary.push({
      label: `${title} aliases to remove`,
      current: toRemove.join(', '),
      target: '-',
    });
  }
  return summary;
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));

  const { config: tokenConfig } = loadTokenConfig({
    network: network.name,
    chainId: network.config?.chainId,
  });

  const { config: ensConfig } = loadEnsConfig({
    network: network.name,
    chainId: network.config?.chainId,
    persist: false,
  });

  const { config: identityConfig, path: configPath } = loadIdentityRegistryConfig({
    network: network.name,
    chainId: network.config?.chainId,
    path: cli.configPath,
  });

  const identityAddress = await resolveIdentityAddress(
    cli,
    identityConfig.address,
    tokenConfig.modules?.identityRegistry
  );

  const identity = (await ethers.getContractAt(
    'contracts/v2/IdentityRegistry.sol:IdentityRegistry',
    identityAddress
  )) as Contract;

  const signer = await ethers.getSigner();
  const signerAddress = await signer.getAddress();
  const ownerAddress = await identity.owner();

  if (cli.execute && !sameAddress(signerAddress, ownerAddress)) {
    throw new Error(
      `Signer ${signerAddress} is not the IdentityRegistry owner ${ownerAddress}`
    );
  }

  if (!sameAddress(signerAddress, ownerAddress)) {
    console.warn(
      `Connected signer ${signerAddress} is not the contract owner ${ownerAddress}. Running in dry-run mode.`
    );
  }

  const desiredEns = identityConfig.ens || {};
  const desiredAgentRoot = desiredEns.agentRoot?.node
    ? hex32(desiredEns.agentRoot.node)
    : hex32(ensConfig.roots?.agent?.node);
  const desiredClubRoot = desiredEns.clubRoot?.node
    ? hex32(desiredEns.clubRoot.node)
    : hex32(ensConfig.roots?.club?.node);
  const desiredAgentMerkle = identityConfig.merkle?.agent
    ? hex32(identityConfig.merkle.agent)
    : hex32(ensConfig.roots?.agent?.merkleRoot);
  const desiredValidatorMerkle = identityConfig.merkle?.validator
    ? hex32(identityConfig.merkle.validator)
    : hex32(ensConfig.roots?.club?.merkleRoot);

  const desiredAgentAliases = collectAliasNodes(
    desiredEns.agentRoot,
    desiredEns.agentAliases,
    ensConfig.roots?.agent
  );
  const desiredClubAliases = collectAliasNodes(
    desiredEns.clubRoot,
    desiredEns.clubAliases,
    ensConfig.roots?.club
  );

  const [
    currentEns,
    currentWrapper,
    currentReputation,
    currentAttestation,
    currentAgentRoot,
    currentClubRoot,
    currentAgentMerkle,
    currentValidatorMerkle,
    agentAliasList,
    clubAliasList,
  ] = await Promise.all([
    identity.ens(),
    identity.nameWrapper(),
    identity.reputationEngine(),
    identity.attestationRegistry(),
    identity.agentRootNode(),
    identity.clubRootNode(),
    identity.agentMerkleRoot(),
    identity.validatorMerkleRoot(),
    identity.getAgentRootNodeAliases(),
    identity.getClubRootNodeAliases(),
  ]);

  const currentAgentAliasSet = new Set(
    agentAliasList.map((value: BytesLike) => hex32(value) as string)
  );
  const currentClubAliasSet = new Set(
    clubAliasList.map((value: BytesLike) => hex32(value) as string)
  );

  const desiredAgentAliasSet = new Set(desiredAgentAliases);
  const desiredClubAliasSet = new Set(desiredClubAliases);

  const summary: SummaryEntry[] = [];
  const planned: PlannedCall[] = [];

  const ensAddressTarget = desiredEns.registry || ensConfig.registry;
  if (
    ensAddressTarget &&
    !sameAddress(currentEns, ensAddressTarget)
  ) {
    summary.push({
      label: 'ENS registry',
      current: describeAddress('current', currentEns),
      target: describeAddress('target', ensAddressTarget),
    });
    planned.push({
      label: 'Update ENS registry',
      method: 'setENS',
      args: [ensAddressTarget],
    });
  }

  const wrapperTarget = desiredEns.nameWrapper || ensConfig.nameWrapper;
  if (wrapperTarget && !sameAddress(currentWrapper, wrapperTarget)) {
    summary.push({
      label: 'NameWrapper',
      current: describeAddress('current', currentWrapper),
      target: describeAddress('target', wrapperTarget),
    });
    planned.push({
      label: 'Update NameWrapper',
      method: 'setNameWrapper',
      args: [wrapperTarget],
    });
  }

  if (
    identityConfig.reputationEngine &&
    !sameAddress(currentReputation, identityConfig.reputationEngine)
  ) {
    summary.push({
      label: 'ReputationEngine',
      current: describeAddress('current', currentReputation),
      target: describeAddress('target', identityConfig.reputationEngine),
    });
    planned.push({
      label: 'Update reputation engine',
      method: 'setReputationEngine',
      args: [identityConfig.reputationEngine],
    });
  }

  if (
    identityConfig.attestationRegistry &&
    !sameAddress(currentAttestation, identityConfig.attestationRegistry)
  ) {
    summary.push({
      label: 'AttestationRegistry',
      current: describeAddress('current', currentAttestation),
      target: describeAddress('target', identityConfig.attestationRegistry),
    });
    planned.push({
      label: 'Update attestation registry',
      method: 'setAttestationRegistry',
      args: [identityConfig.attestationRegistry],
    });
  }

  if (desiredAgentRoot && hex32(currentAgentRoot) !== desiredAgentRoot) {
    summary.push({
      label: 'Agent root node',
      current: String(hex32(currentAgentRoot) || '<unset>'),
      target: desiredAgentRoot,
    });
    planned.push({
      label: 'Update agent root node',
      method: 'setAgentRootNode',
      args: [desiredAgentRoot],
    });
  }

  if (desiredClubRoot && hex32(currentClubRoot) !== desiredClubRoot) {
    summary.push({
      label: 'Club root node',
      current: String(hex32(currentClubRoot) || '<unset>'),
      target: desiredClubRoot,
    });
    planned.push({
      label: 'Update club root node',
      method: 'setClubRootNode',
      args: [desiredClubRoot],
    });
  }

  if (desiredAgentMerkle && hex32(currentAgentMerkle) !== desiredAgentMerkle) {
    summary.push({
      label: 'Agent merkle root',
      current: String(hex32(currentAgentMerkle) || '<unset>'),
      target: desiredAgentMerkle,
    });
    planned.push({
      label: 'Update agent merkle root',
      method: 'setAgentMerkleRoot',
      args: [desiredAgentMerkle],
    });
  }

  if (
    desiredValidatorMerkle &&
    hex32(currentValidatorMerkle) !== desiredValidatorMerkle
  ) {
    summary.push({
      label: 'Validator merkle root',
      current: String(hex32(currentValidatorMerkle) || '<unset>'),
      target: desiredValidatorMerkle,
    });
    planned.push({
      label: 'Update validator merkle root',
      method: 'setValidatorMerkleRoot',
      args: [desiredValidatorMerkle],
    });
  }

  summary.push(
    ...formatAliasDiff('Agent root', currentAgentAliasSet, desiredAgentAliasSet)
  );
  summary.push(
    ...formatAliasDiff('Club root', currentClubAliasSet, desiredClubAliasSet)
  );

  for (const alias of desiredAgentAliasSet) {
    if (!currentAgentAliasSet.has(alias)) {
      planned.push({
        label: `Add agent alias ${alias}`,
        method: 'addAgentRootNodeAlias',
        args: [alias],
      });
    }
  }

  for (const alias of desiredClubAliasSet) {
    if (!currentClubAliasSet.has(alias)) {
      planned.push({
        label: `Add club alias ${alias}`,
        method: 'addClubRootNodeAlias',
        args: [alias],
      });
    }
  }

  for (const alias of currentAgentAliasSet) {
    if (!desiredAgentAliasSet.has(alias)) {
      planned.push({
        label: `Remove agent alias ${alias}`,
        method: 'removeAgentRootNodeAlias',
        args: [alias],
      });
    }
  }

  for (const alias of currentClubAliasSet) {
    if (!desiredClubAliasSet.has(alias)) {
      planned.push({
        label: `Remove club alias ${alias}`,
        method: 'removeClubRootNodeAlias',
        args: [alias],
      });
    }
  }

  const allowlistChecks: PlannedCall[] = [];
  const allowlistSummaries: SummaryEntry[] = [];

  for (const [address, allowed] of Object.entries(
    identityConfig.additionalAgents || {}
  )) {
    const addr = ethers.getAddress(address);
    const currentlyAllowed = await identity.additionalAgents(addr);
    if (Boolean(currentlyAllowed) === Boolean(allowed)) {
      continue;
    }
    allowlistSummaries.push({
      label: `Additional agent ${addr}`,
      current: currentlyAllowed ? 'allowed' : 'blocked',
      target: allowed ? 'allowed' : 'blocked',
    });
    allowlistChecks.push({
      label: `${allowed ? 'Allow' : 'Remove'} agent ${addr}`,
      method: allowed ? 'addAdditionalAgent' : 'removeAdditionalAgent',
      args: [addr],
    });
  }

  for (const [address, allowed] of Object.entries(
    identityConfig.additionalValidators || {}
  )) {
    const addr = ethers.getAddress(address);
    const currentlyAllowed = await identity.additionalValidators(addr);
    if (Boolean(currentlyAllowed) === Boolean(allowed)) {
      continue;
    }
    allowlistSummaries.push({
      label: `Additional validator ${addr}`,
      current: currentlyAllowed ? 'allowed' : 'blocked',
      target: allowed ? 'allowed' : 'blocked',
    });
    allowlistChecks.push({
      label: `${allowed ? 'Allow' : 'Remove'} validator ${addr}`,
      method: allowed ? 'addAdditionalValidator' : 'removeAdditionalValidator',
      args: [addr],
    });
  }

  const agentTypePlans: PlannedCall[] = [];
  const agentTypeSummaries: SummaryEntry[] = [];
  for (const [address, typeConfig] of Object.entries(
    identityConfig.agentTypes || {}
  )) {
    const addr = ethers.getAddress(address);
    const currentType = await identity.agentTypes(addr);
    if (Number(currentType) === Number(typeConfig.value)) {
      continue;
    }
    agentTypeSummaries.push({
      label: `Agent type ${addr}`,
      current: currentType.toString(),
      target: `${typeConfig.value} (${typeConfig.label})`,
    });
    agentTypePlans.push({
      label: `Set agent type ${addr}`,
      method: 'setAgentType',
      args: [addr, typeConfig.value],
    });
  }

  const profilePlans: PlannedCall[] = [];
  const profileSummaries: SummaryEntry[] = [];
  for (const [address, uri] of Object.entries(
    identityConfig.agentProfiles || {}
  )) {
    const addr = ethers.getAddress(address);
    const currentUri = await identity.agentProfileURI(addr);
    if (currentUri === uri) {
      continue;
    }
    profileSummaries.push({
      label: `Agent profile ${addr}`,
      current: currentUri || '<unset>',
      target: uri,
    });
    profilePlans.push({
      label: `Set agent profile ${addr}`,
      method: 'setAgentProfileURI',
      args: [addr, uri],
    });
  }

  summary.push(...allowlistSummaries);
  summary.push(...agentTypeSummaries);
  summary.push(...profileSummaries);
  planned.push(...allowlistChecks);
  planned.push(...agentTypePlans);
  planned.push(...profilePlans);

  if (cli.json) {
    console.log(
      JSON.stringify(
        {
          contract: identityAddress,
          config: configPath,
          summary,
          planned,
        },
        null,
        2
      )
    );
    if (!cli.execute) {
      return;
    }
  } else {
    console.log('IdentityRegistry maintenance plan');
    console.log('--------------------------------');
    console.log(`Config file: ${configPath}`);
    console.log(describeAddress('Contract', identityAddress));
    console.log(describeAddress('Signer', signerAddress));
    console.log(describeAddress('Owner', ownerAddress));

    if (summary.length === 0 && planned.length === 0) {
      console.log('\nNo updates required. On-chain configuration already matches.');
      return;
    }

    if (summary.length > 0) {
      console.log('\nPlanned changes:');
      for (const entry of summary) {
        console.log(`- ${entry.label}`);
        console.log(`    current: ${entry.current}`);
        console.log(`    target:  ${entry.target}`);
      }
    }

    if (!cli.execute) {
      console.log('\nDry run complete. Re-run with --execute to apply changes.');
      return;
    }
  }

  console.log('\nApplying updates...');
  for (const action of planned) {
    console.log(`\n# ${action.label}`);
    console.log(`Calling ${action.method}(${action.args.join(', ')})`);
    const tx = await identity.connect(signer)[action.method](...action.args);
    console.log(`Submitted ${tx.hash}, waiting for confirmations...`);
    const receipt = await tx.wait();
    console.log(
      `Confirmed in block ${receipt.blockNumber}. Gas used: ${
        receipt.gasUsed?.toString() ?? 'unknown'
      }`
    );
  }

  console.log('\nAll identity registry updates applied successfully.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
