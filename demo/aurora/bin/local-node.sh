#!/usr/bin/env bash

# Linux /proc ownership and inherited locks are mandatory, never best effort.
lock_local_demo() {
  if [[ "${AGI_LOCAL_LOCK_ENTRY:-}" != "$0" ]]; then
    exec python3 "$ROOT/demo/aurora/bin/local-demo-lock.py" bash "$0" "$@"
  fi
  python3 "$ROOT/demo/aurora/bin/local-demo-lock.py" --verify true
}

prepare_local_node() {
  node "$ROOT/demo/aurora/bin/local-rpc.cjs" preflight || return $?
  export DEMO_PORT="${DEMO_PORT:-8545}"
  export RPC_URL="http://127.0.0.1:${DEMO_PORT}"
  export LOCALHOST_RPC_URL="$RPC_URL"
  export AGI_RPC_URL="$RPC_URL"
  export CHAIN_ID=31337
  LOCAL_NODE_STATE="$(mktemp -d "${TMPDIR:-/tmp}/agi-demo-node.XXXXXX")" || return $?
  export LOCAL_NODE_STATE
  LOG_FILE="$LOCAL_NODE_STATE/node-private.log"
  trap cleanup_local_node EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
}

start_local_node() {
  node "$ROOT/demo/aurora/bin/local-rpc.cjs" preflight || return $?
  local engine="${DEMO_NODE_ENGINE:-auto}"
  if [[ "$engine" == auto ]]; then
    if command -v anvil >/dev/null 2>&1; then engine=anvil; else engine=hardhat; fi
  fi
  case "$engine" in
    anvil)
      # Automining preserves a verifiable block-zero startup before transactions.
      python3 "$ROOT/demo/aurora/bin/local-node-guard.py" launch "$LOCAL_NODE_STATE" anvil --host 127.0.0.1 --port "$DEMO_PORT" --chain-id 31337 --silent || return $?
      ;;
    hardhat)
      python3 "$ROOT/demo/aurora/bin/local-node-guard.py" launch "$LOCAL_NODE_STATE" node "$ROOT/node_modules/hardhat/internal/cli/cli.js" node --hostname 127.0.0.1 --port "$DEMO_PORT" || return $?
      ;;
    *) echo 'DEMO_NODE_ENGINE must be auto, hardhat, or anvil.' >&2; return 1 ;;
  esac
  python3 "$ROOT/demo/aurora/bin/local-node-guard.py" start "$LOCAL_NODE_STATE" "$DEMO_PORT" "$engine" || return $?
}

check_local_node() {
  python3 "$ROOT/demo/aurora/bin/local-node-guard.py" check "$LOCAL_NODE_STATE" "$DEMO_PORT"
}

cleanup_local_node() {
  local status=$?
  trap - EXIT INT TERM
  if [[ -f "${LOCAL_NODE_STATE:-}/process.json" ]]; then
    python3 "$ROOT/demo/aurora/bin/local-node-guard.py" cleanup "$LOCAL_NODE_STATE" || status=1
  fi
  if [[ "$status" != 0 ]]; then
    echo "Local demo failed. Private node diagnostics: ${LOCAL_NODE_STATE:-unavailable}. Do not publish node-private.log (development keys may appear)." >&2
  fi
  exit "$status"
}

# Bind the demo template to this newly launched, exclusively owned chain.
prepare_local_deployment_config() {
  check_local_node || return $?
  export AURORA_LOCAL_DEPLOY_CONFIG="$LOCAL_NODE_STATE/deployer.json"
  export DEPLOYMENT_LOCK_DIRECTORY="$LOCAL_NODE_STATE/creator-locks"
  mkdir "$DEPLOYMENT_LOCK_DIRECTORY" || return $?
  node "$ROOT/demo/aurora/bin/local-authority.cjs" prepare \
    "$ROOT/demo/aurora/config/deployer.hardhat.json" "$AURORA_LOCAL_DEPLOY_CONFIG"
}
