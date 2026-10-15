SHELL := /bin/bash
MODULE_DIR := $(shell cd "$$(dirname "$(MAKEFILE_LIST)")" && pwd)/
PLAN ?= $(MODULE_DIR)project-plan.json
REPORT_ROOT ?= reports/localhost/omnigenesis-global-symphony
.DEFAULT_GOAL := help

.PHONY: help ci plan preview

help:
	@bash "$(MODULE_DIR)bin/omnigenesis-ci.sh" --help

# Explicit fixture execution; the scenario jobs remain report context only.
ci:
	bash "$(MODULE_DIR)bin/omnigenesis-ci.sh" --rehearse "$(PLAN)" "$(REPORT_ROOT)"

plan:
	bash "$(MODULE_DIR)bin/omnigenesis-ci.sh" --plan "$(PLAN)"

preview:
	@printf 'Plan (report context only): %s\nReport root: %s\n' "$(PLAN)" "$(REPORT_ROOT)"
