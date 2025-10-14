SHELL := /bin/bash
ROOT := $(shell pwd)
PLAN ?= $(ROOT)/project-plan.json
REPORT_ROOT ?= reports/localhost/omnigenesis-global-symphony

.PHONY: ci plan preview

ci:
	./bin/omnigenesis-ci.sh "$(PLAN)" "$(REPORT_ROOT)"

plan:
	jq '.' project-plan.json

preview:
	@echo "Plan: $(PLAN)"
	@echo "Report root: $(REPORT_ROOT)"
