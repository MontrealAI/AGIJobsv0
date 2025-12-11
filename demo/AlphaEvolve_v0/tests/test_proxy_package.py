from __future__ import annotations

from pathlib import Path


def test_proxy_forwards_to_canonical_package(monkeypatch):
    # Simulate a consumer importing the proxy package from the repo root.
    monkeypatch.syspath_prepend(str(Path(__file__).resolve().parents[2]))

    import alphaevolve_demo

    # The proxy should expose the canonical module contents and definitions.
    assert set(alphaevolve_demo.__all__), "Expected exported symbols from canonical package"

    agent_path = Path(alphaevolve_demo.agent.__file__).resolve()
    assert "AlphaEvolve-v0" in agent_path.parts
    assert agent_path.name == "agent.py"
