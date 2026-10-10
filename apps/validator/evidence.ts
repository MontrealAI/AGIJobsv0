import { ethers } from 'ethers';
import { fetchArtifactBytes } from '../orchestrator/artifactSource';

export interface DisputeEvidence {
  commitment: string;
  verified: boolean;
  text: string;
  error?: string;
}

/** An on-chain bytes32 commitment is not itself an IPFS CID or a location. */
export async function loadDisputeEvidence(
  commitment: string,
  template = process.env.EVIDENCE_URI_TEMPLATE,
  legacyGateway = process.env.EVIDENCE_GATEWAY,
  read: typeof fetchArtifactBytes = fetchArtifactBytes
): Promise<DisputeEvidence> {
  const unavailable = { commitment, verified: false, text: '' };
  if (!ethers.isHexString(commitment, 32))
    return { ...unavailable, error: 'INVALID_EVIDENCE_HASH' };
  if (!template && !legacyGateway)
    return { ...unavailable, error: 'EVIDENCE_LOCATION_REQUIRED' };
  try {
    if (template && template.split('{hash}').length !== 2)
      return { ...unavailable, error: 'EVIDENCE_TEMPLATE_INVALID' };
    const target = template
      ? template.replace('{hash}', commitment.toLowerCase())
      : `${legacyGateway!.replace(/\/$/, '')}/${commitment.slice(2)}`;
    const bytes = await read(target, template ? undefined : legacyGateway);
    if (ethers.keccak256(bytes).toLowerCase() !== commitment.toLowerCase())
      return { ...unavailable, error: 'EVIDENCE_HASH_MISMATCH' };
    return {
      commitment,
      verified: true,
      text: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    };
  } catch {
    return { ...unavailable, error: 'EVIDENCE_UNAVAILABLE' };
  }
}
