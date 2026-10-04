# Start here: AGI Jobs v0 (v2)

This repository contains smart contracts, agent and validator services, operator interfaces, and demonstrations of an agent-work marketplace. Begin locally, inspect the evidence, and then follow the deployment runbooks for your chosen environment.

**Current release posture:** local development and demonstrations are testable. The contract-size blocker is resolved through fixed implementations and staged deployment. Release remains blocked by unconfigured maintainer signing trust and the integration/configuration requirements in the readiness report. Read the [readiness report](production/readiness-2026-10-04.md) before preparing any deployment.

## Choose your route

| Your goal | Open this |
| --- | --- |
| Understand the architecture and its diagrams | [Repository overview](../README.md#architecture-panorama) |
| Explore a working model demo without a wallet | [Tiny Recursive Model setup](../demo/Tiny-Recursive-Model-v0/README.md#run-the-headless-demo) |
| Execute a job from creation to local settlement | [AURORA walkthrough](../demo/aurora/README.md#run-the-local-job-lifecycle) |
| Run a three-job local mission with receipts | [ASI Take-Off walkthrough](../demo/asi-takeoff/README.md#run-the-three-job-local-walkthrough) |
| Rehearse release, provider failures, security controls, and commissioning | [Production rehearsal](production/rehearsal.md) |
| Choose, run, or validate any demo | [Demo guide and complete catalog](../demo/README.md) |
| Find a subsystem manual | [Documentation catalog](readme-catalog.md) |
| Run the browser console | [Console instructions](../apps/console/README.md) |
| Develop agent integration | [Gateway guide](../agent-gateway/README.md) |
| Coordinate browser and desktop work | [Computer-work setup and recovery](computer-work.md), then [the executable supplier-desk lab](../demo/One-Box/computer-work/README.md) |
| Understand owner controls | [Operator runbook](../OperatorRunbook.md) |
| Prepare a production deployment | [Readiness report](production/readiness-2026-10-04.md), then [security deployment guide](security-deployment-guide.md) |

## Reproduce the local baseline

Use Node **22.23.3**, npm **10.8.2**, and Python **3.12**. The commands below assume a POSIX shell and an installed `nvm`. Run from the repository root.

```bash
nvm install
nvm use
npm install --global npm@10.8.2
CYPRESS_INSTALL_BINARY=0 npm ci
npm run doctor:node
npm run ci:preflight
npm run compile
npm test
```

`CYPRESS_INSTALL_BINARY=0` defers the browser download during dependency setup. Browser end-to-end tests install their binary separately. Keep optional npm dependencies: Solidity tooling uses platform-specific binaries.

Create an isolated Python environment rather than modifying your system packages:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-python.txt
python -m pip check
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python -m pytest
```

To include the neural-model tests, resolve both requirement sets together:

```bash
python -m pip install -r requirements-python.txt -r demo/Tiny-Recursive-Model-v0/requirements-core.txt --extra-index-url https://download.pytorch.org/whl/cpu
python -m pip check
OMP_NUM_THREADS=1 MKL_NUM_THREADS=1 PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python -m pytest -m requires_torch
```

Install the optional model dashboard in its own virtual environment. Its Streamlit dependencies may conflict with the platform API's pinned FastAPI version.

## Inspect readiness before releasing

```bash
npm run release:check-size
npm run ci:verify-signers
```

The size check passes for the modular contracts. The signer check intentionally fails on the example signing keys. Read the [deployment architecture guide](production/fixed-implementations.md) before deploying new controllers. Follow their diagnostic output and the [remaining work](production/readiness-2026-10-04.md#production-gates-still-requiring-authentic-evidence). Do not interpret a green local test suite, simulated economy, dashboard, or successful compilation as evidence of a deployable or audited production system.

This repository's v2 contract configuration uses the 18-decimal `$AGIALPHA` token. Confirm the actual token, chain, contract addresses, and deployment manifest for the workflow you run; do not substitute another AGI Jobs repository's settlement assumptions.

## Common setup problems

| Symptom | Action |
| --- | --- |
| Node doctor reports the wrong version | Run `nvm use` at the repository root; check both `node -v` and `npm -v`. |
| Python dependency conflict or router import error | Use a fresh virtual environment; install all required files in one pip command, then run `python -m pip check`. |
| Native Python dependency cannot build | Install your platform's C compiler and Python headers; on a managed interpreter select an available compiler with `CC=gcc`. |
| Missing Solidity artifacts | Run `npm run compile` before contract tests and the size gate. |
| A live command asks for RPC or wallet configuration | Read that command's runbook. Preview flags differ by command; signing and configuration changes may write on-chain. |
| Release signer validation fails | Replace the illustrative entries with authorized SSH public keys using the [signer guide](../.github/signers/README.md#configure-release-trust). |
