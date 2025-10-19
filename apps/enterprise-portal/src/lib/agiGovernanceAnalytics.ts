export const BOLTZMANN_CONSTANT = 1.380649e-23;

export function computeValidatorEntropy(weights: Array<{ entropyWeight: number }>): number {
  const totalWeight = weights.reduce(
    (acc, validator) => acc + Math.max(validator.entropyWeight, 0),
    0
  );
  if (totalWeight <= 0) {
    return 0;
  }
  const probabilities = weights.map((validator) => validator.entropyWeight / totalWeight);
  return -probabilities.reduce((sum, probability) => {
    if (probability <= 0) {
      return sum;
    }
    return sum + probability * Math.log(probability);
  }, 0);
}

export type EnergyComputationInput = {
  temperatureKelvin: number;
  lambda: number;
  landauerMultiplier: number;
  discountFactor: number;
  totalRewards: number;
  treasuryInflows: number;
  stakeLocked: number;
  validatorEntropy: number;
  validatorCooperation: number;
  dissipationVector: number[];
};

export type GovernanceEnergyMetrics = {
  temperatureKelvin: number;
  discountFactor: number;
  lambda: number;
  energyBudget: number;
  gibbsFreeEnergy: number;
  hamiltonian: number;
  landauerBound: number;
  dissipation: number;
  validatorEntropy: number;
  validatorCooperation: number;
  antifragilityScore: number;
};

export function computeEnergyMetrics(input: EnergyComputationInput): GovernanceEnergyMetrics {
  const {
    temperatureKelvin,
    lambda,
    landauerMultiplier,
    discountFactor,
    totalRewards,
    treasuryInflows,
    stakeLocked,
    validatorEntropy,
    validatorCooperation,
    dissipationVector,
  } = input;

  const energyBudget = totalRewards + treasuryInflows;
  const dissipationRatio = dissipationVector.length
    ? dissipationVector.reduce((sum, value) => sum + Math.max(value, 0), 0) /
      dissipationVector.length
    : 0;
  const dissipation = energyBudget * dissipationRatio;
  const entropyBudget = validatorEntropy + dissipationRatio;
  const temperatureFactor = temperatureKelvin / 300;
  const gibbsFreeEnergy = energyBudget - temperatureFactor * entropyBudget;
  const hamiltonian = gibbsFreeEnergy - lambda * dissipation + stakeLocked * 0.001;
  const landauerBound =
    BOLTZMANN_CONSTANT * temperatureKelvin * Math.log(2) * landauerMultiplier * 1e21;
  const antifragilityScore =
    gibbsFreeEnergy <= 0
      ? 0
      : Math.min(1, (gibbsFreeEnergy / energyBudget) * validatorCooperation * discountFactor + dissipationRatio * 0.1);

  return {
    temperatureKelvin,
    discountFactor,
    lambda,
    energyBudget,
    gibbsFreeEnergy,
    hamiltonian,
    landauerBound,
    dissipation,
    validatorEntropy,
    validatorCooperation,
    antifragilityScore,
  };
}

export function toPrecision(value: number, digits = 4): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function toPercentage(value: number, digits = 2): string {
  return `${toPrecision(value * 100, digits)}%`;
}

export type ScenarioValidator = { entropyWeight: number };
export type ScenarioNation = { reward: number; dissipation: number };
export type ScenarioOwner = { minStake: number };

export type GovernanceScenario = {
  temperatureKelvin: number;
  discountFactor: number;
  lambda: number;
  landauerMultiplier: number;
  validators: ScenarioValidator[];
  nations: ScenarioNation[];
  owner: ScenarioOwner;
};
