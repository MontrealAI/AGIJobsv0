"""Specialist agent registry."""

from __future__ import annotations

from importlib import import_module
from typing import Type

from .base import SpecialistAgent, SpecialistContext


def load_specialist(class_path: str) -> Type[SpecialistAgent]:
    module_name, class_name = class_path.split(":", 1)
    module = import_module(module_name)
    cls = getattr(module, class_name)
    if not issubclass(cls, SpecialistAgent):
        raise TypeError(f"{class_path} is not a SpecialistAgent")
    return cls


__all__ = ["load_specialist", "SpecialistAgent", "SpecialistContext"]
