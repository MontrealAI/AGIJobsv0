"""Helper script to execute the MuZero demo end-to-end."""

from __future__ import annotations

from pathlib import Path
import sys

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
if str(PACKAGE_ROOT) not in sys.path:
    sys.path.insert(0, str(PACKAGE_ROOT))

from muzero_demo.cli import app  # noqa: E402  pylint: disable=wrong-import-position


def main(argv: list[str] | None = None) -> None:
    args = list(sys.argv[1:] if argv is None else argv)
    if not args:
        config_path = PACKAGE_ROOT / "config" / "muzero_demo.yaml"
        args = ["demo", "--config", str(config_path)]
    app(args)


if __name__ == "__main__":
    main()
