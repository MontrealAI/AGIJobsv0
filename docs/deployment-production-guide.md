# Production deployment entry point

For a new deployment, use the [current Hardhat deployment guide](deployment-v2-agialpha.md). For a plain-language walkthrough of who approves what, use the [coordinator guide](production/nontechnical-mainnet-deployment.md).

The earlier browser-only constructor recipe on this page is superseded. The current contracts require fixed implementation addresses and staged wiring; copied historical constructor lists are not valid release evidence. Etherscan remains useful for checking verified source and confirmed on-chain state after deployment.

## Before any public deployment

- Read the [current readiness report](production/readiness.md) and [release checklist](release-checklist.md).
- Use the pinned toolchain and compile for the intended network's 18-decimal $AGIALPHA configuration.
- Run the read-only deployment plan and resolve every blocker.
- Review signer authority, exact addresses, transaction costs and recovery procedure separately.

## Expected handoff

The current staged script deploys the stack paused. Governance controls SystemPause, which owns the eight managed modules. IdentityRegistry and TaxPolicy require two-step acceptance. The report records actual economics, tax metadata, constructor arguments, implementation addresses, pause states and incomplete explorer verification.

Complete launch limits, source verification, independent security review and real-service commissioning before unpausing. Deployment does not migrate old jobs, balances or commitments. See [fixed implementations and migration boundaries](production/fixed-implementations.md).
