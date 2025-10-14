REPORT_ROOT ?= reports/helios-omniversal-symphony
TAKEOFF_ROOT := $(REPORT_ROOT)/asi-takeoff
GLOBAL_ROOT := $(REPORT_ROOT)/asi-global
OWNER_ROOT := $(REPORT_ROOT)/owner
LOG_ROOT := $(REPORT_ROOT)/logs
NETWORK ?= hardhat

.PHONY: mission clean prep plan governance kits digest

mission: clean prep plan governance kits digest
	@echo "Helios Omniversal Symphony mission complete → $(REPORT_ROOT)"

clean:
	rm -rf $(REPORT_ROOT)

prep:
	mkdir -p $(TAKEOFF_ROOT) $(GLOBAL_ROOT) $(OWNER_ROOT) $(LOG_ROOT)

plan: prep
	npm run demo:asi-takeoff:local
	npm run demo:asi-global
	cp demo/asi-takeoff/project-plan.json $(TAKEOFF_ROOT)/project-plan.json
	cp reports/asi-takeoff/dry-run.json $(TAKEOFF_ROOT)/dry-run.json
	cp reports/asi-takeoff/thermodynamics.json $(TAKEOFF_ROOT)/thermodynamics.json
	cp reports/asi-takeoff/mission-control.md $(TAKEOFF_ROOT)/mission-control.md
	cp reports/asi-takeoff/summary.md $(TAKEOFF_ROOT)/summary.md
	cp reports/asi-takeoff/summary.json $(TAKEOFF_ROOT)/summary.json
	if [ -d reports/asi-takeoff/mission-bundle ]; then rm -rf $(TAKEOFF_ROOT)/mission-bundle && cp -R reports/asi-takeoff/mission-bundle $(TAKEOFF_ROOT)/; fi
	if [ -d reports/asi-takeoff/logs ]; then rm -rf $(TAKEOFF_ROOT)/logs && cp -R reports/asi-takeoff/logs $(TAKEOFF_ROOT)/; fi
	cp demo/asi-global/project-plan.json $(GLOBAL_ROOT)/project-plan.json
	cp reports/asi-global/dry-run.json $(GLOBAL_ROOT)/dry-run.json
	cp reports/asi-global/thermodynamics.json $(GLOBAL_ROOT)/thermodynamics.json
	cp reports/asi-global/mission-control.md $(GLOBAL_ROOT)/mission-control.md
	cp reports/asi-global/summary.md $(GLOBAL_ROOT)/summary.md
	cp reports/asi-global/summary.json $(GLOBAL_ROOT)/summary.json
	if [ -f reports/asi-global/command-center.md ]; then cp reports/asi-global/command-center.md $(GLOBAL_ROOT)/command-center.md; fi
	if [ -f reports/asi-global/parameter-matrix.md ]; then cp reports/asi-global/parameter-matrix.md $(GLOBAL_ROOT)/parameter-matrix.md; fi
	if [ -f reports/asi-global/governance.mmd ]; then cp reports/asi-global/governance.mmd $(GLOBAL_ROOT)/governance.mmd; fi
	if [ -f reports/asi-global/governance.md ]; then cp reports/asi-global/governance.md $(GLOBAL_ROOT)/governance.md; fi
	if [ -d reports/asi-global/mission-bundle ]; then rm -rf $(GLOBAL_ROOT)/mission-bundle && cp -R reports/asi-global/mission-bundle $(GLOBAL_ROOT)/; fi
	if [ -d reports/asi-global/logs ]; then rm -rf $(GLOBAL_ROOT)/logs && cp -R reports/asi-global/logs $(GLOBAL_ROOT)/; fi


governance: prep
	npm run owner:mission-control -- --network $(NETWORK) --format markdown --out $(OWNER_ROOT)/mission-control.md --bundle $(OWNER_ROOT)/mission-control-bundle
       npm run owner:command-center -- --network $(NETWORK) --format markdown --output $(OWNER_ROOT)/command-center.md
	npm run owner:parameters -- --network $(NETWORK) --format markdown --out $(OWNER_ROOT)/parameter-matrix.md
	npm run owner:emergency -- --network $(NETWORK) --format markdown --out $(OWNER_ROOT)/emergency-runbook.md
	npx hardhat run --no-compile scripts/v2/thermodynamicsReport.ts --network $(NETWORK) -- --format markdown --out $(OWNER_ROOT)/thermodynamics.md


kits: plan governance
	npm run demo:asi-takeoff:kit -- --report-root $(TAKEOFF_ROOT) --plan $(TAKEOFF_ROOT)/project-plan.json --bundle $(TAKEOFF_ROOT)/mission-bundle --logs $(TAKEOFF_ROOT)/logs --summary-md $(TAKEOFF_ROOT)/summary.md --summary-json $(TAKEOFF_ROOT)/summary.json --mission-control $(TAKEOFF_ROOT)/mission-control.md --output-name helios-asi-takeoff-kit
	npm run demo:asi-global:kit -- --report-root $(GLOBAL_ROOT) --plan $(GLOBAL_ROOT)/project-plan.json --dry-run $(GLOBAL_ROOT)/dry-run.json --thermodynamics $(GLOBAL_ROOT)/thermodynamics.json --mission-control $(GLOBAL_ROOT)/mission-control.md --summary-md $(GLOBAL_ROOT)/summary.md --summary-json $(GLOBAL_ROOT)/summary.json --bundle $(GLOBAL_ROOT)/mission-bundle --logs $(GLOBAL_ROOT)/logs --output-basename helios-asi-global-kit


digest: kits
	cd $(REPORT_ROOT) && find . -type f -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS
