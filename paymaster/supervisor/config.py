"""Configuration models for the paymaster supervisor."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

try:  # pragma: no cover - optional dependency
    import yaml
except Exception:  # pragma: no cover - fallback to JSON parser
    yaml = None  # type: ignore[assignment]


@dataclass
class MethodWhitelist:
    """Declares method selectors approved for sponsorship on a contract."""

    target: str
    selectors: List[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        if not isinstance(self.target, str) or not self.target.startswith("0x") or len(self.target) != 42:
            raise ValueError("target must be a 0x-prefixed 20-byte address")
        self.target = self.target.lower()
        normalized: List[str] = []
        for selector in self.selectors:
            if not isinstance(selector, str) or not selector.startswith("0x") or len(selector) != 10:
                raise ValueError("selectors must be 4-byte 0x-prefixed values")
            normalized.append(selector.lower())
        self.selectors = normalized


@dataclass
class OrgPolicy:
    """Defines spending allowances for an organization."""

    daily_cap_wei: int

    def __post_init__(self) -> None:
        if not isinstance(self.daily_cap_wei, int) or self.daily_cap_wei <= 0:
            raise ValueError("daily_cap_wei must be a positive integer")


@dataclass
class PaymasterConfig:
    """Loaded supervisor configuration."""

    chain_id: int
    paymaster_address: str
    balance_threshold_wei: int
    max_user_operation_gas: int
    whitelist: List[MethodWhitelist] = field(default_factory=list)
    orgs: Dict[str, OrgPolicy] = field(default_factory=dict)
    default_daily_cap_wei: Optional[int] = None
    reload_interval_seconds: int = 10

    def __post_init__(self) -> None:
        if not isinstance(self.chain_id, int) or self.chain_id <= 0:
            raise ValueError("chain_id must be a positive integer")
        if not isinstance(self.paymaster_address, str) or not self.paymaster_address.startswith("0x") or len(self.paymaster_address) != 42:
            raise ValueError("paymaster_address must be a 0x-prefixed 20-byte address")
        self.paymaster_address = self.paymaster_address.lower()
        if not isinstance(self.balance_threshold_wei, int) or self.balance_threshold_wei < 0:
            raise ValueError("balance_threshold_wei must be non-negative")
        if not isinstance(self.max_user_operation_gas, int) or self.max_user_operation_gas <= 0:
            raise ValueError("max_user_operation_gas must be positive")
        if self.default_daily_cap_wei is not None:
            if not isinstance(self.default_daily_cap_wei, int) or self.default_daily_cap_wei < 0:
                raise ValueError("default_daily_cap_wei must be non-negative")
        if not isinstance(self.reload_interval_seconds, int) or not (1 <= self.reload_interval_seconds <= 3600):
            raise ValueError("reload_interval_seconds must be between 1 and 3600 seconds")

    @classmethod
    def from_mapping(cls, data: Dict[str, Any]) -> "PaymasterConfig":
        whitelist_data = data.get("whitelist", []) or []
        whitelist = [MethodWhitelist(**item) for item in whitelist_data]
        orgs_map = {}
        for org_id, org_conf in (data.get("orgs") or {}).items():
            orgs_map[str(org_id)] = OrgPolicy(**org_conf)
        return cls(
            chain_id=int(data["chain_id"]),
            paymaster_address=str(data["paymaster_address"]),
            balance_threshold_wei=int(data.get("balance_threshold_wei", 0)),
            max_user_operation_gas=int(data["max_user_operation_gas"]),
            whitelist=whitelist,
            orgs=orgs_map,
            default_daily_cap_wei=(
                int(data["default_daily_cap_wei"]) if data.get("default_daily_cap_wei") is not None else None
            ),
            reload_interval_seconds=int(data.get("reload_interval_seconds", 10)),
        )

    def org_cap(self, org_id: Optional[str]) -> Optional[int]:
        if org_id and org_id in self.orgs:
            return self.orgs[org_id].daily_cap_wei
        return self.default_daily_cap_wei

    def method_is_allowed(self, target: Optional[str], selector: Optional[str]) -> bool:
        if not self.whitelist:
            return True
        if not target or not selector:
            return False
        target = target.lower()
        selector = selector.lower()
        for policy in self.whitelist:
            if policy.target == target and (not policy.selectors or selector in policy.selectors):
                return True
        return False


def load_config(path: str | Path) -> PaymasterConfig:
    """Load supervisor configuration from disk."""

    text = Path(path).read_text()
    if yaml is not None:
        data = yaml.safe_load(text)
    else:
        data = json.loads(text or "{}")
    if not isinstance(data, dict):
        raise ValueError("paymaster configuration must be a mapping")
    return PaymasterConfig.from_mapping(data)
