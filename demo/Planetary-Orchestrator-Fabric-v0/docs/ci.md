# CI & Branch Protection – Planetary Orchestrator Fabric

The demo ships with first-class CI coverage to guarantee a permanently green `main` branch.

## Workflow

- File: `.github/workflows/demo-planetary-orchestrator-fabric.yml`
- Triggers: `pull_request` (changes under `demo/**`) and manual `workflow_dispatch`
- Steps:
  1. Harden runner egress with Step Security (matching repository baseline).
  2. Install Node dependencies (`npm ci`) to align with repository tooling expectations.
  3. Set up Python 3.11 and install the demo in editable mode with `dev` extras.
  4. Execute `pytest` (with `PYTEST_DISABLE_PLUGIN_AUTOLOAD=1`) against `demo/Planetary-Orchestrator-Fabric-v0/tests`.
  5. Upload test artifacts (reports, checkpoints) for reproducibility.

## Enforcing protection

1. Navigate to **Settings → Branches → Branch protection rules**.
2. Add a rule for `main` (or update the existing v2 rule).
3. Under **Require status checks to pass**, select `demo-planetary-orchestrator-fabric`.
4. Enable **Require branches to be up to date before merging** for deterministic test coverage.

Once configured, every PR must pass the fabric’s deterministic test suite before merging. The suite exercises:

- Balanced job completion across shards.
- Checkpoint round-trips.
- Node failure reassignment behaviour.

This ensures the demo stays production-ready and tamper-evident.
