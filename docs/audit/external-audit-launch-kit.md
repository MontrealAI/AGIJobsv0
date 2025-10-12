# External Audit Launch Kit

This document complements the [External Audit & Final Verification Playbook](final-verification-playbook.md) by providing a single command that emits the entire checklist in ready-to-share Markdown. It is targeted at non-technical release managers who need to freeze the repository, brief auditors, and ship artefacts without editing code.

## Quickstart

```bash
npm run audit:kit -- --output reports/audit/launch-kit.md
```

The command:

1. Generates a timestamped launch kit covering every stage of the "Recommended Next Coding Sprint: External Audit & Final Verification" mandate.
2. Produces Markdown with checkbox lists, command references, and artefact expectations so coordinators can track completion at a glance.
3. Accepts `--format json` for automation pipelines that want to ingest the same structure programmatically.
4. Refuses to overwrite existing files unless you pass `--force`, preventing accidental loss of annotated launch kits.

The generated Markdown references:

- `npm run audit:freeze` and `npm run audit:final -- --full` to guarantee the repository is frozen and the CI v2 guardrails are green.
- `npm run audit:dossier` to capture the auditor hand-off bundle described in [docs/AUDIT_DOSSIER.md](../AUDIT_DOSSIER.md).
- `npm run owner:verify-control` and `npm run monitoring:validate` to prove the contract owner retains full control and that monitoring hooks are live.

## Regeneration workflow

Run the command every time you:

- Enter or exit a freeze window.
- Address an audit finding.
- Update branch protection, owner control manifests, or monitoring dashboards.

Store the rendered Markdown beside the dossier summary (`reports/audit/summary.json`) so auditors can diff successive launch kits. The JSON format is safe to ingest into ticketing systems for automated sign-off gates.

## Parameters

| Flag | Description |
| --- | --- |
| `--output <file>` | Write the launch kit to a file instead of stdout. |
| `--format json` | Emit structured JSON (default is Markdown). |
| `--force` | Overwrite an existing file specified by `--output`. |

If you omit `--output`, the script prints the kit to stdout so you can preview the content or pipe it into other tooling.

## Operational notes

- Always run `npm run audit:freeze` immediately before generating the launch kit to ensure branch parity and a clean worktree.
- Capture the git commit hash in your change ticket alongside the generated Markdown for immutable traceability.
- Attach the launch kit to the shared audit folder so third-party reviewers can follow the exact state transitions you executed.

By pairing this launch kit generator with the playbook, the team achieves repeatable, auditable readiness for an external security review while keeping the contract owner firmly in control of every parameter.
