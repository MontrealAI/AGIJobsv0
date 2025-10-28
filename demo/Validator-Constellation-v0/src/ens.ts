import { AgentIdentity, AgentConfig, ValidatorIdentity, ValidatorConfig, NodeIdentity } from './types';
import { assert } from './utils';

function normalize(name: string): string {
  return name.toLowerCase();
}

export function verifyEnsAgainstRoots(name: string, roots: string[]): boolean {
  const normalized = normalize(name);
  return roots.some((root) => normalized.endsWith(`.${root}`));
}

export function enforceValidatorIdentity(
  candidate: ValidatorIdentity,
  config: ValidatorConfig,
  blacklist: Set<string> = new Set(),
): void {
  assert(candidate.stake >= config.minStake, `Validator ${candidate.ens} has insufficient stake.`);
  assert(candidate.active, `Validator ${candidate.ens} is inactive.`);
  assert(
    verifyEnsAgainstRoots(candidate.ens, config.ensRootDomains),
    `Validator ${candidate.ens} must own a ${config.ensRootDomains.join(' or ')} subdomain.`,
  );
  assert(!blacklist.has(candidate.address), `Validator ${candidate.ens} is blacklisted.`);
}

export function enforceAgentIdentity(agent: AgentIdentity, config: AgentConfig, blacklist: Set<string> = new Set()): void {
  assert(
    verifyEnsAgainstRoots(agent.ens, config.ensRootDomains),
    `Agent ${agent.ens} must own a ${config.ensRootDomains.join(' or ')} subdomain.`,
  );
  assert(!blacklist.has(agent.address), `Agent ${agent.ens} is blacklisted.`);
}


export function enforceNodeIdentity(node: NodeIdentity, roots: string[], blacklist: Set<string> = new Set()): void {
  assert(
    verifyEnsAgainstRoots(node.ens, roots),
    `Node ${node.ens} must own a ${roots.join(' or ')} subdomain.`,
  );
  assert(!blacklist.has(node.address), `Node ${node.ens} is blacklisted.`);
}
