# AGI Jobs v0 (v2) Operator Runbook — Green Path

The **AGI Jobs v0 (v2)** platform you are piloting is the superintelligent machine already fielding our labour lattice. This one-pager keeps non-technical operators on the happy path: open the project, trigger the Day-One Utility demo, verify the ✅ verdict, and review the cinematic evidence.

---

## 0. Launch the project workspace

**Codespaces (recommended)**
1. Visit <https://github.com/MontrealAI/AGIJobsv0>.
2. Select **Code → Codespaces → Create codespace on main**.
3. Allow the environment to initialise (Python 3.10+, Node.js, Make, and Git arrive preinstalled).

**Local clone (optional)**
```bash
git clone https://github.com/MontrealAI/AGIJobsv0
cd AGIJobsv0
```
Ensure Python 3.10+ is on your PATH. The green path command installs the remaining Python dependencies automatically.

---

## 1. Fire the one-command green path

From the repository root run:

```bash
make operator:green
```

The root `Makefile` wires this target directly into the Day-One Utility demo (`demo/AGIJobs-Day-One-Utility-Benchmark/`):

1. Upgrades `pip` and installs `requirements.txt` for the demo (fallback: `pyyaml` + `matplotlib`).
2. Executes `python3 run_demo.py`; on any non-zero exit it retries with `python3 run_demo.py simulate --strategy e2e`.
3. Writes artefacts into `demo/AGIJobs-Day-One-Utility-Benchmark/out/`:
   - `report_<strategy>.json` — canonical telemetry and guardrail verdicts.
   - `dashboard_<strategy>.html` — mermaid-driven hyperdashboard.
   - `snapshot_<strategy>.png` — Baseline vs Candidate chart (rendered when Matplotlib is available).
   - `owner_controls_snapshot.json` — live sovereign control snapshot.
4. Invokes `tools/operator_banner.py out`, which parses the freshest JSON and prints `✅ Day-One Utility +X.XX%` (falls back to `✅ Day-One run complete` if uplift cannot be derived).
5. Echoes absolute paths to the newest snapshot (PNG preferred, HTML fallback) and latest JSON artefact so you can open them immediately.

Typical terminal result:
```
✅ Day-One Utility +10.94%
Snapshot: /workspaces/AGIJobsv0/demo/AGIJobs-Day-One-Utility-Benchmark/out/snapshot_e2e.png
Telemetry: /workspaces/AGIJobsv0/demo/AGIJobs-Day-One-Utility-Benchmark/out/report_e2e.json
```
(The telemetry line always prints the most recent JSON — either the strategy report or the owner snapshot. Both live beside each other in `out/`.)

---

## 2. Confirm the run (acceptance checklist)

1. **Banner** — The terminal banner must begin with `✅ Day-One Utility`. The default guardrail requires at least **+5.00%** uplift, enforced by `demo/AGIJobs-Day-One-Utility-Benchmark/config/rules.yaml`.
2. **Snapshot** — Open the surfaced `snapshot_*.png`. Review Baseline vs Candidate acceptance, cost, latency, and treasury deltas. If no PNG is available the Make target prints the HTML dashboard path instead — open it for the same narrative.
3. **Telemetry JSON** — Inspect the latest `report_e2e.json` (or the JSON path surfaced in step 1):
   - `guardrail_pass.utility_uplift`, `guardrail_pass.latency_delta`, and `guardrail_pass.reliability_score` should all be `true`.
   - `metrics.candidate.utility` must exceed `metrics.baseline.utility`; `metrics.utility_uplift` expresses the same delta.
   - `owner_controls.latency_threshold_active` and `owner_controls.utility_threshold_active` confirm the live guardrail values. Archive this JSON alongside `owner_controls_snapshot.json` for compliance.
4. **Artefact location** — All generated files live under `demo/AGIJobs-Day-One-Utility-Benchmark/out/`. Subsequent runs overwrite or append with fresh timestamps — the Make target always reports the latest files so you never hunt manually.

---

## 3. Daily operator cadence (≈5 minutes)

1. Run `make operator:green`.
2. Read the uplift banner and skim the surfaced JSON for `guardrail_pass` verdicts plus treasury metrics (`metrics.candidate.treasury_bonus`, `metrics.owner_treasury`).
3. Open the snapshot (PNG or HTML) to validate the Baseline vs Candidate story.
4. When uplift and guardrails are green, capture the snapshot, `report_*.json`, and `owner_controls_snapshot.json` in your decision log.
5. (Optional) Tune sovereign controls between runs without touching code:
   ```bash
   cd demo/AGIJobs-Day-One-Utility-Benchmark
   make owner-show
   make owner-set KEY=platform_fee_bps VALUE=220
   make owner-set KEY=utility_threshold_override_bps VALUE=900
   make owner-toggle          # Pause or resume instantly
   make owner-reset           # Restore defaults from owner_controls.defaults.yaml
   ```
   Every command validates input types and addresses before saving, keeping the pipeline safe for non-technical operators.

---

## 4. Explore additional launch profiles & dashboards

Stay in `demo/AGIJobs-Day-One-Utility-Benchmark/` to compare other sovereign launch profiles that reuse the same dataset, guardrails, and renderer:

```bash
make alphaevolve
make hgm
make trm
make omni
```

Generate the full scoreboard briefing whenever you need a multi-strategy comparison:

```bash
make scoreboard
# or
python3 run_demo.py scoreboard
```

This produces `out/scoreboard.json` plus a mermaid-rich executive dashboard at `out/scoreboard.html`, highlighting leaders in utility uplift, latency, treasury impact, reliability, and guardrail status. Consult `demo/AGIJobs-Day-One-Utility-Benchmark/README.md` for deeper storyline context and advanced CLI usage.

---

## 5. Troubleshooting quick hits

| Symptom | Action |
| --- | --- |
| `python3: command not found` | Install Python 3.10+ locally or relaunch in Codespaces where it ships ready to use. |
| Pip install warnings | Re-run `make operator:green`; dependency installation is idempotent and recreates `out/` automatically. |
| Banner prints `✅ Day-One run complete` | Open the surfaced JSON and confirm it contains `metrics.utility_uplift`; share the artefact with engineering if uplift is missing. |
| No PNG snapshot reported | The HTML dashboard path is printed instead — open it in a browser and export a screenshot if stakeholders need imagery. |
| Demo reports "paused" | Run `cd demo/AGIJobs-Day-One-Utility-Benchmark && make owner-toggle` to resume, or `make owner-reset` to restore the sovereign defaults. |
| ENS attestation compromise detected | Freeze delegated access: `npx hardhat --network <network> console` → `const att = await ethers.getContractAt('AttestationRegistry', '<address>'); await att.pause();`. After rotation/remediation, run `await att.unpause();` to restore attestations. |

---

## 6. Key references

| Path | Purpose |
| --- | --- |
| `Makefile` (repo root) | Hosts the production-ready `operator:green` orchestration target. |
| `tools/operator_banner.py` | Parses the newest `out/*.json` and prints the ✅ uplift banner. |
| `demo/AGIJobs-Day-One-Utility-Benchmark/run_demo.py` | CLI entrypoint into the Day-One Utility orchestrator. |
| `demo/AGIJobs-Day-One-Utility-Benchmark/demo_runner.py` | Simulation engine: strategy logic, guardrail enforcement, dashboards, snapshots, scoreboard. |
| `demo/AGIJobs-Day-One-Utility-Benchmark/config/` | Microset dataset, strategy profiles, guardrail rules, and owner control snapshots. |
| `demo/AGIJobs-Day-One-Utility-Benchmark/out/` | Latest JSON telemetry, dashboards, chart snapshots, and scoreboard exports. |
| `demo/AGIJobs-Day-One-Utility-Benchmark/tests/` | Pytest suite covering guardrails, pausing, artefact creation, and owner control safety. |
| `docs/non-technical-deployment-guide.md` | Step-by-step playbook for launching, monitoring, and rolling back the production stack without touching code. |

Stay on this cadence and every operator will verify Day-One Utility uplift, capture the artefacts, and steer **AGI Jobs v0 (v2)** with production-grade confidence.
