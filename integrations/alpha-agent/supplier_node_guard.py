import time, urllib.request, json, os, pathlib

pid = int(os.environ["SUPPLIER_NODE_PID"])


# Do not even contact an unrelated service already listening on the fixture port.
def owned_listener():
    root = pathlib.Path("/proc") / str(pid)
    if not root.exists():
        raise RuntimeError("Disposable node exited before readiness")
    sockets = {p.readlink().name for p in (root / "fd").iterdir() if p.is_symlink()}
    for line in pathlib.Path("/proc/net/tcp").read_text().splitlines()[1:]:
        fields = line.split()
        if fields[1] == "0100007F:2165" and fields[3] == "0A":
            if "socket:[" + fields[9] + "]" not in sockets:
                raise RuntimeError("Fixture port is owned by another process")
            return True
    return False


def rpc(method):
    request = urllib.request.Request(
        "http://127.0.0.1:8549",
        data=json.dumps(
            {"jsonrpc": "2.0", "id": 1, "method": method, "params": []}
        ).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=2) as response:
        return json.load(response)["result"]


import sys, signal
from supplier_browser_lab_support import live_group_members, require_group_observation

require_group_observation()
mode = sys.argv[1]
identity_path = pathlib.Path(os.environ["SUPPLIER_PROOF_OUTPUT"]) / "node-identity.json"
if mode == "cleanup":
    closed = False
    for sig, seconds in [(signal.SIGTERM, 1), (signal.SIGKILL, 5)]:
        try:
            os.killpg(pid, sig)
        except ProcessLookupError:
            # The group was absent; still check live membership independently below.
            pass
        end = time.monotonic() + seconds
        while time.monotonic() < end:
            if not live_group_members(pid):
                closed = True
                break
            time.sleep(0.02)
        if closed:
            break
    (identity_path.parent / "node-cleanup.json").write_text(
        json.dumps(
            {"groupClosed": closed, "liveGroupMembers": live_group_members(pid)},
            indent=2,
        )
        + "\n"
    )
    sys.exit(0 if closed else 1)
if mode == "check":
    if not owned_listener():
        raise RuntimeError("Owned node listener unavailable")
    expected = json.loads(identity_path.read_text())["metadata"]["instanceId"]
    if rpc("hardhat_metadata")["instanceId"] != expected:
        raise RuntimeError("Disposable node instance changed")
    sys.exit(0)
if mode != "start":
    raise ValueError("Unknown node guard operation")
for _ in range(100):
    if owned_listener():
        break
    time.sleep(0.1)
else:
    raise RuntimeError("Disposable EVM did not start")
metadata = rpc("hardhat_metadata")
if (
    rpc("eth_chainId") != "0x7a69"
    or rpc("eth_blockNumber") != "0x0"
    or metadata.get("chainId") != 31337
    or metadata.get("forkedNetwork") is not None
    or not metadata.get("instanceId")
):
    raise RuntimeError("Expected fresh, unforked Hardhat instance on chain 31337")
if not owned_listener():
    raise RuntimeError("Disposable listener disappeared")
(pathlib.Path(os.environ["SUPPLIER_PROOF_OUTPUT"]) / "node-identity.json").write_text(
    json.dumps(
        {
            "schema": "agijobsv0/disposable-node-identity/1",
            "ownedProcessListener": True,
            "metadata": metadata,
        },
        indent=2,
    )
    + "\n"
)
