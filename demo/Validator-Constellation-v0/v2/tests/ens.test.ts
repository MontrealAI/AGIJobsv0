import { describe, expect, it } from 'vitest';
import { EnsRegistry } from '../src/identity/ens-registry.js';

const validators = [
  { name: 'athena.club.agi.eth', owner: '0x01' as `0x${string}`, domainType: 'validator' as const, domain: null },
  { name: 'prometheus.alpha.club.agi.eth', owner: '0x02' as `0x${string}`, domainType: 'validator' as const, domain: null },
];

const agents = [
  { name: 'clio.agent.agi.eth', owner: '0x03' as `0x${string}`, domainType: 'agent' as const, domain: 'research' as const },
  { name: 'eris.alpha.agent.agi.eth', owner: '0x04' as `0x${string}`, domainType: 'agent' as const, domain: 'operations' as const },
];

const nodes = [
  { name: 'atlas.node.agi.eth', owner: '0x05' as `0x${string}`, domainType: 'node' as const, domain: null },
  { name: 'helios.alpha.node.agi.eth', owner: '0x06' as `0x${string}`, domainType: 'node' as const, domain: null },
];

describe('EnsRegistry', () => {
  const registry = new EnsRegistry([...validators, ...agents, ...nodes]);

  it('accepts validators on main and alpha roots', () => {
    expect(registry.verifyValidator('0x01', 'athena.club.agi.eth')).toBe(true);
    expect(registry.verifyValidator('0x02', 'prometheus.alpha.club.agi.eth')).toBe(true);
  });

  it('rejects validators with wrong owner', () => {
    expect(registry.verifyValidator('0x99', 'athena.club.agi.eth')).toBe(false);
  });

  it('verifies agents per domain namespace', () => {
    expect(registry.verifyAgent('0x03', 'clio.agent.agi.eth', 'research')).toBe(true);
    expect(registry.verifyAgent('0x04', 'eris.alpha.agent.agi.eth', 'operations')).toBe(true);
  });

  it('rejects mismatched agent domains', () => {
    expect(registry.verifyAgent('0x03', 'clio.agent.agi.eth', 'operations')).toBe(false);
  });

  it('verifies nodes across namespaces', () => {
    expect(registry.verifyNode('0x05', 'atlas.node.agi.eth')).toBe(true);
    expect(registry.verifyNode('0x06', 'helios.alpha.node.agi.eth')).toBe(true);
  });

  it('produces deterministic Merkle root snapshots', () => {
    const root1 = registry.computeMerkleRoot();
    const root2 = registry.computeMerkleRoot();
    expect(root1).toBe(root2);
  });
});
