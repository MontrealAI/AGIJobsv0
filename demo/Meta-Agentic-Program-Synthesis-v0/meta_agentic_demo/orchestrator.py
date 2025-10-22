"""High-level orchestration logic for the Meta-Agentic Program Synthesis demo."""

from __future__ import annotations

import math
import random
from dataclasses import dataclass
from typing import Dict, Iterable, List, Sequence, Tuple

from .admin import OwnerConsole
from .assurance import IndependentAuditor
from .config import DemoConfig, DemoScenario
from .entities import (
    DemoRunArtifacts,
    EvolutionRecord,
    Job,
    JobStatus,
    OpportunitySynopsis,
    OwnerAction,
    RewardBreakdown,
    RewardSummary,
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
        self._dataset_override = dataset
        self.dataset = dataset or generate_dataset()
        self.reward_engine = RewardEngine(self.config.reward_policy)
        self.stake_manager = StakeManager(self.config.stake_policy)
        self.validation_module = ValidationModule()
        self.timelock = timelock or GovernanceTimelock()
        self.random = random.Random(random_seed)
        self._stress_multiplier = 1.0
        self._recompute_baselines()

    def run(self, scenario: DemoScenario) -> DemoRunArtifacts:
        # Apply any timelocked actions that have matured before execution starts.
        self.timelock.execute_due(self.owner_console)
        self.owner_console.require_active()
        self._prepare_dataset(scenario)
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
        verification = self._cross_verify_program(best_program, final_score, telemetry)
        improvement_over_first = (
            telemetry[-1].best_score - telemetry[0].best_score if telemetry else 0.0
        )
        first_success_generation = next(
            (record.generation for record in telemetry if record.best_score >= scenario.success_threshold),
            None,
        )
        owner_actions = list(self.owner_console.events)
        timelock_actions = list(self.timelock.pending())
        opportunities = self._derive_opportunities(
            scenario=scenario,
            telemetry=telemetry,
            rewards=rewards,
            verification=verification,
            reward_summary=reward_summary,
            final_score=final_score,
            improvement=improvement_over_first,
            owner_actions=owner_actions,
            timelock_actions=timelock_actions,
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
            owner_actions=owner_actions,
            timelock_actions=timelock_actions,
            opportunities=opportunities,
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

    def _mean_absolute_error(self, predictions: Iterable[float], actuals: Iterable[float]) -> float:
        total = 0.0
        count = 0
        for prediction, actual in zip(predictions, actuals):
            total += abs(prediction - actual)
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

    def _recompute_baselines(self) -> None:
        zero_predictions = [0.0 for _ in self.dataset.target]
        self.baseline_error = self._mean_squared_error(zero_predictions, self.dataset.target)
        self.baseline_absolute_error = self._mean_absolute_error(
            zero_predictions, self.dataset.target
        )

    def _prepare_dataset(self, scenario: DemoScenario) -> None:
        profile = scenario.dataset_profile
        if self._dataset_override is not None:
            dataset = self._dataset_override
        elif profile is not None:
            dataset = generate_dataset(
                length=max(profile.length, 1),
                noise=max(profile.noise, 0.0),
                seed=profile.seed,
            )
        else:
            dataset = generate_dataset()
        self.dataset = dataset
        self._stress_multiplier = max(scenario.stress_multiplier, 0.0)
        self._recompute_baselines()

    def _cross_verify_program(
        self, program: Program, primary_score: float, telemetry: Sequence[EvolutionRecord]
    ) -> VerificationDigest:
        policy = self.config.verification_policy
        base_predictions = self._predict(program, self.dataset)
        residuals = [actual - prediction for prediction, actual in zip(base_predictions, self.dataset.target)]
        residual_mean = sum(residuals) / max(len(residuals), 1)
        variance = sum((value - residual_mean) ** 2 for value in residuals) / max(
            len(residuals), 1
        )
        residual_std = math.sqrt(max(variance, 0.0))
        mae = self._mean_absolute_error(base_predictions, self.dataset.target)
        baseline_mae = max(self.baseline_absolute_error, 1e-9)
        mae_score = max(1.0 - min(mae / baseline_mae, 1.0), 0.0)
        pass_mae = mae_score >= policy.mae_threshold
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
        stress_scores = self._stress_test_program(program)
        pass_stress = all(
            score >= policy.stress_threshold for score in stress_scores.values()
        ) if stress_scores else True
        entropy_score = self._entropy_score(base_predictions)
        pass_entropy = entropy_score >= policy.entropy_floor
        auditor = IndependentAuditor(
            baseline_error=self.baseline_error,
            precision_tolerance=policy.precision_replay_tolerance,
            variance_ratio_ceiling=policy.variance_ratio_ceiling,
            spectral_energy_ceiling=policy.spectral_energy_ceiling,
        )
        audit = auditor.audit(
            predictions=base_predictions,
            targets=self.dataset.target,
            primary_score=primary_score,
        )
        pass_residual_balance = (
            abs(residual_mean) <= policy.residual_mean_tolerance
            and residual_std >= policy.residual_std_minimum
        )
        pass_divergence = divergence <= policy.divergence_tolerance
        bootstrap_interval = self._bootstrap_interval(program)
        pass_confidence = bootstrap_interval[0] >= max(
            policy.holdout_threshold - policy.monotonic_tolerance, 0.0
        )
        monotonic_pass, violations = self._assess_monotonicity(
            [record.best_score for record in telemetry], policy.monotonic_tolerance
        )
        stress_anchor = (
            min(stress_scores.values()) if stress_scores else primary_score
        )
        confidence_centre = sum(bootstrap_interval) / 2.0
        resilience_components = (
            0.4 * primary_score,
            0.3 * stress_anchor,
            0.2 * entropy_score,
            0.1 * confidence_centre,
        )
        resilience_index = max(0.0, min(sum(resilience_components), 1.0))

        return VerificationDigest(
            primary_score=primary_score,
            holdout_scores=holdout_scores,
            residual_mean=residual_mean,
            residual_std=residual_std,
            divergence=divergence,
            pass_holdout=pass_holdout,
            pass_residual_balance=pass_residual_balance,
            pass_divergence=pass_divergence,
            mae_score=mae_score,
            pass_mae=pass_mae,
            bootstrap_interval=bootstrap_interval,
            pass_confidence=pass_confidence,
            monotonic_pass=monotonic_pass,
            monotonic_violations=violations,
            stress_scores=stress_scores,
            pass_stress=pass_stress,
            stress_threshold=policy.stress_threshold,
            entropy_score=entropy_score,
            pass_entropy=pass_entropy,
            entropy_floor=policy.entropy_floor,
            precision_replay_score=audit.precision_score,
            pass_precision_replay=audit.pass_precision,
            variance_ratio=audit.variance_ratio,
            pass_variance_ratio=audit.pass_variance,
            spectral_ratio=audit.spectral_ratio,
            pass_spectral_ratio=audit.pass_spectral,
            resilience_index=resilience_index,
        )

    def _stress_test_program(self, program: Program) -> Dict[str, float]:
        length = len(self.dataset.target)
        specs = {
            "regime_shift": {
                "seed": 101_010,
                "noise": 0.065,
                "baseline_scale": 1.12,
                "trend_shift": 0.28,
            },
            "volatility_spike": {
                "seed": 202_020,
                "noise": 0.095,
                "spike": (8, 14, 1.2),
                "noise_scale": 0.22,
            },
            "signal_dropout": {
                "seed": 303_030,
                "noise": 0.05,
                "dropout_window": (20, 28),
                "dropout_scale": 0.22,
                "damp_cycle": 0.45,
            },
        }
        scores: Dict[str, float] = {}
        for name, spec in specs.items():
            scaled_spec = self._scale_stress_spec(spec, self._stress_multiplier)
            dataset = generate_dataset(
                length=length, noise=scaled_spec["noise"], seed=scaled_spec["seed"]
            )
            self._apply_stress_spec(dataset, scaled_spec)
            predictions = self._predict(program, dataset)
            mse = self._mean_squared_error(predictions, dataset.target)
            normalised = 1.0 - min(mse / max(self.baseline_error, 1e-9), 1.0)
            scores[name] = max(normalised, 0.0) ** 0.5
        return scores

    def _apply_stress_spec(self, dataset: SyntheticDataset, spec: Dict[str, object]) -> None:
        length = len(dataset.target)
        if "baseline_scale" in spec:
            scale = float(spec["baseline_scale"])
            dataset.baseline = [value * scale for value in dataset.baseline]
            dataset.target = [
                target * (1 + (scale - 1) * 0.6) for target in dataset.target
            ]
        if "trend_shift" in spec:
            shift = float(spec["trend_shift"])
            dataset.trend = [value + shift for value in dataset.trend]
            dataset.target = [value + shift for value in dataset.target]
        if "damp_cycle" in spec:
            factor = float(spec["damp_cycle"])
            dataset.cyclical = [value * factor for value in dataset.cyclical]
        if "spike" in spec:
            start, end, magnitude = spec["spike"]
            start_index = max(int(start), 0)
            end_index = min(int(end), length)
            for index in range(start_index, end_index):
                dataset.target[index] += float(magnitude)
        if "dropout_window" in spec:
            start, end = spec["dropout_window"]
            scale = float(spec.get("dropout_scale", 0.1))
            start_index = max(int(start), 0)
            end_index = min(int(end), length)
            for index in range(start_index, end_index):
                dataset.baseline[index] *= scale
                dataset.trend[index] *= scale
                dataset.target[index] *= scale
        if "noise_scale" in spec:
            seed = int(spec.get("noise_seed", spec["seed"] + 1))
            rng = random.Random(seed)
            amplitude = float(spec["noise_scale"])
            for index in range(length):
                dataset.target[index] += rng.uniform(-amplitude, amplitude)

    def _scale_stress_spec(self, spec: Dict[str, object], multiplier: float) -> Dict[str, object]:
        if math.isclose(multiplier, 1.0):
            return dict(spec)
        scaled = dict(spec)
        if "baseline_scale" in scaled:
            scale = float(scaled["baseline_scale"])
            scaled["baseline_scale"] = 1.0 + (scale - 1.0) * multiplier
        if "trend_shift" in scaled:
            scaled["trend_shift"] = float(scaled["trend_shift"]) * multiplier
        if "noise" in scaled:
            scaled["noise"] = max(0.0, float(scaled["noise"]) * multiplier)
        if "noise_scale" in scaled:
            scaled["noise_scale"] = float(scaled["noise_scale"]) * multiplier
        if "dropout_scale" in scaled:
            scaled["dropout_scale"] = float(scaled["dropout_scale"]) * multiplier
        if "spike" in scaled:
            start, end, magnitude = scaled["spike"]
            scaled["spike"] = (start, end, float(magnitude) * multiplier)
        return scaled

    @property
    def stress_multiplier(self) -> float:
        return self._stress_multiplier

    def _bootstrap_interval(self, program: Program) -> Tuple[float, float]:
        policy = self.config.verification_policy
        rows = list(zip(self.dataset.baseline, self.dataset.trend, self.dataset.cyclical, self.dataset.target))
        if not rows:
            return (0.0, 0.0)
        rng = random.Random(9876)
        scores: List[float] = []
        indices = list(range(len(rows)))
        a, b, c = program
        for _ in range(max(policy.bootstrap_iterations, 1)):
            sample_predictions: List[float] = []
            sample_targets: List[float] = []
            for index in (rng.choice(indices) for _ in indices):
                base, slope, cycle, target = rows[index]
                value = (base * a) + (slope * b) + math.sin(cycle * c)
                sample_predictions.append(value)
                sample_targets.append(target)
            mse = self._mean_squared_error(sample_predictions, sample_targets)
            normalised = 1.0 - min(mse / max(self.baseline_error, 1e-9), 1.0)
            scores.append(max(normalised, 0.0) ** 0.5)
        scores.sort()
        if not scores:
            return (0.0, 0.0)
        alpha = max(min(1.0 - policy.confidence_level, 0.999), 0.0)
        lower_index = int(alpha / 2 * (len(scores) - 1))
        upper_index = int((1 - alpha / 2) * (len(scores) - 1))
        return (scores[lower_index], scores[upper_index])

    def _entropy_score(self, predictions: Sequence[float], bins: int = 16) -> float:
        """Compute a normalised Shannon entropy proxy for solver diversity."""

        values = list(predictions)
        if not values:
            return 0.0
        minimum = min(values)
        maximum = max(values)
        if math.isclose(maximum, minimum):
            return 0.0
        width = maximum - minimum or 1.0
        histogram = [0 for _ in range(max(bins, 2))]
        for value in values:
            index = int(((value - minimum) / width) * len(histogram))
            index = max(0, min(len(histogram) - 1, index))
            histogram[index] += 1
        total = sum(histogram)
        if total == 0:
            return 0.0
        probabilities = [count / total for count in histogram if count]
        if not probabilities:
            return 0.0
        entropy = -sum(prob * math.log(prob, 2) for prob in probabilities)
        max_entropy = math.log(len(histogram), 2)
        if max_entropy <= 0:
            return 0.0
        return max(0.0, min(entropy / max_entropy, 1.0))

    def _assess_monotonicity(
        self, scores: Sequence[float], tolerance: float
    ) -> Tuple[bool, int]:
        if not scores:
            return True, 0
        violations = 0
        best_so_far = scores[0]
        for score in scores[1:]:
            if score + tolerance < best_so_far:
                violations += 1
            else:
                best_so_far = max(best_so_far, score)
        return violations == 0, violations

    def _derive_opportunities(
        self,
        *,
        scenario: DemoScenario,
        telemetry: Sequence[EvolutionRecord],
        rewards: Sequence[RewardBreakdown],
        verification: VerificationDigest,
        reward_summary: RewardSummary,
        final_score: float,
        improvement: float,
        owner_actions: Sequence[OwnerAction],
        timelock_actions: Sequence["TimelockedAction"],
    ) -> List[OpportunitySynopsis]:
        def clamp(value: float) -> float:
            return max(0.0, min(value, 1.0))

        total_solver_energy = sum(
            sum(breakdown.solver_energy.values()) for breakdown in rewards
        )
        total_validator_energy = sum(
            sum(breakdown.validator_energy.values()) for breakdown in rewards
        )
        total_energy = total_solver_energy + total_validator_energy
        solver_energy_ratio = (
            total_solver_energy / total_energy if total_energy else 0.0
        )
        validator_energy_ratio = (
            total_validator_energy / total_energy if total_energy else 0.0
        )
        architect_energy_ratio = clamp(
            1.0 - solver_energy_ratio - validator_energy_ratio
        )
        total_reward = max(reward_summary.total_reward, 1e-9)
        solver_reward_total = sum(reward_summary.solver_totals.values())
        validator_reward_total = sum(reward_summary.validator_totals.values())
        architect_allocation = reward_summary.architect_total / total_reward
        solver_reward_ratio = solver_reward_total / total_reward
        validator_reward_ratio = validator_reward_total / total_reward
        improvement_score = clamp(improvement)
        bootstrap_floor, _ = verification.bootstrap_interval
        opportunity_cards: List[OpportunitySynopsis] = []

        solver_confidence = clamp(
            0.4 * (1.0 if verification.pass_holdout else 0.0)
            + 0.3 * (1.0 if verification.pass_mae else 0.0)
            + 0.3 * (1.0 if verification.pass_confidence else 0.0)
        )
        solver_impact = clamp(0.6 * final_score + 0.4 * improvement_score)
        opportunity_cards.append(
            OpportunitySynopsis(
                name="Alpha Streamliner",
                impact_score=solver_impact,
                confidence=solver_confidence,
                narrative=(
                    f"Evolved execution kernels within {scenario.title} now compress solver "
                    "latency and unlock deeper alpha harvesting."
                ),
                energy_ratio=solver_energy_ratio,
                capital_allocation=solver_reward_ratio,
            )
        )

        entropy_confidence = clamp(
            0.5 * verification.entropy_score
            + 0.5 * (1.0 if verification.pass_entropy else 0.0)
        )
        entropy_impact = clamp(
            0.55 * verification.entropy_score
            + 0.45 * (1.0 if verification.pass_stress else 0.0)
        )
        opportunity_cards.append(
            OpportunitySynopsis(
                name="Entropy Shield Array",
                impact_score=entropy_impact,
                confidence=entropy_confidence,
                narrative=(
                    "Solver diversity remains thermodynamically balanced; adaptive hedges "
                    "preserve creativity while the owner controls the envelope."
                ),
                energy_ratio=clamp(verification.entropy_score),
                capital_allocation=clamp(
                    (verification.entropy_score + architect_allocation) / 2.0
                ),
            )
        )

        divergence_component = clamp(1.0 - min(verification.divergence, 1.0))
        monotonic_component = clamp(
            1.0
            - (
                verification.monotonic_violations
                / max(len(telemetry) - 1, 1) if telemetry else 0.0
            )
        )
        validator_impact = clamp(
            0.55 * divergence_component + 0.45 * monotonic_component
        )
        validator_confidence = clamp(
            0.5 * (1.0 if verification.pass_divergence else 0.0)
            + 0.5 * (1.0 if verification.pass_residual_balance else 0.0)
        )
        opportunity_cards.append(
            OpportunitySynopsis(
                name="Validator Sentience Network",
                impact_score=validator_impact,
                confidence=validator_confidence,
                narrative=(
                    "Commit–reveal validators achieved thermodynamic harmony, holding consensus "
                    "tight even under synthetic noise injections."
                ),
                energy_ratio=validator_energy_ratio,
                capital_allocation=validator_reward_ratio,
            )
        )

        queued_timelock = sum(1 for action in timelock_actions if action.status == "QUEUED")
        governance_factor = clamp(1.0 - min(queued_timelock / 5.0, 0.6))
        owner_intervention_factor = clamp(1.0 - min(len(owner_actions) / 6.0, 0.5))
        reward_uplift_ratio = clamp(
            len(rewards)
            * self.config.reward_policy.total_reward
            / (len(telemetry) * self.config.reward_policy.total_reward or 1)
            if telemetry
            else 0.0
        )
        treasury_impact = clamp(
            0.45 * architect_allocation + 0.35 * final_score + 0.2 * reward_uplift_ratio
        )
        treasury_confidence = clamp(
            0.5 * (1.0 if verification.overall_pass else bootstrap_floor)
            + 0.3 * governance_factor
            + 0.2 * owner_intervention_factor
        )
        opportunity_cards.append(
            OpportunitySynopsis(
                name="Treasury Resonance Engine",
                impact_score=treasury_impact,
                confidence=treasury_confidence,
                narrative=(
                    "Owner-governed treasury controls remain responsive; capital can be "
                    "redeployed instantly into the next sovereign campaign."
                ),
                energy_ratio=architect_energy_ratio,
                capital_allocation=architect_allocation,
            )
        )

        return opportunity_cards

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
