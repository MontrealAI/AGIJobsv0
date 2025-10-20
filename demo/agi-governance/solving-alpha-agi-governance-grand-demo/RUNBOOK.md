# Command Deck Runbook

This runbook lets a policy operator execute the entire Solving α-AGI Governance Command Deck without touching Solidity or backend code. Follow each numbered block exactly.

## 1. Prime the mission charter

1. Open [`demo/agi-governance/config/mission@v2.json`](../config/mission@v2.json).
2. Confirm the `ownerControls.owner` address matches the multisig or EOAs that will run production operations.
3. Update the `blockchain` section to point at your chosen network (Hardhat, Sepolia, or Mainnet). No other edits are required.

## 2. Generate dossiers & dashboards

1. From the repository root run:

   ```bash
   npm run demo:agi-governance:iconic
   ```

   The script executes:

   * Hamiltonian, statistical physics, and game-theoretic calculations.
   * Jarzynski free-energy derivation and antifragility tensor checks.
   * Risk, owner coverage, and CI enforcement summaries.

2. Review the generated artefacts:

   * `demo/agi-governance/reports/command-deck-report.md`
   * `demo/agi-governance/reports/command-deck-dashboard.html`
   * `demo/agi-governance/reports/command-deck-summary.json`

   These can be shared directly with leadership or auditors.

## 3. Verify CI enforcement

1. Run the guardian check to make sure V2 CI gates are enforced:

   ```bash
   npm run demo:agi-governance:iconic:ci
   ```

   This command fails if branch protections, workflow enforcement, or coverage guards are missing.

## 4. Owner diagnostics

1. Execute the owner readiness aggregator:

   ```bash
   npm run demo:agi-governance:iconic:owner
   ```

   The output lists every pause switch, upgrade lever, treasury control, and verification hook. Errors or warnings indicate a missing safeguard that must be addressed before launch.

## 5. Launch the Command Deck UI

1. Start the Enterprise Portal in a new terminal:

   ```bash
   cd apps/enterprise-portal
   npm run dev
   ```

2. Browse to [http://localhost:3000/agi-governance/command-deck](http://localhost:3000/agi-governance/command-deck).
3. Connect the owner wallet. The UI immediately displays:

   * Mission metrics sourced from `mission@v2.json`.
   * Validator orchestration cards for commit/reveal, finalize, and antifragility fuzzing.
   * Owner control panel with pause/unpause, quorum tuning, and upgrade queueing.

## 6. Execute the validator rehearsal

1. Use the **Validator Commit** card to record commits. Salts are auto-generated and stored in `localStorage` under `command-deck.salts.v1`.
2. Use **Reveal Validation** to publish reveals. The UI loads previously stored salts automatically.
3. Trigger **Finalize Job** to clear the mission once validators agree.
4. Run the **Antifragile Shock Test** to introduce controlled perturbations; confirm the welfare metric increases as reported.

## 7. Owner emergency drill

1. In the owner panel, press **Pause Protocol**. Observe the resulting transaction call (displayed for record keeping).
2. Press **Queue Upgrade** to schedule a configuration change. The UI enforces the timelock window defined in the mission file.
3. Press **Resume Protocol** after verifying the pause took effect on-chain.

## 8. Archive artefacts

1. Copy the Markdown and HTML dossiers into your knowledge base.
2. Export the dashboard from the UI via the **Download Mission Dashboard** button.
3. Store CI and owner diagnostic logs as audit evidence.

You have now executed the entire α-AGI governance mission from the repository without custom code. Repeat as needed for other networks by updating the mission file.
