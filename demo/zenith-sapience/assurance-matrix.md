# Assurance Matrix

The assurance matrix weaves together automated checks, human playbooks, and telemetry observability to guarantee Zenith Sapience remains verifiable, resilient, and governance-aligned.

## Assurance Overview

```mermaid
flowchart LR
    classDef check fill:#0f172a,stroke:#a855f7,color:#e9d5ff
    classDef human fill:#111827,stroke:#f97316,color:#fed7aa
    classDef data fill:#052e16,stroke:#22c55e,color:#bbf7d0

    subgraph Automated
        CI[CI Matrix\nci.yml]:::check
        Foundry[Foundry Suite\nforge test]:::check
        Coverage[Hardhat Coverage\nnpm run coverage]:::check
        Static[Static Analysis\nnpm run lint]:::check
    end

    subgraph HumanInLoop
        Playbooks[Owner Control Playbooks\ndocs/owner-control-*.md]:::human
        Councils[Governance Councils\nconfig/identity-registry.*.json]:::human
        Auditors[Feasibility Auditors\ndocs/asi-feasibility-*.md]:::human
    end

    subgraph Telemetry
        Monitoring[monitoring/onchain + grafana]:::data
        Routes[routes/ escalation paths]:::data
        Snapshots[scripts/v2/snapshot*.ts]:::data
    end

    CI --> Monitoring
    Foundry --> Monitoring
    Coverage --> Monitoring
    Static --> Monitoring

    Monitoring --> Routes
    Routes --> Playbooks
    Playbooks --> Councils
    Councils --> Auditors
    Auditors --> CI

    Snapshots --> Auditors
```

## Verification Grid

| Domain | Automated Signal | Human Oversight | Evidence Artifact |
| --- | --- | --- | --- |
| Identity Integrity | `npm run identity:update` (without `--execute`) | ENS council review (`docs/owner-control-identity.md`) | Console diff + `docs/owner-control-identity.md` annotations |
| Incentive Thermodynamics | `forge test --match-test RewardEngineMB` | Treasury board sign-off (`docs/thermodynamics-operations.md`) | Fuzz logs + `docs/thermodynamics-operations.md` notes |
| Job Lifecycle | `npm test -- test/v2/jobLifecycle.test.ts` | Operations review (`docs/owner-control-operations.md`) | Test reports + `reports/` audit bundles |
| Treasury Flow | `npm run owner:dashboard -- --json` | Finance council checklist (`docs/owner-control-treasury.md`) | JSON snapshot exported to `reports/` |
| Disputes | `npx hardhat test --no-compile test/v2/jobLifecycleWithDispute.integration.test.ts` | Arbitration guild manual (`docs/owner-control-disputes.md`) | Test transcripts stored with post-mortems |
| Monitoring & Alerts | `npm run monitoring:validate` | Reliability guild watch rotation (`monitoring/rotation.md`) | `monitoring/onchain/*.json` status exports |

## Escalation Ladder

1. **Automated Detection** – CI, fuzzing, coverage, and monitoring jobs emit alerts into `routes/` webhooks.
2. **Operator Verification** – On-call operators consult `docs/owner-control-emergency-runbook.md` to classify severity.
3. **Council Deliberation** – Governance councils instantiated via ENS rosters convene using multi-sig confirmations.
4. **Remediation Execution** – Scripts under `scripts/v2/` execute deterministic fixes (stake rebalancing, thermostat adjustments).
5. **Post-Mortem Capture** – Findings logged into `reports/` and referenced by `docs/owner-control-audit.md` to enrich institutional knowledge.

## Continuous Evidence Trails

- CI artifacts (coverage reports, fuzz logs) are exported to `reports/` and cross-linked in `docs/asi-feasibility-verification-suite.md`.
- Treasury snapshots are hashed and notarized through existing `deploy` scripts to provide tamper-evident history.
- `simulation/` results feed the assurance matrix by demonstrating expected vs. actual outcomes across mission streams.

With this assurance matrix, Zenith Sapience offers verifiable guarantees to stakeholders while sustaining autonomous execution loops.
