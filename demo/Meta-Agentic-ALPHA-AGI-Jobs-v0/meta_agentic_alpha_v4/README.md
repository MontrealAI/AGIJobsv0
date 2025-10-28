# Meta-Agentic α-AGI Jobs Demo — V4 Alpha Flight Deck

The V4 flight deck showcases how a non-technical owner can wield AGI Jobs v0 (v2) to
summon an alpha-compounding enterprise with absolute control. The demo ships as a
single-command orchestration that registers the guardian mesh, constructs an
unstoppable hypergraph plan, and produces live dashboards, mermaid diagrams, and
owner-ready console actions.

## Highlights

- **Owner Primacy:** Every guardian, treasury dial, antifragility buffer, and
  execution throttle is adjustable via the no-code owner controls script.
- **Meta-Agentic Mesh:** Nine sentinel agents coordinate using the A2A meta-dominion
  protocol with antifragility heartbeats and adaptive phoenix restarts.
- **On-Chain Sovereignty:** Governance and execution steps include timelock-aware
  confirmations, gasless paymaster settings, and simulation-first dispatch.
- **Immersive UI:** The Alpha Flight Console renders mermaid timelines, operating
  system graphs, and scoreboard snapshots directly from generated JSON.

## Running the V4 Demo

```bash
python demo/Meta-Agentic-ALPHA-AGI-Jobs-v0/meta_agentic_demo_v4.py
```

The CLI prints a JSON payload pointing to:

- `storage/latest_run_v4.json`
- `meta_agentic_alpha_v4/reports/generated/alpha_flight_synthesis.md`
- `storage/ui/v4/index.html`

Serve the UI locally:

```bash
python -m http.server --directory demo/Meta-Agentic-ALPHA-AGI-Jobs-v0/storage/ui/v4 9001
```

Then open <http://localhost:9001/> to explore the owner console.

## Owner Controls

Use the existing helper to update any parameter:

```bash
python demo/Meta-Agentic-ALPHA-AGI-Jobs-v0/scripts/owner_controls.py \
  --config demo/Meta-Agentic-ALPHA-AGI-Jobs-v0/meta_agentic_alpha_v4/config/scenario.yaml \
  --set plan.budget.max=900000 \
  --set agents[id=alpha-flight-director].stake_amount=99000 \
  --set unstoppable.multi_agent_mesh.quorum=11
```

All updates are dry-run friendly (`--dry-run`), audit logged, and reflected in the
next orchestration.

## Artefact Inventory

- `config/scenario.yaml` – full-stack definition of mission, owner controls, and phases.
- `reports/alpha_dominion_manifesto.md` – mermaid-rich manifesto shipped as an
  attachment and dashboard entry.
- `ui/` – static flight console served directly from generated JSON.
- `reports/generated/alpha_flight_synthesis.md` – summary produced on every run.

## Testing

The V4 module includes dedicated pytest coverage (see `tests/test_meta_agentic_alpha_v4.py`).
The CI workflow executes the V4 CLI alongside previous versions to keep the demo
fully green.
