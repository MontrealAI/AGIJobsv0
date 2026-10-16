REPO_ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST)))/../..)
REPORT_ROOT ?= reports/helios-omniversal-symphony
TAKEOFF_ROOT := $(REPORT_ROOT)/asi-takeoff
GLOBAL_ROOT := $(REPORT_ROOT)/asi-global
OWNER_ROOT := $(REPORT_ROOT)/owner
LOG_ROOT := $(REPORT_ROOT)/logs
NETWORK = hardhat

# Keep cleanup and artifact production ordered, including make -j invocations.
.NOTPARALLEL:

.PHONY: mission clean prep plan governance kits digest

mission: clean prep plan governance kits digest
	@cd "$(REPO_ROOT)" && echo "Helios Omniversal Symphony mission complete → $(REPORT_ROOT)"

clean:
	cd "$(REPO_ROOT)" && node scripts/demo/helios-clean.cjs "$(REPORT_ROOT)"

prep:
	cd "$(REPO_ROOT)" && mkdir -p "$(TAKEOFF_ROOT)" "$(GLOBAL_ROOT)" "$(OWNER_ROOT)" "$(LOG_ROOT)"

plan: prep
	cd "$(REPO_ROOT)" && npm run demo:asi-takeoff:local
	cd "$(REPO_ROOT)" && npm run demo:asi-global
	cd "$(REPO_ROOT)" && cp demo/asi-takeoff/project-plan.json "$(TAKEOFF_ROOT)/project-plan.json"
	cd "$(REPO_ROOT)" && cp reports/asi-takeoff/dry-run.json "$(TAKEOFF_ROOT)/dry-run.json"
	cd "$(REPO_ROOT)" && cp reports/asi-takeoff/thermodynamics.json "$(TAKEOFF_ROOT)/thermodynamics.json"
	cd "$(REPO_ROOT)" && cp reports/asi-takeoff/mission-control.md "$(TAKEOFF_ROOT)/mission-control.md"
	cd "$(REPO_ROOT)" && cp reports/asi-takeoff/summary.md "$(TAKEOFF_ROOT)/summary.md"
	cd "$(REPO_ROOT)" && cp reports/asi-takeoff/summary.json "$(TAKEOFF_ROOT)/summary.json"
	cd "$(REPO_ROOT)" && if [ -d reports/asi-takeoff/mission-bundle ]; then node scripts/demo/helios-clean.cjs "$(TAKEOFF_ROOT)/mission-bundle" && cp -R reports/asi-takeoff/mission-bundle "$(TAKEOFF_ROOT)/"; fi
	cd "$(REPO_ROOT)" && if [ -d reports/asi-takeoff/logs ]; then node scripts/demo/helios-clean.cjs "$(TAKEOFF_ROOT)/logs" && cp -R reports/asi-takeoff/logs "$(TAKEOFF_ROOT)/"; fi
	cd "$(REPO_ROOT)" && cp demo/asi-global/project-plan.json "$(GLOBAL_ROOT)/project-plan.json"
	cd "$(REPO_ROOT)" && cp reports/asi-global/dry-run.json "$(GLOBAL_ROOT)/dry-run.json"
	cd "$(REPO_ROOT)" && cp reports/asi-global/thermodynamics.json "$(GLOBAL_ROOT)/thermodynamics.json"
	cd "$(REPO_ROOT)" && cp reports/asi-global/mission-control.md "$(GLOBAL_ROOT)/mission-control.md"
	cd "$(REPO_ROOT)" && cp reports/asi-global/summary.md "$(GLOBAL_ROOT)/summary.md"
	cd "$(REPO_ROOT)" && cp reports/asi-global/summary.json "$(GLOBAL_ROOT)/summary.json"
	cd "$(REPO_ROOT)" && if [ -f reports/asi-global/command-center.md ]; then cp reports/asi-global/command-center.md "$(GLOBAL_ROOT)/command-center.md"; fi
	cd "$(REPO_ROOT)" && if [ -f reports/asi-global/parameter-matrix.md ]; then cp reports/asi-global/parameter-matrix.md "$(GLOBAL_ROOT)/parameter-matrix.md"; fi
	cd "$(REPO_ROOT)" && if [ -f reports/asi-global/governance.mmd ]; then cp reports/asi-global/governance.mmd "$(GLOBAL_ROOT)/governance.mmd"; fi
	cd "$(REPO_ROOT)" && if [ -f reports/asi-global/governance.md ]; then cp reports/asi-global/governance.md "$(GLOBAL_ROOT)/governance.md"; fi
	cd "$(REPO_ROOT)" && if [ -d reports/asi-global/mission-bundle ]; then node scripts/demo/helios-clean.cjs "$(GLOBAL_ROOT)/mission-bundle" && cp -R reports/asi-global/mission-bundle "$(GLOBAL_ROOT)/"; fi
	cd "$(REPO_ROOT)" && if [ -d reports/asi-global/logs ]; then node scripts/demo/helios-clean.cjs "$(GLOBAL_ROOT)/logs" && cp -R reports/asi-global/logs "$(GLOBAL_ROOT)/"; fi


governance: prep
	cd "$(REPO_ROOT)" && npm run owner:mission-control -- --network "$(NETWORK)" --format markdown --out "$(OWNER_ROOT)/mission-control.md" --bundle "$(OWNER_ROOT)/mission-control-bundle"
	cd "$(REPO_ROOT)" && npm run owner:command-center -- --network "$(NETWORK)" --format markdown --output "$(OWNER_ROOT)/command-center.md"
	cd "$(REPO_ROOT)" && npm run owner:parameters -- --network "$(NETWORK)" --format markdown --out "$(OWNER_ROOT)/parameter-matrix.md"
	cd "$(REPO_ROOT)" && npm run owner:emergency -- --network "$(NETWORK)" --format markdown --out "$(OWNER_ROOT)/emergency-runbook.md"
	cd "$(REPO_ROOT)" && npx hardhat run --no-compile scripts/v2/thermodynamicsReport.ts --network "$(NETWORK)" -- --format markdown --out "$(OWNER_ROOT)/thermodynamics.md"


kits: plan governance
	cd "$(REPO_ROOT)" && npm run demo:asi-takeoff:kit -- --report-root "$(TAKEOFF_ROOT)" --plan "$(TAKEOFF_ROOT)/project-plan.json" --bundle "$(TAKEOFF_ROOT)/mission-bundle" --logs "$(TAKEOFF_ROOT)/logs" --summary-md "$(TAKEOFF_ROOT)/summary.md" --summary-json "$(TAKEOFF_ROOT)/summary.json" --mission-control "$(TAKEOFF_ROOT)/mission-control.md" --output-name helios-asi-takeoff-kit
	cd "$(REPO_ROOT)" && npm run demo:asi-global:kit -- --report-root "$(GLOBAL_ROOT)" --plan "$(GLOBAL_ROOT)/project-plan.json" --dry-run "$(GLOBAL_ROOT)/dry-run.json" --thermodynamics "$(GLOBAL_ROOT)/thermodynamics.json" --mission-control "$(GLOBAL_ROOT)/mission-control.md" --summary-md "$(GLOBAL_ROOT)/summary.md" --summary-json "$(GLOBAL_ROOT)/summary.json" --bundle "$(GLOBAL_ROOT)/mission-bundle" --logs "$(GLOBAL_ROOT)/logs" --output-basename helios-asi-global-kit


digest: kits
	cd "$(REPO_ROOT)" && cd "$(REPORT_ROOT)" && find . -type f ! -path ./SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS
