"""Pytest configuration for AlphaEvolve demo tests.

The AlphaEvolve demo test runner (`run_demo_tests.py`) ensures
`PYTEST_DISABLE_PLUGIN_AUTOLOAD` is set *before* pytest initialises so that
third-party plugins installed globally do not interfere with the suite.
This module stays intentionally minimal; shared fixtures for the demo should
be defined here.
"""

from __future__ import annotations
