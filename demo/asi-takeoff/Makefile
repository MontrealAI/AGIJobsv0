AURORA_REPORT_SCOPE?=asi-takeoff
AURORA_REPORT_TITLE?=ASI Take-Off — Mission Report
NETWORK=localhost
ROOT:=$(abspath $(dir $(lastword $(MAKEFILE_LIST)))/../..)

.PHONY: local report

local:
	cd "$(ROOT)" && AURORA_REPORT_SCOPE="$(AURORA_REPORT_SCOPE)" AURORA_REPORT_TITLE="$(AURORA_REPORT_TITLE)" bash demo/asi-takeoff/bin/asi-takeoff-local.sh

report:
	cd "$(ROOT)" && AURORA_REPORT_SCOPE="$(AURORA_REPORT_SCOPE)" \
	NETWORK=$(NETWORK) \
	AURORA_REPORT_TITLE="$(AURORA_REPORT_TITLE)" \
	npx ts-node --transpile-only demo/aurora/bin/aurora-report.ts
