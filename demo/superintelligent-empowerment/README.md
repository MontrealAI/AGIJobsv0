# Initiative evidence ledger

Turn a project proposal into a reviewable record of claims, supplied observations and explicit acceptance criteria. This bounded local demo generates real artifacts and checks their consistency. It does not establish the authenticity of a source, measure societal impact, approve a project, or commission work.

## Run with Python alone

From the repository root, choose a new output directory whose parent already exists:

```sh
python demo/superintelligent-empowerment/code/evidence.py run \
  --packet demo/superintelligent-empowerment/evidence/example.json \
  --output /tmp/initiative-evidence-run
python demo/superintelligent-empowerment/code/evidence.py review /tmp/initiative-evidence-run
```

The example is synthetic. It reports eight reviewed deliverables, leaves a follow-up outcome without evidence, and holds an expansion proposal behind that follow-up. One initiative is ready for human review; the overall proposal remains incomplete. Readiness is a consistency check, not human approval.

Outputs:

- `packet.json`: exact original input bytes
- `ledger.json`: every reported claim, criterion, source hash and dependency hold
- `report.md`: a short review checklist
- `receipt.json`: exact SHA256 commitments to the three artifacts

Review recomputes the ledger from the packet and compares all artifact bytes. Editing a result and replacing its receipt hash still fails. A successful review establishes consistency with the supplied packet, not the packet's origin. Each source's exact UTF-8 bytes are hashed; neither JSON reformatting nor a matching hash authenticates an observation.

## Define your own bounded packet

Use the example's exact versioned schema. Supply 1–30 initiatives and at most 30 evidence records. Each initiative has a unique lowercase identifier, dependency identifiers, a reported claim, one integer acceptance criterion and an optional evidence identifier. A criterion uses an exact metric/unit pair, `gte` or `lte`, and a threshold from 0 to 1,000,000,000.

Each evidence record embeds a UTF-8 JSON string containing exactly `metric`, `unit` and integer `value`, plus its SHA256 hash. Evidence must match the criterion's metric and unit exactly. An unavailable observation stays `null` through `evidenceId`; it is never counted as zero or a successful result. No URLs are fetched and no arbitrary commands are executed.

The existing Astral Citadel topological engine determines dependency order. Input order resolves available-node ties. Even a met criterion stays held when an upstream initiative is not ready. Cycles, unknown dependencies, duplicate identifiers, mismatched units, bad hashes, unknown fields, non-finite values, fractional numbers, malformed UTF-8, BOM-prefixed JSON and oversized input fail closed.

Input is capped at 256 KiB, each embedded source at 16 KiB. New output directories are required, and existing files are never overwritten. Exit `0` means artifact consistency checks passed, including an incomplete proposal; exit `2` indicates invalid input or an I/O error. Consult `allReadyForHumanReview` separately. Files are ordinary local output; no power-loss durability or hostile-filesystem containment is claimed.

## Preserved narrative and design

The original `code/run_demo.py` YAML narrative generator, `configs/mission.yaml`, diagrams and presentation assets remain available. Its projected outcomes are supplied aspirations, not measured results. This evidence ledger adds a concrete review workflow without treating those aspirations as proven capabilities.

## Checks

```sh
python -m pytest demo/superintelligent-empowerment/tests
```

Tests cover met/unmet/unknown criteria, dependency holds, malformed inputs, real artifact generation, recomputation, resealed tampering, no-overwrite behavior, missing files, FIFO input and symlink output refusal. Provider calls, chain transactions, source-authenticity verification, real-world-impact verification and settlement approval remain explicitly absent.
