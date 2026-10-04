.PHONY: help preview doctor test bootstrap up up-detached down stop logs status clean

DEMO_DIR:=$(dir $(abspath $(lastword $(MAKEFILE_LIST))))
ROOT:=$(abspath $(DEMO_DIR)/../..)
COMPOSE=docker compose -f $(DEMO_DIR)/docker-compose.yaml

help:
	@echo "preview      Start the offline browser demo (no Docker or credentials)"
	@echo "doctor       Check a configured local/test deployment"
	@echo "test         Run One-Box regression tests"
	@echo "bootstrap    Start disposable Anvil and run the local deployment wizard"
	@echo "up           Start the Docker UI (offline by default)"
	@echo "up-detached  Start the Docker UI in the background"
	@echo "down         Stop containers and retain volumes"
	@echo "clean        Delete local demo volumes (keeps your .env)"

preview:
	cd $(ROOT) && npm run demo:onebox:launch -- --demo

doctor:
	cd $(ROOT) && npm run demo:onebox:doctor -- --strict

test:
	cd $(ROOT) && npm run demo:onebox:test

bootstrap:
	$(COMPOSE) --profile connected up -d --wait anvil
	cd $(ROOT) && npm run deploy:oneclick:auto -- --network localhost --no-compose --compose-file $(DEMO_DIR)/docker-compose.yaml
	@echo "Review generated addresses, relayer funding, pause state and API token before starting connected mode. See README.md."

up:
	$(COMPOSE) up --build --wait

up-detached:
	$(COMPOSE) up --build -d --wait

logs:
	$(COMPOSE) --profile connected logs -f

status:
	$(COMPOSE) --profile connected ps

stop down:
	$(COMPOSE) --profile connected down

clean:
	$(COMPOSE) --profile connected down -v
