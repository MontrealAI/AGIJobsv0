import { ensVerifier } from "../identity/ensVerifier";
import { allowlistSnapshot } from "../config/defaults";
import type { EventIndexer } from "../subgraph/eventIndexer";
import type { StakeManager } from "../stake/stakeManager";
import type { DerivedIdentity } from "../config/entities";
import type { ValidatorProfile } from "./types";

export class ValidatorRegistry {
  private readonly validators = new Map<string, ValidatorProfile>();

  constructor(
    private readonly stakeManager: StakeManager,
    private readonly indexer: EventIndexer
  ) {}

  register(identity: DerivedIdentity, proof?: string[]): ValidatorProfile {
    const ensProof =
      proof ??
      allowlistSnapshot.entries.find(
        (entry) =>
          entry.address.toLowerCase() === identity.wallet.address.toLowerCase()
      )?.proof ?? [];

    const verification = ensVerifier.verify({
      address: identity.wallet.address,
      ensName: identity.ensName,
      role: identity.role,
      domain: identity.domain,
      proof: ensProof,
    });
    if (!verification.valid) {
      throw new Error(
        `ENS verification failed for ${identity.ensName}: ${verification.reason}`
      );
    }

    if (identity.role !== "validator") {
      throw new Error("Only validators can register in validator registry");
    }

    const profile: ValidatorProfile = {
      address: identity.wallet.address,
      ensName: identity.ensName,
      domain: identity.domain,
      stake: identity.stake,
    };

    this.validators.set(profile.address.toLowerCase(), profile);
    this.stakeManager.deposit(
      profile.address,
      profile.ensName,
      identity.stake
    );
    this.indexer.recordEvent("ValidatorRegistered", {
      address: profile.address,
      ensName: profile.ensName,
      domain: profile.domain,
      stake: profile.stake.toString(),
    });
    return profile;
  }

  list(): ValidatorProfile[] {
    return Array.from(this.validators.values());
  }
}
