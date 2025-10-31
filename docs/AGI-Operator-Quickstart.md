# AGI-Operator-Quickstart.md

*A beginner-friendly handout for operating the latest **AGIJobsv0** repository—no coding required.*

---

## What you’ll do
- Open the project (in your browser with **GitHub Codespaces** or locally)
- Run the **Day‑One Utility** demo to see **Utility = GMV − Cost** improve
- Try different **strategy profiles** (AlphaEvolve, HGM, TRM, OMNI)
- Use **Owner controls** safely (fees, pause, guardrails)
- Read **reports & snapshots** to make decisions—fast

> If you can click a few buttons and copy‑paste commands, you’re good.

---

## 1) Open the project (easiest first)

### Option A — Run in your browser (recommended)
1. Open: <https://github.com/MontrealAI/AGIJobsv0>
2. Click **Code ➜ Codespaces ➜ Create codespace on main**
3. When your Codespace opens, you’ll see a **file explorer** (left) and a **terminal** (bottom)

> Stopping a codespace pauses billing; deleting it frees storage.

### Option B — Run on your computer
1. Install **Git** and **Python** (and **Node.js** if a demo asks for it)
2. In a terminal:
   ```bash
   git clone https://github.com/MontrealAI/AGIJobsv0
   cd AGIJobsv0
   ```
3. If a demo’s README mentions versions or setup steps, follow those

---

## 2) Run your first demo — *Day‑One Utility*
This demo proves value on day one by showing **Utility = GMV − Cost** improvement and saving a mini dashboard snapshot.

1. In the file explorer, open **`demo/`** and locate the Day‑One Utility demo  
   *(the folder name is obvious, e.g., `AGIJobs-Day-One-Utility-Benchmark`)*  
2. Open its **README** and find **Quickstart / How to run**
3. Most demos offer a **single command**. Commonly:
   ```bash
   make e2e
   ```
4. When it finishes you’ll see a banner like:
   ```
   ✅ Day‑One Utility +X%
   ```
   And new files in the demo’s **`out/`** folder, for example:
   - **Report** (JSON): GMV, Cost, Utility, guardrail status
   - **Snapshot** (PNG/HTML): Baseline vs Candidate chart/dashboard

> If you see a red **❌**, guardrails blocked a risky change (e.g., low uplift or high latency). That’s expected—try a different strategy (next section) or adjust rules.

---

## 3) Try different strategies (no coding)
Run the same scenario with different **strategy profiles**:

| Strategy        | What it emphasizes                            |
|-----------------|-----------------------------------------------|
| **E2E**         | Baseline end‑to‑end                           |
| **AlphaEvolve** | AI‑evolved heuristics for improvement         |
| **HGM**         | Governance‑first (stricter safety)            |
| **TRM**         | Revenue‑maximizing profile                    |
| **OMNI**        | Everything orchestrated together              |

Common commands (run one at a time from the demo folder):
```bash
make alphaevolve
make hgm
make trm
make omni
```

Compare **Utility uplift** and the **snapshot**. The **report JSON** shows: GMV, Cost, Utility, and any guardrail trips.

---

## 4) Use Owner controls (safe & reversible)
You can tune “business levers” without touching code:

- **Platform fee (bps)** → revenue share to the treasury  
- **Pause / Resume** → emergency stop  
- **Latency / Budget limits** → safety ceilings

**Where to edit:** in the demo’s config (often `rules.yaml` or `owner_controls.yaml`).  
**How:** change a value ➜ re‑run the demo ➜ see new Utility & guardrail results.

> Guardrails protect you: if uplift is too low or latency/cost exceeds limits, the run fails instead of “shipping” a bad change.

---

## 5) Read the output like an Operator
Each run produces:

- **Terminal banner**: e.g., `Utility +5.0%`
- **Report JSON** (in `out/`): GMV, Cost, Utility, `uplift_pct`, `latency_increase_pct`, guardrail pass/fail
- **Snapshot** (PNG or HTML): Baseline vs Candidate chart

Use these to answer:
- Did **Utility (GMV − Cost)** go **up** vs baseline?
- Are **latency / budget / fairness** still within limits (all green)?
- Which **strategy** best fits your goals?

---

## 6) A 10‑minute daily flow
1. **Run Day‑One Utility** → confirm uplift and green guardrails  
2. **Compare strategies** (AlphaEvolve, HGM, TRM, OMNI) → pick the winner  
3. **Adjust Owner controls** (e.g., fee bps) → re‑run → confirm uplift persists  
4. **Save artifacts** (report + snapshot) as your daily decision record

---

## 7) Troubleshooting (quick fixes)
- **“make: command not found” (Windows)**  
  Use the Python command from the demo’s README (e.g., `python run_demo.py …`) or install `make`.
- **Python “Module not found”**  
  Install the demo’s deps (e.g., `pip install -r requirements.txt` or `pip install pyyaml matplotlib`).
- **No snapshot image**  
  Some demos output **HTML** dashboards—open the generated `.html` file in your browser.
- **Guardrail failure (❌)**  
  That’s by design. Try another strategy or relax thresholds slightly in the config and re‑run.

---

## 8) Repo map (feel oriented fast)
- **`demo/`** — runnable examples that prove value (pick one and follow its README)
- **`contracts/v2/`** — modular on‑chain logic (latest Solidity contracts)
- **`subgraph/`** — data indexing for dashboards/analytics
- **`orchestrator/`** — orchestration workflows and automation
- **`monitoring/`** — runbooks, dashboards, metrics
- **`docs/`** — guides and deeper reading

---

## 9) Ready for more?
- Run the **AlphaEvolve** demo to watch the system **learn** better strategies automatically
- Explore **Mission/Control** dashboards (if available) for richer, live views
- Read the root **README** for governance, CI, and v2 details—then come back and run more demos

---

**You’re now an AGI Operator.**  
**Run, read, tune—safely.**
