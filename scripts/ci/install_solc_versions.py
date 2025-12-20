#!/usr/bin/env python3
"""
Hardened solc installer for CI.

The upstream ``solc-select`` utility downloads release metadata from
``binaries.soliditylang.org`` using Python's default ``urllib`` opener. Some CI
networks intermittently respond with HTTP 403 to those requests, causing the
canonical ``solc-select install`` step to fail before compilation even starts.

This helper adds two safeguards:

* A deterministic User-Agent on every request to avoid generic bot blocking.
* Transparent fallback to the public solc mirror ``https://solc-bin.ethereum.org``
  when the primary endpoint returns errors.

Usage:
    python scripts/ci/install_solc_versions.py --default 0.8.25 0.8.25 0.8.23 0.8.21

Environment:
* SOLC_SELECT_MIRROR (optional): override the primary mirror base URL.
* SOLC_SELECT_USER_AGENT (optional): customize the HTTP User-Agent string.
"""

from __future__ import annotations

import argparse
import os
import sys
import urllib.request
from typing import Iterable, List

import solc_select.solc_select as solc_select


DEFAULT_MIRRORS = (
    # Primary (allow override via env for debugging or pinning)
    os.environ.get("SOLC_SELECT_MIRROR", "https://binaries.soliditylang.org"),
    # Public mirror that typically serves the same payloads
    "https://solc-bin.ethereum.org",
)
USER_AGENT = os.environ.get("SOLC_SELECT_USER_AGENT", "solc-select-ci/1.0")


def install_version(version: str, mirrors: Iterable[str]) -> None:
    """Install a solc version, falling back across mirrors."""
    last_error: Exception | None = None
    for mirror in mirrors:
        if not mirror:
            continue

        def patched_get_url(*args, **kwargs) -> tuple[str, str]:
            version_arg = ""
            artifact = ""
            if args:
                # Respect positional invocation used by solc-select
                version_arg = args[0] if len(args) > 0 else ""
                artifact = args[1] if len(args) > 1 else ""
            else:
                version_arg = kwargs.get("version", "")
                artifact = kwargs.get("artifact", "")

            platform = solc_select.soliditylang_platform()
            base = mirror.rstrip("/")
            return (
                f"{base}/{platform}/{artifact}",
                f"{base}/{platform}/list.json",
            )

        original_get_url = solc_select.get_url
        original_urlopen = urllib.request.urlopen

        def _urlopen_with_headers(
            url: str | urllib.request.Request, *args, **kwargs
        ):  # pragma: no cover - network-dependent
            """Add a deterministic User-Agent to every outbound request."""
            if isinstance(url, str):
                url = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            elif isinstance(url, urllib.request.Request):
                url.add_header("User-Agent", USER_AGENT)
            return original_urlopen(url, *args, **kwargs)

        solc_select.get_url = patched_get_url  # type: ignore[assignment]
        urllib.request.urlopen = _urlopen_with_headers  # type: ignore[assignment]
        try:
            solc_select.install_artifacts([version])
            return
        except Exception as exc:  # pragma: no cover - network-dependent
            last_error = exc
        finally:
            solc_select.get_url = original_get_url  # type: ignore[assignment]
            urllib.request.urlopen = original_urlopen  # type: ignore[assignment]

    if last_error:
        raise last_error
    raise RuntimeError(f"Failed to install solc {version}; no mirrors attempted.")


def install_versions(versions: Iterable[str], default_version: str | None) -> None:
    failures: list[tuple[str, Exception]] = []
    for version in versions:
        try:
            install_version(version, DEFAULT_MIRRORS)
        except Exception as exc:  # pragma: no cover - network-dependent
            failures.append((version, exc))
    if failures:
        messages = [
            f" - {version}: {exc.__class__.__name__}: {exc}"
            for version, exc in failures
        ]
        raise SystemExit(
            "One or more solc installations failed:\n" + "\n".join(messages)
        )

    if default_version:
        solc_select.switch_global_version(default_version, always_install=False)


def parse_args(argv: List[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "versions",
        nargs="+",
        help="Solc versions to install (e.g., 0.8.25 0.8.23).",
    )
    parser.add_argument(
        "--default",
        dest="default_version",
        help="Version to select via solc-select use after installation.",
    )
    return parser.parse_args(argv)


def main(argv: List[str] | None = None) -> int:
    args = parse_args(argv)
    install_versions(args.versions, args.default_version)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
