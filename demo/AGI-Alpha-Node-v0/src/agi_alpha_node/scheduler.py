from __future__ import annotations

import threading
import time
from typing import Callable, Optional


class RepeatingTask:
    def __init__(self, interval_seconds: int, target: Callable[[], None], name: str) -> None:
        self.interval_seconds = interval_seconds
        self.target = target
        self.name = name
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return

        def run() -> None:
            while not self._stop_event.is_set():
                start = time.time()
                try:
                    self.target()
                finally:
                    elapsed = time.time() - start
                    remaining = max(0.0, self.interval_seconds - elapsed)
                    self._stop_event.wait(remaining)

        self._thread = threading.Thread(target=run, name=self.name, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=1)


__all__ = ["RepeatingTask"]
