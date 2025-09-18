const STATE_OFFSET = 0n;
const SUCCESS_OFFSET = 3n;
const BURN_CONFIRMED_OFFSET = 4n;
const AGENT_TYPES_OFFSET = 5n;
const FEE_PCT_OFFSET = 13n;
const AGENT_PCT_OFFSET = 45n;
const DEADLINE_OFFSET = 77n;
const ASSIGNED_AT_OFFSET = 141n;

const STATE_MASK = 0x7n << STATE_OFFSET;
const SUCCESS_MASK = 0x1n << SUCCESS_OFFSET;
const BURN_CONFIRMED_MASK = 0x1n << BURN_CONFIRMED_OFFSET;
const AGENT_TYPES_MASK = 0xffn << AGENT_TYPES_OFFSET;
const FEE_PCT_MASK = 0xffffffffn << FEE_PCT_OFFSET;
const AGENT_PCT_MASK = 0xffffffffn << AGENT_PCT_OFFSET;
const DEADLINE_MASK = 0xffffffffffffffffn << DEADLINE_OFFSET;
const ASSIGNED_AT_MASK = 0xffffffffffffffffn << ASSIGNED_AT_OFFSET;

function toBigInt(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(value);
  if (typeof value === 'string') return BigInt(value);
  if (typeof value.toString === 'function') {
    return BigInt(value.toString());
  }
  return undefined;
}

function decodeJobMetadata(packed) {
  const value = toBigInt(packed);
  if (value === undefined) {
    return {};
  }
  return {
    state: Number((value & STATE_MASK) >> STATE_OFFSET),
    success: (value & SUCCESS_MASK) !== 0n,
    burnConfirmed: (value & BURN_CONFIRMED_MASK) !== 0n,
    agentTypes: Number((value & AGENT_TYPES_MASK) >> AGENT_TYPES_OFFSET),
    feePct: (value & FEE_PCT_MASK) >> FEE_PCT_OFFSET,
    agentPct: (value & AGENT_PCT_MASK) >> AGENT_PCT_OFFSET,
    deadline: (value & DEADLINE_MASK) >> DEADLINE_OFFSET,
    assignedAt: (value & ASSIGNED_AT_MASK) >> ASSIGNED_AT_OFFSET,
  };
}

function enrichJob(job) {
  const metadata = decodeJobMetadata(job.packedMetadata);
  return {
    ...job,
    ...metadata,
  };
}

module.exports = {
  decodeJobMetadata,
  enrichJob,
};
