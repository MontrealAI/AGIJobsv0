// SPDX-License-Identifier: MIT
// A finite, executable strategy laboratory. No provider, browser, wallet or network is invoked here.
import {
  canonicalize,
  cloneJson,
  digestBytes,
  digestObject,
} from './integrity.mjs';
import { SCHEMA_VERSION, SuccessorError, requireCondition } from './domain.mjs';
import { compileJobs } from './compiler.mjs';

const MAX_EXPORT_BYTES = 4 * 1024 * 1024;
const LIMITS = Object.freeze({
  suppliers: 3,
  units: 40,
  priceCents: 10000000,
  budgetCents: 1000000000,
  programs: 48,
  logicalOperations: 100000,
});
const HOLD = 'INCUMBENT_RETAINED_PENDING_INDEPENDENT_REVIEW';
const DEFAULT_REQUIREMENTS = Object.freeze({
  earlyUnits: 10,
  earlyDay: 7,
  totalUnits: 40,
  finalDay: 14,
  budgetCents: 51000,
});
const DEFAULT_SUPPLIERS = Object.freeze([
  Object.freeze({
    id: 'stellar',
    name: 'Stellar',
    unitCents: 1200,
    freightCents: 1000,
    deliveryDay: 7,
  }),
  Object.freeze({
    id: 'laurentian',
    name: 'Laurentian',
    unitCents: 700,
    freightCents: 2000,
    deliveryDay: 12,
  }),
  Object.freeze({
    id: 'boreal',
    name: 'Boreal',
    unitCents: 1400,
    freightCents: 0,
    deliveryDay: 5,
  }),
]);
const FORMULATIONS = ['all_early', 'actual_requirements'];
const ALLOCATION_OPS = [
  'single_supplier',
  'early_then_remainder',
  'enumerate_integer',
];
const ORDER_OPS = ['unit_price', 'landed_cost'];
const COST_MODELS = ['unit_only', 'landed'];
const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const check = (condition, code, message) =>
  requireCondition(condition, code, message);
function object(value, keys, name) {
  check(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).every((key) => keys.includes(key)),
    'COMPUTER_SCHEMA_INVALID',
    `${name} contains an unsupported field or is not an object.`
  );
}
function exact(value, keys, name) {
  object(value, keys, name);
  check(
    Object.keys(value).length === keys.length &&
      keys.every((key) => Object.hasOwn(value, key)),
    'COMPUTER_SCHEMA_INVALID',
    `${name} is missing a required field.`
  );
}
function integer(value, min, max, name) {
  check(
    Number.isSafeInteger(value) &&
      !Object.is(value, -0) &&
      value >= min &&
      value <= max,
    'COMPUTER_LIMIT_INVALID',
    `${name} must be a whole number between ${min} and ${max}.`
  );
  return value;
}
function text(value, max, name, empty = false) {
  check(
    typeof value === 'string' &&
      value.length <= max &&
      (empty || value.trim().length > 0),
    'COMPUTER_TEXT_INVALID',
    `${name} must be text of at most ${max} characters.`
  );
  check(
    value === value.normalize('NFC'),
    'COMPUTER_TEXT_UNICODE',
    `${name} must preserve composed Unicode characters (NFC).`
  );
  return value;
}
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function requirements(value) {
  exact(
    value,
    ['earlyUnits', 'earlyDay', 'totalUnits', 'finalDay', 'budgetCents'],
    'Actual requirements'
  );
  integer(value.totalUnits, 1, LIMITS.units, 'Total units');
  integer(value.earlyUnits, 0, value.totalUnits, 'Units required early');
  integer(value.earlyDay, 1, 365, 'Early day');
  integer(value.finalDay, value.earlyDay, 365, 'Final day');
  integer(value.budgetCents, 0, LIMITS.budgetCents, 'Budget in cents');
  return cloneJson(value);
}
function suppliers(value) {
  check(
    Array.isArray(value) &&
      value.length >= 1 &&
      value.length <= LIMITS.suppliers,
    'COMPUTER_SUPPLIER_LIMIT',
    'Use one to three suppliers.'
  );
  const ids = new Set();
  return value.map((supplier) => {
    exact(
      supplier,
      ['id', 'name', 'unitCents', 'freightCents', 'deliveryDay'],
      'Supplier quote'
    );
    text(supplier.id, 32, 'Supplier identifier');
    check(
      /^[a-z][a-z0-9_-]*$/.test(supplier.id) && !ids.has(supplier.id),
      'COMPUTER_SUPPLIER_INVALID',
      'Supplier identifiers must be unique lowercase letters, numbers, underscores or hyphens.'
    );
    ids.add(supplier.id);
    text(supplier.name, 80, 'Supplier name');
    integer(supplier.unitCents, 0, LIMITS.priceCents, 'Unit price in cents');
    integer(supplier.freightCents, 0, LIMITS.priceCents, 'Freight in cents');
    integer(supplier.deliveryDay, 1, 365, 'Delivery day');
    return cloneJson(supplier);
  });
}
function missionBody(mission) {
  exact(
    mission,
    [
      'schemaVersion',
      'kind',
      'title',
      'currency',
      'requirements',
      'suppliers',
      'inputRights',
      'evidenceClass',
      'digest',
    ],
    'Computer mission'
  );
  check(
    mission.schemaVersion === SCHEMA_VERSION &&
      mission.kind === 'SupplierComputerMission',
    'COMPUTER_SCHEMA_INVALID',
    'Unsupported computer mission schema.'
  );
  check(
    mission.currency === 'USD',
    'COMPUTER_CURRENCY_INVALID',
    'This bounded supplier scenario uses explicitly declared USD cents; no token conversion is performed.'
  );
  text(mission.title, 180, 'Mission title');
  requirements(mission.requirements);
  suppliers(mission.suppliers);
  exact(
    mission.inputRights,
    ['classification', 'license', 'attested', 'verified'],
    'Input rights'
  );
  check(
    ['synthetic', 'public'].includes(mission.inputRights.classification) &&
      mission.inputRights.attested === true &&
      mission.inputRights.verified === false,
    'COMPUTER_RIGHTS_INVALID',
    'Source rights remain explicitly attested and unverified.'
  );
  text(mission.inputRights.license, 1000, 'Input rights statement');
  check(
    [
      'SYNTHETIC_PUBLIC_FIXTURE',
      'USER_ATTESTED_PUBLIC_NONPERSONAL',
      'PUBLIC_GENERATED_VARIANT',
    ].includes(mission.evidenceClass),
    'COMPUTER_EVIDENCE_INVALID',
    'Unsupported evidence class.'
  );
  check(
    /^sha256:[a-f0-9]{64}$/.test(mission.digest),
    'COMPUTER_DIGEST_INVALID',
    'The mission needs its exact SHA-256 digest.'
  );
  const { digest, ...body } = mission;
  return body;
}
async function validateMission(mission) {
  const body = missionBody(mission);
  check(
    mission.digest ===
      (await digestObject('successor.computer-mission.v1', body)),
    'COMPUTER_MISSION_TAMPERED',
    'Mission facts or immutable actual requirements differ from their digest.'
  );
  return freeze(cloneJson(mission));
}
async function sealMission(body) {
  const mission = {
    ...body,
    digest: await digestObject('successor.computer-mission.v1', body),
  };
  return validateMission(mission);
}
export async function createComputerMission(options = {}) {
  object(
    options,
    [
      'title',
      'currency',
      'requirements',
      'suppliers',
      'publicNonPersonal',
      'rights',
    ],
    'New computer mission'
  );
  check(
    options.currency === undefined || options.currency === 'USD',
    'COMPUTER_CURRENCY_INVALID',
    'Declare quote amounts in USD cents. This scenario does not convert currencies or tokens.'
  );
  const customQuotes = options.suppliers !== undefined;
  if (customQuotes)
    check(
      options.publicNonPersonal === true &&
        typeof options.rights === 'string' &&
        options.rights.trim(),
      'COMPUTER_RIGHTS_REQUIRED',
      'Confirm your custom quotes are public, nonpersonal, and permitted for use and export.'
    );
  return sealMission({
    schemaVersion: SCHEMA_VERSION,
    kind: 'SupplierComputerMission',
    title: text(
      options.title || 'Deliver what is needed, when it is needed',
      180,
      'Mission title'
    ),
    currency: 'USD',
    requirements: requirements(options.requirements || DEFAULT_REQUIREMENTS),
    suppliers: suppliers(options.suppliers || DEFAULT_SUPPLIERS),
    inputRights: {
      classification: customQuotes ? 'public' : 'synthetic',
      license: customQuotes
        ? text(options.rights, 1000, 'Input rights statement')
        : 'Authored synthetic public supplier quotes with illustrative USD amounts; no real supplier, purchase, exchange-rate, or customer claim.',
      attested: true,
      verified: false,
    },
    evidenceClass: customQuotes
      ? 'USER_ATTESTED_PUBLIC_NONPERSONAL'
      : 'SYNTHETIC_PUBLIC_FIXTURE',
  });
}
function validatePlan(plan) {
  exact(
    plan,
    ['schemaVersion', 'kind', 'allocations', 'costCents'],
    'Allocation plan'
  );
  check(
    plan.schemaVersion === SCHEMA_VERSION &&
      plan.kind === 'SupplierAllocationPlan',
    'COMPUTER_PLAN_INVALID',
    'Unsupported allocation plan schema.'
  );
  check(
    Array.isArray(plan.allocations) &&
      plan.allocations.length >= 1 &&
      plan.allocations.length <= LIMITS.suppliers,
    'COMPUTER_PLAN_INVALID',
    'An allocation plan needs one to three supplier allocations.'
  );
  const ids = new Set();
  for (const allocation of plan.allocations) {
    exact(allocation, ['supplierId', 'units'], 'Supplier allocation');
    text(allocation.supplierId, 32, 'Supplier identifier');
    check(
      !ids.has(allocation.supplierId),
      'COMPUTER_PLAN_INVALID',
      'An allocation cannot repeat a supplier or charge freight twice.'
    );
    ids.add(allocation.supplierId);
    integer(allocation.units, 1, LIMITS.units, 'Allocated units');
  }
  integer(
    plan.costCents,
    0,
    LIMITS.budgetCents +
      LIMITS.suppliers * LIMITS.priceCents +
      LIMITS.units * LIMITS.priceCents,
    'Claimed plan cost'
  );
  return plan;
}

/** Separate constraint checker: it never trusts a solver's total, feasibility flag or quoted freight. */
export function checkComputerPlan(
  mission,
  plan,
  { formulation = 'actual_requirements' } = {}
) {
  missionBody(mission);
  validatePlan(plan);
  check(
    FORMULATIONS.includes(formulation),
    'COMPUTER_FORMULATION_INVALID',
    'Use actual requirements or the explicitly stricter all-early formulation.'
  );
  const required = mission.requirements;
  let totalUnits = 0,
    earlyUnits = 0,
    costCents = 0,
    known = true,
    finalOnTime = true;
  for (const allocation of plan.allocations) {
    const quote = mission.suppliers.find(
      (supplier) => supplier.id === allocation.supplierId
    );
    totalUnits += allocation.units;
    if (!quote) {
      known = false;
      continue;
    }
    costCents += quote.unitCents * allocation.units + quote.freightCents;
    if (quote.deliveryDay <= required.earlyDay) earlyUnits += allocation.units;
    if (quote.deliveryDay > required.finalDay) finalOnTime = false;
  }
  const checks = [
    {
      id: 'known-suppliers',
      passed: known,
      detail: 'Every allocation names exactly one supplied quote.',
    },
    {
      id: 'total-units',
      passed: totalUnits === required.totalUnits,
      detail: `Exactly ${required.totalUnits} units, without hiding excess or missing units.`,
    },
    {
      id: 'early-units',
      passed: earlyUnits >= required.earlyUnits,
      detail: `At least ${required.earlyUnits} units arrive by day ${required.earlyDay}.`,
    },
    {
      id: 'final-deadline',
      passed: finalOnTime,
      detail: `Every allocated unit arrives by day ${required.finalDay}.`,
    },
    {
      id: 'exact-freight-inclusive-cost',
      passed: known && plan.costCents === costCents,
      detail:
        'Integer unit costs plus freight once per used supplier are independently recomputed.',
    },
    {
      id: 'budget',
      passed: known && costCents <= required.budgetCents,
      detail: `Total landed cost stays within ${required.budgetCents} cents.`,
    },
    {
      id: 'formulation',
      passed:
        formulation !== 'all_early' ||
        (earlyUnits === required.totalUnits && plan.allocations.length === 1),
      detail:
        formulation === 'all_early'
          ? 'The original extra assumption requires one supplier and every unit by the early day.'
          : 'Only the immutable actual deadlines and quantities apply.',
    },
  ];
  const valid = checks.every((entry) => entry.passed);
  return freeze({
    valid,
    feasible: valid,
    formulation,
    checks,
    totals: { totalUnits, earlyUnits, costCents },
    independentProof: false,
    scope:
      'Complete arithmetic and deadline checks on the supplied quotes; source authenticity, real delivery and semantic usefulness are not established.',
  });
}

function makeProgram(
  formulation,
  allocation,
  earlyOrder,
  remainderOrder,
  costModel
) {
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'SupplierStrategyProgram',
    window: { op: 'delivery_window', formulation },
    allocation: { op: allocation, earlyOrder, remainderOrder },
    objective: { op: 'minimize_cost', costModel },
  };
}
export function validateComputerStrategy(program) {
  exact(
    program,
    ['schemaVersion', 'kind', 'window', 'allocation', 'objective'],
    'Strategy program'
  );
  check(
    program.schemaVersion === SCHEMA_VERSION &&
      program.kind === 'SupplierStrategyProgram',
    'COMPUTER_PROGRAM_INVALID',
    'Unsupported strategy grammar.'
  );
  exact(program.window, ['op', 'formulation'], 'Delivery operator');
  exact(
    program.allocation,
    ['op', 'earlyOrder', 'remainderOrder'],
    'Allocation operator'
  );
  exact(program.objective, ['op', 'costModel'], 'Objective operator');
  check(
    program.window.op === 'delivery_window' &&
      FORMULATIONS.includes(program.window.formulation) &&
      ALLOCATION_OPS.includes(program.allocation.op) &&
      ORDER_OPS.includes(program.allocation.earlyOrder) &&
      ORDER_OPS.includes(program.allocation.remainderOrder) &&
      program.objective.op === 'minimize_cost' &&
      COST_MODELS.includes(program.objective.costModel),
    'COMPUTER_PROGRAM_INVALID',
    'A strategy may compose only the shipped delivery, allocation, ordering and cost operators.'
  );
  return freeze(cloneJson(program));
}
export function constructComputerStrategies({
  formulation = 'all_early',
} = {}) {
  check(
    FORMULATIONS.includes(formulation),
    'COMPUTER_FORMULATION_INVALID',
    'Unsupported formulation.'
  );
  const programs = [];
  for (const allocation of ALLOCATION_OPS)
    for (const costModel of COST_MODELS)
      for (const earlyOrder of ORDER_OPS)
        for (const remainderOrder of ORDER_OPS)
          programs.push(
            validateComputerStrategy(
              makeProgram(
                formulation,
                allocation,
                earlyOrder,
                remainderOrder,
                costModel
              )
            )
          );
  return freeze(programs);
}
const planFor = (allocations, costCents) => ({
  schemaVersion: SCHEMA_VERSION,
  kind: 'SupplierAllocationPlan',
  allocations: allocations.filter((allocation) => allocation.units > 0),
  costCents,
});
function executeRaw(mission, program, maxLogicalOperations) {
  const q = mission.suppliers,
    r = mission.requirements,
    mode = program.window.formulation;
  let operations = 0,
    examined = 0;
  const tick = (count = 1) => {
    if (operations + count > maxLogicalOperations)
      throw new SuccessorError(
        'COMPUTER_SEARCH_BUDGET',
        'The program exhausted its declared logical-operation budget.'
      );
    operations += count;
  };
  const price = (allocation) => {
    tick();
    return allocation.reduce((sum, item) => {
      tick();
      const quote = q.find((supplier) => supplier.id === item.supplierId);
      return (
        sum +
        item.units * quote.unitCents +
        (program.objective.costModel === 'landed' ? quote.freightCents : 0)
      );
    }, 0);
  };
  const earliest = mode === 'all_early' ? r.totalUnits : r.earlyUnits;
  const lastDay = mode === 'all_early' ? r.earlyDay : r.finalDay;
  const candidates = [];
  const offer = (allocation) => {
    tick();
    examined++;
    candidates.push(planFor(allocation, price(allocation)));
  };
  try {
    const allowed = q.filter((supplier) => {
      tick();
      return supplier.deliveryDay <= lastDay;
    });
    if (program.allocation.op === 'single_supplier') {
      for (const supplier of allowed)
        offer([{ supplierId: supplier.id, units: r.totalUnits }]);
    } else if (program.allocation.op === 'early_then_remainder') {
      const choose = (quotes, units, order) => {
        let chosen;
        for (const quote of quotes) {
          tick();
          const value =
            quote.unitCents * units +
            (order === 'landed_cost' ? quote.freightCents : 0);
          const previous = chosen
            ? chosen.unitCents * units +
              (order === 'landed_cost' ? chosen.freightCents : 0)
            : Infinity;
          if (
            !chosen ||
            value < previous ||
            (value === previous && compareText(quote.id, chosen.id) < 0)
          )
            chosen = quote;
        }
        return chosen;
      };
      const early = earliest
        ? choose(
            allowed.filter((supplier) => {
              tick();
              return supplier.deliveryDay <= r.earlyDay;
            }),
            earliest,
            program.allocation.earlyOrder
          )
        : null;
      const remaining = r.totalUnits - earliest;
      const later = remaining
        ? choose(allowed, remaining, program.allocation.remainderOrder)
        : null;
      if ((!earliest || early) && (!remaining || later)) {
        const quantities = new Map();
        if (early) quantities.set(early.id, earliest);
        if (later)
          quantities.set(later.id, (quantities.get(later.id) || 0) + remaining);
        offer(
          [...quantities].map(([supplierId, units]) => ({ supplierId, units }))
        );
      }
    } else {
      const visit = (index, remaining, allocation, earlyCount) => {
        tick();
        if (index === allowed.length) {
          if (
            remaining === 0 &&
            earlyCount >= earliest &&
            (mode !== 'all_early' || allocation.length === 1)
          )
            offer(allocation);
          return;
        }
        const supplier = allowed[index];
        for (let units = 0; units <= remaining; units++) {
          tick();
          visit(
            index + 1,
            remaining - units,
            units
              ? [...allocation, { supplierId: supplier.id, units }]
              : allocation,
            earlyCount + (supplier.deliveryDay <= r.earlyDay ? units : 0)
          );
        }
      };
      visit(0, r.totalUnits, [], 0);
    }
    let chosen = null;
    for (const candidate of candidates) {
      tick();
      if (
        !chosen ||
        candidate.costCents < chosen.costCents ||
        (candidate.costCents === chosen.costCents &&
          compareText(
            canonicalize(candidate.allocations),
            canonicalize(chosen.allocations)
          ) < 0)
      )
        chosen = candidate;
    }
    return {
      plan: chosen,
      status: candidates.length ? 'EXECUTED' : 'NO_PLAN',
      logicalOperations: operations,
      allocationsExamined: examined,
    };
  } catch (error) {
    if (error.code !== 'COMPUTER_SEARCH_BUDGET') throw error;
    return {
      plan: null,
      status: 'BUDGET_EXHAUSTED',
      logicalOperations: operations,
      allocationsExamined: examined,
    };
  }
}
export async function executeComputerStrategy(
  mission,
  program,
  { maxLogicalOperations = 50000 } = {}
) {
  const facts = await validateMission(mission),
    strategy = validateComputerStrategy(program);
  integer(
    maxLogicalOperations,
    1,
    LIMITS.logicalOperations,
    'Logical-operation budget'
  );
  const execution = executeRaw(facts, strategy, maxLogicalOperations);
  return freeze({
    ...execution,
    program: strategy,
    programDigest: await digestObject(
      'successor.computer-program.v1',
      strategy
    ),
    check: execution.plan
      ? checkComputerPlan(facts, execution.plan, {
          formulation: strategy.window.formulation,
        })
      : null,
    logicalOperationBudget: maxLogicalOperations,
    costCents: execution.plan
      ? checkComputerPlan(facts, execution.plan, {
          formulation: strategy.window.formulation,
        }).totals.costCents
      : null,
  });
}

/** Independent oracle uses a different complete allocation enumeration from the recursive candidate solver. */
export function auditComputerPlanOptimality(
  mission,
  plan,
  { formulation = 'actual_requirements' } = {}
) {
  missionBody(mission);
  check(
    FORMULATIONS.includes(formulation),
    'COMPUTER_FORMULATION_INVALID',
    'Unsupported formulation.'
  );
  const planCheck = plan
    ? checkComputerPlan(mission, plan, { formulation })
    : null;
  const quotes = [...mission.suppliers, null, null].slice(0, 3),
    r = mission.requirements;
  let count = 0,
    feasibleCount = 0,
    optimum = null;
  for (let first = 0; first <= r.totalUnits; first++) {
    for (let second = 0; second <= r.totalUnits - first; second++) {
      const numbers = [first, second, r.totalUnits - first - second];
      if (numbers.some((number, index) => number > 0 && !quotes[index]))
        continue;
      count++;
      let early = 0,
        cost = 0,
        late = false;
      for (let index = 0; index < 3; index++) {
        if (!numbers[index]) continue;
        const quote = quotes[index];
        cost += numbers[index] * quote.unitCents + quote.freightCents;
        if (quote.deliveryDay <= r.earlyDay) early += numbers[index];
        if (quote.deliveryDay > r.finalDay) late = true;
      }
      if (
        late ||
        early < r.earlyUnits ||
        cost > r.budgetCents ||
        (formulation === 'all_early' &&
          (early !== r.totalUnits ||
            numbers.filter((number) => number > 0).length !== 1))
      )
        continue;
      feasibleCount++;
      if (optimum === null || cost < optimum) optimum = cost;
    }
  }
  return freeze({
    formulation,
    exhaustive: true,
    enumeratedAllocations: count,
    feasibleAllocations: feasibleCount,
    optimumCostCents: optimum,
    candidateFeasible: planCheck?.valid === true,
    candidateOptimal:
      !!planCheck?.valid && planCheck.totals.costCents === optimum,
    independentImplementation: true,
    independentProof: false,
    scope:
      'A separately implemented bounded arithmetic oracle checks every integer allocation. It is not an independent organization, protected evaluator, real delivery trial or market certification.',
  });
}
function conventionalPlan(mission, formulation) {
  const r = mission.requirements;
  const earlyUnits = formulation === 'all_early' ? r.totalUnits : r.earlyUnits;
  const candidates = [];
  let logicalOperations = 0;
  for (const early of mission.suppliers)
    for (const later of mission.suppliers) {
      logicalOperations++;
      const map = new Map();
      if (earlyUnits) map.set(early.id, earlyUnits);
      if (r.totalUnits - earlyUnits)
        map.set(later.id, (map.get(later.id) || 0) + r.totalUnits - earlyUnits);
      let cost = 0;
      for (const [id, units] of map) {
        logicalOperations++;
        const quote = mission.suppliers.find((supplier) => supplier.id === id);
        cost += units * quote.unitCents + quote.freightCents;
      }
      const plan = planFor(
        [...map].map(([supplierId, units]) => ({ supplierId, units })),
        cost
      );
      const checked = checkComputerPlan(mission, plan, { formulation });
      if (checked.valid)
        candidates.push({ plan, check: checked, costCents: cost });
    }
  candidates.sort(
    (a, b) =>
      a.costCents - b.costCents ||
      compareText(
        canonicalize(a.plan.allocations),
        canonicalize(b.plan.allocations)
      )
  );
  return {
    id: 'conventional_two_delivery_groups',
    method:
      'Enumerate every pair of early and final suppliers, count freight once, and independently check every requirement.',
    ...(candidates[0] || { plan: null, check: null, costCents: null }),
    logicalOperations,
    independentProof: false,
  };
}
function approvalFor(value) {
  if (value === undefined || value === null) return null;
  exact(value, ['approved', 'ownerLabel', 'reason'], 'Formulation review');
  check(
    value.approved === true,
    'COMPUTER_APPROVAL_REQUIRED',
    'Changing the comparison formulation requires an explicit owner approval.'
  );
  text(value.ownerLabel, 100, 'Owner label');
  text(value.reason, 1000, 'Owner explanation');
  return {
    ...cloneJson(value),
    scope: 'COMPARE_STAGED_FORMULATION_ONLY',
    identityVerified: false,
    productionAuthority: false,
  };
}
async function historyEvent(history, type, payload) {
  const event = {
    sequence: history.length + 1,
    previousDigest: history.at(-1)?.digest || null,
    type,
    payload,
  };
  event.digest = await digestObject('successor.computer-event.v1', event);
  history.push(event);
}
const attemptRank = (a, b) =>
  a.costCents - b.costCents ||
  a.logicalOperations - b.logicalOperations ||
  compareText(a.programDigest, b.programDigest) ||
  compareText(a.attemptId, b.attemptId);
function revisionFor(attempt) {
  if (attempt.status !== 'EXECUTED' || attempt.check?.valid) return null;
  const program = cloneJson(attempt.program);
  if (
    attempt.check.checks.some(
      (entry) => entry.id === 'early-units' && !entry.passed
    ) &&
    program.allocation.op === 'single_supplier'
  ) {
    program.allocation.op = 'early_then_remainder';
    return {
      program,
      changes: ['allocation.op:single_supplier->early_then_remainder'],
      reason:
        'The cheaper late-only allocation failed the real early-delivery requirement. Split the required early quantity from the remaining quantity, then test again.',
    };
  }
  if (
    attempt.check.checks.some(
      (entry) => entry.id === 'exact-freight-inclusive-cost' && !entry.passed
    ) &&
    program.objective.costModel === 'unit_only'
  ) {
    program.objective.costModel = 'landed';
    return {
      program,
      changes: ['objective.costModel:unit_only->landed'],
      reason:
        'The previous cost omitted freight. Revise the executable cost operator to charge freight once per used supplier, then rerun the allocation.',
    };
  }
  return null;
}
function bump(value, delta, max) {
  return value + delta <= max ? value + delta : Math.max(0, value - delta);
}
async function freshMission(mission, index, seed) {
  const body = cloneJson(missionBody(mission));
  const delta = 1 + ((seed + index * 13) % 3);
  body.suppliers[index % body.suppliers.length].unitCents = bump(
    body.suppliers[index % body.suppliers.length].unitCents,
    delta,
    LIMITS.priceCents
  );
  if (index === 1)
    body.suppliers[0].freightCents = bump(
      body.suppliers[0].freightCents,
      1,
      LIMITS.priceCents
    );
  body.evidenceClass = 'PUBLIC_GENERATED_VARIANT';
  body.title = `Public generated confirmation ${index + 1}`;
  return sealMission(body);
}
export async function runComputerMission(mission, options = {}) {
  object(
    options,
    ['formulationApproval', 'seed', 'maxPrograms', 'maxLogicalOperations'],
    'Strategy research options'
  );
  const facts = await validateMission(mission);
  const approval = approvalFor(options.formulationApproval);
  const seed = integer(options.seed ?? 42, 0, 0xffffffff, 'Confirmation seed');
  const maxPrograms = integer(
    options.maxPrograms ?? 32,
    1,
    LIMITS.programs,
    'Program budget'
  );
  const maxLogicalOperations = integer(
    options.maxLogicalOperations ?? 50000,
    1,
    LIMITS.logicalOperations,
    'Logical-operation budget'
  );
  const formulation = approval ? 'actual_requirements' : 'all_early';
  const history = [];
  await historyEvent(history, 'MISSION_BOUND', {
    missionDigest: facts.digest,
    actualRequirements: facts.requirements,
  });
  await historyEvent(history, 'FORMULATION_REVIEWED', {
    formulation,
    approval,
    actualRequirementsChanged: false,
  });
  const baselineProgram = makeProgram(
    'all_early',
    'single_supplier',
    'landed_cost',
    'landed_cost',
    'landed'
  );
  const baseline = {
    id: 'incumbent_single_supplier_all_early',
    ...(await executeComputerStrategy(facts, baselineProgram, {
      maxLogicalOperations,
    })),
  };
  const credibleAlternative = conventionalPlan(facts, formulation);
  const programs = constructComputerStrategies({ formulation });
  const attempts = [];
  let constructionsCompleted = 0;
  const addAttempt = async (program, lineage) => {
    const execution = await executeComputerStrategy(facts, program, {
      maxLogicalOperations,
    });
    const attempt = {
      attemptId: `attempt-${String(attempts.length + 1).padStart(2, '0')}`,
      ...execution,
      lineage,
    };
    attempt.digest = await digestObject(
      'successor.computer-attempt.v1',
      attempt
    );
    attempts.push(attempt);
    await historyEvent(history, 'PROGRAM_TESTED', {
      attemptId: attempt.attemptId,
      attemptDigest: attempt.digest,
      programDigest: attempt.programDigest,
      status: attempt.status,
      valid: attempt.check?.valid || false,
    });
    return attempt;
  };
  for (
    let index = 0;
    index < programs.length && attempts.length < maxPrograms;
    index++
  ) {
    let attempt = await addAttempt(programs[index], {
      kind: 'GRAMMAR_COMPOSITION',
      constructorIndex: index,
      operators: [
        'delivery_window',
        programs[index].allocation.op,
        programs[index].allocation.earlyOrder,
        programs[index].allocation.remainderOrder,
        programs[index].objective.costModel,
      ],
    });
    constructionsCompleted++;
    // The first failed program is concretely repaired twice; subsequent constructions remain visible.
    if (index === 0)
      for (
        let revision = 0;
        revision < 2 && attempts.length < maxPrograms;
        revision++
      ) {
        const change = revisionFor(attempt);
        if (!change) break;
        await historyEvent(history, 'PROGRAM_REVISION_PROPOSED', {
          parentAttemptId: attempt.attemptId,
          parentDigest: attempt.digest,
          changes: change.changes,
          reason: change.reason,
        });
        attempt = await addAttempt(change.program, {
          kind: 'FAILURE_DRIVEN_REVISION',
          parentAttemptId: attempt.attemptId,
          parentDigest: attempt.digest,
          changes: change.changes,
          reason: change.reason,
        });
      }
  }
  const valid = attempts
    .filter((attempt) => attempt.check?.valid)
    .sort(attemptRank);
  const selected =
    valid[0] ||
    (baseline.check?.valid
      ? {
          ...baseline,
          attemptId: 'incumbent-retained',
          lineage: { kind: 'INCUMBENT_FALLBACK' },
        }
      : null);
  const independentPlanCheck = auditComputerPlanOptimality(
    facts,
    selected?.plan || null,
    { formulation }
  );
  const development = {
    baseline,
    credibleAlternative,
    selected,
    attempts,
    independentPlanCheck,
  };
  const frozenData = {
    missionDigest: facts.digest,
    formulation,
    actualRequirementsDigest: await digestObject(
      'successor.computer-requirements.v1',
      facts.requirements
    ),
    developmentDigest: await digestObject(
      'successor.computer-development.v1',
      development
    ),
    program: selected?.program || null,
    programDigest: selected?.programDigest || null,
    plan: selected?.plan || null,
    planDigest: selected?.plan
      ? await digestObject('successor.computer-plan.v1', selected.plan)
      : null,
  };
  const frozen = {
    ...frozenData,
    digest: await digestObject('successor.computer-freeze.v1', frozenData),
  };
  await historyEvent(history, 'CANDIDATE_FROZEN', {
    frozenDigest: frozen.digest,
    programDigest: frozen.programDigest,
    planDigest: frozen.planDigest,
  });
  const freshCases = [];
  for (let index = 0; index < 2; index++) {
    const fresh = await freshMission(facts, index, seed);
    check(
      fresh.digest !== facts.digest &&
        freshCases.every((entry) => entry.mission.digest !== fresh.digest),
      'COMPUTER_FRESH_CASE_DUPLICATE',
      'Generated confirmation must differ from development and other confirmation cases.'
    );
    const candidate = frozen.program
      ? await executeComputerStrategy(fresh, frozen.program, {
          maxLogicalOperations,
        })
      : null;
    const incumbent = await executeComputerStrategy(fresh, baselineProgram, {
      maxLogicalOperations,
    });
    const alternative = conventionalPlan(fresh, formulation);
    const oracle = auditComputerPlanOptimality(fresh, candidate?.plan || null, {
      formulation,
    });
    const record = {
      caseId: `confirmation-${index + 1}`,
      mission: fresh,
      frozenDigest: frozen.digest,
      candidate,
      incumbent,
      credibleAlternative: alternative,
      independentPlanCheck: oracle,
      protectedHoldout: false,
      independentProof: false,
    };
    record.digest = await digestObject(
      'successor.computer-confirmation.v1',
      record
    );
    freshCases.push(record);
    await historyEvent(history, 'PUBLIC_FRESH_CASE_TESTED', {
      caseId: record.caseId,
      missionDigest: fresh.digest,
      frozenDigest: frozen.digest,
      resultDigest: record.digest,
    });
  }
  const incumbentValid = baseline.check?.valid === true;
  const nomineeValid = selected?.check?.valid === true;
  const saving =
    incumbentValid && nomineeValid
      ? baseline.costCents - selected.costCents
      : null;
  const againstAlternative =
    nomineeValid && credibleAlternative.check?.valid
      ? credibleAlternative.costCents - selected.costCents
      : null;
  const decision = {
    state: incumbentValid
      ? HOLD
      : 'NO_VALID_INCUMBENT_OR_AUTHORIZED_REPLACEMENT',
    retainedPlan: incumbentValid ? baseline.plan : null,
    nomineePlan: nomineeValid ? selected.plan : null,
    nomineeForIndependentTest:
      nomineeValid && selected.lineage.kind !== 'INCUMBENT_FALLBACK',
    quotedCostDifferenceFromIncumbentCents: saving,
    quotedCostDifferenceFromCredibleAlternativeCents: againstAlternative,
    sameTaskSuperiority: false,
    provenExternalAlpha: false,
    independentProof: false,
    productionAuthority: false,
    reason:
      'Public arithmetic and generated cases can nominate a feasible plan. They do not prove real delivery, independent superiority, human-effort savings or permission to purchase. Retain the incumbent pending separate evidence and explicit execution authority.',
  };
  await historyEvent(history, 'LOCAL_COMPARISON_HELD', {
    state: decision.state,
    nomineePlanDigest: frozen.planDigest,
    independentProof: false,
    authorityCreated: 'NONE',
  });
  const report = {
    schemaVersion: SCHEMA_VERSION,
    kind: 'ComputerMissionReport',
    mission: facts,
    formulation,
    researchOptions: { seed, maxPrograms, maxLogicalOperations },
    capabilityLevels: {
      level3: {
        implemented: true,
        scope:
          'Construct, execute and compare typed finite strategy programs; revise a rejected late-only or freight-omitting program from its recorded failure. Not open-ended semantic strategy discovery or a general intelligence claim.',
      },
      level4: {
        implemented: true,
        scope:
          'Expose the unnecessary all-units-early assumption, request owner approval to compare staged delivery, and preserve every immutable real requirement. This changes the feasible formulation and is not same-task algorithmic superiority.',
      },
    },
    reframing: {
      originalAssumption: 'One supplier and every unit by the early deadline.',
      proposedFormulation:
        'Allocate the actually required early quantity and the remaining quantity by the final deadline.',
      actualRequirements: cloneJson(facts.requirements),
      actualRequirementsDigest: frozen.actualRequirementsDigest,
      changesActualRequirements: false,
      approvalRequired: true,
      approval,
      status: approval
        ? 'OWNER_APPROVED_COMPARISON_ONLY'
        : 'OWNER_APPROVAL_REQUIRED',
      hardEarlyRequirement:
        facts.requirements.earlyUnits === facts.requirements.totalUnits,
    },
    development,
    frozen,
    confirmation: {
      generatedAfterFreeze: true,
      publicGeneratedCases: true,
      protectedHoldout: false,
      seed,
      cases: freshCases,
      disclosure:
        'Two deterministic public quote variants are constructed only after the exact program is frozen. They are replayable engineering tests, not unseen representative tasks or independent protected custody.',
    },
    search: {
      grammarPrograms: programs.length,
      grammarProgramsExecuted: constructionsCompleted,
      executedPrograms: attempts.length,
      programBudget: maxPrograms,
      logicalOperationBudgetPerProgram: maxLogicalOperations,
      stoppedAtProgramBudget: constructionsCompleted < programs.length,
      actualBrowserActions: null,
      actualBrowserTimeMs: null,
      providerCost: null,
      humanReviewMinutes: null,
      metricDisclosure:
        'Logical operations count this local program interpreter only. They are not browser actions, elapsed time, model quality, provider cost or human review effort.',
    },
    decision,
    history,
    historyDigest: history.at(-1).digest,
    authorityCreated: 'NONE',
    independentProof: false,
    protectedQualification: false,
    provenanceDisclosure:
      'Source quotes, rights and owner labels are supplied assertions. SHA-256 and replay establish internal consistency, not source authenticity, reviewer identity, computer execution or independent qualification.',
  };
  report.digest = await digestObject('successor.computer-report.v1', report);
  return freeze(report);
}
export async function verifyComputerMissionReport(report) {
  check(
    report && typeof report === 'object' && !Array.isArray(report),
    'COMPUTER_REPORT_INVALID',
    'A computer mission report is required.'
  );
  const approval = report.reframing?.approval;
  const options = {
    ...report.researchOptions,
    ...(approval
      ? {
          formulationApproval: {
            approved: approval.approved,
            ownerLabel: approval.ownerLabel,
            reason: approval.reason,
          },
        }
      : {}),
  };
  const rebuilt = await runComputerMission(report.mission, options);
  check(
    canonicalize(report) === canonicalize(rebuilt),
    'COMPUTER_REPORT_TAMPERED',
    'The report differs from full strategy, constraint, fresh-case and history recomputation. Imported execution or authority claims cannot create proof.'
  );
  return rebuilt;
}
export async function exportComputerMissionReport(report) {
  const verified = await verifyComputerMissionReport(report);
  const serialized = JSON.stringify(verified, null, 2);
  check(
    new TextEncoder().encode(serialized).byteLength <= MAX_EXPORT_BYTES,
    'COMPUTER_REPORT_LIMIT',
    'The report exceeds the four-megabyte export limit.'
  );
  return serialized;
}
export async function restoreComputerMissionReport(serialized) {
  check(
    typeof serialized === 'string' &&
      new TextEncoder().encode(serialized).byteLength <= MAX_EXPORT_BYTES,
    'COMPUTER_REPORT_LIMIT',
    'Import a JSON report of at most four megabytes.'
  );
  let report;
  try {
    report = JSON.parse(serialized);
    canonicalize(report);
  } catch {
    throw new SuccessorError(
      'COMPUTER_REPORT_INVALID',
      'The report contains invalid or unsupported JSON.'
    );
  }
  return verifyComputerMissionReport(report);
}

/** A valid observed allocation remains a fixture arithmetic review, never trusted provider execution. */
export async function reviewObservedAllocation(report, observed) {
  const verified = await verifyComputerMissionReport(report);
  object(
    observed,
    [
      'schemaVersion',
      'kind',
      'missionDigest',
      'reportDigest',
      'frozenProgramDigest',
      'plan',
      'check',
      'formulation',
      'purchaseExecuted',
      'executionKind',
      'actions',
    ],
    'Observed desk result'
  );
  check(
    observed.schemaVersion === SCHEMA_VERSION &&
      observed.kind === 'SupplierDeskResult' &&
      observed.missionDigest === verified.mission.digest &&
      observed.formulation === verified.formulation,
    'COMPUTER_OBSERVATION_BINDING',
    'The observed allocation does not match this exact mission and approved formulation.'
  );
  if (Object.hasOwn(observed, 'reportDigest'))
    check(
      observed.reportDigest === verified.digest,
      'COMPUTER_OBSERVATION_BINDING',
      'Observed report digest differs from the reviewed report.'
    );
  if (Object.hasOwn(observed, 'frozenProgramDigest'))
    check(
      observed.frozenProgramDigest === verified.frozen.programDigest,
      'COMPUTER_OBSERVATION_BINDING',
      'Observed program differs from the frozen method.'
    );
  check(
    observed.purchaseExecuted === false,
    'COMPUTER_EFFECT_FORBIDDEN',
    'This laboratory cannot accept a purchase or external-effect claim.'
  );
  const checked = checkComputerPlan(verified.mission, observed.plan, {
    formulation: verified.formulation,
  });
  object(
    observed.check,
    [
      'valid',
      'feasible',
      'totals',
      'checks',
      'independentProof',
      'formulation',
      'scope',
    ],
    'Observed arithmetic check'
  );
  exact(
    observed.check.totals,
    ['totalUnits', 'earlyUnits', 'costCents'],
    'Observed totals'
  );
  check(
    observed.check.valid === checked.valid &&
      canonicalize(observed.check.totals) === canonicalize(checked.totals),
    'COMPUTER_OBSERVATION_TAMPERED',
    'Observed validity or totals disagree with independent quote and requirement recomputation.'
  );
  if (Object.hasOwn(observed.check, 'independentProof'))
    check(
      observed.check.independentProof === false,
      'COMPUTER_OBSERVATION_TAMPERED',
      'An observed desk result cannot grant independent proof.'
    );
  if (Object.hasOwn(observed.check, 'feasible'))
    check(
      observed.check.feasible === checked.valid,
      'COMPUTER_OBSERVATION_TAMPERED',
      'Observed feasibility disagrees with recomputed constraints.'
    );
  if (Object.hasOwn(observed.check, 'formulation'))
    check(
      observed.check.formulation === verified.formulation,
      'COMPUTER_OBSERVATION_BINDING',
      'Observed check formulation differs from the approved comparison.'
    );
  if (Object.hasOwn(observed, 'executionKind'))
    text(observed.executionKind, 160, 'Reported execution label');
  if (Object.hasOwn(observed, 'actions'))
    check(
      Array.isArray(observed.actions) &&
        observed.actions.length <= 200 &&
        new TextEncoder().encode(canonicalize(observed.actions)).byteLength <=
          128000,
      'COMPUTER_OBSERVATION_LIMIT',
      'Reported actions must fit the bounded observation record.'
    );
  const normalizedPlan = (plan) =>
    plan
      ? {
          ...plan,
          allocations: [...plan.allocations].sort((a, b) =>
            compareText(a.supplierId, b.supplierId)
          ),
        }
      : null;
  const frozenAllocationMatch =
    canonicalize(normalizedPlan(observed.plan)) ===
    canonicalize(normalizedPlan(verified.frozen.plan));
  const optimality = auditComputerPlanOptimality(
    verified.mission,
    observed.plan,
    { formulation: verified.formulation }
  );
  return freeze({
    schemaVersion: SCHEMA_VERSION,
    kind: 'ComputerObservedAllocationReview',
    missionDigest: verified.mission.digest,
    reportDigest: verified.digest,
    observedDigest: await digestObject(
      'successor.computer-observation.v1',
      observed
    ),
    accepted: checked.valid && frozenAllocationMatch,
    frozenAllocationMatch,
    check: checked,
    optimality,
    reportedExecution: {
      executionKind: observed.executionKind || 'UNSPECIFIED',
      provenance: 'SELF_REPORTED_NOT_AUTHENTICATED',
      actionCount: Array.isArray(observed.actions)
        ? observed.actions.length
        : null,
    },
    trustedComputerExecution: false,
    independentProof: false,
    protectedQualification: false,
    settlementApproved: false,
    productionApproved: false,
    authorityCreated: 'NONE',
  });
}

/** Exact Alpha70 ComputerTask wire. The caller supplies the reviewed desk template; this helper does not execute it. */
export async function createAlphaComputerTask(
  report,
  { html, maxTurns = 10, maxActions = 30, maxSeconds = 180 } = {}
) {
  const verified = await verifyComputerMissionReport(report);
  text(html, 200000, 'Reviewed local desk HTML');
  integer(maxTurns, 1, 30, 'Computer turns');
  integer(maxActions, 1, 100, 'Computer actions');
  integer(maxSeconds, 10, 600, 'Computer seconds');
  check(
    verified.frozen.plan && verified.development.selected?.check?.valid,
    'COMPUTER_TASK_NO_VALID_PLAN',
    'A native computer task requires a complete frozen feasible nominee.'
  );
  const htmlDigest = await digestBytes(html);
  const quantities = verified.frozen.plan.allocations
    .map((allocation) => `${allocation.supplierId}: ${allocation.units} units`)
    .join('; ');
  const task = {
    schema_version: 1,
    kind: 'successor-computer',
    goal: `Use keyboard and mouse in the supplied local supplier review desk. Enter this frozen allocation: ${quantities}. Click the evaluate control and inspect the displayed source-grounded result. Leave the result visible as a local draft; do not purchase, log in, send messages, upload, or change any actual requirement. Completion is a claim for separate review. Exact mission ${verified.mission.digest}; report ${verified.digest}; frozen program ${verified.frozen.programDigest}; frozen plan ${verified.frozen.planDigest}; HTML ${htmlDigest}.`,
    html,
    allowed_urls: [],
    input_rights: verified.mission.inputRights.classification,
    license: verified.mission.inputRights.license,
    max_turns: maxTurns,
    max_actions: maxActions,
    max_seconds: maxSeconds,
    review_minutes: 10,
  };
  check(
    task.goal.length <= 4000,
    'COMPUTER_TASK_LIMIT',
    'Native task goal exceeds Alpha limits.'
  );
  return freeze(task);
}

/** Real native compiler request, with zero AGIALPHA reserved and no identity or computer permission granted. */
export async function compileComputerMissionJobs(
  report,
  { now = new Date().toISOString(), expiresAt } = {}
) {
  const verified = await verifyComputerMissionReport(report);
  const instant = Date.parse(now);
  check(
    Number.isFinite(instant),
    'COMPUTER_CLOCK_INVALID',
    'Provide a valid compiler clock.'
  );
  const expiry = expiresAt || new Date(instant + 7 * 86400000).toISOString();
  const missionId = `computer-mission-${verified.digest.slice(7, 23)}`;
  const sourceId = `supplier-facts-${verified.mission.digest.slice(7)}`;
  const prohibited = [
    'purchase',
    'send-message',
    'upload',
    'sign-transaction',
    'release-payment',
    'access-private-data',
    'change-actual-requirements',
    'expand-authority',
  ];
  const definitions = [
    [
      'quote-rights',
      'constitution',
      'Verify quoted prices, delivery promises, public nonpersonal rights, and the immutable actual quantities, deadlines and USD-cent budget. User attestation is not source verification.',
    ],
    [
      'strategy-comparison',
      'formation',
      `Reproduce the exact typed program search, rejected attempts, concrete revisions, frozen candidate and public fresh-case results from report ${verified.digest}. Count landed cost, logical operations and limitations separately from actual Computer Use performance.`,
    ],
    [
      'computer-draft',
      'formation',
      `Request a separately authorized bounded keyboard/mouse/screenshot session to enter only frozen plan ${
        verified.frozen.planDigest || 'NOT_AVAILABLE'
      } in the local review desk. Produce observed results and screenshots; perform no purchase or external action.`,
    ],
    [
      'independent-review',
      'verification',
      'Independently check exact observed allocation, authoritative quotes, every real deadline, freight, complete costs, human burden and the strongest credible alternative. Preserve the incumbent unless separate protected evidence and explicit owner authority justify a bounded replacement.',
    ],
  ];
  const mission = {
    schemaVersion: SCHEMA_VERSION,
    kind: 'MissionConstitution',
    missionId,
    institutionId: 'owner-to-be-assigned',
    version: '1',
    title: verified.mission.title,
    principal: 'accountable-owner-to-be-assigned',
    beneficiary: 'Supplier delivery mission owner',
    objective: `Prepare a reviewable delivery proposal satisfying the exact facts ${verified.mission.digest}; no purchase, token payment or production authority.`,
    incumbent: {
      id: 'single-supplier-all-early',
      version: '1',
      description:
        'Current stricter single-supplier/all-early workflow; retained pending separate proof and authority.',
    },
    alternatives: [
      {
        id: 'conventional-two-delivery-groups',
        version: '1',
        description:
          'Compare all early/final supplier pairs under the same immutable actual requirements, with freight once per used supplier.',
      },
    ],
    rights: [
      {
        sourceId,
        license: verified.mission.inputRights.license,
        dataClass:
          verified.mission.inputRights.classification === 'synthetic'
            ? 'synthetic'
            : 'public-licensed-nonpersonal',
        permittedUses: ['mission-evaluation'],
        expiresAt: expiry,
      },
    ],
    hardGates: [
      {
        id: 'actual-requirements',
        description:
          'No change to actual early/final quantities, deadlines, budget or supplied quotes.',
        maxViolations: 0,
      },
      {
        id: 'no-external-effect',
        description:
          'Local planning and evidence requests do not grant purchase, settlement, account or operational authority.',
        maxViolations: 0,
      },
    ],
    criticalFunctions: definitions.map(([id]) => id),
    roles: {
      producer: 'producer-to-be-assigned',
      verifier: 'verifier-to-be-assigned',
      acceptor: 'accountable-owner-to-be-assigned',
      admitter: 'authority-owner-to-be-assigned',
    },
    budget: {
      unit: 'AGIALPHA',
      limitBaseUnits: '0',
      maxDurationMs: 3600000,
      maxRetries: 0,
      maxJobs: 4,
    },
    expiresAt: expiry,
    authorityCeiling: {
      level: 'A0',
      permittedActions: ['read-public', 'analyze', 'draft-local', 'recommend'],
      prohibitedActions: prohibited,
      externalEffects: false,
    },
    allowedTools: [
      'bounded-strategy-interpreter',
      'local-reviewdesk',
      'exact-allocation-checker',
    ],
    allowedActions: ['read-public', 'analyze', 'draft-local', 'recommend'],
    rollback: {
      target: 'unchanged-incumbent',
      available: true,
      reason:
        'Discard the proposal and retain the incumbent. These unfunded requests have no external effects.',
    },
    proofProtocol: {
      id: 'supplier-computer-independent-request',
      version: '1',
      mode: 'INDEPENDENT_REQUEST',
      formationOwner: 'producer-to-be-assigned',
      custodian: 'verifier-to-be-assigned',
      requiredIndependence: 'I3',
      minimumMargin: 0,
      criticalErrorCeiling: 0,
      scope:
        'External independent review is requested, not performed. Public arithmetic, generated cases, provider completion and user labels do not establish protected proof.',
    },
  };
  const jobs = definitions.map(([id, family, objective]) => ({
    schemaVersion: SCHEMA_VERSION,
    kind: 'SealedWorkOrder',
    jobId: `${missionId}:${id}`,
    missionId,
    version: '1',
    family,
    objective,
    principal: mission.principal,
    actor: mission.roles.producer,
    authorizedInputs: [sourceId],
    evidenceObligation: [
      'exact-mission-facts',
      'all-program-attempts',
      'frozen-program',
      'actual-browser-evidence',
      'complete-cost',
      'limitations',
    ],
    permittedTools: mission.allowedTools,
    permittedActions: mission.allowedActions,
    prohibitedActions: prohibited,
    budget: {
      unit: 'AGIALPHA',
      limitBaseUnits: '0',
      maxDurationMs: 3600000,
      maxRetries: 0,
    },
    expiresAt: expiry,
    outputSchema: {
      type: 'object',
      required: ['findings', 'sourceDigest', 'costs', 'limitations'],
    },
    verifier: {
      identity: mission.roles.verifier,
      method:
        'Separate independent examination remains unfulfilled; exact local arithmetic alone is insufficient.',
      independence: 'I0',
    },
    acceptance: {
      owner: mission.roles.acceptor,
      predicate:
        'An attributable owner verifies every applicable real constraint and the separate review evidence; no provider claim or synthetic metric authorizes a purchase.',
      evidenceSources: [sourceId],
    },
    rollback: mission.rollback,
    chronicle: {
      eligible: false,
      rights: 'Requires separate verified rights and knowledge admission.',
      scope: mission.objective,
      expiresAt: expiry,
    },
    covers: [id],
    state: 'DRAFT',
  }));
  const edges = definitions.slice(1).map(([id], index) => ({
    from: `${missionId}:${definitions[index][0]}`,
    to: `${missionId}:${id}`,
    kind: 'control',
  }));
  const compiled = await compileJobs(mission, { jobs, edges, now });
  return freeze({
    ...compiled,
    computerMission: {
      mission: verified.mission,
      reportDigest: verified.digest,
      historyDigest: verified.historyDigest,
      frozenProgramDigest: verified.frozen.programDigest,
      frozenPlanDigest: verified.frozen.planDigest,
      requiredCompanion: 'The exact replay-validated computer mission report.',
    },
    fundingStatus: 'UNFUNDED',
    identityStatus: 'PLACEHOLDERS_REQUIRE_OWNER_ASSIGNMENT',
    computerRuntimeStatus: 'SEPARATE_EXACT_TASK_ADMISSION_REQUIRED',
    independentProof: false,
  });
}

export const COMPUTER_MISSION_LIMITS = LIMITS;
