# Superintelligence Orchestration Playbook

This playbook contains narrative-rich rehearsals that illustrate how the AGI Jobs fabric performs at superintelligent
scale. Each scenario pairs storytelling cues with actionable commands so facilitators can blend operational rigor with
immersive mission briefs.

## Scenario 1 – Dawn Corridor Surge

**Premise:** Diplomatic emissaries need rapid consensus synthesis across multiple language clusters. The shard fabric must
surge capacity without compromising ethics guardrails.

### Beats

1. **Briefing montage** – Use the dashboard hero panel to recount the mission statement.
2. **Shard crescendo** – Observe `Shard Horizon-12` as it moves from *Degraded* to *Nominal* once marketplace nodes arrive.
3. **Telemetry epilogue** – Capture post-run load graphs for archival.

### Commands & Artefacts

```bash
npm run mission-control:ops -- deploy --network sepolia --with-telemetry
```

- Narrate the marketplace cards as characters joining the story.
- Save exported telemetry images inside `reports/dawn-corridor/` for retrospectives.

## Scenario 2 – Aurora Whisper Alignment

**Premise:** Creative teams found latent bias in an ideation loop. We need rapid policy harmonization without halting
production.

### Beats

1. **Ethics council call** – Invite stakeholders to co-read the Mermaid upgrade sequence in the dashboard.
2. **Policy duet** – Run a dry-run of the new policy file and capture the CLI transcript.
3. **Celebration** – Once sentinels confirm adoption, share the results with leadership.

### Commands & Artefacts

```bash
npm run mission-control:ops -- policy apply --file policies/aurora-whisper.yaml --dry-run
```

- Store the transcript in `reports/aurora-whisper/transcript.txt`.
- Append a reflection paragraph to the `Reflection` section of the Mermaid journey diagram.

## Scenario 3 – Celestial Weave Upgrade Wave

**Premise:** A major runtime upgrade introduces collaborative job weaving. Coordinators must usher the release through
sentinel review and broadcast success metrics.

### Beats

1. **Manifest reveal** – Showcase the upgrade Mermaid diagram on the dashboard during the briefing.
2. **Queue & verify** – Use the CLI to queue the bundle and double-check status.
3. **Story capture** – Update the playbook with actual runtimes and marketplace responses.

### Commands & Artefacts

```bash
npm run mission-control:ops -- upgrade --mode queue --proposal upgrade/celestial-weave.json
npm run mission-control:ops -- upgrade --mode status
```

- Collect contract event hashes and paste them into `reports/celestial-weave/events.log`.
- Encourage each participant to write a one-sentence vignette summarizing the experience.

## Using Mermaid & Story Assets

- Extend the dashboard by editing the Mermaid definitions inside
  `apps/mission-control/components/OrchestrationDashboardView.tsx`.
- To render stand-alone diagrams for slides, run:

  ```bash
  npx mermaid --input docs/orchestration/diagrams/orchestration.mmd --output reports/diagrams/orchestration.svg
  ```

  Create the `.mmd` files by copying snippets from the dashboard or inventing new branches.

## Debrief Template

After each session, document the following:

| Field | Notes |
| --- | --- |
| Mission | e.g., Dawn Corridor Surge |
| Date | ISO timestamp |
| Lead Facilitator | Name & contact |
| CLI Commands | Copy/paste from terminal |
| Observations | Key surprises, risk mitigations |
| Story Moments | Memorable quotes, audience reactions |
| Follow-ups | Next steps for engineering or policy |

## Continuing the Narrative

Combine this playbook with `docs/orchestration/mission-control-tutorial.md` to onboard new facilitators. Encourage teams
to contribute additional scenarios—pull requests with new Mermaid diagrams, audio snippets, or script excerpts are welcome.
