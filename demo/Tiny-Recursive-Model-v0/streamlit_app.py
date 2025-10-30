"""Streamlit interface for the Tiny Recursive Model demo."""
from __future__ import annotations

from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
import plotly.express as px
import streamlit as st

from trm_demo.config import DemoSettings, load_settings
from trm_demo.engine import TrmEngine
from trm_demo.ledger import EconomicLedger
from trm_demo.sentinel import Sentinel
from trm_demo.simulation import run_simulation
from trm_demo.thermostat import Thermostat

BASE_DIR = Path(__file__).resolve().parent


@st.cache_resource(show_spinner=False)
def _load_engine(settings: DemoSettings) -> TrmEngine:
    engine = TrmEngine(settings)
    checkpoint = engine._resolve_path(settings.training.checkpoint_path)
    if checkpoint.exists():
        engine.load_checkpoint(checkpoint)
    return engine


def _settings(path: Optional[Path]) -> DemoSettings:
    config_path = path or (BASE_DIR / "config" / "default_trm_config.yaml")
    return load_settings(config_path)


def main() -> None:
    st.set_page_config(page_title="Tiny Recursive Model Demo", layout="wide")
    st.title("🎖️ Tiny Recursive Model Demo — Powered by AGI Jobs v0 (v2)")
    st.markdown(
        """
        This console shows how a non-technical operator can orchestrate a recursive reasoning
        system with full economic control. Adjust the sliders, then click *Run Simulation*
        to compare TRM against baseline strategies.
        """
    )

    config_file = st.sidebar.text_input(
        "Config path (optional)", value=str(BASE_DIR / "config" / "default_trm_config.yaml")
    )
    settings = _settings(Path(config_file))

    st.sidebar.subheader("Thermostat Overrides")
    inner_steps = st.sidebar.slider(
        "Inner recursions", settings.thermostat.min_inner_steps, settings.thermostat.max_inner_steps, settings.trm.max_inner_steps
    )
    outer_steps = st.sidebar.slider(
        "Outer improvement steps", settings.thermostat.min_outer_steps, settings.thermostat.max_outer_steps, settings.trm.max_outer_steps
    )
    halt_threshold = st.sidebar.slider(
        "Halting threshold", float(settings.thermostat.halt_threshold_bounds[0]), float(settings.thermostat.halt_threshold_bounds[1]), float(settings.trm.halt_threshold)
    )
    trials = st.sidebar.slider("Simulation trials", 32, 256, 128, step=32)
    seed = st.sidebar.number_input("Random seed", value=0)

    if st.sidebar.button("Run Simulation", type="primary"):
        engine = _load_engine(settings)
        ledger = EconomicLedger(
            default_success_value=settings.ledger.default_success_value,
            base_cost_per_call=settings.ledger.base_cost_per_call,
            cost_per_inner_step=settings.ledger.cost_per_inner_step,
            cost_per_outer_step=settings.ledger.cost_per_outer_step,
        )
        thermostat = Thermostat(settings.thermostat)
        thermostat.state.inner_steps = inner_steps
        thermostat.state.outer_steps = outer_steps
        thermostat.state.halt_threshold = halt_threshold
        sentinel = Sentinel(settings.sentinel)

        summary = run_simulation(
            engine=engine,
            thermostat=thermostat,
            sentinel=sentinel,
            ledger=ledger,
            settings=settings,
            trials=trials,
            seed=int(seed),
        )

        df = pd.DataFrame(
            [
                {
                    "Model": "Greedy Heuristic",
                    "Success Rate": summary.greedy.successes / max(summary.greedy.trials, 1),
                    "ROI": summary.greedy.roi(),
                    "Avg Latency (ms)": summary.greedy.avg_latency(),
                    "Total Cost": summary.greedy.total_cost,
                },
                {
                    "Model": "Large LLM",
                    "Success Rate": summary.llm.successes / max(summary.llm.trials, 1),
                    "ROI": summary.llm.roi(),
                    "Avg Latency (ms)": summary.llm.avg_latency(),
                    "Total Cost": summary.llm.total_cost,
                },
                {
                    "Model": "Tiny Recursive Model",
                    "Success Rate": summary.trm.successes / max(summary.trm.trials, 1),
                    "ROI": summary.trm.roi(),
                    "Avg Latency (ms)": summary.trm.avg_latency(),
                    "Total Cost": summary.trm.total_cost,
                },
            ]
        )
        st.subheader("ROI Comparison")
        st.dataframe(df.style.format({"Success Rate": "{:.1%}", "ROI": "{:.2f}", "Avg Latency (ms)": "{:.1f}", "Total Cost": "${:.4f}"}))

        st.subheader("Conversion Efficiency")
        chart = px.bar(df, x="Model", y="ROI", color="Model", text=df["ROI"].map(lambda v: f"{v:.2f}"))
        st.plotly_chart(chart, use_container_width=True)

        st.subheader("Thermostat Trajectory")
        trace_df = pd.DataFrame(
            summary.thermostat_trace,
            columns=["Inner Steps", "Outer Steps", "Halt Threshold"],
        )
        st.line_chart(trace_df)

        if summary.sentinel_triggered:
            st.error(f"Sentinel halted TRM: {summary.sentinel_reason}")
        else:
            st.success("Sentinel guardrails stable — full autonomy maintained.")
    else:
        st.info("Adjust parameters in the sidebar and click *Run Simulation* to see the system in action.")


if __name__ == "__main__":
    main()
