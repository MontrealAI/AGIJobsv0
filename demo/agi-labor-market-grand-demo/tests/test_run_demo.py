from __future__ import annotations

import http.client
import importlib.util
import socket
import threading
from pathlib import Path

import pytest

MODULE_PATH = Path(__file__).resolve().parents[1] / "run_demo.py"
spec = importlib.util.spec_from_file_location("agi_labor_market_run_demo", MODULE_PATH)
if spec is None or spec.loader is None:  # pragma: no cover
    raise RuntimeError("Unable to load run_demo module")
run_demo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run_demo)


def test_parse_numeric_handles_units():
    assert run_demo._parse_numeric("13993.825 AGIα") == pytest.approx(13993.825)
    assert run_demo._parse_numeric(5) == 5.0
    assert run_demo._parse_numeric("not a number") is None


def test_load_and_summarize_sample_transcript():
    transcript_path = Path(run_demo.DEFAULT_TRANSCRIPT)
    transcript = run_demo.load_transcript(transcript_path)
    metrics = run_demo.summarize_telemetry(transcript)

    assert metrics["total_jobs"] == pytest.approx(2)
    assert metrics["minted_certificates"] == pytest.approx(2)
    assert metrics["pending_fees"] > 0


def test_format_summary_includes_key_metrics():
    metrics = {
        "total_jobs": 2,
        "minted_certificates": 2,
        "final_supply": 13993.825,
        "total_burned": 6.175,
        "total_agent_stake": 20.0,
        "total_validator_stake": 24.9,
        "pending_fees": 20.425,
    }

    summary = run_demo.format_summary(metrics)

    for phrase in [
        "Total jobs: 2",
        "Minted certificates: 2",
        "Final supply: 13993.825 AGIα",
        "Pending fees: 20.425 AGIα",
    ]:
        assert phrase in summary


def test_main_defaults_to_summarize(capsys):
    assert run_demo.main([]) == 0

    out = capsys.readouterr().out
    assert "AGI Labor Market Grand Demo" in out
    assert "Total jobs" in out


def test_create_server_binds_localhost_and_serves_assets():
    with run_demo.create_server("127.0.0.1", 0) as server:
        host, port = server.server_address[:2]
        assert server.allow_reuse_address is True
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()

        conn = http.client.HTTPConnection(host, port, timeout=2)
        conn.request("GET", "/")
        response = conn.getresponse()
        body = response.read().decode()

        server.shutdown()
        thread.join(timeout=1)

        assert response.status == 200
        assert "AGI Jobs v2 Sovereign Labour Market Control Room" in body


def test_bind_server_with_fallback_uses_ephemeral_port_when_busy():
    blocker = socket.socket()
    blocker.bind(("127.0.0.1", 0))
    busy_port = blocker.getsockname()[1]

    server, note = run_demo._bind_server_with_fallback("127.0.0.1", busy_port)

    try:
        assert note is not None
        _, chosen_port = server.server_address[:2]
        assert chosen_port != busy_port

        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()

        conn = http.client.HTTPConnection("127.0.0.1", chosen_port, timeout=2)
        conn.request("GET", "/")
        response = conn.getresponse()

        server.shutdown()
        thread.join(timeout=1)

        assert response.status == 200
    finally:
        server.server_close()
        blocker.close()
