import type { MissionConfig, MissionParameters, OwnerControlCoverage, TaskDefinition } from "./types";

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

const REQUIRED_OWNER_CATEGORIES = [
  "Emergency Pause",
  "Thermostat",
  "Upgrade",
  "Treasury",
  "Compliance",
] as const;

type RequiredCategory = (typeof REQUIRED_OWNER_CATEGORIES)[number];

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Mission validation failed: ${message}`);
  }
}

function assertPositive(value: number, label: string): void {
  assertCondition(Number.isFinite(value) && value > 0, `${label} must be a positive number.`);
}

function validateParameters(parameters: MissionParameters): void {
  assertPositive(parameters.seed, "Seed");
  assertPositive(parameters.generations, "Generations");
  assertPositive(parameters.populationSize, "Population size");
  assertPositive(parameters.eliteCount, "Elite count");
  assertCondition(
    parameters.eliteCount <= parameters.populationSize,
    "Elite count cannot exceed population size.",
  );
  assertCondition(parameters.crossoverRate >= 0 && parameters.crossoverRate <= 1, "Crossover rate must be within [0,1].");
  assertCondition(parameters.mutationRate >= 0 && parameters.mutationRate <= 1, "Mutation rate must be within [0,1].");
  assertPositive(parameters.maxOperations, "Max operations");
  assertPositive(parameters.energyBudget, "Energy budget");
  assertCondition(
    parameters.successThreshold > 0 && parameters.successThreshold <= 1,
    "Success threshold must be within (0,1].",
  );
  assertCondition(
    parameters.noveltyTarget >= 0 && parameters.noveltyTarget <= 1,
    "Novelty target must be within [0,1].",
  );
}

function normaliseCategory(value: string): string {
  return value.trim().toLowerCase();
}

function computeOwnerCoverage(mission: MissionConfig): OwnerControlCoverage {
  const declared = mission.ownerControls.capabilities ?? [];
  const satisfied = new Set<RequiredCategory>();

  for (const capability of declared) {
    const normalised = normaliseCategory(capability.category);
    for (const required of REQUIRED_OWNER_CATEGORIES) {
      if (normaliseCategory(required) === normalised) {
        satisfied.add(required);
      }
    }
  }

  const missing = REQUIRED_OWNER_CATEGORIES.filter((category) => !satisfied.has(category));

  let readiness: OwnerControlCoverage["readiness"];
  if (missing.length === 0) {
    readiness = "ready";
  } else if (missing.length <= 2) {
    readiness = "attention";
  } else {
    readiness = "blocked";
  }

  return {
    requiredCategories: [...REQUIRED_OWNER_CATEGORIES],
    satisfiedCategories: [...satisfied],
    missingCategories: missing,
    readiness,
  };
}

function validateTasks(tasks: TaskDefinition[], parameters: MissionParameters): void {
  assertCondition(tasks.length > 0, "At least one task must be defined.");
  const seenIds = new Set<string>();
  for (const task of tasks) {
    assertCondition(task.id.trim().length > 0, "Task IDs must not be empty.");
    assertCondition(!seenIds.has(task.id), `Duplicate task id detected: ${task.id}`);
    seenIds.add(task.id);
    assertCondition(task.mode === "vector", `Unsupported task mode for ${task.id}; only 'vector' is supported.`);
    assertCondition(task.examples.length > 0, `Task ${task.id} must include at least one example.`);
    for (const example of task.examples) {
      assertCondition(Array.isArray(example.input), `Task ${task.id} example inputs must be arrays.`);
      assertCondition(Array.isArray(example.expected), `Task ${task.id} example expected values must be arrays.`);
      assertCondition(example.input.length > 0, `Task ${task.id} example ${example.label} must not be empty.`);
    }
    assertPositive(task.owner.stake, `Task ${task.id} stake`);
    assertPositive(task.owner.reward, `Task ${task.id} reward`);
    assertCondition(
      typeof task.owner.thermodynamicTarget === "number",
      `Task ${task.id} thermodynamic target must be numeric.`,
    );
    if (task.constraints?.maxOperations !== undefined) {
      assertCondition(
        task.constraints.maxOperations > 0 && task.constraints.maxOperations <= parameters.maxOperations,
        `Task ${task.id} maxOperations must be > 0 and ≤ mission maxOperations.`,
      );
    }
  }
}

export function validateMission(mission: MissionConfig): OwnerControlCoverage {
  assertCondition(
    typeof mission.meta.title === "string" && mission.meta.title.trim().length > 0,
    "Mission title must be provided.",
  );
  assertCondition(
    typeof mission.meta.description === "string" && mission.meta.description.trim().length > 0,
    "Mission description must be provided.",
  );
  assertCondition(ADDRESS_REGEX.test(mission.meta.ownerAddress), "Owner address must be a valid Ethereum address.");
  assertCondition(ADDRESS_REGEX.test(mission.meta.treasuryAddress), "Treasury address must be a valid Ethereum address.");
  assertPositive(mission.meta.timelockSeconds, "Timelock seconds");

  validateParameters(mission.parameters);
  validateTasks(mission.tasks, mission.parameters);

  assertCondition(
    mission.ownerControls.capabilities.length > 0,
    "Owner capabilities must include at least one entry.",
  );

  const coverage = computeOwnerCoverage(mission);
  assertCondition(
    coverage.missingCategories.length === 0,
    `Owner capabilities missing required categories: ${coverage.missingCategories.join(", ")}.`,
  );

  assertCondition(
    typeof mission.ci.workflow === "string" && mission.ci.workflow.trim().length > 0,
    "CI workflow name must be provided.",
  );
  assertCondition(Array.isArray(mission.ci.requiredJobs), "CI requiredJobs must be an array.");
  assertPositive(mission.ci.minCoverage, "CI minimum coverage");
  assertCondition(
    typeof mission.ci.concurrency === "string" && mission.ci.concurrency.trim().length > 0,
    "CI concurrency group must be provided.",
  );

  return coverage;
}

export function ensureMissionValidity(mission: MissionConfig): OwnerControlCoverage {
  return validateMission(mission);
}
