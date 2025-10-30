import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
src_path = ROOT / "src"
if str(src_path) not in sys.path:
    sys.path.insert(0, str(src_path))

from agi_alpha_node_demo.safety.pause import DrillScheduler, PauseController
from agi_alpha_node_demo.blockchain.contracts import SystemPauseClient


def test_drill_scheduler_runs_pause_cycle(monkeypatch):
    pause_client = SystemPauseClient()
    controller = PauseController(pause_client)
    scheduler = DrillScheduler(controller, interval_seconds=0)
    calls = {"pause": 0, "resume": 0}

    def pause_hook():
        calls["pause"] += 1
        pause_client.pause()

    def resume_hook():
        calls["resume"] += 1
        pause_client.unpause()

    monkeypatch.setattr(controller, "pause", pause_hook)
    monkeypatch.setattr(controller, "resume", resume_hook)

    scheduler.start()
    # Allow a couple of scheduler ticks
    import time

    time.sleep(0.05)
    scheduler.stop()
    assert calls["pause"] >= 1
    assert calls["resume"] >= 1
