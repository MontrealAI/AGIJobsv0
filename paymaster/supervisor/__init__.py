"""Paymaster supervisor service."""

from .config import PaymasterConfig, load_config
from .service import PaymasterSupervisor

try:  # pragma: no cover - optional dependency
    from .process import create_app
except Exception:  # pragma: no cover - fallback when FastAPI unavailable
    def create_app(*_args, **_kwargs):  # type: ignore[override]
        raise RuntimeError("FastAPI must be installed to create the supervisor app")

__all__ = ["PaymasterConfig", "PaymasterSupervisor", "load_config", "create_app"]
