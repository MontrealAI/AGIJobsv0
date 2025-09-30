"""FastAPI application exposing the paymaster supervisor."""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import JSONResponse, Response

from .config import load_config
from .service import PaymasterSupervisor
from .signers import KMSSigner, LocalDebugSigner, Signer
from .kms import GoogleKMSClient


logger = logging.getLogger(__name__)


class SimpleBalanceFetcher:
    """In-memory balance fetcher useful for demos and testing."""

    def __init__(self, *, balance: int) -> None:
        self._balance = balance

    async def __call__(self, _address: str) -> int:
        return self._balance

    def set_balance(self, balance: int) -> None:
        self._balance = balance


def create_app(
    *,
    config_path: str | Path = Path("config/paymaster.yaml"),
    signer: Optional[Signer] = None,
    balance_fetcher: Optional[Any] = None,
) -> FastAPI:
    """Instantiate the FastAPI application with a live supervisor."""

    config = load_config(config_path)
    supervisor = PaymasterSupervisor(
        config_path=Path(config_path),
        signer=signer or _select_signer(),
        balance_fetcher=balance_fetcher or SimpleBalanceFetcher(balance=config.balance_threshold_wei * 2),
    )
    app = FastAPI(title="Paymaster Supervisor", version="0.1.0")

    @app.on_event("startup")
    async def _startup() -> None:  # pragma: no cover - exercised in integration tests
        await supervisor.start()

    @app.on_event("shutdown")
    async def _shutdown() -> None:  # pragma: no cover - exercised in integration tests
        await supervisor.close()

    async def get_supervisor() -> PaymasterSupervisor:
        return supervisor

    @app.get("/healthz")
    async def health(supervisor: PaymasterSupervisor = Depends(get_supervisor)) -> Dict[str, Any]:
        return await supervisor.health()

    @app.get("/readyz")
    async def ready(supervisor: PaymasterSupervisor = Depends(get_supervisor)) -> Dict[str, Any]:
        return await supervisor.health()

    @app.get("/metrics")
    async def metrics(supervisor: PaymasterSupervisor = Depends(get_supervisor)) -> Response:
        return Response(supervisor.metrics(), media_type=supervisor.metrics_content_type)

    @app.post("/v1/sponsor")
    async def sponsor(
        payload: Dict[str, Any],
        supervisor: PaymasterSupervisor = Depends(get_supervisor),
    ) -> JSONResponse:
        user_operation = payload.get("userOperation")
        context = payload.get("context")
        if not isinstance(user_operation, dict):
            raise HTTPException(status_code=400, detail="userOperation must be provided")
        try:
            result = await supervisor.sponsor(user_operation, context=context)
        except PermissionError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        return JSONResponse(result)

    return app


def _select_signer() -> Signer:
    """Return the signer implementation based on environment variables."""

    local_secret = os.getenv("PAYMASTER_LOCAL_SIGNER_SECRET")
    if local_secret:
        logger.info("Using local debug signer from PAYMASTER_LOCAL_SIGNER_SECRET override")
        return LocalDebugSigner(local_secret.encode("utf-8"))

    kms_key = os.getenv("PAYMASTER_KMS_KEY_URI")
    if kms_key:
        digest = os.getenv("PAYMASTER_KMS_DIGEST", "sha256")
        endpoint = os.getenv("PAYMASTER_KMS_ENDPOINT")
        region = os.getenv("PAYMASTER_KMS_REGION")
        if not endpoint and region:
            normalized_region = region.lower()
            endpoint = (
                "cloudkms.googleapis.com"
                if normalized_region == "global"
                else f"{region}-kms.googleapis.com"
            )
        try:
            client = GoogleKMSClient(endpoint=endpoint or None)
        except RuntimeError as exc:  # pragma: no cover - depends on optional dependency
            raise RuntimeError(
                "PAYMASTER_KMS_KEY_URI is set but google-cloud-kms is not installed"
            ) from exc
        logger.info("Using Google Cloud KMS signer", extra={"endpoint": endpoint, "digest": digest})
        return KMSSigner(client, key_id=kms_key, digest=digest)

    logger.warning("No PAYMASTER_KMS_KEY_URI provided; falling back to LocalDebugSigner")
    return LocalDebugSigner(b"debug")
