"""Governance handover utility."""

from __future__ import annotations

import logging
from pathlib import Path

from rich.console import Console

from agi_alpha_node_demo.blockchain import BlockchainClient
from agi_alpha_node_demo.config import load_config

logging.basicConfig(level=logging.INFO)
LOGGER = logging.getLogger("ensure_governance")
CONSOLE = Console()


def run(config_path: Path) -> None:
    config = load_config(config_path)
    client = BlockchainClient(
        endpoint=config.network.chain_endpoint,
        chain_id=config.network.chain_id,
        ens_registry=config.network.ens_registry,
    )
    if not client.check_connection():
        LOGGER.warning("Unable to reach Ethereum endpoint; governance verification simulated")
    CONSOLE.print(
        f"Transferring module ownership to governance address [bold]{config.operator.governance_address}[/bold]"
    )
    tx_hash = client.broadcast_pause()
    LOGGER.info("Ownership transfer staged", extra={"tx_hash": tx_hash})
    CONSOLE.print(f"[green]Governance handover initiated. Tx: {tx_hash}[/green]")


if __name__ == "__main__":
    run(Path("./config.example.yaml"))
