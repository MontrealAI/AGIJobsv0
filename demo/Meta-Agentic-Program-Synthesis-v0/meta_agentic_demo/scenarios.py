"""Scenario override utilities for the Meta-Agentic Program Synthesis demo."""

from __future__ import annotations

from typing import Iterable, Mapping, MutableMapping, Sequence

from .config import DatasetProfile, DemoScenario


class ScenarioValidationError(ValueError):
    """Raised when scenario override payloads are invalid."""


def _iter_definition_payloads(definitions: object) -> Iterable[Mapping[str, object]]:
    if definitions is None:
        return ()
    if isinstance(definitions, Mapping):
        if "identifier" in definitions:
            return (definitions,)  # type: ignore[return-value]
        # Treat mapping as identifier -> payload pairs.
        payloads: list[Mapping[str, object]] = []
        for identifier, payload in definitions.items():
            if not isinstance(payload, Mapping):
                raise ScenarioValidationError(
                    "scenario definitions must be mappings"
                )
            merged: MutableMapping[str, object] = dict(payload)
            merged.setdefault("identifier", identifier)
            payloads.append(merged)
        return tuple(payloads)
    if isinstance(definitions, (list, tuple)):
        payloads: list[Mapping[str, object]] = []
        for entry in definitions:
            if not isinstance(entry, Mapping):
                raise ScenarioValidationError(
                    "scenario definitions must be mappings"
                )
            payloads.append(entry)
        return tuple(payloads)
    raise ScenarioValidationError(
        "scenario definitions must be provided as a mapping or list of mappings"
    )


def _coerce_str(value: object, *, field: str, allow_empty: bool = False) -> str:
    if value is None:
        raise ScenarioValidationError(f"missing {field}")
    text = str(value).strip()
    if not text and not allow_empty:
        raise ScenarioValidationError(f"{field} cannot be empty")
    return text


def _coerce_float(value: object, *, field: str) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError) as error:
        raise ScenarioValidationError(f"{field} must be numeric") from error
    return number


def _build_dataset_profile(
    payload: Mapping[str, object] | None,
    *,
    base: DatasetProfile | None,
) -> DatasetProfile | None:
    if payload is None:
        return base
    if not isinstance(payload, Mapping):
        raise ScenarioValidationError("dataset_profile must be a mapping")
    length_value = payload.get("length", base.length if base else None)
    if length_value is None:
        raise ScenarioValidationError("dataset_profile.length is required")
    try:
        length = int(length_value)
    except (TypeError, ValueError) as error:
        raise ScenarioValidationError("dataset_profile.length must be an integer") from error
    if length <= 0:
        raise ScenarioValidationError("dataset_profile.length must be positive")
    noise_value = payload.get("noise", base.noise if base else 0.0)
    noise = _coerce_float(noise_value, field="dataset_profile.noise")
    if noise < 0:
        raise ScenarioValidationError("dataset_profile.noise must be non-negative")
    seed_value = payload.get("seed", base.seed if base else 1)
    try:
        seed = int(seed_value)
    except (TypeError, ValueError) as error:
        raise ScenarioValidationError("dataset_profile.seed must be an integer") from error
    return DatasetProfile(length=length, noise=noise, seed=seed)


def _build_scenario(
    payload: Mapping[str, object],
    *,
    base: DemoScenario | None,
) -> DemoScenario:
    identifier = payload.get("identifier")
    if identifier is None and base is None:
        raise ScenarioValidationError("scenario identifier is required")
    identifier_text = (
        _coerce_str(identifier, field="identifier")
        if identifier is not None
        else base.identifier  # type: ignore[assignment]
    )
    base_title = base.title if base else identifier_text
    base_description = base.description if base else ""
    base_target_metric = base.target_metric if base else ""
    base_threshold = base.success_threshold if base else None
    base_dataset = base.dataset_profile if base else None
    base_stress = base.stress_multiplier if base else 1.0

    title = _coerce_str(payload.get("title", base_title), field="title")
    description = _coerce_str(
        payload.get("description", base_description),
        field="description",
        allow_empty=True,
    )
    target_metric = _coerce_str(
        payload.get("target_metric", base_target_metric),
        field="target_metric",
    )
    threshold_value = payload.get("success_threshold", base_threshold)
    if threshold_value is None:
        raise ScenarioValidationError("success_threshold is required")
    success_threshold = _coerce_float(threshold_value, field="success_threshold")
    if not 0 <= success_threshold <= 1:
        raise ScenarioValidationError("success_threshold must be between 0 and 1")
    dataset_profile = _build_dataset_profile(
        payload.get("dataset_profile"), base=base_dataset
    )
    stress_multiplier = _coerce_float(
        payload.get("stress_multiplier", base_stress), field="stress_multiplier"
    )
    if stress_multiplier < 0:
        raise ScenarioValidationError("stress_multiplier must be non-negative")
    return DemoScenario(
        identifier=identifier_text,
        title=title,
        description=description,
        target_metric=target_metric,
        success_threshold=success_threshold,
        dataset_profile=dataset_profile,
        stress_multiplier=stress_multiplier,
    )


def resolve_scenarios(
    base: Sequence[DemoScenario],
    definitions: object,
    *,
    mode: str = "merge",
) -> list[DemoScenario]:
    """Resolve scenario overrides against a base list."""

    payloads = list(_iter_definition_payloads(definitions))
    if not payloads:
        return list(base)
    mode_normalised = mode.lower()
    if mode_normalised not in {"merge", "replace"}:
        raise ScenarioValidationError("mode must be either 'merge' or 'replace'")

    existing = {scenario.identifier: scenario for scenario in base}
    order: list[str] = [scenario.identifier for scenario in base]

    if mode_normalised == "replace":
        result_map: dict[str, DemoScenario] = {}
        order = []
    else:
        result_map = dict(existing)

    seen: set[str] = set()
    for payload in payloads:
        identifier_value = payload.get("identifier")
        base_scenario = None
        if identifier_value is not None:
            identifier_text = str(identifier_value).strip()
            base_scenario = existing.get(identifier_text)
        scenario = _build_scenario(payload, base=base_scenario)
        if scenario.identifier in seen:
            raise ScenarioValidationError(
                f"duplicate scenario identifier '{scenario.identifier}' in overrides"
            )
        seen.add(scenario.identifier)
        result_map[scenario.identifier] = scenario
        if scenario.identifier not in order:
            order.append(scenario.identifier)

    if mode_normalised == "replace":
        # Ensure order reflects override declaration order.
        order = [payload.get("identifier") for payload in payloads if payload.get("identifier")]
        order = [str(identifier).strip() for identifier in order if identifier]

    final: list[DemoScenario] = []
    included: set[str] = set()
    for identifier in order:
        if identifier in result_map and identifier not in included:
            final.append(result_map[identifier])
            included.add(identifier)
    for identifier, scenario in result_map.items():
        if identifier not in included:
            final.append(scenario)
            included.add(identifier)
    if not final:
        raise ScenarioValidationError("scenario overrides produced an empty catalogue")
    return final


def serialise_scenarios(scenarios: Sequence[DemoScenario]) -> list[dict[str, object]]:
    """Convert scenarios to dictionaries suitable for persistence."""

    return [scenario.to_dict() for scenario in scenarios]


__all__ = [
    "ScenarioValidationError",
    "resolve_scenarios",
    "serialise_scenarios",
]
