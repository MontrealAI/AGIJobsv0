from __future__ import annotations

import math

from meta_agentic_demo.evolutionary import EvolutionaryProgramSynthesizer


def test_evolutionary_loop_improves_score() -> None:
    synthesizer = EvolutionaryProgramSynthesizer(
        population_size=6,
        elite_count=2,
        mutation_rate=0.3,
        crossover_rate=0.5,
        random_seed=123,
    )
    target_program = (0.9, 0.4, math.pi / 3)

    def evaluator(program: tuple[float, float, float]) -> float:
        a, b, c = program
        distance = abs(a - target_program[0]) + abs(b - target_program[1]) + abs(c - target_program[2])
        return 1.0 / (1.0 + distance)

    population = synthesizer.initialise_population()
    baseline = max(evaluator(program) for program in population)
    best_program, history = synthesizer.evolve(generations=4, evaluator=evaluator)
    assert history[-1].best_score > baseline
    assert evaluator(best_program) == history[-1].best_score
    assert history[0].best_score_delta is None
    assert all(record.score_variance >= 0 for record in history)
    assert any(record.best_score_delta and record.best_score_delta > 0 for record in history[1:])
