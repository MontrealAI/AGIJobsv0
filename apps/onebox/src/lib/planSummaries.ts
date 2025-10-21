import type { PlanResponse, SimulationResponse } from '@agijobs/onebox-sdk';

type PlanHighlights = {
  headline: string;
  bullets: string[];
  warnings: string[];
};

type SimulationHighlights = {
  headline: string;
  bullets: string[];
  risks: string[];
  confirmations: string[];
};

const formatReward = (value?: string) => {
  if (!value) {
    return undefined;
  }
  try {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return `${numeric} AGIALPHA escrowed`;
    }
  } catch (error) {
    // ignore parse errors
  }
  return `${value} AGIALPHA escrowed`;
};

export const summarisePlanIntent = (plan: PlanResponse): PlanHighlights => {
  const bullets: string[] = [];
  const { intent, plan: orchestration } = plan;
  if (intent.title) {
    bullets.push(`Title: ${intent.title}`);
  }
  if (intent.description) {
    bullets.push(`Description: ${intent.description}`);
  }
  const reward = formatReward(intent.reward_agialpha);
  if (reward) {
    bullets.push(reward);
  }
  if (typeof intent.deadline_days === 'number') {
    bullets.push(`Deadline: ${intent.deadline_days} day window`);
  }
  if (intent.job_id !== undefined) {
    bullets.push(`Target job #${intent.job_id}`);
  }
  if (intent.attachments.length > 0) {
    bullets.push(`${intent.attachments.length} attachment(s) pinned to IPFS`);
  }
  const toolList = orchestration.steps
    .filter((step) => step.kind === 'chain' || step.kind === 'pin')
    .map((step) => step.name)
    .filter((name) => name.length > 0);
  if (toolList.length > 0) {
    bullets.push(`Execution: ${toolList.join(' → ')}`);
  }
  if (orchestration.policies.requireValidator) {
    bullets.push('Validator sign-off required before payout');
  }
  return {
    headline:
      plan.preview_summary ||
      'Plan generated. Review details, then simulate to see budget and guardrails.',
    bullets,
    warnings: plan.warnings,
  };
};

export const summariseSimulation = (
  simulation: SimulationResponse
): SimulationHighlights => {
  const bullets: string[] = [];
  if (simulation.estimatedBudget) {
    bullets.push(`Estimated budget: ${simulation.estimatedBudget} AGIALPHA`);
  }
  if (simulation.feeAmount) {
    const pct =
      simulation.feePct !== undefined && simulation.feePct !== null
        ? ` (${simulation.feePct}%)`
        : '';
    bullets.push(`Protocol fee: ${simulation.feeAmount} AGIALPHA${pct}`);
  } else if (simulation.feePct !== undefined && simulation.feePct !== null) {
    bullets.push(`Protocol fee: ${simulation.feePct}%`);
  }
  if (simulation.burnAmount) {
    const pct =
      simulation.burnPct !== undefined && simulation.burnPct !== null
        ? ` (${simulation.burnPct}%)`
        : '';
    bullets.push(`Burn: ${simulation.burnAmount} AGIALPHA${pct}`);
  } else if (simulation.burnPct !== undefined && simulation.burnPct !== null) {
    bullets.push(`Burn: ${simulation.burnPct}%`);
  }
  if (typeof simulation.est_duration === 'number') {
    bullets.push(`Estimated duration: ${simulation.est_duration} hour(s)`);
  }
  return {
    headline:
      simulation.summary ?? 'Simulation succeeded. Review the projections below.',
    bullets,
    risks: simulation.risks,
    confirmations: simulation.confirmations,
  };
};
