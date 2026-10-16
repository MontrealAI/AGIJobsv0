"""Linux-only disposable Hardhat guard. Never contacts an unowned listener."""

import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
import urllib.request


def require_linux():
    if sys.platform != "linux" or not Path("/proc/self/stat").is_file():
        raise RuntimeError(
            "Local demos require Linux with readable /proc; refusing an unverified node."
        )


def stat(pid):
    try:
        fields = Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()
        return {
            "state": fields[0],
            "group": int(fields[2]),
            "session": int(fields[3]),
            "start": fields[19],
        }
    except (FileNotFoundError, ProcessLookupError):
        return None


def members(pid):
    result = []
    for path in Path("/proc").glob("[0-9]*/stat"):
        info = stat(int(path.parent.name))
        if info and info["group"] == pid and info["state"] != "Z":
            if info["session"] != pid:
                raise RuntimeError("Unexpected process session; refusing cleanup.")
            result.append(int(path.parent.name))
    return result


def identity(directory):
    return json.loads((directory / "process.json").read_text())


def require_process(expected):
    info = stat(expected["pid"])
    if (
        not info
        or info["state"] == "Z"
        or info["start"] != expected["start"]
        or info["group"] != expected["pid"]
        or info["session"] != expected["pid"]
    ):
        raise RuntimeError("Owned disposable node exited or changed identity.")


def owned_listener(expected, port):
    require_process(expected)
    sockets = set()
    for path in Path(f"/proc/{expected['pid']}/fd").iterdir():
        try:
            sockets.add(os.readlink(path))
        except FileNotFoundError:
            continue
    found = False
    for table in ("tcp", "tcp6"):
        for line in Path(f"/proc/net/{table}").read_text().splitlines()[1:]:
            fields = line.split()
            address, hexport = fields[1].split(":")
            if int(hexport, 16) != port or fields[3] != "0A":
                continue
            if (
                table != "tcp"
                or address != "0100007F"
                or f"socket:[{fields[9]}]" not in sockets
            ):
                raise RuntimeError(
                    "Demo port has an unowned or non-loopback listener; no RPC was sent."
                )
            found = True
    require_process(expected)
    return found


def rpc(expected, port, method):
    if not owned_listener(expected, port):
        raise RuntimeError("Owned local listener unavailable; no RPC was sent.")
    request = urllib.request.Request(
        f"http://127.0.0.1:{port}",
        data=json.dumps(
            {"jsonrpc": "2.0", "id": 1, "method": method, "params": []}
        ).encode(),
        headers={"Content-Type": "application/json"},
    )
    # Ignore proxy environment variables even for loopback requests.
    with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(
        request, timeout=2
    ) as response:
        payload = json.loads(response.read(1024 * 1024))
    if payload.get("id") != 1 or "error" in payload or "result" not in payload:
        raise RuntimeError("Invalid local RPC response.")
    if not owned_listener(expected, port):
        raise RuntimeError("Owned local listener disappeared during RPC.")
    return payload["result"]


def check(directory, port, fresh=False, engine=None):
    expected = identity(directory)
    if fresh:
        deadline = time.monotonic() + 30
        while not owned_listener(expected, port):
            if time.monotonic() >= deadline:
                raise RuntimeError(
                    "Owned local listener did not become ready within 30 seconds."
                )
            time.sleep(0.1)
    target = directory / "instance.json"
    method = (
        ("anvil_metadata" if engine == "anvil" else "hardhat_metadata")
        if fresh
        else json.loads(target.read_text())["method"]
    )
    try:
        metadata = rpc(expected, port, method)
    except Exception as error:
        raise RuntimeError(
            "Node metadata could not be verified. Use a current Anvil or DEMO_NODE_ENGINE=hardhat."
        ) from error
    chain = metadata.get("chainId")
    if isinstance(chain, str):
        chain = int(chain, 16) if chain.startswith("0x") else int(chain)
    if (
        rpc(expected, port, "eth_chainId") != "0x7a69"
        or chain != 31337
        or metadata.get("forkedNetwork") is not None
        or not isinstance(metadata.get("instanceId"), str)
        or not metadata["instanceId"]
    ):
        raise RuntimeError("Expected an unforked local instance on chain 31337.")
    if fresh:
        if rpc(expected, port, "eth_blockNumber") != "0x0":
            raise RuntimeError("Disposable node must begin at block zero.")
        target.write_text(
            json.dumps({"instanceId": metadata["instanceId"], "method": method})
        )
    elif metadata["instanceId"] != json.loads(target.read_text())["instanceId"]:
        raise RuntimeError(
            "Disposable local instance changed; refusing further transactions."
        )


def cleanup(directory):
    expected = identity(directory)
    pid = expected["pid"]
    info = stat(pid)
    if info and info["start"] != expected["start"]:
        raise RuntimeError("Node PID was reused; refusing to signal another process.")
    closed = False
    for sig, seconds in ((signal.SIGTERM, 1), (signal.SIGKILL, 5)):
        if not members(pid):
            closed = True
            break
        try:
            os.killpg(pid, sig)
        except ProcessLookupError:
            pass
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            if not members(pid):
                closed = True
                break
            time.sleep(0.02)
        if closed:
            break
    remaining = members(pid)
    (directory / "cleanup.json").write_text(
        json.dumps({"groupClosed": not remaining, "liveGroupMembers": remaining}) + "\n"
    )
    if remaining:
        raise RuntimeError(
            "Disposable process group did not close after TERM/KILL deadlines; see cleanup.json."
        )


def main():
    require_linux()
    mode = sys.argv[1]
    if mode == "exec":
        signal.pthread_sigmask(signal.SIG_UNBLOCK, {signal.SIGINT, signal.SIGTERM})
        os.execvp(sys.argv[2], sys.argv[2:])
    directory = Path(sys.argv[2])
    if mode == "launch":
        # Direct CLI launch makes the listener PID the session leader, not an npm wrapper.
        previous = signal.pthread_sigmask(
            signal.SIG_BLOCK, {signal.SIGINT, signal.SIGTERM}
        )
        with (directory / "node-private.log").open("wb") as log:
            process = subprocess.Popen(
                [sys.executable, __file__, "exec", *sys.argv[3:]],
                stdin=subprocess.DEVNULL,
                stdout=log,
                stderr=log,
                start_new_session=True,
                close_fds=True,
            )
        try:
            (directory / "process.json").write_text(
                json.dumps({"pid": process.pid, "start": stat(process.pid)["start"]})
            )
        except BaseException:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait(timeout=5)
            raise
        finally:
            signal.pthread_sigmask(signal.SIG_SETMASK, previous)
    elif mode == "cleanup":
        try:
            cleanup(directory)
        except Exception:
            (directory / "cleanup.json").write_text(
                json.dumps(
                    {
                        "groupClosed": False,
                        "error": "Cleanup failed closed; inspect private diagnostics.",
                    }
                )
                + "\n"
            )
            raise
    elif mode in ("start", "check"):
        check(
            directory,
            int(sys.argv[3]),
            fresh=mode == "start",
            engine=sys.argv[4] if mode == "start" else None,
        )
    else:
        raise RuntimeError("Unknown local guard operation.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Local demo safety check failed: {error}", file=sys.stderr)
        sys.exit(1)
