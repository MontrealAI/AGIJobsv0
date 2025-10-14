#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

REPORT_ROOT="reports/zenith-hypernova"

export ASI_GLOBAL_PLAN_PATH="demo/zenith-sapience-initiative-supra-sovereign-hypernova-governance/project-plan.json"
export ASI_GLOBAL_REPORT_ROOT="$REPORT_ROOT"
export ASI_GLOBAL_OUTPUT_BASENAME="zenith-hypernova-governance-kit"
export ASI_GLOBAL_BUNDLE_NAME="zenith-hypernova"
export ASI_GLOBAL_MERMAID_TITLE="Hypernova Governance Topology"
export ASI_GLOBAL_REFERENCE_DOCS_APPEND='[
  {"path":"demo/zenith-sapience-initiative-supra-sovereign-hypernova-governance/RUNBOOK.md","description":"Hypernova operator runbook."},
  {"path":"demo/zenith-sapience-initiative-supra-sovereign-hypernova-governance/OWNER-CONTROL.md","description":"Owner control matrix for the Hypernova initiative."}
]'
export ASI_GLOBAL_ADDITIONAL_ARTIFACTS_APPEND='[
  {"key":"hypernovaRunbook","path":"demo/zenith-sapience-initiative-supra-sovereign-hypernova-governance/RUNBOOK.md","description":"Mission runbook for the Hypernova initiative."},
  {"key":"hypernovaOwnerControl","path":"demo/zenith-sapience-initiative-supra-sovereign-hypernova-governance/OWNER-CONTROL.md","description":"Owner control dossier for the Hypernova initiative."}
]'

rm -rf "$REPORT_ROOT"
mkdir -p "$REPORT_ROOT"

npm run demo:asi-global -- "$@"
