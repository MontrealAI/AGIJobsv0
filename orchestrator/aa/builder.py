"""Account Abstraction transaction builder used by the one-box routes."""

from __future__ import annotations

import hashlib
import json
import logging
import os
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Optional

try:
    from eth_account import Account
except ModuleNotFoundError:  # pragma: no cover - optional dependency for unit tests
    class _AccountStub:
        @staticmethod
        def from_key(key: bytes):  # type: ignore[no-untyped-def]
            raise ModuleNotFoundError("eth_account is required for account abstraction")

        @staticmethod
        def signHash(_hash):  # type: ignore[no-untyped-def]
            raise ModuleNotFoundError("eth_account is required for account abstraction")

    Account = _AccountStub()  # type: ignore[assignment]

from .bundler import BundlerClient, BundlerError, BundlerOptions
from .paymaster import PaymasterClient, PaymasterError

logger = logging.getLogger(__name__)


class AAConfigurationError(RuntimeError):
    """Raised when required configuration for AA mode is missing."""


class AAPolicyRejection(RuntimeError):
    """Raised when the AA gas policy rejects a transaction."""

    def __init__(self, message: str, *, code: str = "AA_POLICY_REJECTED") -> None:
        super().__init__(message)
        self.code = code


class AAPaymasterRejection(RuntimeError):
    """Raised when the paymaster declines to sponsor a user operation."""

    def __init__(self, message: str) -> None:
        super().__init__(message)


class AABundlerError(RuntimeError):
    """Raised when the bundler rejects or fails to process the user operation."""

    def __init__(self, message: str, *, simulation: bool = False) -> None:
        super().__init__(message)
        self.is_simulation_error = simulation


@dataclass(frozen=True)
class AAExecutionContext:
    """Metadata used to derive session keys and build policy context."""

    org_identifier: Optional[str]
    intent_type: str
    correlation_id: str
    plan_hash: Optional[str] = None
    created_at: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class AccountAbstractionResult:
    """Return value from :meth:`AccountAbstractionExecutor.execute`."""

    user_operation: Dict[str, Any]
    user_operation_hash: str
    transaction_hash: str
    receipt: Dict[str, Any]


def _parse_int_env(name: str, default: Optional[int] = None) -> Optional[int]:
    raw = os.getenv(name)
    if raw is None or raw == "":
        return default
    try:
        value = int(raw, 0)
    except ValueError:
        logger.warning("Invalid integer for %s: %s", name, raw)
        return default
    return value


def _parse_json_env(name: str) -> Optional[Dict[str, Any]]:
    raw = os.getenv(name)
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("Failed to decode JSON payload for %s", name)
        return None
    if isinstance(parsed, dict):
        return parsed
    logger.warning("Expected JSON object for %s, received %s", name, type(parsed).__name__)
    return None


def _int_from_quantity(value: Any) -> int:
    if value in (None, ""):
        return 0
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        text = value.strip()
        if text.startswith("0x"):
            return int(text, 16)
        try:
            return int(text)
        except ValueError:
            return 0
    return 0


class _GasReservation:
    def __init__(self, enforcer: "_GasBucketEnforcer", key: str, gas: int, day: str) -> None:
        self._enforcer = enforcer
        self._key = key
        self._gas = gas
        self._day = day
        self._consumed = False

    def commit(self) -> None:
        if self._consumed:
            return
        self._enforcer._apply(self._key, self._gas, self._day)
        self._consumed = True

    def cancel(self) -> None:
        self._consumed = True


class _GasBucketEnforcer:
    """Tracks daily/per-transaction gas consumption."""

    def __init__(
        self,
        *,
        per_tx_limit: Optional[int],
        per_org_daily_limit: Optional[int],
        global_daily_limit: Optional[int],
    ) -> None:
        self._per_tx_limit = per_tx_limit
        self._per_org_daily_limit = per_org_daily_limit
        self._global_daily_limit = global_daily_limit
        self._lock = threading.Lock()
        self._usage: Dict[str, Dict[str, int]] = {}

    def reserve(self, org_identifier: Optional[str], gas: int) -> Optional[_GasReservation]:
        if gas <= 0:
            return None
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        key = org_identifier or "__default__"
        with self._lock:
            if self._per_tx_limit and gas > self._per_tx_limit:
                raise AAPolicyRejection("Per-transaction gas cap exceeded")
            if self._would_violate(key, gas, today, self._per_org_daily_limit):
                raise AAPolicyRejection("Daily gas budget for organisation exhausted")
            if self._would_violate("__global__", gas, today, self._global_daily_limit):
                raise AAPolicyRejection("Daily global gas budget exhausted")
        return _GasReservation(self, key, gas, today)

    def _would_violate(
        self,
        key: str,
        gas: int,
        day: str,
        limit: Optional[int],
    ) -> bool:
        if not limit:
            return False
        record = self._usage.get(key)
        if record is None:
            return gas > limit
        used = record.get(day, 0)
        return used + gas > limit

    def _apply(self, key: str, gas: int, day: str) -> None:
        if gas <= 0:
            return
        with self._lock:
            record = self._usage.setdefault(key, {})
            record[day] = record.get(day, 0) + gas


class AccountAbstractionExecutor:
    """High level coordinator for building and submitting UserOperations."""

    def __init__(
        self,
        *,
        bundler: BundlerClient,
        paymaster: Optional[PaymasterClient],
        session_secret: bytes,
        verification_gas_limit: int,
        pre_verification_gas: int,
        call_gas_buffer: int,
        bundler_options: BundlerOptions,
        gas_policy: _GasBucketEnforcer,
        paymaster_context: Optional[Dict[str, Any]] = None,
    ) -> None:
        self._bundler = bundler
        self._paymaster = paymaster
        self._session_secret = session_secret
        self._verification_gas_limit = verification_gas_limit
        self._pre_verification_gas = pre_verification_gas
        self._call_gas_buffer = call_gas_buffer
        self._bundler_options = bundler_options
        self._gas_policy = gas_policy
        self._paymaster_context = paymaster_context or {}

    @classmethod
    def from_env(cls) -> "AccountAbstractionExecutor":
        bundler_url = os.getenv("AA_BUNDLER_RPC_URL") or os.getenv("BUNDLER_RPC_URL")
        entry_point = os.getenv("AA_ENTRY_POINT") or os.getenv("ENTRY_POINT")
        if not bundler_url or not entry_point:
            raise AAConfigurationError("AA bundler configuration missing")
        bundler_headers = _parse_json_env("AA_BUNDLER_HEADERS") or {}
        bundler_timeout = _parse_int_env("AA_BUNDLER_TIMEOUT_MS")
        bundler_poll = _parse_int_env("AA_BUNDLER_POLL_INTERVAL_MS")
        options = BundlerOptions()
        if bundler_timeout:
            options.timeout = max(1.0, bundler_timeout / 1000)
        if bundler_poll:
            options.poll_interval = max(0.2, bundler_poll / 1000)
        bundler_client = BundlerClient(
            bundler_url,
            entry_point=entry_point,
            headers={str(k): str(v) for k, v in bundler_headers.items()},
        )

        paymaster_url = os.getenv("AA_PAYMASTER_URL") or os.getenv("PAYMASTER_RPC_URL")
        paymaster_headers = _parse_json_env("AA_PAYMASTER_HEADERS") or {}
        paymaster_context = _parse_json_env("AA_PAYMASTER_CONTEXT") or {}
        paymaster: Optional[PaymasterClient] = None
        if paymaster_url:
            paymaster = PaymasterClient(
                paymaster_url,
                api_key=os.getenv("AA_PAYMASTER_API_KEY") or os.getenv("PAYMASTER_API_KEY"),
                headers={str(k): str(v) for k, v in paymaster_headers.items()},
                context=paymaster_context,
            )

        session_secret = os.getenv("AA_SESSION_SECRET") or os.getenv("SESSION_SECRET") or "onebox-aa-session"
        verification_gas_limit = _parse_int_env("AA_VERIFICATION_GAS_LIMIT", 1_500_000) or 1_500_000
        pre_verification_gas = _parse_int_env("AA_PRE_VERIFICATION_GAS", 60_000) or 60_000
        call_gas_buffer = _parse_int_env("AA_CALL_GAS_BUFFER", 25_000) or 25_000
        per_tx_limit = _parse_int_env("AA_POLICY_MAX_GAS_PER_TX")
        per_org_daily = _parse_int_env("AA_POLICY_MAX_GAS_PER_ORG_DAILY")
        global_daily = _parse_int_env("AA_POLICY_MAX_GAS_PER_DAY")
        gas_policy = _GasBucketEnforcer(
            per_tx_limit=per_tx_limit,
            per_org_daily_limit=per_org_daily,
            global_daily_limit=global_daily,
        )

        return cls(
            bundler=bundler_client,
            paymaster=paymaster,
            session_secret=session_secret.encode("utf-8"),
            verification_gas_limit=verification_gas_limit,
            pre_verification_gas=pre_verification_gas,
            call_gas_buffer=call_gas_buffer,
            bundler_options=options,
            gas_policy=gas_policy,
            paymaster_context=paymaster_context,
        )

    async def execute(self, tx: Dict[str, Any], context: AAExecutionContext) -> AccountAbstractionResult:
        gas_estimate = _int_from_quantity(tx.get("gas"))
        reservation = self._gas_policy.reserve(context.org_identifier, gas_estimate)
        try:
            user_op, session_account = self._build_user_operation(tx, context, gas_estimate)
            paymaster_payload = await self._maybe_sponsor(user_op, context)
            if paymaster_payload:
                user_op.update(paymaster_payload)
            user_op_hash = await self._submit(user_op)
            receipt = await self._await_receipt(user_op_hash)
            if receipt is None:
                raise AABundlerError("UserOperation not included in a transaction")
            tx_hash = str(receipt.get("transactionHash") or user_op_hash)
            if reservation:
                reservation.commit()
            receipt.setdefault("sessionAddress", session_account.address)
            return AccountAbstractionResult(
                user_operation=user_op,
                user_operation_hash=user_op_hash,
                transaction_hash=tx_hash,
                receipt=receipt,
            )
        except AAPolicyRejection:
            if reservation:
                reservation.cancel()
            raise
        except AAPaymasterRejection:
            if reservation:
                reservation.cancel()
            raise
        except AABundlerError:
            if reservation:
                reservation.cancel()
            raise
        except Exception:
            if reservation:
                reservation.cancel()
            raise

    async def _maybe_sponsor(
        self,
        user_op: Dict[str, Any],
        context: AAExecutionContext,
    ) -> Optional[Dict[str, Any]]:
        if not self._paymaster:
            return None
        try:
            result = await self._paymaster.sponsor_user_operation(
                user_op,
                context=self._build_paymaster_context(context),
            )
        except PaymasterError as exc:
            raise AAPaymasterRejection(str(exc)) from exc
        payload: Dict[str, Any] = {}
        if "paymasterAndData" in result:
            payload["paymasterAndData"] = result["paymasterAndData"]
        if "preVerificationGas" in result:
            payload["preVerificationGas"] = result["preVerificationGas"]
        if "verificationGasLimit" in result:
            payload["verificationGasLimit"] = result["verificationGasLimit"]
        if "callGasLimit" in result:
            payload["callGasLimit"] = result["callGasLimit"]
        return payload

    async def _submit(self, user_op: Dict[str, Any]) -> str:
        try:
            return await self._bundler.send_user_operation(user_op)
        except BundlerError as exc:
            raise AABundlerError(str(exc), simulation=exc.is_simulation_error) from exc

    async def _await_receipt(self, user_op_hash: str) -> Optional[Dict[str, Any]]:
        try:
            return await self._bundler.wait_for_receipt(user_op_hash, options=self._bundler_options)
        except BundlerError as exc:
            raise AABundlerError(str(exc), simulation=exc.is_simulation_error) from exc

    def _build_paymaster_context(self, context: AAExecutionContext) -> Dict[str, Any]:
        payload = dict(self._paymaster_context)
        if context.org_identifier and "org" not in payload:
            payload["org"] = context.org_identifier
        if context.plan_hash and "planHash" not in payload:
            payload["planHash"] = context.plan_hash
        if context.correlation_id and "traceId" not in payload:
            payload["traceId"] = context.correlation_id
        metadata = context.metadata or {}
        for key, value in metadata.items():
            payload.setdefault(key, value)
        return payload

    def _build_user_operation(
        self,
        tx: Dict[str, Any],
        context: AAExecutionContext,
        gas_estimate: int,
    ) -> tuple[Dict[str, Any], Any]:
        call_data = tx.get("data") or "0x"
        if isinstance(call_data, bytes):
            call_data = "0x" + call_data.hex()
        value = _int_from_quantity(tx.get("value"))
        max_fee_per_gas = _int_from_quantity(
            tx.get("maxFeePerGas") or tx.get("gasPrice") or tx.get("max_fee_per_gas")
        )
        if max_fee_per_gas == 0:
            max_fee_per_gas = 1_000_000_000
        max_priority_fee_per_gas = _int_from_quantity(
            tx.get("maxPriorityFeePerGas") or tx.get("max_priority_fee_per_gas") or max_fee_per_gas
        )
        call_gas_limit = gas_estimate + self._call_gas_buffer
        if call_gas_limit <= 0:
            call_gas_limit = self._call_gas_buffer
        session_account = self._derive_session_account(tx, context)
        user_op: Dict[str, Any] = {
            "sender": session_account.address,
            "nonce": hex(0),
            "initCode": "0x",
            "callData": call_data,
            "callGasLimit": hex(call_gas_limit),
            "verificationGasLimit": hex(self._verification_gas_limit),
            "preVerificationGas": hex(self._pre_verification_gas),
            "maxFeePerGas": hex(max_fee_per_gas),
            "maxPriorityFeePerGas": hex(max_priority_fee_per_gas),
            "paymasterAndData": "0x",
            "signature": "0x",
        }
        if value:
            user_op["callValue"] = hex(value)
        user_op["signature"] = self._sign_user_operation(session_account, user_op)
        return user_op, session_account

    def _derive_session_account(self, tx: Dict[str, Any], context: AAExecutionContext):
        hasher = hashlib.sha256()
        hasher.update(self._session_secret)
        hasher.update(b"|")
        hasher.update(context.correlation_id.encode("utf-8"))
        hasher.update(b"|")
        hasher.update((context.org_identifier or "default").encode("utf-8"))
        hasher.update(b"|")
        hasher.update((context.plan_hash or "").encode("utf-8"))
        hasher.update(b"|")
        hasher.update(context.intent_type.encode("utf-8"))
        hasher.update(b"|")
        hasher.update(str(tx.get("to") or "").lower().encode("utf-8"))
        call_data = tx.get("data")
        if isinstance(call_data, bytes):
            hasher.update(b"|")
            hasher.update(call_data)
        elif isinstance(call_data, str):
            hasher.update(b"|")
            hasher.update(call_data.encode("utf-8"))
        private_key = hasher.digest()
        return Account.from_key(private_key)

    def _sign_user_operation(self, account: Any, user_op: Dict[str, Any]) -> str:
        serialized = json.dumps(user_op, sort_keys=True, separators=(",", ":")).encode("utf-8")
        digest = hashlib.sha256(serialized).digest()
        signature = account.signHash(digest)
        return signature.signature.hex()
