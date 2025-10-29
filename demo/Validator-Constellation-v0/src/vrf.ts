import { createHash, randomBytes } from "crypto";
import { Address, ValidatorProfile } from "./types";

type CommitteeSelection = {
  seed: string;
  committee: ValidatorProfile[];
};

export class DeterministicVrf {
  private latestEntropy: Buffer;

  constructor(seed?: Buffer) {
    this.latestEntropy = seed ?? randomBytes(32);
  }

  mixEntropy(...inputs: (string | Buffer)[]): string {
    const hash = createHash("sha512");
    hash.update(this.latestEntropy);
    inputs.forEach((input) => hash.update(typeof input === "string" ? Buffer.from(input) : input));
    this.latestEntropy = hash.digest();
    return this.latestEntropy.toString("hex");
  }

  selectCommittee(
    validators: ValidatorProfile[],
    committeeSize: number,
    domain: string,
    roundId: string
  ): CommitteeSelection {
    if (committeeSize > validators.length) {
      throw new Error("committeeSize cannot exceed validator count");
    }
    const entropy = this.mixEntropy(domain, roundId, Date.now().toString());
    const ordered = [...validators].sort((a, b) =>
      this.biasScore(entropy, a.address).localeCompare(this.biasScore(entropy, b.address))
    );
    return {
      seed: entropy,
      committee: ordered.slice(0, committeeSize),
    };
  }

  private biasScore(entropy: string, address: Address): string {
    const hash = createHash("sha256");
    hash.update(entropy);
    hash.update(address.toLowerCase());
    return hash.digest("hex");
  }
}
