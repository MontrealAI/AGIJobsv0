"""Lightweight JSON-RPC client for ERC-4337 bundlers."""

from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional

import httpx


class BundlerError(RuntimeError):
    """Raised when the bundler RPC returns an error."""

    def __init__(self, message: str, *, code: Optional[int] = None, simulation: bool = False):
        super().__init__(message)
        self.code = code
        self.is_simulation_error = simulation


@dataclass
class BundlerOptions:
    """Polling configuration when waiting for receipts."""

    poll_interval: float = 2.0
    timeout: float = 120.0


def _detect_simulation_error(error: Dict[str, Any]) -> bool:
    """Best-effort detection of simulation failures from bundler error payloads."""

    message = str(error.get("message") or "").lower()
    if "simulation" in message or "failedop" in message:
        return True
    code = error.get("code")
    if isinstance(code, int) and code in {-32500, -32501, -32603}:
        return True
    data = error.get("data")
    if isinstance(data, dict):
        err_text = str(data.get("error") or data.get("cause") or "").lower()
        if "simulation" in err_text:
            return True
        if "failedOp" in json.dumps(data):
            return True
    return False


class BundlerClient:
    """Minimal async JSON-RPC client used by the AA executor."""

    def __init__(
        self,
        url: str,
        *,
        entry_point: str,
        headers: Optional[Dict[str, str]] = None,
        timeout: float = 30.0,
    ) -> None:
        self._url = url
        self._entry_point = entry_point
        self._headers = headers or {}
        self._timeout = timeout

    async def _rpc(self, method: str, params: list[Any]) -> Any:
        payload = {"jsonrpc": "2.0", "id": int(time.time() * 1000), "method": method, "params": params}
        async with httpx.AsyncClient(timeout=self._timeout, headers=self._headers) as client:
            response = await client.post(self._url, json=payload)
        if response.status_code >= 400:
            raise BundlerError(
                f"Bundler responded with HTTP {response.status_code}",
                code=response.status_code,
            )
        data = response.json()
        if "error" in data:
            error = data["error"] or {}
            raise BundlerError(
                str(error.get("message") or "Bundler error"),
                code=error.get("code"),
                simulation=_detect_simulation_error(error),
            )
        return data.get("result")

    async def send_user_operation(self, user_op: Dict[str, Any]) -> str:
        """Submit a UserOperation to the bundler and return the resulting hash."""

        result = await self._rpc("eth_sendUserOperation", [user_op, self._entry_point])
        if not isinstance(result, str):
            raise BundlerError("Bundler returned an invalid userOp hash")
        return result

    async def get_user_operation_receipt(self, user_op_hash: str) -> Optional[Dict[str, Any]]:
        """Return the on-chain receipt for the given user operation hash."""

        result = await self._rpc("eth_getUserOperationReceipt", [user_op_hash])
        if result is None:
            return None
        if not isinstance(result, dict):
            raise BundlerError("Bundler returned an invalid receipt payload")
        return result

    async def wait_for_receipt(
        self,
        user_op_hash: str,
        *,
        options: Optional[BundlerOptions] = None,
    ) -> Optional[Dict[str, Any]]:
        """Poll the bundler until a receipt is available or timeout elapses."""

        opts = options or BundlerOptions()
        deadline = time.monotonic() + opts.timeout
        while True:
            receipt = await self.get_user_operation_receipt(user_op_hash)
            if receipt is not None:
                return receipt
            if time.monotonic() >= deadline:
                return None
            await asyncio.sleep(opts.poll_interval)
