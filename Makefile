HARDHAT ?= npx hardhat
TSNODE ?= npx ts-node --compiler-options '{"module":"commonjs"}'
NETWORK ?= anvil
ARGS ?=
MODE ?=

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
