#!/bin/bash
set -euo pipefail
# Run only after Alpha's reviewed source is frozen. All transactions are on this disposable local EVM.
: "${ALPHA_SUPPLIER_SOURCE:?Set reviewed source path}"
: "${ALPHA_SUPPLIER_SHA:?Set exact reviewed source commit}"
: "${SUPPLIER_PROOF_OUTPUT:?Set a new output directory}"
[ "$(git -C "$ALPHA_SUPPLIER_SOURCE" rev-parse HEAD)" = "$ALPHA_SUPPLIER_SHA" ]
[[ "$SUPPLIER_PROOF_OUTPUT" = /* ]] || { echo 'Evidence output must be an absolute new directory' >&2; exit 2; }
[ ! -e "$SUPPLIER_PROOF_OUTPUT" ]
JOBS=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
NODE=${NODE_BINARY:-node}
PYTHON=${PYTHON_BINARY:-python3}
HARNESS="$JOBS/integrations/alpha-agent/supplier-adapter-lab.py"
"$PYTHON" "$JOBS/integrations/alpha-agent/supplier_proof_guard.py" "$JOBS" "$ALPHA_SUPPLIER_SOURCE" "$SUPPLIER_PROOF_OUTPUT"
export JOBS_PROOF_ROOT="$JOBS"
git -C "$ALPHA_SUPPLIER_SOURCE" diff --quiet "$ALPHA_SUPPLIER_SHA" -- alpha_factory_v1/core/runtime examples/ecosystem/supplier-browser-spec.json
export ALPHA_WORK_SPEC="$ALPHA_SUPPLIER_SOURCE/examples/ecosystem/supplier-browser-spec.json"
export ALPHA_FIXTURE_OUTPUT="$SUPPLIER_PROOF_OUTPUT/fixture.json"
export ALPHA_RESULT="$SUPPLIER_PROOF_OUTPUT/alpha/result.json"
export ALPHA_ARTIFACT="$SUPPLIER_PROOF_OUTPUT/alpha/reviewed-artifact.json"
export ALPHA_ACCEPTANCE_OUTPUT="$SUPPLIER_PROOF_OUTPUT/acceptance.json"
CONFIG="$SUPPLIER_PROOF_OUTPUT/hardhat.config.cjs"
cat > "$CONFIG" <<'JS'
const path=require('path'),root=process.env.JOBS_PROOF_ROOT;
const config=require(path.join(root,'hardhat.config.js'));
config.paths={...config.paths,root,sources:path.join(root,'contracts'),artifacts:path.join(root,'artifacts'),cache:path.join(root,'cache'),tests:path.join(root,'test')};
config.networks.localhost={url:'http://127.0.0.1:8549',chainId:31337};
module.exports=config;
JS
cd "$JOBS"
setsid "$NODE" node_modules/hardhat/internal/cli/cli.js --config "$CONFIG" node --hostname 127.0.0.1 --port 8549 > "$SUPPLIER_PROOF_OUTPUT/node-private-fixture.log" 2>&1 &
SERVER=$!
export SUPPLIER_NODE_PID="$SERVER"
cleanup_node() {
  local status=$?
  trap - EXIT
  "$PYTHON" "$JOBS/integrations/alpha-agent/supplier_node_guard.py" cleanup || status=1
  exit "$status"
}
trap cleanup_node EXIT
"$PYTHON" "$JOBS/integrations/alpha-agent/supplier_node_guard.py" start
"$PYTHON" "$JOBS/integrations/alpha-agent/supplier_node_guard.py" check
"$NODE" node_modules/hardhat/internal/cli/cli.js --config "$CONFIG" run --no-compile --network localhost integrations/alpha-agent/deploy-local-fixture.cjs > "$SUPPLIER_PROOF_OUTPUT/deploy.log" 2>&1
"$PYTHON" - <<'PY'
import json,os,pathlib
f=json.load(open(os.environ['ALPHA_FIXTURE_OUTPUT']));mapping={'registry':'registry','token':'token','stake':'stakeManager','validation':'validationModule','identity':'identityRegistry','configuration':'configuration','lifecycle':'lifecycle','settlement':'settlement'}
p={'schema':'agialpha.jobs-v0-profile.v1','backend':f['backend'],'source_commit':'5e7f7ba5547f2cfc2e49108a6edc62e178a37ae2','rpc_url':f['rpcUrl'],'chain_id':31337,'confirmations':1,'scope':'disposable-local-fixture','contracts':{key:{'address':f['addresses'][name],'runtime_keccak256':f['codePins'][name]} for key,name in mapping.items()}}
(pathlib.Path(os.environ['SUPPLIER_PROOF_OUTPUT'])/'profile.json').write_text(json.dumps(p,indent=2)+'\n')
PY
EXTRA_ARGS=()
if [ "${SUPPLIER_NEGATIVE:-0}" = 1 ]; then EXTRA_ARGS+=(--wrong-delivery-limit); fi
"$PYTHON" "$HARNESS" "${EXTRA_ARGS[@]}" --alpha-source "$ALPHA_SUPPLIER_SOURCE" --jobs-source "$JOBS" --fixture "$ALPHA_FIXTURE_OUTPUT" --profile "$SUPPLIER_PROOF_OUTPUT/profile.json" --spec "$ALPHA_WORK_SPEC" --output "$SUPPLIER_PROOF_OUTPUT/alpha" > "$SUPPLIER_PROOF_OUTPUT/alpha.log" 2>&1
if [ "${SUPPLIER_NEGATIVE:-0}" = 1 ]; then
cat > "$SUPPLIER_PROOF_OUTPUT/verify-no-submission.cjs" <<'JS'
const fs=require('fs');const assert=require('assert/strict');const {ethers}=require(process.env.JOBS_PROOF_ROOT+'/node_modules/hardhat');
(async()=>{const f=JSON.parse(fs.readFileSync(process.env.ALPHA_FIXTURE_OUTPUT));const r=await ethers.getContractAt('contracts/v2/JobRegistry.sol:JobRegistry',f.addresses.registry);const j=await r.jobs(f.jobId);const m=await r.decodeJobMetadata(j.packedMetadata);assert.equal(Number(m.state),2);assert.equal(j.resultHash,ethers.ZeroHash);assert.equal(fs.existsSync(process.env.ALPHA_ARTIFACT),false);fs.writeFileSync(process.env.SUPPLIER_PROOF_OUTPUT+'/negative-acceptance.json',JSON.stringify({schema:'agijobsv0/supplier-browser-negative/1',jobId:f.jobId,observedStatus:'Applied',resultHash:j.resultHash,artifactExported:false,submissionPerformed:false,finalizationPerformed:false,productionApproved:false},null,2)+'\n');})().catch(e=>{console.error(e);process.exitCode=1;});
JS
"$NODE" node_modules/hardhat/internal/cli/cli.js --config "$CONFIG" run --no-compile --network localhost "$SUPPLIER_PROOF_OUTPUT/verify-no-submission.cjs"
exit 0
fi
"$PYTHON" "$JOBS/integrations/alpha-agent/supplier_node_guard.py" check
"$NODE" node_modules/hardhat/internal/cli/cli.js --config "$CONFIG" run --no-compile --network localhost integrations/alpha-agent/complete-local-fixture.cjs > "$SUPPLIER_PROOF_OUTPUT/complete.log" 2>&1
"$PYTHON" - <<'PY'
import json,os,pathlib
p=pathlib.Path(os.environ['SUPPLIER_PROOF_OUTPUT']);a=json.load(open(p/'acceptance.json'));e=json.load(open(p/'alpha/evidence.json'));print(json.dumps({'alphaSource':os.environ['ALPHA_SUPPLIER_SHA'],'resultHash':e['resultHash'],'artifactBytes':e['artifactBytes'],'providerCalls':e['providerCalls'],'observations':len(e['observations']),'acceptance':a,'dockerQualified':False,'liveProvider':False},indent=2))
PY
