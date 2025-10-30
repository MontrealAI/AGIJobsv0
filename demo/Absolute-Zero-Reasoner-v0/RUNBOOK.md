# Absolute Zero Reasoner v0 Runbook

This runbook equips a non-technical owner to operate the Absolute Zero Reasoner demo with confidence.

## 1. Launch the demo

```bash
cd demo/Absolute-Zero-Reasoner-v0
python -m absolute_zero_reasoner_demo.run_demo --iterations 25 --tasks 6
```

Outcome:

- Console JSON summary (ROI, GMV, cost, TRR++ baselines).
- `reports/absolute_zero_reasoner_report.md` with Mermaid timeline.
- `reports/absolute_zero_reasoner_metrics.json` for downstream analytics.

## 2. Interpret the telemetry

Open `reports/absolute_zero_reasoner_report.md` in any Markdown viewer. It contains:

- **Mermaid line chart** of solver success rate versus iteration.
- **ROI table** listing GMV, compute cost, and guardrail notes per iteration.
- **Alerts column** explaining thermostat or sentinel interventions.

Positive ROI (GMV > cost) indicates the agent is delivering more value than it consumes.

## 3. Adjust behaviour without coding

Modify `absolute_zero_reasoner_demo/config/default_config.yaml`:

- `iterations` / `tasks_per_iteration` – training budget.
- `proposer.max_program_loc` / `proposer.difficulty_step` – curriculum difficulty ramp.
- `solver.accuracy_floor` / `accuracy_ceiling` – exploration vs exploitation.
- `rewards.econ_weight` – importance of market utility.
- `guardrails.target_success_rate` – thermostat sweet spot.

Re-run the demo to apply changes. All knobs are safe to tweak; the guardrail centre prevents runaway behaviour.

## 4. Integrate with AGI Jobs v0 (v2)

1. **Connect to live LLMs**: Swap the stochastic solver for the fm.chat adapter (`solver.py` is isolated for easy replacement).
2. **Plug into the marketplace**: Replace `market.py` with the production economic simulator that reads on-chain job data.
3. **Stream telemetry**: Send `TelemetryStream` records to the global observability bus for 24/7 monitoring.
4. **Automate with CI**: Add `python -m absolute_zero_reasoner_demo.run_demo --iterations 5` to nightly workflows to validate sandboxing and telemetry health.

## 5. Troubleshooting

| Symptom | Resolution |
| --- | --- |
| `SandboxViolation` error | Task attempted to import a forbidden module. Reduce proposer difficulty or inspect generated program.
| `diversity-floor-breached` alert | Curriculum became repetitive. Increase `proposer.difficulty_step` or flush buffers by deleting `reports/*.json`.
| ROI negative | Increase iterations (more self-play) or raise `rewards.econ_weight` to prioritise valuable skills.

## 6. Reset state

Delete `reports/absolute_zero_reasoner_metrics.json` and rerun the demo to start fresh.

## 7. Automate via Makefile

After pulling the latest repository root:

```bash
make absolute-zero-demo
```

This target runs the demo with production defaults and prints the summary JSON, guaranteeing consistency across environments.

Stay within this runbook and you can operate the Absolute Zero Reasoner without touching code.
