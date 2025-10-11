# Release Artifacts & Verification Blueprint

This blueprint documents every artefact produced by the **AGI Jobs v0 (v2)**
release pipeline and the steps required to reproduce, verify, and publish a
production-ready drop that meets institutional audit requirements.

> **Scope** – Applies to Git tags `v*`, the `release.yml` GitHub workflow, and any
> manual dry-run performed with identical container images and toolchain pins.

## 1. Toolchain fingerprint

| Component | Version source | Enforcement |
| --- | --- | --- |
| Node.js | `.nvmrc` (CI uses `actions/setup-node`) | `npm run ci:verify-toolchain` (fails if drift is detected). |
| npm | 10.x (bundled with pinned Node) | `package-lock.json` committed; `npm ci` only. |
| Hardhat | Declared in `package.json` | Deterministic compile via `npx hardhat compile`. |
| Foundry | `foundry.toml` `profile.default` pins | Validated with `foundryup --version` inside CI container image. |
| Solc | `foundry.toml` / Hardhat config | Resolved via `hardhat.config.js` version matrix. |
| Docker | `docker/build-push-action` pinned SHA | Reused for deterministic multi-arch images. |

**Action:** prior to tagging a release, run `npm run ci:verify-toolchain` locally
and capture the JSON summary in `reports/toolchains/<date>.json` for audit logs.

## 2. Artefact inventory

The release workflow produces a signed tarball `agi-jobs-v<version>-artifacts.tar.gz`
containing:

- `reports/abis/head/` – Final ABI exports (used for Etherscan verification).
- `reports/sbom/` – SPDX SBOM (`.spdx.json`) plus CycloneDX manifest.
- `reports/release/manifest.json` – Contract names ↔ addresses ↔ bytecode hashes, toolchain fingerprint (Node, npm, Hardhat, Foundry, full Solidity compiler matrix), and network metadata (chain ID, explorer URL, deployment-config reference).
- `reports/release/manifest-summary.md` – Non-technical Markdown snapshot with tables linking each contract to explorer URLs and SHA-256 hashes for ABIs/bytecode.
- `reports/release/notes.md` – Human-readable release notes with change log.
- `typechain-types/` – TypeScript bindings (must match ABIs).
- `deployment-config/` – Verification configs and deterministic deployment params.

Every archive is accompanied by:

1. SHA-256 checksum file (`.sha256`).
2. Sigstore keyless signature (`.sig`) and certificate (`.pem`).
3. SLSA provenance bundle (from `actions/attest-build-provenance`).

**Action:** attach all companion files when publishing a GitHub release; do not
modify the archive contents post-signing.

## 3. Contract verification automation

The `verify-contracts` job in `release.yml` performs automated Etherscan /
Blockscout verification by:

1. Loading API keys through OIDC + AWS Secrets Manager (`configure-aws-credentials`).
2. Reading `reports/release/manifest.json` to resolve addresses and compiler inputs.
3. Executing `scripts/release/run-etherscan-verification.js` to submit source +
   metadata for every contract target listed in `deployment-config/verification/<network>.json`.
4. Uploading `reports/release/verification-summary.json` as a workflow artefact.

**Operator checklist**

- ✅ Confirm the `ETHERSCAN_*` secrets are scoped to the target network before
  dispatching the workflow.
- ✅ After workflow completion, download the verification summary and archive it
  alongside board approvals in the release dossier.

## 4. Manual attestation reproduction

Institutions may require a local reproduction of the signed artefacts. Execute:

```bash
npm ci --no-audit
npx ts-node --compiler-options '{"module":"commonjs"}' scripts/generate-constants.ts
npx hardhat compile
npm run abi:export -- --out reports/abis/head
npm run release:manifest
npm run release:notes -- --manifest reports/release/manifest.json \
  --out reports/release/notes.md --network mainnet --version <version>
npm run sbom:generate
```

Then package:

```bash
tar -czf dist/agi-jobs-v<version>-artifacts.tar.gz \
  reports/abis/head reports/sbom reports/release typechain-types deployment-config
sha256sum dist/agi-jobs-v<version>-artifacts.tar.gz > dist/agi-jobs-v<version>-artifacts.tar.gz.sha256
```

Finally, sign with Cosign (keyless mode mirrors CI):

```bash
COSIGN_EXPERIMENTAL=1 cosign sign-blob --yes --keyless \
  --output-signature dist/agi-jobs-v<version>-artifacts.tar.gz.sig \
  --output-certificate dist/agi-jobs-v<version>-artifacts.tar.gz.pem \
  dist/agi-jobs-v<version>-artifacts.tar.gz
```

The resulting hashes **must** match the CI-generated files; if not, halt and
investigate toolchain drift.

## 5. Release dossier template

Store the following in the compliance drive for every version:

- ✅ `reports/release/manifest.json` (immutable reference for audits).
- ✅ Downloaded SARIF reports from CodeQL/Slither/Scorecard (CI artifacts).
- ✅ Verification summary JSON + console exports showing “Verified” status on
  Etherscan / Blockscout.
- ✅ Governance approval evidence (Safe transaction hashes, timelock queue IDs).
- ✅ Incident-response sign-off confirming tabletop rehearsal within the last 90 days.

## 6. Change control linkage

Each release must reference a signed change ticket using
`docs/owner-control-change-ticket.md`. Update the ticket with:

- Git commit SHA used to trigger the release workflow.
- SBOM hash and Cosign certificate URI.
- Links to CI runs proving `ci (v2)` and `static-analysis.yml` completed
  successfully on the tag.

Maintaining this dossier ensures auditors can independently reproduce the
deployment and provides objective evidence that AGI Jobs v0 (v2) meets the
“best-ever” release transparency bar described in the readiness rubric.
