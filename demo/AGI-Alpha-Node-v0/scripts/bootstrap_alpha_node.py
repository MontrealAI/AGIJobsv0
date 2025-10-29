"""Interactive bootstrap helper for the AGI Alpha Node demo."""

from __future__ import annotations

import json
from pathlib import Path

from rich.console import Console
from rich.prompt import Confirm, Prompt

from agi_alpha_node_demo.config import load_config
from agi_alpha_node_demo.utils import write_yaml

CONSOLE = Console()


def run(config_path: Path) -> None:
    config = load_config(config_path)
    CONSOLE.print("[bold green]AGI Alpha Node Bootstrap Wizard[/bold green]")
    ens_domain = Prompt.ask("ENS domain", default=config.operator.ens_domain)
    owner = Prompt.ask("Owner address", default=config.operator.owner_address)
    governance = Prompt.ask("Governance address", default=config.operator.governance_address)
    stake = Prompt.ask("Current stake", default=str(config.staking.current_stake))
    config.operator.ens_domain = ens_domain
    config.operator.owner_address = owner
    config.operator.governance_address = governance
    config.staking.current_stake = type(config.staking.current_stake)(stake)
    data = json.loads(json.dumps(config, default=lambda o: getattr(o, "__dict__", str(o))))
    write_yaml(config_path, data)
    if Confirm.ask("Run non-interactive bootstrap now?"):
        from agi_alpha_node_demo.cli import cli

        cli.main(["--config", str(config_path), "bootstrap", "--non-interactive"])


if __name__ == "__main__":
    run(Path("./config.example.yaml"))
