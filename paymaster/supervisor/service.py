"""Core paymaster supervisor logic."""

from __future__ import annotations

import asyncio
import datetime as _dt
from pathlib import Path
from typing import Any, Dict, Optional

import contextlib

try:  # pragma: no cover - fallback for tests without dependency
    from prometheus_client import Counter, CollectorRegistry, CONTENT_TYPE_LATEST, generate_latest
except Exception:  # pragma: no cover - simplified shim
    class _Counter:
        def __init__(self, *_args: Any, **_kwargs: Any) -> None:
            self.value: Dict[tuple[str, ...], int] = {}

        def labels(self, *values: str) -> "_Counter":
            self._labels = tuple(values)
            return self

        def inc(self, value: int = 1) -> None:
            key = getattr(self, "_labels", tuple())
            self.value[key] = self.value.get(key, 0) + value

    class _Registry:  # pragma: no cover - shim
        pass

    def _generate_latest(_registry: Any | None = None) -> bytes:
        return b""

    Counter = _Counter  # type: ignore[assignment]
    CollectorRegistry = _Registry  # type: ignore[assignment]
    CONTENT_TYPE_LATEST = "text/plain"
    generate_latest = _generate_latest  # type: ignore[assignment]

from .config import PaymasterConfig, load_config
from .signers import Signer, sponsorship_digest


class BalanceFetcher:
    """Protocol-like callable returning the current paymaster balance."""

    async def __call__(self, address: str) -> int:  # pragma: no cover - protocol helper
        raise NotImplementedError


class PaymasterSupervisor:
    """Coordinates sponsorship policy, config reloads, and metrics."""

    def __init__(
        self,
        *,
        config_path: Path,
        signer: Signer,
        balance_fetcher: BalanceFetcher,
    ) -> None:
        self._config_path = config_path
        self._signer = signer
        self._balance_fetcher = balance_fetcher
        self._config = load_config(config_path)
        self._config_mtime = config_path.stat().st_mtime
        self._config_lock = asyncio.Lock()
        self._org_spend: Dict[str, tuple[_dt.date, int]] = {}
        self._metrics_registry = CollectorRegistry()  # type: ignore[call-arg]
        self._sponsored_ops = Counter(
            "sponsored_ops_total",
            "Count of user operations sponsored",
            registry=self._metrics_registry,
        )
        self._rejections = Counter(
            "rejections_total",
            "Count of sponsorship rejections",
            labelnames=("reason",),
            registry=self._metrics_registry,
        )
        self._reload_task: Optional[asyncio.Task[None]] = None

    @property
    def config(self) -> PaymasterConfig:
        return self._config

    async def start(self) -> None:
        """Start background tasks such as config reloaders."""

        if self._reload_task and not self._reload_task.done():
            return
        self._reload_task = asyncio.create_task(self._reload_loop())

    async def close(self) -> None:
        if self._reload_task:
            self._reload_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._reload_task

    async def sponsor(
        self,
        user_operation: Dict[str, Any],
        *,
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Validate and, when eligible, return sponsorship metadata."""

        context = context or {}
        org_id = str(context.get("org")) if context.get("org") is not None else None
        estimated_cost = int(context.get("estimated_cost_wei") or 0)
        if estimated_cost <= 0:
            self._rejections.labels("missing_cost").inc()
            raise PermissionError("estimated_cost_wei is required")

        async with self._config_lock:
            config = self._config

        selector = _extract_selector(user_operation.get("callData"))
        target = user_operation.get("target") or user_operation.get("to")
        if not config.method_is_allowed(target, selector):
            self._rejections.labels("method_not_allowed").inc()
            raise PermissionError("call not permitted by whitelist")

        call_gas = int(user_operation.get("callGasLimit") or 0)
        verification_gas = int(user_operation.get("verificationGasLimit") or 0)
        pre_verification_gas = int(user_operation.get("preVerificationGas") or 0)
        total_gas = call_gas + verification_gas + pre_verification_gas
        if total_gas > config.max_user_operation_gas:
            self._rejections.labels("gas_cap_exceeded").inc()
            raise PermissionError("user operation exceeds configured gas cap")

        cap = config.org_cap(org_id)
        org_key = org_id or "default"
        budget_commit: Optional[tuple[_dt.date, int]] = None
        if cap is not None:
            allowed, commit = self._evaluate_org_budget(org_key, cap, estimated_cost)
            if not allowed:
                self._rejections.labels("org_cap_exceeded").inc()
                raise PermissionError("organization daily cap exceeded")
            budget_commit = commit

        balance = await self._balance_fetcher(config.paymaster_address)
        if balance < config.balance_threshold_wei:
            self._rejections.labels("insufficient_balance").inc()
            raise PermissionError("paymaster balance below configured threshold")

        digest = sponsorship_digest(
            user_operation,
            chain_id=config.chain_id,
            paymaster=config.paymaster_address,
        )
        signature = await self._signer.sign_user_operation(digest)
        if budget_commit is not None:
            self._org_spend[org_key] = budget_commit
        self._sponsored_ops.inc()
        return {
            "paymaster": config.paymaster_address,
            "paymasterAndData": f"{config.paymaster_address}{signature.hex()}",
        }

    def metrics(self) -> bytes:
        return generate_latest(self._metrics_registry)  # type: ignore[arg-type]

    @property
    def metrics_content_type(self) -> str:
        return CONTENT_TYPE_LATEST

    async def health(self) -> Dict[str, Any]:
        balance = await self._balance_fetcher(self._config.paymaster_address)
        return {
            "status": "ok" if balance >= self._config.balance_threshold_wei else "degraded",
            "balance": balance,
            "threshold": self._config.balance_threshold_wei,
            "chainId": self._config.chain_id,
            "paymaster": self._config.paymaster_address,
        }

    async def _reload_loop(self) -> None:
        while True:
            await asyncio.sleep(max(1, self._config.reload_interval_seconds))
            try:
                stat = self._config_path.stat()
            except FileNotFoundError:
                continue
            if stat.st_mtime <= self._config_mtime:
                continue
            await self._reload()

    async def _reload(self) -> None:
        new_config = load_config(self._config_path)
        async with self._config_lock:
            self._config = new_config
            self._config_mtime = self._config_path.stat().st_mtime
        # Reset spend buckets on config reload to avoid carrying stale allowances
        self._org_spend.clear()

    def _evaluate_org_budget(
        self, org_id: str, cap: int, cost: int
    ) -> tuple[bool, tuple[_dt.date, int]]:
        today = _dt.date.today()
        spent_date, spent = self._org_spend.get(org_id, (today, 0))
        if spent_date != today:
            spent = 0
        new_total = spent + cost
        if new_total > cap:
            return False, (today, spent)
        return True, (today, new_total)


def _extract_selector(call_data: Any) -> Optional[str]:
    if not isinstance(call_data, str) or not call_data.startswith("0x") or len(call_data) < 10:
        return None
    return call_data[:10].lower()


import contextlib  # placed at end to avoid circular import issues
