"""Convenience executable for the Absolute Zero Reasoner demo.

This mirrors :mod:`azr_demo.__main__` so users can simply run
``python demo.py`` from the demo directory without hunting for the
package entrypoint.
"""
from __future__ import annotations

from azr_demo.__main__ import main


if __name__ == "__main__":  # pragma: no cover - exercised via integration test
    main()
