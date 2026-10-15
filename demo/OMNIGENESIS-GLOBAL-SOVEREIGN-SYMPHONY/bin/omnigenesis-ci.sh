#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'HELP'
Usage: omnigenesis-ci.sh [--help | --plan [PLAN] | --rehearse [PLAN [REPORT_ROOT]]]
Default/help: print this message without running a pipeline or writing reports.
--plan: read-only analysis of an existing ASI Take-Off scenario plan.
--rehearse: explicitly run shared Hardhat fixtures and bind the plan as report context.
  Scenario jobs, identities and physical projects are not executed or verified.
  AGIJOBS_FLAGSHIP_SKIP_ONCHAIN=true selects illustrative offline reports instead.
  REPORT_ROOT must be reports/localhost/omnigenesis-global-symphony (or its absolute path).
HELP
}

MODE="${1:---help}"
case "$MODE" in
  --help|-h)
    [[ "$#" -le 1 ]] || { usage >&2; exit 1; }
    usage
    exit 0
    ;;
  --plan|--rehearse) shift ;;
  *) usage >&2; echo 'Choose --plan or explicitly authorize fixtures with --rehearse.' >&2; exit 1 ;;
esac
if [[ "$#" -gt 2 || ( "$MODE" == --plan && "$#" -gt 1 ) ]]; then
  usage >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"
PLAN_PATH="${1-${ASI_TAKEOFF_PLAN_PATH-$ROOT/demo/OMNIGENESIS-GLOBAL-SOVEREIGN-SYMPHONY/project-plan.json}}"
REPORT_ROOT="$ROOT/reports/localhost/omnigenesis-global-symphony"

if [[ "$MODE" == --plan ]]; then
  node - "$PLAN_PATH" <<'NODE'
const fs = require('node:fs');
const { analyze } = require('./demo/asi-takeoff/scripts/plan.cjs');
console.log(JSON.stringify(analyze(JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))), null, 2));
NODE
  exit 0
fi

if [[ "${NETWORK-localhost}" != localhost || "${AURORA_REPORT_SCOPE-omnigenesis-global-symphony}" != omnigenesis-global-symphony || "${HARDHAT_NETWORK-hardhat}" != hardhat ]]; then
  echo 'Omnigenesis requires NETWORK=localhost, AURORA_REPORT_SCOPE=omnigenesis-global-symphony and HARDHAT_NETWORK=hardhat (or leave them unset). These are shared local fixtures only.' >&2
  exit 1
fi
if [[ "${ASI_TAKEOFF_REPORT_ROOT+x}" == x ]]; then
  echo 'ASI_TAKEOFF_REPORT_ROOT overrides are unsupported by this launcher; unset it to use the isolated Omnigenesis report scope.' >&2
  exit 1
fi
if [[ "${AGIJOBS_FLAGSHIP_SKIP_ONCHAIN-false}" != true && "${AGIJOBS_FLAGSHIP_SKIP_ONCHAIN-false}" != false ]]; then
  echo 'AGIJOBS_FLAGSHIP_SKIP_ONCHAIN must be true or false (or leave it unset).' >&2
  exit 1
fi

# Validate every selected input before acquiring locks or archiving old evidence.
PLAN_PATH="$(node - "$PLAN_PATH" "${2-${OMNIGENESIS_REPORT_ROOT-$REPORT_ROOT}}" "$REPORT_ROOT" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const { analyze } = require('./demo/asi-takeoff/scripts/plan.cjs');
const [input, output, expected] = process.argv.slice(2);
if (!output || path.resolve(output) !== expected)
  throw new Error('REPORT_ROOT must be reports/localhost/omnigenesis-global-symphony (or its absolute path).');
if (!input || /[\r\n]/.test(input)) throw new Error('PLAN must name an existing scenario JSON file.');
const plan = fs.realpathSync(input);
if (plan === expected || plan.startsWith(expected + path.sep))
  throw new Error('Keep the source plan outside the report scope that will be archived.');
analyze(JSON.parse(fs.readFileSync(plan, 'utf8')));
console.log(plan);
NODE
)"

source "$ROOT/demo/aurora/bin/local-node.sh"
lock_local_demo --rehearse "$PLAN_PATH" "$REPORT_ROOT"
node "$ROOT/demo/aurora/bin/prepare-local-reports.cjs" omnigenesis-global-symphony

export ASI_TAKEOFF_PLAN_PATH="$PLAN_PATH"
export ASI_TAKEOFF_REPORT_ROOT="$REPORT_ROOT"
export HARDHAT_NETWORK=hardhat

printf '%s\n' '[omnigenesis-ci] Shared fixture rehearsal; the supplied plan is report context only.' >&2
npm run demo:asi-takeoff

printf '%s\n' '[omnigenesis-ci] Binding the same scenario plan and report files into the governance kit.' >&2
npm run demo:asi-takeoff:kit -- \
  --plan "$PLAN_PATH" \
  --report-root "$REPORT_ROOT" \
  --summary-md "$REPORT_ROOT/summary.md" \
  --bundle "$REPORT_ROOT/mission-bundle" \
  --logs "$REPORT_ROOT/logs" \
  --network hardhat

printf '%s\n' "[omnigenesis-ci] Reports available under $REPORT_ROOT; no scenario execution or production approval is implied." >&2
