# Culture Analytics Metrics

This document formalises the **Culture Maturity Score (CMS)** and **Self-Play Growth (SPG)**
metrics and explains how they are generated from the CULTURE demo stack.

## Metric definitions

### Culture Maturity Score (CMS)

CMS expresses the health of the on-chain culture graph on a 0–100 scale. The score
combines connectivity, depth, derivative reuse, and equity of influence.

\[
\text{CMS} = 100 \times \Big(0.35 \cdot C + 0.30 \cdot D + 0.25 \cdot A + 0.10 \cdot E\Big)
\]

Where:

- **Connectivity (C)** – the average citation count per artifact normalised against a
  target of three citations (`C = clamp(avgCitations / 3, 0, 1)`).
- **Depth (D)** – the deepest lineage observed in the period normalised against a target
  depth of five (`D = clamp(maxLineageDepth / 5, 0, 1)`).
- **Adoption (A)** – the share of minted artifacts that are derivatives (`A = clamp(derivativeJobs / createdArtifacts, 0, 1)`).
- **Equity (E)** – one minus the Gini coefficient of influence scores, reinforcing diverse
  influence rather than concentration.

### Self-Play Growth (SPG)

SPG reflects the self-play arena’s throughput and stability on a 0–100 scale.

\[
\text{SPG} = 100 \times \Big(0.5 \cdot S + 0.35 \cdot T + 0.15 \cdot (1 - P)\Big)
\]

Where:

- **Success cadence (S)** – the average validator success rate across the period.
- **Thermostat momentum (T)** – the current difficulty normalised between the configured
  minimum and maximum.
- **Penalty (P)** – the proportion of validator slash events among all rounds; higher
  slash activity decreases the score.

## Data sources

The analytics job reads from three stores:

1. **Indexer SQLite database** (`culture-graph.db`) for artifact counts, lineage depth,
   derivative ratios, and influence scores.
2. **Arena orchestrator API** (`/arena/scoreboard`) for validator cadence, difficulty,
   and Elo leaderboards.
3. **Moderation audit log** (`storage/validation/moderation.log` by default) to surface
   recent content warnings in the weekly reports.

## Generation workflow

Run the generator once:

```bash
npm run culture:analytics
```

Override the sliding window or provide a deterministic fixture as needed:

```bash
npm run culture:analytics -- --window-hours 48
npm run culture:analytics -- --dry-run demo/CULTURE-v0/data/fixtures/analytics-dry-run.json
```

Run continuously (default hourly) with:

```bash
npm run culture:analytics -- --interval 900  # every 15 minutes
```

Environment variables control inputs and output locations:

| Variable | Purpose | Default |
| --- | --- | --- |
| `CULTURE_ANALYTICS_DB` | Path to indexer SQLite database | `demo/CULTURE-v0/data/culture-graph.db` |
| `CULTURE_ORCHESTRATOR_URL` | Base URL for arena orchestrator | `http://localhost:4005` |
| `CULTURE_ANALYTICS_OUTPUT` | Directory for weekly JSON snapshots | `demo/CULTURE-v0/data/analytics` |
| `CULTURE_ANALYTICS_ALERT_LOG` | Structured anomaly log file | `demo/CULTURE-v0/logs/analytics.alerts.jsonl` |
| `ORCHESTRATOR_MODERATION_AUDIT` | Moderation audit log path | `storage/validation/moderation.log` |
| `CULTURE_ORCHESTRATOR_LOG` | Stake manager structured log path (optional) | `demo/CULTURE-v0/logs/orchestrator.jsonl` |

The Docker Compose service `culture-analytics` runs the generator in daemon mode and shares
volumes with the indexer and orchestrator containers.

## Alerting heuristics

The generator writes structured alerts (component `culture-analytics`, action `anomaly`) to the
alert log when:

- **Validator slashes** exceed `CULTURE_ANALYTICS_SLASH_THRESHOLD` (default: 2) within the window.
- **Zero-success streaks** reach `CULTURE_ANALYTICS_SUCCESS_STREAK` consecutive rounds (default: 3).
- **Artifact bursts** exceed `CULTURE_ANALYTICS_BURST_THRESHOLD` minted artifacts within
  `CULTURE_ANALYTICS_BURST_WINDOW_HOURS` hours (defaults: 10 artifacts in 1 hour).

These alerts appear in the RUNBOOK as escalation triggers.

## Dry-run simulation

A deterministic fixture (`demo/CULTURE-v0/data/fixtures/analytics-dry-run.json`) exercises the
pipeline without live infrastructure:

```bash
npm run culture:analytics:dry-run
```

The fixture encodes expected CMS and SPG values. The generator prints deltas to the console so
operators can calibrate thresholds when heuristics change. This dry-run is also suitable for
CI to ensure data-shape regressions are detected early.

## Outputs

Two JSON snapshots are produced for each ISO week (`culture-week-YYYY-Www.json` and
`arena-week-YYYY-Www.json`). They feed the weekly markdown exporter and any dashboards that
consume the analytics directory.
