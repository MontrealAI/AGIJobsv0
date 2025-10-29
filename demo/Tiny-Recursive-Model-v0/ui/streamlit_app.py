"""Streamlit control centre for the Tiny Recursive Model demo."""

from __future__ import annotations

import sys
from pathlib import Path

import plotly.graph_objects as go
import streamlit as st

CURRENT_DIR = Path(__file__).resolve().parents[1]
SRC_DIR = CURRENT_DIR / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from tiny_recursive_model_v0.orchestrator import TinyRecursiveDemoOrchestrator

CONFIG_PATH = CURRENT_DIR / "config" / "trm_demo_config.yaml"


def _roi_gauge(value: float, target: float) -> go.Figure:
    return go.Figure(
        go.Indicator(
            mode="gauge+number+delta",
            value=value,
            delta={"reference": target},
            gauge={
                "axis": {"range": [0, max(target * 1.5, value + 1e-3)]},
                "bar": {"color": "#8A2BE2"},
            },
            title={"text": "ROI"},
        )
    )


def _load_orchestrator() -> TinyRecursiveDemoOrchestrator:
    return TinyRecursiveDemoOrchestrator(CONFIG_PATH)


st.set_page_config(page_title="Tiny Recursive Model Demo", layout="wide")
st.title("🎖️ Tiny Recursive Model Demo Control Centre")
st.caption("Harness recursive reasoning with thermostat governance and sentinel guardrails.")

with st.sidebar:
    st.header("Control Panel")
    run_demo = st.button("Run Simulation", type="primary")
    st.divider()
    st.subheader("Owner Override")
    section = st.selectbox("Section", ["trm", "thermostat", "sentinel", "ledger"])
    key = st.text_input("Field name", "halt_threshold")
    new_value = st.text_input("New value", "0.5")
    apply_override = st.button("Apply Override")

if "report" not in st.session_state:
    st.session_state.report = None

orchestrator = _load_orchestrator()

if apply_override:
    target_section = getattr(orchestrator.config, section)
    current_value = getattr(target_section, key)
    if isinstance(current_value, int):
        cast_value = int(float(new_value))
    elif isinstance(current_value, float):
        cast_value = float(new_value)
    else:
        cast_value = new_value
    orchestrator.update_owner_parameter(section, key, cast_value)
    st.success(f"Updated {section}.{key} to {cast_value}")

if run_demo:
    with st.spinner("Running TRM demo..."):
        report = orchestrator.run()
        st.session_state.report = report
        st.success("Simulation complete")
        st.session_state.summary = orchestrator.render_summary(report)
        st.session_state.roi = report.metrics["TRM"].roi
        st.session_state.target_roi = orchestrator.config.thermostat.target_roi
        st.session_state.metrics = report.metrics

report = st.session_state.report
if report:
    col1, col2 = st.columns([2, 1])
    with col1:
        st.markdown("## Engine Leaderboard")
        st.markdown(st.session_state.summary)
    with col2:
        st.markdown("## ROI Thermostat")
        roi_value = st.session_state.roi
        target_roi = st.session_state.target_roi
        st.plotly_chart(_roi_gauge(roi_value, target_roi), use_container_width=True)
        st.metric("Target ROI", f"{target_roi:.2f}")
    st.markdown("## Detailed Metrics")
    metrics_json = {
        name: {
            "attempts": summary.attempts,
            "conversions": summary.conversions,
            "cost": summary.total_cost,
            "gmv": summary.gmv,
            "profit": summary.profit,
            "roi": summary.roi,
        }
        for name, summary in st.session_state.metrics.items()
    }
    st.json(metrics_json)
else:
    st.info("Trigger the simulation to populate live metrics.")
