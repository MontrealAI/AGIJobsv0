"""Monte Carlo helpers for validator/agent load simulations.

The module is exercised both from the command line and the CI load-simulation
pipeline.  Historically :func:`parameter_search` printed the sweep results but
did not expose them for programmatic consumption.  The CI job needs to persist
the sweep table as an artefact, so we surface a helper that returns the matrix
of explored parameters while keeping the existing behaviour intact.
"""

import random
from typing import List, Tuple


def run_simulation(
    burn_pct: float,
    fee_pct: float,
    agent_efficiencies: List[float],
    validator_efficiencies: List[float],
    reward: float = 100.0,
    stake_pct: float = 0.5,
    iterations: int = 1000,
) -> float:
    """Run a Monte Carlo simulation for given parameters.

    Returns average token dissipation per job.
    """
    dissipation = 0.0
    for _ in range(iterations):
        agent_e = random.choice(agent_efficiencies)
        validator_e = random.choice(validator_efficiencies)
        success_agent = random.random() < agent_e
        success_validator = random.random() < validator_e

        if success_agent and success_validator:
            # successful job, only fee contributes to dissipation
            dissipation += fee_pct * reward
        else:
            # failed job; burn part of the stake
            stake = stake_pct * reward
            dissipation += burn_pct * stake
    return dissipation / iterations


def sweep_parameters(iterations: int = 1000) -> List[Tuple[float, float, float]]:
    """Evaluate the Monte Carlo simulation across burn/fee combinations.

    The sweep intentionally seeds ``random`` to keep CI runs deterministic while
    still exploring a representative portion of the search space.  Each entry in
    the returned list is a ``(burn_pct, fee_pct, dissipation)`` tuple.
    """

    agent_eff = [0.5, 0.6, 0.7, 0.8, 0.9]
    validator_eff = [0.5, 0.6, 0.7, 0.8, 0.9]
    random.seed(1337)
    results = []
    for burn in [i / 100 for i in range(0, 21, 5)]:  # 0.00 to 0.20 step 0.05
        for fee in [i / 100 for i in range(0, 11, 2)]:  # 0.00 to 0.10 step 0.02
            avg = run_simulation(burn, fee, agent_eff, validator_eff, iterations=iterations)
            results.append((burn, fee, avg))
    return results


def parameter_search(iterations: int = 1000) -> Tuple[float, float, float]:
    """Return the lowest-dissipation point from the parameter sweep."""

    results = sweep_parameters(iterations=iterations)
    best = min(results, key=lambda entry: entry[2], default=(0.0, 0.0, float("inf")))
    print("burn_pct, fee_pct, dissipation")
    for burn, fee, avg in results:
        print(f"{burn:.2f}, {fee:.2f}, {avg:.4f}")
    print("Best parameters:")
    print(f"burn_pct={best[0]:.2f}, fee_pct={best[1]:.2f}, dissipation={best[2]:.4f}")
    return best


if __name__ == "__main__":
    parameter_search()
