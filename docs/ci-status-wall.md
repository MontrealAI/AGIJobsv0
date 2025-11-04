# CI status wall

## Lint & static checks (ci.yml: lint)
- ✅ `npm run ci:preflight`【4b1c65†L1-L7】【1208c1†L1-L1】
- ✅ `./scripts/ci/npm-ci.sh --no-audit --prefer-offline --progress=false`【227244†L1-L6】【fc49e4†L1-L5】
- ✅ `npm run ci:sync-contexts -- --check`【87c212†L1-L6】【ed23c9†L1-L2】
- ✅ `npm run ci:verify-toolchain`【210fd7†L1-L6】
- ✅ `npm run ci:verify-contexts`【ec9d67†L1-L5】【84ed3a†L1-L2】
- ✅ `npm run ci:verify-companion-contexts`【9aa2c3†L1-L5】【e18c2e†L1-L1】
- ✅ `npm run ci:verify-summary-needs`【18d7d8†L1-L4】
- ✅ `npm run format:check` (initial failure) and `npm run format` + re-check to resolve formatting drift.【2b8213†L1-L6】【441093†L1-L7】【0b062a†L1-L6】【fa00d1†L1-L1】
- ✅ `npm run lint:ci`【225c13†L1-L4】
- ✅ `npm run monitoring:validate`【2719c5†L1-L5】【16b7c0†L1-L6】

## Hardhat & ABI tests (ci.yml: tests)
- ✅ `npx ts-node --compiler-options '{"module":"commonjs"}' scripts/generate-constants.ts`【b8dc25†L1-L1】【c255d0†L1-L3】
- ⚠️ `npx hardhat compile` (hangs locally after env injection; manual abort)【66d6b5†L1-L1】【327997†L1-L1】
- ⚠️ `npm test` (JavaScript/TypeScript suite runs through pretest but Hardhat stage hangs; manual abort)【c213d5†L1-L7】【0d43c2†L1-L1】
- ❌ `npm run abi:diff` (fails: Hardhat artifacts missing because compile step did not complete)【7b5649†L1-L6】

## Python unit tests (ci.yml: python_unit)
- ✅ `PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 coverage run --rcfile=.coveragerc -m pytest test/paymaster test/tools test/orchestrator test/simulation`【6b56dc†L1-L2】【b4e796†L1-L6】
- ✅ `PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 coverage run --rcfile=.coveragerc --append -m pytest tests`【564e5e†L1-L2】【01162c†L1-L31】
- ✅ `PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 coverage run --rcfile=.coveragerc --append -m pytest packages/hgm-core/tests`【a2ff4b†L1-L1】【e6b603†L1-L11】
- ✅ `PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 coverage run --rcfile=.coveragerc --append -m pytest demo/Huxley-Godel-Machine-v0/tests`【182d07†L1-L1】【377405†L1-L4】
- ✅ `coverage xml --rcfile=.coveragerc -o reports/python-coverage/unit.xml` (after rerun; meets fail-under)【6fa0f6†L1-L1】【27a839†L1-L3】
- ✅ `coverage report --rcfile=.coveragerc` (unit total 85%)【5f0fd8†L1-L2】

## Python integration tests (ci.yml: python_integration)
- ✅ `PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 coverage run --rcfile=.coveragerc -m pytest …` across `test/routes/*`, `test/demo`, and meta demo suites.【48c2b3†L1-L6】【d869c5†L1-L45】
- ❌ `coverage xml --rcfile=.coveragerc -o reports/python-coverage/integration.xml` (fails: total coverage 26% < fail-under 85).【f61051†L1-L2】【275326†L1-L5】

## Python load simulation (ci.yml: python_load_sim)
- ✅ Monte Carlo sweep script execution and report generation.【c8a3b1†L1-L33】

## Python coverage aggregation (ci.yml: python_coverage)
- ⚠️ `coverage combine coverage-data/unit coverage-data/integration` (no data merged because files already combined locally).【9a1366†L1-L6】
- ✅ `coverage report --rcfile=.coveragerc` (combined view).【9a1366†L6-L25】
- ✅ `coverage xml --rcfile=.coveragerc -o reports/python-coverage/combined.xml`【5733a4†L1-L1】

## Additional notes
- Generated analytics artifacts and demo telemetry files were cleaned from the working tree after tests.
- Hardhat compilation/test instability blocked ABI diff; follow-up required to unblock Solidity suites locally.
