# Owner Control Quick Reference

> **Purpose.** Pair this document with the generated `ownerControlGuide` CLI so non-technical operators always have an illustrated, copy/paste-friendly blueprint for editing configuration, shipping Safe bundles, and verifying on-chain state.

## Run the Auto-Generated Guide

```bash
npm run owner:guide -- --network mainnet
npm run owner:guide -- --network sepolia --out docs/runtime/owner-guide-sepolia.md
```

- `--format human` – strip Markdown tables for plain-text change-control systems.
- `--no-mermaid` – disable diagram blocks when exporting to systems that do not support Mermaid.
- `--out <path>` – write the rendered instructions to disk for distribution or sign-off packages.

## Visual Overview

```mermaid
flowchart TD
    classDef edit fill:#e8f5e9,stroke:#43a047,stroke-width:1px
    classDef review fill:#e3f2fd,stroke:#1e88e5,stroke-width:1px
    classDef execute fill:#fff3e0,stroke:#fb8c00,stroke-width:1px
    classDef verify fill:#fce4ec,stroke:#d81b60,stroke-width:1px

    Edit[Edit config/*.json<br/>Commit with audit notes]:::edit --> Surface[owner:surface<br/>control snapshot]:::review
    Surface --> Plan[owner:update-all<br/>dry-run diff]:::review
    Plan --> Safe[owner:plan:safe<br/>optional Safe bundle]:::review
    Safe --> Execute[owner:update-all --execute<br/>Submit transactions]:::execute
    Execute --> Verify[owner:verify-control<br/>confirm on-chain state]:::verify
    Verify --> Dashboard[owner:dashboard<br/>health monitor]:::review
    Dashboard -->|Monthly| Surface
```

## Checklist Snapshot

| Phase | Action | Command |
| --- | --- | --- |
| Prepare | Update JSON under `config/` and run lint/tests | `npm run format:check && npm test` |
| Preview | Render dry run for the target chain | `npm run owner:update-all -- --network <network>` |
| Safeguard | Produce Safe bundle for sign-off | `npm run owner:plan:safe -- --network <network>` |
| Execute | Apply changes from a secure signer | `npm run owner:update-all -- --network <network> --execute` |
| Verify | Confirm ownership, treasury, pauser wiring | `npm run owner:verify-control -- --network <network>` |
| Archive | Store Safe bundle + transaction hashes | `npm run owner:guide -- --network <network> --out runtime/<network>-guide.md` |

## Sequence Diagram

```mermaid
sequenceDiagram
  autonumber
  participant Config as config/*.json
  participant Operator
  participant Wizard as owner:wizard
  participant Planner as owner:update-all
  participant Safe
  participant Chain

  Operator->>Config: Update parameters
  Operator->>Planner: Dry run (no execute)
  Planner-->>Operator: Calldata + diffs + guardrail warnings
  Operator->>Wizard: Guided prompts (optional)
  Wizard-->>Operator: Updated JSON with checksum preview
  Operator->>Planner: --execute
  Planner->>Chain: Submit transactions sequentially
  Chain-->>Operator: Receipts + gas usage summary
  Operator->>Planner: owner:verify-control
  Planner-->>Operator: ✅ Ownership / governance match config
```

## Operator Tips

- **Parameter ownership** – Run `npm run owner:guide -- --network <network>` before every change; the generated matrix highlights which controller (owner vs governance) signs each transaction.
- **Audit log** – Commit the generated Markdown output alongside config changes so reviewers can trace the exact workflow executed.
- **Network portability** – Use per-network overrides in `config/<name>.<network>.json`; the guide automatically resolves them.
- **Disaster recovery** – Keep the last generated Safe bundle; replaying it restores the prior configuration deterministically.
- **Non-technical handoff** – Provide the Mermaid diagrams plus the generated guide to coordinators; no Hardhat knowledge required.
