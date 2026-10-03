# AGI Jobs v0 (v2) — Demo → Tiny Recursive Model v0

> AGI Jobs v0 (v2) is our sovereign intelligence engine; this module extends that superintelligent machine with specialised capabilities for `demo/Tiny-Recursive-Model-v0`.

## Run the headless demo

From the repository root, use a Python 3.12 virtual environment:

```bash
python3.12 -m venv .venv-trm
source .venv-trm/bin/activate
python -m pip install -r demo/Tiny-Recursive-Model-v0/requirements-core.txt --extra-index-url https://download.pytorch.org/whl/cpu
python -m pip check
python demo/Tiny-Recursive-Model-v0/run_demo.py explain
python demo/Tiny-Recursive-Model-v0/run_demo.py simulate --trials 24 --seed 7
python -m pytest demo/Tiny-Recursive-Model-v0/tests test/demo/test_tiny_recursive_model_demo.py
```

The CLI reports synthetic task outcomes and simulated economics. These are not live paid settlements or measured production ROI. For the optional Streamlit dashboard, install `requirements.txt` in a separate virtual environment; its web dependencies must not overwrite the platform API's dependencies. When combining headless tests with the platform, install both requirement files in one pip invocation and run `python -m pip check`.


## Overview
- **Path:** `demo/Tiny-Recursive-Model-v0/README.md`
- **Module Focus:** Anchors Demo → Tiny Recursive Model v0 inside the AGI Jobs v0 (v2) lattice so teams can orchestrate economic, governance, and operational missions with deterministic guardrails.
- **Integration Role:** Interfaces with the unified owner control plane, telemetry mesh, and contract registry to deliver end-to-end resilience.

## Capabilities
- Provides opinionated configuration and assets tailored to `demo/Tiny-Recursive-Model-v0` while remaining interoperable with the global AGI Jobs v0 (v2) runtime.
- Ships with safety-first defaults so non-technical operators can activate the experience without compromising security or compliance.
- Publishes ready-to-automate hooks for CI, observability, and ledger reconciliation.

## Systems Map
```mermaid
flowchart LR
    Operators((Mission Owners)) --> demo_Tiny_Recursive_Model_v0[[Demo → Tiny Recursive Model v0]]
    demo_Tiny_Recursive_Model_v0 --> Core[[AGI Jobs v0 (v2) Core Intelligence]]
    Core --> Observability[[Unified CI / CD & Observability]]
    Core --> Governance[[Owner Control Plane]]
```

## Working With This Module
1. From the repository root run `npm install` once to hydrate all workspaces.
2. Inspect the scripts under `scripts/` or this module's `package.json` entry (where applicable) to discover targeted automation for `demo/Tiny-Recursive-Model-v0`.
3. Execute `npm test` and `npm run lint --if-present` before pushing to guarantee a fully green AGI Jobs v0 (v2) CI signal.
4. Capture mission telemetry with `make operator:green` or the module-specific runbooks documented in [`OperatorRunbook.md`](../../OperatorRunbook.md).

## Directory Guide
### Key Directories
- `assets`
- `config`
- `data`
- `notebooks`
- `src`
- `tests`
- `trm_demo`
- `ui`
- `web`
### Key Files
- `__init__.py`
- `demo_runner.py`
- `main.py`
- `Makefile`
- `OPERATOR_PLAYBOOK.md`
- `requirements.txt`
- `run_demo.py`
- `streamlit_app.py`

## Quality & Governance
- Every change must land through a pull request with all required checks green (unit, integration, linting, security scan).
- Reference [`RUNBOOK.md`](../../RUNBOOK.md) and [`OperatorRunbook.md`](../../OperatorRunbook.md) for escalation patterns and owner approvals.
- Keep secrets outside the tree; use the secure parameter stores wired to the AGI Jobs v0 (v2) guardian mesh.

## Next Steps
- Review this module's issue board for open automation, data, or research threads.
- Link new deliverables back to the central manifest via `npm run release:manifest`.
- Publish artefacts (dashboards, mermaid charts, datasets) into `reports/` for downstream intelligence alignment.
