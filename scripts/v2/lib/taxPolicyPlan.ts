import type { Contract } from 'ethers';
import type { TaxPolicyConfig } from '../../config';
import { ModulePlan, PlannedAction } from './types';

function trimOrUndefined(value?: string | null): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : '';
}

export interface TaxPolicyPlanInput {
  taxPolicy: Contract;
  config: TaxPolicyConfig;
  configPath?: string;
}

export async function buildTaxPolicyPlan(
  input: TaxPolicyPlanInput
): Promise<ModulePlan> {
  const { taxPolicy, config, configPath } = input;
  const address = await taxPolicy.getAddress();
  const iface = taxPolicy.interface;

  const [currentUri, currentAcknowledgement] = await Promise.all([
    taxPolicy.policyURI(),
    taxPolicy.acknowledgement(),
  ]);

  const desiredUri = trimOrUndefined(config.policyURI);
  const desiredAcknowledgement = trimOrUndefined(config.acknowledgement);

  const actions: PlannedAction[] = [];

  const uriChanged =
    desiredUri !== undefined && desiredUri !== (currentUri || '').trim();
  const ackChanged =
    desiredAcknowledgement !== undefined &&
    desiredAcknowledgement !== (currentAcknowledgement || '').trim();

  if (uriChanged && ackChanged) {
    actions.push({
      label: 'Update tax policy URI and acknowledgement',
      method: 'setPolicy',
      args: [desiredUri, desiredAcknowledgement],
      current: `URI=${currentUri}; ACK=${currentAcknowledgement}`,
      desired: `URI=${desiredUri}; ACK=${desiredAcknowledgement}`,
    });
  } else if (uriChanged) {
    actions.push({
      label: 'Update tax policy URI',
      method: 'setPolicyURI',
      args: [desiredUri],
      current: currentUri || '<unset>',
      desired: desiredUri,
    });
  } else if (ackChanged) {
    actions.push({
      label: 'Update tax acknowledgement text',
      method: 'setAcknowledgement',
      args: [desiredAcknowledgement],
      current: currentAcknowledgement || '<unset>',
      desired: desiredAcknowledgement,
    });
  }

  for (const [address, allowed] of Object.entries(config.acknowledgers || {})) {
    actions.push({
      label: `${allowed ? 'Authorize' : 'Revoke'} acknowledger ${address}`,
      method: 'setAcknowledger',
      args: [address, Boolean(allowed)],
      current: '-',
      desired: allowed ? 'allowed' : 'revoked',
    });
  }

  return {
    module: 'TaxPolicy',
    address,
    actions,
    configPath,
    iface,
    contract: taxPolicy,
  };
}
