# AGI Jobs v0 (v2) Operator Runbook — Green Path

The **AGI Jobs v0 (v2)** platform you are piloting is the superintelligent machine that anchors our labour lattice. This runbook keeps non-technical operators on the happy path: launch the Day-One Utility demo, confirm the ✅ verdict, open the cinematic artefacts, and make a fast call.

---

## 0. Launch the workspace (fastest path)

**Codespaces (recommended)**
1. Visit <https://github.com/MontrealAI/AGIJobsv0>.
2. Click **Code ▸ Codespaces ▸ Create codespace on main**.
3. Wait for the workspace to initialise (Python 3.10+, Node.js, and Make are pre-provisioned).

**Local clone (optional)**
```bash
git clone https://github.com/MontrealAI/AGIJobsv0
cd AGIJobsv0
```
Install Python 3.10+ if it is not already on your PATH. Node/npm are optional for the green path.

---

## 1. Run the one-command green path

From the repository root execute:

```bash
make operator:green
```

Behind the scenes this target performs the entire production-strength flow:

- Upgrades `pip` and installs `demo/AGIJobs-Day-One-Utility-Benchmark/requirements.txt` (falls back to `pyyaml` + `matplotlib` if the file is ever absent).
- Enters the Day-One Utility demo directory and runs `python3 run_demo.py`; if the CLI exits non-zero it immediately retries with `python3 run_demo.py simulate --strategy e2e`.
- Invokes the `DayOneUtilityOrchestrator` to simulate the flagship strategy, enforce guardrails, and write artefacts into `demo/AGIJobs-Day-One-Utility-Benchmark/out/`:
  - `out/report_e2e.json` — canonical telemetry & guardrail verdicts.
  - `out/dashboard_e2e.html` — mermaid-powered dashboard.
  - `out/snapshot_e2e.png` — Baseline vs Candidate visual (if Matplotlib is available).
  - `out/owner_controls_snapshot.json` — sovereign owner controls at execution time.
- Calls `tools/operator_banner.py out` to parse the freshest JSON report and print `✅ Day-One Utility +X.XX%` (falls back to `✅ Day-One run complete` if uplift cannot be derived).
- Echoes absolute paths to the newest PNG/HTML snapshot and JSON telemetry so you can open them immediately.

Sample output:
```
✅ Day-One Utility +08.92%
Snapshot: /workspaces/AGIJobsv0/demo/AGIJobs-Day-One-Utility-Benchmark/out/snapshot_e2e.png
Telemetry: /workspaces/AGIJobsv0/demo/AGIJobs-Day-One-Utility-Benchmark/out/report_e2e.json
```
(If no PNG is rendered, the command prints the latest HTML dashboard path instead.)

---

## 2. Validate the run (acceptance checklist)

1. **Banner** — Confirm the terminal banner begins with `✅ Day-One Utility`. An uplift of **+5.00% or greater** satisfies the baseline guardrail encoded in `demo/AGIJobs-Day-One-Utility-Benchmark/config/rules.yaml`.
2. **Snapshot** — Open the printed `snapshot_*.png` path to review Baseline vs Candidate metrics side-by-side. If the PNG is missing, open the `dashboard_*.html` path; it contains the same story in a cinematic layout.
3. **Telemetry** — Download `report_e2e.json` for the metrics, guardrail verdicts, owner treasury impact, and mermaid summaries. Archive it together with `owner_controls_snapshot.json` for audit continuity.
4. **Artefact location** — All outputs live under `demo/AGIJobs-Day-One-Utility-Benchmark/out/`. The Make target always surfaces the newest files so you never hunt manually.

---

## 3. Daily operator cadence (≈5 minutes)

1. Run `make operator:green`.
2. Read the uplift banner and ensure guardrails report "pass" inside the JSON telemetry.
3. Open the snapshot (PNG or HTML) to verify the narrative and sanity-check Baseline vs Candidate KPIs.
4. When uplift and guardrails are green, capture both the snapshot and `report_e2e.json`/`owner_controls_snapshot.json` in your decision log.
5. (Optional) Adjust sovereign owner controls between runs:
   ```bash
   cd demo/AGIJobs-Day-One-Utility-Benchmark
   make owner-show                      # Inspect the current snapshot
   make owner-set KEY=platform_fee_bps VALUE=220
   make owner-set KEY=utility_threshold_override_bps VALUE=900
   make owner-toggle                    # Pause/resume instantly
   make owner-reset                     # Restore defaults from owner_controls.defaults.yaml
   ```
   Live updates are validated before saving, guaranteeing safe inputs for non-technical operators.

---

## 4. Explore additional launch profiles & scoreboards

Stay inside `demo/AGIJobs-Day-One-Utility-Benchmark` to compare strategies that reuse the same dataset, guardrails, and renderer:

```bash
make alphaevolve
make hgm
make trm
make omni
```

Generate the consolidated scoreboard when you need a multi-strategy briefing:

```bash
make scoreboard
# or
python3 run_demo.py scoreboard
```

This produces `out/scoreboard.json` plus a mermaid-rich command-room dashboard at `out/scoreboard.html`, highlighting leaders in utility uplift, latency, treasury impact, and reliability.

---

## 5. Troubleshooting checklist

| Symptom | Action |
| --- | --- |
| `python3: command not found` | Install Python 3.10+ locally or relaunch in Codespaces where it is pre-installed. |
| Pip install failures | Re-run `make operator:green`; dependency installation is idempotent and recreates `out/` automatically. |
| Banner prints `✅ Day-One run complete` | Open the printed JSON path and verify it contains `metrics.utility_uplift`; share the artefact with engineering if uplift is missing. |
| No PNG snapshot reported | The HTML dashboard path is printed instead — open it in a browser and export a screenshot if stakeholders need imagery. |
| Demo reports "paused" | Run `cd demo/AGIJobs-Day-One-Utility-Benchmark && make owner-toggle` to resume, or `make owner-reset` to restore the sovereign defaults. |

---

## 6. Key files & directories

| Path | Purpose |
| --- | --- |
| `Makefile` (repo root) | Hosts the `operator:green` orchestration target used by this runbook. |
| `tools/operator_banner.py` | Parses the latest `out/*.json` report and prints the ✅ uplift banner. |
| `demo/AGIJobs-Day-One-Utility-Benchmark/run_demo.py` | Friendly CLI entrypoint for the Day-One Utility orchestrator. |
| `demo/AGIJobs-Day-One-Utility-Benchmark/demo_runner.py` | Full simulation engine: strategy maths, guardrail enforcement, dashboard & chart rendering, scoreboard generation. |
| `demo/AGIJobs-Day-One-Utility-Benchmark/config/` | Microset dataset, strategy definitions, guardrail thresholds, owner control snapshots. |
| `demo/AGIJobs-Day-One-Utility-Benchmark/out/` | Latest JSON telemetry, cinematic dashboards, chart snapshots, and scoreboard exports. |
| `demo/AGIJobs-Day-One-Utility-Benchmark/tests/` | Pytest suite proving guardrail enforcement, pausing, artefact creation, and owner control safety. |

Stay on this rhythm and every operator will verify Day-One Utility uplift, capture the artefacts, and steer **AGI Jobs v0 (v2)** with production-grade confidence.
