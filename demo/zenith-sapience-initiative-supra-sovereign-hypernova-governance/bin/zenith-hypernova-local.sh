#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

if [[ "$#" -ne 0 || "${NETWORK:-localhost}" != "localhost" ]]; then
  echo 'Hypernova local rehearsal accepts no arguments and requires NETWORK=localhost.' >&2
  exit 1
fi
NETWORK_NAME="localhost"
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
export AURORA_MISSION_CONFIG="demo/asi-global/config/mission@v2.json"
unset AURORA_REPORT_NAMESPACE AURORA_DEPLOY_OUTPUT

node demo/zenith-sapience-initiative-supra-sovereign-hypernova-governance/bin/prepare-reports.cjs local

NETWORK="$NETWORK_NAME" npm run demo:asi-global:local
