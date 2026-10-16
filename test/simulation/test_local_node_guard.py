"""Private loopback fixtures: no credentials, external providers, or deployments."""

import importlib.util
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import time

import pytest

ROOT = Path(__file__).resolve().parents[2]
GUARD = ROOT / "demo/aurora/bin/local-node-guard.py"
LOCK = ROOT / "demo/aurora/bin/local-demo-lock.py"
spec = importlib.util.spec_from_file_location("local_guard", GUARD)
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)

SERVER = r"""
import http.server,json,sys,pathlib,signal,subprocess
root=pathlib.Path(sys.argv[1])
class Handler(http.server.BaseHTTPRequestHandler):
 def log_message(self,*args): pass
 def do_POST(self):
  payload=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
  with (root/'requests').open('a') as f: f.write(payload['method']+'\n')
  state=json.loads((root/'response.json').read_text())
  value=state.get(payload['method'])
  data=json.dumps({'jsonrpc':'2.0','id':1,'result':value}).encode()
  self.send_response(200); self.end_headers(); self.wfile.write(data)
http.server.HTTPServer(('127.0.0.1',int(sys.argv[2])),Handler).serve_forever()
"""


def port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def run(*args):
    return subprocess.run(
        [sys.executable, str(GUARD), *map(str, args)],
        capture_output=True,
        text=True,
        timeout=40,
    )


def response(root, **overrides):
    value = {
        "hardhat_metadata": {"chainId": 31337, "instanceId": "instance-a"},
        "anvil_metadata": {"chainId": "0x7a69", "instanceId": "instance-a"},
        "eth_chainId": "0x7a69",
        "eth_blockNumber": "0x0",
    }
    value.update(overrides)
    (root / "response.json").write_text(json.dumps(value))


@pytest.fixture
def server(tmp_path):
    response(tmp_path)
    number = port()
    launched = run("launch", tmp_path, sys.executable, "-c", SERVER, tmp_path, number)
    assert launched.returncode == 0, launched.stderr
    try:
        yield tmp_path, number
    finally:
        assert run("cleanup", tmp_path).returncode == 0


@pytest.mark.parametrize("engine", ["hardhat", "anvil"])
def test_fresh_identity_and_reset_rejected(server, engine):
    root, number = server
    result = run("start", root, number, engine)
    assert result.returncode == 0, result.stderr
    assert run("check", root, number).returncode == 0
    response(
        root, **{engine + "_metadata": {"chainId": 31337, "instanceId": "instance-b"}}
    )
    changed = run("check", root, number)
    assert changed.returncode != 0 and "instance changed" in changed.stderr


@pytest.mark.parametrize(
    "change",
    [
        {"eth_blockNumber": "0x1"},
        {"eth_chainId": "0x1"},
        {
            "hardhat_metadata": {
                "chainId": 31337,
                "instanceId": "a",
                "forkedNetwork": {"chainId": 1},
            }
        },
        {"hardhat_metadata": {"chainId": 31337}},
    ],
)
def test_unfresh_or_unqualified_rejected(server, change):
    root, number = server
    response(root, **change)
    assert run("start", root, number, "hardhat").returncode != 0
    assert not (root / "instance.json").exists()


def test_foreign_listener_gets_no_rpc(server, tmp_path):
    root, number = server
    # An unrelated live session is falsely nominated as the expected node.
    other = root / "other"
    other.mkdir()
    assert (
        run(
            "launch", other, sys.executable, "-c", "import time; time.sleep(60)"
        ).returncode
        == 0
    )
    try:
        result = run("start", other, number, "hardhat")
        assert result.returncode != 0 and "unowned" in result.stderr
        assert not (root / "requests").exists()
        assert guard.stat(guard.identity(root)["pid"])["state"] != "Z"
    finally:
        assert run("cleanup", other).returncode == 0


def test_term_resistant_child_cleanup(tmp_path):
    script = "import os,signal,time,pathlib,sys; signal.signal(signal.SIGTERM,signal.SIG_IGN); child=os.fork(); pathlib.Path(sys.argv[1],str(os.getpid())).touch(); time.sleep(60)"
    assert (
        run("launch", tmp_path, sys.executable, "-c", script, tmp_path).returncode == 0
    )
    deadline = time.monotonic() + 5
    while len(list(tmp_path.glob("[0-9]*"))) < 2 and time.monotonic() < deadline:
        time.sleep(0.02)
    assert len(list(tmp_path.glob("[0-9]*"))) == 2
    started = time.monotonic()
    assert run("cleanup", tmp_path).returncode == 0
    assert time.monotonic() - started < 8
    assert json.loads((tmp_path / "cleanup.json").read_text()) == {
        "groupClosed": True,
        "liveGroupMembers": [],
    }


def test_pid_reuse_refuses_signal_and_records_failure(tmp_path, monkeypatch):
    (tmp_path / "process.json").write_text(
        json.dumps({"pid": os.getpid(), "start": "wrong"})
    )
    result = run("cleanup", tmp_path)
    assert result.returncode != 0 and "reused" in result.stderr
    assert json.loads((tmp_path / "cleanup.json").read_text())["groupClosed"] is False


def test_lock_survives_children_closing_fds(tmp_path):
    # npm/Node closes extra descriptors; the outer shell still owns both locks.
    code = "import subprocess,sys; sys.exit(subprocess.call([sys.executable,sys.argv[1],'--verify','true'],close_fds=True))"
    result = subprocess.run(
        [
            sys.executable,
            str(LOCK),
            "bash",
            "-c",
            f"{sys.executable} -c " + __import__("shlex").quote(code) + " " + str(LOCK),
        ],
        capture_output=True,
        text=True,
        timeout=5,
    )
    assert result.returncode == 0, result.stderr


def test_cleanup_after_leader_exits(tmp_path):
    script = "import os,signal,time,pathlib,sys; child=os.fork(); child and sys.exit(0); signal.signal(signal.SIGTERM,signal.SIG_IGN); pathlib.Path(sys.argv[1],'child-ready').touch(); time.sleep(60)"
    assert (
        run("launch", tmp_path, sys.executable, "-c", script, tmp_path).returncode == 0
    )
    deadline = time.monotonic() + 5
    while not (tmp_path / "child-ready").exists() and time.monotonic() < deadline:
        time.sleep(0.02)
    assert (tmp_path / "child-ready").exists()
    assert run("cleanup", tmp_path).returncode == 0
    assert json.loads((tmp_path / "cleanup.json").read_text())["groupClosed"] is True


def test_forged_lock_owner_rejected():
    env = {
        **os.environ,
        "AGI_LOCAL_LOCK_OWNER": json.dumps(
            {"pid": 1, "start": "not-the-real-start", "fds": [3, 4]}
        ),
    }
    result = subprocess.run(
        [sys.executable, str(LOCK), "--verify", "true"],
        env=env,
        capture_output=True,
        text=True,
        timeout=5,
    )
    assert result.returncode != 0 and "not a live ancestor" in result.stderr
