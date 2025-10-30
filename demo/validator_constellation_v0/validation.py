from __future__ import annotations

from ._shim import load

_source = load("validation")
globals().update({k: v for k, v in _source.__dict__.items() if k not in {"__name__", "__loader__", "__package__", "__spec__"}})
__all__ = getattr(_source, "__all__", [])
