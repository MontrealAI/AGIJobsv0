"""Web3 client factory and helpers."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Dict, Optional

from web3 import HTTPProvider, Web3
from web3.middleware import geth_poa_middleware

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class Web3Config:
    rpc_url: str
    chain_id: int
    enable_poa: bool = False
    request_kwargs: Optional[Dict[str, Any]] = None


def get_web3(config: Web3Config) -> Web3:
    logger.debug("Initialising Web3 client", extra={"rpc_url": config.rpc_url, "chain_id": config.chain_id})
    provider = HTTPProvider(config.rpc_url, request_kwargs=config.request_kwargs)
    web3 = Web3(provider)
    if config.enable_poa:
        web3.middleware_onion.inject(geth_poa_middleware, layer=0)
    is_connected = getattr(web3, "is_connected", None)
    if callable(is_connected):
        connected = is_connected()
    else:  # pragma: no cover - compatibility
        connected = web3.isConnected()
    if not connected:  # pragma: no cover - defensive
        raise ConnectionError(f"Failed to connect to RPC endpoint: {config.rpc_url}")
    chain_id = web3.eth.chain_id
    if chain_id != config.chain_id:
        raise RuntimeError(f"Chain ID mismatch: expected {config.chain_id} got {chain_id}")
    return web3


__all__ = ["Web3Config", "get_web3"]
