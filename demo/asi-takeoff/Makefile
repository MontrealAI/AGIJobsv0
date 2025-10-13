AURORA_REPORT_SCOPE?=asi-takeoff
AURORA_REPORT_TITLE?=ASI Take-Off — Mission Report
NETWORK?=localhost

.PHONY: local report

local:
	bash bin/asi-takeoff-local.sh

report:
	AURORA_REPORT_SCOPE=$(AURORA_REPORT_SCOPE) \
	NETWORK=$(NETWORK) \
	AURORA_REPORT_TITLE="$(AURORA_REPORT_TITLE)" \
	npx ts-node --transpile-only ../aurora/bin/aurora-report.ts
