"""High level orchestrator for the Meta-Agentic α-AGI Jobs Prime demo."""
from __future__ import annotations

from dataclasses import dataclass, asdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Dict, Iterable, Optional
import json

from .config import MetaAgenticConfig, load_default_config
from .data_sources import Signal, load_sample_signals
from .phases import (
    ExecutionOrder,
    IdentifyPhase,
    IdentifyResult,
    LearnResult,
    OutDesignPhase,
    OutExecutePhase,
    OutLearnPhase,
    OutStrategisePhase,
    OutThinkPhase,
)


@dataclass(frozen=True)
class PhaseOutputs:
    identify: Optional[IdentifyResult] = None
    learn: Optional[LearnResult] = None
    think: Optional[tuple] = None
    design: Optional[tuple] = None
    strategise: Optional[tuple] = None
    execute: Optional[tuple[ExecutionOrder, ...]] = None

    def to_dict(self) -> Dict[str, Any]:
        def serialize(value: Any) -> Any:
            if value is None:
                return None
            if isinstance(value, (list, tuple)):
                return [serialize(item) for item in value]
            if isinstance(value, dict):
                return {key: serialize(val) for key, val in value.items()}
            if hasattr(value, "__dict__"):
                return {
                    key: serialize(val)
                    for key, val in value.__dict__.items()
                }
            if hasattr(value, "isoformat") and callable(value.isoformat):
                try:
                    return value.isoformat()
                except Exception:
                    pass
            return value

        return {
            "identify": serialize(self.identify),
            "learn": serialize(self.learn),
            "think": serialize(self.think),
            "design": serialize(self.design),
            "strategise": serialize(self.strategise),
            "execute": serialize(self.execute),
        }


@dataclass(frozen=True)
class ExecutionSummary:
    timestamp: datetime
    config_snapshot: Dict[str, Any]
    signals_processed: int
    phase_outputs: PhaseOutputs
    mermaid_diagram: str
    owner_controls: Dict[str, Any]

    def to_json(self) -> str:
        payload = {
            "timestamp": self.timestamp.isoformat(),
            "config_snapshot": self.config_snapshot,
            "signals_processed": self.signals_processed,
            "phase_outputs": self.phase_outputs.to_dict(),
            "mermaid_diagram": self.mermaid_diagram,
            "owner_controls": self.owner_controls,
        }
        return json.dumps(payload, indent=2)


class MetaAgenticPrimeOrchestrator:
    """Runs the entire Prime demo pipeline."""

    def __init__(
        self,
        *,
        cfg: Optional[MetaAgenticConfig] = None,
        signal_seed_path: Optional[Path] = None,
    ) -> None:
        self.cfg = cfg or load_default_config()
        base_dir = Path(__file__).resolve().parent
        self.signal_seed_path = signal_seed_path or base_dir / "data" / "sample_signals.json"
        self._validate_paths()

    def _validate_paths(self) -> None:
        if not Path(self.signal_seed_path).exists():
            raise FileNotFoundError(f"Signal seed file not found at {self.signal_seed_path}")

    def _load_signals(self) -> list[Signal]:
        return load_sample_signals(Path(self.signal_seed_path))

    def run(self) -> ExecutionSummary:
        self.cfg.validate()
        signals = self._load_signals()
        phases = PhaseOutputs()

        identify_phase = IdentifyPhase(self.cfg)
        identify_result = identify_phase.run(signals)
        phases = PhaseOutputs(identify=identify_result)

        learn_phase = OutLearnPhase(self.cfg)
        learn_result = learn_phase.run(identify_result)
        phases = PhaseOutputs(identify=identify_result, learn=learn_result)

        think_phase = OutThinkPhase(self.cfg)
        think_output = think_phase.run(learn_result)
        phases = PhaseOutputs(
            identify=identify_result,
            learn=learn_result,
            think=think_output,
        )

        design_phase = OutDesignPhase(self.cfg)
        design_output = design_phase.run(think_output)
        phases = PhaseOutputs(
            identify=identify_result,
            learn=learn_result,
            think=think_output,
            design=design_output,
        )

        strategise_phase = OutStrategisePhase(self.cfg)
        strategise_output = strategise_phase.run(design_output)
        phases = PhaseOutputs(
            identify=identify_result,
            learn=learn_result,
            think=think_output,
            design=design_output,
            strategise=strategise_output,
        )

        execute_phase = OutExecutePhase(self.cfg)
        execute_output = execute_phase.run(strategise_output)
        phases = PhaseOutputs(
            identify=identify_result,
            learn=learn_result,
            think=think_output,
            design=design_output,
            strategise=strategise_output,
            execute=execute_output,
        )

        summary = ExecutionSummary(
            timestamp=datetime.now(UTC),
            config_snapshot=self.cfg.to_dict(),
            signals_processed=len(signals),
            phase_outputs=phases,
            mermaid_diagram=self._build_mermaid_diagram(execute_output),
            owner_controls=asdict(self.cfg.owner),
        )
        return summary

    def _build_mermaid_diagram(self, orders: Iterable[ExecutionOrder]) -> str:
        nodes = [
            "flowchart TD",
            "    A[Identify Opportunities] --> B[Out-Learn Curriculum]",
            "    B --> C[Out-Think Planner]",
            "    C --> D[Out-Design Blueprint]",
            "    D --> E[Out-Strategise Portfolio]",
            "    E --> F[Out-Execute Autonomy]",
        ]
        for idx, order in enumerate(orders, start=1):
            strategy = order.strategy
            nodes.append(
                f"    F --> F{idx}{{{strategy.design.plan.opportunity.domain.title()} Initiative}}"
            )
            nodes.append(
                f"    F{idx} -->|Actions| G{idx}[{'; '.join(order.actions)}]"
            )
        return "\n".join(nodes)

    def save_report(self, summary: ExecutionSummary, *, destination: Path) -> None:
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(summary.to_json())


def run_demo(*, destination: Optional[Path] = None, overrides: Optional[dict] = None) -> ExecutionSummary:
    """Convenience function used by CLI entry points and tests."""
    cfg = load_default_config(overrides)
    orchestrator = MetaAgenticPrimeOrchestrator(cfg=cfg)
    summary = orchestrator.run()
    if destination:
        orchestrator.save_report(summary, destination=destination)
    return summary

