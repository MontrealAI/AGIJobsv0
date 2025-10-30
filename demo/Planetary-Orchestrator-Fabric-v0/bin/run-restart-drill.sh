#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEMO_DIR="$ROOT_DIR/demo/Planetary-Orchestrator-Fabric-v0"
DEFAULT_CONFIG="$DEMO_DIR/config/fabric.example.json"
DEFAULT_OWNER_COMMANDS="$DEMO_DIR/config/owner-commands.example.json"
CONFIG="$DEFAULT_CONFIG"
CONFIG_SET=0
PLAN=""
PLAN_SET=0
OWNER_COMMANDS="$DEFAULT_OWNER_COMMANDS"
OWNER_COMMANDS_SET=0
JOBS=10000
JOBS_SET=0
STOP_AFTER=180
STOP_AFTER_SET=0
OUTAGE="mars.gpu-helion"
OUTAGE_SET=0
LABEL=""
LABEL_SET=0
BLUEPRINT=""
BLUEPRINT_SET=0

usage() {
  cat <<USAGE
Usage: $(basename "$0") [options]

  --config <path>             Path to the fabric configuration JSON (default: $DEFAULT_CONFIG)
  --plan <path>               Path to mission plan JSON bundling config, blueprint, and schedule
  --owner-commands <path>     Path to owner command schedule (default: $DEFAULT_OWNER_COMMANDS)
  --jobs <count>              Total jobs to seed before the drill (default: 10000)
  --stop-after <ticks>        Number of ticks to run before simulating orchestrator shutdown (default: 180)
  --outage <nodeId>           Node ID to mark offline during stage one (default: mars.gpu-helion)
  --jobs-blueprint <path>     Optional job blueprint JSON applied to both stages
  --label <name>              Label for generated reports (default: resume-drill-<timestamp>)
  -h, --help                  Show this message
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --config)
      [[ $# -lt 2 ]] && { echo "Missing value for $1" >&2; exit 1; }
      CONFIG="$2"
      CONFIG_SET=1
      shift 2
      ;;
    --plan)
      [[ $# -lt 2 ]] && { echo "Missing value for $1" >&2; exit 1; }
      PLAN="$2"
      PLAN_SET=1
      shift 2
      ;;
    --owner-commands)
      [[ $# -lt 2 ]] && { echo "Missing value for $1" >&2; exit 1; }
      OWNER_COMMANDS="$2"
      OWNER_COMMANDS_SET=1
      shift 2
      ;;
    --jobs)
      [[ $# -lt 2 ]] && { echo "Missing value for $1" >&2; exit 1; }
      JOBS="$2"
      JOBS_SET=1
      shift 2
      ;;
    --stop-after)
      [[ $# -lt 2 ]] && { echo "Missing value for $1" >&2; exit 1; }
      STOP_AFTER="$2"
      STOP_AFTER_SET=1
      shift 2
      ;;
    --outage)
      [[ $# -lt 2 ]] && { echo "Missing value for $1" >&2; exit 1; }
      OUTAGE="$2"
      OUTAGE_SET=1
      shift 2
      ;;
    --label)
      [[ $# -lt 2 ]] && { echo "Missing value for $1" >&2; exit 1; }
      LABEL="$2"
      LABEL_SET=1
      shift 2
      ;;
    --jobs-blueprint)
      [[ $# -lt 2 ]] && { echo "Missing value for $1" >&2; exit 1; }
      BLUEPRINT="$2"
      BLUEPRINT_SET=1
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ $PLAN_SET -eq 1 && $CONFIG_SET -eq 1 ]]; then
  echo "Use --config or --plan, but not both." >&2
  exit 1
fi

if [[ $PLAN_SET -eq 0 && $CONFIG_SET -eq 0 ]]; then
  CONFIG="$DEFAULT_CONFIG"
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required to run this drill." >&2
  exit 1
fi

if [[ $PLAN_SET -eq 1 ]]; then
  CONTEXT_JSON="$(npx tsx "$DEMO_DIR/src/mission-context.ts" --plan "$PLAN")"
else
  CONTEXT_JSON="$(npx tsx "$DEMO_DIR/src/mission-context.ts" --config "$CONFIG")"
fi

extract_context() {
  printf '%s' "$CONTEXT_JSON" | jq -r "$1"
}

REPORT_BASE="$(extract_context '.reportingDirectory')"
if [[ -z "$REPORT_BASE" || "$REPORT_BASE" == "null" ]]; then
  REPORT_BASE="$DEMO_DIR/reports"
fi

PLAN_LABEL="$(extract_context '.missionPlan.run.outputLabel // empty')"
DEFAULT_LABEL="$(extract_context '.reportingDefaultLabel // empty')"
if [[ $LABEL_SET -eq 0 ]]; then
  if [[ -n "$PLAN_LABEL" ]]; then
    LABEL="$PLAN_LABEL"
  elif [[ -n "$DEFAULT_LABEL" ]]; then
    LABEL="$DEFAULT_LABEL"
  else
    LABEL="resume-drill-$(date -u +%Y%m%d%H%M%S)"
  fi
fi

PLAN_JOBS="$(extract_context '.missionPlan.run.jobs // empty')"
if [[ $JOBS_SET -eq 0 && -n "$PLAN_JOBS" ]]; then
  JOBS="$PLAN_JOBS"
fi

PLAN_STOP="$(extract_context '.missionPlan.run.stopAfterTicks // empty')"
if [[ $STOP_AFTER_SET -eq 0 && -n "$PLAN_STOP" ]]; then
  STOP_AFTER="$PLAN_STOP"
fi

PLAN_OUTAGE="$(extract_context '.missionPlan.run.simulateOutage // empty')"
if [[ $OUTAGE_SET -eq 0 && -n "$PLAN_OUTAGE" ]]; then
  OUTAGE="$PLAN_OUTAGE"
fi

PLAN_PRESERVE="$(extract_context '.missionPlan.run.preserveReportDirOnResume | if . == null then "" else tostring end')"
if [[ $PLAN_SET -eq 1 && $OWNER_COMMANDS_SET -eq 0 ]]; then
  OWNER_COMMANDS=""
fi

mkdir -p "$REPORT_BASE"

REPORT_DIR="$REPORT_BASE/$LABEL"
SUMMARY_PATH="$REPORT_DIR/summary.json"

echo "🚀 Stage 1: Launching planetary fabric and halting after $STOP_AFTER ticks to simulate orchestrator failure"
CMD_STAGE_ONE=(npx tsx "$DEMO_DIR/src/index.ts")
if [[ $PLAN_SET -eq 1 ]]; then
  CMD_STAGE_ONE+=(--plan "$PLAN")
else
  CMD_STAGE_ONE+=(--config "$CONFIG")
fi
CMD_STAGE_ONE+=(
  --jobs "$JOBS"
  --output-label "$LABEL"
  --stop-after-ticks "$STOP_AFTER"
  --preserve-report-on-resume "${PLAN_PRESERVE:-true}"
)
if [[ -n "$OWNER_COMMANDS" ]]; then
  CMD_STAGE_ONE+=(--owner-commands "$OWNER_COMMANDS")
fi
if [[ -n "$OUTAGE" ]]; then
  CMD_STAGE_ONE+=(--simulate-outage "$OUTAGE")
fi
if [[ -n "$BLUEPRINT" ]]; then
  CMD_STAGE_ONE+=(--jobs-blueprint "$BLUEPRINT")
fi
STAGE_ONE_LOG=$(mktemp)
set -o pipefail
"${CMD_STAGE_ONE[@]}" | tee "$STAGE_ONE_LOG"

SUMMARY_PATH="$(node - <<'NODE' "$STAGE_ONE_LOG"
const fs = require('fs');
const path = process.argv[1];
const text = fs.readFileSync(path, 'utf8');
const match = text.match(/\{[\s\S]*\}\s*$/);
if (!match) {
  process.exit(1);
}
const parsed = JSON.parse(match[0]);
const summaryPath = parsed?.artifacts?.summaryPath;
if (!summaryPath) {
  process.exit(1);
}
process.stdout.write(summaryPath);
NODE
)"
rm -f "$STAGE_ONE_LOG"

REPORT_DIR="$(dirname "$SUMMARY_PATH")"

echo "🔎 Capturing checkpoint path from stage one"
if [[ ! -f "$SUMMARY_PATH" ]]; then
  echo "Expected summary not found at $SUMMARY_PATH" >&2
  exit 1
fi
CHECKPOINT_PATH="$(SUMMARY_PATH="$SUMMARY_PATH" node - <<'NODE'
const fs = require('fs');
const path = process.env.SUMMARY_PATH;
const data = JSON.parse(fs.readFileSync(path, 'utf8'));
const checkpointPath = data.checkpoint?.path || data.checkpointPath;
if (!checkpointPath) {
  throw new Error('summary missing checkpoint path');
}
process.stdout.write(checkpointPath);
NODE
)"

if [[ -z "$CHECKPOINT_PATH" ]]; then
  echo "Unable to determine checkpoint path from summary" >&2
  exit 1
fi

echo "🧠 Stage 2: Resuming from checkpoint $CHECKPOINT_PATH and completing the planetary run"
CMD_STAGE_TWO=(npx tsx "$DEMO_DIR/src/index.ts")
if [[ $PLAN_SET -eq 1 ]]; then
  CMD_STAGE_TWO+=(--plan "$PLAN")
else
  CMD_STAGE_TWO+=(--config "$CONFIG")
fi
CMD_STAGE_TWO+=(
  --jobs "$JOBS"
  --output-label "$LABEL"
  --resume
  --checkpoint "$CHECKPOINT_PATH"
  --preserve-report-on-resume "${PLAN_PRESERVE:-true}"
)
if [[ -n "$OWNER_COMMANDS" ]]; then
  CMD_STAGE_TWO+=(--owner-commands "$OWNER_COMMANDS")
fi
if [[ -n "$BLUEPRINT" ]]; then
  CMD_STAGE_TWO+=(--jobs-blueprint "$BLUEPRINT")
fi
"${CMD_STAGE_TWO[@]}"

echo "✅ Restart drill complete. Explore $REPORT_DIR/dashboard.html for the merged mission console."
