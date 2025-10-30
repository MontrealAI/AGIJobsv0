from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Iterable, List, Sequence

from .diff import ProposedDiff


@dataclass(slots=True)
class PromptPacket:
    prompt: str
    metadata: dict


class DiffProposal:
    def __init__(self, diff: ProposedDiff, temperature: float, metadata: dict | None = None) -> None:
        self.diff = diff
        self.temperature = temperature
        self.metadata = metadata or {}


class LLMClientProtocol:
    def generate(self, packet: PromptPacket, temperature: float) -> str:  # pragma: no cover - interface
        raise NotImplementedError


class HeuristicPerturbationAgent:
    """Deterministic stand-in for an LLM-driven diff generator.

    The agent perturbs heuristic weights and produces SEARCH/REPLACE blocks.
    This keeps the demo hermetic while mimicking AlphaEvolve behaviour.
    """

    def __init__(self, client: LLMClientProtocol, fast_model: str, strong_model: str, strong_invoke_ratio: float) -> None:
        self.client = client
        self.fast_model = fast_model
        self.strong_model = strong_model
        self.strong_invoke_ratio = strong_invoke_ratio
        self._rng = random.Random()

    def seed(self, seed: int) -> None:
        self._rng.seed(seed)

    def _choose_model(self) -> str:
        if self._rng.random() < self.strong_invoke_ratio:
            return self.strong_model
        return self.fast_model

    def propose(self, packets: Sequence[PromptPacket], temperature: float) -> List[DiffProposal]:
        proposals: List[DiffProposal] = []
        for packet in packets:
            model = self._choose_model()
            raw = self.client.generate(packet, temperature)
            diff = ProposedDiff.parse(raw, source_model=model)
            proposals.append(DiffProposal(diff=diff, temperature=temperature, metadata={"model": model}))
        return proposals


class ScriptedLLMClient(LLMClientProtocol):
    """A scripted generator that mutates heuristics using interpretable moves."""

    def __init__(self) -> None:
        self._rng = random.Random()

    def seed(self, seed: int) -> None:
        self._rng.seed(seed)

    def generate(self, packet: PromptPacket, temperature: float) -> str:
        search_template = packet.metadata.get("search")
        if not search_template:
            raise ValueError("Prompt packet missing 'search' metadata")
        replace_template = packet.metadata.get("replace_template")
        if not replace_template:
            raise ValueError("Prompt packet missing 'replace_template' metadata")
        # Inject a small perturbation using Gaussian noise scaled by temperature
        baseline = packet.metadata.get("baseline_weight", 0.2)
        delta = self._rng.gauss(mu=0.0, sigma=temperature * 0.15)
        new_weight = max(0.0, baseline + delta)
        replace = replace_template.format(weight=f"{new_weight:.4f}")
        return f"<<<<<< SEARCH\n{search_template}\n======\n{replace}\n>>>>>>> REPLACE"


__all__ = [
    "PromptPacket",
    "DiffProposal",
    "LLMClientProtocol",
    "HeuristicPerturbationAgent",
    "ScriptedLLMClient",
]
