# α-AGI MARK Operator Runbook

This runbook explains how a non-technical operator can execute the α-AGI MARK demo, interpret the output, and adapt it for real deployments.

## 1. Preconditions

- Node.js 20.18.1 (automatically installed in CI).
- Project dependencies via `npm install`.
- No running local blockchain required—the Hardhat network boots automatically.

## 2. Execute the Demo

```bash
npm run demo:alpha-agi-mark
```

The script performs:

1. **Compilation** – Hardhat compiles the demo contracts using the dedicated configuration.
2. **Scenario orchestration** – `hardhat run` executes `scripts/runDemo.ts`, which simulates investor activity, compliance enforcement, validator voting, and launch finalisation.
3. **Artefact capture** – console output is stored at `reports/demo-alpha-agi-mark/demo-run.log`.

## 3. Understanding the Output

The console stream is chronological. Key checkpoints:

- `Seed contract` / `α-AGI MARK address` – deployed contract addresses for reproducibility.
- `→ Visionary Strategist buying ...` – investor purchases along the bonding curve.
- `🛡️ Owner exercises pause/unpause` – demonstration of the immediate circuit breaker.
- `📜 Enabling compliance whitelist` – compliance toggles in action.
- `🚫 Attempting to finalise before consensus should fail` – the scripted failure proving validators gate the launch.
- `🔥 Third validator ignites the green flame` – consensus reached.
- `🏛️ Deploying sovereign vault ...` – finalisation with funds transferred to the vault.
- `📊 Owner parameter matrix snapshot` – JSON table summarising the state for audits.

## 4. Key Commands

| Goal | Command |
| --- | --- |
| Run end-to-end orchestration | `npm run demo:alpha-agi-mark` |
| Execute unit tests only | `npm run test:alpha-agi-mark` |
| Compile contracts (no run) | `npx hardhat compile --config demo/alpha-agi-mark/hardhat.config.ts` |
| Inspect owner controls | Search for `Owner parameter matrix snapshot` in the demo log |

## 5. Adapting for Testnet/Mainnet

1. Export RPC URL and deployer key: `export AAM_RPC_URL=...` and `export AAM_PRIVATE_KEY=...`.
2. Extend `hardhat.config.ts` network settings to include a named network (e.g., `aamSepolia`).
3. Run the demo with the network flag: `npx hardhat run --network aamSepolia --config demo/alpha-agi-mark/hardhat.config.ts demo/alpha-agi-mark/scripts/runDemo.ts`.
4. Validate outputs and collect logs as with the local run.

## 6. Troubleshooting

| Symptom | Resolution |
| --- | --- |
| `HH700 Artifact ... not found` | Run `npx hardhat compile --config demo/alpha-agi-mark/hardhat.config.ts` before executing scripts. |
| `Seed not validated` on finalisation | Ensure the validator accounts listed in `runDemo.ts` cast approvals or use `ownerValidateSeed`. |
| Whitelist rejections | Confirm `setWhitelistEnabled(true)` and `setWhitelistBatch([...], true)` executed for the buyer. |
| Need to re-run from scratch | Delete `reports/demo-alpha-agi-mark` and execute the demo again. |

## 7. Compliance Checklist

- ✅ Owner can pause/unpause and abort the launch instantly.
- ✅ Owner can enforce address-level whitelists.
- ✅ Validator threshold is adjustable without redeploying.
- ✅ Owner override is available for emergency validation.
- ✅ Post-launch funds reside in an owner-controlled sovereign vault.

Keep this runbook with the project so stakeholders can verify that α-AGI MARK is always under deliberate owner control.
