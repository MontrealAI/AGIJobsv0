.PHONY: bootstrap up up-detached down stop logs status clean

ROOT:=$(abspath $(CURDIR)/../..)
COMPOSE=docker compose -f $(CURDIR)/docker-compose.yaml

bootstrap:
	@echo "▶ Deploying AGI Jobs v2 contracts to the local Anvil chain..."
	(cd $(ROOT) && npm run deploy:oneclick:auto -- --no-compose --compose-file $(CURDIR)/docker-compose.yaml --detach=false)

up:
	@echo "▶ Launching AGI Jobs One-Box demo stack..."
	$(COMPOSE) up --build

up-detached:
	@echo "▶ Launching AGI Jobs One-Box demo stack in the background..."
	$(COMPOSE) up --build -d

logs:
	$(COMPOSE) logs -f

status:
	$(COMPOSE) ps

stop down:
	$(COMPOSE) down

clean:
	$(COMPOSE) down -v
	rm -f $(CURDIR)/.env
