# CULTURE Demo Automation Suite

The CULTURE toolkit ships with a set of Hardhat/TypeScript scripts that automate deployment, configuration, and analytics seedi
ng.

| Script | Purpose |
| --- | --- |
| `deploy.culture.ts` | Deploys `CultureRegistry` and `SelfPlayArena`, writes the resulting addresses to `config/deployments.loc
al.json`, and patches `.env` so downstream services can boot without manual edits. |
| `owner.setParams.ts` | Applies owner-governed parameters (allowed artifact kinds, citation limits, arena rewards, committee si
ze, and thermostat targets) from `config/culture.json`. |
| `owner.setRoles.ts` | Grants author/teacher/student/validator roles in the identity registry and whitelists orchestrator addre
sses. |
| `register.contracts.ts` | Verifies deployed contract bytecode on the target RPC and records the addresses in `config/culture.jso
n`. |
| `seed.culture.ts` | Mints the sample artifacts defined in `data/seed-artifacts.json` and primes the indexer via its admin API. |
| `export.weekly.ts` | Generates reproducible weekly reports from the JSON exports in `data/analytics/`, writing Markdown files
 to `reports/`. |

All scripts validate environment variables with `zod` and are idempotent—they skip updates when the on-chain state already matc
hes the desired configuration. Run them through Hardhat to reuse the configured accounts and RPC settings:

```bash
npx hardhat run demo/CULTURE-v0/scripts/deploy.culture.ts --network localhost
npx hardhat run demo/CULTURE-v0/scripts/owner.setParams.ts --network localhost
npx hardhat run demo/CULTURE-v0/scripts/owner.setRoles.ts --network localhost
npx hardhat run demo/CULTURE-v0/scripts/seed.culture.ts --network localhost
```

The reporting export can be executed with `npm exec ts-node --project tsconfig.json demo/CULTURE-v0/scripts/export.weekly.ts` o
r via the `culture-reports` compose profile.
