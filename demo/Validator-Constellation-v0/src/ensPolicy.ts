import { NamePolicy, PolicyEvaluationResult, ENSVerificationReport } from './types';
import { createHash } from 'crypto';

const DEFAULT_POLICY: NamePolicy = {
  mainnetRoots: ['club.agi.eth', 'alpha.club.agi.eth'],
  testnetRoots: ['alpha.club.agi.eth'],
  agentNamespace: 'agent',
  nodeNamespace: 'node',
  validatorNamespace: 'club',
};

export const normalizeEns = (name: string): string => name.trim().toLowerCase();

export const hashEns = (name: string): string =>
  '0x' + createHash('sha256').update(normalizeEns(name)).digest('hex');

export const evaluateNamePolicy = (
  name: string,
  role: 'agent' | 'validator' | 'node',
  policy: NamePolicy = DEFAULT_POLICY,
): PolicyEvaluationResult => {
  const normalized = normalizeEns(name);
  const reasons: string[] = [];

  let allowed = false;
  if (role === 'validator') {
    allowed =
      normalized.endsWith('.club.agi.eth') ||
      normalized.endsWith('.alpha.club.agi.eth');
    if (!allowed) {
      reasons.push(
        `Validator ENS name must end with .${policy.validatorNamespace}.club.agi.eth or .${policy.validatorNamespace}.alpha.club.agi.eth`,
      );
    }
  } else if (role === 'agent') {
    allowed =
      normalized.endsWith(`.${policy.agentNamespace}.agi.eth`) ||
      normalized.endsWith(`.${policy.agentNamespace}.alpha.agi.eth`) ||
      normalized.endsWith(`.alpha.${policy.agentNamespace}.agi.eth`);
    if (!allowed) {
      reasons.push('Agent ENS name must end with .agent.agi.eth or .alpha.agent.agi.eth');
    }
  } else if (role === 'node') {
    allowed =
      normalized.endsWith(`.${policy.nodeNamespace}.agi.eth`) ||
      normalized.endsWith(`.${policy.nodeNamespace}.alpha.agi.eth`) ||
      normalized.endsWith(`.alpha.${policy.nodeNamespace}.agi.eth`);
    if (!allowed) {
      reasons.push('Node ENS name must end with .node.agi.eth or .alpha.node.agi.eth');
    }
  }

  return {
    valid: allowed,
    reasons,
  };
};

export const buildEnsVerificationReport = (
  ensName: string,
  owner: string,
  role: 'agent' | 'validator' | 'node',
  policy: NamePolicy = DEFAULT_POLICY,
): ENSVerificationReport => {
  const normalizedName = normalizeEns(ensName);
  const evaluation = evaluateNamePolicy(normalizedName, role, policy);
  const root = policy.mainnetRoots.find((r) => normalizedName.endsWith(r)) ??
    policy.testnetRoots.find((r) => normalizedName.endsWith(r)) ??
    'unknown';
  const namespace = role === 'validator'
    ? policy.validatorNamespace
    : role === 'agent'
      ? policy.agentNamespace
      : policy.nodeNamespace;

  return {
    ensName,
    owner,
    root,
    namespace,
    approved: evaluation.valid,
    normalizedName,
    reason: evaluation.reasons[0],
  };
};

export const DEFAULT_NAME_POLICY = DEFAULT_POLICY;
