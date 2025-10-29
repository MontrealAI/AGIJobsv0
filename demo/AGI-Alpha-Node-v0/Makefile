PYTHON?=python3
VENV?=.venv
PIP:=$(VENV)/bin/pip
PY:=$(VENV)/bin/python

.PHONY: install lint test run dashboard metrics clean demo-alpha-node-bootstrap

$(VENV)/bin/activate: requirements.txt
$(PYTHON) -m venv $(VENV)
$(PIP) install --upgrade pip
$(PIP) install -r requirements.txt
touch $(VENV)/bin/activate

install: $(VENV)/bin/activate

lint: install
$(PY) -m compileall src

TEST_ARGS?=-q
test: install
$(PY) -m pytest tests $(TEST_ARGS)

run: install
$(PY) -m agi_alpha_node run --config config/operator.example.yaml

compliance: install
$(PY) -m agi_alpha_node compliance --config config/operator.example.yaml --format table

metrics: install
curl -fsS http://localhost:9095/metrics || echo "Metrics endpoint not reachable yet"

clean:
rm -rf $(VENV)
find . -name "__pycache__" -type d -prune -exec rm -rf {} +

# Convenience alias referenced in README
demo-alpha-node-bootstrap: install

requirements.txt:
@cat <<'REQ' > requirements.txt
jsonschema==4.22.0
pyyaml==6.0.2
rich==13.7.1
REQ


.PHONY: demo-alpha-node
demo-alpha-node:
	poetry run python -m alpha_node.cli bootstrap || true
	poetry run uvicorn alpha_node.web.dashboard:app --reload --port 8787
