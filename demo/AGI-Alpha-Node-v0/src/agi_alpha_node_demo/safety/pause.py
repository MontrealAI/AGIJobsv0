from __future__ import annotations

import logging
import threading
import time
from typing import Callable

from ..blockchain.contracts import SystemPauseClient

logger = logging.getLogger(__name__)


class PauseController:
    def __init__(self, system_pause: SystemPauseClient) -> None:
        self.system_pause = system_pause
        self._lock = threading.RLock()
        self._local_pause = False

    def pause(self) -> None:
        with self._lock:
            self.system_pause.pause()
            self._local_pause = True

    def resume(self) -> None:
        with self._lock:
            self.system_pause.unpause()
            self._local_pause = False

    def is_paused(self) -> bool:
        return self._local_pause or self.system_pause.is_paused()

    def guard(self, func: Callable[[], None]) -> None:
        if self.is_paused():
            logger.warning("Operation blocked while paused")
            return
        func()


class DrillScheduler:
    def __init__(self, controller: PauseController, interval_seconds: int) -> None:
        self.controller = controller
        self.interval_seconds = interval_seconds
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return

        def _run() -> None:
            while not self._stop.is_set():
                time.sleep(self.interval_seconds)
                logger.info("Running pause drill")
                self.controller.pause()
                time.sleep(0.5)
                self.controller.resume()

        self._thread = threading.Thread(target=_run, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        if self._thread:
            self._stop.set()
            self._thread.join(timeout=1)


__all__ = ["DrillScheduler", "PauseController"]
