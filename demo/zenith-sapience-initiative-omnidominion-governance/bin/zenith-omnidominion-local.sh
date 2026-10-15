#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

if [[ "$#" -ne 0 || "${NETWORK-localhost}" != "localhost" ]]; then
  echo 'This local rehearsal accepts no arguments and requires NETWORK=localhost.' >&2
  exit 1
fi
# The local Aurora lifecycle consumes mission configs, not governance-kit plans.
if [[ "${ASI_GLOBAL_PLAN_PATH+x}" == x ]]; then
  echo 'ASI_GLOBAL_PLAN_PATH is unsupported by this local rehearsal. Unset it; use AURORA_MISSION_CONFIG with an Aurora mission config. project-plan.json is design context only.' >&2
  exit 1
fi
source "$ROOT/demo/aurora/bin/local-node.sh"
lock_local_demo "$@"

NETWORK_NAME="localhost"
LOCAL_REPORT_ROOT="reports/${NETWORK_NAME}/zenith-omnidominion"

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
  {"key":"omniPlan","path":"demo/zenith-sapience-initiative-omnidominion-governance/project-plan.json","description":"Design context; not executed by this local rehearsal."}
]'

export AURORA_REPORT_SCOPE="zenith-omnidominion"
export AURORA_REPORT_TITLE="Zenith Sapience OmniDominion — Contract-Lifecycle Fixture Report"

printf 'Contract-lifecycle fixture: %s\nBranded project-plan.json is design context; it is not executed by this local rehearsal.\n' \
  "${AURORA_MISSION_CONFIG:-demo/asi-global/config/mission@v2.json}" >&2

node demo/aurora/bin/prepare-local-reports.cjs zenith-omnidominion

NETWORK="$NETWORK_NAME" npm run demo:asi-global:local
