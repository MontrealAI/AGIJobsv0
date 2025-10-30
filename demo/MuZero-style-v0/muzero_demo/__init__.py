"""MuZero-style planning demo package for AGI Jobs v0 (v2).

This package exposes ergonomic helpers for running a compact yet
production-grade MuZero-style planning workflow tailored to
AGI Jobs economics.  The modules are intentionally lightweight so
non-technical operators can introspect and extend the system easily.
"""

from . import environment, mcts, network, baselines, training, evaluation

# ---------------------------------------------------------------------------
# Compatibility helpers
# ---------------------------------------------------------------------------
try:  # pragma: no cover - defensive patching for CI environments
    import torch
except Exception:  # pragma: no cover - torch optional for documentation builds
    torch = None
else:
    import numpy as _np

    _ORIGINAL_FROM_NUMPY = torch.from_numpy

    _NUMPY_TO_TORCH_DTYPE = {
        _np.dtype("float16"): torch.float16,
        _np.dtype("float32"): torch.float32,
        _np.dtype("float64"): torch.float64,
        _np.dtype("int8"): torch.int8,
        _np.dtype("int16"): torch.int16,
        _np.dtype("int32"): torch.int32,
        _np.dtype("int64"): torch.int64,
        _np.dtype("uint8"): torch.uint8,
        _np.dtype("bool"): torch.bool,
    }

    def _safe_from_numpy(array):
        """Fallback that mirrors ``torch.from_numpy`` when NumPy bindings are absent."""

        try:
            return _ORIGINAL_FROM_NUMPY(array)
        except RuntimeError as exc:  # pragma: no cover - only triggered in CI edge case
            if "Numpy is not available" not in str(exc):
                raise
            if not isinstance(array, _np.ndarray):
                raise

            dtype = _NUMPY_TO_TORCH_DTYPE.get(array.dtype, torch.float32)
            tensor = torch.tensor(array.tolist(), dtype=dtype)
            return tensor.view(array.shape)

    torch.from_numpy = _safe_from_numpy  # type: ignore[assignment]

__all__ = [
    "environment",
    "mcts",
    "network",
    "baselines",
    "training",
    "evaluation",
]
