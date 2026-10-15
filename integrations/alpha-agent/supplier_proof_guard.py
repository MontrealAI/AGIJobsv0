"""Fail-closed filesystem/source guards for the disposable supplier proof only."""

import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

JOBS_SOURCE = "5e7f7ba5547f2cfc2e49108a6edc62e178a37ae2"


def output_path(value, sources):
    path = Path(value)
    if not path.is_absolute() or path != path.resolve():
        raise ValueError("Output must be an absolute path without symlink aliases")
    if path.exists() or any(
        path == root or root in path.parents for root in map(Path.resolve, sources)
    ):
        raise ValueError("Output must be new and outside source checkouts")
    return path


def verify_sources(root):
    root = Path(root)
    scopes = [
        "contracts",
        "config",
        "scripts/deploy",
        "hardhat.config.js",
        "package.json",
        "package-lock.json",
        "integrations/alpha-agent/deploy-local-fixture.cjs",
        "integrations/alpha-agent/complete-local-fixture.cjs",
        "integrations/alpha-agent/verify-receipt.cjs",
    ]
    names = (
        subprocess.check_output(
            ["git", "ls-tree", "-r", "--name-only", JOBS_SOURCE, "--", *scopes],
            cwd=root,
            timeout=10,
        )
        .decode()
        .splitlines()
    )
    if not names:
        raise ValueError("Pinned source is unavailable")
    pins = {}
    for name in names:
        expected = subprocess.check_output(
            ["git", "show", JOBS_SOURCE + ":" + name], cwd=root, timeout=10
        )
        actual = (root / name).read_bytes()
        if expected != actual:
            raise ValueError("Pinned source mismatch: " + name)
        pins[name] = hashlib.sha256(actual).hexdigest()
    builds = list((root / "artifacts/build-info").glob("*.json"))
    if len(builds) != 1:
        raise ValueError("Expected exactly one qualified build-info file")
    build = json.loads(builds[0].read_bytes())
    if build["solcLongVersion"] != "0.8.37+commit.f401782d.Emscripten.clang":
        raise ValueError("Unexpected compiler identity")
    for name, source in build["input"]["sources"].items():
        relative = Path(name)
        if relative.is_absolute() or ".." in relative.parts or "\\" in name:
            raise ValueError("Unsafe compiler input path: " + name)
        dependency = name.startswith("@")
        if not dependency and name not in pins:
            raise ValueError("Unpinned compiler source: " + name)
        allowed = (root / "node_modules").resolve() if dependency else root.resolve()
        path = (allowed / relative).resolve()
        if allowed not in path.parents:
            raise ValueError("Compiler input escapes source root: " + name)
        if path.read_text() != source["content"]:
            raise ValueError("Compiler input mismatch: " + name)
    count = 0
    for file in (root / "artifacts/contracts").rglob("*.json"):
        if file.name.endswith(".dbg.json"):
            continue
        artifact = json.loads(file.read_bytes())
        compiled = build["output"]["contracts"][artifact["sourceName"]][
            artifact["contractName"]
        ]
        if artifact["abi"] != compiled["abi"]:
            raise ValueError("Artifact ABI mismatch: " + str(file))
        for field, output in [
            ("bytecode", "bytecode"),
            ("deployedBytecode", "deployedBytecode"),
        ]:
            if artifact[field] != "0x" + compiled["evm"][output]["object"]:
                raise ValueError("Artifact bytecode mismatch: " + str(file))
        count += 1
    if not count:
        raise ValueError("No compiled artifacts")
    return {
        "sourceCommit": JOBS_SOURCE,
        "sourcePins": pins,
        "artifactCount": count,
        "buildInfoSha256": hashlib.sha256(builds[0].read_bytes()).hexdigest(),
        "scope": "Pinned source and compiler-input/output consistency; compiler was not rerun by this proof",
    }


if __name__ == "__main__":
    root, alpha, output = map(Path, sys.argv[1:])
    path = output_path(output, [root, alpha])
    provenance = verify_sources(root)
    path.mkdir(parents=True, exist_ok=False)
    (path / "source-provenance.json").write_text(
        json.dumps(provenance, indent=2) + "\n"
    )
