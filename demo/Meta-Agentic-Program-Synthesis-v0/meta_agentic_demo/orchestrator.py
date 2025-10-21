"""High-level orchestration logic for the Meta-Agentic Program Synthesis demo."""

from __future__ import annotations

import math
import random
from dataclasses import dataclass
from typing import Dict, Iterable, List, Tuple

from .admin import OwnerConsole
from .config import DemoConfig, DemoScenario
from .entities import (
    DemoRunArtifacts,
    EvolutionRecord,
    Job,
    JobStatus,
    RewardBreakdown,
    VerificationDigest,
)
from .evolutionary import EvolutionaryProgramSynthesizer, Program
from .governance import GovernanceTimelock
from .ledger import (
    RewardEngine,
    StakeManager,
    ValidationModule,
    aggregate_performance,
    summarise_rewards,
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


def generate_dataset(
    length: int = 64, noise: float = 0.05, *, seed: int = 1337
) -> SyntheticDataset:
    rng = random.Random(seed)
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
        owner_console: OwnerConsole | None = None,
        timelock: GovernanceTimelock | None = None,
    ) -> None:
        self.owner_console = owner_console or OwnerConsole(config)
        self.config = self.owner_console.config
        self.dataset = dataset or generate_dataset()
        self.reward_engine = RewardEngine(self.config.reward_policy)
        self.stake_manager = StakeManager(self.config.stake_policy)
        self.validation_module = ValidationModule()
        self.timelock = timelock or GovernanceTimelock()
        self.random = random.Random(random_seed)
        zero_predictions = [0.0 for _ in self.dataset.target]
        self.baseline_error = self._mean_squared_error(zero_predictions, self.dataset.target)

    def run(self, scenario: DemoScenario) -> DemoRunArtifacts:
        # Apply any timelocked actions that have matured before execution starts.
        self.timelock.execute_due(self.owner_console)
        self.owner_console.require_active()
        self._refresh_runtime_components()
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
        reward_summary = summarise_rewards(rewards)
        performances = aggregate_performance(rewards, self.stake_manager)
        final_score = self._score_program(best_program)
        verification = self._cross_verify_program(best_program, final_score)
        improvement_over_first = (
            telemetry[-1].best_score - telemetry[0].best_score if telemetry else 0.0
        )
        first_success_generation = next(
            (record.generation for record in telemetry if record.best_score >= scenario.success_threshold),
            None,
        )
        return DemoRunArtifacts(
            scenario=scenario.title,
            jobs=jobs,
            performances=performances,
            rewards=rewards,
            reward_summary=reward_summary,
            evolution=history,
            final_program=synthesizer.render_program(best_program),
            final_score=final_score,
            verification=verification,
            owner_actions=list(self.owner_console.events),
            timelock_actions=list(self.timelock.pending()),
            improvement_over_first=improvement_over_first,
            first_success_generation=first_success_generation,
        )

    # --- Internals ---------------------------------------------------------

    def _score_program(self, program: Program) -> float:
        predictions = self._predict(program, self.dataset)
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

    def _predict(self, program: Program, dataset: SyntheticDataset) -> List[float]:
        a, b, c = program
        predictions: List[float] = []
        for base, slope, cycle, _ in dataset.iter_rows():
            value = (base * a) + (slope * b) + math.sin(cycle * c)
            predictions.append(value)
        return predictions

    def _refresh_runtime_components(self) -> None:
        self.config = self.owner_console.config
        self.reward_engine = RewardEngine(self.config.reward_policy)
        self.stake_manager = StakeManager(self.config.stake_policy)
        self.validation_module = ValidationModule()

    def _cross_verify_program(
        self, program: Program, primary_score: float
    ) -> VerificationDigest:
        policy = self.config.verification_policy
        base_predictions = self._predict(program, self.dataset)
        residuals = [actual - prediction for prediction, actual in zip(base_predictions, self.dataset.target)]
        residual_mean = sum(residuals) / max(len(residuals), 1)
        variance = sum((value - residual_mean) ** 2 for value in residuals) / max(
            len(residuals), 1
        )
        residual_std = math.sqrt(max(variance, 0.0))
        holdout_specs = {
            "holdout_low_noise": {"noise": 0.04, "seed": 8_675_309},
            "holdout_high_noise": {"noise": 0.08, "seed": 424_242},
        }
        holdout_scores: Dict[str, float] = {}
        for name, spec in holdout_specs.items():
            dataset = generate_dataset(
                length=len(self.dataset.target), noise=spec["noise"], seed=spec["seed"]
            )
            predictions = self._predict(program, dataset)
            mse = self._mean_squared_error(predictions, dataset.target)
            normalised = 1.0 - min(mse / max(self.baseline_error, 1e-9), 1.0)
            holdout_scores[name] = max(normalised, 0.0) ** 0.5
        divergence = (
            max(holdout_scores.values()) - min(holdout_scores.values())
            if holdout_scores
            else 0.0
        )
        pass_holdout = all(
            score >= policy.holdout_threshold for score in holdout_scores.values()
        )
        pass_residual_balance = (
            abs(residual_mean) <= policy.residual_mean_tolerance
            and residual_std >= policy.residual_std_minimum
        )
        pass_divergence = divergence <= policy.divergence_tolerance
        return VerificationDigest(
            primary_score=primary_score,
            holdout_scores=holdout_scores,
            residual_mean=residual_mean,
            residual_std=residual_std,
            divergence=divergence,
            pass_holdout=pass_holdout,
            pass_residual_balance=pass_residual_balance,
            pass_divergence=pass_divergence,
        )

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
