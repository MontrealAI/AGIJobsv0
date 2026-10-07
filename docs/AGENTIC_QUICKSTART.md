# Meta-Agent Gateway & Validator Quickstart

These examples exercise event-driven on-chain execution. The generic validator uses an explicitly configured **rehearsal decision** for every selected job; it does not evaluate deliverables or provide independent buyer acceptance. Use a disposable local chain or approved test deployment. A live validator needs a qualified, task-specific decision source and the [production commissioning gates](production/readiness.md).

1. Copy `examples/agentic/gateway.config.json` and fill in the deployed module addresses, RPC endpoint, and ENS roots for the test network. Point `GATEWAY_CONFIG` at the resulting file. Use the Node version in `.nvmrc` and install the locked dependencies.
2. Supply test-account credentials through your approved secret mechanism. The gateway and validator accept `PRIVATE_KEY` or `MNEMONIC`; keep those values out of files committed to Git, shared terminals, and screenshots. Configure the non-secret settings:

   ```bash
   export GATEWAY_CONFIG="/absolute/path/to/gateway.config.json"
   export RPC_URL="http://127.0.0.1:8545"
   export AGENT_ENS="alice.agent.agi.eth"
   export VALIDATOR_ENS="validator.club.agi.eth"
   export VALIDATOR_DECISION="reject"
   ```

   Set `network` and `rpcUrl` in that configuration to the test deployment. `RPC_MAINNET` and `RPC_SEPOLIA`, when set, override the corresponding network endpoint. `VALIDATOR_DECISION` is mandatory: `approve` or `reject` (also `true`/`false`, `yes`/`no`, `1`/`0`) must be explicit. A fixed decision is suitable only for a controlled rehearsal with known expected outcomes.

3. Normalise ENS roots if needed:

   ```bash
   npm run namehash:mainnet
   # or for a Sepolia deployment
   npm run namehash:sepolia
   ```

4. Run the wiring guard for the selected deployment:

   ```bash
   NETWORK=development npm run wire:verify
   ```

5. Start the event-driven gateway and validator in separate processes:

   ```bash
   npm run agent:gateway
   npm run agent:validator
   ```

The gateway listens for `JobCreated`, checks its configured reward/stake policy, and automatically applies using the configured ENS subdomain. The generic validator at `examples/agentic/v2-validator.js` listens for committee selections, records its exact commitment privately before broadcasting, and polls the on-chain round to reveal only after the commit window closes. The commitment includes the job, round nonce, specification, verdict, burn evidence, salt, validator, chain and contract domain.

The validator resolves burn evidence separately for each selected job. If the registry requires a burn, it must already be satisfied: the validator finds that job’s latest non-removed `BurnConfirmed` event using backward pages of at most 2,000 blocks, reduces page sizes when the provider requires it, and verifies the receipt with `hasBurnReceipt(jobId, hash)`. Missing or unavailable required evidence blocks commitment preparation. Jobs with no burn requirement use the zero hash. The legacy process-wide `BURN_TX_HASH` setting is ignored with a warning; it cannot override a job’s receipt.

The exact resolved receipt is preserved in the private journal and checked against the job again before any commit or reveal broadcast. Restart recovery never substitutes a different receipt into an existing commitment.

## Private reveal journal and restart recovery

The default journal is `~/.agi-jobs/validator-reveals`, outside the repository. Set `VALIDATOR_STATE_DIR` to an absolute dedicated directory when using persistent deployment storage. The validator creates private directories (`0700`) and secret files (`0600`), checks ownership and rejects symlink paths or unsafe existing permissions. Use a path without symlink ancestors on a filesystem that supports exclusive hard links and file/directory `fsync`; local Linux and macOS deployments require appropriate private storage. Do not put this directory on a public artifact volume or serve it over HTTP. Its plaintext salts must remain private until reveal and should be included only in protected backups.

Journal records are isolated by chain ID, ValidationModule address, validator address, job and round nonce. Restart with the same wallet, chain, contract and state directory. The validator reads the preserved records and reconciles a consistent chain snapshot with two confirmations; changing the configured decision cannot replace a recorded verdict or salt. Completed records are retained and their chain state is checked again to detect reorganizations. Polling defaults to five seconds; `VALIDATOR_POLL_MS` accepts 1,000–60,000 milliseconds.

Before each commit or reveal broadcast, an exclusive durable intent is written. An uncertain send or a 60-second confirmation timeout preserves that intent and never automatically sends a replacement. Other retained jobs continue through recovery. `commit-uncertain` or `reveal-uncertain` means an operator must inspect pending/mined transactions and canonical contract state. A matching on-chain commitment permits the original reveal when its window opens; a confirmed reveal completes recovery. Corrupt records, different commitments, changed rounds/specifications/chains, and closed windows block the affected action. A corrupt journal stops startup instead of silently creating fresh secrets.

Keep the state directory intact during an incident. Do not delete intent files, regenerate salts, or manually rebroadcast until the original transaction is reconciled; retain a protected backup before any operator repair. Recovery does not reconstruct secrets lost before this version, recover missed committee selections while offline, reopen expired windows, or certify a deployment against deep chain reorganizations. Disk failure, provider outages, account authorization and identity/tax/stake requirements remain commissioning responsibilities.

Runtime metrics and sanitized quarantine codes are appended to `examples/agentic/runtime-agentic.jsonl`. Provider exceptions and reveal calldata are excluded from those validator logs. The separate validator implementations in `apps/orchestrator/service.ts`, `agent-gateway/validator.ts`, `apps/validator/index.ts` and `scripts/validator/cli.ts` are not covered by this journal or its recovery tests.

> **Mainnet wiring:** `NETWORK=mainnet npm run wire:verify` enforces the configured canonical `$AGIALPHA` staking token (`0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA`) and module wiring. A passing wiring check does not authorize a rehearsal validator for live independent review.
