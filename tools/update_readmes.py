from __future__ import annotations

import re
import textwrap
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXCLUDE_DIR_NAMES = {"node_modules", ".git", "__pycache__", "dist", "build", "out", "coverage", ".next"}


def humanize_segment(segment: str) -> str:
    if not segment:
        return segment
    if any(ch.isupper() for ch in segment) and not segment.isupper():
        return segment.replace("-", " ").replace("_", " ")
    words = re.split(r"[-_]+", segment)
    return " ".join(word.upper() if len(word) <= 3 else word.capitalize() for word in words if word)


def describe_relative_path(path: Path) -> str:
    relative = path.relative_to(ROOT)
    parts = list(relative.parts[:-1])
    if not parts:
        return "AGI Jobs v0 (v2)"
    return " → ".join(humanize_segment(part) for part in parts)


def collect_children(path: Path, *, limit: int = 12) -> tuple[list[str], list[str]]:
    directories: list[str] = []
    files: list[str] = []
    for child in sorted(path.iterdir(), key=lambda p: (p.is_file(), p.name.lower())):
        if child.name.lower().startswith("readme"):
            continue
        if child.name in {".DS_Store"}:
            continue
        if child.name in EXCLUDE_DIR_NAMES:
            continue
        if child.is_dir():
            directories.append(child.name)
        else:
            files.append(child.name)
    return directories[:limit], files[:limit]


def render_directory_section(path: Path) -> str:
    directories, files = collect_children(path)
    if not directories and not files:
        return "This module currently exposes its functionality programmatically; there are no additional files in this folder."
    lines: list[str] = []
    if directories:
        lines.append("### Key Directories")
        for name in directories:
            lines.append(f"- `{name}`")
    if files:
        lines.append("### Key Files")
        for name in files:
            lines.append(f"- `{name}`")
    return "\n".join(lines)


def make_mermaid_diagram(title: str, module_slug: str) -> str:
    node_id = re.sub(r"[^0-9A-Za-z]", "_", module_slug) or "Module"
    return textwrap.dedent(
        f"""
        ```mermaid
        flowchart LR
            Operators((Mission Owners)) --> {node_id}[[{title}]]
            {node_id} --> Core[[AGI Jobs v0 (v2) Core Intelligence]]
            Core --> Observability[[Unified CI / CD & Observability]]
            Core --> Governance[[Owner Control Plane]]
        ```
        """
    ).strip()


def make_link(prefix: str, target: str) -> str:
    if prefix:
        return f"{prefix}{target}"
    return target


def module_readme(path: Path) -> str:
    relative = path.relative_to(ROOT)
    location = describe_relative_path(path)
    module_slug = str(relative.parent)
    title = f"AGI Jobs v0 (v2) — {location}"

    directory_section = render_directory_section(path.parent)
    mermaid = make_mermaid_diagram(location, module_slug)
    depth = len(relative.parts) - 1
    prefix = "../" * depth

    runbook_link = make_link(prefix, "RUNBOOK.md")
    operator_runbook_link = make_link(prefix, "OperatorRunbook.md")

    body = f"""# {title}

> AGI Jobs v0 (v2) is our sovereign intelligence engine; this module extends that superintelligent machine with specialised capabilities for `{relative.parent}`.

## Overview
- **Path:** `{relative}`
- **Module Focus:** Anchors {location} inside the AGI Jobs v0 (v2) lattice so teams can orchestrate economic, governance, and operational missions with deterministic guardrails.
- **Integration Role:** Interfaces with the unified owner control plane, telemetry mesh, and contract registry to deliver end-to-end resilience.

## Capabilities
- Provides opinionated configuration and assets tailored to `{relative.parent}` while remaining interoperable with the global AGI Jobs v0 (v2) runtime.
- Ships with safety-first defaults so non-technical operators can activate the experience without compromising security or compliance.
- Publishes ready-to-automate hooks for CI, observability, and ledger reconciliation.

## Systems Map
{mermaid}

## Working With This Module
1. From the repository root run `npm install` once to hydrate all workspaces.
2. Inspect the scripts under `scripts/` or this module's `package.json` entry (where applicable) to discover targeted automation for `{relative.parent}`.
3. Execute `npm test` and `npm run lint --if-present` before pushing to guarantee a fully green AGI Jobs v0 (v2) CI signal.
4. Capture mission telemetry with `make operator:green` or the module-specific runbooks documented in [`OperatorRunbook.md`]({operator_runbook_link}).

## Directory Guide
{directory_section}

## Quality & Governance
- Every change must land through a pull request with all required checks green (unit, integration, linting, security scan).
- Reference [`RUNBOOK.md`]({runbook_link}) and [`OperatorRunbook.md`]({operator_runbook_link}) for escalation patterns and owner approvals.
- Keep secrets outside the tree; use the secure parameter stores wired to the AGI Jobs v0 (v2) guardian mesh.

## Next Steps
- Review this module's issue board for open automation, data, or research threads.
- Link new deliverables back to the central manifest via `npm run release:manifest`.
- Publish artefacts (dashboards, mermaid charts, datasets) into `reports/` for downstream intelligence alignment.
"""
    return textwrap.dedent(body).strip() + "\n"


def root_readme() -> str:
    directories, files = collect_children(ROOT, limit=20)
    top_dirs = "\n".join(f"- `{name}`" for name in directories)
    top_files = "\n".join(f"- `{name}`" for name in files)

    architecture_mermaid = textwrap.dedent(
        """
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
        """
    ).strip()

    body = f"""# AGI Jobs v0 (v2)

AGI Jobs v0 (v2) is delivered as a production-hardened intelligence platform—a superintelligent machine engineered to compound value, command critical infrastructure, and realign global-scale operations with verifiable safety.

## Why It Matters
- **Unified Intelligence:** Orchestrates smart contracts, agent gateways, validators, and observability into a cohesive mission fabric.
- **Operator Ready:** Non-technical mission owners can activate playbooks through curated runbooks and one-click demos.
- **Safety First:** Every component inherits deterministic guardrails, sentinel monitoring, and immutable audit flows.

## Repository Structure
### Strategic Directories
{top_dirs}

### Key Files
{top_files}

## Getting Started
1. Ensure you are running Node.js 20.19.0 (matching `.nvmrc`) and Python 3.11+.
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
{architecture_mermaid}

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
"""
    return textwrap.dedent(body).strip() + "\n"


def main() -> None:
    readmes: list[Path] = []
    for path in ROOT.rglob("*"):
        if path.name.lower().startswith("readme") and path.is_file():
            if any(part in EXCLUDE_DIR_NAMES for part in path.parts):
                continue
            readmes.append(path)
    readmes = sorted(readmes)

    for path in readmes:
        if path == ROOT / "README.md":
            content = root_readme()
        else:
            content = module_readme(path)
        path.write_text(content, encoding="utf-8")
        print(f"Updated {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
