HARDHAT ?= npx hardhat
TSNODE ?= npx ts-node --compiler-options '{"module":"commonjs"}'
NETWORK ?= anvil
PYTHON ?= python3
ARGS ?=
MODE ?=

.PHONY: operator\:green
operator\:green:
	@set -e; \
	DEMO="demo/AGIJobs-Day-One-Utility-Benchmark"; \
	PY="$(PYTHON)"; \
	cd $$DEMO; \
	mkdir -p out; \
	$$PY -m pip -q install --upgrade pip >/dev/null; \
	if [ -f requirements.txt ]; then \
	$$PY -m pip -q install -r requirements.txt >/dev/null; \
	else \
	$$PY -m pip -q install pyyaml matplotlib >/dev/null; \
	fi; \
	if [ -f run_demo.py ]; then \
	$$PY run_demo.py || $$PY run_demo.py simulate --strategy e2e; \
	else \
	echo "No run_demo.py found; open $$DEMO/README.md for the exact run command." >&2; \
	exit 1; \
	fi; \
	PNG=$$(ls -1t out/*.png 2>/dev/null | head -n1); \
	HTML=$$(ls -1t out/*.html 2>/dev/null | head -n1); \
	JSON=$$(ls -1t out/*.json 2>/dev/null | head -n1); \
	BANNER=$$($$PY ../../tools/operator_banner.py out); \
	echo "$$BANNER"; \
	if [ -n "$$PNG" ]; then \
	echo "Snapshot: $$PWD/$$PNG"; \
	elif [ -n "$$HTML" ]; then \
	echo "Snapshot (HTML): $$PWD/$$HTML"; \
	else \
	echo "Snapshot: (not found) — open $$DEMO/README.md for artifact details"; \
	fi; \
	if [ -n "$$JSON" ]; then \
	echo "Telemetry: $$PWD/$$JSON"; \
	fi
	
.PHONY: culture-deploy culture-seed culture-arena-sample culture-bootstrap

culture-deploy:
@echo "==> Deploying Culture contracts (network: $(NETWORK))"
@HARDHAT_NETWORK=$(NETWORK) $(HARDHAT) run --no-compile scripts/deploy.culture.ts $(ARGS)

culture-seed:
@echo "==> Seeding Culture environment (network: $(NETWORK))"
@HARDHAT_NETWORK=$(NETWORK) $(HARDHAT) run --no-compile scripts/seed.culture.ts $(ARGS)

culture-arena-sample:
@echo "==> Running Culture arena sample (mode: $(if $(MODE),$(MODE),stub))"
@CULTURE_ARENA_MODE=$(MODE) HARDHAT_NETWORK=$(NETWORK) $(HARDHAT) run --no-compile scripts/run.arena.sample.ts

culture-bootstrap:
	@$(MAKE) culture-deploy NETWORK=$(NETWORK) ARGS=$(ARGS)
	@$(MAKE) culture-seed NETWORK=$(NETWORK) ARGS=$(ARGS)
	@$(MAKE) culture-arena-sample NETWORK=$(NETWORK) MODE=$(MODE)
.PHONY: demo-hgm hgm-demo
demo-hgm:
	node demo/Huxley-Godel-Machine-v0/scripts/demo_hgm.js $(ARGS)

hgm-demo: demo-hgm

.PHONY: hgm-owner-console
hgm-owner-console:
	$(PYTHON) demo/Huxley-Godel-Machine-v0/scripts/hgm_owner_console.py $(ARGS)

.PHONY: demo-agialpha
demo-agialpha:
	$(PYTHON) -m demo.huxley_godel_machine_v0.simulator $(ARGS)

.PHONY: absolute-zero-demo
absolute-zero-demo:
	@echo "[demo] provisioning virtual environment"
	python -m venv .venv-demo-azr
	. .venv-demo-azr/bin/activate && pip install --upgrade pip && pip install -r requirements-python.txt && pip install pytest
	. .venv-demo-azr/bin/activate && python demo/Absolute-Zero-Reasoner-v0/scripts/run_demo.py --iterations 6

.PHONY: pytest
pytest:
	PYTHONPATH=".:$(PWD)/packages/hgm-core/src" PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 pytest test

.PHONY: alpha-node-test
alpha-node-test:
	PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 PYTHONPATH="$(PWD)" python -m pytest demo/AGI-Alpha-Node-v0/tests
