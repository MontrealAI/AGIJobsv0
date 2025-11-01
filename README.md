# AGI Jobs v0 (v2)

AGI Jobs v0 (v2) is delivered as a production-hardened intelligence platform—a superintelligent machine engineered to compound value, command critical infrastructure, and realign global-scale operations with verifiable safety.

## Why It Matters
- **Unified Intelligence:** Orchestrates smart contracts, agent gateways, validators, and observability into a cohesive mission fabric.
- **Operator Ready:** Non-technical mission owners can activate playbooks through curated runbooks and one-click demos.
- **Safety First:** Every component inherits deterministic guardrails, sentinel monitoring, and immutable audit flows.

## Repository Structure
### Strategic Directories
- `.github`
- `agent-gateway`
- `apps`
- `attestation`
- `backend`
- `ci`
- `config`
- `contracts`
- `cypress`
- `data`
- `demo`
- `deploy`
- `deployment-config`
- `docs`
- `echidna`
- `examples`
- `gas-snapshots`
- `internal_docs`
- `kardashev_ii_omega_grade_alpha_agi_business_3_demo`
- `kardashev_ii_omega_grade_alpha_agi_business_3_demo_k2`

### Key Files
- `.coveragerc`
- `.dockerignore`
- `.env`
- `.env.example`
- `.gitignore`
- `.npmrc`
- `.nvmrc`
- `.prettierrc`
- `.solcover.js`
- `.solhint.ci.json`
- `.solhint.json`
- `.trivyignore`
- `audit-ci.json`
- `CHANGELOG.md`
- `compose.yaml`
- `cypress.config.ts`
- `echidna.yaml`
- `eslint.config.js`
- `foundry.toml`
- `hardhat.config.js`

## Getting Started
1. Ensure you are running Node.js 20.18.1 (matching `.nvmrc`) and Python 3.11+.
2. Bootstrap dependencies:
   ```bash
   npm install
   python -m pip install -r requirements-python.txt
   ```
3. Validate the full CI workflow locally:
   ```bash
   npm run lint --if-present
   npm test
   npm run webapp:build --if-present
   make operator:green
   ```
4. Commit using signed commits and open a pull request—CI on main enforces the same suite to guarantee an evergreen, fully green signal.

## Architecture
```mermaid
flowchart TD
    subgraph Owners[Owner Control Plane]
        Runbooks --> Policy
        Policy --> Upgrades
    end

    subgraph Core[AGI Jobs v0 (v2) Core Intelligence]
        Contracts[[Smart Contracts]]
        Services[[Node & API Services]]
        Apps[[Operator & Validator Apps]]
        DataLake[(Knowledge Graph & Telemetry)]
    end

    subgraph Frontiers[Mission Demos & Scenarios]
        Demos[[High-Stakes Scenarios]]
    end

    Owners --> Core
    Core --> Observability[[CI / CD, Security, QA]]
    Core --> Governance[[Sentinel & Thermostat]]
    Core --> Frontiers
    Frontiers --> Feedback[[Learning & Alignment Loop]]
```

## Mission Operations
- **Owner Control:** Use the scripts under `scripts/v2/` (`owner:*`, `platform:*`, `thermostat:*`) to steer upgrades, registry changes, and emergency responses.
- **Agent Gateway:** Reference [`agent-gateway/`](agent-gateway/README.md) for mission-to-agent integration patterns.
- **Validator Mesh:** See [`apps/validator-ui/`](apps/validator-ui/README.md) and [`demo/Validator-Constellation-v0/`](demo/Validator-Constellation-v0/README.md) for validator orchestration.
- **Thermal Stability:** [`services/thermostat/`](services/thermostat/README.md) documents the thermal regulation engine that guards systemic health.

## Quality Gates & CI
- Pull requests run linting, unit tests, security scans (`npm run security:audit`), SBOM generation, and scenario demos.
- Branch protection blocks merges unless **every** required workflow reports green, mirroring our mandate for a flawless, production-critical deployment.
- Use `npm run release:verify` and `npm run release:notes` before tagging to guarantee verifiable releases.

## Documentation & Support
- Deep-dive handbooks live in `docs/` (see [`docs/user-guides/`](docs/user-guides/README.md)).
- Operational safety escalations are codified in [`OperatorRunbook.md`](OperatorRunbook.md) and [`RUNBOOK.md`](RUNBOOK.md).
- Security posture, threat models, and disclosure process are in [`SECURITY.md`](SECURITY.md).

## Contributing
1. Fork the repository and create a feature branch.
2. Keep commits small, signed, and well-documented.
3. Update any impacted module README using `python tools/update_readmes.py` to keep documentation synchronized.
4. Open a pull request; link dashboards, datasets, or mermaid diagrams that showcase the mission impact.

## License
Released under the MIT License. See [`LICENSE`](LICENSE) for details.
