import type {
  AgentEnergyTrend,
  EnergyTrendStatus,
} from '../../shared/energyTrends';

export interface TrendEvaluationOptions {
  maxMomentumRatio: number;
  profitWeight: number;
  coolingBonusWeight: number;
  minProfitFloor: number;
  blockedStatuses: ReadonlySet<EnergyTrendStatus>;
}

export interface TrendEvaluationResult {
  blocked: boolean;
  reason?: string;
  profitFloor: number;
  status: EnergyTrendStatus | 'unknown';
  momentumRatio: number;
  penalty: number;
  bonus: number;
}

const VALID_TREND_STATUSES: ReadonlyArray<EnergyTrendStatus> = [
  'cooling',
  'stable',
  'warming',
  'overheating',
];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function sanitiseBaseProfit(value: number, minimum: number): number {
  if (!isFiniteNumber(value)) {
    return minimum;
  }
  if (value < minimum) {
    return minimum;
  }
  return value;
}

function normaliseMomentum(value: unknown): number {
  if (!isFiniteNumber(value)) {
    return 0;
  }
  if (Number.isNaN(value)) {
    return 0;
  }
  return value;
}

export function parseTrendStatuses(
  raw: string | undefined
): Set<EnergyTrendStatus> {
  if (!raw || !raw.trim()) {
    return new Set<EnergyTrendStatus>(['overheating']);
  }
  const tokens = raw
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0);
  if (
    tokens.some((token) =>
      ['none', 'off', 'allow-all', 'disabled'].includes(token)
    )
  ) {
    return new Set();
  }
  const statuses = new Set<EnergyTrendStatus>();
  for (const token of tokens) {
    if ((VALID_TREND_STATUSES as string[]).includes(token)) {
      statuses.add(token as EnergyTrendStatus);
    }
  }
  if (statuses.size === 0) {
    return new Set<EnergyTrendStatus>(['overheating']);
  }
  return statuses;
}

export function evaluateTrendForAgent(
  trend: AgentEnergyTrend | null | undefined,
  baseProfitFloor: number,
  options: TrendEvaluationOptions
): TrendEvaluationResult {
  const minProfitFloor = isFiniteNumber(options.minProfitFloor)
    ? Math.max(0, options.minProfitFloor)
    : 0;
  const blockedStatuses = options.blockedStatuses ?? new Set();
  const baseFloor = sanitiseBaseProfit(baseProfitFloor, minProfitFloor);

  if (!trend) {
    return {
      blocked: false,
      profitFloor: baseFloor,
      status: 'unknown',
      momentumRatio: 0,
      penalty: 0,
      bonus: 0,
    };
  }

  const status = trend.status;
  const momentumRatio = normaliseMomentum(trend.energyMomentumRatio);

  if (blockedStatuses.has(status)) {
    return {
      blocked: true,
      reason: `status:${status}`,
      profitFloor: baseFloor,
      status,
      momentumRatio,
      penalty: 0,
      bonus: 0,
    };
  }

  if (
    isFiniteNumber(options.maxMomentumRatio) &&
    options.maxMomentumRatio >= 0 &&
    momentumRatio > options.maxMomentumRatio
  ) {
    return {
      blocked: true,
      reason: `momentum:${momentumRatio.toFixed(4)}`,
      profitFloor: baseFloor,
      status,
      momentumRatio,
      penalty: 0,
      bonus: 0,
    };
  }

  let profitFloor = baseFloor;
  let penalty = 0;
  let bonus = 0;

  if (momentumRatio > 0 && isFiniteNumber(options.profitWeight)) {
    penalty = momentumRatio * Math.max(0, options.profitWeight);
    profitFloor += penalty;
  } else if (momentumRatio < 0 && isFiniteNumber(options.coolingBonusWeight)) {
    const rawBonus =
      Math.abs(momentumRatio) * Math.max(0, options.coolingBonusWeight);
    const maxReduction = profitFloor - minProfitFloor;
    if (maxReduction > 0) {
      bonus = Math.min(rawBonus, maxReduction);
      profitFloor -= bonus;
    }
  }

  if (!isFiniteNumber(profitFloor)) {
    profitFloor = baseFloor;
  }

  if (profitFloor < minProfitFloor) {
    profitFloor = minProfitFloor;
  }

  return {
    blocked: false,
    profitFloor,
    status,
    momentumRatio,
    penalty,
    bonus,
  };
}
