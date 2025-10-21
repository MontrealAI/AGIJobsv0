"""High-level orchestration logic for the Meta-Agentic Program Synthesis demo."""

from __future__ import annotations

import math
import random
from dataclasses import dataclass
from typing import Dict, Iterable, List, Tuple

from .config import DemoConfig, DemoScenario
from .entities import DemoRunArtifacts, EvolutionRecord, Job, JobStatus, RewardBreakdown
from .evolutionary import EvolutionaryProgramSynthesizer, Program
from .ledger import (
    RewardEngine,
    StakeManager,
    ValidationModule,
    aggregate_performance,
)


@dataclass
class SyntheticDataset:
    """Simple dataset used to evaluate candidate programs."""

    baseline: List[float]
    trend: List[float]
    cyclical: List[float]
    target: List[float]

    def iter_rows(self) -> Iterable[Tuple[float, float, float, float]]:
        return zip(self.baseline, self.trend, self.cyclical, self.target)


def generate_dataset(length: int = 64, noise: float = 0.05) -> SyntheticDataset:
    rng = random.Random(1337)
    baseline = [rng.uniform(0.5, 1.5) for _ in range(length)]
    trend = [0.3 * i / length for i in range(length)]
    cyclical = [math.sin(i / 6.0) for i in range(length)]
    target = []
    for base, slope, cycle in zip(baseline, trend, cyclical):
        signal = 1.8 * base + 0.75 * slope + math.sin(cycle * 1.4)
        signal += rng.uniform(-noise, noise)
        target.append(signal)
    return SyntheticDataset(baseline, trend, cyclical, target)


class SovereignArchitect:
    """Coordinates the evolutionary process and simulated on-chain lifecycle."""

    def __init__(
        self,
        config: DemoConfig,
        dataset: SyntheticDataset | None = None,
        random_seed: int | None = None,
    ) -> None:
        self.config = config
        self.dataset = dataset or generate_dataset()
        self.reward_engine = RewardEngine(config.reward_policy)
        self.stake_manager = StakeManager(config.stake_policy)
        self.validation_module = ValidationModule()
        self.random = random.Random(random_seed)
        zero_predictions = [0.0 for _ in self.dataset.target]
        self.baseline_error = self._mean_squared_error(zero_predictions, self.dataset.target)

    def run(self, scenario: DemoScenario) -> DemoRunArtifacts:
        synthesizer = EvolutionaryProgramSynthesizer(
            population_size=self.config.evolution_policy.population_size,
            elite_count=self.config.evolution_policy.elite_count,
            mutation_rate=self.config.evolution_policy.mutation_rate,
            crossover_rate=self.config.evolution_policy.crossover_rate,
            random_seed=42,
        )
        telemetry: List[EvolutionRecord] = []
        best_program, history = synthesizer.evolve(
            generations=self.config.evolution_policy.generations,
            evaluator=self._score_program,
            telemetry_hook=telemetry.append,
        )
        jobs, rewards = self._execute_on_chain(best_program, telemetry)
        performances = aggregate_performance(rewards, self.stake_manager)
        final_score = self._score_program(best_program)
        return DemoRunArtifacts(
            scenario=scenario.title,
            jobs=jobs,
            performances=performances,
            rewards=rewards,
            evolution=history,
            final_program=synthesizer.render_program(best_program),
            final_score=final_score,
        )

    # --- Internals ---------------------------------------------------------

    def _score_program(self, program: Program) -> float:
        a, b, c = program
        predictions: List[float] = []
        for base, slope, cycle, _ in self.dataset.iter_rows():
            value = (base * a) + (slope * b) + math.sin(cycle * c)
            predictions.append(value)
        mse = self._mean_squared_error(predictions, self.dataset.target)
        normalised = 1.0 - min(mse / max(self.baseline_error, 1e-9), 1.0)
        reward = max(normalised, 0.0) ** 0.5
        return reward

    def _mean_squared_error(self, predictions: Iterable[float], actuals: Iterable[float]) -> float:
        total = 0.0
        count = 0
        for prediction, actual in zip(predictions, actuals):
            diff = prediction - actual
            total += diff * diff
            count += 1
        return total / max(count, 1)

    def _execute_on_chain(
        self, best_program: Program, telemetry: List[EvolutionRecord]
    ) -> Tuple[List[Job], List[RewardBreakdown]]:
        jobs: List[Job] = []
        rewards: List[RewardBreakdown] = []
        for generation, record in enumerate(telemetry, start=1):
            job = Job(
                job_id=generation,
                title=f"Generation {generation} validation",
                description=(
                    "Meta-agent validates improved program and publishes reward distribution"
                ),
                reward=self.config.reward_policy.total_reward,
                stake_required=self.config.stake_policy.minimum_stake,
            )
            jobs.append(job)
            solver_address = f"node-{generation % 3}"
            result_payload = {
                "score": record.best_score,
                "diversity": generation + self.random.uniform(0.1, 0.5),
            }
            digest = job.commit_result(result_payload)
            self.validation_module.commit_result(job, solver_address, digest)
            for validator_index in range(1, 4):
                validator = f"validator-{validator_index}"
                self.validation_module.submit_vote(job, validator, digest, approve=True)
            if self.validation_module.finalise(job):
                solver_energy = {solver_address: record.best_score * 1000}
                validator_energy = {
                    f"validator-{idx}": (record.average_score + idx * 0.01) * 100
                    for idx in range(1, 4)
                }
                reward = self.reward_engine.allocate(
                    job=job,
                    solver_energy=solver_energy,
                    validator_energy=validator_energy,
                )
                rewards.append(reward)
            else:
                job.status = JobStatus.FAILED
        return jobs, rewards

__all__ = ["SovereignArchitect", "generate_dataset", "SyntheticDataset"]
