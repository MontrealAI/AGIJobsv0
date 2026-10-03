# Release Provenance & Tag Signing

This playbook codifies how to produce verifiable AGI Jobs v0 releases so
operations, auditors, and downstream integrators can trust the build
artefacts.

## 1. Generate a Hardware-Backed Signing Key

1. Provision the maintainer's hardware-backed SSH signing key. Follow
   [GitHub's SSH signature guidance](https://docs.github.com/en/authentication/connected-accounts/about-ssh-signature-verification).
   The release gate accepts SSH signatures; GPG-signed release tags are not accepted.
2. Register the public key as a signing key on the authorized maintainer's GitHub account.
   Confirm its fingerprint with `ssh-keygen -lf ~/.ssh/id_ed25519.pub` through the maintainer's trusted process.
3. Replace the illustrative rows in `.github/signers/allowed_signers` with verified entries in this format:
   ```text
   <maintainer-principal> namespaces="git" <complete OpenSSH public key>
   ```
   Replace both angle-bracket placeholders. Keep the principal and key on one line.
   The key is the complete public `.pub` line, never the private key. `ssh-keygen -Y export`
   is not a valid command for creating this file. Commit the reviewed registry change;
   a GitHub `Verified` badge alone does not authorize a key in this repository.

## 2. Configure Git for Tag Signing

Run these commands in the repository, using the authorized key's actual path:

```bash
git config gpg.format ssh
git config user.signingkey ~/.ssh/id_ed25519.pub
git config tag.gpgsign true
git config gpg.ssh.allowedSignersFile "$PWD/.github/signers/allowed_signers"
npm run ci:verify-signers
```

Keep the private key under the maintainer's control. Do not upload it to chat, the
repository, or release assets.

## 3. Create and Verify a Signed Tag

1. Merge the reviewed changes and wait for the required workflows on that exact
   `main` commit. The list is in `scripts/release/check-release-ci.js`. For workflows
   filtered by paths, use **Run workflow** on `main` if no run exists at that commit.
   Complete the [release checklist](release-checklist.md), including deployment
   addresses, size limits, and the versioned changelog section. Then cut the tag:
   ```bash
   git tag -s vX.Y.Z -m "vX.Y.Z"
   ```
2. Verify locally before pushing:
   ```bash
   git tag -v vX.Y.Z
   node scripts/ci/ensure-tag-signature.js refs/tags/vX.Y.Z
   ```
3. Push the tag and confirm GitHub shows a **Verified** badge:
   ```bash
   git push origin vX.Y.Z
   ```

## 4. CI Enforcement

- The release workflow executes `scripts/ci/ensure-tag-signature.js`. It requires
  an authorized SSH-signed tag pointing to the checkout. Manual invocations must
  select that same tag as the workflow ref; selecting a branch is rejected.
- `scripts/release/check-release-ci.js` requires successful CI on the exact release
  commit from `main`. Missing, pending, failed, skipped, cancelled, or older-commit
  runs cannot satisfy it. A failed rerun supersedes an earlier successful attempt.
- Contract verification and both architecture scans finish before npm publication
  or final image promotion. GitHub assets are staged as a draft; only after image
  promotion does the workflow publish the release. Prereleases do not move `latest`.
- CI requires `.github/signers/allowed_signers` (or the path referenced by
  `GIT_ALLOWED_SIGNERS`) to contain at least one non-comment key entry.
  This guarantees `git tag -v` can verify the signature against a
  committed maintainer key before any release artefacts are produced.
  Rotate the keys and update the file whenever maintainers change
  tokens.
- Run `npm run ci:verify-signers` (or
  `ALLOWED_SIGNERS_PATH=<path> npm run ci:verify-signers`) to lint the
  key list locally. The helper validates namespaces, key formats, and
  duplicate entries so release CI never blocks on formatting mistakes.

## 5. Provenance & Artifact Attestations

- Use the signed tag as the trust anchor for SBOMs, contract ABIs, NPM
  packages, Docker images, and any other release artefact.
- The release workflow publishes GitHub’s
  [Artifact Attestations](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions#artifact-attestations)
  in conjunction with the signed tag. Follow the [verification guide](release-signing.md)
  to check the tarball, Cosign bundle, and GitHub provenance independently.

## 6. Owner Control Sign-off

Before attaching the signed release to production, run the owner control
stack to prove the governance knobs remain adjustable:

```bash
npm run owner:doctor -- --network <network>
npm run owner:dashboard -- --network <network>
npm run owner:parameters -- --network <network>
```

Archive the generated markdown reports with the release record so the
contract owner can demonstrate end-to-end authority over fees, burn
rates, and pause/timelock circuits.

Maintaining the signed tag workflow plus owner control artefacts ensures
releases are both cryptographically authentic and operationally
actionable for the contract owner.
