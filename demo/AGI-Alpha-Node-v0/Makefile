.PHONY: install lint typecheck test run bootstrap dashboard compliance

VENV?=.venv
PYTHON?=python3
PIP?=$(VENV)/bin/pip
PY?=$(VENV)/bin/python

$(VENV)/bin/activate: requirements.txt
$(PYTHON) -m venv $(VENV)
$(PIP) install --upgrade pip
$(PIP) install -r requirements.txt
touch $(VENV)/bin/activate

install: $(VENV)/bin/activate

lint: install
$(PY) -m ruff check src tests

format: install
$(PY) -m ruff format src tests

mypy: install
$(PY) -m mypy src

typecheck: mypy

pytest: install
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 $(PY) -m pytest

test: lint typecheck pytest

run: install
$(PY) -m agi_alpha_node.cli run config.example.yaml --dashboard web/dashboard.html --cycles 1

bootstrap: install
$(PY) -m agi_alpha_node.cli bootstrap config.example.yaml

compliance: install
$(PY) -m agi_alpha_node.cli compliance config.example.yaml

