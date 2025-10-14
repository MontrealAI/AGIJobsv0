#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

NETWORK_NAME="${NETWORK:-localhost}"
LOCAL_REPORT_ROOT="reports/${NETWORK_NAME}/zenith-omnidominion"

export ASI_GLOBAL_PLAN_PATH="demo/zenith-sapience-initiative-omnidominion-governance/project-plan.json"
export ASI_GLOBAL_REPORT_ROOT="$LOCAL_REPORT_ROOT"
export ASI_GLOBAL_OUTPUT_BASENAME="zenith-omnidominion-kit"
export ASI_GLOBAL_BUNDLE_NAME="zenith-omnidominion"
export ASI_GLOBAL_MERMAID_TITLE="OmniDominion Governance Topology"
export ASI_GLOBAL_REFERENCE_DOCS_APPEND='[
  {"path":"demo/zenith-sapience-initiative-omnidominion-governance/RUNBOOK.md","description":"Operator runbook for the OmniDominion governance drill."},
  {"path":"demo/zenith-sapience-initiative-omnidominion-governance/OWNER-CONTROL.md","description":"Owner control dossier for OmniDominion."}
]'
export ASI_GLOBAL_ADDITIONAL_ARTIFACTS_APPEND='[
  {"key":"omniRunbook","path":"demo/zenith-sapience-initiative-omnidominion-governance/RUNBOOK.md","description":"Mission procedure guide."},
  {"key":"omniOwnerControl","path":"demo/zenith-sapience-initiative-omnidominion-governance/OWNER-CONTROL.md","description":"Owner authority matrix."},
  {"key":"omniPlan","path":"demo/zenith-sapience-initiative-omnidominion-governance/project-plan.json","description":"Scenario source of truth."}
]'

export AURORA_REPORT_SCOPE="zenith-omnidominion"
export AURORA_REPORT_TITLE="Zenith Sapience OmniDominion — Mission Report"

rm -rf "$LOCAL_REPORT_ROOT"
mkdir -p "$LOCAL_REPORT_ROOT"

NETWORK="$NETWORK_NAME" npm run demo:asi-global -- "$@"
