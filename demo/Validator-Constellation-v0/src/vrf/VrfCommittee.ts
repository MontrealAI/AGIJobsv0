import { keccak256, solidityPacked, toBigInt, toBeHex } from "ethers";

export interface ValidatorCandidate {
  address: string;
  stake: bigint;
  ensName: string;
}

export interface CommitteeSelectionResult {
  randomness: string;
  selected: ValidatorCandidate[];
}

export class VrfCommitteeSelector {
  constructor(private readonly committeeSize: number) {
    if (committeeSize <= 0) {
      throw new Error("Committee size must be positive");
    }
  }

  select(seed: string, validators: ValidatorCandidate[]): CommitteeSelectionResult {
    if (!/^0x[0-9a-fA-F]{64}$/.test(seed)) {
      throw new Error("Seed must be 32-byte hex string");
    }
    if (validators.length < this.committeeSize) {
      throw new Error("Insufficient validators for committee");
    }
    const entropy = keccak256(solidityPacked(["bytes32", "uint256"], [seed, validators.length]));
    const scored = validators.map((candidate, index) => {
      const personalEntropy = keccak256(
        solidityPacked(["bytes32", "address", "uint256"], [entropy, candidate.address, index]),
      );
      const combined = toBigInt(personalEntropy) ^ (candidate.stake << 32n);
      return { candidate, personalEntropy, combined };
    });
    scored.sort((a, b) => (a.combined < b.combined ? -1 : a.combined > b.combined ? 1 : 0));
    return {
      randomness: toBeHex(toBigInt(entropy)),
      selected: scored.slice(0, this.committeeSize).map((entry) => entry.candidate),
    };
  }
}
