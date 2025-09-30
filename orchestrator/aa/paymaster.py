"""Client for managed ERC-4337 paymasters."""

from __future__ import annotations

import json
import time
from typing import Any, Dict, Optional

import httpx


class PaymasterError(RuntimeError):
    """Raised when the paymaster rejects a sponsorship request."""

    def __init__(self, message: str, *, code: Optional[int] = None):
        super().__init__(message)
        self.code = code


class PaymasterClient:
    """Minimal async client for requesting user operation sponsorship."""

    def __init__(
        self,
        url: str,
        *,
        api_key: Optional[str] = None,
        method: str = "pm_sponsorUserOperation",
        headers: Optional[Dict[str, str]] = None,
        timeout: float = 30.0,
        context: Optional[Dict[str, Any]] = None,
    ) -> None:
        self._url = url
        self._api_key = api_key
        self._method = method
        self._headers = headers or {}
        self._timeout = timeout
        self._base_context = context or {}

    async def sponsor_user_operation(
        self,
        user_op: Dict[str, Any],
        *,
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        payload_context = {**self._base_context, **(context or {})}
        request_payload = {
            "jsonrpc": "2.0",
            "id": int(time.time() * 1000),
            "method": self._method,
            "params": [{"userOperation": user_op, "sponsorContext": payload_context}],
        }
        headers = dict(self._headers)
        if self._api_key:
            headers.setdefault("Authorization", f"Bearer {self._api_key}")
        async with httpx.AsyncClient(timeout=self._timeout, headers=headers) as client:
            response = await client.post(self._url, json=request_payload)
        if response.status_code >= 400:
            raise PaymasterError(f"Paymaster HTTP {response.status_code}", code=response.status_code)
        try:
            data = response.json()
        except json.JSONDecodeError as exc:  # pragma: no cover - defensive
            raise PaymasterError("Invalid paymaster response") from exc
        if "error" in data:
            error = data["error"] or {}
            raise PaymasterError(str(error.get("message") or "Paymaster error"), code=error.get("code"))
        result = data.get("result")
        if not isinstance(result, dict):
            raise PaymasterError("Paymaster returned an invalid sponsorship payload")
        return result
