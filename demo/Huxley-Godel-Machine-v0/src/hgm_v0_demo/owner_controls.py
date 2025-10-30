"""Owner control directives applied to the HGM demo orchestrator.

The contract owner (or operator) can override scheduling behaviour at runtime by
setting configuration flags.  This module centralises the translation between
configuration files and actionable directives so that both the orchestrator and
telemetry layers present a consistent view of the owner's intent.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping, Optional


@dataclass(frozen=True)
class OwnerControls:
    """Represents manual overrides issued by the contract owner."""

    pause_all: bool = False
    pause_expansions: bool = False
    pause_evaluations: bool = False
    max_actions: Optional[int] = None
    note: str | None = None

    @classmethod
    def from_mapping(cls, payload: Mapping[str, object] | None) -> "OwnerControls":
        if payload is None:
            return cls()

        def _as_bool(key: str, default: bool) -> bool:
            value = payload.get(key, default)
            if isinstance(value, str):
                lowered = value.strip().lower()
                if lowered in {"true", "1", "yes", "on"}:
                    return True
                if lowered in {"false", "0", "no", "off"}:
                    return False
            return bool(value)

        def _as_int(key: str) -> Optional[int]:
            value = payload.get(key)
            if value is None:
                return None
            if isinstance(value, bool):
                return int(value)
            try:
                parsed = int(value)
            except (TypeError, ValueError) as exc:
                raise ValueError(f"owner_controls.{key} must be an integer or null") from exc
            if parsed < 0:
                raise ValueError(f"owner_controls.{key} must be non-negative")
            return parsed

        pause_all = _as_bool("pause_all", False)
        pause_expansions = _as_bool("pause_expansions", False)
        pause_evaluations = _as_bool("pause_evaluations", False)
        max_actions = _as_int("max_actions")
        note = payload.get("note")
        if note is not None and not isinstance(note, str):
            raise ValueError("owner_controls.note must be a string if provided")
        return cls(
            pause_all=pause_all,
            pause_expansions=pause_expansions,
            pause_evaluations=pause_evaluations,
            max_actions=max_actions,
            note=note.strip() if isinstance(note, str) else None,
        )

    def should_block_new_actions(self, scheduled_actions: int) -> bool:
        if self.pause_all:
            return True
        if self.max_actions is not None and scheduled_actions >= self.max_actions:
            return True
        return False

    def describe(self, *, consumed_actions: int | None = None, cap_triggered: bool = False) -> Optional[str]:
        messages: list[str] = []
        if self.pause_all:
            messages.append("Owner override paused all expansions and evaluations")
        else:
            if self.pause_expansions:
                messages.append("Owner override paused expansions")
            if self.pause_evaluations:
                messages.append("Owner override paused evaluations")
        if self.max_actions is not None:
            if cap_triggered and consumed_actions is not None:
                messages.append(
                    f"Owner cap limited scheduling to {consumed_actions} of {self.max_actions} authorised actions"
                )
            else:
                messages.append(f"Owner cap limited scheduling to {self.max_actions} actions")
        if self.note:
            messages.append(self.note)
        if not messages:
            return None
        return "; ".join(messages)

    # ------------------------------------------------------------------
    # Serialisation helpers
    # ------------------------------------------------------------------
    def to_mapping(self) -> dict[str, object]:
        """Return a JSON-friendly mapping of the owner directives."""

        payload: dict[str, object] = {
            "pause_all": self.pause_all,
            "pause_expansions": self.pause_expansions,
            "pause_evaluations": self.pause_evaluations,
        }
        if self.max_actions is not None:
            payload["max_actions"] = self.max_actions
        if self.note:
            payload["note"] = self.note
        return payload

    def to_cli_args(
        self,
        *,
        prefix: str = "owner_controls",
        baseline: "OwnerControls" | None = None,
    ) -> list[str]:
        """Render overrides as ``--set`` CLI arguments.

        Only values that differ from ``baseline`` (defaults if omitted) are
        emitted.  Values are encoded using :func:`json.dumps` to guarantee that
        strings and booleans are shell safe for ``demo_hgm.js`` and
        ``run_demo.py``.
        """

        import json

        baseline = baseline or OwnerControls()
        current = self.to_mapping()
        reference = baseline.to_mapping()
        args: list[str] = []
        for key, value in current.items():
            if key in reference and reference[key] == value:
                continue
            encoded = json.dumps(value)
            args.append(f"--set {prefix}.{key}={encoded}")
        return args


__all__ = ["OwnerControls"]
