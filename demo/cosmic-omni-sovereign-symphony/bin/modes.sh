#!/usr/bin/env bash
# Shared CLI boundary. Everything before cosmic_launch's explicit-mode branch
# is a Bash builtin: no .env, filesystem writes, command substitutions or children.
cosmic_usage() {
  printf '%s\n' \
    "Usage: $0 [--mode plan|offline-fixture|local-rehearsal] [--ci]" \
    '  Default / --dry-run / --mode plan: print this effect-free plan only.' \
    '  --mode offline-fixture: write synthetic governance and mission artifacts.' \
    '  --mode local-rehearsal: attempt guarded disposable local governance.' \
    '  --ci: noninteractive logs only; does not select an execution mode.' \
    '  --help: show help only (cannot be combined with other flags).'
}

cosmic_parse() {
  COSMIC_MODE=plan
  COSMIC_CI=false
  local selected=false help=false
  while (( $# )); do
    case "$1" in
      --mode)
        if [[ "$selected" == true || $# -lt 2 ]]; then
          printf '%s\n' 'Supply exactly one --mode value.' >&2; return 2
        fi
        case "$2" in
          plan|offline-fixture|local-rehearsal) COSMIC_MODE="$2" ;;
          *) printf 'Unsupported mode: %s\n' "$2" >&2; return 2 ;;
        esac
        selected=true; shift 2 ;;
      --dry-run)
        if [[ "$selected" == true ]]; then
          printf '%s\n' '--dry-run cannot be repeated or combined with --mode.' >&2; return 2
        fi
        selected=true; shift ;;
      --ci)
        if [[ "$COSMIC_CI" == true ]]; then
          printf '%s\n' '--ci cannot be repeated.' >&2; return 2
        fi
        COSMIC_CI=true; shift ;;
      -h|--help)
        if [[ "$help" == true ]]; then
          printf '%s\n' '--help cannot be repeated.' >&2; return 2
        fi
        help=true; shift ;;
      *) printf 'Unknown argument: %s\n' "$1" >&2; return 2 ;;
    esac
  done
  if [[ "$help" == true ]]; then
    if [[ "$selected" == true || "$COSMIC_CI" == true ]]; then
      printf '%s\n' '--help cannot be combined with other flags.' >&2; return 2
    fi
    cosmic_usage
    return 0
  fi
  if [[ "$COSMIC_MODE" == plan ]]; then
    printf '%s\n' \
      'Cosmic plan only: no files, dependencies, child processes or transactions.' \
      'Offline fixture: synthetic governance records + offline AGI OS report verification.' \
      'Local rehearsal: installed tools + cached compiler, exclusive locks, fresh owned' \
      'Hardhat on 127.0.0.1:8545 (DEMO_PORT supported), governance checks and bounded cleanup.' \
      'Neither execution mode loads .env or supports external networks/credentials.' \
      'Use --mode offline-fixture or --mode local-rehearsal to execute explicitly.'
  fi
}

cosmic_launch() {
  [[ "$COSMIC_MODE" != plan ]] || return 0
  local role="$1" entry root bin port url key
  # Only the explicit modes can reach even builtin path resolution subshells.
  bin="$(cd -- "${COSMIC_BIN}" && pwd -P)"
  root="$(cd -- "$bin/../../.." && pwd -P)"
  entry="$bin/${role}.sh"
  port="${DEMO_PORT:-8545}"
  if [[ ! "$port" =~ ^[1-9][0-9]{3,4}$ ]] || (( port < 1024 || port > 65535 )); then
    printf '%s\n' 'DEMO_PORT must be an integer between 1024 and 65535.' >&2; return 2
  fi
  url="http://127.0.0.1:$port"
  for key in RPC_URL LOCALHOST_RPC_URL AGI_RPC_URL; do
    if [[ -n "${!key:-}" && "${!key}" != "$url" ]]; then
      printf '%s must equal %s; external RPC overrides are unsupported.\n' "$key" "$url" >&2; return 2
    fi
  done
  if [[ -n "${CHAIN_ID:-}" && "$CHAIN_ID" != 31337 ]]; then
    printf '%s\n' 'Only chain 31337 is supported.' >&2; return 2
  fi
  if [[ -n "${DEMO_NODE_ENGINE:-}" && "$DEMO_NODE_ENGINE" != hardhat ]]; then
    printf '%s\n' 'Cosmic governance requires DEMO_NODE_ENGINE=hardhat.' >&2; return 2
  fi
  # Allowlist, not a credentials denylist. No inherited Node/Python hooks,
  # dotenv paths, wallet keys, RPC/config overrides, npm credentials or proxies.
  # PATH and HOME identify the operator-installed tools and compiler cache.
  # npm rejects one path loaded as both user and global config. A child of
  # /dev/null is guaranteed unreadable and treated as empty, without temp files.
  exec env -i PATH="$PATH" HOME="${HOME:-/tmp}" LANG=C.UTF-8 TMPDIR=/tmp \
    DEMO_PORT="$port" DEMO_NODE_ENGINE=hardhat \
    RPC_URL="$url" LOCALHOST_RPC_URL="$url" AGI_RPC_URL="$url" CHAIN_ID=31337 \
    HARDHAT_CONFIG="$root/demo/cosmic-omni-sovereign-symphony/config/hardhat.local.cjs" \
    HARDHAT_NETWORK=hardhat HARDHAT_DISABLE_TELEMETRY=1 \
    TS_NODE_PROJECT="$root/tsconfig.json" \
    npm_config_offline=true npm_config_userconfig=/dev/null npm_config_globalconfig=/dev/null/cosmic-global.npmrc \
    npm_config_update_notifier=false npm_config_audit=false npm_config_fund=false \
    AGI_LOCAL_LOCK_OWNER="${AGI_LOCAL_LOCK_OWNER:-}" AGI_LOCAL_LOCK_ENTRY="${AGI_LOCAL_LOCK_ENTRY:-}" \
    bash --noprofile --norc -c 'set -euo pipefail; source "$1"; cosmic_execute "$2" "$3" "$4" "$5"' \
    "$entry" "$bin/execution.sh" "$root" "$COSMIC_MODE" "$COSMIC_CI" "$role"
}
