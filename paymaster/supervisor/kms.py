"""KMS client adapters for the paymaster supervisor."""

from __future__ import annotations

from typing import Dict, Optional

try:  # pragma: no cover - optional dependency
    from google.api_core.client_options import ClientOptions
    from google.cloud import kms_v1
except Exception:  # pragma: no cover - allow library-free installs
    ClientOptions = None  # type: ignore[assignment]
    kms_v1 = None  # type: ignore[assignment]


_DIGEST_FIELDS: Dict[str, str] = {
    "sha256": "sha256",
    "sha384": "sha384",
    "sha512": "sha512",
}


class GoogleKMSClient:
    """Async Google Cloud KMS client wrapper.

    Parameters
    ----------
    endpoint:
        Optional API endpoint override (e.g. ``us-east1-kms.googleapis.com``).
    """

    def __init__(self, *, endpoint: Optional[str] = None) -> None:
        if kms_v1 is None:  # pragma: no cover - depends on optional dependency
            raise RuntimeError("google-cloud-kms must be installed to use GoogleKMSClient")

        if endpoint and ClientOptions is None:  # pragma: no cover - depends on optional dependency
            raise RuntimeError("google-api-core must be installed to set a custom KMS endpoint")

        client_options = ClientOptions(api_endpoint=endpoint) if endpoint else None
        self._client = kms_v1.KeyManagementServiceAsyncClient(client_options=client_options)

    async def sign(self, *, key_id: str, message: bytes, digest: str) -> bytes:
        """Sign ``message`` (already hashed) with the specified key."""

        algo = digest.lower()
        field = _DIGEST_FIELDS.get(algo)
        if field is None:
            raise ValueError(f"Unsupported digest algorithm for Google KMS: {digest}")

        digest_message = {field: message}
        response = await self._client.asymmetric_sign(
            request={
                "name": key_id,
                "digest": kms_v1.Digest(**digest_message),
            }
        )
        return response.signature
