import { keccak256, stringToHex } from 'viem';
import { AgentProfile, Domain, ValidatorProfile } from '../types.js';

export interface EnsRecord {
  name: string;
  owner: `0x${string}`;
  domainType: 'validator' | 'agent' | 'node';
  domain: Domain | null;
}

const VALIDATOR_ROOTS = ['club.agi.eth', 'alpha.club.agi.eth'];
const AGENT_ROOTS = ['agent.agi.eth', 'alpha.agent.agi.eth'];
const NODE_ROOTS = ['node.agi.eth', 'alpha.node.agi.eth'];

export class EnsRegistry {
  private records = new Map<string, EnsRecord>();
  private blacklist = new Set<`0x${string}`>();

  constructor(initialRecords: EnsRecord[] = []) {
    for (const record of initialRecords) {
      this.records.set(record.name.toLowerCase(), record);
    }
  }

  public blacklistAddress(address: `0x${string}`) {
    this.blacklist.add(address.toLowerCase() as `0x${string}`);
  }

  public register(record: EnsRecord) {
    this.records.set(record.name.toLowerCase(), record);
  }

  public verifyValidator(address: `0x${string}`, ensName: string): boolean {
    this.assertNotBlacklisted(address);
    const record = this.lookup(ensName);
    return !!record && record.owner === address && record.domainType === 'validator' && this.isValidRoot(ensName, VALIDATOR_ROOTS);
  }

  public verifyAgent(address: `0x${string}`, ensName: string, domain: Domain): boolean {
    this.assertNotBlacklisted(address);
    const record = this.lookup(ensName);
    return (
      !!record &&
      record.owner === address &&
      record.domainType === 'agent' &&
      record.domain === domain &&
      this.isValidRoot(ensName, AGENT_ROOTS)
    );
  }

  public verifyNode(address: `0x${string}`, ensName: string): boolean {
    this.assertNotBlacklisted(address);
    const record = this.lookup(ensName);
    return !!record && record.owner === address && record.domainType === 'node' && this.isValidRoot(ensName, NODE_ROOTS);
  }

  private lookup(ensName: string): EnsRecord | undefined {
    return this.records.get(ensName.toLowerCase());
  }

  private assertNotBlacklisted(address: `0x${string}`) {
    if (this.blacklist.has(address.toLowerCase() as `0x${string}`)) {
      throw new Error(`Address ${address} is blacklisted`);
    }
  }

  private isValidRoot(ensName: string, allowedRoots: string[]) {
    return allowedRoots.some((root) => ensName.toLowerCase().endsWith(root));
  }

  public computeMerkleRoot(): `0x${string}` {
    const leaves = [...this.records.values()].map((record) =>
      keccak256(
        stringToHex(`${record.domainType}|${record.name.toLowerCase()}|${record.owner.toLowerCase()}`)
      )
    );
    if (leaves.length === 0) {
      return keccak256(stringToHex('empty'));
    }
    let currentLevel = leaves;
    while (currentLevel.length > 1) {
      const nextLevel: `0x${string}`[] = [];
      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i];
        const right = currentLevel[i + 1] ?? currentLevel[i];
        const combined = [left, right].sort();
        nextLevel.push(keccak256(stringToHex(combined.join('|'))));
      }
      currentLevel = nextLevel;
    }
    return currentLevel[0];
  }

  public snapshotValidators(): ValidatorProfile[] {
    return [...this.records.values()]
      .filter((record) => record.domainType === 'validator')
      .map((record) => ({
        address: record.owner,
        ensName: record.name,
        stake: 0n,
        active: false,
        slashed: false,
        reputation: 0,
      }));
  }

  public snapshotAgents(): AgentProfile[] {
    return [...this.records.values()]
      .filter((record) => record.domainType === 'agent' && record.domain)
      .map((record) => ({
        address: record.owner,
        ensName: record.name,
        domain: record.domain!,
        budgetLimit: 0n,
      }));
  }
}
