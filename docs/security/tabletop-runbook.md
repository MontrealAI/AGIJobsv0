# Table-top Exercise Runbook

This runbook outlines the response steps for the primary threat scenarios.

## 1. Chain Reorg
1. Detect via EntryPoint finality monitor alert.
2. Immediately pause sponsorships from the Operator Console.
3. Assess affected User Operations and calculate potential loss.
4. Notify protocol engineering to resubmit if safe or compensate users.
5. Resume after 10 finalized blocks and treasury reconciliation.

## 2. RPC Outage
1. Alert: `SponsorshipRejectSpike` due to RPC failures.
2. Switch orchestrator RPC endpoint via Operator Console fallback toggle.
3. Validate success rate recovers within 5 minutes.
4. Open ticket with RPC provider and track SLA.

## 3. IPFS Pin Backlog
1. Alert: IPFS latency warning.
2. Scale IPFS StatefulSet using the console autoscale control.
3. Trigger manual pin job via `ipfs-pin-audit` workflow.
4. Communicate restoration ETA to customer success.

## 4. AA Sponsorship Abuse
1. Alert: WAF / rate limit triggered with high rejection count.
2. Inspect abusive API keys and revoke via Operator Console.
3. Enable stricter rate limiting preset (10 RPS) for affected tenants.
4. File abuse report with on-chain analytics partner.

## Documentation
- Record timeline and decisions in the incident doc.
- Schedule retro within 48 hours to adjust mitigations.
