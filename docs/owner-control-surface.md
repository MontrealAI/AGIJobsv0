# Owner Control Surface Report

The owner control surface report gives non-technical operators a single, audit-ready snapshot of every tunable contract parame
ter, the configuration file that governs it, and the ownership wiring that must be maintained in production. The command works e
ntirely offline against the checked-in JSON files, so you can vet change requests or maintenance windows without a live RPC conn
ection.

```mermaid
flowchart TD
    Start([Start review]) --> Config[Update config/*.json
(owners & parameters)]
    Config --> SurfaceCmd[`npm run owner:surface
(--network <net>)`]
    SurfaceCmd -->|Human output| Review{All modules green?}
    SurfaceCmd -->|--json| Automate[Attach to change control]
    Review -- no --> Fix[Resolve warnings/errors]
    Fix --> Config
    Review -- yes --> Bundle[`npm run owner:update-all
-- --network <net>`]
    Bundle --> Execute[`--execute` or Safe bundle]
    Execute --> Verify[`npm run owner:verify-control
-- --network <net>`]
```

## Quick Start

1. **Sync configuration.** Pull the latest repository state so JSON files mirror the deployment you are about to operate on.
2. **Run the surface command:**
   ```bash
   npm run owner:surface -- --network mainnet
   ```
   Replace `mainnet` with `sepolia`, `localhost`, or any custom Hardhat network alias. Omit `--network` to use the defaults inferr
   ed from environment variables.
3. **Review the status lines.** Each module is flagged as:

   | Status | Meaning | Typical follow-up |
   | --- | --- | --- |
   | ✅ OK | Ownership and config are aligned. | Proceed with downstream scripts. |
   | ⚠️ Needs review | Missing owner, zero address, or advisory note. | Update `config/agialpha.json` or `config/owner-control.json` before executing transactions. |
   | ❌ Action required | Config could not be parsed or is inconsistent. | Fix the underlying JSON and rerun the surface command; do not deploy while red. |

4. **Escalate issues.** Anything marked `❌` stops the production run. Items marked `⚠️` should be triaged before executing `owner
:update-all` or on-chain transactions.

## Sample Output

```text
AGIJobs Owner Control Surface
================================
Network context: mainnet
Token: AGIALPHA
Summary: 2 ready, 7 with warnings, 3 requiring action.

❌ Action required Reward Engine
  Address: (not set)
  Owner: (not defined)
  Config: config/thermodynamics.json
  Key parameters:
    • Role shares: agent: 65%, validator: 15%, operator: 15%, employer: 5%
  Warnings:
    • Module address not configured in config/agialpha.json
    • Owner not defined in owner-control.json
    • No configuration file for this module

⚠️  Needs review Energy Oracle
  Address: (not set)
  Owner: (not defined)
  Config: config/energy-oracle.json
  Key parameters:
    • Authorised signers: 0
    • Retain unknown signers: true
  Warnings:
    • Module address not configured in config/agialpha.json
    • Owner not defined in owner-control.json

Legend: ✅ ok, ⚠️ review recommended, ❌ action required.
```

The command annotates each module with the controlling addresses from `config/owner-control.json`, the configuration file hash (S
HA-256), and a digest of the most important operational knobs (percentages, stake thresholds, ENS roots, etc.). Use the hash to
prove which configuration blob was reviewed during change-control sign-off.

## JSON & Markdown Modes

- **JSON export** – Generate automation-friendly output for ticketing systems or CI pipelines:
  ```bash
  npm run owner:surface -- --network mainnet --json --out owner-surface.json
  ```
  The JSON payload includes `generatedAt`, token metadata, per-module status, warnings, and configuration hashes.
- **Markdown report** – Produce a ready-to-attach summary for incident reviews or governance forums:
  ```bash
  npm run owner:surface -- --format markdown > owner-surface.md
  ```
  Each table row captures the module name, owner, governance target, config path, key parameters, and outstanding warnings.

## Interpreting Common Warnings

| Warning text | Why it appears | Resolution |
| --- | --- | --- |
| `Module address not configured in config/agialpha.json` | The contract address is zero or undefined. | Populate `config/agialpha.<network>.json` with the deployed address. |
| `Owner not defined in owner-control.json` | No owner override exists for the module and the global owner is unset/zero. | Edit `config/owner-control.json` to set the owner (and governance safe, if applicable). |
| `Failed to load config: …` | The JSON is missing required fields (for example, `taxPolicy` set to the zero address). | Fix the offending entry, re-run the surface command, then proceed. |

Once all modules are green, you can safely execute:

```bash
npm run owner:update-all -- --network <network> --execute
```

followed by

```bash
npm run owner:verify-control -- --network <network>
```

to enforce and verify the changes on-chain.
