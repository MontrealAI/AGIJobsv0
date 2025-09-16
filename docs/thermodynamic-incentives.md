# Thermodynamic Incentives

The gateway now instruments every agent execution with low-level CPU, GPU, and
algorithmic-complexity telemetry. The goal is to make energy efficiency a
first-class signal in both reporting and scheduling, so that the network
prefers agents that solve jobs with minimal free energy expenditure.

## Metrics collection pipeline

1. **Invocation spans** – `taskExecution.runAgentTask` wraps every call to an
   agent endpoint in `startJobInvocationMetrics` /
   `finishJobInvocationMetrics`. These helpers sample `process.cpuUsage`,
   `process.hrtime`, and `os.loadavg` to capture CPU time, wall-clock time,
   input/output sizes, and a heuristic algorithmic complexity classification.
2. **Energy spans** – Once the job finishes, the existing energy span from
   `shared/energyMonitor` produces GPU time, memory pressure, and entropy
   estimates. The telemetry bridge merges invocation data with the energy span
   so every record has both runtime and energy metrics.
3. **Persistence** – Combined records are appended to
   `data/energy-metrics.jsonl`. Each line captures:
   - CPU/GPU milliseconds and load average deltas.
   - Estimated operations and algorithmic complexity band (`O(1)` … `O(2^n)`).
   - Reward value, energy estimate, and an **efficiency score**
     `reward / energy`.
   - Success flags, anomalies, and contextual metadata (agent label, category,
     submission method, tx hash, etc.).

Environment variables `TELEMETRY_CPU_OPERATION_WEIGHT` and
`TELEMETRY_GPU_OPERATION_WEIGHT` can be used to tune the complexity heuristic
if your hardware characteristics differ from the defaults.

## Scheduler integration

`orchestrator.selectAgentForJob` now ingests the aggregated efficiency map from
`telemetry.getAgentEfficiencyStats()`. Candidate matches are re-ranked by:

- **Efficiency bonus** – higher average `reward / energy` yields a positive
  adjustment.
- **Energy penalty** – agents with high mean energy draw receive a logarithmic
  penalty.
- **Reliability bonus** – historically successful agents get a small boost.

The selected match records the energy reason in its `reasons` array so audit
logs explain why a low-energy agent was chosen.

## Energy metrics log

`data/energy-metrics.jsonl` is append-only and safe to process with standard
Unix tools. Each record mirrors the `EnergyMetricRecord` interface in
`agent-gateway/telemetry.ts`. Because the log is JSONL you can tail and filter
it without parsing the entire file.

The file is automatically created on first write. To clear history, remove the
file and restart the gateway; aggregates will rebuild from the remaining log
entries.

## Dashboard / log viewer

An optional CLI dashboard lives at `scripts/energy-dashboard.ts`. Run it with
`ts-node` to inspect recent activity:

```bash
npx ts-node --compiler-options '{"module":"commonjs"}' scripts/energy-dashboard.ts --tail 20
```

Key features:

- Agent table sorted by average energy use with average efficiency, CPU/GPU
  time, and success rate.
- Recent job list highlighting energy estimate, efficiency score, and
  complexity classification. Use `--agent <address>` to filter to a single
  agent and `--tail <n>` to control the window size.

This lightweight viewer doubles as a log file, so you can pipe it into other
analysis tools or dashboards if desired.

## Extending the incentives layer

The telemetry pipeline intentionally keeps raw records in JSONL and aggregated
statistics in-memory. Additional services can subscribe by reading the log or
by importing `getAgentEfficiencyStats()` to drive dashboards, leaderboards, or
automated stake adjustments. When adding new metrics remember to update the
telemetry record interface and documentation so downstream consumers stay in
sync.
