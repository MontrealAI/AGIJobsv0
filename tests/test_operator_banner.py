import json
import sys
from pathlib import Path

from tools import operator_banner


def _write_report(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload), encoding="utf-8")


def test_operator_banner_formats_ratio_uplift(capsys, tmp_path, monkeypatch):
    out_dir = tmp_path / "out"
    out_dir.mkdir()
    _write_report(out_dir / "report.json", {"utility_uplift": 1.25})

    monkeypatch.setattr(sys, "argv", ["operator_banner.py", str(out_dir)])
    operator_banner.main()

    captured = capsys.readouterr().out.strip()
    assert captured == "✅ Day-One Utility +125.00%"


def test_operator_banner_formats_percent_uplift(capsys, tmp_path, monkeypatch):
    out_dir = tmp_path / "out"
    out_dir.mkdir()
    _write_report(out_dir / "report.json", {"uplift_pct": 12.5})

    monkeypatch.setattr(sys, "argv", ["operator_banner.py", str(out_dir)])
    operator_banner.main()

    captured = capsys.readouterr().out.strip()
    assert captured == "✅ Day-One Utility +12.50%"
