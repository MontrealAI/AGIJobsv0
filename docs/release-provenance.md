# Release Provenance & Tag Signing

This playbook codifies how to produce verifiable AGI Jobs v0 releases so
operations, auditors, and downstream integrators can trust the build
artefacts.

## 1. Generate a Hardware-Backed Signing Key

1. Provision a YubiKey (or similar hardware token) and enable either
   [SSH signatures](https://docs.github.com/en/authentication/connected-accounts/about-ssh-signature-verification)
   or [GPG signatures](https://docs.github.com/en/authentication/connected-accounts/about-commit-signature-verification).
2. Export the public half of the key and register it with the repository
   owner’s GitHub account so the `Verified` badge appears on signed tags.
3. Export the allowed signers entry and append it to
   `.github/signers/allowed_signers` (commit the change):
   ```bash
   ssh-keygen -Y export -f ~/.ssh/id_ed25519.pub >> .github/signers/allowed_signers
   ```

## 2. Configure Git for Tag Signing

Either configure SSH-based signing:
```bash
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/id_ed25519.pub
git config --global tag.gpgsign true
```

Or configure GPG signing:
```bash
git config --global user.signingkey <GPG_KEY_ID>
git config --global tag.gpgsign true
```

## 3. Create and Verify a Signed Tag

1. Cut the release tag:
   ```bash
   git tag -s vX.Y.Z -m "vX.Y.Z"
   ```
2. Verify locally before pushing:
   ```bash
   git tag -v vX.Y.Z
   ```
3. Push the tag and confirm GitHub shows a **Verified** badge:
   ```bash
   git push origin vX.Y.Z
   ```

## 4. CI Enforcement

- The release workflow executes `scripts/ci/ensure-tag-signature.js`. It
  halts the pipeline if the tag lacks a cryptographic signature.
- CI requires `.github/signers/allowed_signers` (or the path referenced by
  `GIT_ALLOWED_SIGNERS`) to contain at least one non-comment key entry.
  This guarantees `git tag -v` can verify the signature against a
  committed maintainer key before any release artefacts are produced.
  Rotate the keys and update the file whenever maintainers change
  tokens.

## 5. Provenance & Artifact Attestations

- Use the signed tag as the trust anchor for SBOMs, contract ABIs, NPM
  packages, Docker images, and any other release artefact.
- Consider enabling GitHub’s
  [Artifact Attestations](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions#artifact-attestations)
  in conjunction with the signed tag to provide verifiable build
  provenance downstream.

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
