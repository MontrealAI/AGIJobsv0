# AGI Jobs v0 (v2) Operator Runbook — Green Path

The **AGI Jobs v0 (v2)** platform you are piloting is the superintelligent machine that anchors our labour lattice. This playbook equips non-technical operators to launch the flagship Day-One Utility demo, capture a ✅ verdict, and review the cinematic evidence in just a few minutes.

---

## 0. Launch the workspace (fastest path)

**Codespaces (recommended)**
1. Visit <https://github.com/MontrealAI/AGIJobsv0>.
2. Click **Code ▸ Codespaces ▸ Create codespace on main**.
3. Wait for the workspace to boot (Python 3.10+ and Node are pre-installed).

**Local clone (optional)**
```bash
git clone https://github.com/MontrealAI/AGIJobsv0
cd AGIJobsv0
```
Ensure Python 3.10+ is on your PATH. Node/npm are optional for the green path.

---

## 1. One-command green path

From the repository root run:

```bash
make operator:green
```

This target orchestrates the demo end-to-end:
- Upgrades pip and installs `demo/AGIJobs-Day-One-Utility-Benchmark/requirements.txt` (falls back to PyYAML + Matplotlib).
- Executes `python3 run_demo.py` for the Day-One Utility scenario (retries with `python3 run_demo.py simulate --strategy e2e` if needed).
- Streams artefacts into `demo/AGIJobs-Day-One-Utility-Benchmark/out/` (JSON telemetry, PNG snapshots, HTML dashboards).
- Invokes `tools/operator_banner.py` to print a banner such as `✅ Day-One Utility +X.XX%` using the freshest JSON report.
- Echoes absolute paths for the newest snapshot and telemetry so you can open them immediately.

Sample output:
```
✅ Day-One Utility +09.87%
Snapshot: /workspaces/AGIJobsv0/demo/AGIJobs-Day-One-Utility-Benchmark/out/snapshot_e2e.png
Telemetry: /workspaces/AGIJobsv0/demo/AGIJobs-Day-One-Utility-Benchmark/out/owner_controls_snapshot.json
```
(If the uplift cannot be parsed, you will still see `✅ Day-One run complete` along with the artefact paths.)

---

## 2. Validate the run

1. **Banner** — Confirm the banner begins with `✅ Day-One Utility`. Any uplift ≥ +5.00% satisfies the default guardrail in `config/rules.yaml`.
2. **Snapshot** — Open the printed PNG path to review the Baseline vs Candidate comparison. If only an HTML dashboard is available, open it in your browser.
3. **Telemetry** — Download the JSON path for guardrail verdicts, owner controls, and utility metrics. Archive it with the snapshot.
4. **Artefact location** — All outputs accumulate inside `demo/AGIJobs-Day-One-Utility-Benchmark/out/`; the make target always surfaces the newest files.

---

## 3. Daily operator cadence (≈5 minutes)

1. `make operator:green`
2. Read the uplift banner and guardrail verdict.
3. Inspect the snapshot (PNG/HTML) for narrative alignment.
4. File the snapshot + JSON in your decision log when uplift and guardrails are green.
5. (Optional) Adjust owner controls before rerunning:
   ```bash
   cd demo/AGIJobs-Day-One-Utility-Benchmark
   make owner-set KEY=platform_fee_bps VALUE=220
   make owner-set KEY=utility_threshold_override_bps VALUE=900
   make owner-toggle   # Pause/resume instantly
   make owner-reset    # Restore sovereign defaults
   ```
   Active values live in `config/owner_controls.yaml`; the reset baseline is `config/owner_controls.defaults.yaml`.
6. (Optional) Explore alternative launch profiles from the demo directory:
   ```bash
   make alphaevolve
   make hgm
   make trm
   make omni
   make scoreboard   # Generates out/scoreboard.json + out/scoreboard.html
   ```
   These targets reuse the same dataset, guardrail engine, and dashboard renderer to showcase AlphaEvolve/HGM/TRM/OMNI strategies.

---

## 4. Troubleshooting checklist

| Symptom | Action |
| --- | --- |
| `python3` missing | Install Python 3.10+ (`sudo apt install python3 python3-pip`) or relaunch in Codespaces. |
| Pip install errors | Re-run `make operator:green`; dependency installation is idempotent and recreates `out/` as needed. |
| Banner missing uplift | Open the printed JSON path and confirm it includes `metrics.utility_uplift`; share the artefacts with engineering. |
| No PNG path printed | The fallback HTML dashboard path will appear. Open it in a browser and export a screenshot if stakeholders need imagery. |
| Demo paused | Run `cd demo/AGIJobs-Day-One-Utility-Benchmark && make owner-toggle` to resume, or `make owner-reset` to restore defaults. |

---

## 5. Key directories & artefacts

| Path | Purpose |
| --- | --- |
| `Makefile` (repo root) | Hosts the `operator:green` target used by this runbook. |
| `tools/operator_banner.py` | Parses the latest JSON report and prints the uplift banner. |
| `demo/AGIJobs-Day-One-Utility-Benchmark/run_demo.py` | CLI entrypoint executed by `make operator:green`. |
| `demo/AGIJobs-Day-One-Utility-Benchmark/demo_runner.py` | Simulation, guardrail enforcement, HTML rendering, charting. |
| `demo/AGIJobs-Day-One-Utility-Benchmark/config/` | Microset, strategy, guardrail, and owner control YAMLs. |
| `demo/AGIJobs-Day-One-Utility-Benchmark/out/` | JSON telemetry, PNG snapshots, HTML dashboards per run. |
| `demo/AGIJobs-Day-One-Utility-Benchmark/tests/` | Pytest suite validating guardrails, artefact creation, owner controls. |
| `demo/AGIJobs-Day-One-Utility-Benchmark/README.md` | Full deep-dive into additional demos and governance flows. |

Stay on this rhythm and every operator will verify Day-One Utility uplift, capture artefacts, and steer **AGI Jobs v0 (v2)** with production-grade confidence.
