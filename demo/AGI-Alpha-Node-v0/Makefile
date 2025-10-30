PYTHON ?= python3
PIP ?= pip3
VENV ?= .venv
ACTIVATE = . $(VENV)/bin/activate

.PHONY: install demo test lint format clean dashboard

install: $(VENV)/bin/activate
$(ACTIVATE) && $(PIP) install --upgrade pip && $(PIP) install -r requirements-demo.txt && $(PIP) install pytest ruff

$(VENV)/bin/activate:
$(PYTHON) -m venv $(VENV)

clean:
rm -rf $(VENV) __pycache__ */__pycache__ *.sqlite3 agi_alpha_node_demo/*.sqlite3

lint: install
$(ACTIVATE) && ruff check agi_alpha_node_demo tests

format: install
$(ACTIVATE) && ruff format agi_alpha_node_demo tests

test: install
$(ACTIVATE) && PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 pytest tests -q

# Launches the end-to-end demonstration (CLI bootstrap + dashboard + metrics)
demo: install
$(ACTIVATE) && python -m agi_alpha_node_demo.cli bootstrap --config ./config.example.yaml --non-interactive
$(ACTIVATE) && python -m agi_alpha_node_demo.cli run-loop --config ./config.example.yaml --once
@echo "\n🎉 AGI Alpha Node demo initialised. Run '$(ACTIVATE) && python -m agi_alpha_node_demo.cli console' for the live console."

# Build Docker image that bundles CLI, dashboard, metrics, and demo config
image:
docker build -t agi-alpha-node-demo .

dashboard:
python -m http.server 9701 --directory web
