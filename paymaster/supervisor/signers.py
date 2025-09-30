"""Signer interfaces for the paymaster supervisor."""

from __future__ import annotations

import asyncio
import hashlib
from typing import Any, Protocol


class Signer(Protocol):
    """Protocol for objects capable of signing sponsorship payloads."""

    async def sign_user_operation(self, message: bytes) -> bytes:  # pragma: no cover - protocol
        """Sign the supplied message and return the raw signature bytes."""


class KmsClient(Protocol):  # pragma: no cover - protocol
    """Subset of methods required from an external KMS/HSM client."""

    async def sign(self, *, key_id: str, message: bytes, digest: str) -> bytes:
        """Sign the provided digest using ``key_id`` and return the raw signature."""


class KMSSigner:
    """KMS-backed signer that delegates to a remote key manager."""

    def __init__(self, client: KmsClient, *, key_id: str, digest: str = "sha256") -> None:
        self._client = client
        self._key_id = key_id
        self._digest = digest

    async def sign_user_operation(self, message: bytes) -> bytes:
        """Request the remote HSM to sign the message."""

        return await self._client.sign(
            key_id=self._key_id,
            message=message,
            digest=self._digest.lower(),
        )


class LocalDebugSigner:
    """Deterministic signer used during development and testing."""

    def __init__(self, secret: bytes) -> None:
        self._secret = secret

    async def sign_user_operation(self, message: bytes) -> bytes:
        digest = hashlib.sha256(self._secret + message).digest()
        # mimic async interface
        await asyncio.sleep(0)
        return digest


def sponsorship_digest(user_operation: dict[str, Any], *, chain_id: int, paymaster: str) -> bytes:
    """Return a stable digest for user operations that we feed to signers."""

    payload = {
        "chainId": chain_id,
        "paymaster": paymaster,
        "userOperation": user_operation,
    }
    serialized = repr(sorted(payload.items())).encode("utf-8")
    return hashlib.sha256(serialized).digest()
