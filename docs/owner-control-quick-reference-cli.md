# Owner Control Quick Reference CLI

> **Audience:** Contract owners, operations teams and auditors who need a
> human-friendly but automatable snapshot of every production lever exposed by
> the AGIJobs owner toolchain.

> **Companion tools:** This guide complements the visual
> [`owner-control-surface`](./owner-control-surface.md) report and the
> interactive [`owner-config-wizard`](./owner-control-handbook.md). Use the
> CLI when you need a portable, scriptable summary that can be regenerated on
> demand with the exact same commands.

---

## Why a quick reference CLI?

- ✅ **Single entry point** – consolidates governance addresses, token wiring,
  stake manager economics, reward engine settings and energy oracle policies in
  one report.
- ✅ **Format flexibility** – render human-readable, Markdown-ready or JSON
  payloads for automation pipelines without editing the TypeScript source.
- ✅ **Mermaid-rich** – every report embeds a prebuilt diagram that illustrates
  how the quickstart output feeds into the rest of the owner control suite.
- ✅ **Non-technical friendly** – zero Solidity, Hardhat or scripting knowledge
  required. Every command is copy/paste ready.

---

## Installation

No additional dependencies are required. The CLI ships with the repository and
is wired into `package.json` as `npm run owner:quickstart`.

Run `npm install` once (if you have not already) to install the repository's
Node.js dependencies, then invoke the helper:

```bash
npm install
npm run owner:quickstart -- --network <network>
```

Replace `<network>` with a Hardhat network key (for example `mainnet`,
`sepolia`, `localhost`). If the flag is omitted the helper attempts to infer the
network from Hardhat/Foundry/Truffle environment variables.

---

## Command quick reference

| Goal | Command |
| --- | --- |
| Human readable terminal report | `npm run owner:quickstart -- --network <network>` |
| Export Markdown with diagram | `npm run owner:quickstart -- --network <network> --format markdown --out reports/<network>-owner-quickstart.md` |
| Produce machine-friendly JSON | `npm run owner:quickstart -- --network <network> --format json --out reports/<network>-owner-quickstart.json` |
| Skip the Mermaid diagram | `npm run owner:quickstart -- --network <network> --no-mermaid` |
| View CLI help | `npm run owner:quickstart -- --help` |

### CLI flags

| Flag | Description |
| --- | --- |
| `--network <name>` | Overrides automatic network detection. Accepts Hardhat network names, chain IDs or aliases. |
| `--format <human|markdown|json>` | Selects the output format. Defaults to `human`. |
| `--out <path>` | Writes the report to disk. Parent directories are created automatically. |
| `--no-mermaid` | Omits the Mermaid diagram from human/Markdown output. Useful when piping to pagers without code fence support. |
| `--mermaid` | Forces the Mermaid block even if `--no-mermaid` appeared earlier in a shell alias. |
| `--help` | Prints usage information and exits. |

---

## What the report contains

Every run produces a deterministic snapshot of the following configuration
sources:

| Section | Source file |
| --- | --- |
| Governance defaults & module overrides | `config/owner-control.json` |
| Token identity & wiring | `config/agialpha*.json` |
| Stake economics & slash curves | `config/stake-manager.json` |
| Fee distribution | `config/fee-pool.json` |
| Reward engine thermodynamics | `config/reward-engine.json`, `config/thermodynamics.json` |
| System temperature guards | `config/thermodynamics.json` |
| Hamiltonian monitor | `config/hamiltonian-monitor.json` |
| Energy oracle signer set | `config/energy-oracle.json` |

For each section the CLI lists:

1. The canonical config file path (great for audits and change tracking).
2. Key numeric values twice – once in human units (AGIALPHA tokens) and once in
   raw base units – to avoid unit ambiguity.
3. Addresses normalised to checksum format with zero-address detection.
4. A ready-to-run operational checklist showing the exact order of scripts to
   inspect, update and verify contract state.

---

## Example (human format)

```text
$ npm run owner:quickstart -- --network sepolia
AGIJobs Owner Quickstart Report
================================
Generated: 2025-02-18T03:14:15.926Z
Network: sepolia

Governance Overview
-------------------
Default governance: 0x0000000000000000000000000000000000000000 (zero)
Default owner:      0x0000000000000000000000000000000000000000 (zero)
Source file:        /workspace/AGIJobsv0/config/owner-control.json
Modules:
  - stakeManager [governable] governance=0x0000000000000000000000000000000000000000 (zero) owner=0x0000000000000000000000000000000000000000 (zero)
  ...

Operational Checklist
----------------------
1. Inspect : npm run owner:surface -- --network sepolia
2. Plan    : npm run owner:wizard -- --network sepolia
3. Execute : npm run owner:update-all -- --network sepolia --execute
4. Verify  : npm run owner:verify-control -- --network sepolia
5. Snapshot: npm run owner:quickstart -- --network sepolia --format markdown --out reports/sepolia-owner-quickstart.md

Mermaid Control Flow
--------------------
```mermaid
flowchart TD
    Config[Config JSON]\n--> QS[owner:quickstart]\nQS --> Surface[owner:surface]\nQS --> Wizard[owner:wizard]\nQS --> Plan[owner:plan]
    Surface --> Update[owner:update-all]\nPlan --> Rotate[owner:rotate]\nUpdate --> Verify[owner:verify-control]\nRotate --> Verify
    Verify --> Snapshot[reports & auditors]\n
```
```

The Markdown variant wraps the same content in Markdown tables ready for runbook
attachments. The JSON variant emits a machine-readable object suitable for CI/CD
artefacts or change-detection bots.

---

## Operational playbook integration

1. **Pre-change assessment** – Generate the human report and attach it to the
   change ticket. Highlight any zero-address placeholders that must be updated
   before production deployment.
2. **Planning** – Feed the JSON output into configuration validation scripts to
   confirm that proposed edits respect policy limits (for example max slash
   percentages or stake floors).
3. **Execution** – Follow the embedded checklist. The quickstart output is
   intentionally aligned with the workflows documented in
   [`owner-control-handbook.md`](./owner-control-handbook.md) and the
   [`owner-control-command-center`](./owner-control-command-center.md) scripts.
4. **Verification** – Store the Markdown or JSON artefact alongside Gnosis Safe
   or timelock execution receipts. Auditors can diff reports across deployments
   to confirm no hidden parameter drift occurred.

---

## Diagram-only mode

Need just the systems diagram for presentations? Run:

```bash
npm run owner:quickstart -- --network <network> --format markdown --out reports/<network>-diagram.md --no-mermaid
cat reports/<network>-diagram.md
```

Then copy the Mermaid block into documentation, slides or dashboards. Because
the CLI always writes deterministic diagrams, downstream tooling can diff the
diagram text to detect architectural changes.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `Stake manager config not found` | Missing or misnamed file under `config/` or network override path | Confirm the file exists and matches the naming convention. Use `--network` to select the right override. |
| `Unknown flag` error | Typo or unsupported option | Run `npm run owner:quickstart -- --help` for the complete option list. |
| Empty governance/module addresses | Placeholders not yet populated | Update `config/owner-control.json` with production addresses and re-run the report. |

---

## Next steps

1. Regenerate the quickstart report after **every** configuration change. Commit
   the Markdown/JSON artefact alongside the edited config files to maintain a
   tamper-evident audit trail.
2. Combine the CLI output with
   [`docs/owner-control-master-checklist.md`](./owner-control-master-checklist.md)
   for full production launch readiness.
3. Share the Mermaid diagram with stakeholders – it reinforces how governance
   updates flow from configuration files through the owner toolkit into live
   contracts.

The quick reference CLI gives the contract owner actionable situational
awareness in seconds, ensuring every production rollout remains deliberate,
traceable and reversible.

