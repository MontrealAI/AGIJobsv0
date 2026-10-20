"""Explicit laboratory protocol proof: scripted model responses, real Chromium worker."""

import argparse
import base64
import hashlib
import json
import os
import re
import subprocess
import sys
import time
from decimal import Decimal
from pathlib import Path
from supplier_browser_lab_support import (
    read_frame,
    write_frame,
    terminate_group,
    require_group_observation,
)


def require(condition, message):
    if not condition:
        raise ValueError(message)


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument(
    "--alpha-source",
    type=Path,
    required=True,
    help="Trusted local Alpha checkout; its code will be imported",
)
parser.add_argument(
    "--output",
    type=Path,
    required=True,
    help="New evidence directory; existing directories are refused",
)
parser.add_argument(
    "--inject-error",
    action="store_true",
    help="Corrupt the worker recommendation to prove independent rejection",
)
args = parser.parse_args()
ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "demo/One-Box/computer-work"
OUT = args.output.resolve()
ALPHA = args.alpha_source.resolve()
WORKER = ALPHA / "alpha_factory_v1/core/runtime/successor/computer_worker.py"
if not WORKER.is_file():
    parser.error("Alpha checkout lacks the fixed computer worker")
if OUT.exists():
    parser.error("Output directory already exists; choose a new evidence directory")
OUT.mkdir(parents=True)
sys.path.insert(0, str(ALPHA))
import httpx
from alpha_factory_v1.core.runtime.successor.computer import (
    ComputerTask,
    HTTPAdvisor,
    validate_action,
)

html = (
    (FIXTURE / "fixture.html")
    .read_text()
    .replace("__QUOTES__", (FIXTURE / "quotes.json").read_text())
)
task = ComputerTask(
    goal=json.loads((FIXTURE / "task.json").read_text())["inputText"],
    html=html,
    input_rights="synthetic",
    license="Repository synthetic fixture; no personal data",
    max_turns=3,
    max_actions=8,
    max_seconds=60,
)
requests = []
actions = [
    {"type": "keypress", "keys": [key]} for key in ["TAB", "DOWN", "TAB", "ENTER"]
] + [{"type": "scroll", "x": 900, "y": 700, "scroll_x": 0, "scroll_y": 450}]


def reply(request):
    payload = json.loads(request.content)
    requests.append(payload)
    require(
        payload["tools"] == [{"type": "computer"}] and payload["store"] is False,
        "Expected native computer tool and stateless provider request",
    )
    if len(requests) == 1:
        output = [
            {
                "type": "computer_call",
                "call_id": "lab-call-1",
                "actions": actions[:4],
                "pending_safety_checks": [],
            }
        ]
    else:
        require(
            payload["input"][-1]["call_id"] == f"lab-call-{len(requests)-1}",
            "Screenshot output must bind the preceding call ID",
        )
        require(
            payload["input"][-1]["output"]["type"] == "computer_screenshot",
            "Expected a screenshot tool output",
        )
        if len(requests) == 2:
            return httpx.Response(
                200,
                json={
                    "status": "completed",
                    "output": [
                        {
                            "type": "computer_call",
                            "call_id": "lab-call-2",
                            "actions": [actions[-1], {"type": "wait"}],
                            "pending_safety_checks": [],
                        }
                    ],
                },
            )
        output = [
            {
                "type": "message",
                "content": [
                    {
                        "type": "output_text",
                        "text": "Scripted laboratory completion claim; independently verify actual screen.",
                    }
                ],
            }
        ]
    return httpx.Response(200, json={"status": "completed", "output": output})


original = httpx.Client
httpx.Client = lambda **kwargs: original(transport=httpx.MockTransport(reply), **kwargs)
advisor = HTTPAdvisor(
    "responses",
    "scripted-laboratory-fixture",
    "https://api.openai.com/v1",
    "TEST_ONLY_NEVER_SENT",
)
require_group_observation()
env = dict(os.environ)
log = open(OUT / "worker-stderr.log", "w")
process = subprocess.Popen(
    [sys.executable, str(WORKER)],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=log,
    env=env,
    start_new_session=True,
)
observations = []
fetches = []
start = time.monotonic()
read_buffer = bytearray()
cleanup = {}


def retain_failure(kind, error, traceback):
    evidence = {
        "scope": "direct-process laboratory failure",
        "errorType": kind.__name__,
        "error": str(error),
        "observations": observations,
        "externalFetches": len(fetches),
        "cleanup": cleanup,
        "productionApproved": False,
        "settlementApproved": False,
    }
    (OUT / "failure-evidence.json").write_text(json.dumps(evidence, indent=2) + "\n")
    sys.__excepthook__(kind, error, traceback)


sys.excepthook = retain_failure


def send(value):
    write_frame(process.stdin.fileno(), value, start + task.max_seconds)


def read():
    while True:
        value = read_frame(
            process.stdout.fileno(), read_buffer, start + task.max_seconds
        )
        if value.get("type") == "fetch":
            fetches.append(value)
            send(
                {
                    "operation": "fetched",
                    "id": value["id"],
                    "status": 403,
                    "content_type": "text/plain",
                    "body": "",
                }
            )
            continue
        require(
            value["type"] == "observation",
            "Expected a worker observation",
        )
        png = base64.b64decode(value["png"], validate=True)
        filename = f"screen-{len(observations):02d}.png"
        (OUT / filename).write_bytes(png)
        observations.append(
            {
                "screenshot": filename,
                "sha256": hashlib.sha256(png).hexdigest(),
                "text": value["text"],
                "url": value["url"],
            }
        )
        return value


try:
    send({"operation": "start", "html": html})
    observation = read()
    action_count = 0
    for _unused_turn in range(task.max_turns):
        advice = advisor.next(task, observation)
        if advice["done"]:
            break
        if len(advice["actions"]) > 5:
            raise ValueError("Too many actions in one response")
        for action in advice["actions"]:
            action_count += 1
            if (
                action_count > task.max_actions
                or time.monotonic() - start > task.max_seconds
            ):
                raise ValueError("Task action/time budget exceeded")
            send({"operation": "act", "action": validate_action(action)})
            observation = read()
    require(advice["done"] is True, "Advisor must finish within the turn limit")
    require(
        "Stellar has the lowest eligible total: $490.00. No purchase executed."
        in observation["text"],
        "Expected Stellar recommendation on the observed page",
    )
    require(not fetches, "Synthetic fixture must perform zero external fetches")
finally:
    cleanup = terminate_group(process)
    log.close()
require(cleanup["groupClosed"], "Worker process group remains alive after cleanup")
# Build deliverables from the observed browser text, not from expected source quotes.
rows = [
    line.split("\t")
    for line in observation["text"].splitlines()
    if len(line.split("\t")) == 6 and line.split("\t")[-1] in {"Yes", "No"}
]
require(len(rows) == 3, "Expected exactly three observed supplier rows")
winner = re.search(
    r"([^\n]+) has the lowest eligible total: \$[0-9.]+\. No purchase executed\.",
    observation["text"],
).group(1)
if args.inject_error:
    winner = "Laurentian"
report = {
    "maxDeliveryDays": 7,
    "quotes": [
        {
            "supplier": row[0],
            "totalCents": int(Decimal(row[4].removeprefix("$")) * 100),
            "eligible": row[5] == "Yes",
        }
        for row in rows
    ],
    "recommendedSupplier": winner,
    "purchaseExecuted": False,
}
files = [
    ("comparison.json", json.dumps(report)),
    ("recommendation.md", winner + " is recommended. No purchase executed."),
]
receipt = {
    "artifacts": [
        {
            "name": name,
            "content": content,
            "sha256": hashlib.sha256(content.encode()).hexdigest(),
        }
        for name, content in files
    ]
}
(OUT / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
review = json.loads(
    subprocess.check_output(
        [
            "node",
            "-e",
            "const fs=require('fs'); const {review}=require(process.argv[1]); console.log(JSON.stringify(review(JSON.parse(fs.readFileSync(process.argv[2])))));",
            str(FIXTURE / "review.cjs"),
            str(OUT / "receipt.json"),
        ],
        timeout=10,
    )
)
require(
    review["accepted"] is (not args.inject_error) and len(review["checks"]) == 11,
    "Independent reviewer result or check count disagrees with fixture expectation",
)
summary = {
    "scope": "direct-process laboratory protocol test, not production Docker qualification",
    "liveProvider": False,
    "injectedError": args.inject_error,
    "decisionSource": "scripted provider-shaped fixtures; deliverables extracted from observed browser text",
    "browserExecuted": True,
    "advisorSha256": hashlib.sha256(
        WORKER.with_name("computer.py").read_bytes()
    ).hexdigest(),
    "workerSha256": hashlib.sha256(WORKER.read_bytes()).hexdigest(),
    "taskSha256": hashlib.sha256(
        json.dumps(
            task.model_dump(mode="json"), sort_keys=True, separators=(",", ":")
        ).encode()
    ).hexdigest(),
    "actions": actions + [{"type": "wait"}],
    "providerFixtureCalls": len(requests),
    "externalFetches": len(fetches),
    "workerTerminated": cleanup["groupClosed"],
    "cleanup": cleanup,
    "elapsedSeconds": time.monotonic() - start,
    "usage": advisor.usage_events,
    "review": review,
    "observations": observations,
    "productionApproved": False,
    "settlementApproved": False,
}
(OUT / "evidence.json").write_text(json.dumps(summary, indent=2) + "\n")
print(
    json.dumps(
        {
            k: summary[k]
            for k in [
                "scope",
                "liveProvider",
                "browserExecuted",
                "providerFixtureCalls",
                "externalFetches",
                "workerTerminated",
                "elapsedSeconds",
            ]
        }
    )
)

raise SystemExit(0 if review["accepted"] else 1)
