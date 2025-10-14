#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

NETWORK_NAME="${NETWORK:-localhost}"
LOCAL_REPORT_ROOT="reports/${NETWORK_NAME}/zenith-celestial-archon"

export ASI_GLOBAL_PLAN_PATH="demo/zenith-sapience-initiative-celestial-archon-governance/project-plan.json"
export ASI_GLOBAL_REPORT_ROOT="$LOCAL_REPORT_ROOT"
export ASI_GLOBAL_OUTPUT_BASENAME="zenith-celestial-archon-kit"
export ASI_GLOBAL_BUNDLE_NAME="zenith-celestial-archon"
export ASI_GLOBAL_MERMAID_TITLE="Zenith Sapience Celestial Archon Topology"
export ASI_GLOBAL_REFERENCE_DOCS_APPEND='[
  {"path":"demo/zenith-sapience-initiative-celestial-archon-governance/RUNBOOK.md","description":"Celestial Archon execution runbook."},
  {"path":"demo/zenith-sapience-initiative-celestial-archon-governance/OWNER-CONTROL.md","description":"Owner control matrix for the Celestial Archon cycle."}
]'
export ASI_GLOBAL_ADDITIONAL_ARTIFACTS_APPEND='[
  {"key":"celestialArchonRunbook","path":"demo/zenith-sapience-initiative-celestial-archon-governance/RUNBOOK.md","description":"Mission runbook for the Celestial Archon demonstration."},
  {"key":"celestialArchonOwnerControl","path":"demo/zenith-sapience-initiative-celestial-archon-governance/OWNER-CONTROL.md","description":"Owner control dossier for the Celestial Archon demonstration."}
]'

export AURORA_REPORT_SCOPE="zenith-celestial-archon"
export AURORA_REPORT_TITLE="Zenith Sapience Celestial Archon — Mission Report"

rm -rf "$LOCAL_REPORT_ROOT"
mkdir -p "$LOCAL_REPORT_ROOT"

NETWORK="$NETWORK_NAME" npm run demo:asi-global -- "$@"
