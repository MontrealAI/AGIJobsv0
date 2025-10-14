.PHONY: bootstrap verify dry-run mission report ci observability governance

bootstrap:
	npm install

verify:
	npm run ci:verify-toolchain
	npm run ci:verify-signers
	npm run docs:verify
	npm run owner:atlas

# Local orchestrator rehearsal using the existing ASI take-off driver
# Accepts all environment variables used by demo/asi-takeoff/bin/asi-takeoff-local.sh
# Example: RPC_URL=http://127.0.0.1:8545 make dry-run

dry-run:
	npm run demo:asi-takeoff:local

# NETWORK=<network> make mission
mission:
	@if [ -z "$$NETWORK" ]; then \
		echo "NETWORK not set. Usage: NETWORK=sepolia make mission"; \
		exit 1; \
	fi
	NETWORK=$$NETWORK npm run demo:asi-global

report:
	AURORA_REPORT_SCOPE=astral-citadel AURORA_REPORT_TITLE='Astral Citadel — Mission Report' ts-node --transpile-only demo/aurora/bin/aurora-report.ts

ci:
	npm run lint
	npm run test
	npm run coverage:check

observability:
	npm run observability:smoke
	npm run monitoring:sentinels
	npm run hamiltonian:report
	npm run owner:pulse

# Convenience alias to regenerate Safe bundles and governance dashboards

governance:
	npm run owner:plan:safe
	npm run owner:dashboard
	npm run owner:command-center
