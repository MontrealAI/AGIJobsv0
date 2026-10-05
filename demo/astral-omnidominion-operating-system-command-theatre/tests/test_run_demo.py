from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "run_demo.py"
spec = importlib.util.spec_from_file_location("astral_run_demo", MODULE_PATH)
run_demo = importlib.util.module_from_spec(spec)
if spec.loader is None:  # pragma: no cover - defensive
    raise RuntimeError("Unable to load astral run_demo module")
sys.modules[spec.name] = run_demo
spec.loader.exec_module(run_demo)


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


import copy
import hashlib
import shutil
import subprocess

import pytest


def execute(tmp_path, scenario="accepted"):
    output = tmp_path / "report.json"
    code = run_demo.main(["--output", str(output), "--scenario", scenario])
    return code, output, json.loads(output.read_text())


def test_correct_work_and_evidence_recompute(tmp_path):
    code, output, payload = execute(tmp_path)
    assert code == 0
    assert payload["rehearsal"]["deliverable"] == {
        "source_rows": 4, "unique_rows": 3, "duplicate_rows": 1, "total_cents": 21999,
    }
    assert payload["coverage"] == 1
    assert len(payload["rehearsal"]["artifacts"]) == 5
    assert run_demo.verify_report(output)["accepted"] is True
    for key in ("live_provider", "browser_executed", "production_approved", "settlement_approved"):
        assert payload[key] is False


def test_incorrect_work_is_rejected_but_integrity_can_pass(tmp_path):
    code, output, payload = execute(tmp_path, "rejected")
    assert code == 1
    assert payload["rehearsal"]["status"] == "rejected"
    checks = payload["rehearsal"]["review"]["checks"]
    assert sum(checks.values()) == 3
    assert checks["total_recomputed"] is False
    assert run_demo.verify_report(output)["accepted"] is False


def test_pause_produces_no_task_artifacts(tmp_path):
    code, output, payload = execute(tmp_path, "paused")
    assert code == 1
    assert payload["rehearsal"]["status"] == "blocked"
    assert payload["rehearsal"]["artifacts"] == []
    assert not (tmp_path / "runs").exists()
    assert run_demo.main(["--verify-report", str(output)]) == 1


@pytest.mark.parametrize("damage", ["missing", "empty", "invalid-utf8", "directory", "oversized"])
def test_incomplete_documents_block_execution(tmp_path, damage):
    base = tmp_path / "demo"
    shutil.copytree(ROOT, base)
    target = base / "launch-playbook.md"
    target.unlink()
    if damage == "empty":
        target.write_text(" \n")
    elif damage == "invalid-utf8":
        target.write_bytes(b"\xff")
    elif damage == "directory":
        target.mkdir()
    elif damage == "oversized":
        target.write_bytes(b"a" * (run_demo.MAX_FILE_BYTES + 1))
    output = tmp_path / "reports" / "report.json"
    assert run_demo.main(["--output", str(output)], base_dir=base) == 1
    payload = json.loads(output.read_text())
    assert payload["issues"]
    assert payload["coverage"] < 1
    assert payload["rehearsal"]["artifacts"] == []


@pytest.mark.parametrize("mutation", ["duplicate-id", "negative-budget", "boolean-budget", "unknown-tool", "verified-market", "empty-jobs", "missing-fixture", "not-object"])
def test_malformed_catalogs_fail_closed(tmp_path, mutation):
    catalog = json.loads((ROOT / "work-catalog.json").read_text())
    if mutation == "duplicate-id":
        catalog["jobs"][1]["id"] = catalog["jobs"][0]["id"]
    elif mutation == "negative-budget":
        catalog["jobs"][0]["budget_usdc"] = -1
    elif mutation == "boolean-budget":
        catalog["jobs"][0]["budget_usdc"] = True
    elif mutation == "unknown-tool":
        catalog["jobs"][0]["capabilities"] = ["wallet-sign"]
    elif mutation == "verified-market":
        catalog["market"]["verified"] = True
    elif mutation == "empty-jobs":
        catalog["jobs"] = []
    elif mutation == "missing-fixture":
        catalog["jobs"] = catalog["jobs"][1:]
    else:
        catalog = []
    path = tmp_path / "catalog.json"
    path.write_text(json.dumps(catalog))
    with pytest.raises(ValueError):
        run_demo.load_catalog(path)


def test_tampered_and_missing_artifacts_rejected(tmp_path):
    _, output, payload = execute(tmp_path)
    target = output.parent / payload["rehearsal"]["artifacts"][2]["path"]
    target.write_text('{"total_cents": 21998}')
    assert run_demo.main(["--verify-report", str(output)]) == 1
    target.unlink()
    assert run_demo.main(["--verify-report", str(output)]) == 1


def test_rehashed_wrong_deliverable_still_fails_acceptance_consistency(tmp_path):
    _, output, payload = execute(tmp_path)
    entry = next(e for e in payload["rehearsal"]["artifacts"] if e["path"].endswith("/deliverable.json"))
    path = output.parent / entry["path"]
    candidate = json.loads(path.read_text())
    candidate["total_cents"] += 1
    data = run_demo._json_bytes(candidate)
    path.write_bytes(data)
    entry.update(sha256=hashlib.sha256(data).hexdigest(), bytes=len(data))
    output.write_text(json.dumps(payload))
    with pytest.raises(ValueError, match="Review does not match"):
        run_demo.verify_report(output)


@pytest.mark.parametrize("attack", ["../outside.json", "/etc/passwd", "..\\outside.json"])
def test_verifier_rejects_paths_outside_report(tmp_path, attack):
    _, output, payload = execute(tmp_path)
    payload["rehearsal"]["artifacts"][0]["path"] = attack
    output.write_text(json.dumps(payload))
    with pytest.raises(ValueError, match="escapes"):
        run_demo.verify_report(output)


def test_verifier_rejects_symlinks_and_duplicate_entries(tmp_path):
    _, output, payload = execute(tmp_path)
    original = copy.deepcopy(payload)
    payload["rehearsal"]["artifacts"][0] = payload["rehearsal"]["artifacts"][1]
    output.write_text(json.dumps(payload))
    with pytest.raises(ValueError, match="duplicated"):
        run_demo.verify_report(output)
    output.write_text(json.dumps(original))
    target = output.parent / original["rehearsal"]["artifacts"][0]["path"]
    other = tmp_path / "outside.json"
    target.rename(other)
    target.symlink_to(other)
    with pytest.raises(ValueError, match="symlinks"):
        run_demo.verify_report(output)


def test_verifier_rejects_fake_production_boundary(tmp_path):
    _, output, payload = execute(tmp_path)
    payload["production_approved"] = True
    output.write_text(json.dumps(payload))
    with pytest.raises(ValueError, match="boundary"):
        run_demo.verify_report(output)


def test_repeated_runs_keep_separate_evidence(tmp_path):
    _, _, first = execute(tmp_path)
    first_files = {e["path"] for e in first["rehearsal"]["artifacts"]}
    _, _, second = execute(tmp_path)
    second_files = {e["path"] for e in second["rehearsal"]["artifacts"]}
    assert first_files.isdisjoint(second_files)
    assert all((tmp_path / name).is_file() for name in first_files | second_files)


def test_dashboard_escapes_untrusted_text(tmp_path):
    _, _, payload = execute(tmp_path)
    payload["catalog"]["jobs"][0]["title"] = '<script>alert("bad")</script>'
    page = run_demo.render_dashboard(payload)
    assert "<script>" not in page
    assert "&lt;script&gt;" in page
    assert "Content-Security-Policy" in page
    assert "Live provider: NO" in page


def test_cli_works_outside_repository(tmp_path):
    output = tmp_path / "report.json"
    result = subprocess.run([sys.executable, str(MODULE_PATH), "--output", str(output)], cwd=tmp_path, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    assert output.with_suffix(".html").is_file()


def test_conflicting_source_requires_reconciliation():
    with pytest.raises(ValueError, match="Conflicting"):
        run_demo.check_deliverable([{"id": "a", "amount_cents": 1}, {"id": "a", "amount_cents": 2}], {})


def test_output_cannot_overwrite_source_or_html(tmp_path):
    assert run_demo.main(["--output", str(ROOT / "work-catalog.json")]) == 1
    assert run_demo.main(["--output", str(tmp_path / "report.html")]) == 1


def test_old_receipt_remains_verifiable_after_new_run(tmp_path):
    _, _, first = execute(tmp_path)
    first_bundle = (tmp_path / first["rehearsal"]["artifacts"][0]["path"]).parent
    execute(tmp_path, "rejected")
    assert run_demo.verify_report(first_bundle / "receipt.json")["accepted"] is True
    assert (first_bundle / "index.html").exists()


@pytest.mark.parametrize("payload", [[], None, {"schema_version": 2}, {"rehearsal": []}])
def test_malformed_report_has_clean_nonzero_exit(tmp_path, payload):
    path = tmp_path / "invalid.json"
    path.write_text(json.dumps(payload))
    assert run_demo.main(["--verify-report", str(path)]) == 1


def test_checker_rejects_boolean_counts_and_noninteger_money():
    source = [{"id": "one", "amount_cents": 10}]
    assert run_demo.check_deliverable(source, {"source_rows": True, "unique_rows": 1, "duplicate_rows": 0, "total_cents": 10})["accepted"] is False
    with pytest.raises(ValueError, match="integer cents"):
        run_demo.check_deliverable([{"id": "one", "amount_cents": 10.1}], {})
