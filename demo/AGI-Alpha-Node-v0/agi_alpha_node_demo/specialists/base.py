"""Specialist base class."""

from __future__ import annotations

import abc
from typing import Dict

from ..planner import PlannerOutcome


class Specialist(abc.ABC):
    name: str

    @abc.abstractmethod
    def solve(self, payload: Dict[str, str], plan: PlannerOutcome) -> Dict[str, float]:
        raise NotImplementedError
