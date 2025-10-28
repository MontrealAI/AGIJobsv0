"""System configuration primitives for the Validator Constellation demo."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable, Tuple


@dataclass(slots=True)
class SystemConfig:
    """Holds configurable parameters for the demo.

    The values are intentionally generous so that non-technical
    operators can explore edge-cases without modifying source
    code.  Every parameter is mutable at runtime to emulate the
    privileged control that the contract owner wields in
    production deployments.
    """

    commit_phase_blocks: int = 4
    reveal_phase_blocks: int = 4
    quorum: int = 2
    slash_fraction_non_reveal: float = 0.25
    slash_fraction_incorrect_vote: float = 0.5
    allowed_validator_roots: Tuple[str, ...] = (
        "club.agi.eth",
        "alpha.club.agi.eth",
    )
    allowed_agent_roots: Tuple[str, ...] = (
        "agent.agi.eth",
        "alpha.agent.agi.eth",
    )
    allowed_node_roots: Tuple[str, ...] = (
        "node.agi.eth",
        "alpha.node.agi.eth",
    )
    committee_size: int = 3
    batch_proof_capacity: int = 1_000
    owner_address: str = "0x0000000000000000000000000000000000000001"
    blacklist: Tuple[str, ...] = field(default_factory=tuple)

    def update(self, **kwargs) -> None:
        """Update configuration parameters at runtime.

        The method mirrors owner-governed configuration changes on
        chain.  Unknown keys raise ``AttributeError`` so that
        accidental typos cannot silently degrade system security.
        """

        for key, value in kwargs.items():
            if not hasattr(self, key):
                raise AttributeError(f"Unknown configuration field: {key}")
            setattr(self, key, value)

    @classmethod
    def with_overrides(cls, overrides: Iterable[tuple[str, object]]) -> "SystemConfig":
        config = cls()
        for key, value in overrides:
            setattr(config, key, value)
        return config
