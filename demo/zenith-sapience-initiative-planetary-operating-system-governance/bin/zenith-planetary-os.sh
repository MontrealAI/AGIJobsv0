#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

REPORT_ROOT="reports/zenith-planetary-os"

export ASI_GLOBAL_PLAN_PATH="demo/zenith-sapience-initiative-planetary-operating-system-governance/project-plan.json"
export ASI_GLOBAL_REPORT_ROOT="$REPORT_ROOT"
export ASI_GLOBAL_OUTPUT_BASENAME="zenith-planetary-os-governance-kit"
export ASI_GLOBAL_BUNDLE_NAME="zenith-planetary-os"
export ASI_GLOBAL_MERMAID_TITLE="Zenith Sapience Planetary Operating System"
export ASI_GLOBAL_REFERENCE_DOCS_APPEND='[
  {"path":"demo/zenith-sapience-initiative-planetary-operating-system-governance/RUNBOOK.md","description":"Zenith Sapience Planetary OS operator runbook."},
  {"path":"demo/zenith-sapience-initiative-planetary-operating-system-governance/OWNER-CONTROL.md","description":"Owner control matrix for Zenith Sapience Planetary OS."},
  {"path":"demo/zenith-sapience-initiative-planetary-operating-system-governance/README.md","description":"Overview of the Zenith Sapience Planetary OS demo."}
]'
export ASI_GLOBAL_ADDITIONAL_ARTIFACTS_APPEND='[
  {"key":"zenithPlanetaryRunbook","path":"demo/zenith-sapience-initiative-planetary-operating-system-governance/RUNBOOK.md","description":"Mission runbook for Zenith Sapience Planetary OS."},
  {"key":"zenithPlanetaryOwnerControl","path":"demo/zenith-sapience-initiative-planetary-operating-system-governance/OWNER-CONTROL.md","description":"Owner control dossier for Zenith Sapience Planetary OS."},
  {"key":"zenithPlanetaryOverview","path":"demo/zenith-sapience-initiative-planetary-operating-system-governance/README.md","description":"Demo overview for Zenith Sapience Planetary OS."}
]'

rm -rf "$REPORT_ROOT"
mkdir -p "$REPORT_ROOT"

npm run demo:asi-global -- "$@"
