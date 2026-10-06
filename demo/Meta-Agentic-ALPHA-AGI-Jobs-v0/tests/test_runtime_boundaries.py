from pathlib import Path
from types import SimpleNamespace
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'python'))
from meta_agentic_alpha_demo import engine


def test_invalid_timeouts_do_not_prepare_or_start_a_run(monkeypatch):
    monkeypatch.setattr(engine, '_ensure_directories', lambda _: pytest.fail('Invalid timeout reached storage preparation'))
    for value in (0, -1, float('nan'), float('inf'), 3601):
        with pytest.raises(ValueError, match='Timeout'):
            engine.run_demo(SimpleNamespace(base_dir=ROOT), timeout=value)


def test_failed_orchestration_preserves_summary_and_raises(tmp_path, monkeypatch):
    import orchestrator.runner as runner
    summary = tmp_path / 'failed.json'
    written = []
    monkeypatch.setattr(engine, '_ensure_directories', lambda _: {'ORCHESTRATOR_SCOREBOARD_PATH': tmp_path / 'scoreboard.json'})
    monkeypatch.setattr(engine, '_hydrate_attachments', lambda _: [])
    monkeypatch.setattr(engine, '_register_agents', lambda _: [])
    monkeypatch.setattr(engine, '_build_plan', lambda *_: object())
    monkeypatch.setattr(runner, 'start_run', lambda *_args, **_kwargs: SimpleNamespace(id='failed-test'))
    monkeypatch.setattr(engine, '_await_completion', lambda *_args, **_kwargs: SimpleNamespace(run=SimpleNamespace(state='failed')))
    def write(*_args):
        summary.write_text('{"state":"failed"}', encoding='utf-8')
        written.append(summary)
        return summary
    monkeypatch.setattr(engine, '_write_summary', write)
    with pytest.raises(RuntimeError, match='Orchestration failed'):
        engine.run_demo(SimpleNamespace(base_dir=tmp_path, approvals=[]), timeout=1)
    assert written == [summary]
    assert summary.exists()
