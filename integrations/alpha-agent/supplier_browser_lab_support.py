"""Bounded Linux laboratory subprocess helpers; no production authority."""

import json
import os
import select
import signal
import sys
import time
from pathlib import Path


def require_group_observation():
    if sys.platform != "linux" or not Path("/proc/self/stat").is_file():
        raise RuntimeError(
            "This laboratory requires Linux with readable /proc process identities"
        )
    Path("/proc/self/stat").read_text()


def write_frame(fd, value, deadline):
    data = (json.dumps(value) + "\n").encode()
    os.set_blocking(fd, False)
    offset = 0
    while offset < len(data):
        remaining = deadline - time.monotonic()
        if remaining <= 0 or not select.select([], [fd], [], remaining)[1]:
            raise TimeoutError("Worker input deadline exceeded")
        try:
            offset += os.write(fd, data[offset:])
        except BlockingIOError:
            continue


def read_frame(fd, buffer, deadline, maximum=3_000_000):
    """Read one JSON line without trusting a child to finish its write."""
    os.set_blocking(fd, False)
    while True:
        boundary = buffer.find(b"\n")
        if boundary >= 0:
            if boundary > maximum:
                raise ValueError("Worker message exceeds the byte limit")
            frame = bytes(buffer[:boundary])
            del buffer[: boundary + 1]
            return json.loads(frame)
        if len(buffer) > maximum:
            raise ValueError("Worker message exceeds the byte limit")
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError("Worker observation deadline exceeded")
        if not select.select([fd], [], [], remaining)[0]:
            raise TimeoutError("Worker observation deadline exceeded")
        try:
            chunk = os.read(fd, min(65536, maximum + 1 - len(buffer)))
        except BlockingIOError:
            continue
        if not chunk:
            raise ValueError("Worker closed its output before a complete message")
        buffer.extend(chunk)


def live_group_members(group):
    """Ignore already-dead zombies; inspect Linux process-group membership."""
    require_group_observation()
    members = []
    for path in Path("/proc").glob("[0-9]*/stat"):
        try:
            fields = path.read_text().rsplit(")", 1)[1].split()
            if int(fields[2]) == group and fields[0] != "Z":
                members.append(int(path.parent.name))
        except (FileNotFoundError, ProcessLookupError):
            continue
    return members


def terminate_group(process):
    for sig in (signal.SIGTERM, signal.SIGKILL):
        try:
            os.killpg(process.pid, sig)
        except ProcessLookupError:
            pass
        deadline = time.monotonic() + (1 if sig == signal.SIGTERM else 5)
        while time.monotonic() < deadline:
            process.poll()
            if not live_group_members(process.pid):
                process.wait(timeout=1)
                return {
                    "leaderExited": True,
                    "liveGroupMembers": [],
                    "groupClosed": True,
                }
            time.sleep(0.02)
    members = live_group_members(process.pid)
    return {
        "leaderExited": process.poll() is not None,
        "liveGroupMembers": members,
        "groupClosed": not members,
    }
