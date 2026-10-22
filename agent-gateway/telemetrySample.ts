import type { EnergySample } from '../shared/energyMonitor';

const UINT256_MAX = (1n << 256n) - 1n;
const INT256_MAX = (1n << 255n) - 1n;
const NUMERIC_FIELDS = [
  'durationMs',
  'runtimeMs',
  'cpuTimeMs',
  'gpuTimeMs',
  'cpuUserUs',
  'cpuSystemUs',
  'cpuTotalUs',
  'cpuCycles',
  'gpuCycles',
  'memoryRssBytes',
  'energyEstimate',
  'entropyEstimate',
  'rewardValue',
  'efficiencyScore',
  'anomalyScore',
  'gpuUtilization',
] as const;

export const ENERGY_SCALING = Number.isFinite(
  Number(process.env.TELEMETRY_ENERGY_SCALING)
)
  ? Number(process.env.TELEMETRY_ENERGY_SCALING)
  : 1;
export const VALUE_SCALING = Number.isFinite(
  Number(process.env.TELEMETRY_VALUE_SCALING)
)
  ? Number(process.env.TELEMETRY_VALUE_SCALING)
  : 1_000_000;

export class EnergySampleInputError extends Error {
  readonly code = 'INVALID_TELEMETRY_SAMPLE';

  constructor(readonly field: string) {
    super(`Invalid telemetry sample field: ${field}`);
    this.name = 'EnergySampleInputError';
  }
}

// Preserve the operator's existing numeric-string rounding and defaults.
export function parseTelemetryInteger(value: unknown): bigint | null {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? BigInt(Math.round(value)) : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      if (trimmed.startsWith('0x') || trimmed.startsWith('-0x')) {
        return BigInt(trimmed);
      }
      const numeric = Number(trimmed);
      return Number.isFinite(numeric)
        ? BigInt(Math.round(numeric))
        : BigInt(trimmed);
    } catch {
      return null;
    }
  }
  return null;
}

function checkNumber(value: unknown, field: string, maximum = UINT256_MAX) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    BigInt(Math.round(value)) > maximum
  ) {
    throw new EnergySampleInputError(field);
  }
}

function checkScaled(value: number, scale: number, field: string, max: bigint) {
  const effectiveScale = Number.isFinite(scale) && scale !== 0 ? scale : 1;
  const scaled = value * effectiveScale;
  if (!Number.isFinite(scaled)) throw new EnergySampleInputError(field);
  checkNumber(Math.max(0, Math.round(scaled)), field, max);
}

export function validateEnergySample(
  input: unknown,
  scaling = { energyScaling: ENERGY_SCALING, valueScaling: VALUE_SCALING }
): asserts input is EnergySample {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new EnergySampleInputError('sample');
  }
  const sample = input as Record<string, unknown>;
  for (const field of NUMERIC_FIELDS) {
    if (sample[field] !== undefined) checkNumber(sample[field], field);
  }
  const cpu = Math.round((sample.cpuTimeMs as number | undefined) ?? 0);
  const gpu = Math.round((sample.gpuTimeMs as number | undefined) ?? 0);
  checkNumber(cpu + gpu, 'cpuTimeMs+gpuTimeMs');
  const energy = (sample.energyEstimate as number | undefined) ?? 0;
  checkScaled(energy, scaling.energyScaling, 'energyEstimate', INT256_MAX);
  const efficiency =
    (sample.efficiencyScore as number | undefined) ??
    (energy > 0
      ? ((sample.rewardValue as number | undefined) ?? 0) / energy
      : 0);
  checkScaled(efficiency, scaling.valueScaling, 'efficiencyScore', UINT256_MAX);

  if (sample.metadata !== undefined && sample.metadata !== null) {
    if (typeof sample.metadata !== 'object' || Array.isArray(sample.metadata)) {
      throw new EnergySampleInputError('metadata');
    }
    const metadata = sample.metadata as Record<string, unknown>;
    for (const field of ['degeneracy', 'runs', 'attempts']) {
      if (metadata[field] === undefined) continue;
      if (
        (typeof metadata[field] === 'number' ||
          typeof metadata[field] === 'string') &&
        Number(metadata[field]) < 0
      )
        throw new EnergySampleInputError(`metadata.${field}`);
      const parsed = parseTelemetryInteger(metadata[field]);
      if (parsed === null || parsed < 0n || parsed > UINT256_MAX) {
        throw new EnergySampleInputError(`metadata.${field}`);
      }
    }
  }
}

export function copyEnergySample(input: unknown): EnergySample {
  validateEnergySample(input);
  let copy: unknown;
  try {
    copy = JSON.parse(JSON.stringify(input));
  } catch {
    throw new EnergySampleInputError('JSON');
  }
  validateEnergySample(copy);
  return copy;
}
