import { Wallet } from 'ethers';
import { NormalisedAlphaNodeConfig } from '../config';
import { connectSystemPause } from './contracts';
import { AlphaNodeMetrics } from '../monitoring/metrics';
import { AlphaNodeLogger } from '../utils/logger';

export interface ControlActionReceipt {
  readonly dryRun: boolean;
  readonly transactionHash?: string;
  readonly notes: string[];
}

async function ensureGovernance(signer: Wallet, contract: ReturnType<typeof connectSystemPause>): Promise<string[]> {
  const notes: string[] = [];
  const governance = await contract.governance();
  const operator = signer.address;
  if (governance.toLowerCase() !== operator.toLowerCase()) {
    notes.push(`Signer ${operator} is not SystemPause governance (${governance}).`);
  }
  return notes;
}

async function executePauseAction(
  config: NormalisedAlphaNodeConfig,
  metrics: AlphaNodeMetrics,
  logger: AlphaNodeLogger,
  signer: Wallet,
  targetState: 'pause' | 'resume'
): Promise<ControlActionReceipt> {
  const systemPause = connectSystemPause(config.contracts.systemPause, signer);
  const notes = await ensureGovernance(signer, systemPause);

  const currentlyPaused = await systemPause.paused();
  if (targetState === 'pause' && currentlyPaused) {
    notes.push('System is already paused.');
    logger.info('system_pause_status', { state: 'paused', already: true });
    return { dryRun: false, notes };
  }
  if (targetState === 'resume' && !currentlyPaused) {
    notes.push('System is already live.');
    logger.info('system_pause_status', { state: 'live', already: true });
    return { dryRun: false, notes };
  }

  if (notes.length > 0) {
    logger.warn('system_pause_warning', { notes });
  }

  const method = targetState === 'pause' ? 'pauseAll' : 'unpauseAll';
  const tx = await (systemPause as any)[method]();
  notes.push(`${method} broadcast: ${tx.hash}`);
  const receipt = await tx.wait?.();
  if (receipt) {
    notes.push(`Confirmed in block ${receipt.blockNumber}`);
  }
  logger.info('system_pause_action', { method, transaction: tx.hash });
  metrics.updateJobDiscovery(0);
  return { dryRun: false, transactionHash: tx.hash, notes };
}

export function pausePlatform(
  config: NormalisedAlphaNodeConfig,
  metrics: AlphaNodeMetrics,
  logger: AlphaNodeLogger,
  signer: Wallet
): Promise<ControlActionReceipt> {
  return executePauseAction(config, metrics, logger, signer, 'pause');
}

export function resumePlatform(
  config: NormalisedAlphaNodeConfig,
  metrics: AlphaNodeMetrics,
  logger: AlphaNodeLogger,
  signer: Wallet
): Promise<ControlActionReceipt> {
  return executePauseAction(config, metrics, logger, signer, 'resume');
}
