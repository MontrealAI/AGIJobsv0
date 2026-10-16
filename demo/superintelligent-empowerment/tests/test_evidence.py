from copy import deepcopy
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "code/evidence.py"
spec = importlib.util.spec_from_file_location("empowerment_evidence_test", SCRIPT)
engine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)


def packet():
    return json.loads((ROOT / "evidence/example.json").read_text())


def test_met_unknown_and_dependency_blocked_are_distinct():
    result = engine.evaluate(packet())
    assert result["readyCount"] == 1
    assert result["entries"][0]["criterionOutcome"] == "criterion-met"
    assert result["entries"][1]["criterionOutcome"] == "no-evidence"
    assert result["entries"][2]["criterionOutcome"] == "criterion-met"
    assert result["entries"][2]["blockedBy"] == ["follow-up"]
    assert not result["allReadyForHumanReview"]
    assert (
        not result["sourceAuthenticityVerified"]
        and not result["realWorldImpactVerified"]
    )


def test_unmet_and_lte_integer_criterion():
    value = packet()
    value["initiatives"][0]["criterion"]["threshold"] = 9
    assert engine.evaluate(value)["entries"][0]["criterionOutcome"] == "criterion-unmet"
    value["initiatives"][0]["criterion"].update(operator="lte", threshold=8)
    assert engine.evaluate(value)["entries"][0]["criterionOutcome"] == "criterion-met"


@pytest.mark.parametrize(
    "change",
    [
        "hash",
        "metric",
        "unit",
        "reference",
        "duplicate",
        "cycle",
        "unknown",
        "boolean",
        "float",
        "extra",
    ],
)
def test_malformed_or_ambiguous_inputs_fail(change):
    value = packet()
    if change == "hash":
        value["evidence"][0]["sha256"] = "0" * 64
    elif change == "metric":
        value["initiatives"][0]["criterion"]["metric"] = "different"
    elif change == "unit":
        value["initiatives"][0]["criterion"]["unit"] = "percent"
    elif change == "reference":
        value["initiatives"][0]["evidenceId"] = "missing"
    elif change == "duplicate":
        value["initiatives"].append(deepcopy(value["initiatives"][0]))
    elif change == "cycle":
        value["initiatives"][0]["dependencies"] = ["expansion"]
    elif change == "unknown":
        value["initiatives"][0]["dependencies"] = ["absent"]
    elif change == "boolean":
        value["initiatives"][0]["criterion"]["threshold"] = True
    elif change == "float":
        value["initiatives"][0]["criterion"]["threshold"] = 1.0
    elif change == "extra":
        value["extra"] = "ignored?"
    with pytest.raises(ValueError):
        engine.evaluate(value)


@pytest.mark.parametrize(
    "raw",
    [b"\xef\xbb\xbf{}", "{}".encode("utf-16"), b'{"x":1,"x":2}', b'{"x":NaN}', b"\xff"],
)
def test_unambiguous_utf8_input(raw):
    with pytest.raises((ValueError, UnicodeError)):
        engine.strict_json(raw)


def test_actual_artifacts_recompute_and_resealed_tamper_fails(tmp_path):
    out = tmp_path / "run"
    assert (
        engine.main(
            [
                "run",
                "--packet",
                str(ROOT / "evidence/example.json"),
                "--output",
                str(out),
            ]
        )
        == 0
    )
    assert engine.review(out)["checkedArtifacts"] == 3
    assert (out / "packet.json").read_bytes() == (
        ROOT / "evidence/example.json"
    ).read_bytes()
    ledger = json.loads((out / "ledger.json").read_text())
    ledger["readyCount"] = 3
    raw = engine.canonical(ledger)
    (out / "ledger.json").write_bytes(raw)
    receipt = json.loads((out / "receipt.json").read_text())
    receipt["artifacts"]["ledger.json"] = hashlib.sha256(raw).hexdigest()
    (out / "receipt.json").write_bytes(engine.canonical(receipt))
    with pytest.raises(ValueError, match="recomputed"):
        engine.review(out)


def test_no_overwrite_and_friendly_missing_file(tmp_path):
    out = tmp_path / "existing"
    out.mkdir()
    sentinel = out / "keep"
    sentinel.write_text("keep")
    assert (
        engine.main(
            [
                "run",
                "--packet",
                str(ROOT / "evidence/example.json"),
                "--output",
                str(out),
            ]
        )
        == 2
    )
    assert sentinel.read_text() == "keep"
    result = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "run",
            "--packet",
            str(tmp_path / "missing"),
            "--output",
            str(tmp_path / "new"),
        ],
        capture_output=True,
        text=True,
        timeout=5,
    )
    assert result.returncode == 2 and "Traceback" not in result.stderr
    assert not (tmp_path / "new").exists()


def test_fifo_input_rejected_without_blocking(tmp_path):
    import os

    fifo = tmp_path / "pipe"
    os.mkfifo(fifo)
    with pytest.raises(ValueError, match="regular file"):
        engine.read_bounded(fifo)


def test_output_symlink_alias_rejected(tmp_path):
    alias = tmp_path / "alias"
    alias.symlink_to(tmp_path, target_is_directory=True)
    assert (
        engine.main(
            [
                "run",
                "--packet",
                str(ROOT / "evidence/example.json"),
                "--output",
                str(alias / "new"),
            ]
        )
        == 2
    )
    assert not (tmp_path / "new").exists()
