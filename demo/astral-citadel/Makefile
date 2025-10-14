MAKEFILE_DIR := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))
REPO_ROOT := $(abspath $(MAKEFILE_DIR)/../..)
RUN_IN_ROOT = cd $(REPO_ROOT) &&

.PHONY: bootstrap verify dry-run mission report ci observability governance

bootstrap:
	$(RUN_IN_ROOT) npm install

verify:
	$(RUN_IN_ROOT) npm run ci:verify-toolchain
	$(RUN_IN_ROOT) npm run ci:verify-signers
	$(RUN_IN_ROOT) npm run docs:verify
	$(RUN_IN_ROOT) npm run owner:atlas

# Local orchestrator rehearsal using the existing ASI take-off driver
# Accepts all environment variables used by demo/asi-takeoff/bin/asi-takeoff-local.sh
# Example: RPC_URL=http://127.0.0.1:8545 make dry-run

dry-run:
	$(RUN_IN_ROOT) npm run demo:asi-takeoff:local

# NETWORK=<network> make mission
mission:
	@if [ -z "$$NETWORK" ]; then \
	echo "NETWORK not set. Usage: NETWORK=sepolia make mission"; \
	exit 1; \
	fi
	$(RUN_IN_ROOT) NETWORK=$$NETWORK npm run demo:asi-global

report:
	$(RUN_IN_ROOT) AURORA_REPORT_SCOPE=astral-citadel AURORA_REPORT_TITLE='Astral Citadel — Mission Report' npx ts-node --transpile-only demo/aurora/bin/aurora-report.ts

ci:
	$(RUN_IN_ROOT) npm run lint
	$(RUN_IN_ROOT) npm run test
	$(RUN_IN_ROOT) npm run coverage:check

observability:
	$(RUN_IN_ROOT) npm run observability:smoke
	$(RUN_IN_ROOT) npm run monitoring:sentinels
	$(RUN_IN_ROOT) npm run hamiltonian:report
	$(RUN_IN_ROOT) npm run owner:pulse

# Convenience alias to regenerate Safe bundles and governance dashboards

governance:
	$(RUN_IN_ROOT) npm run owner:plan:safe
	$(RUN_IN_ROOT) npm run owner:dashboard
	$(RUN_IN_ROOT) npm run owner:command-center
