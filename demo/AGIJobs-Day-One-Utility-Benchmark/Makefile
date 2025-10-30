PYTHON ?= python3
STRATEGY ?= e2e

.PHONY: deps bootstrap simulate e2e alphaevolve hgm trm omni scoreboard owner-show owner-set owner-toggle owner-reset list clean report ci verify

deps:
	$(PYTHON) -m pip install --upgrade pip >/dev/null
	$(PYTHON) -m pip install --quiet -r requirements.txt

bootstrap:
	@cp config/owner_controls.defaults.yaml config/owner_controls.yaml >/dev/null 2>&1 || true
	@echo "Owner controls restored from defaults."

simulate: deps
	$(PYTHON) run_demo.py simulate --strategy $(STRATEGY)

e2e: STRATEGY := e2e
e2e: simulate

alphaevolve: STRATEGY := alphaevolve
alphaevolve: simulate

hgm: STRATEGY := hgm
hgm: simulate

trm: STRATEGY := trm
trm: simulate

omni: STRATEGY := omni
omni: simulate

scoreboard: deps
	$(PYTHON) run_demo.py scoreboard

owner-show:
	$(PYTHON) run_demo.py owner --show

owner-set:
	@if [ -z "$(KEY)" ]; then echo "Usage: make owner-set KEY=utility_threshold_override_bps VALUE=900"; exit 1; fi
	$(PYTHON) run_demo.py owner --set $(KEY) "$(VALUE)"

owner-toggle:
	$(PYTHON) run_demo.py owner --toggle-pause

owner-reset:
	$(PYTHON) run_demo.py owner --reset

list:
	$(PYTHON) run_demo.py list

clean:
	rm -f out/report_*.json out/dashboard_*.html out/snapshot_*.png out/owner_controls_snapshot.json

report: e2e

verify: deps
	PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 $(PYTHON) -m pytest -q

ci: deps
	$(PYTHON) run_demo.py list
	$(PYTHON) run_demo.py simulate --strategy e2e
	$(PYTHON) run_demo.py simulate --strategy alphaevolve
	$(PYTHON) run_demo.py simulate --strategy hgm
	$(PYTHON) run_demo.py scoreboard
	PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 $(PYTHON) -m pytest -q
