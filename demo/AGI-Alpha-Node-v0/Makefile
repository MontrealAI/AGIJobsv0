.PHONY: bootstrap run metrics compliance test docker

PYTHONPATH := $(abspath ../..)
TEST_ENV := PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 PYTHONPATH=$(PYTHONPATH)

bootstrap:
	python -m alpha_node.cli bootstrap

run:
	python -m alpha_node.cli run

metrics:
	python -m alpha_node.cli metrics

compliance:
	python -m alpha_node.cli compliance

test:
	$(TEST_ENV) pytest tests

docker:
	docker build -t agi-alpha-node .
