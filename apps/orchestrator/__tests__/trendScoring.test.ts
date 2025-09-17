import { strict as assert } from 'assert';
import {
  evaluateTrendForAgent,
  parseTrendStatuses,
  type TrendEvaluationOptions,
} from '../trendScoring';
import type { AgentEnergyTrend } from '../../../shared/energyTrends';

function makeTrend(overrides: Partial<AgentEnergyTrend>): AgentEnergyTrend {
  return {
    agent: overrides.agent ?? '0xagent',
    sampleCount: overrides.sampleCount ?? 10,
    anomalyCount: overrides.anomalyCount ?? 0,
    anomalyRate: overrides.anomalyRate ?? 0,
    shortTermEnergy: overrides.shortTermEnergy ?? 120,
    longTermEnergy: overrides.longTermEnergy ?? 100,
    energyMomentum: overrides.energyMomentum ?? 20,
    energyMomentumRatio: overrides.energyMomentumRatio ?? 0.2,
    shortTermEfficiency: overrides.shortTermEfficiency ?? 0.4,
    longTermEfficiency: overrides.longTermEfficiency ?? 0.35,
    efficiencyMomentum: overrides.efficiencyMomentum ?? 0.05,
    totalReward: overrides.totalReward ?? 400,
    averageReward: overrides.averageReward ?? 40,
    status: overrides.status ?? 'warming',
    notes: overrides.notes ?? [],
    lastUpdated: overrides.lastUpdated ?? new Date().toISOString(),
    lastAnomalyAt: overrides.lastAnomalyAt,
    lastSample: overrides.lastSample,
  };
}

const baseOptions: TrendEvaluationOptions = {
  maxMomentumRatio: 0.3,
  profitWeight: 0.25,
  coolingBonusWeight: 0.15,
  minProfitFloor: 0.02,
  blockedStatuses: new Set(['overheating']),
};

const defaultFloor = 0.05;

const warmTrend = makeTrend({ status: 'warming', energyMomentumRatio: 0.18 });
const hotTrend = makeTrend({ status: 'overheating', energyMomentumRatio: 0.6 });
const coolingTrend = makeTrend({
  status: 'cooling',
  energyMomentumRatio: -0.12,
});

// parseTrendStatuses should default to blocking overheating
const defaultStatuses = parseTrendStatuses(undefined);
assert(defaultStatuses.has('overheating'), 'default should block overheating');

// parseTrendStatuses should ignore invalid entries and accept valid ones
const parsed = parseTrendStatuses('warming,invalid, COOLING');
assert(parsed.has('warming'), 'should include warming status');
assert(parsed.has('cooling'), 'should include cooling status');
assert(!parsed.has('overheating'), 'should not include overheating implicitly');

// parseTrendStatuses should allow disabling filtering
const none = parseTrendStatuses('none');
assert.equal(none.size, 0, 'none should disable all blocked statuses');

// Overheating trend should be blocked
const overheating = evaluateTrendForAgent(hotTrend, defaultFloor, baseOptions);
assert(overheating.blocked, 'overheating status should block agent');
assert.equal(overheating.reason, 'status:overheating');

// Warming trend within momentum threshold should increase profit floor
const warm = evaluateTrendForAgent(warmTrend, defaultFloor, baseOptions);
assert(!warm.blocked, 'warming trend within limit should not block');
assert(
  warm.profitFloor > defaultFloor,
  'warming trend should raise profit floor'
);
assert(warm.penalty > 0, 'warming trend should apply penalty');

// Cooling trend should lower profit floor but respect minimum bound
const cooling = evaluateTrendForAgent(coolingTrend, defaultFloor, baseOptions);
assert(!cooling.blocked, 'cooling trend should not block');
assert(
  cooling.profitFloor <= defaultFloor,
  'cooling trend should reduce floor'
);
assert(
  cooling.profitFloor >= baseOptions.minProfitFloor,
  'floor should respect minimum'
);
assert(cooling.bonus > 0, 'cooling trend should earn bonus');

// Excessive momentum should block even if status allowed
const optionsNoBlockStatus: TrendEvaluationOptions = {
  ...baseOptions,
  blockedStatuses: new Set(['cooling']),
};
const aggressiveMomentum = evaluateTrendForAgent(
  makeTrend({ status: 'stable', energyMomentumRatio: 0.9 }),
  defaultFloor,
  optionsNoBlockStatus
);
assert(aggressiveMomentum.blocked, 'momentum beyond max should block');
assert.equal(
  aggressiveMomentum.reason,
  'momentum:0.9000',
  'reason should include formatted momentum'
);

console.log('trendScoring tests passed');
