"""Allow running the demo package via ``python -m validator_constellation``."""

from .demo_runner import run_validator_constellation_demo


def main() -> None:
    summary = run_validator_constellation_demo()
    print("Validator Constellation demo executed successfully.")
    print(f"Committee: {summary.committee}")
    print(f"Paused domains: {summary.paused_domains}")
    print(f"Batch proof root: {summary.batch_proof_root}")
    print(f"Timeline: {summary.timeline}")
    if summary.owner_actions:
        print(f"Owner actions: {summary.owner_actions}")


if __name__ == "__main__":
    main()
