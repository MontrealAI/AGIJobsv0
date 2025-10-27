import { deriveEntropyWitness, verifyEntropyWitness } from './entropy';
import { eventBus } from './eventBus';
import { EntropyWitness, GovernanceParameters, Hex, ValidatorIdentity } from './types';

export interface VrfSelectionResult {
  seed: Hex;
  committee: ValidatorIdentity[];
  witness: EntropyWitness;
}

function pseudoRandomIndex(seed: Hex, domain: string, round: number, modulus: number, salt: number): number {
  const hashedSeed = deriveEntropyWitness({
    sources: [seed],
    domainId: `${domain}-${salt}`,
    round,
  }).keccakSeed;
  return Number(BigInt(hashedSeed) % BigInt(modulus));
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
  const witness = deriveEntropyWitness({
    sources: [onChainEntropy, recentBeacon],
    domainId,
    round,
  });
  if (!verifyEntropyWitness(witness, { domainId, round, sources: [onChainEntropy, recentBeacon] })) {
    throw new Error('entropy witness verification failed');
  }
  eventBus.emit('VrfWitnessComputed', witness);
  const seed = witness.transcript;
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
  return { seed, committee: selected, witness };
}
