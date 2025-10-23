
.PHONY: install lint test coverage contracts hardhat foundry services e2e down budgets

install:
	pnpm install --frozen-lockfile

lint:
	pnpm lint

contracts:
	pnpm run test:contracts
	pnpm run test:contracts:hardhat

hardhat:
	pnpm run test:contracts:hardhat

foundry:
	pnpm run test:contracts

services:
	pnpm run test:services

coverage:
	pnpm run test:contracts:coverage
	pnpm run test:contracts:coverage:hardhat
	pnpm run check:coverage

budgets:
	pnpm run check:budgets

e2e:
	pnpm run test:e2e

down:
	pnpm run e2e:down || true

# Primary developer entrypoint mirrors CI ordering
test: install lint contracts services coverage budgets
