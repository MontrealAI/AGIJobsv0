# Release Artifact Signing and Verification

To guarantee chain-of-custody for AGI Jobs v0 (v2) releases, every workflow invocation
packages the deployable artefacts into a single tarball, signs it with Sigstore
Cosign, and generates an in-toto provenance bundle. This guide explains how to
validate those files before you promote a release to production.

## Artefacts published with each GitHub release

Each release upload includes the following files:

| File                                                 | Purpose                                                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `agi-jobs-v<version>-artifacts.tar.gz`               | Canonical bundle of ABIs, SBOM, TypeChain output, and deployment manifests prepared by CI. |
| `agi-jobs-v<version>-artifacts.tar.gz.sha256`        | SHA-256 checksum for offline integrity verification.                                       |
| `agi-jobs-v<version>-artifacts.tar.gz.sig`           | Cosign signature, created via keyless signing with GitHub OIDC.                            |
| `agi-jobs-v<version>-artifacts.tar.gz.pem`           | Sigstore certificate containing the signing identity metadata.                             |
| `agi-jobs-v<version>-artifacts.tar.gz.sigstore.json` | Cosign signature bundle containing verification material and the transparency-log proof.   |
| `<hash>.intoto.jsonl`                                | SLSA provenance bundle emitted by `actions/attest-build-provenance`.                       |

## Verification prerequisites

1. Install [Cosign](https://github.com/sigstore/cosign) v3.1.3 or later.
2. Trust the Sigstore transparency log root certificates. Cosign manages this
   automatically when using keyless verification.
3. Download every artefact listed above from the matching GitHub release tag.

## Verification workflow

1. **Checksum validation**

   ```bash
   sha256sum --check agi-jobs-v<version>-artifacts.tar.gz.sha256
   ```

   The command must report `OK` for the tarball entry.

2. **Cosign signature verification**

   ```bash
   cosign verify-blob \
     --bundle agi-jobs-v<version>-artifacts.tar.gz.sigstore.json \
     --certificate-identity "https://github.com/MontrealAI/AGIJobsv0/.github/workflows/release.yml@refs/tags/v<version>" \
     --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
     agi-jobs-v<version>-artifacts.tar.gz
   ```

   Cosign prints the signing certificate details and exits with status code 0
   when the signature, certificate, and workflow identity all match.

3. **SLSA provenance inspection**

   ```bash
   gh attestation verify agi-jobs-v<version>-artifacts.tar.gz \
     --repo MontrealAI/AGIJobsv0 \
     --signer-workflow MontrealAI/AGIJobsv0/.github/workflows/release.yml \
     --source-ref refs/tags/v<version> \
     --bundle <hash>.intoto.jsonl
   ```

   Replace `<hash>.intoto.jsonl` with the provenance bundle name from the
   release assets. GitHub CLI verifies the provenance against the artifact, repository,
   workflow, and source tag. See the [official CLI reference](https://cli.github.com/manual/gh_attestation_verify).
   Keep the detached `.sig` and `.pem` assets for compatibility; use the complete
   `.sigstore.json` bundle for current Cosign verification.

## Operational expectations

- Store verified artefacts and provenance bundles in your long-term compliance
  archive alongside deployment approvals.
- Repeat the verification steps whenever you promote a release artefact to a new
  environment (staging, pre-production, production) to ensure integrity at each
  hop.
- If verification fails, stop the deployment pipeline immediately and open an
  incident following `docs/incident-response.md`.

Maintaining verifiable supply-chain metadata is a key control for institutional
platform operators. By checking signatures and provenance before distribution,
you provide auditors and internal risk committees with a reproducible, tamper-
proof deployment record.
