# Omega operator playbook

Use the [README](../README.md) for the quickstart. This playbook separates the local rehearsal, configured application stack and real deployment responsibilities. The demo does not register ENS names, publish IPFS files or instantiate production contracts by running its default command.

## Run and verify a rehearsal

```bash
npm run demo:omega-business-3 -- --scope operator-review
node demo/LARGE-SCALE-OMEGA-BUSINESS-3/lib/verify.cjs /absolute/printed/run-directory
npm run demo:omega-business-3:ui -- --report /absolute/printed/run-directory
```

Use a new directory for each `--out`. Preserve `report.json` and all manifested files together, and archive the digest in a trusted audit system. The ledger describes synthetic jobs; `onChainJobId` remains null. Owner-report configuration snapshots and fixture test receipts are different evidence classes.

Review scope and economics before commissioning work. USDC business budgets have six decimals and are planning amounts; the optional contract fixture uses the original mock token with 18 decimals. A successful fixture result does not convert units, escrow real customer funds or earn a fee.

## Existing owner diagnostics

After root `npm ci`, use `--full` to run the four retained owner utilities and the focused contract test. The default planning context is `sepolia`; local `hardhat`/`localhost` contexts may cause the owner parameter utility to bootstrap disposable fixtures. Review the actual phase log and report. Do not describe local bootstrap as a production read-only audit.

```bash
npm run demo:omega-business-3 -- --full --network sepolia --timeout-ms 300000
npm run owner:command-center -- --network sepolia --format human --no-mermaid
npm run owner:surface -- --network sepolia --format human
```

**On a fresh checkout**, `--full --network sepolia` stops at the parameter matrix because TaxPolicy and RewardEngine addresses are zero. The JSON matrix and phase log retain the exact errors. Supply reviewed actual deployment configuration before expecting the full workflow to pass; never insert invented addresses to make diagnostics green. Use the standalone local contract test in the README to rehearse mock settlement independently.

Reports expose configured pause, ownership, parameter and treasury information. Production authority must be verified against the actual chain, contract code and owner/governance accounts. A report alone does not prove that an operator can safely pause or upgrade a live deployment.

## Launch the separately configured applications

Read the setup guides for [Owner Console](../../../apps/console/README.md), [Enterprise Portal](../../../apps/enterprise-portal/README.md) and [Validator UI](../../../apps/validator-ui/README.md). Install each app's locked dependencies and configure its actual RPC, chain, contract addresses and any indexer/backend before launching:

```bash
npm run demo:omega-business-3:ui -- --stack
```

| App               | Default loopback URL  | Port override              |
| ----------------- | --------------------- | -------------------------- |
| Owner Console     | http://127.0.0.1:3000 | `OWNER_CONSOLE_PORT`       |
| Enterprise Portal | http://127.0.0.1:3001 | `ENTERPRISE_PORTAL_PORT`   |
| Validator Desk    | http://127.0.0.1:3002 | `VALIDATOR_DASHBOARD_PORT` |

The supervisor requires Linux/macOS/WSL, checks HTTP readiness for up to 90 seconds, refuses occupied/duplicate ports, supplies Vite's real port flags with `--strictPort`, and prints a unique private log directory. Failure in one service stops all services. Ctrl+C terminates child process groups; logs remain for diagnosis. Readiness means HTTP response, not correct wallet/RPC/indexer configuration.

Use disposable accounts and a test network for rehearsals. The apps do **not** automatically preload Omega personas. Enter reviewed mission information manually from the scenario or create an appropriate specification through the portal. Connecting any arbitrary funded wallet is not a safe setup shortcut.

## Preserve the original Solaris job flow

The original illustrative briefing remains:

- Title: **Heliostat Free-Energy Transmutation**.
- Vision: coordinate orbital AGI fleets to convert heliostat telemetry into autonomous infrastructure credits.
- Legacy mock reward: **150000**, with a **72-hour** deadline.
- Skills: `energy-markets, orbital-ai, treasury-automation`.
- Suggested reviewer persona: **Horizon Arbitration Collective**, alongside **Atlas Integrity Guild** in the scenario.

For actionable work, use the narrower energy-balance task and its measurable criteria. The historical title is not a scientific claim. Verify the actual production asset/decimals; never paste the mock reward into a USDC field as a conversion.

The Enterprise Portal exports exact specification bytes for separate publication and URI verification. Attachments remain local unless separately published. Do not use the historical placeholder CIDs as evidence. Verify retrieval and exact content hash before approving a job transaction. Register and verify actual agents/validators; the scenario's ENS labels and `.agent.agi.eth` / `.club.agi.eth` identities are illustrative, not proof of registration.

The Validator Desk shows actual configured assignments, voting windows and disputes only when its contracts/indexer are operational. A named persona in a JSON file does not vote. The minimal `SimpleJobRegistry` fixture has **no validator voting, burns or disputes** and pays the full mock reward; never infer production behavior from its receipt.

## Production commissioning

Keep a reviewable evidence record for each gate before real customer work:

1. **Deployment and money:** exact chain ID, deployed code/addresses, actual settlement asset and decimals, governance/treasury ownership, gas/fee bounds, stake/tax prerequisites, pause/upgrade controls and independent contract/release review. Keep deployment/signing keys outside workers.
2. **Worker environment:** installed OpenClaw/Work versions and permissions, dedicated OS/browser accounts, approved data rights, isolated tools/apps, enforced network/action boundaries, measured provider costs, spending limits and cancellation. The [computer-work guide](../computer-work/README.md) uses the existing adapter.
3. **Admission and recovery:** exact reviewed task digest, unique job/deployment scope, durable shared journal, backed-up settlement state, duplicate prevention, restart and unknown-outcome reconciliation drills. Rehearsal capacity is not a global production queue reservation.
4. **Acceptance and disputes:** independently registered reviewers, task-specific evaluators, real review availability, wrong-result/prompt-injection tests, actual app-state inspection, evidence publication and content integrity, dispute/finality behavior and a separate settlement signer. Require evidence beyond model completion or a green fixture check.
5. **Operations and scale:** representative task reliability/load tests, bounded queue admission, observed end-to-end costs, monitoring and incident escalation, retention/deletion policy, rollback/stop drills, and customer-authorized rollout. Record what has passed and what remains unresolved.

These are deployment gates, not claims established by this demo's CI. Use the repository [RUNBOOK](../../../RUNBOOK.md), [OperatorRunbook](../../../OperatorRunbook.md) and release workflow for the wider protocol.

## Mainnet preparation and explicit execution

```bash
npm run demo:omega-business-3:mainnet
```

By default this prints an inert preparation plan: no RPC, environment overwrite, wallet access or deployment. The original deployment capability remains as an explicit advanced route:

```bash
npm run demo:omega-business-3:mainnet -- \
  --execute \
  --config /absolute/reviewed-deployer.json \
  --config-sha256 REVIEWED_64_HEX_DIGEST \
  --env /absolute/protected-operator.env \
  --ticket /absolute/new-mainnet-change-ticket.md
```

Do not run that example until your independent release review authorizes actual deployment. The config must explicitly name `mainnet`, nonzero governance and treasury addresses, and a **fresh absolute** addressbook output path. Compute and review its SHA-256 locally; the wrapper requires a matching digest. The operator env file must already exist and the ticket path must be new. Set `MAINNET_RPC_URL` in the protected process environment; the wrapper checks `eth_chainId = 1` using a bounded HTTPS request before opening an interactive terminal workflow.

The wrapper runs the existing deployment checklist, rechecks the config digest, and invokes the existing **interactive** one-click wizard without `--yes` or automatic Compose. The wizard updates the explicit operator env file **after** deployment using actual address output; review and back up that file in advance. Its existing deployment engine controls transactions and defaults: the wrapper does not independently audit that engine or guarantee a spending cap. A successful deployment produces an owner change ticket for review. An abort, failure, timeout or uncertain receipt requires reconciliation before a retry; never assume a partially completed deployment did nothing.

No production deployment, real provider dispatch, live payment or verified market-size claim is made by this update.
