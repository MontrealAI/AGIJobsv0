import { type RandomSource } from "./random";

export type OperationType =
  | "scale"
  | "offset"
  | "power"
  | "mod"
  | "difference"
  | "cumulative"
  | "mirror"
  | "threshold";

export interface OperationParameters {
  [key: string]: number;
}

export interface OperationInstance {
  type: OperationType;
  params: OperationParameters;
}

interface OperationDefinition {
  type: OperationType;
  label: string;
  description: (params: OperationParameters) => string;
  energyCost: number;
  generate: (rng: RandomSource) => OperationParameters;
  mutate: (params: OperationParameters, rng: RandomSource) => OperationParameters;
  apply: (input: number[], params: OperationParameters) => number[];
}

function clone(values: number[]): number[] {
  return values.slice();
}

function roundValues(values: number[]): number[] {
  return values.map((value) => {
    if (!Number.isFinite(value)) {
      return 0;
    }
    const rounded = Math.round(value * 1e6) / 1e6;
    if (Math.abs(rounded) < 1e-9) {
      return 0;
    }
    return rounded;
  });
}

function safeMod(value: number, modulus: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(modulus) || modulus === 0) {
    return 0;
  }
  const result = value % modulus;
  if (result < 0) {
    return result + Math.abs(modulus);
  }
  return result;
}

const OPERATIONS: Record<OperationType, OperationDefinition> = {
  scale: {
    type: "scale",
    label: "Scale",
    description: (params) => `Multiply values by ${params.factor?.toFixed(2) ?? "1"}`,
    energyCost: 18,
    generate: (rng) => ({ factor: rng.nextInRange(0.8, 3.5) }),
    mutate: (params, rng) => ({
      factor: Math.max(0.1, rng.perturb(params.factor ?? 1, 0.75, { min: 0.1, max: 5 })),
    }),
    apply: (input, params) => roundValues(input.map((value) => value * (params.factor ?? 1))),
  },
  offset: {
    type: "offset",
    label: "Offset",
    description: (params) => `Add ${params.value?.toFixed(2) ?? "0"} to each element`,
    energyCost: 16,
    generate: (rng) => ({ value: rng.nextInRange(-5, 5) }),
    mutate: (params, rng) => ({ value: rng.perturb(params.value ?? 0, 2.5, { min: -8, max: 8 }) }),
    apply: (input, params) => roundValues(input.map((value) => value + (params.value ?? 0))),
  },
  power: {
    type: "power",
    label: "Exponentiation",
    description: (params) => `Raise values to exponent ${params.exponent?.toFixed(2) ?? "1"}`,
    energyCost: 34,
    generate: (rng) => ({ exponent: rng.nextInRange(1.2, 2.8) }),
    mutate: (params, rng) => ({ exponent: rng.perturb(params.exponent ?? 2, 0.6, { min: 0.8, max: 3.5 }) }),
    apply: (input, params) => {
      const exponent = params.exponent ?? 2;
      return roundValues(
        input.map((value) => {
          if (!Number.isFinite(value)) {
            return 0;
          }
          const magnitude = Math.min(Math.abs(value), 1e6);
          const sign = value >= 0 ? 1 : -1;
          const powered = sign * magnitude ** exponent;
          if (!Number.isFinite(powered)) {
            return sign * 1e6;
          }
          return powered;
        }),
      );
    },
  },
  mod: {
    type: "mod",
    label: "Modulo",
    description: (params) => `Wrap values by modulus ${params.modulus?.toFixed(2) ?? "1"}`,
    energyCost: 20,
    generate: (rng) => ({ modulus: rng.nextInRange(3, 9) }),
    mutate: (params, rng) => ({ modulus: Math.max(1, rng.perturb(params.modulus ?? 4, 2, { min: 1, max: 12 })) }),
    apply: (input, params) => {
      const modulus = params.modulus ?? 1;
      return roundValues(input.map((value) => safeMod(value, modulus)));
    },
  },
  difference: {
    type: "difference",
    label: "Edge difference",
    description: () => "Absolute difference between neighbours",
    energyCost: 22,
    generate: () => ({}),
    mutate: () => ({}),
    apply: (input) => {
      if (input.length === 0) {
        return [];
      }
      const result = new Array<number>(input.length).fill(0);
      for (let i = 1; i < input.length; i += 1) {
        const current = Number.isFinite(input[i]) ? input[i] : 0;
        const previous = Number.isFinite(input[i - 1]) ? input[i - 1] : 0;
        result[i] = Math.abs(current - previous);
      }
      return roundValues(result);
    },
  },
  cumulative: {
    type: "cumulative",
    label: "Cumulative sum",
    description: () => "Prefix sum of the sequence",
    energyCost: 28,
    generate: () => ({}),
    mutate: () => ({}),
    apply: (input) => {
      const result = new Array<number>(input.length).fill(0);
      let running = 0;
      for (let i = 0; i < input.length; i += 1) {
        const value = Number.isFinite(input[i]) ? input[i] : 0;
        running += value;
        result[i] = running;
      }
      return roundValues(result);
    },
  },
  mirror: {
    type: "mirror",
    label: "Mirror",
    description: () => "Reverse the sequence to explore symmetry",
    energyCost: 12,
    generate: () => ({}),
    mutate: () => ({}),
    apply: (input) => clone(input).reverse(),
  },
  threshold: {
    type: "threshold",
    label: "Threshold",
    description: (params) =>
      `Binary gate at ${params.threshold?.toFixed(2) ?? "0"} emitting ${params.high?.toFixed(2) ?? "1"}`,
    energyCost: 24,
    generate: (rng) => ({ threshold: rng.nextInRange(0.2, 1.8), high: rng.nextInRange(1.5, 4.5) }),
    mutate: (params, rng) => ({
      threshold: rng.perturb(params.threshold ?? 1, 0.35, { min: 0, max: 4 }),
      high: Math.max(0.5, rng.perturb(params.high ?? 1, 0.75, { min: 0.5, max: 6 })),
    }),
    apply: (input, params) => {
      const threshold = params.threshold ?? 0;
      const high = params.high ?? 1;
      return roundValues(input.map((value) => (value >= threshold ? high : 0)));
    },
  },
};

export const OPERATION_TYPES = Object.keys(OPERATIONS) as OperationType[];

export function isOperationType(value: string | undefined): value is OperationType {
  if (!value) {
    return false;
  }
  return (OPERATION_TYPES as string[]).includes(value);
}

export function describeOperation(operation: OperationInstance): string {
  const definition = OPERATIONS[operation.type];
  if (!definition) {
    return `${operation.type}`;
  }
  return `${definition.label}: ${definition.description(operation.params)}`;
}

export function operationEnergy(operation: OperationInstance): number {
  const definition = OPERATIONS[operation.type];
  return definition?.energyCost ?? 18;
}

export function applyPipeline(operations: OperationInstance[], input: number[]): number[] {
  return operations.reduce((acc, operation) => {
    const definition = OPERATIONS[operation.type];
    if (!definition) {
      return acc;
    }
    try {
      return definition.apply(acc, operation.params ?? {});
    } catch (error) {
      return acc.map(() => 0);
    }
  }, clone(input));
}

export function createOperation(
  type: OperationType,
  rng: RandomSource,
): OperationInstance {
  const definition = OPERATIONS[type];
  if (!definition) {
    throw new Error(`Unknown operation type: ${type}`);
  }
  return {
    type,
    params: definition.generate(rng),
  };
}

export function randomOperation(
  rng: RandomSource,
  options?: { allowedTypes?: OperationType[] },
): OperationInstance {
  const allowed = options?.allowedTypes?.length
    ? options.allowedTypes.filter((type): type is OperationType => OPERATION_TYPES.includes(type))
    : OPERATION_TYPES;
  const chosen = rng.pick(allowed);
  return createOperation(chosen, rng);
}

export function mutateOperation(
  original: OperationInstance,
  rng: RandomSource,
  options?: { allowedTypes?: OperationType[] },
): OperationInstance {
  const changeType = rng.next() < 0.18;
  if (changeType) {
    const allowed = options?.allowedTypes?.length
      ? options.allowedTypes.filter((type): type is OperationType => OPERATION_TYPES.includes(type))
      : OPERATION_TYPES;
    const replacement = rng.pick(allowed);
    if (replacement !== original.type) {
      return createOperation(replacement, rng);
    }
  }
  const definition = OPERATIONS[original.type];
  if (!definition) {
    return randomOperation(rng, options);
  }
  return {
    type: original.type,
    params: definition.mutate(original.params ?? {}, rng),
  };
}

export function signature(operation: OperationInstance): string {
  const params = Object.entries(operation.params ?? {})
    .map(([key, value]) => `${key}=${Number.isFinite(value) ? value.toFixed(3) : "0"}`)
    .sort()
    .join(",");
  return `${operation.type}(${params})`;
}

export function summarisePipeline(operations: OperationInstance[]): string[] {
  return operations.map((operation, index) => `${index + 1}. ${describeOperation(operation)}`);
}
