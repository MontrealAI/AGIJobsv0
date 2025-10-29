"""High-level orchestration entry point for the TRM demo."""

from __future__ import annotations

from pathlib import Path
import pandas as pd

from .config import DemoConfig
from .governance import EthereumLogger, GovernanceConsole
from .simulation import ConversionSimulation, SimulationReport
from .telemetry import TelemetryWriter


class TinyRecursiveDemoOrchestrator:
    """Composes configuration, simulation, and governance."""

    def __init__(self, config_path: Path | str) -> None:
        self.config_path = Path(config_path)
        self.config = DemoConfig.load(self.config_path)
        self.telemetry_writer = TelemetryWriter(
            self.config.telemetry.write_path, enabled=self.config.telemetry.enable_structured_logs
        )
        self.console = GovernanceConsole(self.config, self.telemetry_writer)
        self.ethereum_logger = EthereumLogger(self.config, self.telemetry_writer)
        self.simulation = ConversionSimulation.default(self.config)

    def run(self) -> SimulationReport:
        report = self.simulation.run(self.simulation.engine)
        self.ethereum_logger.emit_call(
            {
                "owner": self.config.owner.address,
                "roi": report.metrics["TRM"].roi,
                "gmv": report.metrics["TRM"].gmv,
            }
        )
        return report

    def update_owner_parameter(self, section: str, key: str, value) -> None:
        self.console.update(section, key, value)
        self.console.persist(self.config_path)

    def render_summary(self, report: SimulationReport) -> str:
        frame: pd.DataFrame = report.to_frame()
        return frame.to_markdown()


__all__ = ["TinyRecursiveDemoOrchestrator"]
