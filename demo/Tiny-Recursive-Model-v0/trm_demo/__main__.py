"""Entry point enabling ``python -m trm_demo`` executions."""

from .cli import main as cli_main


def main() -> None:  # pragma: no cover - thin wrapper
    """Delegate to the CLI's ``main`` so the module behaves like the script."""

    cli_main()


if __name__ == "__main__":  # pragma: no cover
    main()

