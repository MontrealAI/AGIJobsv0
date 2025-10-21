"""Evolutionary program synthesis loop for the demo."""

from __future__ import annotations

import math
import random
from dataclasses import dataclass
from statistics import mean, pvariance
from typing import Callable, Iterable, List, Sequence, Tuple

from .entities import EvolutionRecord


Program = Tuple[float, float, float]


@dataclass
class ProgramEvaluation:
    """Container linking a candidate program with its measured score."""

    program: Program
    score: float


class EvolutionaryProgramSynthesizer:
    """Simple evolutionary strategy that converges on useful agent programs."""

    def __init__(
        self,
        population_size: int,
        elite_count: int,
        mutation_rate: float,
        crossover_rate: float,
        random_seed: int | None = None,
    ) -> None:
        if population_size < 2:
            raise ValueError("population_size must be at least two")
        if elite_count <= 0 or elite_count >= population_size:
            raise ValueError("elite_count must be between 1 and population_size - 1")
        if not 0 <= mutation_rate <= 1:
            raise ValueError("mutation_rate must be within [0, 1]")
        if not 0 <= crossover_rate <= 1:
            raise ValueError("crossover_rate must be within [0, 1]")
        self.population_size = population_size
        self.elite_count = elite_count
        self.mutation_rate = mutation_rate
        self.crossover_rate = crossover_rate
        self._rng = random.Random(random_seed)

    def initialise_population(self) -> List[Program]:
        """Seed the first generation with diverse strategies."""

        population: List[Program] = []
        for _ in range(self.population_size):
            population.append(self._random_program())
        return population

    def evolve(
        self,
        generations: int,
        evaluator: Callable[[Program], float],
        telemetry_hook: Callable[[EvolutionRecord], None] | None = None,
    ) -> Tuple[Program, List[EvolutionRecord]]:
        """Run the optimisation loop and return the best program."""

        population = self.initialise_population()
        history: List[EvolutionRecord] = []
        previous_best: float | None = None

        for generation in range(1, generations + 1):
            evaluated = [ProgramEvaluation(program, evaluator(program)) for program in population]
            evaluated.sort(key=lambda entry: entry.score, reverse=True)
            elites = [entry.program for entry in evaluated[: self.elite_count]]
            scores = [entry.score for entry in evaluated]
            best_score = scores[0]
            avg_score = mean(scores)
            variance = pvariance(scores)
            delta = None if previous_best is None else best_score - previous_best
            record = EvolutionRecord(
                generation=generation,
                best_score=best_score,
                average_score=avg_score,
                score_variance=variance,
                best_score_delta=delta,
                winning_program=self.render_program(evaluated[0].program),
                notes=self._generation_notes(evaluated),
            )
            history.append(record)
            if telemetry_hook:
                telemetry_hook(record)
            previous_best = best_score

            next_population = elites.copy()
            while len(next_population) < self.population_size:
                parent_a, parent_b = self._select_parents(evaluated)
                child = self._crossover(parent_a, parent_b)
                child = self._mutate(child)
                next_population.append(child)
            population = next_population
        best_program = max(population, key=evaluator)
        return best_program, history

    # --- Internal helpers -------------------------------------------------

    def _random_program(self) -> Program:
        return (
            self._rng.uniform(0.0, 1.0),
            self._rng.uniform(-1.0, 1.0),
            self._rng.uniform(0.0, math.pi),
        )

    def _select_parents(self, evaluated: Sequence[ProgramEvaluation]) -> Tuple[Program, Program]:
        weights = [max(entry.score, 0.0001) for entry in evaluated]
        parent_a = self._rng.choices(evaluated, weights=weights, k=1)[0].program
        parent_b = self._rng.choices(evaluated, weights=weights, k=1)[0].program
        return parent_a, parent_b

    def _crossover(self, parent_a: Program, parent_b: Program) -> Program:
        if self._rng.random() > self.crossover_rate:
            return parent_a
        alpha = self._rng.random()
        return tuple(
            alpha * a + (1 - alpha) * b for a, b in zip(parent_a, parent_b)
        )  # type: ignore[return-value]

    def _mutate(self, program: Program) -> Program:
        mutated = list(program)
        for index in range(len(mutated)):
            if self._rng.random() < self.mutation_rate:
                perturbation = self._rng.uniform(-0.15, 0.15)
                mutated[index] += perturbation
        return tuple(mutated)  # type: ignore[return-value]

    def render_program(self, program: Program) -> str:
        a, b, c = program
        return (
            "λ signal: (base * {a:.3f}) + (trend * {b:.3f}) + sin(cycle * {c:.3f})"
        ).format(a=a, b=b, c=c)

    def _generation_notes(self, evaluated: Iterable[ProgramEvaluation]) -> str:
        scores = [entry.score for entry in evaluated]
        diversity = len({self.render_program(entry.program) for entry in evaluated})
        return (
            f"Explored {len(scores)} variants | diversity={diversity} | "
            f"score_range=({min(scores):.2f}, {max(scores):.2f})"
        )
