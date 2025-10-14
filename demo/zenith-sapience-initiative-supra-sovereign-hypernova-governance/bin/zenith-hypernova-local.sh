#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

NETWORK_NAME="${NETWORK:-localhost}"
LOCAL_REPORT_ROOT="reports/${NETWORK_NAME}/zenith-hypernova"

export ASI_GLOBAL_PLAN_PATH="demo/zenith-sapience-initiative-supra-sovereign-hypernova-governance/project-plan.json"
export ASI_GLOBAL_REPORT_ROOT="$LOCAL_REPORT_ROOT"
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

export AURORA_REPORT_SCOPE="zenith-hypernova"
export AURORA_REPORT_TITLE="Hypernova Initiative — Mission Report"

rm -rf "$LOCAL_REPORT_ROOT"
mkdir -p "$LOCAL_REPORT_ROOT"

NETWORK="$NETWORK_NAME" npm run demo:asi-global -- "$@"
