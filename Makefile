HARDHAT ?= npx hardhat
TSNODE ?= npx ts-node --compiler-options '{"module":"commonjs"}'
NETWORK ?= anvil
PYTHON ?= python3
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
.PHONY: demo-hgm hgm-demo
demo-hgm:
	node demo/Huxley-Godel-Machine-v0/scripts/demo_hgm.js $(ARGS)

hgm-demo: demo-hgm

.PHONY: demo-agialpha
demo-agialpha:
	$(PYTHON) -m demo.huxley_godel_machine_v0.simulator $(ARGS)

.PHONY: absolute-zero-demo
absolute-zero-demo:
	cd demo/Absolute-Zero-Reasoner-v0 && $(PYTHON) -m absolute_zero_reasoner_demo.run_demo --iterations 25 --tasks 6 $(ARGS)

