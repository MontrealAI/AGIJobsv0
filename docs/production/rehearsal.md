# Production rehearsal

Run the production candidate through a repeatable local rehearsal before introducing real credentials, external reviewers, or paid settlement. The command executes actual application code and contract transactions, deliberately introduces failures, and produces an HTML report with verifiable evidence.

**A passing rehearsal is simulation evidence.** It never authorizes a production release, installs a maintainer signing key, claims an independent audit, or deploys to the intended public network.

## Run it

Use the repository's Node/npm versions, Git, OpenSSH (`ssh-keygen`), and Bash on Linux or macOS. Anvil is optional; the launcher falls back to Hardhat.

```bash
nvm install
nvm use
npm install --global npm@10.8.2
CYPRESS_INSTALL_BINARY=0 npm ci
npm run production:rehearse
```

The checkout must be clean and committed. The runner creates its own temporary Git worktree, reuses installed dependencies, compiles with the production profile, and runs each stage sequentially. It excludes inherited application credentials and network settings. It chooses an unused loopback port; an occupied-port race fails rather than stopping another process. Expect several minutes for compilation and local settlement.

At completion, open the printed `reports/production-rehearsal/<run>/index.html`. Each run has its own directory, so previous evidence is retained. An alternate destination must also be new:

```bash
npm run production:rehearse -- --output /absolute/path/to/new-rehearsal
npm run production:verify-rehearsal -- /absolute/path/to/new-rehearsal
```

Failed stages return a nonzero exit code and retain their logs in a signed **failed** report. Fix the reported problem and run again; do not edit a failed report into a passing one. The verifier rejects changed logs, missing/extra files, modified manifests, symlinks, omitted checks, and production-approval claims.

## What is exercised

| Gate | Executed rehearsal | What still needs real evidence |
| --- | --- | --- |
| Maintainer signing | Actual ephemeral Ed25519 SSH signing in disposable repositories; the real release guard rejects unsigned, untrusted, malformed, wrong-commit, and shell-injection cases. Release CI and explorer-inventory rejection checks also run. | Authorized maintainer public-key verification and an authentic signature on the reviewed release tag. |
| Providers | The compiled gateway makes real HTTP requests to local fixtures. Agent tests cover JSON/text success, 401/403, 429, 500/503, redirects, malformed/empty responses, timeouts, size limits, and recovery. The default IPFS client loads and performs HTTP add/cat, rejects an outage, and recovers. Execution tests require failure before upload, signing, or submission. | Intended provider credentials, real model/work quality, data policy, rate limits, cost, persistent storage, and sustained operation. The Kubo-compatible fixture returns a fixed test CID; it is not an IPFS node or durability proof. |
| Security review | Existing contract regressions exercise interrupted/resumed deployment, implementation identity/layout, unauthorized changes, pause/unpause, escrow, and reentrancy. Production bytecode limits remain enforced. | Independent reviewers, a documented threat-model review, resolved findings, and acceptance of documented residual risks. Automated self-review is not independent review. |
| Network commissioning | Three jobs execute deployment, identity setup, validator commit/reveal, employer settlement, and payouts on a disposable chain. Receipt validation requires three distinct jobs, three validator addresses per job, successful final states, ten implementation addresses, and fourteen constructor records. | Intended-chain addresses and creation transactions, real identities, independently operated validators, economics, monitoring, incident response, and paid settlement. |

The mission names and macroeconomic objectives are demonstration narratives. The performed work is synthetic; the measured result is the local protocol lifecycle, not delivery of a healthcare, agriculture, or infrastructure project.

## Evidence and trust

The report records the exact committed source tree, stage commands, timestamps, exit codes, limitations, and commissioning observations. Logs and transaction receipts are retained. A patch records tracked configuration changes made inside the isolated local fixture checkout. The runner removes only its own worktree and temporary keys; it does not change production signer registries or deploy address books.

`manifest.json` hashes every retained evidence file with SHA-256. Its SSH signature uses the distinct `agijobs-rehearsal` namespace and a disposable key. Only the public key and fixture allowed-signers file are retained. The private key is deleted during cleanup.

This self-contained signature detects changes relative to the bundled public key. It does **not** establish maintainer identity: someone who replaces the entire bundle and key can produce another self-signed bundle. Keep the original CI artifact digest or report through a trusted channel. Never copy the fixture signer into `.github/signers/allowed_signers`.

The `Production rehearsal` workflow retains evidence even after failure. The production release CI guard also requires a successful rehearsal workflow for the exact main-branch release commit. Its success complements the existing CI, static analysis, coverage, signing, and explorer-verification gates; it does not bypass them.

## Preserve the vision and prove the next step

Existing features, demonstrations, and diagrams remain. This rehearsal provides a repeatable technical handoff for maintainers, reviewers, and operators: use its same scenario matrix with real providers, authorized signers, independent reviewers, and intended-network configuration. Keep those live results separately labeled and retain the original simulation evidence for comparison.
