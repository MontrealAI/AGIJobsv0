# Meta-Agentic ALPHA V6

This preserved mission simulation remains part of the complete [Meta-Agentic ALPHA collection](../README.md). Its metrics, addresses, controls and CI statuses are configured examples, not live operation or settlement evidence.

Open **V6 mission console** in the [live workbench](https://montrealai.github.io/AGIJobsv0/experiments/meta-agentic-alpha/#archive), or run `npm run demo:meta-agentic-alpha:serve` from the repository root. The complete viewer supplies locked local diagram dependencies and the recorded synthetic snapshot.

For an isolated fresh rehearsal of all versions, including V6:

```bash
python -m pip install -r requirements-python.txt
python demo/Meta-Agentic-ALPHA-AGI-Jobs-v0/scripts/rehearse.py --out reports/meta-agentic-alpha/python-RUN_ID
```

Use a new output directory. The original entry point remains `python demo/Meta-Agentic-ALPHA-AGI-Jobs-v0/meta_agentic_demo_v6.py --timeout 60`; it regenerates its historic output locations, so use the isolated wrapper when preserving existing examples. Inspect `config/scenario.yaml`, `ui/`, `reports/` and any version-specific `data/` or `playbooks/` directories for the original model.

The current admitted computer-work path and USDC planning are documented in the [operator runbook](../RUNBOOK.md). Historical AGIALPHA scenarios are separate. No dashboard control grants execution or signing authority.

## Original systems map

```mermaid
flowchart LR
    Operators((Mission Owners)) --> demo_Meta_Agentic_ALPHA_AGI_Jobs_v0_meta_agentic_alpha_v6[[Demo → Meta Agentic ALPHA AGI Jobs v0 → Meta Agentic Alpha V6]]
    demo_Meta_Agentic_ALPHA_AGI_Jobs_v0_meta_agentic_alpha_v6 --> Core[[AGI Jobs v0 (v2) Core Intelligence]]
    Core --> Observability[[Unified CI / CD & Observability]]
    Core --> Governance[[Owner Control Plane]]
```
