# ENS Identity Enforcement Policy

All participation in AGIJobs requires on‑chain proof of ENS subdomain ownership. This policy ensures agents and validators cannot bypass identity checks.

## Requirements

- **Agents** must own an ENS subdomain under `agent.agi.eth` and present it when applying for or submitting jobs.
- **Validators** must own a subdomain under `club.agi.eth` for committing or revealing validation results.
- Owner controlled allowlists and Merkle proofs exist only for emergency governance and migration. Regular participants are expected to use ENS.
- Attestations may be recorded in `AttestationRegistry` to cache successful checks and reduce gas usage, but they do not bypass the ENS requirement.

## Testing

Run these commands before pushing changes that touch identity or access control logic:

```bash
npm run lint
npm test
# optionally target identity tests directly
npx hardhat test test/v2/identity.test.ts
```

These tests exercise the ENS verification paths in `IdentityRegistry`, `JobRegistry` and `ValidationModule`, preventing regressions that could allow unverified addresses.
