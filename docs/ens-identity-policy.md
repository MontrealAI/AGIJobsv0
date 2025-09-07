# ENS Identity Enforcement Policy

All participation in AGIJobs requires on‑chain proof of ENS subdomain ownership. This policy ensures agents and validators cannot bypass identity checks.

## Requirements

- **Agents** must own an ENS subdomain under `agent.agi.eth` and present it when applying for or submitting jobs.
- **Validators** must own a subdomain under `club.agi.eth` for committing or revealing validation results.
- Owner controlled allowlists and Merkle proofs exist only for emergency governance and migration. Regular participants are expected to use ENS.
- Attestations may be recorded in `AttestationRegistry` to cache successful checks and reduce gas usage, but they do not bypass the ENS requirement.

## Temporary allowlisting

In rare emergencies governance may temporarily bypass the ENS requirement by
calling `IdentityRegistry.addAdditionalAgent` or `addAdditionalValidator`. Each
entry should specify an expiration plan and be removed once the issue is
resolved. The registry emits `AdditionalAgentUsed` and `AdditionalValidatorUsed`
with the subdomain label whenever these bypasses are exercised, enabling
off-chain monitoring.

Governance should review these events and regularly clear expired allowlist
entries. Run `npx ts-node --compiler-options '{"module":"commonjs"}'
scripts/v2/auditIdentityRegistry.ts --network <network>` to print active
overrides and pass `--clear` to remove them on-chain after review.

## Testing

Run these commands before pushing changes that touch identity or access control logic:

```bash
npm run lint
npm test
# optionally target identity tests directly
npx hardhat test test/v2/identity.test.ts
```

These tests exercise the ENS verification paths in `IdentityRegistry`, `JobRegistry` and `ValidationModule`, preventing regressions that could allow unverified addresses.
