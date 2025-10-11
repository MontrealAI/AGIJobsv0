# Release tag signing playbook

This playbook makes the "Sign your Git release tags" requirement auditable. It covers
both SSH- and GPG-backed signing so that every production tag shows the **Verified**
badge on GitHub and passes the `Require signed release tag` job in the
[release workflow](../.github/workflows/release.yml).

## Why it matters

- **Supply-chain integrity** – Annotated, signed tags provide cryptographic proof of
  origin. Operators and external auditors can independently verify provenance with
  `git tag -v <tag>`.
- **CI provenance** – Signed tags unlock attestation workflows such as
  `npm publish --provenance` and GitHub's artifact attestations, satisfying the
  production readiness requirement for verifiable builds.
- **Operational clarity** – The release workflow now fails if a tag is missing a
  signature, preventing unsigned releases from progressing unnoticed.

## Prerequisites

1. Generate or import a signing key:
   - **SSH** – Reuse a hardened signing key (for example a YubiKey-backed
     `id_ed25519_sk`). Upload the public key under "Settings → SSH and GPG keys →
     New SSH key" with the **Signing** purpose selected.
   - **GPG** – Import your hardware-backed OpenPGP key (recommended: YubiKey) using
     `gpg --import` or create one with `gpg --full-generate-key`.
2. Configure Git to use the key for tag signing:
   - SSH signing:
     ```bash
     git config --global gpg.format ssh
     git config --global user.signingkey ~/.ssh/id_ed25519.pub
     git config --global tag.gpgsign true
     ```
   - GPG signing:
     ```bash
     git config --global user.signingkey YOUR_GPG_KEY_ID
     git config --global tag.gpgsign true
     ```

> **Tip:** Keep the signing key on hardware (YubiKey, smartcard) and require a
> touch confirmation. This blocks malware from silently issuing a release tag.

## Creating a signed release tag

1. Make sure `CHANGELOG.md` and release notes are finalised.
2. Create an annotated tag with signing enabled:
   ```bash
   VERSION=2.3.0
   git tag -s "v$VERSION" -m "v$VERSION"
   ```
   - When using SSH signing the same command works because Git reads
     `gpg.format=ssh` from the config.
3. Push the tag and branch:
   ```bash
   git push origin main --follow-tags
   git push origin "v$VERSION"
   ```

GitHub should display a green **Verified** badge next to the tag. If the badge is
missing, expand the dropdown for troubleshooting guidance.

## Verifying a tag locally

Operators must verify the signature before approving the deployment:

```bash
# Imports the release manager's public key for verification
ssh-keygen -Y import -f ~/.ssh/allowed_signers <<'KEY'
release-manager@example.com namespaces="git" <ssh-public-key>
KEY

git tag -v v2.3.0
```

For GPG keys, exchange the ASCII-armored public key (`gpg --armor --export`) and
import it with `gpg --import`. Verification must exit with status `0`. The command
prints the key fingerprint so auditors can match it against their records.

## Integrating with CI and attestations

- The release workflow runs `node scripts/ci/ensure-tag-signed.js` to ensure every
  tag pushed to `main` is annotated and contains either an OpenPGP or SSH signature.
- When `npm publish` executes with `--provenance`, GitHub automatically links the
  published artefacts to the signed tag, providing an immutable supply-chain trail.
- Enable [GitHub Artifact Attestations](https://docs.github.com/en/actions/security-guides/using-artifact-attestations-to-establish-provenance-for-artifacts)
  on the repository to emit provenance statements after publishing.

## Incident response

If a tag was pushed without a signature:

1. **Delete the remote tag** immediately:
   ```bash
   git push --delete origin v2.3.0
   ```
2. **Retag the release** using the signed flow above.
3. **Re-run the release workflow** so the signed tag propagates through CI.
4. **Document the correction** inside the incident log, including screenshots of the
   Verified badge and the `git tag -v` output.

Maintaining these steps keeps production releases verifiable by non-technical
stakeholders and meets the institutional deployment standard.
