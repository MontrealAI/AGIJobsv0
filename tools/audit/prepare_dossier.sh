#!/usr/bin/env bash
set -euo pipefail

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUTPUT_BASE="reports/audit"
OUTPUT_DIR="${OUTPUT_BASE}/${TIMESTAMP}"
LOG_DIR="${OUTPUT_DIR}/logs"
ARTIFACTS_DIR="${OUTPUT_DIR}/artifacts"

SKIP_REMOTE_INPUT="${SKIP_REMOTE:-1}"
case "${SKIP_REMOTE_INPUT,,}" in
  0|false|no|off)
    SKIP_REMOTE_FLAG=0
    ;;
  *)
    SKIP_REMOTE_FLAG=1
    ;;
esac

mkdir -p "${LOG_DIR}"

RESULTS_TSV="${OUTPUT_DIR}/command-results.tsv"
MANIFEST_FILE="${OUTPUT_DIR}/manifest.txt"
SUMMARY_FILE="${OUTPUT_DIR}/summary.json"

cat <<MANIFEST >"${MANIFEST_FILE}"
AGI Jobs v2 Audit Dossier
Generated at: ${TIMESTAMP}
Repository commit: $(git rev-parse HEAD)
MANIFEST

declare -a COMMAND_LABELS=(
  "lint_ci"
  "format_check"
  "toolchain_lock"
  "security_audit"
  "branch_protection"
  "coverage_report"
  "abi_export"
  "access_control"
  "owner_parameters"
  "owner_command_center"
  "owner_verify_control"
)

declare -a COMMANDS=(
  "npm run lint:ci"
  "npm run format:check"
  "npm run ci:verify-toolchain"
  "npm run security:audit"
  "npm run ci:verify-branch-protection"
  "npm run coverage:report"
  "npm run abi:export"
  "npm run check:access-control"
  "npm run owner:parameters"
  "npm run owner:command-center"
  "npm run owner:verify-control"
)

: >"${RESULTS_TSV}"

for idx in "${!COMMAND_LABELS[@]}"; do
  label="${COMMAND_LABELS[$idx]}"
  command="${COMMANDS[$idx]}"
  log_file="${LOG_DIR}/$(printf "%02d" "$((idx+1))")_${label}.log"
  status="passed"

  if [[ "${label}" == owner_* && "${SKIP_REMOTE_FLAG}" -eq 1 ]]; then
    printf 'Skipping %s because SKIP_REMOTE=1 (set SKIP_REMOTE=0 to run)\n' "${command}" | tee "${log_file}"
    status="skipped"
  else
    echo "[prepare_dossier] Running ${command}" | tee "${log_file}"
    if ! bash -lc "${command}" >>"${log_file}" 2>&1; then
      status="failed"
    fi
  fi

  printf '%s\t%s\t%s\t%s\n' "${label}" "${command}" "${status}" "${log_file#${OUTPUT_DIR}/}" >>"${RESULTS_TSV}"

done

# Copy important artefacts if they exist.
copy_if_exists() {
  local source=$1
  local destination=$2
  if [[ -e "${source}" ]]; then
    mkdir -p "$(dirname "${destination}")"
    if [[ -d "${source}" ]]; then
      rsync -a --delete "${source}/" "${destination}/"
    else
      cp "${source}" "${destination}"
    fi
  fi
}

copy_if_exists coverage "${ARTIFACTS_DIR}/coverage"
copy_if_exists artifacts "${ARTIFACTS_DIR}/contracts"
copy_if_exists deployments "${ARTIFACTS_DIR}/deployments"
copy_if_exists docs/release-manifest.md "${ARTIFACTS_DIR}/docs/release-manifest.md"
copy_if_exists docs/deployment-summary.json "${ARTIFACTS_DIR}/docs/deployment-summary.json"

python <<PY "${RESULTS_TSV}" "${SUMMARY_FILE}" "${TIMESTAMP}" "${SKIP_REMOTE_FLAG}"
import json
import pathlib
import sys

results_path = pathlib.Path(sys.argv[1])
summary_path = pathlib.Path(sys.argv[2])
timestamp = sys.argv[3]
skip_remote_flag = bool(int(sys.argv[4]))

commands = {}
with results_path.open() as handle:
    for line in handle:
        label, command, status, log = line.rstrip('\n').split('\t')
        commands[label] = {
            "command": command,
            "status": status,
            "log": str(pathlib.Path(log))
        }

data = {
    "generatedAt": timestamp,
    "skipRemote": skip_remote_flag,
    "commands": commands,
}

summary_path.write_text(json.dumps(data, indent=2))
PY

cat <<'REMINDER'
Audit dossier prepared.
Logs: ${LOG_DIR}
Summary: ${SUMMARY_FILE}
Artefacts: ${ARTIFACTS_DIR}

Ensure sensitive secrets are removed before sharing.
REMINDER
