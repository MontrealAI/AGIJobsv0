"""Compatibility helpers for Torch builds without NumPy bindings."""
from __future__ import annotations

from typing import Any

import numpy as np
import torch

_DTYPE_MAP = {
    "bool": torch.bool,
    "uint8": torch.uint8,
    "int8": torch.int8,
    "int16": torch.int16,
    "int32": torch.int32,
    "int64": torch.int64,
    "float16": torch.float16,
    "float32": torch.float32,
    "float64": torch.float64,
}


def _infer_dtype(array_like: Any) -> torch.dtype | None:
    dtype = getattr(array_like, "dtype", None)
    if dtype is None:
        return None
    name = getattr(dtype, "name", None)
    if not name:
        name = str(dtype)
    return _DTYPE_MAP.get(name)


def _to_tensor_without_numpy(array_like: Any) -> torch.Tensor:
    if isinstance(array_like, torch.Tensor):
        return array_like.detach().clone()
    if hasattr(array_like, "tolist"):
        data = array_like.tolist()
    else:
        data = list(array_like)
    dtype = _infer_dtype(array_like)
    if dtype is not None:
        return torch.tensor(data, dtype=dtype)
    return torch.tensor(data)


def patch_torch_from_numpy() -> None:
    """Install a fallback ``torch.from_numpy`` when NumPy interop is unavailable."""

    original = torch.from_numpy
    if getattr(original, "_muzero_patched", False):
        return
    try:
        original(np.zeros(1, dtype=np.float32))
        return
    except Exception:  # pragma: no cover - handled by fallback
        pass

    def _fallback(array_like: Any) -> torch.Tensor:
        try:
            return original(array_like)
        except Exception as exc:  # pragma: no cover - fallback path
            message = str(exc)
            if "Numpy is not available" not in message:
                raise
        return _to_tensor_without_numpy(array_like)

    _fallback.__doc__ = original.__doc__
    _fallback._muzero_patched = True  # type: ignore[attr-defined]
    torch.from_numpy = _fallback  # type: ignore[assignment]


__all__ = ["patch_torch_from_numpy"]
