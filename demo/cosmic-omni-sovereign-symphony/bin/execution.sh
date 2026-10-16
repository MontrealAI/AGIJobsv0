#!/usr/bin/env bash
# Internal execution functions, loaded only after the explicit-mode allowlist.
cosmic_log() { printf '[cosmic] %s\n' "$*"; }
cosmic_step() {
  local label="$1"; shift
  cosmic_log ">>> $label"
  "$@"
  cosmic_log "<<< $label"
}

cosmic_governance() {
  local logs="$DEMO_ROOT/logs"
  printf '{"mode":"%s","status":"running","productionApproved":false}\n' "$MODE" > "$logs/run-status.json"
  if [[ "$MODE" == offline-fixture ]]; then
    cosmic_log 'SYNTHETIC GOVERNANCE FIXTURE: no contracts, votes or owner controls were executed.'
    printf '%s\n' '{"evidenceMode":"offline-fixture","synthetic":true,"generatedAt":"offline","nations":[{"id":"demo-nation","name":"Offline Federation"}],"mandates":[{"id":"mandate-1","title":"Illustrative readiness fixture"}]}' > "$logs/ledger-latest.json"
    printf '%s\n' '{"evidenceMode":"offline-fixture","synthetic":true,"votes":[{"proposalId":"P-001","result":"illustrative-not-executed"}],"ownerActions":[{"action":"pause","timestamp":"offline"},{"action":"unpause","timestamp":"offline"}]}' > "$logs/vote-simulation.json"
    printf '%s\n' '{"evidenceMode":"offline-fixture","synthetic":true,"steps":[{"name":"Illustrative bootstrap"},{"name":"Illustrative snapshot"},{"name":"Illustrative dossier"},{"name":"Illustrative owner controls"},{"name":"Illustrative archive"}]}' > "$logs/execution-plan.json"
  else
    # Parse the unmodified governance entrypoints as their actual CommonJS
    # runtime would. Fail before starting a node if legacy ESM syntax is present.
    cosmic_step 'Check governance runtime compatibility' node - "$ROOT" <<'JS'
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = process.argv[2];
const ts = require(path.join(root, 'node_modules/typescript'));
for (const name of ['deploy-governance', 'seed-governance', 'simulate-governance', 'export-ledger']) {
  const file = path.join(root, 'demo/cosmic-omni-sovereign-symphony/scripts', `${name}.ts`);
  const result = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }, fileName: file
  });
  try { new vm.Script(result.outputText, { filename: file }); }
  catch (error) { throw new Error(`Local rehearsal blocked: ${name}.ts is incompatible with the repository CommonJS runtime (${error.message}). No node was started; governance scripts require a separate repair.`); }
}
JS
    prepare_local_node
    cosmic_step 'Compile contracts using cached compiler only' node "$HARDHAT_CLI" compile --concurrency 1
    cosmic_step 'Run governance tests on in-process Hardhat' node "$HARDHAT_CLI" test --no-compile --network hardhat "$ROOT/test/v2/GlobalGovernanceCouncil.test.ts"
    cosmic_step 'Launch fresh owned Hardhat node' start_local_node
    local script
    for script in deploy-governance seed-governance simulate-governance; do
      check_local_node
      cosmic_step "$script (owned localhost only)" node "$HARDHAT_CLI" run --no-compile --network localhost "$DEMO_ROOT/scripts/$script.ts"
    done
    check_local_node
    cosmic_step 'Export governance ledger' env HARDHAT_NETWORK=localhost node \
      -r "$ROOT/node_modules/ts-node/register/transpile-only" \
      "$DEMO_ROOT/scripts/export-ledger.ts" --output "$logs/ledger-latest.json"
    cosmic_step 'Print knowledge graph payload locally' node "$DEMO_ROOT/scripts/publish-knowledge-graph.js" "$logs/ledger-latest.json"
    cosmic_step 'Generate local execution plan' node "$DEMO_ROOT/scripts/generate-plan.js" false
    local cleanup_status=0
    python3 "$ROOT/demo/aurora/bin/local-node-guard.py" cleanup "$LOCAL_NODE_STATE" || cleanup_status=$?
    trap - EXIT INT TERM
    if (( cleanup_status != 0 )); then
      printf 'Owned-node cleanup failed; private diagnostics: %s\n' "$LOCAL_NODE_STATE" >&2
      return "$cleanup_status"
    fi
  fi
  printf '{"mode":"%s","status":"completed","productionApproved":false}\n' "$MODE" > "$logs/run-status.json"
}

cosmic_flagship() {
  local args=(--mode "$MODE")
  [[ "$CI_MODE" != true ]] || args+=(--ci)
  printf '%s\n' "Running $MODE; no completion certified yet." > "$DEMO_ROOT/logs/flagship-demo/summary.txt"
  printf '{"status":"running","mode":"%s"}\n' "$MODE" > "$DEMO_ROOT/logs/flagship-demo/verification.json"
  cosmic_step 'Execute explicit governance mode' bash "$DEMO_ROOT/bin/orchestrate.sh" "${args[@]}"
  # AGI OS is a separate illustrative reporting pipeline. Never let it start
  # unguarded on-chain work as a side effect of a Cosmic governance rehearsal.
  export AGIJOBS_FLAGSHIP_SKIP_ONCHAIN=true
  cosmic_step 'Build offline AGI OS mission fixture' node "$TS_NODE_CLI" \
    --compiler-options '{"module":"commonjs"}' "$ROOT/scripts/v2/agiOperatingSystemDemo.ts"
  if [[ -x "$ROOT/node_modules/.bin/mmdc" ]]; then
    cosmic_step 'Render governance diagram with installed CLI' "$ROOT/node_modules/.bin/mmdc" \
      -i "$DEMO_ROOT/docs/architecture.mmd" -o "$DEMO_ROOT/docs/architecture.svg"
  else
    cosmic_log 'Installed Mermaid CLI unavailable; optional diagram render skipped.'
  fi
  local summary="$DEMO_ROOT/logs/flagship-demo/summary.txt"
  printf '%s\n' \
    'AGI Jobs Flagship Demo Artifacts Awaiting Verification' \
    "Governance evidence mode: $MODE" \
    'Mission evidence: offline-fixture (illustrative reports, no AGI OS on-chain execution).' \
    'Offline governance records, when selected, are synthetic and do not prove contract behavior.' \
    'No production readiness, external deployment or provider work is certified.' \
    'Governance: demo/cosmic-omni-sovereign-symphony/logs/' \
    'Mission bundle and owner control matrix: reports/agi-os/' > "$summary"
  local verify_status=0
  cosmic_log '>>> Verify flagship artifacts'
  node "$DEMO_ROOT/scripts/verify-flagship-report.mjs" \
    --reports-root "$ROOT/reports/agi-os" || verify_status=$?
  if (( verify_status != 0 )); then
    printf '%s\n' 'Flagship verification failed. See verification.json and logs; no completion certified.' > "$summary"
    return "$verify_status"
  fi
  printf '%s\n' 'AGI Jobs Flagship Demo Completed' "Verified governance artifact mode: $MODE" 'Mission evidence: offline-fixture; no production readiness certified.' > "$summary"
  cosmic_log "Verified $MODE artifact structure; summary: $summary"
}

cosmic_execute() {
  ROOT="$1"; MODE="$2"; CI_MODE="$3"; local role="$4"
  DEMO_ROOT="$ROOT/demo/cosmic-omni-sovereign-symphony"
  cd -- "$ROOT"
  # Use the same repository/port locks for direct and nested launches. The
  # helper validates a live ancestor's lock ownership; environment claims alone
  # never suffice. Locks precede writes and cover the entire flagship pipeline.
  source "$ROOT/demo/aurora/bin/local-node.sh"
  local args=(--mode "$MODE")
  [[ "$CI_MODE" != true ]] || args+=(--ci)
  lock_local_demo "${args[@]}"
  TS_NODE_CLI="$ROOT/node_modules/ts-node/dist/bin.js"
  HARDHAT_CLI="$ROOT/node_modules/hardhat/internal/cli/cli.js"
  if [[ ! -f "$TS_NODE_CLI" || ! -f "$HARDHAT_CLI" ]]; then
    printf '%s\n' 'Installed locked dependencies are required. Provision them separately; this launcher never installs packages.' >&2
    return 1
  fi
  mkdir -p "$DEMO_ROOT/logs/flagship-demo"
  cosmic_log "Explicit mode=$MODE, ci=$CI_MODE. External credentials and .env are not used."
  case "$role" in
    orchestrate) cosmic_governance > >(tee "$DEMO_ROOT/logs/orchestrate.log") 2>&1 ;;
    flagship-demo) cosmic_flagship > >(tee "$DEMO_ROOT/logs/flagship-demo/flagship-demo.log") 2>&1 ;;
    *) printf 'Unsupported internal entry: %s\n' "$role" >&2; return 2 ;;
  esac
}
