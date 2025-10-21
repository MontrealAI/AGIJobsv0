# Self-Play Arena Weekly Report

**Week:** 1
**Network:** Local Anvil

## Tournament Summary

| Metric | Value |
| --- | --- |
| Rounds completed | 18 |
| Average round duration | 6m 42s |
| Difficulty range | 1 → 6 |
| Target success rate | 60% |
| Observed success rate | 57% |
| Validator honesty | 98.2% |

## Elo Progression

| Agent | Role | Start Elo | End Elo | Δ |
| --- | --- | --- | --- | --- |
| Atlas-Student-01 | student | 1200 | 1348 | +148 |
| Atlas-Student-02 | student | 1200 | 1286 | +86 |
| Asteria-Teacher | teacher | 1200 | 1234 | +34 |
| Helios-Teacher | teacher | 1200 | 1176 | -24 |
| Nyx-Validator-01 | validator | 1200 | 1218 | +18 |

## Difficulty Thermostat

```
Round:  1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18
Diff.: 1 1 2 3 3 4 4 5 5 6 5 5 6 6 5 5 6 6
Success%: 88 75 67 62 59 54 63 58 55 52 61 63 57 54 65 60 58 56
```

## Validator Performance

- Total commits: 324
- Successful reveals: 322
- Slashed validators: 1 (revealed vote inconsistent with consensus)

## Operational Notes

- One round auto-cancelled due to non-responsive student; orchestrator reissued challenge successfully.
- Prometheus metrics exported at `/metrics`; Grafana dashboard updated with new panels for Elo volatility.
- All reward transfers executed without delay; FeePool balances reconciled.

