# Meta-Agentic α-AGI Jobs Demo V5 — Sovereign Meta-Conductor 👁️‍🗨️✨

> **Objective:** Give a non-technical owner an instant command centre for orchestrating an
> unstoppable α-AGI Jobs economy — all through AGI Jobs v0 (v2), without writing code.

## 🚀 What this V5 demo proves

- **Meta-agentic autonomy** across identify → learn → think → design → strategise → execute
  with real artefacts, dashboards, and on-chain ready payloads generated in one run.
- **Owner primacy dialled to 11:** every guardian, treasury control, paymaster, and pause
  switch is surfaced as a simple selector that can be tweaked live with
  `scripts/owner_controls.py`.
- **Mermaid-rich telemetry** powering the new Sovereign Meta-Conductor Console so the owner
  can literally watch the alpha fabric assemble itself.
- **Hard guarantees**: dry-run first, gasless-ready, timelock-governed, guardian-veto-able,
  and antifragility-indexed.
- **Owner Sovereignty Matrix** exposing quorum, circuit-breaker, unstoppable reserves, and
  control levers in one glance — proving the owner can pause or retune everything instantly.

## 🗂️ Directory

```
meta_agentic_alpha_v5/
├── README.md
├── config/
│   └── scenario.yaml              # Scenario definition consumed by the orchestrator
├── data/                          # Static data powering dashboards & reports
│   ├── alpha_signals.json
│   ├── governance_matrix.json
│   ├── guardian_mesh.json
│   ├── opportunity_playbook.json
│   └── timeline.json
├── playbooks/
│   └── sovereign_controls.md      # Operator quick-reference
├── reports/
│   ├── alpha_constellation.md     # Static manifesto
│   └── generated/
│       └── meta_conductor_masterplan.md
└── ui/
    ├── dashboard.js
    ├── index.html
    └── styles.css
```

## 🧭 How a non-technical owner uses it

1. Run `python demo/Meta-Agentic-ALPHA-AGI-Jobs-v0/meta_agentic_demo_v5.py`.
2. The CLI prints the exact files to open (dashboard + report) and a copy-ready
   `python -m http.server` command.
3. Inspect the Owner Sovereignty Matrix panel to confirm quorum, emergency pause, and
   unstoppable reserves before execution.
4. Adjust any parameter via `scripts/owner_controls.py --config meta_agentic_alpha_v5/config/scenario.yaml --set ...`.
5. Re-run the CLI — all dashboards & reports update automatically.

No YAML editing. No smart contract calls. No manual staking. Everything is executed
by the orchestrator and stored in the `storage/` namespace with v5 segregation to keep
older runs intact.

## 🛡️ Safety & control guardrails

- **Guardian mesh quorum** and timelocked approvals before anything touches on-chain.
- **Emergency pause** accessible with a single `owner_controls` command.
- **Dry-run + eth_call** enforced in plan steps. The CLI refuses to continue if any
  simulation diverges from expectations.
- **Mermaid anomaly radar**: the dashboard and report surface any stress events and
  explicitly list the countermeasures, empowering humans to veto or adjust.

## 📊 Artefacts generated per run

- `storage/latest_run_v5.json` — full telemetry, approvals, alpha metrics.
- `meta_agentic_alpha_v5/ui/dashboard-data-v5.json` — data lake powering the console.
- `meta_agentic_alpha_v5/reports/generated/meta_conductor_masterplan.md` — markdown deck.
- `storage/orchestrator_v5/scoreboard.json` — scoreboard snapshot for the run.
- Owner Sovereignty Matrix metrics embedded across the dashboard and report for audit-ready
  proof that every lever remains under owner command.

All artefacts are deterministic, version-controlled, and suitable for investor-ready
briefings right after execution.

