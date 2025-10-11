# On-chain Monitoring Playbook

Institutional deployments must detect governance or parameter changes in
minutes. This playbook ties OpenZeppelin Defender Sentinels (or Forta bots) to
incident response procedures so the contract owner retains full control over the
protocol knobs.

## Sentinel Coverage

The JSON templates under `monitoring/onchain/` cover the following critical
surfaces and can now be rendered automatically with production addresses.

| Template | Watches | Recommended Action |
| --- | --- | --- |
| `pause-governance-sentinel.json` | `Paused`, `Unpaused`, owner transfers, timelock proposer/executor changes | Trigger the System Pause runbook and confirm the owner multisig initiated the action. |
| `parameter-change-sentinel.json` | `SetFeePct`, `SetBurnPct`, `SetTaxPolicy`, `SetValidatorRewardPct`, `SetTreasury` | Page the owner control team to verify the change ticket and reconcile the new values. |
| `role-rotation-sentinel.json` | `PauserUpdated`, `PauserManagerUpdated`, `PausersUpdated`, `ValidatorLockManagerUpdated` | Kick off the key rotation checklist and update the owner control atlas. |

Each template specifies the ABI signature, matching topics, throttling window,
and the notification targets. Render concrete JSON with:

```bash
# Provide either a release manifest or an address map (copy the sample file).
cp monitoring/onchain/address-map.sample.json monitoring/onchain/address-map.mainnet.json
${EDITOR:-nano} monitoring/onchain/address-map.mainnet.json  # fill in contract addresses

npm run monitoring:sentinels -- \
  --network mainnet \
  --map-file monitoring/onchain/address-map.mainnet.json \
  --manifest reports/release/manifest.json
```

The command writes fully resolved sentinels to
`monitoring/onchain/rendered/<network>/...` and validates that all placeholders
are populated with checksum addresses. Import the rendered JSON into Defender
via “Create Sentinel → Advanced JSON” or point a Forta bot at the same filters.

> **Continuous validation** – CI now runs `npm run monitoring:validate` to prove
> every sentinel template resolves against the latest deployment artefacts.
> Run the command locally after touching `deployment-config`, `docs/deployment-*`
> files, or the sentinel JSON to fail fast on missing placeholders or event
> signatures.

## Alert Routing

1. Provision a Defender Relayer with access to the operations Slack or PagerDuty
   webhook.
2. Create a notification channel per severity:
   - **Critical**: pauses, owner transfers, timelock mutations.
   - **High**: fee/tax parameter updates, validator reward changes.
   - **Medium**: role grants/revokes, committee reshuffles.
3. Map each sentinel template to the relevant channel. Defender includes the
   triggering address and transaction hash in the payload so the response team
   can pivot directly to the on-chain action.

## Integration with Runbooks

- Link the notification body to the appropriate owner runbook (for example
  `docs/owner-control-emergency-runbook.md` for pauses and
  `docs/owner-control-change-ticket.md` for parameter updates).
- Use the sentinel metadata to populate the change ticket when verifying the
  owner’s approval workflow.
- After each alert, record the outcome in `docs/owner-control-pulse.md` to keep
  a tamper-evident audit trail.

## Testing & Tabletop Exercises

1. Deploy the sentinels to a staging network and trigger each event with a
   burner account. Confirm the alert fires once and routes correctly.
   Re-run `npm run monitoring:sentinels` whenever deployment addresses change to
   guarantee monitoring fidelity.
2. Run the tabletop exercise described in `docs/incident-response.md` using the
   sentinel payloads as injects. Validate that the owner multisig, pause keys,
   and dispute committee members can all reach the required quorums within the
   SLA.
3. Capture screenshots/logs of the alerts and attach them to `docs/security/` so
   auditors can verify the controls were exercised.

Keeping these sentinels active and rehearsed closes the gap identified in the
institutional readiness review: real-time monitoring of governance changes.
