"""Test-only direct-process Chromium transport for the reviewed supplier adapter.

This exercises signed assignment/execution/artifact bindings, but is not Docker
commissioning or a live model run. Never publish the disposable agent home.
"""

import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--alpha-source", type=Path, required=True)
parser.add_argument("--jobs-source", type=Path, required=True)
parser.add_argument("--fixture", type=Path, required=True)
parser.add_argument("--profile", type=Path, required=True)
parser.add_argument("--spec", type=Path, required=True)
parser.add_argument("--wrong-delivery-limit", action="store_true")
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=False)
sys.path.insert(0, str(args.alpha_source))
sys.path.insert(0, str(args.jobs_source / "integrations/alpha-agent"))
from supplier_browser_lab_support import (
    read_frame,
    write_frame,
    terminate_group,
    require_group_observation,
)
from alpha_factory_v1.core.runtime import supplier_browser as adapter
from alpha_factory_v1.core.runtime.store import Journal
from alpha_factory_v1.core.runtime.successor import computer
import httpx

fixture = json.loads(args.fixture.read_bytes())
profile = json.loads(args.profile.read_bytes())
if (
    fixture["chainId"] != 31337
    or fixture["productionApproved"] is not False
    or profile["scope"] != "disposable-local-fixture"
):
    raise ValueError("Disposable fixture only")
journal = Journal.initialize(args.output / "disposable-agent")
(journal.root / "jobs-v0-profile.json").write_text(json.dumps(profile))
(journal.root / "supplier-browser-profile.json").write_text(
    json.dumps(
        {
            "schema": "agialpha.supplier-browser-profile.v1",
            "scope": "synthetic-laboratory",
            "image": "sha256:" + "0" * 64,
            "provider": "responses",
            "model": "scripted-laboratory-fixture",
            "base_url": "http://127.0.0.1:1/v1",
            "key_env": "UNUSED_SUPPLIER_LAB_NO_CREDENTIAL",
        }
    )
)
if os.environ.get("UNUSED_SUPPLIER_LAB_NO_CREDENTIAL"):
    raise ValueError("Laboratory key variable must be absent")
requests = []
observations = []
fetches = []
cleanup = []

rpc_transport = httpx.HTTPTransport()


def reply(request):
    if str(request.url).rstrip("/") == fixture["rpcUrl"].rstrip("/"):
        return rpc_transport.handle_request(request)
    if str(request.url) != "http://127.0.0.1:1/v1/responses":
        raise ValueError("Unexpected laboratory transport destination")
    value = json.loads(request.content)
    if value["tools"] != [{"type": "computer"}] or value["store"] is not False:
        raise ValueError("Unexpected computer request")
    requests.append(value)
    if len(requests) == 1:
        output = [
            {
                "type": "computer_call",
                "call_id": "supplier-lab-1",
                "actions": [
                    {"type": "keypress", "keys": [k]}
                    for k in (
                        ["TAB", "TAB", "ENTER"]
                        if args.wrong_delivery_limit
                        else ["TAB", "DOWN", "TAB", "ENTER"]
                    )
                ],
                "pending_safety_checks": [],
            }
        ]
    elif len(requests) == 2:
        if (
            value["input"][-1]["call_id"] != "supplier-lab-1"
            or value["input"][-1]["output"]["type"] != "computer_screenshot"
        ):
            raise ValueError("Screenshot call binding mismatch")
        output = [
            {
                "type": "message",
                "content": [
                    {
                        "type": "output_text",
                        "text": "Scripted fixture reports completion; verify observed comparison independently.",
                    }
                ],
            }
        ]
    else:
        raise ValueError("Unexpected additional scripted provider call")
    return httpx.Response(200, json={"status": "completed", "output": output})


original_client = httpx.Client
httpx.Client = lambda **kwargs: original_client(
    transport=httpx.MockTransport(reply), **kwargs
)
worker = (
    args.alpha_source / "alpha_factory_v1/core/runtime/successor/computer_worker.py"
)


class LaboratoryComputer:
    name = "DIRECT_PROCESS_LAB_NOT_DOCKER"

    def __init__(self, image, task, checkpoint):
        require_group_observation()
        self.checkpoint = checkpoint
        self.deadline = time.monotonic() + task.max_seconds
        self.buffer = bytearray()
        self.closed = False
        self.log = open(args.output / "worker-stderr.log", "w")
        self.process = subprocess.Popen(
            [sys.executable, str(worker)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=self.log,
            env=dict(os.environ),
            start_new_session=True,
        )
        try:
            self.send({"operation": "start", "html": task.html})
        except BaseException:
            self.close()
            raise

    def send(self, value):
        self.checkpoint()
        write_frame(self.process.stdin.fileno(), value, self.deadline)

    def observe(self):
        while True:
            self.checkpoint()
            value = read_frame(self.process.stdout.fileno(), self.buffer, self.deadline)
            if value.get("type") == "fetch":
                fetches.append(value)
                self.send(
                    {
                        "operation": "fetched",
                        "id": value["id"],
                        "status": 403,
                        "content_type": "text/plain",
                        "body": "",
                    }
                )
                continue
            if (
                set(value) != {"type", "png", "text", "url"}
                or value["type"] != "observation"
            ):
                raise ValueError("Unexpected fixed worker response")
            raw = base64.b64decode(value["png"], validate=True)
            if len(raw) > 2000000 or raw[:8] != b"\x89PNG\r\n\x1a\n":
                raise ValueError("Invalid screenshot")
            observations.append(
                {
                    "sha256": hashlib.sha256(raw).hexdigest(),
                    "textSha256": hashlib.sha256(value["text"].encode()).hexdigest(),
                    "url": value["url"],
                }
            )
            return value

    def act(self, action):
        self.send({"operation": "act", "action": computer.validate_action(action)})
        return self.observe()

    def close(self):
        if self.closed:
            return
        result = terminate_group(self.process)
        cleanup.append(result)
        self.log.close()
        self.closed = True
        if not result["groupClosed"]:
            raise ValueError("Laboratory worker process group remains live")


try:
    raw = args.spec.read_bytes()
    admitted = adapter.admit(
        journal,
        raw,
        fixture["jobId"],
        fixture["worker"],
        fixture["assignmentTransactionHash"],
    )
    permission = adapter.prepare(journal, admitted["id"])
    result = adapter.execute(
        journal, admitted["id"], permission["permit"], _factory=LaboratoryComputer
    )
    if args.wrong_delivery_limit:
        raise RuntimeError("Wrong observed comparison unexpectedly reached review")
    if result["state"] != "review":
        raise ValueError("Expected independently reviewable result")
    adapter.review(
        journal,
        admitted["id"],
        result["revision"],
        result["result_hash"],
        True,
        "Disposable laboratory operator reviewed the exact result; not independent market approval",
    )
    packet = adapter.delivery(journal, admitted["id"])
    artifact = base64.b64decode(packet["artifact_base64"], validate=True)
    verified = adapter.verify_delivery(
        artifact, journal.public, admitted["observation"]
    )
    (args.output / "reviewed-artifact.json").write_bytes(artifact)
    (args.output / "result.json").write_text(
        json.dumps(
            {
                "resultHash": packet["result_hash"],
                "resultURI": "fixture://alpha/supplier-browser-reviewed-artifact",
            },
            indent=2,
        )
        + "\n"
    )
    evidence = {
        "scope": "direct-process laboratory with actual fixed Chromium worker; scripted model responses",
        "workerSha256": hashlib.sha256(worker.read_bytes()).hexdigest(),
        "sourcePins": {
            str(p.relative_to(args.alpha_source)): hashlib.sha256(
                p.read_bytes()
            ).hexdigest()
            for p in [
                worker,
                worker.with_name("computer.py"),
                args.alpha_source / "alpha_factory_v1/core/runtime/supplier_browser.py",
                args.alpha_source
                / "alpha_factory_v1/core/runtime/supplier_browser_spec.py",
                args.alpha_source
                / "alpha_factory_v1/core/runtime/web/supplier-lab.html",
            ]
        },
        "specHash": "0x" + hashlib.sha256(raw).hexdigest(),
        "artifactBytes": len(artifact),
        "resultHash": packet["result_hash"],
        "verification": verified,
        "assignment": admitted["observation"],
        "providerCalls": len(requests),
        "actions": 4,
        "observations": observations,
        "externalFetches": len(fetches),
        "cleanup": cleanup,
        "dockerQualified": False,
        "liveProvider": False,
        "providerCostKnown": False,
        "productionApproved": False,
        "settlementApproved": False,
    }
    (args.output / "evidence.json").write_text(json.dumps(evidence, indent=2) + "\n")
    print(
        json.dumps(
            {
                "resultHash": packet["result_hash"],
                "artifactBytes": len(artifact),
                "providerCalls": len(requests),
                "observations": len(observations),
                "verification": verified,
            }
        )
    )
except BaseException as error:
    if (
        args.wrong_delivery_limit
        and isinstance(error, ValueError)
        and "Observed comparison fails independent" in str(error)
    ):
        state = journal.latest(admitted["id"])["state"]
        if (
            state != "interrupted"
            or not cleanup
            or not all(item["groupClosed"] for item in cleanup)
        ):
            raise RuntimeError("Negative fixture did not close fail-safe")
        (args.output / "negative-evidence.json").write_text(
            json.dumps(
                {
                    "scope": "actual fixed Chromium worker selected wrong delivery limit; scripted responses",
                    "rejected": True,
                    "reason": str(error),
                    "state": state,
                    "providerCalls": len(requests),
                    "actions": 3,
                    "observations": observations,
                    "externalFetches": len(fetches),
                    "cleanup": cleanup,
                    "artifactExported": False,
                    "productionApproved": False,
                    "settlementApproved": False,
                },
                indent=2,
            )
            + "\n"
        )
        print(json.dumps({"rejected": True, "state": state, "artifactExported": False}))
        raise SystemExit(0)
    (args.output / "failure-evidence.json").write_text(
        json.dumps(
            {
                "error": str(error),
                "observations": observations,
                "cleanup": cleanup,
                "productionApproved": False,
            },
            indent=2,
        )
        + "\n"
    )
    raise
finally:
    httpx.Client = original_client
    rpc_transport.close()
