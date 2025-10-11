# Incident Response Tabletop Validation

This guide operationalises the "tabletop validation cadence" referenced across the
monitoring and incident-response playbooks. It gives the contract owner and the
non-technical incident commander a repeatable process to rehearse emergency
controls after every tagged release.

## Objectives

1. **Verify emergency controls** – Demonstrate that the Safe/Timelock pause,
   owner command suite, and incident paging flows remain functional.
2. **Exercise monitoring integrations** – Ensure Defender Sentinels, Forta bots,
   and Prometheus/Alertmanager escalate real on-chain events inside five minutes.
3. **Prove documentation accuracy** – Walk through `docs/incident-response.md`,
   `docs/security/onchain-monitoring.md`, and the new Slither SARIF workflow so
   that the team confirms procedures match the deployed automation.

## Preparation checklist (T-7 days)

- [ ] Schedule a 90-minute tabletop window with the Incident Commander (IC),
      Technical Lead (TL), Communications (COMMS), and Treasury representative.
- [ ] Export the latest signed release bundle and SBOM from the `release`
      workflow artefacts. Store them in the incident exercise folder.
- [ ] Run `npm run owner:snapshot` on a forked network to capture the baseline
      module state used for comparison during the drill.
- [ ] Trigger the `static-analysis` workflow on a staging branch to confirm the
      Slither SARIF upload appears in the GitHub "Security" tab. Capture the
      job URL for the exercise notes.

## Exercise script (T-day)

1. **Inject scenario** – Facilitator describes a Forta alert detecting an
   unauthorised `pause()` call on `StakeManager`.
2. **Monitoring validation** – Ops engineer opens Defender Sentinel, verifies
   the alert payload, and posts the link into the incident chat.
3. **Command execution** – TL runs `npm run owner:emergency` in dry-run mode and
   presents the generated Safe transaction for multi-sig approval. Treasury
   confirms signers are reachable.
4. **Forensics bundle** – FORENSICS exports the latest Slither SARIF artefact
   (`reports/security/slither.sarif`) and validates that findings are triaged in
   the GitHub Security tab. Any `High` severities must be resolved or waived
   prior to concluding the drill. Confirm that `tools/security/slither-allowlist.json`
   reflects the current approved exceptions; the CI gate refuses merges if a
   high-severity issue is absent from that reviewed allowlist.
5. **Comms dry-run** – COMMS drafts the SEV-1 holding statement using the
   template in `docs/incident-response.md` §7 and circulates it for approval.
6. **Debrief** – Capture timing, gaps, and tool issues. Update `docs/incident-response.md`
   with lessons learned and ticket action items for backlog tracking.

## Success criteria

- All critical contacts acknowledged the page within 5 minutes.
- Pause tooling produced a valid Safe bundle and owners confirmed signer
  availability.
- Monitoring dashboards showed correlated Forta, Defender, and Prometheus
  alerts.
- Slither SARIF artefact uploaded successfully to GitHub, demonstrating that the
  static-analysis workflow is running green.
- Post-exercise report stored in the compliance archive alongside the release
  provenance attestation.

## Automated evidence capture (new)

Use the catalogued scenarios in
`docs/security/incident-response-scenarios.json` to generate a fully
templated tabletop packet before every rehearsal:

```bash
# Discover available exercises
npm run incident:tabletop -- --list

# Generate a markdown plan and evidence checklist for the validator scenario
npm run incident:tabletop -- --scenario validator-compromise \
  --out reports/incident-tabletop/$(date +%Y%m%d)-validator.md
```

The generator validates the scenario schema, resolves the latest catalog
version, and writes an auditable plan containing:

- Step-by-step action flow with target durations and command references.
- Evidence artefact checklist aligned with compliance expectations.
- Post-exercise reflection prompts for the retrospective meeting.

Save the rendered file in the incident exercise archive together with
screenshots, Safe transaction hashes, and monitoring exports. This produces
objective proof that the quarterly drills executed against the exact
institutional requirements captured in the readiness rubric.

## Follow-up (T+7 days)

- [ ] Close or track remediation tickets spawned during the exercise.
- [ ] Rotate the tabletop scenario (e.g., validator slashing, treasury drain) so
      the next rehearsal covers a different failure mode.
- [ ] Confirm that documentation updates were merged and referenced in the
      `OWNER_CONTROL` index so the operator handbook stays authoritative.

Maintaining this cadence satisfies the "monitoring & incident response" control
in the institutional readiness rubric and creates auditable evidence that the
team can execute emergency procedures under pressure.
