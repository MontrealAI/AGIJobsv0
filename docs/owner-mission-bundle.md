# Owner Mission Control Bundle Playbook

> **Audience:** Contract owners, governance leads, and auditors who require a
> tamper-evident packet of every mission-control run. Suitable for ticketing,
> audit archives, and non-technical reviewers.
>
> **Goal:** Produce a single directory containing Markdown, JSON, human-friendly
> text, a manifest, and cryptographic checksums so stakeholders can review and
> re-verify governance actions without accessing developer tooling.

---

## Command Cheat Sheet

```bash
npm run owner:mission-control -- \
  --network <network> \
  --bundle runtime/bundles \
  --bundle-name mission-control-<stamp>
# Fail the pipeline on ⚠️ warnings as well as ❌ errors
npm run owner:mission-control -- \
  --network <network> \
  --bundle runtime/bundles \
  --bundle-name mission-control-<stamp> \
  --strict
```

- `--bundle` points at the folder that should receive the artefacts (it will be
  created if it does not exist).
- `--bundle-name` controls the filename stem. Use incident/ticket IDs or
  calendar stamps such as `mission-control-2025-03-14`. Unsafe characters are
  automatically sanitised.
- Combine with `--format`/`--out` if you still want a standalone file in
  addition to the bundle.

---

## Artefact Layout

```mermaid
flowchart LR
    subgraph Bundle[mission-control bundle]
        direction TB
        MD[*.md\n(visual briefing)]
        JSON[*.json\n(machine payload)]
        TXT[*.txt\n(human console)]
        MAN[*.manifest.json\n(step+metric index)]
        SHA[*.checksums.txt\n(SHA-256 ledger)]
    end
    OPS[Operators] --> MD
    Pipelines --> JSON
    Auditors --> MAN
    Compliance --> SHA
    IncidentResponders --> TXT
    classDef node fill:#f4f9ff,stroke:#2c82c9;
    classDef actor fill:#fef5e7,stroke:#f39c12;
    class MD,JSON,TXT,MAN,SHA node;
    class OPS,Pipelines,Auditors,Compliance,IncidentResponders actor;
```

Each file contains trailing newlines for compatibility with UNIX tooling.
Hashes use lowercase hex-encoded SHA-256 digests that match `sha256sum` and
`shasum -a 256` output formats.

---

## Review Workflow

1. **Generate the bundle** on a dry-run network (Hardhat, staging RPC).
2. **Attach the directory** (or a zipped copy) to the governance ticket.
3. **Run checksum verification** before approval:
   ```bash
   cd runtime/bundles
   sha256sum --check mission-control-<stamp>.checksums.txt
   ```
4. **Review the manifest** (`*.manifest.json`) for a structured overview of
   step status, metrics, runtime, and exact CLI/env pairs that produced the
   artefact.
5. **Forward Markdown/JSON** files to stakeholders:
   - Markdown → executive summaries with Mermaid diagrams.
   - JSON → automation, regression diffing, compliance archives.
   - TXT → non-technical operator logs or mobile readers.
6. **Re-run** mission control against production RPC once governance signs off.
   Add `--strict` so any lingering warnings halt the deployment rather than
   slipping into production unnoticed. The new bundle should produce matching
   hashes except for live network differences.

---

## Manifest Fields

| Field            | Description                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| `network`        | Hardhat network supplied to mission control.                                                    |
| `baseName`       | Sanitised bundle stem used for filenames.                                                       |
| `generatedAt`    | ISO timestamp (UTC) when the bundle was produced.                                               |
| `overallStatus`  | Aggregated step status (`success`, `warning`, `error`, `skipped`).                              |
| `includeMermaid` | Indicates whether Mermaid diagrams were enabled.                                                |
| `steps[]`        | Array of step summaries, metrics, commands, environment overrides, and runtime in milliseconds. |
| `files[]`        | Records every exported file with byte length and SHA-256 digest.                                |

The manifest deliberately excludes private keys, RPC URLs, and secrets. Only
surface-level environment overrides (e.g., `OWNER_DASHBOARD_JSON=1`) are
captured.

---

## Frequently Asked Questions

**Can I store bundles in version control?** Yes. Each file ends with a newline
and uses deterministic ordering, so Git diffs remain stable across runs.

**How do I change the output directory per network?** Combine shell variables
and the bundle CLI:

```bash
STAMP=$(date -u +%Y%m%dT%H%MZ)
OUTDIR=runtime/bundles/$STAMP
npm run owner:mission-control -- \
  --network mainnet \
  --bundle "$OUTDIR" \
  --bundle-name "mission-control-mainnet-$STAMP"
```

**Can the manifest be ingested by dashboards?** Absolutely. Point any JSON
consumer at `*.manifest.json` to hydrate dashboards with per-step metrics and
links to source files. The manifest intentionally mirrors the JSON payload so
pipelines can diff or alert on configuration drift.

---

With the bundle playbook, non-technical owners gain a push-button mechanism to
collect audit-grade governance artefacts, while engineers retain a reproducible
trail for every production parameter change.
