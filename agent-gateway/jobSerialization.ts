import { formatTokenAmount } from './apiHelpers';

export function serialiseChainJob(entry: any): Record<string, unknown> | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const plain: Record<string, unknown> = {};
  const employer = entry.employer ?? entry[0];
  if (typeof employer === 'string') {
    plain.employer = employer;
  }
  const agent = entry.agent ?? entry[1];
  if (typeof agent === 'string') {
    plain.agent = agent;
  }
  const rewardValue = entry.reward ?? entry[2];
  if (rewardValue !== undefined) {
    try {
      const value = BigInt(rewardValue.toString());
      plain.rewardRaw = value.toString();
      plain.rewardFormatted = formatTokenAmount(value);
    } catch {
      plain.rewardRaw = rewardValue?.toString?.();
    }
  }
  const stakeValue = entry.stake ?? entry[3];
  if (stakeValue !== undefined) {
    try {
      const value = BigInt(stakeValue.toString());
      plain.stakeRaw = value.toString();
      plain.stakeFormatted = formatTokenAmount(value);
    } catch {
      plain.stakeRaw = stakeValue?.toString?.();
    }
  }
  const feePct = entry.feePct ?? entry[4];
  if (feePct !== undefined) {
    plain.feePct = Number(feePct);
  }
  const state = entry.state ?? entry[5];
  if (state !== undefined) {
    plain.state = Number(state);
  }
  const success = entry.success ?? entry[6];
  if (success !== undefined) {
    plain.success = Boolean(success);
  }
  const agentTypes = entry.agentTypes ?? entry[7];
  if (agentTypes !== undefined) {
    plain.agentTypes = Number(agentTypes);
  }
  const deadline = entry.deadline ?? entry[8];
  if (deadline !== undefined) {
    plain.deadline = Number(deadline);
  }
  const assignedAt = entry.assignedAt ?? entry[9];
  if (assignedAt !== undefined) {
    plain.assignedAt = Number(assignedAt);
  }
  const uriHash = entry.uriHash ?? entry[10];
  if (uriHash) {
    plain.uriHash = uriHash;
  }
  const resultHash = entry.resultHash ?? entry[11];
  if (resultHash) {
    plain.resultHash = resultHash;
  }
  return plain;
}
