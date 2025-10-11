# Forta Calibration Log Template

Use this template whenever Forta-based anomaly detection is tuned for AGI Jobs v0 (v2).
Filling it out produces auditable evidence for institutional reviews and ensures the
thresholds remain aligned with protocol risk appetite.

## Metadata

- **Date:** <YYYY-MM-DD>
- **Network:** <mainnet|testnet>
- **Forta Agent IDs:** `<0x...>`, `<0x...>`
- **Operator:** <Name / Role>
- **Reviewer:** <Name / Role>
- **Change Ticket:** <Link to owner-control change record>

## Baseline Dataset

Describe the transaction window used to calibrate the detector.

- Block range: `<start>-<end>`
- Expected steady-state TPS: `<value>`
- Historical validator churn rate: `<value>`
- Data source exports: `reports/forta/baseline-<date>.json`

## Threshold Configuration

| Metric | Previous Threshold | New Threshold | Rationale |
| --- | --- | --- | --- |
| Job execution surge | 99th percentile = `<value>` | `<value>` | `<why>` |
| Treasury outflow volume | `<value>` | `<value>` | `<why>` |
| Validator stake churn | `<value>` | `<value>` | `<why>` |

Document additional metrics if your Forta agent surfaces them.

## Dry-Run Evidence

1. Commands executed (`npm run simulation:stress ...`, Forta CLI, etc.).
2. Screenshots or JSON excerpts proving the alert fired when expected.
3. Notes on any false positives and how they were mitigated.

## Approval & Rollout

- ✅ Reviewer approval timestamp: `<ISO-8601>`
- ✅ Defender Sentinel (FORTA_ALERT) updated: `<Yes/No>` (link to transaction/commit)
- ✅ Incident response team briefed: `<Yes/No>` (attach notes in `docs/incident-response.md`).

## Quarterly Revalidation Checklist

- [ ] Baseline dataset refreshed.
- [ ] Thresholds compared against actual production metrics.
- [ ] Forta agent version pinned / upgraded with justification.
- [ ] Monitoring tabletop exercise performed with Forta injects.

Store the completed log under `docs/security/forta-calibration/<YYYY-MM-DD>-<network>.md`
and reference it in the release dossier described in `docs/release-artifacts.md`.
