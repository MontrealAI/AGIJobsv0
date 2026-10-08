# AGI Jobs v0 (v2) — Validator UI

The validator review console is a Next.js interface for independently reviewing jobs, committing an explicit approval or rejection, and revealing that decision through a browser wallet. It uses the current deployed v2 protocol, including the chain, module domain, validator, specification, nonce and confirmed burn receipt. The interface does not decide whether a deliverable is acceptable.

## Start locally

Use the repository's pinned Node.js and npm versions (`.nvmrc` and `package.json`). From the repository root:

```bash
npm ci --prefix apps/validator-ui
cp apps/validator-ui/.env.example apps/validator-ui/.env.local
# Edit .env.local with the addresses from your reviewed deployment manifest.
npm run dev --prefix apps/validator-ui
```

Open `http://localhost:3000`. The gateway's default host port is `8090`. The UI reads `/api/jobs` on its own origin; a bounded, read-only server proxy contacts the configured gateway. This avoids depending on cross-origin gateway permissions. Only the configured jobs list and canonical job-ID deliverable endpoints are proxied; browser headers, wallet data and arbitrary destinations are not forwarded.

For containers, use the repository Compose instructions. Browser `NEXT_PUBLIC_*` configuration is embedded during `next build`, so rebuild the image after changing those values. `GATEWAY_URL` is server-only runtime configuration; Compose points it at `http://agent-gateway:8090`. Never put credentials or private keys in public variables.

## Review, commit and reveal

1. Confirm the configured chain, validation module, registry and token against the deployment manifest. Connect the selected validator wallet. The wallet network must match the configured RPC, and the registry must match `ValidationModule.jobRegistry()`.
2. Open **Validator identity** and enter the validator's subdomain label, such as `validator01`, plus a Merkle proof if the deployed identity registry requires it. ENS reverse lookup is advisory; the contract enforces identity, stake and committee membership.
3. Independently inspect the authoritative specification and delivered evidence. The jobs feed displays its specification URI and hash; **Load delivered evidence** shows the gateway-reported result URI, hash and transaction; do not treat feed availability, agent success claims or a checkbox as evidence of acceptance. Only decide after performing the required review.
4. Acknowledge the review, then choose **Commit approval** or **Commit rejection**. The console confirms the displayed specification against the chain, reads any required confirmed burn receipt, and saves a recovery record **before** asking your wallet to broadcast.
5. Download a private backup. Keep the browser profile and website origin unchanged. Return after the displayed commit deadline, choose **Check status**, then **Reveal**. Eligibility uses current chain time and deadlines, not a fixed browser timer. The wallet explicitly confirms the six-argument reveal transaction.
6. Check that the vote is revealed on chain. A completed record remains available. A later round can archive it only when its successful reveal receipt remains canonical and the new round has a later commit deadline.

The console preserves a single active record per chain, module, validator and job. Records additionally bind the registry, domain, specification, nonce, both round deadlines and a canonical observed block. Round deadlines matter because the current contract can reuse nonce `1` after a reset. Stale rounds, changed wallets, changed specifications and reorganized observations fail closed.

## Recovery and privacy

Recovery records contain the unrevealed decision and salt. Browser local storage and downloaded JSON backups are **unencrypted**. Use a trusted device, browser profile, HTTPS origin and operator-controlled UI deployment. Other code running on the same origin can access this data. The UI does not claim operating-system-level secret storage, disk durability, unattended reveal service or production commissioning.

The console requires Web Locks (available on modern browsers over HTTPS or localhost) and holds an exclusive lock through each transaction workflow, preventing competing tabs from replacing secrets. Browser storage must accept and read back a record before any broadcast. Do not clear site data, use private browsing for a pending vote, or close the wallet while confirming.

If the wallet rejects, times out, or loses its response, preserve the saved record and check wallet history and on-chain state. The UI never replaces that secret or automatically resends an uncertain commit/reveal. A mined commitment can be reconciled after a page reload. Once a reveal has been attempted, only status checks occur until it is positively observed on chain. If the broadcast response lost the transaction hash, bounded event queries recover the canonical receipt and verify the original module, validator, job, decision, burn hash, salt and round time bounds. This historical reconciliation also works when the operator first returns after a later round was selected; it never resends the old vote.

**Importing an older backup is intentionally read-only for broadcasts.** An export cannot prove that no transaction was sent afterward. Imported records can verify on-chain completion and preserve the original fields for operator reconciliation; they do not re-enable a send. If an attempted transaction is conclusively rejected or dropped, use the deployment's reviewed operator procedure to reconcile its nonce and pending transaction history before any deliberate replacement. There is no “clear and retry” shortcut.

The current contract accepts an opaque commitment without an expected-round argument. Local scope checks cannot make an already signed transaction impossible to mine across a later round reset. Full protocol-level prevention requires a versioned epoch-bound contract change and deployment review; this UI detects inconsistent recovery state and stops rather than claiming that guarantee.

## Configuration

| Variable                                | Purpose                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_RPC_URL`                   | RPC URL reachable by the browser; default `http://localhost:8545`.              |
| `NEXT_PUBLIC_VALIDATION_MODULE_ADDRESS` | Required deployed ValidationModule address.                                     |
| `NEXT_PUBLIC_JOB_REGISTRY_ADDRESS`      | Optional explicit registry cross-check; the module's registry is authoritative. |
| `NEXT_PUBLIC_AGIALPHA_ADDRESS`          | Token address; defaults to `config/agialpha.json`.                              |
| `NEXT_PUBLIC_AGIALPHA_DECIMALS`         | Expected token decimals; verified against the chain.                            |
| `GATEWAY_URL`                           | Server-reachable gateway base URL; default `http://localhost:8090`.             |
| `NEXT_PUBLIC_GATEWAY_URL`               | Legacy public fallback for the server gateway URL. Prefer `GATEWAY_URL`.        |
| `NEXT_PUBLIC_FETCH_TIMEOUT_MS`          | Browser jobs request timeout; default 5000 ms, maximum 60000 ms.                |
| `NEXT_PUBLIC_ATTESTATION_ADDRESS`       | Optional registry for the preserved `/attest` identity-management page.         |

`NEXT_PUBLIC_REVEAL_DELAY_MS` is obsolete: reveal timing comes from the actual round. All existing identity attestation operations remain available at `/attest`.

## Verification

The development toolchain pins patched Vitest `4.1.11` and retains its supported Vite `7.3.6` peer. Node 22 type declarations are explicit so clean container builds do not depend on transitive packages or globally installed types. The checked-in lockfile is verified with the repository's pinned `npm ci`.

```bash
# From the repository root; compile contracts first if artifacts are absent.
npx hardhat test --no-compile test/validator-ui/commitReveal.test.js
npm test --prefix apps/validator-ui -- --run
npm run build --prefix apps/validator-ui
```

The contract integration tests exercise the real `ValidationModule`, both decisions, saved-state reload, deadline handling, recovery after uncertain broadcasts, pre-broadcast persistence, invalid specification/committee/burn conditions and real nonce reuse after round reset. Container CI builds the image and checks the HTTP service. These tests verify this console's behavior; they do not certify unrelated demonstrations, production keys, deployments or acceptance of real work.
