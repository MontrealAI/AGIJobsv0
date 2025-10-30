"""Blockchain connectivity primitives."""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict, Optional

from web3 import Web3
from web3.contract.contract import Contract

try:
    from ens import ENS  # type: ignore
except ImportError:  # pragma: no cover - optional dependency resolved at runtime
    ENS = None

from ..config import AlphaNodeConfig, ContractConfig, resolve_contract_path

LOGGER = logging.getLogger(__name__)


class BlockchainClient:
    """A thin wrapper around Web3 with convenience helpers."""

    def __init__(self, config: AlphaNodeConfig, base_path: Path) -> None:
        self.config = config
        self._base_path = base_path
        self.web3 = Web3(Web3.HTTPProvider(config.rpc_url, request_kwargs={"timeout": 30}))
        if ENS is not None:
            self.web3.ens = ENS.from_web3(self.web3)
        LOGGER.debug("Blockchain client initialized for %s", config.rpc_url)

    def ensure_connection(self) -> None:
        if not self.web3.is_connected():
            raise ConnectionError(f"Unable to connect to RPC endpoint {self.config.rpc_url}")

    def get_contract(self, name: str) -> Contract:
        contract_config = self.config.contracts[name]
        abi_path = resolve_contract_path(self._base_path, contract_config)
        with abi_path.open("r", encoding="utf-8") as handle:
            abi = json.load(handle)
        return self.web3.eth.contract(address=Web3.to_checksum_address(contract_config.address), abi=abi)

    def get_contract_from_config(self, contract: ContractConfig) -> Contract:
        abi_path = resolve_contract_path(self._base_path, contract)
        with abi_path.open("r", encoding="utf-8") as handle:
            abi = json.load(handle)
        return self.web3.eth.contract(address=Web3.to_checksum_address(contract.address), abi=abi)

    def ens_owner(self, domain: str) -> Optional[str]:
        if getattr(self.web3, "ens", None) is None:
            LOGGER.warning("ENS support unavailable in this environment")
            return None
        try:
            owner = self.web3.ens.address(domain)
        except Exception as exc:  # pragma: no cover - depends on RPC support
            LOGGER.error("Failed to resolve ENS %s: %s", domain, exc)
            return None
        return owner.lower() if owner else None

    def call(self, contract: Contract, function_name: str, *args: Any, **kwargs: Any) -> Any:
        function = getattr(contract.functions, function_name)
        return function(*args, **kwargs).call()

    def transact(self, contract: Contract, function_name: str, tx_options: Dict[str, Any], *args: Any, **kwargs: Any) -> str:
        function = getattr(contract.functions, function_name)
        tx = function(*args, **kwargs).build_transaction(tx_options)
        tx_hash = self.web3.eth.send_transaction(tx)
        return tx_hash.hex()


class MockBlockchainClient(BlockchainClient):
    """A deterministic, in-memory blockchain client used for tests and demos."""

    def __init__(self, config: AlphaNodeConfig, base_path: Path, state: Optional[Dict[str, Any]] = None) -> None:
        self.config = config
        self._base_path = base_path
        self.web3 = Web3()
        self.state = state or {
            "ens": {config.ens_domain: config.operator_address},
            "stake": {config.operator_address: int(config.minimum_stake) + 100},
            "paused": False,
            "jobs": [],
        }

    def ensure_connection(self) -> None:  # pragma: no cover - always connected
        return

    def get_contract(self, name: str) -> Contract:  # pragma: no cover - not needed for mock
        raise NotImplementedError("Mock client uses in-memory state and does not expose contract handles")

    def get_contract_from_config(self, contract: ContractConfig) -> Contract:  # pragma: no cover
        raise NotImplementedError

    def ens_owner(self, domain: str) -> Optional[str]:
        return self.state["ens"].get(domain)

    def call(self, contract: Contract, function_name: str, *args: Any, **kwargs: Any) -> Any:  # pragma: no cover
        raise NotImplementedError

    def transact(self, contract: Contract, function_name: str, tx_options: Dict[str, Any], *args: Any, **kwargs: Any) -> str:  # pragma: no cover
        raise NotImplementedError

    # Convenience helpers used by other modules
    def get_stake(self, address: str) -> int:
        return int(self.state["stake"].get(address, 0))

    def set_stake(self, address: str, value: int) -> None:
        self.state.setdefault("stake", {})[address] = value

    def is_paused(self) -> bool:
        return bool(self.state.get("paused", False))

    def set_paused(self, paused: bool) -> None:
        self.state["paused"] = paused

    def list_jobs(self) -> list:
        return list(self.state.get("jobs", []))

    def add_job(self, job: Dict[str, Any]) -> None:
        self.state.setdefault("jobs", []).append(job)
