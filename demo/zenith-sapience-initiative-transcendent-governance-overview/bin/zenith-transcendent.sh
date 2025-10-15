#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

REPORT_ROOT="reports/zenith-sapience-transcendent"

export ASI_GLOBAL_PLAN_PATH="demo/zenith-sapience-initiative-transcendent-governance-overview/project-plan.json"
export ASI_GLOBAL_REPORT_ROOT="$REPORT_ROOT"
export ASI_GLOBAL_OUTPUT_BASENAME="zenith-sapience-transcendent-kit"
export ASI_GLOBAL_BUNDLE_NAME="zenith-sapience-transcendent"
export ASI_GLOBAL_MERMAID_TITLE="Zenith Sapience Transcendent Topology"
export ASI_GLOBAL_REFERENCE_DOCS_APPEND='[
  {"path":"demo/zenith-sapience-initiative-transcendent-governance-overview/RUNBOOK.md","description":"Transcendent Governance operator runbook."},
  {"path":"demo/zenith-sapience-initiative-transcendent-governance-overview/OWNER-CONTROL.md","description":"Owner control matrix for the Transcendent Governance Overview."}
]'
export ASI_GLOBAL_ADDITIONAL_ARTIFACTS_APPEND='[
  {"key":"zenithTranscendentRunbook","path":"demo/zenith-sapience-initiative-transcendent-governance-overview/RUNBOOK.md","description":"Mission runbook for the Transcendent Governance Overview."},
  {"key":"zenithTranscendentOwnerControl","path":"demo/zenith-sapience-initiative-transcendent-governance-overview/OWNER-CONTROL.md","description":"Owner control dossier for the Transcendent Governance Overview."}
]'

rm -rf "$REPORT_ROOT"
mkdir -p "$REPORT_ROOT"

npm run demo:asi-global -- "$@"
