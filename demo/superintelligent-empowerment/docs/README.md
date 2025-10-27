# Superintelligent Empowerment Demo

Welcome to a narrative-rich demonstration that proves how superintelligent
copilots can amplify human sovereignty. Inside this demo you will find code,
configurations, assets, and automation scripts that together tell a story of
impactful deployment.

## Directory Layout

- `code/` – Python source that loads the scenario and generates a structured
  impact report.
- `configs/` – YAML configuration describing initiatives, beneficiaries, and
  capability vectors.
- `scripts/` – Automation entry points, including a single-command setup and
  deployment script plus manual fallbacks.
- `docs/` – Documentation, runbooks, and storytelling artifacts.
- `assets/` – Visual resources such as Mermaid diagrams and UI previews that
  help you communicate the vision.

## One-Command Setup & Deploy

To experience the full flow, execute the following from the repository root:

```bash
./demo/superintelligent-empowerment/scripts/setup_and_deploy.sh
```

The script provisions an isolated virtual environment, installs dependencies,
invokes the orchestrator, and leaves behind an impact report under
`demo/superintelligent-empowerment/output/`.

### Manual Fallback Steps

1. Create and activate a virtual environment:
   ```bash
   python3 -m venv demo/superintelligent-empowerment/.venv
   source demo/superintelligent-empowerment/.venv/bin/activate
   pip install --upgrade pip
   ```
2. Install demo dependencies:
   ```bash
   pip install -r demo/superintelligent-empowerment/code/requirements.txt
   ```
3. Run the orchestrator manually:
   ```bash
   python demo/superintelligent-empowerment/code/run_demo.py \
     --config demo/superintelligent-empowerment/configs/mission.yaml \
     --output demo/superintelligent-empowerment/output/report.json
   ```

## Storytelling: Empowerment, Impact, Superintelligence

> *Communities awaken as AGI copilots weave equitable prosperity. Founders
> co-design moonshot economies with empathic intelligences that translate vision
> into reality. Public institutions witness cascading benefits, from sovereign
> supply networks to rapid climate resilience. This demo channels that future
> by making the orchestration legible, measurable, and repeatable.*

Each initiative in the configuration highlights people-first empowerment,
measurable impact, and the tangible feel of superintelligent capability vectors.

## Validation Run

The setup script was executed in a clean environment using the commands below:

```bash
rm -rf demo/superintelligent-empowerment/.venv demo/superintelligent-empowerment/output
./demo/superintelligent-empowerment/scripts/setup_and_deploy.sh
```

**Outcome:** A fresh virtual environment was created, dependencies were
installed, the empowerment table rendered in the console, and an impact report
was written to `demo/superintelligent-empowerment/output/report.json`. The
report captures the executive summary, initiative breakdowns, and projected
outcomes ready for downstream storytelling.

For a quick glance at the visual language, open
`demo/superintelligent-empowerment/assets/ui-preview.html` in your browser and
embed the Mermaid diagram located at
`demo/superintelligent-empowerment/assets/architecture.mmd` into your favorite
knowledge base.
