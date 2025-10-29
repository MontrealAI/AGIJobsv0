import { ExperienceRecord, OwnerControlState, SimulationRunSummary, AuditReport, AuditSection } from './types';

function approxEqual(a: number, b: number, tolerance = 1e-6): boolean {
  const scale = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) <= Math.max(tolerance, scale * tolerance);
}

interface DerivedMetrics {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  grossMerchandiseValue: number;
  totalRewardPaid: number;
  averageLatencyHours: number;
  averageCost: number;
  averageRating: number;
  roi: number;
  successRate: number;
  sustainabilityScore: number;
}

function deriveMetrics(experiences: ExperienceRecord[]): DerivedMetrics {
  let grossMerchandiseValue = 0;
  let totalRewardPaid = 0;
  let totalCost = 0;
  let totalRating = 0;
  let totalLatency = 0;
  let sustainabilityPenalty = 0;
  let completedJobs = 0;
  let failedJobs = 0;

  for (const experience of experiences) {
    const { outcome, agent, job } = experience.details;
    grossMerchandiseValue += outcome.valueCaptured;
    totalRewardPaid += outcome.rewardPaid;
    totalCost += outcome.cost + outcome.penalties;
    totalRating += outcome.rating;
    totalLatency += outcome.durationHours;
    sustainabilityPenalty += Math.max(0, agent.energyFootprint - job.sustainabilityTarget);
    if (outcome.success) {
      completedJobs += 1;
    } else {
      failedJobs += 1;
    }
  }

  const totalJobs = experiences.length;
  const averageLatencyHours = totalJobs > 0 ? totalLatency / totalJobs : 0;
  const averageCost = totalJobs > 0 ? totalCost / totalJobs : 0;
  const averageRating = totalJobs > 0 ? totalRating / totalJobs : 0;
  const roi = (grossMerchandiseValue - totalCost - totalRewardPaid) / Math.max(totalCost + totalRewardPaid, 1);
  const sustainabilityScore = totalJobs > 0 ? Math.max(0, 1 - sustainabilityPenalty / totalJobs) : 1;
  const successRate = totalJobs > 0 ? completedJobs / totalJobs : 0;

  return {
    totalJobs,
    completedJobs,
    failedJobs,
    grossMerchandiseValue,
    totalRewardPaid,
    averageLatencyHours,
    averageCost,
    averageRating,
    roi,
    successRate,
    sustainabilityScore,
  };
}

function summariseConsistency(
  name: string,
  summary: SimulationRunSummary,
  derived: DerivedMetrics,
): AuditSection {
  const notes: string[] = [];
  const checks: Array<[string, number, number]> = [
    ['totalJobs', summary.totalJobs, derived.totalJobs],
    ['completedJobs', summary.completedJobs, derived.completedJobs],
    ['failedJobs', summary.failedJobs, derived.failedJobs],
    ['grossMerchandiseValue', summary.grossMerchandiseValue, derived.grossMerchandiseValue],
    ['totalRewardPaid', summary.totalRewardPaid, derived.totalRewardPaid],
    ['averageLatencyHours', summary.averageLatencyHours, derived.averageLatencyHours],
    ['averageCost', summary.averageCost, derived.averageCost],
    ['averageRating', summary.averageRating, derived.averageRating],
    ['roi', summary.roi, derived.roi],
    ['successRate', summary.successRate, derived.successRate],
    ['sustainabilityScore', summary.sustainabilityScore, derived.sustainabilityScore],
  ];

  for (const [label, reported, expected] of checks) {
    if (!approxEqual(reported, expected)) {
      notes.push(`${label} mismatch: reported=${reported.toFixed(6)}, expected=${expected.toFixed(6)}`);
    }
  }

  const status: 'pass' | 'fail' = notes.length === 0 ? 'pass' : 'fail';
  const metrics: Record<string, number> = {};
  for (const [label, reported, expected] of checks) {
    metrics[`reported.${label}`] = reported;
    metrics[`expected.${label}`] = expected;
  }

  return {
    name: `${name} Summary Consistency`,
    status,
    notes,
    metrics,
  };
}

function validateExperiences(label: string, experiences: ExperienceRecord[]): AuditSection {
  const notes: string[] = [];
  for (let i = 0; i < experiences.length; i += 1) {
    const experience = experiences[i];
    if (!experience.details?.job || !experience.details?.agent || !experience.details?.outcome) {
      notes.push(`Experience ${i} missing detail payload`);
    }
    if (typeof experience.timestamp !== 'number' || !Number.isFinite(experience.timestamp)) {
      notes.push(`Experience ${i} timestamp invalid`);
    }
    if (i < experiences.length - 1 && experience.terminal) {
      notes.push(`Experience ${i} flagged terminal before end of stream`);
    }
    if (i === experiences.length - 1 && !experience.terminal) {
      notes.push('Final experience should be terminal');
    }
    if (experience.terminal && experience.nextStateId !== null) {
      notes.push(`Terminal experience ${i} must have null nextStateId`);
    }
    if (!experience.terminal && typeof experience.nextStateId !== 'string') {
      notes.push(`Experience ${i} non-terminal requires string nextStateId`);
    }
  }

  return {
    name: `${label} Experience Integrity`,
    status: notes.length === 0 ? 'pass' : 'fail',
    notes,
  };
}

function validateOwnerControls(ownerControls: OwnerControlState): AuditSection {
  const notes: string[] = [];
  if (!Number.isFinite(ownerControls.exploration) || ownerControls.exploration < 0 || ownerControls.exploration > 1) {
    notes.push(`Exploration out of bounds: ${ownerControls.exploration}`);
  }
  if (typeof ownerControls.paused !== 'boolean') {
    notes.push('Paused flag must be boolean');
  }
  if (ownerControls.rewardOverrides) {
    for (const [key, value] of Object.entries(ownerControls.rewardOverrides)) {
      if (value !== undefined && !Number.isFinite(value)) {
        notes.push(`Reward override ${key} must be finite number`);
      }
    }
  }
  return {
    name: 'Owner Control Envelope',
    status: notes.length === 0 ? 'pass' : 'fail',
    notes,
  };
}

export function performAudit(args: {
  baseline: { summary: SimulationRunSummary; experiences: ExperienceRecord[] };
  rl: { summary: SimulationRunSummary; experiences: ExperienceRecord[] };
  ownerControls: OwnerControlState;
}): AuditReport {
  const sections: AuditSection[] = [];

  const baselineDerived = deriveMetrics(args.baseline.experiences);
  sections.push(summariseConsistency('Baseline', args.baseline.summary, baselineDerived));

  const rlDerived = deriveMetrics(args.rl.experiences);
  sections.push(summariseConsistency('Experience-Native', args.rl.summary, rlDerived));

  sections.push(validateExperiences('Baseline', args.baseline.experiences));
  sections.push(validateExperiences('Experience-Native', args.rl.experiences));
  sections.push(validateOwnerControls(args.ownerControls));

  const status: 'pass' | 'fail' = sections.every((section) => section.status === 'pass') ? 'pass' : 'fail';

  return {
    status,
    generatedAt: new Date().toISOString(),
    sections,
  };
}
