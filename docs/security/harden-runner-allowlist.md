# Harden Runner Egress Allow-List

> **Audience:** Security and DevOps stewards who maintain the GitHub Actions hardening policy for AGI Jobs v0 (v2).
>
> **Purpose:** Document the canonical egress domains required for the repository's CI/CD workflows so auditors can verify that the `step-security/harden-runner` allow-list blocks unexpected network traffic without disrupting deterministic builds.

---

## Policy overview

All workflows pin `step-security/harden-runner@f4a75cfd619ee5ce8d5b864b0d183aff3c69b55a` and enforce `egress-policy: block`. Every job receives the same allow-list via the `HARDEN_RUNNER_ALLOWED_ENDPOINTS` environment variable. When a new dependency or deployment target is added, update the list in the workflow **and** reflect the change in this document.

The current allow-list covers four categories:

1. **GitHub infrastructure** – required for fetching repository contents, actions, artifacts, and container registries.
2. **Package registries and toolchains** – Node.js, npm, Foundry, Python, Hardhat, and Solidity binaries.
3. **Container ecosystem** – Docker Hub, GHCR, and Buildx/QEMU setup.
4. **Security tooling** – Sigstore (Cosign), OpenSSF Scorecard, and AWS APIs used for explorer credential retrieval.

---

## Approved endpoints

| Category | Endpoint | Justification |
| --- | --- | --- |
| GitHub core | `api.github.com:443` | Required for checkout, GitHub API usage, and artifact uploads.【F:.github/workflows/ci.yml†L20-L56】【F:.github/workflows/static-analysis.yml†L1-L111】 |
| GitHub core | `github.com:443` | Used by `actions/checkout`, Foundry, and git submodules.【F:.github/workflows/ci.yml†L69-L165】 |
| GitHub content | `raw.githubusercontent.com:443` | Fetches action metadata and Foundry installer scripts.【F:.github/workflows/ci.yml†L132-L165】 |
| GitHub content | `objects.githubusercontent.com:443` | Provides LFS-backed objects and cached action blobs.【F:.github/workflows/static-analysis.yml†L35-L84】 |
| GitHub downloads | `codeload.github.com:443` | Needed by `actions/checkout` to download archives.【F:.github/workflows/release.yml†L68-L154】 |
| GitHub packages | `pkg-containers.githubusercontent.com:443` | Authenticates GHCR pulls for Docker-based jobs.【F:.github/workflows/release.yml†L361-L427】 |
| GitHub uploads | `uploads.github.com:443` | Enables artifact uploads and release asset publishing.【F:.github/workflows/release.yml†L408-L492】 |
| GitHub gist | `gist.githubusercontent.com:443` | Required for certain third-party actions that host assets on gists.【F:.github/workflows/scorecard.yml†L20-L52】 |
| GHCR | `ghcr.io:443` | Pushes signed images for orchestrator, gateway, and webapp deployments.【F:.github/workflows/release.yml†L352-L427】 |
| npm | `registry.npmjs.org:443` | Supplies all JavaScript dependencies across CI jobs.【F:.github/workflows/ci.yml†L82-L142】 |
| npm | `registry.yarnpkg.com:443` | Backup domain occasionally used by npm registry CDN.【F:.github/workflows/ci.yml†L82-L142】 |
| Node.js | `nodejs.org:443` | Provides Node.js binaries when `actions/setup-node` downloads versions from `.nvmrc`.【F:.github/workflows/static-analysis.yml†L31-L47】 |
| GitHub objects | `objects-origin.githubusercontent.com:443` | Supports fallback downloads for cached action assets.【F:.github/workflows/static-analysis.yml†L31-L47】 |
| Python | `files.pythonhosted.org:443` | Hosts Python wheels for Slither and tooling installations.【F:.github/workflows/static-analysis.yml†L43-L84】 |
| Python | `pypi.org:443` | Required for PyPI API queries during pip installs.【F:.github/workflows/static-analysis.yml†L43-L84】 |
| Python | `pypi.python.org:443` | Legacy alias resolved during some pip transactions.【F:.github/workflows/static-analysis.yml†L43-L84】 |
| Python | `pythonhosted.org:443` | CDN domain for Python package downloads.【F:.github/workflows/static-analysis.yml†L43-L84】 |
| Solidity | `binaries.soliditylang.org:443` | Supplies Hardhat and Slither-managed solc binaries.【F:.github/workflows/static-analysis.yml†L47-L80】 |
| Google CDN | `storage.googleapis.com:443` | Hosts cached Node.js and Foundry assets referenced by GitHub Actions.【F:.github/workflows/ci.yml†L82-L142】 |
| Google CDN | `dl.google.com:443` | Fallback CDN for Node.js binary downloads.【F:.github/workflows/static-analysis.yml†L31-L47】 |
| Docker Hub | `registry-1.docker.io:443` | Pulls Trivy scanner images and Buildx base layers.【F:.github/workflows/release.yml†L352-L427】 |
| Docker Auth | `auth.docker.io:443` | Authenticates Docker Hub requests during image pulls.【F:.github/workflows/release.yml†L352-L427】 |
| Docker CDN | `production.cloudflare.docker.com:443` | Transfers layer blobs for Docker Hub images.【F:.github/workflows/release.yml†L352-L427】 |
| Sigstore | `fulcio.sigstore.dev:443` | OIDC certificate authority for Cosign keyless signatures.【F:.github/workflows/release.yml†L408-L472】 |
| Sigstore | `rekor.sigstore.dev:443` | Transparency log for Cosign keyless signatures.【F:.github/workflows/release.yml†L408-L472】 |
| Sigstore | `tuf-repo-cdn.sigstore.dev:443` | Hosts Cosign/TUF metadata required for signature verification.【F:.github/workflows/release.yml†L408-L472】 |
| Sigstore | `oauth2.sigstore.dev:443` | Handles OAuth flows for Sigstore federated identity.【F:.github/workflows/release.yml†L408-L472】 |
| AWS | `amazonaws.com:443` | Covers AWS APIs (Secrets Manager, STS, S3) used for explorer credential retrieval and provenance storage.【F:.github/workflows/release.yml†L180-L260】 |

> **Important:** If a workflow fails because a new trusted endpoint is blocked, update the allow-list in the workflow and in this table within the same pull request. Security reviewers will reject changes that diverge from this document.

---

## Change control

1. Document any modifications to the allow-list in the pull request description and link to the change ticket in the owner control registry.
2. Run `npm run ci:verify-toolchain` locally to ensure no unintended network calls are introduced. Pair this with the `--policy block` mode in a dry-run to replicate CI conditions.
3. Capture the `step-security` summary from the workflow run to prove that only approved endpoints were contacted.

Keeping the egress policy strict and well documented is a critical component of the "best-in-class" institutional deployment posture for AGI Jobs v0 (v2).
