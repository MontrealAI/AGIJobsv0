import { Wallet, Interface, formatEther } from 'ethers';
import { NormalisedAlphaNodeConfig } from '../config';
import {
  connectIdentityRegistry,
  connectStakeManager,
} from './contracts';
import stakeManagerAbi from '../../../../scripts/v2/lib/prebuilt/StakeManager.json';
import identityRegistryAbi from '../../../../scripts/v2/lib/prebuilt/IdentityRegistry.json';

const STAKE_MANAGER_INTERFACE = new Interface(stakeManagerAbi.abi);
const IDENTITY_REGISTRY_INTERFACE = new Interface(identityRegistryAbi.abi);

export interface OwnerControlSnapshot {
  readonly minStakeWei?: string;
  readonly nodeRootHash?: string;
}

export interface OwnerControlActionPlan {
  readonly target: 'stakeManager' | 'identityRegistry';
  readonly method: string;
  readonly description: string;
  readonly current: string;
  readonly desired: string;
  readonly data: string;
  readonly critical: boolean;
}

export interface OwnerControlPlan {
  readonly current: OwnerControlSnapshot;
  readonly desired: OwnerControlSnapshot;
  readonly actions: readonly OwnerControlActionPlan[];
  readonly notes: readonly string[];
}

export interface OwnerControlActionExecution {
  readonly target: OwnerControlActionPlan['target'];
  readonly method: string;
  readonly hash?: string;
  readonly description: string;
}

export interface OwnerControlExecutionReport extends OwnerControlPlan {
  readonly dryRun: boolean;
  readonly executed: readonly OwnerControlActionExecution[];
  readonly remainingActions: readonly OwnerControlActionPlan[];
}

export interface OwnerControlOptions {
  readonly dryRun?: boolean;
}

export interface OwnerControlDependencies {
  readonly connectStakeManager?: typeof connectStakeManager;
  readonly connectIdentityRegistry?: typeof connectIdentityRegistry;
}

interface OwnerContractsContext {
  readonly stakeManager: ReturnType<typeof connectStakeManager>;
  readonly identityRegistry: ReturnType<typeof connectIdentityRegistry>;
  readonly minStake?: bigint;
  readonly nodeRoot?: string;
  readonly notes: string[];
}

function formatStake(value?: bigint): string {
  if (value === undefined) {
    return 'unavailable';
  }
  const ether = Number(formatEther(value));
  const pretty = Number.isFinite(ether)
    ? ether.toLocaleString(undefined, { maximumFractionDigits: 4 })
    : value.toString();
  return `${pretty} $AGIALPHA (${value.toString()} wei)`;
}

function formatNodeRoot(value?: string): string {
  if (!value) {
    return 'unavailable';
  }
  return value;
}

async function connectOwnerContracts(
  signer: Wallet,
  config: NormalisedAlphaNodeConfig,
  dependencies?: OwnerControlDependencies
): Promise<OwnerContractsContext> {
  const stakeManagerConnector =
    dependencies?.connectStakeManager ?? connectStakeManager;
  const identityRegistryConnector =
    dependencies?.connectIdentityRegistry ?? connectIdentityRegistry;
  const stakeManager = stakeManagerConnector(
    config.contracts.stakeManager,
    signer
  );
  const identityRegistry = identityRegistryConnector(
    config.contracts.identityRegistry,
    signer
  );

  const notes: string[] = [];
  let minStake: bigint | undefined;
  try {
    const value = await stakeManager.minStake();
    minStake = BigInt(value);
  } catch (error) {
    notes.push(
      `Unable to fetch StakeManager.minStake: ${(error as Error).message}`
    );
  }

  let nodeRoot: string | undefined;
  try {
    const value = await identityRegistry.nodeRootNode();
    nodeRoot = String(value);
  } catch (error) {
    notes.push(
      `Unable to fetch IdentityRegistry.nodeRootNode: ${(error as Error).message}`
    );
  }

  return { stakeManager, identityRegistry, minStake, nodeRoot, notes };
}

export async function planOwnerControls(
  signer: Wallet,
  config: NormalisedAlphaNodeConfig,
  dependencies?: OwnerControlDependencies
): Promise<OwnerControlPlan> {
  const context = await connectOwnerContracts(signer, config, dependencies);
  const desiredMinStake = config.ownerControls?.stakeManager?.minStakeWei;
  const desiredNodeRoot = config.ownerControls?.identityRegistry?.nodeRootHash;

  const desired: OwnerControlSnapshot = {
    minStakeWei: desiredMinStake?.toString(),
    nodeRootHash: desiredNodeRoot,
  };
  const current: OwnerControlSnapshot = {
    minStakeWei: context.minStake?.toString(),
    nodeRootHash: context.nodeRoot,
  };

  const notes = [...context.notes];
  if (desiredMinStake === undefined) {
    notes.push('StakeManager minStake left manual by owner configuration.');
  }
  if (!desiredNodeRoot) {
    notes.push('IdentityRegistry node root left manual by owner configuration.');
  }

  const actions: OwnerControlActionPlan[] = [];

  if (
    desiredMinStake !== undefined &&
    context.minStake !== undefined &&
    desiredMinStake !== context.minStake
  ) {
    actions.push({
      target: 'stakeManager',
      method: 'setMinStake',
      description: `Align StakeManager.minStake from ${formatStake(
        context.minStake
      )} to ${formatStake(desiredMinStake)}.`,
      current: formatStake(context.minStake),
      desired: formatStake(desiredMinStake),
      data: STAKE_MANAGER_INTERFACE.encodeFunctionData('setMinStake', [
        desiredMinStake,
      ]),
      critical: false,
    });
  }

  if (desiredMinStake !== undefined && context.minStake === undefined) {
    notes.push('Unable to read current minStake; manual verification required.');
  }

  if (desiredNodeRoot) {
    if (!context.nodeRoot) {
      actions.push({
        target: 'identityRegistry',
        method: 'setNodeRootNode',
        description:
          'Set IdentityRegistry node root to configured ENS hierarchy.',
        current: formatNodeRoot(context.nodeRoot),
        desired: desiredNodeRoot,
        data: IDENTITY_REGISTRY_INTERFACE.encodeFunctionData(
          'setNodeRootNode',
          [desiredNodeRoot]
        ),
        critical: true,
      });
    } else if (desiredNodeRoot.toLowerCase() !== context.nodeRoot.toLowerCase()) {
      actions.push({
        target: 'identityRegistry',
        method: 'setNodeRootNode',
        description: `Rotate IdentityRegistry node root from ${context.nodeRoot} to ${desiredNodeRoot}.`,
        current: context.nodeRoot,
        desired: desiredNodeRoot,
        data: IDENTITY_REGISTRY_INTERFACE.encodeFunctionData(
          'setNodeRootNode',
          [desiredNodeRoot]
        ),
        critical: true,
      });
    }
  }

  if (desiredNodeRoot && context.nodeRoot === undefined) {
    notes.push('Unable to read current node root; manual verification required.');
  }

  if (actions.length === 0) {
    notes.push('All owner-governed parameters aligned with configuration.');
  } else {
    notes.push('Owner action required to align governance parameters.');
  }

  return {
    current,
    desired,
    actions,
    notes,
  };
}

export async function applyOwnerControls(
  signer: Wallet,
  config: NormalisedAlphaNodeConfig,
  options?: OwnerControlOptions,
  dependencies?: OwnerControlDependencies
): Promise<OwnerControlExecutionReport> {
  const initialPlan = await planOwnerControls(signer, config, dependencies);
  const dryRun = options?.dryRun ?? true;
  const executed: OwnerControlActionExecution[] = [];

  if (!dryRun && initialPlan.actions.length > 0) {
    const context = await connectOwnerContracts(signer, config, dependencies);

    for (const action of initialPlan.actions) {
      if (action.target === 'stakeManager') {
        const desired = config.ownerControls?.stakeManager?.minStakeWei;
        if (desired === undefined) {
          continue;
        }
        const tx = await context.stakeManager.setMinStake(desired);
        const receipt = await tx.wait();
        executed.push({
          target: action.target,
          method: action.method,
          hash: tx.hash,
          description: `${action.description} (confirmed in block ${receipt.blockNumber}).`,
        });
      } else if (action.target === 'identityRegistry') {
        const desired = config.ownerControls?.identityRegistry?.nodeRootHash;
        if (!desired) {
          continue;
        }
        const tx = await context.identityRegistry.setNodeRootNode(desired);
        const receipt = await tx.wait();
        executed.push({
          target: action.target,
          method: action.method,
          hash: tx.hash,
          description: `${action.description} (confirmed in block ${receipt.blockNumber}).`,
        });
      }
    }
  }

  const finalPlan = dryRun
    ? initialPlan
    : await planOwnerControls(signer, config, dependencies);

  const notes = dryRun
    ? [...initialPlan.notes, 'Dry run: owner parameters not modified.']
    : [
        ...initialPlan.notes,
        ...finalPlan.notes,
        `Executed ${executed.length} owner action(s).`,
      ];

  return {
    current: finalPlan.current,
    desired: finalPlan.desired,
    actions: initialPlan.actions,
    notes,
    dryRun,
    executed,
    remainingActions: finalPlan.actions,
  };
}
