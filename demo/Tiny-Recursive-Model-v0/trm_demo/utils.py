"""Utility helpers for the Tiny Recursive Model demo."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, List, Tuple

import numpy as np

BASE_FEATURE_NAMES: Tuple[str, ...] = (
    "impact",
    "culture_fit",
    "velocity",
    "complexity",
    "learning_rate",
    "value_density",
)


@dataclass
class CandidateProfile:
    """Business friendly representation of a job candidate opportunity."""

    features: Dict[str, float]
    identifier: str

    def as_feature_vector(self) -> np.ndarray:
        base = np.array([self.features[name] for name in BASE_FEATURE_NAMES], dtype=np.float64)
        cross = np.array(
            [
                self.features["impact"] * self.features["culture_fit"],
                self.features["velocity"] * self.features["learning_rate"],
                self.features["complexity"] * self.features["value_density"],
            ],
            dtype=np.float64,
        )
        return np.concatenate((base, cross))


def feature_vector_from_dict(data: Dict[str, float]) -> np.ndarray:
    """Convert a plain feature mapping into the numeric vector expected by the TRM."""

    profile = CandidateProfile(features=data, identifier="synthetic")
    return profile.as_feature_vector()


def generate_candidate(identifier: str, rng: np.random.Generator) -> CandidateProfile:
    """Generate a random candidate within the [-1, 1] feature cube."""

    features = {
        name: float(rng.uniform(-1.0, 1.0)) for name in BASE_FEATURE_NAMES
    }
    return CandidateProfile(features=features, identifier=identifier)


def batch_feature_matrix(candidates: Iterable[CandidateProfile]) -> np.ndarray:
    """Stack a batch of candidate vectors."""

    vectors: List[np.ndarray] = [candidate.as_feature_vector() for candidate in candidates]
    if not vectors:
        return np.empty((0, len(BASE_FEATURE_NAMES) + 3))
    return np.stack(vectors)

