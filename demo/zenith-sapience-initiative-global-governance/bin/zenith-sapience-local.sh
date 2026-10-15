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
LOCAL_REPORT_ROOT="reports/${NETWORK_NAME}/zenith-sapience"

export ASI_GLOBAL_REPORT_ROOT="$LOCAL_REPORT_ROOT"
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

export AURORA_REPORT_SCOPE="zenith-sapience"
export AURORA_REPORT_TITLE="Zenith Sapience Initiative — Contract-Lifecycle Fixture Report"

printf 'Contract-lifecycle fixture: %s\nBranded project-plan.json is design context; it is not executed by this local rehearsal.\n' \
  "${AURORA_MISSION_CONFIG:-demo/asi-global/config/mission@v2.json}" >&2

node demo/aurora/bin/prepare-local-reports.cjs zenith-sapience

NETWORK="$NETWORK_NAME" npm run demo:asi-global:local
