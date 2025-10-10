#!/usr/bin/env python3
"""Utility CLI for inspecting and updating organisation policy caps.

The one-box orchestrator stores tenant policy guardrails in
``storage/org-policies.json``.  Non-technical operators can run this tool to
inspect the current configuration, raise/lower reward caps, adjust deadline
limits, or manage tool allow-lists without touching the FastAPI codebase.

Examples
--------
List current policies::

    $ python tools/org_policy_admin.py list

Raise the default budget cap to 1,000 AGIALPHA and limit deadlines to 21 days::

    $ python tools/org_policy_admin.py set --max-budget 1000 --max-duration 21

Disable tool restrictions for organisation ``acme-labs``::

    $ python tools/org_policy_admin.py set --org acme-labs --clear-tools

All commands accept ``--policy-file`` to operate on an alternate JSON file (for
example inside a staging environment checkout).
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Dict, Iterable, List, Optional

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_POLICY_FILE = REPO_ROOT / "storage" / "org-policies.json"
DEFAULT_TOKEN_SYMBOL = "AGIALPHA"
DEFAULT_TOKEN_DECIMALS = 18


@dataclass
class Policy:
    """In-memory representation of an organisation policy record."""

    max_budget_wei: Optional[int] = None
    max_duration_days: Optional[int] = None
    allowed_tools: Optional[List[str]] = None
    updated_at: Optional[str] = None

    @classmethod
    def from_dict(cls, data: Dict[str, object]) -> "Policy":
        max_budget: Optional[int] = None
        raw_budget = data.get("maxBudgetWei")
        if isinstance(raw_budget, str):
            raw_budget = raw_budget.strip()
            if raw_budget:
                try:
                    max_budget = int(raw_budget, 10)
                except ValueError:
                    raise ValueError(f"Invalid maxBudgetWei value: {raw_budget!r}") from None
        elif isinstance(raw_budget, (int, float)):
            max_budget = int(raw_budget)

        max_duration: Optional[int] = None
        raw_duration = data.get("maxDurationDays")
        if isinstance(raw_duration, (int, str)):
            text = str(raw_duration).strip()
            if text:
                try:
                    max_duration = int(text, 10)
                except ValueError:
                    raise ValueError(f"Invalid maxDurationDays value: {raw_duration!r}") from None

        tools: Optional[List[str]] = None
        raw_tools = data.get("allowedTools")
        if raw_tools is None:
            raw_tools = data.get("toolWhitelist")
        if isinstance(raw_tools, list):
            cleaned = [str(entry).strip() for entry in raw_tools if str(entry).strip()]
            tools = cleaned or None
        elif isinstance(raw_tools, str):
            tokens = [token.strip() for token in raw_tools.split(",") if token.strip()]
            tools = tokens or None

        updated_at = None
        raw_updated_at = data.get("updatedAt")
        if isinstance(raw_updated_at, str) and raw_updated_at.strip():
            updated_at = raw_updated_at.strip()

        return cls(
            max_budget_wei=max_budget,
            max_duration_days=max_duration,
            allowed_tools=tools,
            updated_at=updated_at,
        )

    def to_dict(self) -> Dict[str, object]:
        payload: Dict[str, object] = {
            "maxBudgetWei": str(self.max_budget_wei) if self.max_budget_wei is not None else None,
            "maxDurationDays": self.max_duration_days,
            "allowedTools": list(self.allowed_tools) if self.allowed_tools is not None else None,
        }
        if self.updated_at:
            payload["updatedAt"] = self.updated_at
        return payload


class PolicyStore:
    """Simple JSON-backed policy storage used by the CLI."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.policies: Dict[str, Policy] = {}
        if path.exists():
            self.policies = self._load(path)
        if "__default__" not in self.policies:
            self.policies["__default__"] = Policy()

    @staticmethod
    def _load(path: Path) -> Dict[str, Policy]:
        try:
            with path.open("r", encoding="utf-8") as handle:
                data = json.load(handle)
        except json.JSONDecodeError as exc:
            raise SystemExit(f"Failed to parse {path}: {exc}") from exc
        except FileNotFoundError:
            return {}

        policies: Dict[str, Policy] = {}
        if not isinstance(data, dict):
            raise SystemExit(f"Policy file must contain an object, found: {type(data).__name__}")
        for key, value in data.items():
            if not isinstance(value, dict):
                raise SystemExit(f"Policy entry {key!r} must be an object, found: {type(value).__name__}")
            policies[str(key)] = Policy.from_dict(value)
        return policies

    def save(self) -> None:
        serialised = {key: policy.to_dict() for key, policy in sorted(self.policies.items())}
        with self.path.open("w", encoding="utf-8") as handle:
            json.dump(serialised, handle, indent=2, sort_keys=True)
            handle.write("\n")

    def get(self, org: Optional[str]) -> Policy:
        key = normalise_org(org)
        return self.policies.get(key, Policy())

    def set(self, org: Optional[str], policy: Policy) -> None:
        key = normalise_org(org)
        self.policies[key] = policy

    def delete(self, org: Optional[str]) -> None:
        key = normalise_org(org)
        self.policies.pop(key, None)

    def items(self) -> Iterable[tuple[str, Policy]]:
        return self.policies.items()


def normalise_org(org: Optional[str]) -> str:
    identifier = (org or "").strip()
    return identifier or "__default__"


def parse_budget(amount: Optional[str], *, unit: str, decimals: int) -> Optional[int]:
    if amount is None:
        return None
    text = amount.strip()
    if not text or text.lower() in {"none", "null"}:
        return None
    try:
        numeric = Decimal(text)
    except Exception as exc:  # pragma: no cover - Decimal already raises informative errors
        raise ValueError(f"Invalid numeric amount: {amount!r}") from exc

    if unit == "wei":
        quantised = numeric.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        return int(quantised)

    scale = Decimal(10) ** decimals
    wei = (numeric * scale).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return int(wei)


def format_budget(wei: Optional[int], *, symbol: str, decimals: int) -> str:
    if wei is None:
        return "unlimited"
    quantiser = Decimal(10) ** decimals
    human = Decimal(wei) / quantiser
    return f"{human.normalize()} {symbol}" if human != human.to_integral_value() else f"{human} {symbol}"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.set_defaults(command=None)
    parser.add_argument(
        "--policy-file",
        type=Path,
        default=DEFAULT_POLICY_FILE,
        help=f"Policy JSON file (default: {DEFAULT_POLICY_FILE})",
    )
    parser.add_argument(
        "--token-symbol",
        default=DEFAULT_TOKEN_SYMBOL,
        help="Token symbol for human-readable output (default: %(default)s)",
    )
    parser.add_argument(
        "--token-decimals",
        type=int,
        default=DEFAULT_TOKEN_DECIMALS,
        help="Token decimals used when parsing token-denominated budgets (default: %(default)s)",
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("list", help="List all known organisation policies")

    set_parser = subparsers.add_parser("set", help="Create or update a policy entry")
    set_parser.add_argument("--org", help="Organisation identifier (defaults to __default__)" )
    set_parser.add_argument("--max-budget", help="Maximum reward budget (interpreted in tokens by default)")
    set_parser.add_argument(
        "--budget-unit",
        choices=("token", "wei"),
        default="token",
        help="Interpretation of --max-budget (token units or raw wei)",
    )
    set_parser.add_argument("--clear-max-budget", action="store_true", help="Remove the budget cap")
    set_parser.add_argument("--max-duration", type=int, help="Maximum deadline in days")
    set_parser.add_argument("--clear-max-duration", action="store_true", help="Remove the deadline cap")
    set_parser.add_argument(
        "--allowed-tools",
        help="Comma-separated allow-list. Use '*' or omit to allow every tool.",
    )
    set_parser.add_argument(
        "--clear-tools",
        action="store_true",
        help="Remove any tool restrictions (equivalent to allow all tools)",
    )

    delete_parser = subparsers.add_parser("delete", help="Remove a policy entry entirely")
    delete_parser.add_argument("--org", help="Organisation identifier (defaults to __default__)" )

    return parser


def command_list(store: PolicyStore, *, symbol: str, decimals: int) -> int:
    if not store.policies:
        print("No policies defined. Defaults will be derived from environment variables.")
        return 0
    width = max(len(key) for key in store.policies.keys())
    header = f"{'Organisation'.ljust(width)}  Budget cap               Deadline cap  Tools"
    print(header)
    print("-" * len(header))
    for key, policy in sorted(store.items()):
        budget = format_budget(policy.max_budget_wei, symbol=symbol, decimals=decimals)
        deadline = policy.max_duration_days if policy.max_duration_days is not None else "unlimited"
        tools = ", ".join(policy.allowed_tools) if policy.allowed_tools else "all"
        print(f"{key.ljust(width)}  {budget.ljust(23)}  {str(deadline).ljust(12)}  {tools}")
    return 0


def command_set(
    store: PolicyStore,
    *,
    org: Optional[str],
    max_budget: Optional[str],
    budget_unit: str,
    clear_max_budget: bool,
    max_duration: Optional[int],
    clear_max_duration: bool,
    allowed_tools: Optional[str],
    clear_tools: bool,
    decimals: int,
) -> int:
    policy = store.get(org)
    now = datetime.now(timezone.utc).isoformat()

    changes_made = False

    if clear_max_budget:
        policy.max_budget_wei = None
        changes_made = True
    elif max_budget is not None:
        policy.max_budget_wei = parse_budget(max_budget, unit=budget_unit, decimals=decimals)
        changes_made = True

    if clear_max_duration:
        policy.max_duration_days = None
        changes_made = True
    elif max_duration is not None:
        if max_duration <= 0:
            raise SystemExit("--max-duration must be a positive integer")
        policy.max_duration_days = max_duration
        changes_made = True

    if clear_tools:
        policy.allowed_tools = None
        changes_made = True
    elif allowed_tools is not None:
        tokens = [token.strip() for token in allowed_tools.split(",") if token.strip()]
        policy.allowed_tools = tokens or None
        changes_made = True

    if not changes_made:
        print("No updates requested; existing policy left unchanged.")
        return 0

    policy.updated_at = now
    store.set(org, policy)
    store.save()
    target = normalise_org(org)
    print(f"Updated policy for {target} in {store.path}")
    return 0


def command_delete(store: PolicyStore, *, org: Optional[str]) -> int:
    target = normalise_org(org)
    if target not in store.policies:
        print(f"No policy stored for {target}; nothing to delete.")
        return 0
    store.delete(target)
    store.save()
    print(f"Deleted policy for {target} from {store.path}")
    return 0


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    store = PolicyStore(args.policy_file)

    if args.command == "list":
        return command_list(store, symbol=args.token_symbol, decimals=args.token_decimals)
    if args.command == "set":
        return command_set(
            store,
            org=args.org,
            max_budget=args.max_budget,
            budget_unit=args.budget_unit,
            clear_max_budget=args.clear_max_budget,
            max_duration=args.max_duration,
            clear_max_duration=args.clear_max_duration,
            allowed_tools=args.allowed_tools,
            clear_tools=args.clear_tools,
            decimals=args.token_decimals,
        )
    if args.command == "delete":
        return command_delete(store, org=args.org)

    parser.print_help()
    return 1


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    sys.exit(main())
