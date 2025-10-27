import { keccak256, toUtf8Bytes } from 'ethers';
import { GovernanceParameters, Hex, ValidatorIdentity } from './types';

export interface VrfSelectionResult {
  seed: Hex;
  committee: ValidatorIdentity[];
}

function mixEntropy(inputs: string[]): Hex {
  let acc = '0x00';
  for (const input of inputs) {
    acc = keccak256(Buffer.concat([Buffer.from(acc.slice(2), 'hex'), Buffer.from(input.replace(/^0x/, ''), 'hex')]));
  }
  return acc as Hex;
}

function pseudoRandomIndex(seed: Hex, domain: string, round: number, modulus: number, salt: number): number {
  const encoded = toUtf8Bytes(`${seed}:${domain}:${round}:${salt}`);
  const hash = keccak256(encoded);
  return Number(BigInt(hash) % BigInt(modulus));
}

export function selectCommittee(
  validators: ValidatorIdentity[],
  domainId: string,
  round: number,
  governance: GovernanceParameters,
  onChainEntropy: Hex,
  recentBeacon: Hex,
): VrfSelectionResult {
  if (validators.length < governance.committeeSize) {
    throw new Error('insufficient active validators for committee selection');
  }
  const seed = mixEntropy([onChainEntropy, recentBeacon, keccak256(toUtf8Bytes(domainId)), keccak256(toUtf8Bytes(String(round)))]);
  const selected: ValidatorIdentity[] = [];
  const used = new Set<number>();
  let salt = 0;
  while (selected.length < governance.committeeSize) {
    const index = pseudoRandomIndex(seed, domainId, round, validators.length, salt++);
    if (used.has(index)) {
      continue;
    }
    used.add(index);
    selected.push(validators[index]);
  }
  return { seed, committee: selected };
}
