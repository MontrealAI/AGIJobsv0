"""Client for managed ERC-4337 paymasters."""

from __future__ import annotations

import json
from typing import Any, Dict, Optional

import httpx


class PaymasterError(RuntimeError):
    """Raised when the paymaster rejects a sponsorship request."""

    def __init__(self, message: str, *, code: Optional[int] = None):
        super().__init__(message)
        self.code = code


class PaymasterClient:
    """Client for the in-house paymaster supervisor."""

    def __init__(
        self,
        url: str,
        *,
        api_key: Optional[str] = None,
        headers: Optional[Dict[str, str]] = None,
        timeout: float = 30.0,
        context: Optional[Dict[str, Any]] = None,
    ) -> None:
        self._url = url
        self._api_key = api_key
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
        request_payload = {"userOperation": user_op, "context": payload_context}
        headers = dict(self._headers)
        if self._api_key:
            headers.setdefault("Authorization", f"Bearer {self._api_key}")
        url = self._url.rstrip("/") + "/v1/sponsor"
        async with httpx.AsyncClient(timeout=self._timeout, headers=headers) as client:
            response = await client.post(url, json=request_payload)
        try:
            data = response.json()
        except json.JSONDecodeError as exc:  # pragma: no cover - defensive
            data = None
        if response.status_code >= 400:
            detail: Any = None
            if isinstance(data, dict):
                detail = data.get("detail") or data.get("error")
            message = str(detail) if detail else f"Paymaster HTTP {response.status_code}"
            raise PaymasterError(message, code=response.status_code)
        if data is None:
            raise PaymasterError("Invalid paymaster response")
        if not isinstance(data, dict):
            raise PaymasterError("Paymaster returned an invalid sponsorship payload")
        return data
