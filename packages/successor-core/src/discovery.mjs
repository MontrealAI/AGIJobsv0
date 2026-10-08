/** Bounded, browser-safe interpreters and finite search. No dynamic code execution. */
export class DiscoveryError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'DiscoveryError';
    this.code = code;
    this.details = details;
  }
}

const fail = (code, message, details) => {
  throw new DiscoveryError(code, message, details);
};
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
const numeric = (value, name) => {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    Math.abs(value) > Number.MAX_SAFE_INTEGER
  ) {
    fail(
      'INVALID_NUMBER',
      `${name} must be finite and within the safe numeric range.`
    );
  }
  return value;
};
const boundedInteger = (value, fallback, maximum, name, minimum = 1) => {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < minimum || result > maximum) {
    fail(
      'INVALID_LIMIT',
      `${name} must be an integer between ${minimum} and ${maximum}.`
    );
  }
  return result;
};
const record = (value, name) => {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    fail('INVALID_RECORD', `${name} must be a plain object.`);
  for (const key of Object.keys(value)) {
    if (
      forbidden.has(key) ||
      Object.getOwnPropertyDescriptor(value, key)?.get ||
      Object.getOwnPropertyDescriptor(value, key)?.set
    ) {
      fail('UNSAFE_PROPERTY', `${name} contains a forbidden property.`);
    }
  }
  return value;
};
const nameOf = (value) => {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z][A-Za-z0-9_:-]{0,79}$/.test(value) ||
    forbidden.has(value)
  ) {
    fail('INVALID_IDENTIFIER', 'Only bounded simple identifiers are accepted.');
  }
  return value;
};
const unitOf = (value = '1') => {
  if (
    value !== '1' &&
    (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(value))
  ) {
    fail(
      'INVALID_UNIT',
      'Use a declared simple unit, or 1 for dimensionless values.'
    );
  }
  return value;
};
const typed = (value, definition = {}) => {
  const type =
    definition.type ?? (typeof value === 'boolean' ? 'boolean' : 'number');
  if (!['number', 'boolean'].includes(type))
    fail('INVALID_TYPE', 'Only number and boolean values are supported.');
  if (
    type === 'boolean' &&
    definition.unit !== undefined &&
    definition.unit !== '1'
  )
    fail('UNIT_MISMATCH', 'Boolean values are dimensionless.');
  const unit = type === 'boolean' ? '1' : unitOf(definition.unit);
  if (value === null) return { known: false, value: null, type, unit };
  if (type === 'number') numeric(value, 'Expression value');
  else if (typeof value !== 'boolean')
    fail('TYPE_MISMATCH', 'Boolean value required.');
  return { known: true, value, type, unit };
};

/** AST nodes: literal, unknown, var, add/sub/mul/div/min/max, comparisons, and/or/not, if. */
export function evaluateExpression(ast, context = {}, limits = {}) {
  record(context, 'Expression context');
  const maxSteps = boundedInteger(limits.maxSteps, 2048, 20000, 'maxSteps');
  const maxDepth = boundedInteger(limits.maxDepth, 32, 64, 'maxDepth');
  let steps = 0;
  const visit = (node, depth) => {
    if (++steps > maxSteps || depth > maxDepth)
      fail(
        'EXPRESSION_BUDGET_EXHAUSTED',
        'Expression exceeded its step or depth budget.'
      );
    record(node, 'AST node');
    if (typeof node.op !== 'string')
      fail('UNSUPPORTED_OPERATION', 'AST operation must be a string.');
    const fieldsByOperation = {
      literal: ['op', 'value', 'unit'],
      unknown: ['op', 'type', 'unit'],
      var: ['op', 'name'],
    };
    const allowedKeys = own(fieldsByOperation, node.op)
      ? fieldsByOperation[node.op]
      : ['op', 'args'];
    if (Object.keys(node).some((key) => !allowedKeys.includes(key)))
      fail('UNKNOWN_AST_FIELD', 'AST node contains unsupported fields.');
    if (node.op === 'literal') return typed(node.value, { unit: node.unit });
    if (node.op === 'unknown')
      return typed(null, { type: node.type, unit: node.unit });
    if (node.op === 'var') {
      const name = nameOf(node.name);
      if (!own(context, name))
        fail('MISSING_VARIABLE', `Missing variable ${name}.`);
      const input = context[name];
      if (input !== null && typeof input === 'object') {
        record(input, 'Typed input');
        return typed(input.value, input);
      }
      return typed(input);
    }
    const counts = {
      add: 2,
      sub: 2,
      mul: 2,
      div: 2,
      min: 2,
      max: 2,
      lt: 2,
      lte: 2,
      gt: 2,
      gte: 2,
      eq: 2,
      and: 2,
      or: 2,
      not: 1,
      if: 3,
    };
    if (
      !own(counts, node.op) ||
      !Array.isArray(node.args) ||
      node.args.length !== counts[node.op]
    ) {
      fail(
        'UNSUPPORTED_OPERATION',
        'Unsupported operation or invalid argument count.'
      );
    }
    // Inspect both branches, including dormant branches; invalid AST is never hidden by a condition.
    const args = node.args.map((arg) => visit(arg, depth + 1));
    const [left, right, third] = args;
    const requireType = (item, expected) => {
      if (item.type !== expected)
        fail('TYPE_MISMATCH', `${node.op} requires ${expected} operands.`);
    };
    const same = (a, b) => {
      if (a.type !== b.type || a.unit !== b.unit)
        fail('UNIT_MISMATCH', `${node.op} requires equal types and units.`);
    };
    let type = 'number';
    let unit = left.unit;
    if (node.op === 'if') {
      requireType(left, 'boolean');
      same(right, third);
      type = right.type;
      unit = right.unit;
      if (!left.known) return { known: false, value: null, type, unit };
      return { ...(left.value ? right : third) };
    }
    if (['and', 'or', 'not'].includes(node.op)) {
      args.forEach((item) => requireType(item, 'boolean'));
      type = 'boolean';
      unit = '1';
    } else if (node.op === 'eq') {
      same(left, right);
      type = 'boolean';
      unit = '1';
    } else {
      args.forEach((item) => requireType(item, 'number'));
      if (['lt', 'lte', 'gt', 'gte'].includes(node.op)) {
        same(left, right);
        type = 'boolean';
        unit = '1';
      } else if (node.op === 'mul') {
        if (left.unit !== '1' && right.unit !== '1')
          fail(
            'UNSUPPORTED_UNIT_OPERATION',
            'Multiply by a dimensionless scalar only.'
          );
        unit = left.unit === '1' ? right.unit : left.unit;
      } else if (node.op === 'div') {
        if (right.unit !== '1' && left.unit !== right.unit)
          fail(
            'UNSUPPORTED_UNIT_OPERATION',
            'Divide by a scalar or a quantity with the same unit.'
          );
        unit = right.unit === '1' ? left.unit : '1';
      } else same(left, right);
    }
    if (args.some((item) => !item.known))
      return { known: false, value: null, type, unit };
    const a = left.value;
    const b = right?.value;
    if (node.op === 'div' && b === 0)
      fail(
        'DIVISION_BY_ZERO',
        'Division by zero is not an admissible prediction.'
      );
    const operations = {
      add: () => a + b,
      sub: () => a - b,
      mul: () => a * b,
      div: () => a / b,
      min: () => Math.min(a, b),
      max: () => Math.max(a, b),
      lt: () => a < b,
      lte: () => a <= b,
      gt: () => a > b,
      gte: () => a >= b,
      eq: () => a === b,
      and: () => a && b,
      or: () => a || b,
      not: () => !a,
    };
    return typed(operations[node.op](), { type, unit });
  };
  return { ...visit(ast, 0), steps };
}

/** Every next-state field reads the same prior state; transition order cannot change predictions. */
export function stepWorld(program, state, action, limits = {}) {
  record(program, 'World program');
  record(state, 'State');
  record(action, 'Action');
  record(program.state, 'State definitions');
  record(program.action, 'Action definitions');
  record(program.transitions, 'Transitions');
  const fields = Object.keys(program.state);
  if (
    fields.length === 0 ||
    fields.length > 32 ||
    Object.keys(program.action).length > 32
  )
    fail(
      'WORLD_SIZE_EXCEEDED',
      'A world supports 1–32 state fields and at most 32 action fields.'
    );
  const maxSteps = boundedInteger(limits.maxSteps, 4096, 20000, 'maxSteps');
  const context = Object.create(null);
  for (const [scope, values, definitions] of [
    ['state', state, program.state],
    ['action', action, program.action],
  ]) {
    if (Object.keys(values).some((key) => !own(definitions, key)))
      fail('UNKNOWN_VARIABLE', `Unknown ${scope} variable.`);
    for (const [key, definition] of Object.entries(definitions)) {
      nameOf(key);
      record(definition, 'Variable definition');
      if (!own(values, key))
        fail('MISSING_VARIABLE', `Missing ${scope}:${key}.`);
      const item = typed(values[key], definition);
      if (
        item.known &&
        item.type === 'number' &&
        ((definition.min !== undefined &&
          item.value < numeric(definition.min, 'Variable minimum')) ||
          (definition.max !== undefined &&
            item.value > numeric(definition.max, 'Variable maximum')))
      ) {
        fail(
          'VARIABLE_OUT_OF_SCOPE',
          `${scope}:${key} is outside its declared domain.`
        );
      }
      context[`${scope}:${key}`] = item;
    }
  }
  if (Object.keys(program.transitions).some((key) => !own(program.state, key)))
    fail('UNKNOWN_TRANSITION', 'Transition changes an undeclared state field.');
  let steps = 0;
  const nextState = {};
  const unknownFields = [];
  for (const key of fields) {
    if (!own(program.transitions, key))
      fail('MISSING_TRANSITION', `Missing transition for ${key}.`);
    if (steps >= maxSteps)
      fail(
        'EXPRESSION_BUDGET_EXHAUSTED',
        'World transition exceeded its total step budget.'
      );
    const result = evaluateExpression(program.transitions[key], context, {
      ...limits,
      maxSteps: maxSteps - steps,
    });
    steps += result.steps;
    const definition = program.state[key];
    const expectedUnit =
      definition.type === 'boolean' ? '1' : unitOf(definition.unit);
    if (result.type !== definition.type || result.unit !== expectedUnit)
      fail(
        'TRANSITION_TYPE_MISMATCH',
        `Transition for ${key} has incompatible type or unit.`
      );
    if (
      result.known &&
      result.type === 'number' &&
      ((definition.min !== undefined && result.value < definition.min) ||
        (definition.max !== undefined && result.value > definition.max))
    ) {
      fail(
        'TRANSITION_OUT_OF_SCOPE',
        `Transition for ${key} exceeds its declared next-state domain.`
      );
    }
    nextState[key] = result.value;
    if (!result.known) unknownFields.push(key);
  }
  return { nextState, known: unknownFields.length === 0, unknownFields, steps };
}

const literal = (value, unit = '1') => ({
  op: 'literal',
  value,
  ...(unit !== '1' ? { unit } : {}),
});
const variable = (name) => ({ op: 'var', name });
const operator = (op, ...args) => ({ op, args });

export function createEnergyWorld({
  id = 'energy-world',
  leak = 0,
  conditional = true,
} = {}) {
  nameOf(id);
  numeric(leak, 'Leak');
  if (leak < 0 || leak > 100)
    fail('INVALID_SEARCH_SPACE', 'Leak must be within 0–100 kWh.');
  if (typeof conditional !== 'boolean')
    fail('INVALID_SEARCH_SPACE', 'conditional must be a Boolean.');
  return {
    id,
    version: 1,
    representation: 'bounded-ast-v1',
    state: {
      charge: { type: 'number', unit: 'kWh', min: -1000, max: 1000 },
      hot: { type: 'boolean' },
    },
    action: { draw: { type: 'number', unit: 'kWh', min: 0, max: 1000 } },
    transitions: {
      charge: operator(
        'sub',
        operator('sub', variable('state:charge'), variable('action:draw')),
        conditional
          ? operator(
              'if',
              variable('state:hot'),
              literal(leak, 'kWh'),
              literal(0, 'kWh')
            )
          : literal(leak, 'kWh')
      ),
      hot: variable('state:hot'),
    },
    assumptions: [
      'Single-period synthetic energy balance.',
      'No recharge or unmodeled loss during the step.',
    ],
    falsifier:
      'An observed next charge differs from the declared prediction beyond the mission tolerance.',
    scope:
      'Synthetic bounded battery transitions; no physical-control authority.',
  };
}

/** Real finite synthesis: enumerate declared guard/coefficient programs and measure held-in fit. */
export function synthesizeWorldCandidates(
  observations,
  searchSpec = {},
  limits = {}
) {
  if (
    !Array.isArray(observations) ||
    observations.length < 1 ||
    observations.length > 1000
  )
    fail('INVALID_OBSERVATIONS', 'Provide 1–1000 formation observations.');
  const leaks = searchSpec.leakValues ?? [0, 2, 5, 8];
  const guards = searchSpec.conditionalValues ?? [false, true];
  if (
    !Array.isArray(leaks) ||
    leaks.length < 1 ||
    leaks.length > 32 ||
    !Array.isArray(guards) ||
    guards.length < 1 ||
    guards.length > 2
  )
    fail('INVALID_SEARCH_SPACE', 'Search space is missing or too large.');
  if (
    new Set(leaks).size !== leaks.length ||
    new Set(guards).size !== guards.length
  )
    fail('INVALID_SEARCH_SPACE', 'Search space contains duplicate settings.');
  const maxCandidates = boundedInteger(
    limits.maxCandidates,
    16,
    256,
    'maxCandidates'
  );
  const maxSteps = boundedInteger(limits.maxSteps, 200000, 2000000, 'maxSteps');
  const candidates = [];
  let steps = 0;
  let exhausted = false;
  outer: for (const conditional of guards) {
    for (const leak of leaks) {
      if (candidates.length >= maxCandidates) {
        exhausted = true;
        break outer;
      }
      const program = createEnergyWorld({
        id: `world_${conditional ? 'guarded' : 'constant'}_${String(
          leak
        ).replace('.', '_')}`,
        leak,
        conditional,
      });
      let squaredError = 0;
      let candidateSteps = 0;
      for (const observation of observations) {
        const remaining = maxSteps - steps - candidateSteps;
        if (remaining <= 0) {
          steps += candidateSteps;
          exhausted = true;
          break outer;
        }
        let result;
        try {
          result = stepWorld(program, observation.state, observation.action, {
            maxSteps: Math.min(4096, remaining),
          });
        } catch (error) {
          if (error.code !== 'EXPRESSION_BUDGET_EXHAUSTED') throw error;
          steps = maxSteps;
          exhausted = true;
          break outer;
        }
        candidateSteps += result.steps;
        const expected = numeric(
          observation.nextState?.charge,
          'Observed charge'
        );
        if (!result.known)
          fail(
            'UNKNOWN_FORMATION_TARGET',
            'Formation inputs must have known values.'
          );
        squaredError += (result.nextState.charge - expected) ** 2;
      }
      steps += candidateSteps;
      candidates.push({
        id: program.id,
        program,
        settings: { leak, conditional },
        formationMSE: squaredError / observations.length,
        formationCount: observations.length,
      });
    }
  }
  candidates.sort(
    (a, b) => a.formationMSE - b.formationMSE || a.id.localeCompare(b.id)
  );
  return {
    candidates,
    selected: candidates[0] ?? null,
    evaluated: candidates.length,
    steps,
    budget: { maxCandidates, maxSteps },
    stopped: exhausted ? 'BUDGET_EXHAUSTED' : 'SEARCH_SPACE_EXHAUSTED',
    evidenceClass: 'FORMATION_ONLY',
  };
}

/** Decision-aware scoring: an unsafe dispatch is a critical miss regardless of average fit. */
export function evaluateCandidates(candidates, cases, criteria = {}) {
  if (
    !Array.isArray(candidates) ||
    candidates.length < 1 ||
    candidates.length > 256 ||
    !Array.isArray(cases) ||
    cases.length < 1 ||
    cases.length > 5000
  )
    fail(
      'INVALID_EVALUATION',
      'Candidate or case count outside supported bounds.'
    );
  const reserve = numeric(criteria.reserve ?? 10, 'Reserve');
  const criticalMissBudget = boundedInteger(
    criteria.criticalMissBudget,
    0,
    5000,
    'criticalMissBudget',
    0
  );
  const safeDispatchValue = numeric(
    criteria.safeDispatchValue ?? 10,
    'Safe-dispatch value'
  );
  const criticalMissCost = numeric(
    criteria.criticalMissCost ?? 100,
    'Critical-miss cost'
  );
  const unnecessaryHoldCost = numeric(
    criteria.unnecessaryHoldCost ?? 1,
    'Unnecessary-hold cost'
  );
  const maxSteps = boundedInteger(
    criteria.maxSteps,
    2000000,
    20000000,
    'maxSteps'
  );
  let evaluationSteps = 0;
  const evaluated = candidates.map((candidate) => {
    let correct = 0;
    let criticalMisses = 0;
    let unnecessaryHolds = 0;
    let abstentions = 0;
    let absoluteError = 0;
    let knownPredictions = 0;
    let utility = 0;
    const predictions = [];
    for (const item of cases) {
      const observed = numeric(item.nextState?.charge, 'Observed charge');
      if (evaluationSteps >= maxSteps)
        fail(
          'EVALUATION_BUDGET_EXHAUSTED',
          'Evaluation exhausted its aggregate step budget.'
        );
      let result;
      try {
        result = stepWorld(candidate.program, item.state, item.action, {
          maxSteps: Math.min(4096, maxSteps - evaluationSteps),
        });
      } catch (error) {
        if (error.code === 'EXPRESSION_BUDGET_EXHAUSTED')
          fail(
            'EVALUATION_BUDGET_EXHAUSTED',
            'Evaluation exhausted its aggregate or per-world step budget.'
          );
        throw error;
      }
      evaluationSteps += result.steps;
      const predicted = result.nextState.charge;
      const truthSafe = observed >= reserve;
      const decision =
        predicted === null
          ? 'ABSTAIN'
          : predicted >= reserve
          ? 'DISPATCH'
          : 'HOLD';
      if (decision === 'ABSTAIN') abstentions++;
      else {
        absoluteError += Math.abs(predicted - observed);
        knownPredictions++;
        if ((decision === 'DISPATCH') === truthSafe) correct++;
        if (decision === 'DISPATCH' && !truthSafe) {
          criticalMisses++;
          utility -= criticalMissCost;
        } else if (decision === 'DISPATCH') utility += safeDispatchValue;
        else if (truthSafe) {
          unnecessaryHolds++;
          utility -= unnecessaryHoldCost;
        }
      }
      predictions.push({
        caseId: item.id,
        predicted,
        observed,
        decision,
        truthSafe,
        criticalMiss: decision === 'DISPATCH' && !truthSafe,
      });
    }
    const executionCost = numeric(
      candidate.executionCost ?? 0,
      'Candidate execution cost'
    );
    if (executionCost < 0)
      fail('INVALID_COST', 'Execution cost cannot be negative.');
    const metrics = {
      cases: cases.length,
      correct,
      accuracy: correct / cases.length,
      criticalMisses,
      unnecessaryHolds,
      abstentions,
      meanAbsoluteError: knownPredictions
        ? absoluteError / knownPredictions
        : null,
      utility: utility - executionCost,
      executionCost,
    };
    return {
      ...candidate,
      metrics,
      eligible: criticalMisses <= criticalMissBudget && abstentions === 0,
      failures: [
        ...(criticalMisses > criticalMissBudget
          ? ['CRITICAL_MISS_BUDGET_EXCEEDED']
          : []),
        ...(abstentions ? ['INSUFFICIENT_PREDICTIONS'] : []),
      ],
      predictions,
    };
  });
  const dimensions = (item) => [
    item.metrics.utility,
    -item.metrics.criticalMisses,
    -item.metrics.executionCost,
    -item.metrics.unnecessaryHolds,
  ];
  const dominates = (a, b) => {
    const av = dimensions(a),
      bv = dimensions(b);
    return (
      av.every((value, i) => value >= bv[i]) &&
      av.some((value, i) => value > bv[i])
    );
  };
  return evaluated.map((item) => ({
    ...item,
    paretoEligible:
      item.eligible &&
      !evaluated.some((other) => other.eligible && dominates(other, item)),
  }));
}

function validateEvidenceProblem(problem) {
  record(problem, 'Evidence problem');
  const { worlds, experiments, decisions } = problem;
  if (
    !Array.isArray(worlds) ||
    worlds.length < 1 ||
    worlds.length > 256 ||
    !Array.isArray(experiments) ||
    experiments.length > 12 ||
    !Array.isArray(decisions) ||
    decisions.length < 1 ||
    decisions.length > 32
  )
    fail(
      'INVALID_EVIDENCE_PROBLEM',
      'Evidence problem exceeds supported finite bounds.'
    );
  const unique = (items, title) => {
    const ids = items.map((item) => nameOf(item.id));
    if (new Set(ids).size !== ids.length)
      fail('DUPLICATE_IDENTIFIER', `${title} identifiers must be unique.`);
  };
  unique(worlds, 'World');
  unique(experiments, 'Experiment');
  unique(decisions, 'Decision');
  let total = 0;
  for (const world of worlds) {
    numeric(world.probability, 'World probability');
    if (world.probability < 0 || world.probability > 1)
      fail(
        'INVALID_PROBABILITY',
        'World probabilities must lie between 0 and 1.'
      );
    total += world.probability;
    record(world.observations, 'World observations');
    record(world.utilities, 'World utilities');
    for (const experiment of experiments) {
      const value = world.observations[experiment.id];
      if (typeof value !== 'string' || value.length > 80 || value.length === 0)
        fail(
          'INVALID_OBSERVATION',
          'Every experiment requires a bounded outcome label in every world.'
        );
    }
    for (const decision of decisions)
      numeric(world.utilities[decision.id], 'Decision utility');
  }
  if (Math.abs(total - 1) > 1e-9)
    fail('INVALID_PROBABILITY', 'Joint-world probabilities must sum to 1.');
  for (const experiment of experiments) {
    if (!Number.isSafeInteger(experiment.cost) || experiment.cost < 0)
      fail(
        'INVALID_COST',
        'Experiment costs are nonnegative integer base units.'
      );
  }
  const budget = boundedInteger(problem.budget, 30, 1000000000, 'budget', 0);
  const horizon = boundedInteger(problem.horizon, 2, 6, 'horizon', 0);
  const maxStates = boundedInteger(
    problem.maxStates,
    10000,
    100000,
    'maxStates'
  );
  return { worlds, experiments, decisions, budget, horizon, maxStates };
}

/** Exact finite joint-world Bayesian planning; shared-cause correlation is retained by conditioning. */
export function planEvidence(problem) {
  const { worlds, experiments, decisions, budget, horizon, maxStates } =
    validateEvidenceProblem(problem);
  let statesVisited = 0;
  const memo = new Map();
  const solve = (indices, remaining, money, depth) => {
    const key = `${indices.join(',')}|${remaining.join(',')}|${money}|${depth}`;
    if (memo.has(key)) return memo.get(key);
    if (++statesVisited > maxStates)
      fail(
        'SEARCH_BUDGET_EXHAUSTED',
        'Evidence search exceeded maxStates; no optimality claim is available.'
      );
    const mass = indices.reduce((sum, i) => sum + worlds[i].probability, 0);
    if (mass <= 0)
      fail(
        'IMPOSSIBLE_EVIDENCE',
        'Cannot condition on a zero-probability history.'
      );
    let best = null;
    for (const decision of decisions) {
      const value =
        indices.reduce(
          (sum, i) =>
            sum + worlds[i].probability * worlds[i].utilities[decision.id],
          0
        ) / mass;
      if (!best || value > best.value + 1e-10)
        best = {
          type: 'decision',
          decisionId: decision.id,
          value,
          expectedTestCost: 0,
          maxPathCost: 0,
        };
    }
    if (depth > 0)
      for (const experimentIndex of remaining) {
        const experiment = experiments[experimentIndex];
        if (experiment.cost > money) continue;
        const groups = new Map();
        for (const i of indices) {
          const outcome = worlds[i].observations[experiment.id];
          if (!groups.has(outcome)) groups.set(outcome, []);
          groups.get(outcome).push(i);
        }
        // An experiment with one possible outcome has no information value and never earns a forced purchase.
        if (groups.size < 2) continue;
        let value = -experiment.cost;
        let expectedTestCost = experiment.cost;
        let maxPathCost = experiment.cost;
        const branches = [];
        for (const [outcome, group] of [...groups].sort(([a], [b]) =>
          a.localeCompare(b)
        )) {
          const probability =
            group.reduce((sum, i) => sum + worlds[i].probability, 0) / mass;
          const policy = solve(
            group,
            remaining.filter((index) => index !== experimentIndex),
            money - experiment.cost,
            depth - 1
          );
          value += probability * policy.value;
          expectedTestCost += probability * policy.expectedTestCost;
          maxPathCost = Math.max(
            maxPathCost,
            experiment.cost + policy.maxPathCost
          );
          branches.push({ outcome, probability, policy });
        }
        if (
          value > best.value + 1e-10 ||
          (Math.abs(value - best.value) <= 1e-10 &&
            expectedTestCost < best.expectedTestCost - 1e-10)
        ) {
          best = {
            type: 'experiment',
            experimentId: experiment.id,
            cost: experiment.cost,
            value,
            expectedTestCost,
            maxPathCost,
            branches,
          };
        }
      }
    memo.set(key, best);
    return best;
  };
  const policy = solve(
    worlds.map((_, i) => i).filter((i) => worlds[i].probability > 0),
    experiments.map((_, i) => i),
    budget,
    horizon
  );
  return {
    expectedUtility: policy.value,
    expectedTestCost: policy.expectedTestCost,
    maxPathCost: policy.maxPathCost,
    policy,
    statesVisited,
    budget,
    horizon,
    stopped: 'SEARCH_SPACE_EXHAUSTED',
    assumption:
      'Known authored finite joint distribution; synthetic expected utilities, not realized customer value.',
  };
}

export function evaluateEvidencePolicy(policy, problem) {
  const { worlds, experiments, decisions, budget } =
    validateEvidenceProblem(problem);
  const experimentById = new Map(experiments.map((item) => [item.id, item]));
  const decisionIds = new Set(decisions.map((item) => item.id));
  let expectedUtility = 0;
  let expectedTestCost = 0;
  let maxPathCost = 0;
  for (const world of worlds) {
    if (world.probability === 0) continue;
    let cursor = policy;
    let cost = 0;
    const used = new Set();
    for (let depth = 0; ; depth++) {
      if (depth > 6)
        fail('INVALID_POLICY', 'Evidence policy exceeds supported depth.');
      record(cursor, 'Evidence policy');
      if (cursor.type === 'decision') {
        if (!decisionIds.has(cursor.decisionId))
          fail('INVALID_POLICY', 'Unknown terminal decision.');
        expectedUtility +=
          world.probability * (world.utilities[cursor.decisionId] - cost);
        expectedTestCost += world.probability * cost;
        maxPathCost = Math.max(maxPathCost, cost);
        break;
      }
      if (
        cursor.type !== 'experiment' ||
        !experimentById.has(cursor.experimentId) ||
        used.has(cursor.experimentId)
      )
        fail('INVALID_POLICY', 'Unknown or repeated experiment.');
      used.add(cursor.experimentId);
      cost += experimentById.get(cursor.experimentId).cost;
      if (cost > budget)
        fail('BUDGET_EXCEEDED', 'Evidence policy exceeds its path budget.');
      if (!Array.isArray(cursor.branches))
        fail('INVALID_POLICY', 'Experiment branches are missing.');
      const matching = cursor.branches.filter(
        (branch) => branch.outcome === world.observations[cursor.experimentId]
      );
      if (matching.length !== 1)
        fail(
          'INVALID_POLICY',
          'Evidence policy has missing or duplicate outcome branches.'
        );
      cursor = matching[0].policy;
    }
  }
  return { expectedUtility, expectedTestCost, maxPathCost };
}

export function posteriorProbability(problem, observations, predicate) {
  const { worlds, experiments } = validateEvidenceProblem(problem);
  record(observations, 'Observed experiment results');
  const ids = new Set(experiments.map((item) => item.id));
  if (Object.keys(observations).some((id) => !ids.has(id)))
    fail('INVALID_OBSERVATION', 'Unknown experiment.');
  const matching = worlds.filter((world) =>
    Object.entries(observations).every(
      ([id, result]) => world.observations[id] === result
    )
  );
  const mass = matching.reduce((sum, world) => sum + world.probability, 0);
  if (mass <= 0)
    fail(
      'IMPOSSIBLE_EVIDENCE',
      'Observed evidence has zero probability in the declared model.'
    );
  // Predicates are data, not caller-provided executable callbacks.
  record(predicate, 'Posterior predicate');
  nameOf(predicate.field);
  return (
    matching
      .filter(
        (world) =>
          own(world, predicate.field) &&
          world[predicate.field] === predicate.equals
      )
      .reduce((sum, world) => sum + world.probability, 0) / mass
  );
}

/** Exhaustive, budgeted scheduling with integer kWh accounting and shared compute/battery limits. */
export function planResources(problem) {
  record(problem, 'Resource problem');
  const periods = problem.periods;
  const jobs = problem.jobs;
  const battery = problem.battery;
  if (
    !Array.isArray(periods) ||
    periods.length < 1 ||
    periods.length > 6 ||
    !Array.isArray(jobs) ||
    jobs.length > 10
  )
    fail('INVALID_RESOURCE_PROBLEM', 'Use 1–6 periods and at most 10 jobs.');
  record(battery, 'Battery');
  const integer = (n, field, max = 1000000) =>
    boundedInteger(n, undefined, max, field, 0);
  integer(battery.capacityKWh, 'Battery capacity');
  integer(battery.initialKWh, 'Initial battery charge');
  integer(battery.maxDischargeKWh, 'Discharge limit');
  if (battery.initialKWh > battery.capacityKWh)
    fail(
      'INVALID_RESOURCE_PROBLEM',
      'Initial battery charge exceeds capacity.'
    );
  for (const period of periods) {
    integer(period.renewableKWh, 'Renewable supply');
    integer(period.computeSlots, 'Compute slots');
  }
  const ids = new Set();
  for (const job of jobs) {
    nameOf(job.id);
    if (ids.has(job.id))
      fail('DUPLICATE_IDENTIFIER', 'Resource-job identifiers must be unique.');
    ids.add(job.id);
    integer(job.energyKWh, 'Job energy');
    integer(job.computeSlots, 'Job compute slots');
    integer(job.releasePeriod ?? 0, 'Release period', periods.length - 1);
    integer(job.deadlinePeriod, 'Deadline period', periods.length - 1);
    if ((job.releasePeriod ?? 0) > job.deadlinePeriod)
      fail(
        'INVALID_RESOURCE_PROBLEM',
        'Job release must not follow its deadline.'
      );
    numeric(job.value, 'Job utility');
  }
  const maxStates = boundedInteger(
    problem.maxStates,
    50000,
    200000,
    'maxStates'
  );
  let statesVisited = 0;
  let feasiblePlans = 0;
  let best = null;
  const choices = Array(jobs.length).fill(-1);
  const inspect = () => {
    let charge = battery.initialKWh;
    let totalUsed = 0;
    let totalCurtailed = 0;
    const timeline = [];
    for (let time = 0; time < periods.length; time++) {
      const assigned = jobs.filter((_, i) => choices[i] === time);
      const energyUsed = assigned.reduce((sum, job) => sum + job.energyKWh, 0);
      const slotsUsed = assigned.reduce(
        (sum, job) => sum + job.computeSlots,
        0
      );
      const before = charge;
      const curtailment = Math.max(
        0,
        charge + periods[time].renewableKWh - battery.capacityKWh
      );
      charge = Math.min(
        battery.capacityKWh,
        charge + periods[time].renewableKWh
      );
      if (
        energyUsed > charge ||
        energyUsed > battery.maxDischargeKWh ||
        slotsUsed > periods[time].computeSlots
      )
        return;
      charge -= energyUsed;
      totalUsed += energyUsed;
      totalCurtailed += curtailment;
      timeline.push({
        period: time,
        startingKWh: before,
        generatedKWh: periods[time].renewableKWh,
        usedKWh: energyUsed,
        curtailedKWh: curtailment,
        endingKWh: charge,
        computeSlotsUsed: slotsUsed,
        computeSlotsAvailable: periods[time].computeSlots,
        jobs: assigned.map((job) => job.id),
      });
    }
    feasiblePlans++;
    const utility = jobs.reduce(
      (sum, job, i) => sum + (choices[i] < 0 ? 0 : job.value),
      0
    );
    if (
      !best ||
      utility > best.utility ||
      (utility === best.utility && totalUsed < best.totalUsedKWh)
    ) {
      best = {
        utility,
        allocations: jobs.map((job, i) => ({
          jobId: job.id,
          period: choices[i] < 0 ? null : choices[i],
          decision: choices[i] < 0 ? 'DEFER' : 'SCHEDULE',
        })),
        periods: timeline,
        totalUsedKWh: totalUsed,
        totalCurtailedKWh: totalCurtailed,
        finalKWh: charge,
      };
    }
  };
  const search = (index) => {
    if (++statesVisited > maxStates)
      fail(
        'SEARCH_BUDGET_EXHAUSTED',
        'Resource search exceeded maxStates; no optimality claim is available.'
      );
    if (index === jobs.length) {
      inspect();
      return;
    }
    choices[index] = -1;
    search(index + 1);
    for (
      let time = jobs[index].releasePeriod ?? 0;
      time <= jobs[index].deadlinePeriod;
      time++
    ) {
      choices[index] = time;
      search(index + 1);
    }
  };
  search(0);
  const totalGeneratedKWh = periods.reduce(
    (sum, period) => sum + period.renewableKWh,
    0
  );
  return {
    ...best,
    statesVisited,
    feasiblePlans,
    maxStates,
    stopped: 'SEARCH_SPACE_EXHAUSTED',
    totalGeneratedKWh,
    energyConserved:
      battery.initialKWh + totalGeneratedKWh ===
      best.totalUsedKWh + best.totalCurtailedKWh + best.finalKWh,
    units: {
      energy: 'kWh',
      utility: 'synthetic_utility_units',
      compute: 'concurrent_slots_per_period',
    },
    assumptions: [
      'One-period jobs.',
      'Generation is stored before dispatch.',
      'Idealized battery; no unmodeled charge losses.',
      'No grid imports or physical actuation.',
    ],
  };
}

/** A proposer must return bounded data; even a live model cannot introduce host code or tools. */
export function validateProposedWorld(program, sample, limits = {}) {
  const maximumBytes = boundedInteger(
    limits.maximumBytes,
    32000,
    256000,
    'maximumBytes'
  );
  const active = new Set();
  let visited = 0;
  const inspect = (value, depth = 0) => {
    if (++visited > 10000 || depth > 64)
      fail(
        'PROPOSAL_TOO_LARGE',
        'Proposal exceeds the structural traversal budget.'
      );
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'boolean'
    )
      return;
    if (typeof value === 'number') {
      numeric(value, 'Proposal number');
      return;
    }
    if (!value || typeof value !== 'object')
      fail('INVALID_PROPOSAL', 'Proposal must contain JSON data only.');
    if (active.has(value))
      fail('INVALID_PROPOSAL', 'Circular proposal references are forbidden.');
    if (!Array.isArray(value)) record(value, 'Proposed data');
    else if (Object.getPrototypeOf(value) !== Array.prototype)
      fail('INVALID_PROPOSAL', 'Custom array prototypes are forbidden.');
    active.add(value);
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor.get || descriptor.set || forbidden.has(key))
        fail(
          'INVALID_PROPOSAL',
          'Accessors and special properties are not proposal data.'
        );
      inspect(descriptor.value, depth + 1);
    }
    active.delete(value);
  };
  inspect(program);
  let serialized;
  try {
    serialized = JSON.stringify(program);
  } catch {
    fail('INVALID_PROPOSAL', 'Proposed program is not serializable.');
  }
  if (!serialized || new TextEncoder().encode(serialized).length > maximumBytes)
    fail('PROPOSAL_TOO_LARGE', 'Proposed program exceeds the input budget.');
  const result = stepWorld(program, sample.state, sample.action, limits);
  return {
    accepted: true,
    evidenceClass: 'STRUCTURAL_VALIDATION_ONLY',
    result,
    limitation:
      'Valid syntax and bounded execution do not establish truth, independent proof, or authority.',
  };
}
