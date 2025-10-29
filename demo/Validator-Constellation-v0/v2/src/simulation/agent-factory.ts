import { AgentProfile, Domain } from '../types.js';
import { EnsRegistry } from '../identity/ens-registry.js';

export interface AgentConfig {
  budgetLimit: bigint;
}

export class AgentFactory {
  constructor(private ensRegistry: EnsRegistry) {}

  public createAgent(address: `0x${string}`, ensName: string, domain: Domain, config: AgentConfig) {
    if (!this.ensRegistry.verifyAgent(address, ensName, domain)) {
      throw new Error(`Agent ENS verification failed for ${ensName}`);
    }
    const profile: AgentProfile = {
      address,
      ensName,
      domain,
      budgetLimit: config.budgetLimit,
    };
    return {
      profile,
    };
  }
}
