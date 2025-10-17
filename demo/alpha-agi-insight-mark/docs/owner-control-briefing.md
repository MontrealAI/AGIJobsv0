# Owner Control Briefing – α-AGI Insight MARK

## 1. Contract Registry

| Contract | Address | Governance Handles |
| --- | --- | --- |
| Insight Access Token (`InsightAccessToken`) | Populate from `insight-recap.json` | `mint`, `pause`, `unpause`, `setSystemPause` |
| Nova-Seed (`AlphaInsightNovaSeed`) | Populate from `insight-recap.json` | `setMinter`, `updateInsightDetails`, `updateSealedURI`, `revealFusionPlan`, `updateFusionPlan`, `pause`, `unpause`, `setSystemPause` |
| Foresight Exchange (`AlphaInsightExchange`) | Populate from `insight-recap.json` | `setOracle`, `setTreasury`, `setPaymentToken`, `setFeeBps`, `updateListingPrice`, `forceDelist`, `pause`, `unpause`, `resolvePrediction`, `setSystemPause` |

## 2. Emergency Procedures

1. **Delegate Sentinel** – Rotate or confirm the SystemPause sentinel via `setSystemPause(address)` on each contract. The sentinel can execute `pause()` during emergencies even if the owner is offline.
2. **Market Halt** – Call `pause()` on the exchange (or instruct the sentinel). This blocks new listings and purchases immediately.
3. **Asset Freeze** – Call `pause()` on the Nova-Seed to prevent transfers/minting. Use `setMinter(address, false)` to revoke agent minters.
4. **Liquidity Freeze** – Call `pause()` on the settlement token to suspend token transfers if treasury risk is detected.
5. **Oracle Override** – Use `setOracle(owner)` to take direct control of prediction resolution during an incident.
6. **Force Custody Transfer** – If a listing must be evacuated (e.g., legal hold), invoke `forceDelist(tokenId, custody)` to move it to a secure wallet while keeping ledger integrity.

## 3. Change Management Template

```
Change Ticket: α-AGI Insight MARK / <date>
Requested By: <name>
Change Summary: <e.g. raise fee from 5% to 6%>
Contracts: <list addresses>
Pre-change Checks:
  - [ ] Tests: npm run test:alpha-agi-insight-mark
  - [ ] Demo dry run: npm run demo:alpha-agi-insight-mark:ci
  - [ ] Telemetry review completed
Execution Steps:
 1. ...
Rollback Plan:
 1. Revert parameter via owner setter
 2. Resume trading once telemetry clears
Approval:
  - Operator
  - Oracle guardian
Evidence Links: insight-manifest.json, transaction hashes
```

## 4. Verification Checklist

- [ ] `insight-manifest.json` hashes verified and stored in evidence vault.
- [ ] `npm run verify:alpha-agi-insight-mark` executed and archived (mirrors CI dossier validation locally).
- [ ] Telemetry log reviewed for anomalies.
- [ ] `insight-control-matrix.json` imported into owner dashboard.
- [ ] `insight-report.html` rendered and archived with the board briefing packet.
- [ ] `insight-owner-brief.md` countersigned for rapid-response command authority.
- [ ] Oracle address verified via `owner:verify-control` tooling.
- [ ] `insight-superintelligence.mmd` reviewed to confirm Meta-Agentic Tree Search + thermodynamic trigger topology matches governance expectations.

## 5. Future Extensions

- Swap the settlement token by calling `setPaymentToken(newToken)` once the new ERC-20 is deployed.
- Route fees to a multisig or treasury module using `setTreasury(multisigAddress)`.
- Chainlink or in-house AI oracle integrations can be layered by configuring `setOracle(oracleContract)`.

Maintaining this briefing ensures every production launch or change adheres to auditable, repeatable owner governance procedures.
