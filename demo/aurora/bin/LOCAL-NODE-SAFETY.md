# Disposable local runner safety

The Aurora and ASI Take-Off local runners and their Zenith wrappers require
Linux, Python 3, and readable `/proc` process/socket information. Unsupported
systems fail closed. They never stop an already-running node to take its port.

Supported launches acquire an exclusive repository lock before report creation
or Zenith archive preparation, and a per-user port lock shared across checkouts.
Locks survive nested npm launches by verifying the live ancestor's process start
time and locked file descriptors. Separate users are not coordinated by the port
lock; port preflight and listener ownership checks still reject their listeners.
Do not delete `.local-demo.lock` or the `/tmp/agi-local-demo-*.lock` files while
running a demo. These are advisory locks for supported launches, not a sandbox
against another process deliberately changing the checkout or resetting a node.

The runner checks the exact launched session leader's PID/start time and its
listening socket inode before every readiness/identity RPC. It requires chain
31337, initial block zero, no fork metadata, and a nonempty node instance ID.
The instance ID and owned listener are rechecked immediately before the deployment
and demo execution batches. Checks are not an atomic authorization boundary across
all transactions in a batch; do not share the disposable RPC with other clients.

`DEMO_NODE_ENGINE=auto` preserves the preference for Anvil when installed, with
Hardhat as the fallback. `DEMO_NODE_ENGINE=hardhat` explicitly uses the installed
Hardhat CLI. Anvil must support `anvil_metadata`; Hardhat must support
`hardhat_metadata`. Unsupported metadata fails closed with an actionable error.
Both engines use automining, without interval blocks, so startup freshness can be
verified. No public provider, fork URL, or external chain is used by this runner.

Cleanup signals only the recorded process group, gives TERM one second, then
KILL five seconds, and checks for live non-zombie members. A surviving group or
identity/permission failure makes the demo fail and retains cleanup failure
evidence. A child which deliberately creates its own session is outside the
owned process group; ordinary node children must remain in the inherited group.
SIGKILL of the runner or an OS failure cannot run shell cleanup traps.

Node output and guard evidence are kept in a mode-0700 temporary directory. On
failure its location is printed. Never publish `node-private.log`: Hardhat can
print public development account keys. Only sanitized assertions belong in
published test evidence.

Tests: `python3 -m pytest -q test/simulation/test_local_node_guard.py
 test/simulation/test_zenith_local_wrappers.py`. These tests use controlled
loopback fixtures and stub wrapper chain execution; they do not establish a
particular installed Anvil binary's compatibility.
