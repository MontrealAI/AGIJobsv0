from __future__ import annotations

import json
from pathlib import Path

import run_demo


def test_build_report_contains_documents():
    base_dir = Path(__file__).resolve().parents[1]
    report = run_demo.build_report(base_dir)

    assert report.documents, "expected demo documents to be discovered"
    assert 0 < report.coverage <= 1
    assert set(run_demo.DOC_FILES).issuperset({doc.name for doc in report.documents})

    scores = report.scores
    for key in ("coordination_hamiltonian", "gibbs_free_energy_surplus", "game_theory_payoff"):
        assert key in scores
        assert 0 <= scores[key] <= 1


def test_main_writes_report(tmp_path: Path, monkeypatch):
    output = tmp_path / "report.json"
    exit_code = run_demo.main(["--output", str(output)])
    assert exit_code == 0
    assert output.exists()

    payload = json.loads(output.read_text(encoding="utf-8"))
    assert payload["documents"], "report should enumerate scanned documents"
    assert payload["scores"]["coordination_hamiltonian"] >= 0
