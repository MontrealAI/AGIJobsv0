# Release Manifest Generation

The `release:manifest` utility packages the critical metadata auditors expect
for AGI Jobs v2 deployments. It produces a reproducible JSON manifest that
captures the toolchain, git provenance, contract hashes, and the canonical
address book so any downstream team can independently validate what was
deployed.

## Usage

The script runs after Hardhat artifacts are available. Run a compile first or
let the helper trigger it on demand:

```bash
npm run compile
npm run abi:export         # optional: refresh curated ABI exports
npm run release:manifest   # writes reports/release/manifest.json
```

Pass a custom directory when preparing a release package:

```bash
npm run release:manifest -- --dir dist/release-v2.0.0
```

This creates `dist/release-v2.0.0/manifest.json` and ensures the directory
exists. Use `--out <file>` when you need an explicit path instead of a folder.

Provide network context so the manifest captures the chain ID, explorer, and
configuration provenance:

```bash
npm run release:manifest -- \
  --network mainnet \
  --deployment-config deployment-config/mainnet.json
```

Set `--chain-id` or `--explorer-url` when preparing a manifest for a network
without a pre-baked configuration file.

## Manifest Contents

The manifest is intentionally human-readable. Each section maps back to a
specific control in the deployment readiness checklist:

- **generatedAt** – UTC timestamp documenting when the manifest was built.
- **packageVersion** – Mirrors `package.json#version` for quick sanity checks.
- **git** – Includes the commit SHA, exact tag (when run from a signed tag), and
  whether the working tree was dirty. These values line up with the provenance
  flow in [release-provenance.md](release-provenance.md).
- **toolchain** – Captures the versions pinned via `.nvmrc`, `package.json`, and
  `foundry.toml` so another operator can reproduce bytecode deterministically.
- **network** – Embeds the chain name, chain ID, canonical explorer URL, and the
  deployment-config file path used for the release.
- **contracts** – For each production contract the manifest records:
  - the Hardhat artifact location relative to the repo root,
  - a SHA-256 hash of the ABI, and of the deployed bytecode,
  - the deployed bytecode length (in bytes) for quick drift detection,
  - any addresses found in `docs/deployment-addresses.json` or
    `docs/deployment-summary.json`.
- **warnings** – Deduplicated hints surfaced when artefacts or addresses are
  missing. Keep this list empty before cutting a release to prove the manifest
  is complete.

Because the manifest only depends on committed files it can be checked into the
repository, attached to a GitHub Release, or signed alongside the release tag.
Pair the JSON output with the SBOM (`npm run sbom:generate`) and ABI bundle to
create a single archive that satisfies institutional audit requirements.

## Operational Checklist Integration

Add the manifest to the artefact bundle referenced in
[release-checklist.md](release-checklist.md) after the final governance sign-off:

1. Run the owner control doctors and snapshot scripts.
2. Regenerate the SBOM and ABI exports.
3. Run `npm run release:manifest` and review the warnings section.
4. Attach the resulting JSON to the signed release alongside coverage,
   Slither/Echidna logs, and the owner sign-off packages.

Document the manifest path in the release notes so operators and auditors can
trace production bytecode back to the source repository with zero ambiguity.
