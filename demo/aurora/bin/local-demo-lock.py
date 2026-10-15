"""Serialize supported local demos, including npm children that close extra FDs."""

import fcntl
import json
import os
from pathlib import Path
import stat
import sys


def process(pid):
    fields = Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()
    return int(fields[1]), fields[19]


def main():
    if sys.platform != "linux" or not Path("/proc/self/stat").exists():
        raise RuntimeError("Local demos require Linux with readable /proc.")
    verify = sys.argv[1] == "--verify"
    if verify:
        sys.argv.pop(1)
        if not os.environ.get("AGI_LOCAL_LOCK_OWNER"):
            raise RuntimeError("Local demo lock owner is missing.")
    root = Path(__file__).resolve().parents[3]
    port = os.environ.get("DEMO_PORT", "8545")
    if not port.isascii() or not port.isdigit() or not 1024 <= int(port) <= 65535:
        raise RuntimeError("DEMO_PORT must be an integer between 1024 and 65535.")
    # Reports are shared across ports; port locks also cover separate checkouts.
    paths = [
        root / ".local-demo.lock",
        Path(f"/tmp/agi-local-demo-{os.getuid()}-{int(port)}.lock"),
    ]
    inherited = os.environ.get("AGI_LOCAL_LOCK_OWNER")
    if inherited:
        owner = json.loads(inherited)
        pid = os.getpid()
        while pid != owner["pid"] and pid > 1:
            pid = process(pid)[0]
        if pid != owner["pid"] or process(pid)[1] != owner["start"]:
            raise RuntimeError(
                "Local demo lock owner is not a live ancestor of this launch."
            )
        if len(owner["fds"]) != 2:
            raise RuntimeError("Invalid inherited local demo locks.")
        for path, fd in zip(paths, owner["fds"]):
            actual = Path(f"/proc/{pid}/fd/{fd}").stat()
            wanted = path.stat()
            if (actual.st_dev, actual.st_ino) != (wanted.st_dev, wanted.st_ino):
                raise RuntimeError(
                    "Inherited local demo lock does not match this repository/port."
                )
            info = Path(f"/proc/{pid}/fdinfo/{fd}").read_text()
            if not any(
                line.startswith("lock:") and "FLOCK" in line and "WRITE" in line
                for line in info.splitlines()
            ):
                raise RuntimeError(
                    "Ancestor does not own the required exclusive file lock."
                )
            with path.open("r") as probe:
                try:
                    fcntl.flock(probe, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError:
                    continue
                raise RuntimeError("Inherited local demo lock is not exclusive.")
    else:
        descriptors = []
        for path in paths:
            fd = os.open(path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
            info = os.fstat(fd)
            if (
                not stat.S_ISREG(info.st_mode)
                or info.st_uid != os.getuid()
                or info.st_nlink != 1
            ):
                raise RuntimeError("Unsafe local demo lock file.")
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            os.set_inheritable(fd, True)
            descriptors.append(fd)
        os.environ["AGI_LOCAL_LOCK_OWNER"] = json.dumps(
            {"pid": os.getpid(), "start": process(os.getpid())[1], "fds": descriptors}
        )
    if sys.argv[1] == "bash":
        os.environ["AGI_LOCAL_LOCK_ENTRY"] = sys.argv[2]
    os.execvp(sys.argv[1], sys.argv[1:])


if __name__ == "__main__":
    try:
        main()
    except BlockingIOError:
        sys.exit(
            "Another supported local demo is using these reports or this port. Wait for it to finish; nothing was archived or stopped."
        )
    except Exception as error:
        sys.exit(f"Cannot acquire local demo safety locks: {error}")
