#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

REPORT_ROOT="reports/zenith-sapience"

export ASI_GLOBAL_PLAN_PATH="demo/zenith-sapience-initiative-global-governance/project-plan.json"
export ASI_GLOBAL_REPORT_ROOT="$REPORT_ROOT"
export ASI_GLOBAL_OUTPUT_BASENAME="zenith-sapience-initiative-kit"
export ASI_GLOBAL_BUNDLE_NAME="zenith-sapience"
export ASI_GLOBAL_MERMAID_TITLE="Zenith Sapience Owner Topology"
export ASI_GLOBAL_REFERENCE_DOCS_APPEND='[
  {"path":"demo/zenith-sapience-initiative-global-governance/RUNBOOK.md","description":"Zenith Sapience operator runbook."},
  {"path":"demo/zenith-sapience-initiative-global-governance/OWNER-CONTROL.md","description":"Owner control matrix for the Zenith Sapience Initiative."}
]'
export ASI_GLOBAL_ADDITIONAL_ARTIFACTS_APPEND='[
  {"key":"zenithRunbook","path":"demo/zenith-sapience-initiative-global-governance/RUNBOOK.md","description":"Mission runbook for Zenith Sapience."},
  {"key":"zenithOwnerControl","path":"demo/zenith-sapience-initiative-global-governance/OWNER-CONTROL.md","description":"Owner control dossier for Zenith Sapience."}
]'

rm -rf "$REPORT_ROOT"
mkdir -p "$REPORT_ROOT"

npm run demo:asi-global -- "$@"
