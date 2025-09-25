import type { Contract } from 'ethers';
import { ethers } from 'ethers';
import type { IdentityRegistryConfig } from '../../config';
import { ModulePlan, PlannedAction } from './types';
import {
  formatBytes32List,
  normaliseAddress,
  normaliseBytes32,
  sameAddress,
  sameBytes32,
} from './utils';

interface AliasPlan {
  desired: Set<string>;
  enforce: boolean;
}

function collectAliasPlan(
  config: IdentityRegistryConfig,
  kind: 'agent' | 'club'
): AliasPlan {
  const ensConfig = config.ens || {};
  const root = kind === 'agent' ? ensConfig.agentRoot : ensConfig.clubRoot;
  const explicitAliasesKey = kind === 'agent' ? 'agentAliases' : 'clubAliases';
  const explicitAliases = (ensConfig as any)[explicitAliasesKey] as
    | { node?: string }[]
    | undefined;

  const set = new Set<string>();
  const push = (value: any) => {
    if (!value) return;
    const node = value.node ?? value;
    try {
      const hex = normaliseBytes32(node);
      if (hex) {
        set.add(hex);
      }
    } catch (error) {
      throw new Error(
        `Invalid ${kind} alias value ${String(node)}: ${
          (error as Error).message
        }`
      );
    }
  };

  if (root && Array.isArray((root as any).aliases)) {
    for (const alias of (root as any).aliases) {
      push(alias);
    }
  }

  if (explicitAliases && Array.isArray(explicitAliases)) {
    for (const alias of explicitAliases) {
      push(alias);
    }
  }

  const enforce =
    (root && Object.prototype.hasOwnProperty.call(root, 'aliases')) ||
    Object.prototype.hasOwnProperty.call(ensConfig, explicitAliasesKey);

  return { desired: set, enforce };
}

function toLowerHex(value: any): string {
  return ethers.hexlify(value).toLowerCase();
}

export interface IdentityRegistryPlanInput {
  identityRegistry: Contract;
  config: IdentityRegistryConfig;
  configPath?: string;
}

export async function buildIdentityRegistryPlan(
  input: IdentityRegistryPlanInput
): Promise<ModulePlan> {
  const { identityRegistry, config, configPath } = input;
  const address = await identityRegistry.getAddress();
  const iface = identityRegistry.interface;

  const [
    currentEns,
    currentWrapper,
    currentReputation,
    currentAttestation,
    currentAgentRoot,
    currentClubRoot,
    currentAgentMerkle,
    currentValidatorMerkle,
    currentAgentAliases,
    currentClubAliases,
  ] = await Promise.all([
    identityRegistry.ens(),
    identityRegistry.nameWrapper(),
    identityRegistry.reputationEngine(),
    identityRegistry.attestationRegistry(),
    identityRegistry.agentRootNode(),
    identityRegistry.clubRootNode(),
    identityRegistry.agentMerkleRoot(),
    identityRegistry.validatorMerkleRoot(),
    identityRegistry.getAgentRootNodeAliases(),
    identityRegistry.getClubRootNodeAliases(),
  ]);

  const actions: PlannedAction[] = [];

  const desiredEns = normaliseAddress(config.ens?.registry);
  if (desiredEns && !sameAddress(currentEns, desiredEns)) {
    actions.push({
      label: 'Update ENS registry address',
      method: 'setENS',
      args: [desiredEns],
      current: currentEns,
      desired: desiredEns,
    });
  }

  const desiredWrapper = normaliseAddress(config.ens?.nameWrapper);
  if (
    desiredWrapper !== undefined &&
    !sameAddress(currentWrapper, desiredWrapper)
  ) {
    actions.push({
      label: 'Update ENS NameWrapper',
      method: 'setNameWrapper',
      args: [desiredWrapper ?? ethers.ZeroAddress],
      current: currentWrapper,
      desired: desiredWrapper ?? ethers.ZeroAddress,
    });
  }

  const desiredReputation = normaliseAddress(config.reputationEngine);
  if (
    desiredReputation !== undefined &&
    !sameAddress(currentReputation, desiredReputation)
  ) {
    actions.push({
      label: 'Update ReputationEngine reference',
      method: 'setReputationEngine',
      args: [desiredReputation ?? ethers.ZeroAddress],
      current: currentReputation,
      desired: desiredReputation ?? ethers.ZeroAddress,
    });
  }

  const desiredAttestation = normaliseAddress(config.attestationRegistry);
  if (
    desiredAttestation !== undefined &&
    !sameAddress(currentAttestation, desiredAttestation)
  ) {
    actions.push({
      label: 'Update AttestationRegistry reference',
      method: 'setAttestationRegistry',
      args: [desiredAttestation ?? ethers.ZeroAddress],
      current: currentAttestation,
      desired: desiredAttestation ?? ethers.ZeroAddress,
    });
  }

  const desiredAgentRoot =
    config.ens?.agentRoot &&
    Object.prototype.hasOwnProperty.call(config.ens.agentRoot, 'node')
      ? normaliseBytes32(config.ens.agentRoot.node)
      : undefined;
  if (
    desiredAgentRoot !== undefined &&
    !sameBytes32(currentAgentRoot, desiredAgentRoot)
  ) {
    actions.push({
      label: 'Set agent ENS root node',
      method: 'setAgentRootNode',
      args: [desiredAgentRoot],
      current: toLowerHex(currentAgentRoot),
      desired: desiredAgentRoot,
    });
  }

  const desiredClubRoot =
    config.ens?.clubRoot &&
    Object.prototype.hasOwnProperty.call(config.ens.clubRoot, 'node')
      ? normaliseBytes32(config.ens.clubRoot.node)
      : undefined;
  if (
    desiredClubRoot !== undefined &&
    !sameBytes32(currentClubRoot, desiredClubRoot)
  ) {
    actions.push({
      label: 'Set club ENS root node',
      method: 'setClubRootNode',
      args: [desiredClubRoot],
      current: toLowerHex(currentClubRoot),
      desired: desiredClubRoot,
    });
  }

  const desiredAgentMerkle =
    config.merkle &&
    Object.prototype.hasOwnProperty.call(config.merkle, 'agent')
      ? normaliseBytes32(config.merkle.agent)
      : undefined;
  if (
    desiredAgentMerkle !== undefined &&
    !sameBytes32(currentAgentMerkle, desiredAgentMerkle)
  ) {
    actions.push({
      label: 'Update agent Merkle root',
      method: 'setAgentMerkleRoot',
      args: [desiredAgentMerkle],
      current: toLowerHex(currentAgentMerkle),
      desired: desiredAgentMerkle,
    });
  }

  const desiredValidatorMerkle =
    config.merkle &&
    Object.prototype.hasOwnProperty.call(config.merkle, 'validator')
      ? normaliseBytes32(config.merkle.validator)
      : undefined;
  if (
    desiredValidatorMerkle !== undefined &&
    !sameBytes32(currentValidatorMerkle, desiredValidatorMerkle)
  ) {
    actions.push({
      label: 'Update validator Merkle root',
      method: 'setValidatorMerkleRoot',
      args: [desiredValidatorMerkle],
      current: toLowerHex(currentValidatorMerkle),
      desired: desiredValidatorMerkle,
    });
  }

  const agentAliasPlan = collectAliasPlan(config, 'agent');
  const currentAgentAliasSet = new Set(
    currentAgentAliases.map((value: any) => toLowerHex(value))
  );
  if (agentAliasPlan.enforce) {
    for (const alias of agentAliasPlan.desired) {
      if (!currentAgentAliasSet.has(alias)) {
        actions.push({
          label: `Add agent alias ${alias}`,
          method: 'addAgentRootNodeAlias',
          args: [alias],
        });
      }
    }
    for (const alias of currentAgentAliasSet) {
      if (!agentAliasPlan.desired.has(alias)) {
        actions.push({
          label: `Remove agent alias ${alias}`,
          method: 'removeAgentRootNodeAlias',
          args: [alias],
        });
      }
    }
  } else {
    for (const alias of agentAliasPlan.desired) {
      if (!currentAgentAliasSet.has(alias)) {
        actions.push({
          label: `Add agent alias ${alias}`,
          method: 'addAgentRootNodeAlias',
          args: [alias],
          notes: [
            'Removal not planned because aliases are not enforced by config',
          ],
        });
      }
    }
  }

  const clubAliasPlan = collectAliasPlan(config, 'club');
  const currentClubAliasSet = new Set(
    currentClubAliases.map((value: any) => toLowerHex(value))
  );
  if (clubAliasPlan.enforce) {
    for (const alias of clubAliasPlan.desired) {
      if (!currentClubAliasSet.has(alias)) {
        actions.push({
          label: `Add club alias ${alias}`,
          method: 'addClubRootNodeAlias',
          args: [alias],
        });
      }
    }
    for (const alias of currentClubAliasSet) {
      if (!clubAliasPlan.desired.has(alias)) {
        actions.push({
          label: `Remove club alias ${alias}`,
          method: 'removeClubRootNodeAlias',
          args: [alias],
        });
      }
    }
  } else {
    for (const alias of clubAliasPlan.desired) {
      if (!currentClubAliasSet.has(alias)) {
        actions.push({
          label: `Add club alias ${alias}`,
          method: 'addClubRootNodeAlias',
          args: [alias],
          notes: [
            'Removal not planned because aliases are not enforced by config',
          ],
        });
      }
    }
  }

  for (const [address, allowed] of Object.entries(
    config.additionalAgents || {}
  )) {
    const addr = ethers.getAddress(address);
    const currentlyAllowed = await identityRegistry.additionalAgents(addr);
    if (Boolean(currentlyAllowed) === Boolean(allowed)) {
      continue;
    }
    actions.push({
      label: `${allowed ? 'Allow' : 'Remove'} additional agent ${addr}`,
      method: allowed ? 'addAdditionalAgent' : 'removeAdditionalAgent',
      args: [addr],
      current: currentlyAllowed ? 'allowed' : 'blocked',
      desired: allowed ? 'allowed' : 'blocked',
    });
  }

  for (const [address, allowed] of Object.entries(
    config.additionalValidators || {}
  )) {
    const addr = ethers.getAddress(address);
    const currentlyAllowed = await identityRegistry.additionalValidators(addr);
    if (Boolean(currentlyAllowed) === Boolean(allowed)) {
      continue;
    }
    actions.push({
      label: `${allowed ? 'Allow' : 'Remove'} additional validator ${addr}`,
      method: allowed ? 'addAdditionalValidator' : 'removeAdditionalValidator',
      args: [addr],
      current: currentlyAllowed ? 'allowed' : 'blocked',
      desired: allowed ? 'allowed' : 'blocked',
    });
  }

  for (const [address, typeConfig] of Object.entries(config.agentTypes || {})) {
    if (!typeConfig) continue;
    const addr = ethers.getAddress(address);
    const desiredType = Number(typeConfig.value);
    const currentType = Number(await identityRegistry.agentTypes(addr));
    if (currentType === desiredType) {
      continue;
    }
    actions.push({
      label: `Set agent type for ${addr} to ${desiredType} (${typeConfig.label})`,
      method: 'setAgentType',
      args: [addr, desiredType],
      current: `${currentType}`,
      desired: `${desiredType}`,
    });
  }

  for (const [address, uri] of Object.entries(config.agentProfiles || {})) {
    const addr = ethers.getAddress(address);
    const desiredUri = uri ?? '';
    const currentUri = await identityRegistry.agentProfileURI(addr);
    if ((currentUri || '') === desiredUri) {
      continue;
    }
    actions.push({
      label: `Set agent profile URI for ${addr}`,
      method: 'setAgentProfileURI',
      args: [addr, desiredUri],
      current: currentUri || '<unset>',
      desired: desiredUri || '<unset>',
    });
  }

  return {
    module: 'IdentityRegistry',
    address,
    actions,
    configPath,
    iface,
    contract: identityRegistry,
    metadata: {
      desiredAgentAliases: formatBytes32List(agentAliasPlan.desired),
      desiredClubAliases: formatBytes32List(clubAliasPlan.desired),
    },
  };
}
