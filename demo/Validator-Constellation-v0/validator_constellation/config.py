from __future__ import annotations

from dataclasses import dataclass, replace
from decimal import Decimal
from typing import Dict, Iterable, Sequence, Tuple


@dataclass
class SystemConfig:
    owner_address: str = "0x0000000000000000000000000000000000000abc"
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
    blacklist: Tuple[str, ...] = tuple()
    commit_phase_blocks: int = 3
    reveal_phase_blocks: int = 3
    quorum: int = 3
    slash_fraction_non_reveal: float = 0.25
    slash_fraction_dishonest: float = 0.4
    stake_unit: Decimal = Decimal("32")
    committee_size: int = 4
    batch_proof_capacity: int = 1_000
    gas_saved_per_job: int = 21000
    verifying_key: str = "0xfeedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeed"
    proving_key: str = "0x0ddc0ffee0ddc0ffee0ddc0ffee0ddc0ffee0ddc0ffee0ddc0ffee0ddc0ffee"
    sentinel_grace_ratio: float = 0.05
    default_domains: Tuple[Dict[str, object], ...] = (
        {
            "domain": "synthetic-biology",
            "human_name": "Synthetic Biology Lab",
            "budget_limit": 1_500_000.0,
            "unsafe_opcodes": ["SELFDESTRUCT", "DELEGATECALL"],
            "allowed_targets": [
                "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            ],
            "max_calldata_bytes": 4096,
            "forbidden_selectors": ["0xa9059cbb", "0x23b872dd"],
        },
    )

    @classmethod
    def with_overrides(cls, overrides: Iterable[Tuple[str, object]]) -> "SystemConfig":
        base = cls()
        data = {field.name: getattr(base, field.name) for field in base.__dataclass_fields__.values()}
        for key, value in overrides:
            data[key] = value
        return cls(**data)

    def clone(self, **updates: object) -> "SystemConfig":
        return replace(self, **updates)

    def domain_by_id(self, domain_id: str) -> Dict[str, object]:
        for domain in self.default_domains:
            if domain["domain"] == domain_id:
                return dict(domain)
        raise KeyError(f"Domain {domain_id} not configured")
