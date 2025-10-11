# Maintainer Signing Keys

This directory stores the SSH allowed signers file used by CI to verify tag signatures.

1. Export the SSH or hardware-backed key you registered with GitHub:
   ```bash
   ssh-keygen -Y export -f ~/.ssh/id_ed25519.pub
   ```
2. Append the exported key to `allowed_signers` in this directory using the following format:
   ```
   maintainer@example.com namespaces="git" ssh-ed25519 AAAAC3...
   ```
3. Commit the updated `allowed_signers` file. The release workflow reads it automatically
   and runs `git tag -v` during tag builds. If the file is missing or only contains
   comments, the pipeline fails fast so unsigned or unverifiable tags can never slip
   through.

If you rotate keys, update this file and rerun the release workflow to keep the provenance checks green.
