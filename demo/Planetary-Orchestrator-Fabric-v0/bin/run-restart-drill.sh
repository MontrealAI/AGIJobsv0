#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEMO_DIR="$ROOT_DIR/demo/Planetary-Orchestrator-Fabric-v0"
DEFAULT_CONFIG="$DEMO_DIR/config/fabric.example.json"
DEFAULT_OWNER_COMMANDS="$DEMO_DIR/config/owner-commands.example.json"
CONFIG="$DEFAULT_CONFIG"
OWNER_COMMANDS="$DEFAULT_OWNER_COMMANDS"
JOBS=10000
STOP_AFTER=180
OUTAGE="mars.gpu-helion"
LABEL=""

usage() {
  cat <<USAGE
Usage: $(basename "$0") [options]

  --config <path>             Path to the fabric configuration JSON (default: $DEFAULT_CONFIG)
  --owner-commands <path>     Path to owner command schedule (default: $DEFAULT_OWNER_COMMANDS)
  --jobs <count>              Total jobs to seed before the drill (default: 10000)
  --stop-after <ticks>        Number of ticks to run before simulating orchestrator shutdown (default: 180)
  --outage <nodeId>           Node ID to mark offline during stage one (default: mars.gpu-helion)
  --label <name>              Label for generated reports (default: resume-drill-<timestamp>)
  -h, --help                  Show this message
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --config)
      CONFIG="$2"
      shift 2
      ;;
    --owner-commands)
      OWNER_COMMANDS="$2"
      shift 2
      ;;
    --jobs)
      JOBS="$2"
      shift 2
      ;;
    --stop-after)
      STOP_AFTER="$2"
      shift 2
      ;;
    --outage)
      OUTAGE="$2"
      shift 2
      ;;
    --label)
      LABEL="$2"
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

if [[ -z "$LABEL" ]]; then
  LABEL="resume-drill-$(date -u +%Y%m%d%H%M%S)"
fi

REPORT_DIR="$DEMO_DIR/reports/$LABEL"
SUMMARY_PATH="$REPORT_DIR/summary.json"

mkdir -p "$DEMO_DIR/reports"

echo "🚀 Stage 1: Launching planetary fabric and halting after $STOP_AFTER ticks to simulate orchestrator failure"
CMD_STAGE_ONE=(
  npx tsx "$DEMO_DIR/src/index.ts"
    --config "$CONFIG"
    --jobs "$JOBS"
    --output-label "$LABEL"
    --stop-after-ticks "$STOP_AFTER"
    --preserve-report-on-resume true
)
if [[ -n "$OWNER_COMMANDS" ]]; then
  CMD_STAGE_ONE+=(--owner-commands "$OWNER_COMMANDS")
fi
if [[ -n "$OUTAGE" ]]; then
  CMD_STAGE_ONE+=(--simulate-outage "$OUTAGE")
fi
"${CMD_STAGE_ONE[@]}"

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
CMD_STAGE_TWO=(
  npx tsx "$DEMO_DIR/src/index.ts"
    --config "$CONFIG"
    --jobs "$JOBS"
    --output-label "$LABEL"
    --resume
    --checkpoint "$CHECKPOINT_PATH"
    --preserve-report-on-resume true
)
if [[ -n "$OWNER_COMMANDS" ]]; then
  CMD_STAGE_TWO+=(--owner-commands "$OWNER_COMMANDS")
fi
"${CMD_STAGE_TWO[@]}"

echo "✅ Restart drill complete. Explore $REPORT_DIR/dashboard.html for the merged mission console."
