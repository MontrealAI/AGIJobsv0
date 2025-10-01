# Policy Playbook

The policy playbook defines how we evaluate sponsorship requests, attestations, and treasury risk.

## Chain Support Policy
- **Primary chains**: Ethereum mainnet, Base mainnet, Base Sepolia.
- **New chain requests** must include: audited EntryPoint contract, RPC with 99.9% uptime SLO, and supported paymaster funding rails.
- Submit requests via the Governance board. The SRE lead signs off on capacity; Security validates chain risk.

## Sponsorship Approval Policy
1. **Automated checks**
   - Orchestrator enforces CORS and request size limits.
   - WAF (Cloud Armor) blocks known-abusive IPs.
   - Rate limits default to 20 RPS / 50 burst per API key.
2. **Manual review triggers**
   - Sponsored value above $5,000 in a rolling hour.
   - New smart account without prior attestations.
   - Rejection rate > 10% in past 30 minutes.
3. **Manual review workflow**
   - Open the Operator Console → Requests → Review queue.
   - Evaluate the EAS attestation metadata and Graph Node subgraph state.
   - Approve or deny; reasons are logged for audit.

## Treasury Risk Policy
- Maintain a minimum treasury runway of 72 hours at the current sponsorship burn rate.
- Finance receives alerts when the treasury dips below $200.
- Emergency pause can be enacted by any on-call engineer.

## Attestation Policy
- All attestations must reference the canonical schema UID stored in `global.eas.schemaUid`.
- Attester pods read keys only via the KMS CSI volume; manual key rotation happens weekly.

## Incident Response
- Follow the table-top runbook documented in `docs/security/tabletop-runbook.md`.
- Ensure postmortems are completed within 72 hours.
