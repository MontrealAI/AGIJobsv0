"""Dry-run and policy validation for orchestration plans."""

from __future__ import annotations

import json
import os
import time
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from functools import lru_cache
from typing import Any, Dict, List, Tuple
from urllib.error import URLError
from urllib.request import Request, urlopen

from .config import format_percent, get_burn_fraction, get_fee_fraction
from .models import OrchestrationPlan, SimOut

FEE_FRACTION = get_fee_fraction()
BURN_FRACTION = get_burn_fraction()
FEE_PERCENT_LABEL = format_percent(FEE_FRACTION)
BURN_PERCENT_LABEL = format_percent(BURN_FRACTION)
_TOTAL_MULTIPLIER = Decimal("1") + FEE_FRACTION + BURN_FRACTION

_DEFAULT_RPC_URL = os.getenv("SIMULATOR_RPC_URL") or os.getenv("RPC_URL") or "http://127.0.0.1:8545"
_RPC_TIMEOUT = float(os.getenv("SIMULATOR_RPC_TIMEOUT", "5"))
_ORG_POLICY_PATH = (
    os.getenv("SIMULATOR_POLICY_PATH")
    or os.getenv("ONEBOX_POLICY_PATH")
    or os.path.join(os.path.dirname(__file__), "..", "storage", "org-policies.json")
)

_HEX_QUANTITY_FIELDS = {
    "gas",
    "gasPrice",
    "maxFeePerGas",
    "maxPriorityFeePerGas",
    "value",
}

_RISK_GUIDANCE: Dict[str, str] = {
    "BUDGET_REQUIRED": "Stake the minimum AGIALPHA before continuing. Add funds or reduce the job’s stake size.",
    "INSUFFICIENT_ALLOWANCE": "Approve AGIALPHA spending from your wallet so I can move the staked funds for you.",
    "ENS_MISMATCH": "ENS ownership didn’t match the request. Double-check the ENS name and try again.",
    "INSUFFICIENT_BALANCE": "You need more AGIALPHA available to cover the reward and stake. Top up or adjust the amounts.",
    "DEADLINE_INVALID": "Choose a deadline at least 24 hours out and within the protocol’s maximum window.",
    "JOB_BUDGET_CAP_EXCEEDED": "Requested reward exceeds the configured cap for your organisation.",
    "JOB_DEADLINE_CAP_EXCEEDED": "Requested deadline exceeds the configured cap for your organisation.",
    "OVER_BUDGET": "Planned escrow exceeds the configured budget cap.",
    "RPC_TIMEOUT": "The blockchain RPC endpoint timed out. Try again or switch to a healthier provider.",
    "UNKNOWN_REVERT": "The transaction reverted without a known reason. Check the parameters or retry.",
}


def _append_risk(
    risks: List[str],
    risk_details: List[Dict[str, str]],
    code: str,
    *,
    message_override: str | None = None,
) -> None:
    """Track structured risk codes and corresponding human-readable guidance."""

    if code not in risks:
        risks.append(code)
    if any(detail.get("code") == code for detail in risk_details):
        return
    message = message_override or _RISK_GUIDANCE.get(code) or code.replace("_", " ").title()
    risk_details.append({"code": code, "message": message})


def _append_blocker(blockers: List[str], code: str) -> None:
    if code not in blockers:
        blockers.append(code)


class JsonRpcError(Exception):
    """Raised when an RPC request returns an error payload."""

    def __init__(self, code: int | None, message: str, data: Any | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.data = data


class RpcTransportError(Exception):
    """Raised when the RPC endpoint cannot be reached."""

    pass


def _safe_decimal(value: str | None) -> Decimal:
    if not value:
        return Decimal("0")
    try:
        return Decimal(value)
    except (InvalidOperation, TypeError):
        return Decimal("0")


def _rpc_request(method: str, params: List[Any], *, rpc_url: str = _DEFAULT_RPC_URL) -> Any:
    """Send a JSON-RPC request and return the decoded result."""

    payload = json.dumps(
        {
            "jsonrpc": "2.0",
            "id": int(time.time() * 1000) % 1_000_000,
            "method": method,
            "params": params,
        }
    ).encode("utf-8")
    request = Request(rpc_url, data=payload, headers={"Content-Type": "application/json"})
    try:
        with urlopen(request, timeout=_RPC_TIMEOUT) as response:
            raw = response.read()
    except URLError as exc:  # pragma: no cover - network errors are environment-specific
        raise RpcTransportError(str(exc)) from exc
    except OSError as exc:  # pragma: no cover - defensive
        raise RpcTransportError(str(exc)) from exc

    if not raw:
        return None
    try:
        decoded = json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as exc:  # pragma: no cover - defensive parsing
        raise RpcTransportError(f"Invalid JSON-RPC response: {exc}") from exc
    if "error" in decoded:
        error = decoded["error"] or {}
        raise JsonRpcError(error.get("code"), error.get("message", "RPC error"), error.get("data"))
    return decoded.get("result")


def _estimate_budget(plan: OrchestrationPlan) -> Tuple[Decimal, Decimal]:
    total_budget = _safe_decimal(plan.budget.max)
    if total_budget <= 0:
        return total_budget, Decimal("0")

    reward = (total_budget / _TOTAL_MULTIPLIER).quantize(Decimal("0.01"))
    fees_and_burn = (total_budget - reward).quantize(Decimal("0.01"))
    return total_budget, fees_and_burn


def _normalize_quantity(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        trimmed = value.strip()
        if not trimmed:
            return None
        if trimmed.startswith("0x") or trimmed.startswith("0X"):
            try:
                int(trimmed, 16)
            except ValueError:
                return None
            return "0x" + trimmed[2:].lstrip("0") or "0x0"
        try:
            number = int(trimmed, 10)
        except ValueError:
            try:
                number = int(trimmed, 16)
            except ValueError:
                return None
        return hex(number)
    if isinstance(value, bytes):
        return "0x" + value.hex()
    if isinstance(value, Decimal):
        return hex(int(value))
    if isinstance(value, int):
        return hex(value)
    return None


def _normalize_call(params: Dict[str, Any]) -> Dict[str, Any]:
    normalized: Dict[str, Any] = {}
    for key, value in params.items():
        if key in _HEX_QUANTITY_FIELDS:
            normalized_value = _normalize_quantity(value)
            if normalized_value is not None:
                normalized[key] = normalized_value
        else:
            normalized[key] = value
    return normalized


def _extract_call(step: Any) -> Dict[str, Any] | None:
    params = getattr(step, "params", {}) or {}
    if not isinstance(params, dict):
        return None
    call_candidate = params.get("call") if isinstance(params.get("call"), dict) else None
    if call_candidate is None and "to" in params and "data" in params:
        call_candidate = params
    if not isinstance(call_candidate, dict):
        return None
    call = _normalize_call(call_candidate)
    to_address = call.get("to")
    data = call.get("data")
    if not isinstance(to_address, str) or not to_address:
        return None
    if not isinstance(data, str) or not data:
        return None
    return call


def _quantity_to_int(value: Any) -> int:
    if value is None:
        return 0
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        trimmed = value.strip()
        if not trimmed:
            return 0
        base = 16 if trimmed.startswith("0x") or trimmed.startswith("0X") else 10
        try:
            return int(trimmed, base)
        except ValueError:
            return 0
    if isinstance(value, Decimal):
        return int(value)
    if isinstance(value, bytes):
        return int.from_bytes(value, "big")
    return 0


def _requires_budget(plan: OrchestrationPlan) -> bool:
    """Return True if the plan contains an escrow/posting step."""

    for step in plan.steps:
        if step.kind != "chain":
            continue
        parts = [step.tool, step.id, step.name]
        normalized = " ".join(
            part.lower() for part in parts if isinstance(part, str) and part
        )
        if any(keyword in normalized for keyword in ("job.post", "post job", "post_job", "escrow")):
            return True
        if step.id and step.id.lower() in {"post", "post_job"}:
            return True
        if step.name and step.name.lower() in {"post", "post job"}:
            return True
    return False


def _decode_revert_reason(data: str | bytes | None) -> str | None:
    if data is None:
        return None
    if isinstance(data, str):
        text = data.strip()
        if text.startswith("0x") or text.startswith("0X"):
            text = text[2:]
        try:
            raw = bytes.fromhex(text)
        except ValueError:
            return None
    elif isinstance(data, bytes):
        raw = data
    else:
        return None
    if len(raw) < 4:
        return None
    selector = raw[:4]
    # Error(string)
    if selector == bytes.fromhex("08c379a0") and len(raw) >= 4 + 32 * 2:
        try:
            offset = int.from_bytes(raw[4:36], "big")
            if offset + 32 > len(raw):
                return None
            length = int.from_bytes(raw[36:68], "big")
            start = 68
            end = start + length
            if end > len(raw):
                return None
            return raw[start:end].decode("utf-8", errors="ignore")
        except Exception:  # pragma: no cover - defensive decoding
            return None
    # Panic(uint256)
    if selector == bytes.fromhex("4e487b71") and len(raw) >= 4 + 32:
        code = int.from_bytes(raw[4:36], "big")
        return f"Panic({hex(code)})"
    return None


def _extract_revert_details(error: JsonRpcError) -> Tuple[str | None, str | None]:
    data = error.data
    revert_message: str | None = None
    revert_data: str | None = None
    if isinstance(data, dict):
        message = data.get("message")
        if isinstance(message, str):
            parts = message.split(":", 1)
            if len(parts) == 2 and "execution reverted" in parts[0].lower():
                revert_message = parts[1].strip()
            else:
                revert_message = message.strip()
        payload = data.get("data")
        if isinstance(payload, dict):
            revert_data = payload.get("data") if isinstance(payload.get("data"), str) else None
        elif isinstance(payload, str):
            revert_data = payload
    elif isinstance(data, str):
        revert_data = data
    decoded = _decode_revert_reason(revert_data) if revert_data else None
    return decoded or revert_message, revert_data


def _classify_revert(reason: str | None) -> str:
    if not reason:
        return "UNKNOWN_REVERT"
    lowered = reason.lower()
    if "allowance" in lowered:
        return "INSUFFICIENT_ALLOWANCE"
    if "balance" in lowered:
        return "INSUFFICIENT_BALANCE"
    if "ens" in lowered or "name" in lowered:
        return "ENS_MISMATCH"
    if "deadline" in lowered or "expired" in lowered:
        return "DEADLINE_INVALID"
    return "UNKNOWN_REVERT"


@lru_cache(maxsize=1)
def _load_org_policies() -> Dict[str, Dict[str, Any]]:
    try:
        with open(_ORG_POLICY_PATH, "r", encoding="utf-8") as handle:
            raw = handle.read()
    except FileNotFoundError:
        return {}
    except OSError:  # pragma: no cover - defensive I/O handling
        return {}
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    if not isinstance(data, dict):
        return {}
    policies: Dict[str, Dict[str, Any]] = {}
    for key, value in data.items():
        if not isinstance(value, dict):
            continue
        record: Dict[str, Any] = {}
        max_budget = value.get("maxBudgetWei")
        if isinstance(max_budget, str):
            try:
                record["maxBudgetWei"] = int(max_budget, 10)
            except ValueError:
                pass
        elif isinstance(max_budget, int):
            record["maxBudgetWei"] = max_budget
        max_duration = value.get("maxDurationDays")
        if isinstance(max_duration, int) and max_duration > 0:
            record["maxDurationDays"] = max_duration
        updated_at = value.get("updatedAt")
        if isinstance(updated_at, str):
            record["updatedAt"] = updated_at
        policies[key] = record
    return policies


def _resolve_tenant(plan: OrchestrationPlan) -> str | None:
    policy_fields = ("orgId", "organizationId", "tenantId", "teamId", "userId")
    for field in policy_fields:
        value = getattr(plan.policies, field, None)
        if isinstance(value, str) and value.strip():
            return value.strip()
    metadata = plan.metadata if isinstance(plan.metadata, dict) else {}
    for field in policy_fields:
        value = metadata.get(field)
        if isinstance(value, str) and value.strip():
            return value.strip()
    context = metadata.get("userContext") if isinstance(metadata.get("userContext"), dict) else None
    if isinstance(context, dict):
        for field in policy_fields:
            value = context.get(field)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return None


def _decimal_to_wei(value: Decimal) -> int:
    quantized = (value * Decimal(10**18)).to_integral_value(rounding=ROUND_HALF_UP)
    return int(quantized)


def _resolve_deadline_days(plan: OrchestrationPlan) -> int | None:
    metadata = plan.metadata if isinstance(plan.metadata, dict) else {}
    deadline_candidate = metadata.get("deadlineDays") or metadata.get("deadline_days")
    if isinstance(deadline_candidate, (int, float)):
        return int(deadline_candidate)
    if isinstance(deadline_candidate, str):
        trimmed = deadline_candidate.strip()
        if trimmed:
            try:
                return int(trimmed, 10)
            except ValueError:
                pass
    for step in plan.steps:
        params = getattr(step, "params", {}) or {}
        if not isinstance(params, dict):
            continue
        for key in ("deadlineDays", "deadline", "deadline_days"):
            candidate = params.get(key)
            if isinstance(candidate, (int, float)):
                return int(candidate)
            if isinstance(candidate, str):
                trimmed = candidate.strip()
                if trimmed:
                    try:
                        return int(trimmed, 10)
                    except ValueError:
                        continue
    return None


def _enforce_org_policy(
    plan: OrchestrationPlan,
    planned_budget: Decimal,
    risks: List[str],
    risk_details: List[Dict[str, str]],
    blockers: List[str],
) -> Dict[str, Any]:
    policies = _load_org_policies()
    if not policies:
        return {}
    tenant = _resolve_tenant(plan)
    record = None
    if tenant and tenant in policies:
        record = policies[tenant]
    if record is None:
        record = policies.get("__default__")
    if not record:
        return {}
    policy_info: Dict[str, Any] = dict(record)
    if tenant:
        policy_info["tenant"] = tenant

    max_budget = record.get("maxBudgetWei")
    if isinstance(max_budget, int) and max_budget > 0:
        budget_wei = _decimal_to_wei(planned_budget)
        if budget_wei > max_budget:
            _append_risk(risks, risk_details, "JOB_BUDGET_CAP_EXCEEDED")
            _append_blocker(blockers, "JOB_BUDGET_CAP_EXCEEDED")
    max_duration = record.get("maxDurationDays")
    if isinstance(max_duration, int) and max_duration > 0:
        deadline_days = _resolve_deadline_days(plan)
        if deadline_days and deadline_days > max_duration:
            _append_risk(risks, risk_details, "JOB_DEADLINE_CAP_EXCEEDED")
            _append_blocker(blockers, "JOB_DEADLINE_CAP_EXCEEDED")
    return policy_info


def _simulate_chain_steps(
    plan: OrchestrationPlan,
    risks: List[str],
    risk_details: List[Dict[str, str]],
    blockers: List[str],
) -> Tuple[List[Dict[str, Any]], int, int]:
    chain_calls: List[Dict[str, Any]] = []
    total_gas = 0
    total_fee = 0

    for step in plan.steps:
        if step.kind != "chain":
            continue
        call = _extract_call(step)
        if call is None:
            chain_calls.append(
                {
                    "step_id": step.id,
                    "tool": step.tool,
                    "status": "skipped",
                    "error": "CALL_DATA_MISSING",
                }
            )
            continue

        step_result: Dict[str, Any] = {
            "step_id": step.id,
            "tool": step.tool,
            "call": {
                key: call.get(key)
                for key in ("to", "from", "data", "value", "gas", "gasPrice", "maxFeePerGas", "maxPriorityFeePerGas")
                if call.get(key) is not None
            },
        }

        try:
            gas_hex = _rpc_request("eth_estimateGas", [call])
            gas_estimate = _quantity_to_int(gas_hex)
        except JsonRpcError as exc:
            reason, revert_data = _extract_revert_details(exc)
            code = _classify_revert(reason)
            friendly = _RISK_GUIDANCE.get(code)
            message = friendly
            if reason and friendly:
                message = f"{friendly} (Revert: {reason})"
            elif reason:
                message = reason
            _append_risk(risks, risk_details, code, message_override=message)
            _append_blocker(blockers, code)
            step_result.update(
                {
                    "status": "error",
                    "error": exc.args[0] if exc.args else "execution reverted",
                    "revert_reason": reason,
                    "revert_data": revert_data,
                }
            )
            chain_calls.append(step_result)
            continue
        except RpcTransportError as exc:
            friendly = _RISK_GUIDANCE.get("RPC_TIMEOUT")
            detail = str(exc)
            message = friendly
            if detail and friendly:
                message = f"{friendly} ({detail})"
            elif detail:
                message = detail
            _append_risk(risks, risk_details, "RPC_TIMEOUT", message_override=message)
            _append_blocker(blockers, "RPC_TIMEOUT")
            step_result.update({"status": "error", "error": str(exc) or "RPC_TIMEOUT"})
            chain_calls.append(step_result)
            break
        except Exception as exc:  # pragma: no cover - defensive catch-all
            friendly = _RISK_GUIDANCE.get("UNKNOWN_REVERT")
            message = friendly
            detail = str(exc)
            if detail and friendly:
                message = f"{friendly} ({detail})"
            elif detail:
                message = detail
            _append_risk(risks, risk_details, "UNKNOWN_REVERT", message_override=message)
            _append_blocker(blockers, "UNKNOWN_REVERT")
            step_result.update({"status": "error", "error": str(exc)})
            chain_calls.append(step_result)
            continue

        step_result["gas_estimate"] = hex(gas_estimate) if gas_estimate else "0x0"
        step_result["gas_estimate_int"] = str(gas_estimate)
        total_gas += gas_estimate

        gas_price = _quantity_to_int(call.get("gasPrice") or call.get("maxFeePerGas"))
        if gas_price == 0:
            try:
                gas_price_hex = _rpc_request("eth_gasPrice", [])
                gas_price = _quantity_to_int(gas_price_hex)
            except (JsonRpcError, RpcTransportError):
                gas_price = 0
        step_result["gas_price"] = hex(gas_price) if gas_price else None

        step_fee = gas_estimate * gas_price if gas_price else 0
        step_result["fee_wei"] = str(step_fee) if step_fee else None
        total_fee += step_fee

        try:
            call_result = _rpc_request("eth_call", [call, "latest"])
        except JsonRpcError as exc:
            reason, revert_data = _extract_revert_details(exc)
            code = _classify_revert(reason)
            friendly = _RISK_GUIDANCE.get(code)
            message = friendly
            if reason and friendly:
                message = f"{friendly} (Revert: {reason})"
            elif reason:
                message = reason
            _append_risk(risks, risk_details, code, message_override=message)
            _append_blocker(blockers, code)
            step_result.update(
                {
                    "status": "error",
                    "error": exc.args[0] if exc.args else "execution reverted",
                    "revert_reason": reason,
                    "revert_data": revert_data,
                }
            )
        except RpcTransportError as exc:
            friendly = _RISK_GUIDANCE.get("RPC_TIMEOUT")
            detail = str(exc)
            message = friendly
            if detail and friendly:
                message = f"{friendly} ({detail})"
            elif detail:
                message = detail
            _append_risk(risks, risk_details, "RPC_TIMEOUT", message_override=message)
            _append_blocker(blockers, "RPC_TIMEOUT")
            step_result.update({"status": "error", "error": str(exc) or "RPC_TIMEOUT"})
        else:
            step_result["status"] = "ok"
            step_result["result"] = call_result

        chain_calls.append(step_result)

    return chain_calls, total_gas, total_fee


def simulate_plan(plan: OrchestrationPlan) -> SimOut:
    """Return budget/time estimates and guardrail feedback."""

    total_budget, total_fees = _estimate_budget(plan)
    needs_budget = _requires_budget(plan)

    if needs_budget:
        confirmations = [
            (
                f"You’ll escrow {format(total_budget, 'f')} {plan.budget.token} "
                f"(fee {FEE_PERCENT_LABEL}, burn {BURN_PERCENT_LABEL})."
            ),
        ]
    else:
        confirmations = ["No escrow required for this plan."]
    if plan.policies.requireValidator:
        confirmations.append("This plan requires validator quorum (3 validators).")

    risks: List[str] = []
    risk_details: List[Dict[str, str]] = []
    blockers: List[str] = []

    planned_budget = _safe_decimal(plan.budget.max)
    if planned_budget <= 0 and needs_budget:
        _append_risk(risks, risk_details, "BUDGET_REQUIRED")
        _append_blocker(blockers, "BUDGET_REQUIRED")

    budget_cap = _safe_decimal(plan.budget.cap)
    if budget_cap > 0 and planned_budget > budget_cap:
        _append_risk(risks, risk_details, "OVER_BUDGET")
        _append_blocker(blockers, "OVER_BUDGET")

    chain_calls, total_gas, total_fee_native = _simulate_chain_steps(plan, risks, risk_details, blockers)
    if chain_calls:
        confirmations.append(
            "Simulated {count} chain step(s); estimated gas {gas}.".format(
                count=len(chain_calls), gas=total_gas
            )
        )
    network_fee_eth_str: str | None = None
    if total_fee_native > 0:
        fee_eth = Decimal(total_fee_native) / Decimal(10**18)
        normalized_fee = fee_eth.normalize()
        network_fee_eth_str = format(normalized_fee, "f")
        confirmations.append(
            f"Estimated on-chain network fee ≈ {network_fee_eth_str} ETH (non-custodial)."
        )

    policy_info = _enforce_org_policy(plan, planned_budget, risks, risk_details, blockers)

    base_reward = Decimal("0")
    protocol_fee = Decimal("0")
    burn_fee = Decimal("0")
    if total_budget > 0:
        base_reward = (total_budget / _TOTAL_MULTIPLIER).quantize(Decimal("0.01"))
        protocol_fee = (base_reward * FEE_FRACTION).quantize(Decimal("0.01"))
        burn_fee = (base_reward * BURN_FRACTION).quantize(Decimal("0.01"))

    fee_breakdown = {
        "reward": format(base_reward, "f"),
        "protocol_fee": format(protocol_fee, "f"),
        "burn_fee": format(burn_fee, "f"),
        "total_budget": format(total_budget, "f"),
        "est_fees": format(total_fees, "f"),
    }
    if total_fee_native > 0:
        fee_breakdown["network_fee_wei"] = str(total_fee_native)
        if network_fee_eth_str is not None:
            fee_breakdown["network_fee_eth"] = network_fee_eth_str

    return SimOut(
        est_budget=format(total_budget, "f"),
        est_fees=format(total_fees, "f"),
        est_duration=48,
        risks=risks,
        confirmations=confirmations,
        blockers=blockers,
        chain_calls=chain_calls,
        total_gas_estimate=str(total_gas) if total_gas else None,
        total_fee_wei=str(total_fee_native) if total_fee_native else None,
        fee_breakdown=fee_breakdown,
        risk_details=risk_details,
        policy=policy_info,
    )

