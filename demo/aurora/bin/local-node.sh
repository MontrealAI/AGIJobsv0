#!/usr/bin/env bash

# Sourced by local demos. Only the process launched here is ever stopped.
prepare_local_node() {
  node "$ROOT/demo/aurora/bin/local-rpc.cjs" preflight
  export DEMO_PORT="${DEMO_PORT:-8545}"
  export RPC_URL="http://127.0.0.1:${DEMO_PORT}"
  export LOCALHOST_RPC_URL="$RPC_URL"
  export AGI_RPC_URL="$RPC_URL"
  export CHAIN_ID=31337
  LOG_FILE="$(mktemp "${TMPDIR:-/tmp}/agi-demo-node.XXXXXX")"
}

start_local_node() {
  # Compilation can be lengthy; recheck immediately before taking the port.
  node "$ROOT/demo/aurora/bin/local-rpc.cjs" preflight
  if command -v anvil >/dev/null 2>&1; then
    anvil --host 127.0.0.1 --port "$DEMO_PORT" --chain-id 31337 --silent --block-time 1 >"$LOG_FILE" 2>&1 &
  else
    echo 'Anvil not found; using the installed Hardhat node.' >&2
    "$ROOT/node_modules/.bin/hardhat" node --hostname 127.0.0.1 --port "$DEMO_PORT" >"$LOG_FILE" 2>&1 &
  fi
  NODE_PID=$!
  trap cleanup_local_node EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  for attempt in {1..120}; do
    if ! kill -0 "$NODE_PID" 2>/dev/null; then
      echo "Local node exited. Inspect $LOG_FILE." >&2
      return 1
    fi
    if node "$ROOT/demo/aurora/bin/local-rpc.cjs" ready >/dev/null 2>&1; then
      if kill -0 "$NODE_PID" 2>/dev/null; then return; fi
      echo "Local node exited during startup. Inspect $LOG_FILE." >&2
      return 1
    fi
    sleep 0.25
  done
  echo "Local RPC did not become ready. Inspect $LOG_FILE." >&2
  return 1
}

cleanup_local_node() {
  if [[ -n "${NODE_PID:-}" ]]; then
    kill "$NODE_PID" 2>/dev/null || true
    wait "$NODE_PID" 2>/dev/null || true
  fi
}
