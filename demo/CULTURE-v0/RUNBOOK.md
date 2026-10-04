# CULTURE Demo Runbook

This runbook distinguishes the complete browser teaching experience, the local service fixture stack, and the work required for a commissioned production deployment. All commands below start in `demo/CULTURE-v0` unless stated otherwise.

## 1. Prerequisites

- **Browser preview:** a current browser; no wallet, server, account, or payment.
- **Local development:** Node.js **22.23.3** and Corepack/pnpm **10.5.2**. This is an independent pnpm workspace; installing the repository root does not install it.
- **Local service stack:** Docker with Compose v2, available ports 4173, 4005, 4100, 8545, 8080, and 5001.
- **Contract verification:** Foundry v1.4.4 and the locked Hardhat toolchain. A target-network deployment additionally requires verified core addresses, authorized keys and gas, provider adapters, and commissioning evidence.

## 2. Environment Configuration

The public [Culture Studio](https://montrealai.github.io/AGIJobsv0/experiments/culture/) is built with `VITE_DEMO_MODE=true`. All computations are local. Session state survives navigation between sections and resets on reload or explicit reset; download evidence before leaving. No real LLM, IPFS CID, transaction, payment, or independent validator is claimed.

For service development, copy `.env.example` to `.env` and inspect each variable before use. The safer fixture launcher below creates a separate `.env.local` and never needs production credentials. It generates a random API token when one is absent, without printing the token. Keep this file private.

| Configuration | Meaning |
| --- | --- |
| `RPC_URL`, `CHAIN_ID` | Actual RPC endpoint and expected chain; default fixture chain is 31337. |
| `SELF_PLAY_ARENA_ADDRESS`, `ORCHESTRATOR_PRIVATE_KEY` | Configure both or neither. The legacy `SELFPLAY_ARENA_ADDRESS` alias remains supported; conflicting values fail. A configured arena selects a **hybrid** mode: the arena adapter is on-chain, but job, IPFS, and stake adapters remain local fixtures. |
| `ORCHESTRATOR_API_TOKEN` | At least 32 characters. Required for on-chain operation or a non-loopback listener; protects service writes. In Studio, enter it in **Operator connection**, never enter a wallet key. |
| `ORCHESTRATOR_HOST` | Defaults to `127.0.0.1`. Compose explicitly binds inside its container and publishes host ports to loopback. |
| `STUDIO_ORIGINS` | Comma-separated allowed browser origins; defaults to localhost and 127.0.0.1 on port 4173. CORS is not authorization. |
| `VITE_ORCHESTRATOR_URL`, `VITE_INDEXER_URL` | Browser-reachable service endpoints, fixed at build time. Do not place secrets in any `VITE_` variable. |
| `DEPLOYER_PRIVATE_KEY`, `SEEDER_PRIVATE_KEY`, `OWNER_ADDRESS` | Signing identities for deployment and seed scripts. Built-in fixture keys are public test keys, never production secrets. |
| `AGI_JOBS_CORE_ADDRESSES` | Actual upstream contract addresses for a deployment outside the fixture stack. Verify code, chain, roles, and ownership independently. |
| `IPFS_GATEWAY`, `IPFS_API_ENDPOINT`, `IPFS_API_TOKEN` | Reserved provider configuration. Setting these does **not** replace the current local `pinJSON` adapter or implement Studio upload endpoints. |
| `ELO_STATE_PATH`, `ROUND_STATE_PATH` | Persisted scoreboard and round snapshots. These are not an atomic transaction journal or durable job registry. |

## 3. One-Click Deployment

### Browser preview, locally

```bash
cd demo/CULTURE-v0 # from repository root
corepack pnpm install --frozen-lockfile
VITE_DEMO_MODE=true corepack pnpm --filter culture-studio dev --host 127.0.0.1
```

Open `http://127.0.0.1:4173`. For a static preview build:

```bash
VITE_DEMO_MODE=true corepack pnpm --filter culture-studio build
corepack pnpm --filter culture-studio exec vite preview --host 127.0.0.1 --port 4173
```

### Isolated local fixture stack

```bash
corepack pnpm local:up
node scripts/check-local-stack.mjs
# Keep named volumes and stop containers:
corepack pnpm e2e:down
```

The launcher brings up Anvil and IPFS, deploys fixture contracts, seeds the indexer, and starts Studio plus services. It prints the Studio address. This is an integration fixture, not autonomous end-to-end production operation. The Studio capabilities banner identifies the service mode. Unsupported provider buttons remain visible with an explanation and are disabled.

Named volumes preserve chain state (`culture_chain_data`), orchestrator snapshots (`culture_orchestrator_state`), indexer SQLite (`culture_indexer_db`), and IPFS data (`culture_ipfs_data`). Back up evidence before considering any destructive reset. Ordinary shutdown keeps the volumes.

### Explicit operator deployment scripts

After reviewing `.env` and the target chain, run from this directory:

```bash
corepack pnpm exec hardhat compile
corepack pnpm exec hardhat run scripts/deploy.culture.ts --network localhost
corepack pnpm exec hardhat run scripts/owner.setParams.ts --network localhost
corepack pnpm exec hardhat run scripts/owner.setRoles.ts --network localhost
corepack pnpm exec hardhat run scripts/seed.culture.ts --network localhost
```

These are explicit signed operator actions, not a one-click production commissioning guarantee. Review script inputs, role assignments, ownership, deployed bytecode, and receipts before declaring a network ready.

## 4. Owner Workflows

### 4.1 Create a Knowledge Artifact

In **Create Artifact**, choose a title, source artifact, format, and writing tone. Describe a concrete lesson and press **Send to assistant**. In preview mode this produces a deterministic teaching template that incorporates your request; it is not an LLM inference. Review the text, then preview storage, registration, and a follow-on job in order.

Storage computes SHA-256 over the exact UTF-8 draft. Identifiers starting with `preview-sha256-` are fingerprints, not resolvable IPFS CIDs. Registration adds the artifact and citation edge to the same session model used by the graph and arena picker. Duplicate content is rejected with its existing artifact ID. Follow-on jobs are recorded plans, not paid executions. Draft and workflow progress survive switching Studio sections.

### 4.2 Launch a Self-Play Arena Round

In the **preview**, select an artifact and 1–12 students. Set a target success rate between 0.10 and 0.95. Launching computes each student's fixture score and compares it with the shown pass threshold. The evidence table explains all outcomes; the export includes the exact rubric and every input.

- Success = passing students / participating students.
- Difficulty is an integer from 1–9. The preview uses `4 × (success − target)`, capped to ±2, then rounded and clamped. The service uses its separately configured PID gains, applied once per round.
- Elo uses K=32 in the preview and the teacher's pre-round rating. Rating changes balance across the cohort. Service Elo tuning is configured separately.
- Pause prevents new preview rounds. Hold difficulty keeps the next value unchanged. Parallel jobs determine modeled batch count; this does not benchmark actual concurrency.

In **service mode**, use the explicit lifecycle form: supply distinct nonzero EVM participant addresses and an integer difficulty, start a round, record actual evidence CIDs while open, close submissions, review approved student winners, and finalize separately. An empty winner list explicitly approves nobody. The UI never invents participants or auto-submits winners. Only submitted students may win, and teacher evidence is required. A CID submission is an operator assertion; it does not prove external validator consensus.

The displayed submission deadline is absolute: teacher and student evidence must arrive before `deadlineAt`, including evidence received through registry events. API acknowledgements wait for the local snapshot write. Duplicate or late events cannot reopen a round or replace accepted evidence. Finalization requires an explicit reviewed winner list in both the HTTP API and the service library; a submission alone never counts as a pass. If no student passes, submit `winners: []`.

The on-chain adapter matches the included contract's `registerParticipant` and six-argument `finalizeRound` ABI. The service sends observed success in basis points, `forceFinalize=false`, no claimed validator winners, and Elo event ID `0` because its local rating adapter creates no external event. Student winners and validator winners are separate concepts. Contract validation must succeed before the service applies the difficulty/PID update or Elo outcome. Slashing remains a separate authorized contract operation, never an implicit consequence of this finalization call.

## 5. Owner Controls

| Action | Available implementation |
| --- | --- |
| Pause/resume preview rounds, hold difficulty, change target and modeled batching | **Preview owner control panel**; session model only. |
| Pause/unpause CultureRegistry or SelfPlayArena | Direct authorized contract calls; the Studio has no owner-wallet relayer. |
| Configure allowed kinds / citation fan-out | Authorized `CultureRegistry.setAllowedKinds` / `setMaxCitations` calls. |
| Configure contract parameters | Review and run `scripts/owner.setParams.ts`. |
| Manage roles | Review and run `scripts/owner.setRoles.ts`; verify effective permissions on the actual deployment. |
| Slashing | Contract-level authorized operation requiring independently verified evidence. The orchestrator's stake adapter only logs simulated operations. |

`GET /capabilities` reports unsupported writing, upload, mint, derivative-job and owner-control APIs as false. Integrations must supply real implementations and evidence before advertising those capabilities. Studio fails visibly on service errors; it never falls back to preview data.

## 6. Monitoring & Analytics

- **Culture Graph:** local preview uses citation-only PageRank (damping 0.85, 40 iterations, uniform dangling-node redistribution). The service graph reads the indexer's GraphQL data. The accessible artifact cards mirror the visual graph. Influence is not ownership, quality certification, or financial value.
- **Scoreboard:** `GET /arena/scoreboard` includes ratings, round status and configured difficulty window. Studio refreshes after each explicit operation. WebSocket `/ws/arena` emits scoreboard updates for other consumers.
- **Prometheus:** `/metrics` currently exposes default process/runtime metrics. Request latency, validator accuracy, job queue saturation and finality metrics still require instrumentation before production.
- **Health:** orchestrator `http://localhost:4005/healthz`; indexer `http://localhost:4100/healthz`. Inspect Compose logs and deployment receipts as well as health status.
- **Evidence:** download the preview session JSON from any tab. It records model version, limitations, content fingerprints, full drafts, artifacts, citations, jobs, scores, controls and outcomes. It contains no service API token.
- **Weekly reports:** use the commands in [scripts/README.md](scripts/README.md) and the package scripts. Versioned analytics inputs under `data/analytics/` are reproducible fixtures, not fresh production telemetry.

## 7. Troubleshooting

| Symptom | Resolution |
| --- | --- |
| Preview upload unavailable | Use a secure browser context: HTTPS or localhost. SHA-256 uses Web Crypto. |
| Service provider action disabled | Inspect `/capabilities`. The bundled backend does not implement this provider; a funded wallet alone cannot enable it. Use preview to learn the workflow. |
| HTTP 401 | Apply the configured operator API token. The fixture token is in your private `.env.local`; do not publish it. |
| Service unreachable / GraphQL error | Check configured browser URLs, CORS origins, Compose health and logs. No fictional success is substituted. |
| Round cannot finalize | Verify it is closed, teacher evidence is submitted, and every winner is a submitted student in that round. Inspect actual participant status. |
| Submission deadline passed | Preserve received evidence, close the round, and review it. Deadlines do not restart after teacher submission; late registry notifications cannot extend them. A round without teacher evidence cannot finalize. |
| HTTP 404 for a round | Confirm the selected round ID and service instance. A missing round is reported distinctly from a server failure. |
| Submission storage failure | The request fails and the affected round becomes failed in memory. Preserve the previous snapshot and inspect storage before reconciliation; no successful acknowledgement is issued. |
| Failed/ambiguous chain operation | Stop writes and reconcile transaction receipts, on-chain state and local snapshots. Mutating arena transactions are not blindly retried; an ambiguous close blocks further submissions, and failed contract finalization does not advance difficulty/PID history or Elo. A browser timeout does not prove the operation was canceled: load status and inspect logs before retrying. |
| Restart during an active round | Active rounds fail closed on restart because local job records and PID history are not durably restored. Historical rounds remain visible and new local IDs advance without overwriting them. Preserve snapshots and reconcile manually; this is not full crash recovery. |
| Indexer influence stale | Inspect event ingestion, RPC logs and persisted cursor; use documented indexer CLI commands. Do not assume an unimplemented admin endpoint exists. |
| Compose service stuck starting | `docker compose --env-file .env.local logs <service>` and inspect container health details before changing any state. |

## 8. Emergency Response

Stop new writes, preserve logs and snapshots, and reconcile submitted transactions before resuming. Where applicable, use an authorized owner to pause actual contracts through direct calls. Revoke compromised credentials and permissions through the deployment's established process. Do not interpret a preview pause or simulated slash as containment on a real network. Record affected rounds, evidence CIDs, actual receipts, and recovery decisions. Obtain independent review before reopening a production deployment.

## 9. Maintenance Cadence

Run the locked builds, lint, formatting, contract tests, service coverage and browser journey checks for changes. CI retains the existing coverage and gas budget gates. Review dependency/security updates and container digests deliberately rather than applying unreviewed upgrades. Exercise target-chain finality, reorg handling, durable job recovery, backup restoration, provider timeout behavior, access control and emergency procedures before each commissioned deployment.

```bash
corepack pnpm -r run build
corepack pnpm lint
corepack pnpm format
corepack pnpm test:services
corepack pnpm test:quality-gates
corepack pnpm typecheck:scripts
# Requires Foundry; full CI also runs static analysis and Compose/Cypress:
corepack pnpm test:contracts
corepack pnpm test:contracts:hardhat
corepack pnpm test:arena-adapter
```

`test:arena-adapter` compiles the actual contract and adapter, starts its own loopback Hardhat chain, verifies every adapter ABI fragment against compiled Solidity, exercises registration/closure/finalization, and confirms validator rejection stays unfinalized. It uses explicitly simulated identity, job, stake, and validation dependency contracts and always stops its temporary chain. It does not accept an external RPC or signing key. This catches integration drift without claiming independent security review or real provider commissioning.

To build the entire Observatory from the repository root, install its locked npm dependencies **and** this pnpm workspace, then run `npm run site:build`, `npm run site:test`, `npm run site:qa`, and `node scripts/pages/culture-qa.mjs`.

## 10. Support

Use the repository's documented contribution/security channels. The earlier example contacts (`#agi-culture-ops`, `culture-ops@montreal.ai`, `CULTURE-OnCall`) are unverified placeholders, not an established 24/7 support service. A production operator must publish and test real escalation contacts and ownership.
