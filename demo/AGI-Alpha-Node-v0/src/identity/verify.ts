import { getAddress, namehash } from 'ethers';
import { NormalisedAlphaNodeConfig, makeEnsName } from '../config';
import type { EnsLookup, IdentityVerificationResult } from './types';

export function computeNodehash(config: NormalisedAlphaNodeConfig): string {
  return namehash(makeEnsName(config));
}

function assertSubdomain(config: NormalisedAlphaNodeConfig): string[] {
  const ensName = makeEnsName(config).toLowerCase();
  const root = config.operator.ensRoot.toLowerCase();
  const reasons: string[] = [];
  if (!ensName.endsWith(`.${root}`)) {
    reasons.push(`ENS name ${ensName} is not under ${root}`);
  }
  if (ensName.split('.').length - root.split('.').length !== 1) {
    reasons.push(`ENS name ${ensName} must be a direct child of ${root}`);
  }
  return reasons;
}

export async function verifyNodeIdentity(
  config: NormalisedAlphaNodeConfig,
  lookup: EnsLookup
): Promise<IdentityVerificationResult> {
  const ensName = makeEnsName(config);
  const nodehash = computeNodehash(config);
  const expectedOwner = getAddress(config.operator.address);
  const nameWrapperAddress = getAddress(config.contracts.ens.nameWrapper);
  const reasons = assertSubdomain(config);

  const resolution = await lookup.resolve(ensName);
  const owner = getAddress(resolution.owner);
  const isWrapped = owner === nameWrapperAddress;
  if (!isWrapped && owner !== expectedOwner) {
    reasons.push(`ENS owner ${owner} does not match operator ${expectedOwner}`);
  }

  if (resolution.wrapperOwner) {
    const wrapperOwner = getAddress(resolution.wrapperOwner);
    if (wrapperOwner !== expectedOwner) {
      reasons.push(`NameWrapper owner ${wrapperOwner} does not match operator ${expectedOwner}`);
    }
  } else if (isWrapped) {
    reasons.push(
      `Wrapped ENS names must expose wrapperOwner; ${ensName} resolved to ${nameWrapperAddress} without wrapper ownership information`
    );
  }

  if (resolution.registrant) {
    const registrant = getAddress(resolution.registrant);
    if (registrant !== expectedOwner) {
      reasons.push(`ENS registrant ${registrant} does not match operator ${expectedOwner}`);
    }
  }

  if (typeof resolution.expiry === 'number') {
    const expiryMs = resolution.expiry * 1000;
    if (expiryMs <= Date.now()) {
      reasons.push('ENS name is expired; renew before activation.');
    }
  }

  const attestationsRecord = resolution.records['agijobs:v2:node'];
  if (!attestationsRecord) {
    reasons.push('Missing text record agijobs:v2:node for compliance discovery.');
  } else if (attestationsRecord.toLowerCase() !== expectedOwner.toLowerCase()) {
    reasons.push(
      `Text record agijobs:v2:node (${attestationsRecord}) must equal operator address ${expectedOwner}`
    );
  }

  return {
    ensName,
    nodehash,
    expectedOwner,
    matches: reasons.length === 0,
    reasons,
    resolution
  };
}
