"""Entry point enabling ``python -m trm_demo`` executions."""

from .cli import app


def main() -> None:  # pragma: no cover - thin wrapper
    app()


if __name__ == "__main__":  # pragma: no cover
    main()

