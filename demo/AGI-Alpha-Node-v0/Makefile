.PHONY: bootstrap run metrics compliance test docker

bootstrap:
	python -m alpha_node.cli bootstrap

run:
	python -m alpha_node.cli run

metrics:
	python -m alpha_node.cli metrics

compliance:
	python -m alpha_node.cli compliance

test:
	pytest tests

docker:
	docker build -t agi-alpha-node .
