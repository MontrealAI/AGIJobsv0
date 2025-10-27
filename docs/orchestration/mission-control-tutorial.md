# Mission Control Tutorial for Non-Technical Operators

This tutorial walks facilitators, producers, and domain experts through the complete lifecycle of deploying and
operating the AGI Jobs orchestration fabric without requiring deep engineering background. Pair these steps with the new
Orchestration Mission Console UI and CLI wrappers for a cohesive control center.

## 1. What you will launch

- **Shard fabric** – the compute shards that run job flows and host validator swarms.
- **Marketplace nodes** – specialized contractors that join on demand to amplify specific missions.
- **Policy sentinels** – automated reviewers that make sure upgrades, prompts, and incentives remain aligned with safety
  guardrails.

All of the required automation is prepackaged; your role is to review prompts, narrate the story, and confirm policy
choices.

## 2. Quickstart checklist

1. Install project dependencies (one time):

   ```bash
   npm install
   ```

2. Open the dashboard from `apps/mission-control`:

   ```bash
   npm run dev --prefix apps/mission-control
   ```

3. In a second terminal, open the guided CLI help:

   ```bash
   npm run mission-control:ops -- --help
   ```

4. Keep this tutorial open while you work; it mirrors the UI sections and command groups.

## 3. Deploying the fabric

The `deploy` command provisions the contract stack, warms up the shards, and verifies observability.

```bash
npm run mission-control:ops -- deploy --network sepolia
```

- **Why sepolia?** It is the safest sandbox resembling production.
- The command prints each step. If you want a rehearsal without changing anything, append `--dry-run`.
- After success, the dashboard will show green “Nominal” badges for active shards.

## 4. Negotiating marketplace support

Once the fabric is live, review the **Node Marketplace Pulse** section in the dashboard. Each card highlights:

- Specialization (e.g., narrative QA amplification).
- Credibility rating.
- Slot price and estimated arrival time.

Use the CLI when you need scripted negotiations:

```bash
npm run mission-control:ops -- deploy --network sepolia --with-telemetry=false
```

Skipping the telemetry step accelerates rehearsal environments where you only need fresh nodes.

## 5. Managing upgrade waves

Safety sentinels require approval before new runtime code lands. The dashboard visualizes the handshake, and the CLI wraps
internal scripts:

```bash
# Queue the upgrade defined in upgrade/proposal.json
npm run mission-control:ops -- upgrade --mode queue --proposal upgrade/proposal.json

# Review status without applying changes
npm run mission-control:ops -- upgrade --mode status

# Broadcast a tested bundle (rare, requires sign-off)
npm run mission-control:ops -- upgrade --mode apply
```

If you only want to brief leadership, run `--dry-run` to print the flow without executing it.

## 6. Updating policies with confidence

Policies influence how agents adjudicate edge cases. Follow this ritual:

1. Render current blueprints for your briefing deck:

   ```bash
   npm run mission-control:ops -- policy render
   ```

2. Dry-run a new policy file to see console output and sentinel reactions:

   ```bash
   npm run mission-control:ops -- policy apply --file policies/diplomacy.yaml --dry-run
   ```

3. When everyone approves, re-run without `--dry-run` to apply.

4. Archive the audit transcript:

   ```bash
   npm run mission-control:ops -- policy audit
   ```

## 7. Story-driven rehearsals

The **Story-driven Operational Scenarios** accordion inside the dashboard links to narrative-rich playbooks. For every
scenario:

1. Launch the recommended CLI command.
2. Narrate the experience—use the prompts and cues embedded in the doc.
3. Capture outcomes inside the playbook for institutional memory.

## 8. Troubleshooting cues

- **Shard shows “Degraded”** – verify load metrics, then consider pausing new jobs or onboarding an additional node.
- **Upgrade script fails** – review the CLI output; it will point to the exact underlying script that returned a non-zero
  exit code.
- **Policy command cannot find a file** – confirm the relative path from the repository root and ensure the file exists.

## 9. Where to go next

- Read `docs/orchestration/scenarios/superintelligence-playbook.md` for immersive mission storyboards.
- Customize marketplace, shard, and storytelling data by editing `apps/mission-control/data/orchestration/dashboard.json` (changes are picked up by the API route and UI automatically).
- Share feedback via the operations Slack channel so engineering can improve presets.

With the dashboard, CLI, and narrative playbooks, non-technical teams can confidently orchestrate superintelligent
workloads while staying grounded in safety and storytelling best practices.
