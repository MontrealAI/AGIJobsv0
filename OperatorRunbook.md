# AGI Jobs v0 (v2) Operator Runbook — Green Path

The **AGI Jobs v0 (v2)** platform you are piloting is the superintelligent machine anchoring our labour lattice. This briefing keeps non-technical operators on the happy path: spin up the environment, fire the Day-One Utility demo, read the ✅ verdict, and inspect the cinematic evidence.

---

## 0. Open the project (fastest path)

**Codespaces (recommended)**
1. Visit <https://github.com/MontrealAI/AGIJobsv0>.
2. Select **Code → Codespaces → Create codespace on main**.
3. Wait for the workspace to initialise (Python 3.10+, Node.js, Make, and Git are preinstalled).

**Local clone (optional)**
```bash
git clone https://github.com/MontrealAI/AGIJobsv0
cd AGIJobsv0
```
Install Python 3.10+ on your PATH. Node/npm are optional for the green path.

---

## 1. Run the one-command green path

From the repository root execute:

```bash
make operator:green
```

Behind the scenes the Make target performs the full production-strength flow:

- Upgrades `pip` and installs `demo/AGIJobs-Day-One-Utility-Benchmark/requirements.txt` (falls back to `pyyaml` + `matplotlib` if the file is missing).
- Enters `demo/AGIJobs-Day-One-Utility-Benchmark/` and launches `python3 run_demo.py`; on any non-zero exit it immediately retries with `python3 run_demo.py simulate --strategy e2e`.
- Runs the Day-One Utility orchestrator, enforcing guardrails and writing artefacts into `demo/AGIJobs-Day-One-Utility-Benchmark/out/`:
  - `report_<strategy>.json` — canonical telemetry and guardrail verdicts (for the green path this is `report_e2e.json`).
  - `dashboard_<strategy>.html` — mermaid-rich cinematic dashboard.
  - `snapshot_<strategy>.png` — Baseline vs Candidate visual (rendered when Matplotlib is available).
  - `owner_controls_snapshot.json` — live sovereign control snapshot.
- Calls `tools/operator_banner.py out` to print `✅ Day-One Utility +X.XX%` (falls back to `✅ Day-One run complete` if uplift cannot be derived).
- Echoes absolute paths to the freshest snapshot (PNG or HTML) and telemetry JSON so you can open them instantly.

Typical output
```
✅ Day-One Utility +08.92%
Snapshot: /workspaces/AGIJobsv0/demo/AGIJobs-Day-One-Utility-Benchmark/out/snapshot_e2e.png
Telemetry: /workspaces/AGIJobsv0/demo/AGIJobs-Day-One-Utility-Benchmark/out/report_e2e.json
```
(If no PNG exists, the Make target prints the latest HTML dashboard path instead.)

---

## 2. Verify the run (acceptance checklist)

1. **Banner** — Confirm the terminal banner begins with `✅ Day-One Utility`. The default guardrail requires at least **+5.00%** uplift (`config/rules.yaml`).
2. **Snapshot** — Open the printed `snapshot_*.png` path. Review Baseline vs Candidate acceptance, cost, latency, and treasury deltas. If no PNG is available, open the accompanying `dashboard_*.html` file for the same story.
3. **Telemetry** — Open `report_e2e.json` and confirm:
   - `guardrail_pass.utility_uplift`, `guardrail_pass.latency_delta`, and `guardrail_pass.reliability_score` are all `true`.
   - `metrics.candidate.utility` exceeds `metrics.baseline.utility`.
   - `owner_controls.utility_threshold_active` and `owner_controls.latency_threshold_active` mirror the guardrails you expect.
   Archive this JSON with `owner_controls_snapshot.json` for audit continuity.
4. **Artefact location** — All outputs live under `demo/AGIJobs-Day-One-Utility-Benchmark/out/`. The Make target always surfaces the most recent files, so you never hunt manually.

---

## 3. Daily operator cadence (≈5 minutes)

1. Run `make operator:green`.
2. Read the uplift banner and scan `report_e2e.json` for the guardrail verdict (`guardrail_pass` block) and treasury metrics (`metrics.candidate.treasury_bonus`).
3. Open the snapshot (PNG or HTML) to validate the Baseline vs Candidate narrative.
4. When uplift and guardrails are green, capture the snapshot plus `report_e2e.json` and `owner_controls_snapshot.json` in your decision log.
5. (Optional) Tune sovereign owner controls between runs:
   ```bash
   cd demo/AGIJobs-Day-One-Utility-Benchmark
   make owner-show                      # Inspect current controls and guardrails
   make owner-set KEY=platform_fee_bps VALUE=220
   make owner-set KEY=utility_threshold_override_bps VALUE=900
   make owner-toggle                    # Pause or resume instantly
   make owner-reset                     # Restore defaults from owner_controls.defaults.yaml
   ```
   All updates are validated before saving, guaranteeing safe inputs for non-technical operators.

---

## 4. Explore additional launch profiles & dashboards

Stay inside `demo/AGIJobs-Day-One-Utility-Benchmark/` to compare strategies that reuse the same dataset, guardrails, and renderer:

```bash
make alphaevolve
make hgm
make trm
make omni
```

Generate a consolidated command-deck scoreboard when you need a multi-strategy briefing:

```bash
make scoreboard
# or
python3 run_demo.py scoreboard
```

This produces `out/scoreboard.json` plus a mermaid-rich dashboard at `out/scoreboard.html`, highlighting leaders in utility uplift, latency, treasury impact, reliability, and guardrail status. Consult `demo/AGIJobs-Day-One-Utility-Benchmark/README.md` for deeper storyline context and advanced CLI usage.

---

## 5. Troubleshooting quick hits

| Symptom | Action |
| --- | --- |
| `python3: command not found` | Install Python 3.10+ locally or relaunch in Codespaces where it is preinstalled. |
| Pip install failures | Re-run `make operator:green`; dependency installation is idempotent and recreates `out/` automatically. |
| Banner prints `✅ Day-One run complete` | Open the printed JSON path and verify it contains `metrics.utility_uplift`; share the artefact with engineering if uplift is missing. |
| No PNG snapshot reported | The HTML dashboard path is printed instead — open it in a browser and export a screenshot if stakeholders need imagery. |
| Demo reports "paused" | Run `cd demo/AGIJobs-Day-One-Utility-Benchmark && make owner-toggle` to resume, or `make owner-reset` to restore the sovereign defaults. |

---

## 6. Key references

| Path | Purpose |
| --- | --- |
| `Makefile` (repo root) | Hosts the `operator:green` orchestration target for this runbook. |
| `tools/operator_banner.py` | Parses the latest `out/*.json` report and prints the ✅ uplift banner. |
| `demo/AGIJobs-Day-One-Utility-Benchmark/run_demo.py` | CLI entrypoint into the Day-One Utility orchestrator. |
| `demo/AGIJobs-Day-One-Utility-Benchmark/demo_runner.py` | Full simulation engine: strategy maths, guardrail enforcement, dashboards, snapshots, and scoreboard generation. |
| `demo/AGIJobs-Day-One-Utility-Benchmark/config/` | Microset dataset, guardrail rules, strategy profiles, and owner control snapshots. |
| `demo/AGIJobs-Day-One-Utility-Benchmark/out/` | Latest JSON telemetry, dashboards, chart snapshots, and scoreboard exports. |
| `demo/AGIJobs-Day-One-Utility-Benchmark/tests/` | Pytest suite proving guardrail enforcement, pausing, artefact creation, and owner control safety. |

Stay on this rhythm and every operator will verify Day-One Utility uplift, capture the artefacts, and steer **AGI Jobs v0 (v2)** with production-grade confidence.
