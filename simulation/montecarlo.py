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


def parameter_search() -> Tuple[float, float, float]:
    agent_eff = [0.5, 0.6, 0.7, 0.8, 0.9]
    validator_eff = [0.5, 0.6, 0.7, 0.8, 0.9]
    best = (0.0, 0.0, float("inf"))
    results = []
    for burn in [i / 100 for i in range(0, 21, 5)]:  # 0.00 to 0.20 step 0.05
        for fee in [i / 100 for i in range(0, 11, 2)]:  # 0.00 to 0.10 step 0.02
            avg = run_simulation(burn, fee, agent_eff, validator_eff)
            results.append((burn, fee, avg))
            if avg < best[2]:
                best = (burn, fee, avg)
    print("burn_pct, fee_pct, dissipation")
    for burn, fee, avg in results:
        print(f"{burn:.2f}, {fee:.2f}, {avg:.4f}")
    print("Best parameters:")
    print(f"burn_pct={best[0]:.2f}, fee_pct={best[1]:.2f}, dissipation={best[2]:.4f}")
    return best


if __name__ == "__main__":
    parameter_search()
