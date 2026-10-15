# Supplier browser → JobRegistry laboratory proof

This reproducible proof uses Alpha's separately versioned supplier-browser adapter at
`b234de125b19544eb8cc27ee6fe6629b7e682c1f` and the Jobs source profile at
`5e7f7ba5547f2cfc2e49108a6edc62e178a37ae2`. It preserves the existing native bounded-work adapter.

## What ran

A fresh local Hardhat node assigns the exact supplier specification. Alpha observes
the assignment and code-pinned dependencies, issues its bounded permit, and runs the
unchanged Chromium worker against generated synthetic HTML. Scripted Responses-shaped
messages send keyboard primitives through the real advisor loop. Screenshot and visible
text observations produce the comparison; independent integer checks reject incorrect
results. An explicit local test operator reviews the exact successful result, which is
signed and exported. Separate fixture transactions submit its exact SHA-256 commitment,
approve through the validation mock, and finalize a 100-base-unit mock-token payout.

The negative run chooses a one-day delivery limit instead of seven days. The actual
observed comparison is rejected before local approval/export. A separate chain read
confirms the job remains Applied, its result hash is zero, and no submission or finalization
occurred. The worker and node process groups are closed with bounded cleanup.

This is a direct-process laboratory with scripted model responses, zero external browser
fetches and unknown provider costs. Docker isolation, a live model, independently operated
market review and production deployment have not been qualified by this proof. Process-group
closure does not prove containment of a hostile process that escapes its group.

## Reproduce

Prerequisites: Linux with accessible `/proc`, `setsid`, the repository's qualified Node,
installed locked dependencies and compiled artifacts; the exact Alpha checkout and its
Python dependencies plus installed Chromium. This script does not install anything.
Do not provide provider credentials. Set `UNUSED_SUPPLIER_LAB_NO_CREDENTIAL` to no value.

```bash
export ALPHA_SUPPLIER_SOURCE=/absolute/path/to/AGI-Alpha-Agent-v0
export ALPHA_SUPPLIER_SHA=b234de125b19544eb8cc27ee6fe6629b7e682c1f
export SUPPLIER_PROOF_OUTPUT=/absolute/new/directory/outside/both/checkouts
# Optional: NODE_BINARY, PYTHON_BINARY, PLAYWRIGHT_BROWSERS_PATH and XDG_* paths.
bash integrations/alpha-agent/supplier-adapter-proof.sh
# Repeat with a different new output path and SUPPLIER_NEGATIVE=1 for rejection.
```

Port 8549 must be free. Before contacting it, the guard verifies the listener belongs to
the newly spawned node PID. It requires unforked Hardhat, chain 31337 and block zero;
subsequent mutation batches require the same retained instance identity and listener.
The guard checks relevant Jobs tracked source against the profile commit and verifies
compiler-input/source and artifact/compiler-output consistency. It does not rerun the
compiler. Source files and installed dependencies must remain unchanged during the proof.
Output paths must be new, absolute, outside both source checkouts and free of symlink aliases.

Never publish `alpha/disposable-agent` or `node-private-fixture.log`: they contain disposable
identity material or default local fixture keys. The checked-in `supplier-browser-proof/`
contains only public signed artifacts, public test-key identity and sanitized observations/
receipt summaries. Its test identity is not an operator trust root. The acceptance record's
`sourceCommit` identifies the unchanged contract baseline; the profile commit identifies the
integration source that verifies it. These are intentionally separate source identities.

## Fast retained-evidence checks

```bash
node --test test/alpha-supplier-proof.test.cjs
python3 -m unittest discover -s test/simulation -p test_supplier_proof_guard.py
```

The Node tests verify the pinned disposable Ed25519 key/signature, canonical body hash,
exact artifact/spec commitments, all eleven existing One-Box acceptance checks and negative
identity/signature/binding/winner cases. They verify retained evidence consistency, not a
new live chain observation. The Python tests exercise source/compiler-input mismatches,
unsafe output paths, missing node startup and signal-resistant cleanup. Full execution is
the explicit laboratory command above; these fast tests never invoke a provider or wallet.
