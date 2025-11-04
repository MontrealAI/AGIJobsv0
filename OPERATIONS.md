# OPERATIONS (AGI Jobs v0 – v2)

## Local quick check (no configuration changes)
1. Install Node 20 (see `.node-version`) and Foundry.
2. `npm ci`
3. `npm run lint --if-present`
4. `npm run typecheck --if-present`
5. `npm run build --if-present`
6. `npm test --if-present -- --ci`
7. `forge build --build-info && forge test -vvv`

## CI/PR policy (enforced)
- All PRs must be green on:
  - CodeQL, Slither, Scorecard, SBOM, Provenance
  - Node lint/type/build/test/audit
  - Foundry fmt/build/test/gas
  - solhint (advisory)
- `npm audit --audit-level=high` must pass.
