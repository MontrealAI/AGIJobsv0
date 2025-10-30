"""Safety sentinels ensuring alignment and constraint adherence."""
from __future__ import annotations

from collections import deque
from typing import Deque, Dict


class Sentinel:
    def __init__(self, config: Dict) -> None:
        sent_conf = config.get("sentinel", {})
        self.enabled = bool(sent_conf.get("enable", True))
        self.alpha = float(sent_conf.get("value_error_alpha", 0.1))
        self.threshold = float(sent_conf.get("value_error_threshold", 1.0))
        self.drift_window = int(sent_conf.get("drift_window", 12))
        self.fallback_on_violation = bool(sent_conf.get("fallback_on_violation", True))
        self._ema_error = 0.0
        self._history: Deque[float] = deque(maxlen=self.drift_window)
        self.triggered = False

    def update(self, predicted_value: float, realised_return: float) -> None:
        if not self.enabled:
            return
        error = abs(predicted_value - realised_return)
        self._ema_error = self.alpha * error + (1 - self.alpha) * self._ema_error
        self._history.append(error)
        if self._ema_error > self.threshold and len(self._history) == self._history.maxlen:
            self.triggered = True

    def should_fallback(self) -> bool:
        return self.triggered and self.fallback_on_violation

    def reset(self) -> None:
        self.triggered = False
        self._ema_error = 0.0
        self._history.clear()
