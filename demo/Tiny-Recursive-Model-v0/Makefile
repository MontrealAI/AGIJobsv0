.PHONY: install demo ui test format clean telemetry

PYTHON ?= python3
VENV ?= .venv
ACTIVATE = source $(VENV)/bin/activate

install:
@test -d $(VENV) || ($(PYTHON) -m venv $(VENV))
@$(ACTIVATE) && pip install --upgrade pip
@$(ACTIVATE) && pip install -r requirements.txt

telemetry:
@mkdir -p assets
@touch assets/telemetry.jsonl

_demo_invoke: telemetry
@$(ACTIVATE) && $(PYTHON) demo_runner.py

demo: install _demo_invoke

ui: install telemetry
@$(ACTIVATE) && streamlit run ui/streamlit_app.py --server.headless true

test: install
@$(ACTIVATE) && PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 pytest -q

format: install
@$(ACTIVATE) && ruff format .
@$(ACTIVATE) && ruff check --fix .
@$(ACTIVATE) && black .

clean:
rm -rf __pycache__ */__pycache__ .pytest_cache $(VENV)
rm -f assets/telemetry.jsonl
