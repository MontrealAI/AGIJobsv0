# Owner Control Briefing – α-AGI Insight MARK

## 1. Contract Registry

| Contract | Address | Governance Handles |
| --- | --- | --- |
| Insight Access Token (`InsightAccessToken`) | Populate from `insight-recap.json` | `mint`, `pause`, `unpause` |
| Nova-Seed (`AlphaInsightNovaSeed`) | Populate from `insight-recap.json` | `setMinter`, `updateInsightDetails`, `updateSealedURI`, `revealFusionPlan`, `pause`, `unpause` |
| Foresight Exchange (`AlphaInsightExchange`) | Populate from `insight-recap.json` | `setOracle`, `setTreasury`, `setPaymentToken`, `setFeeBps`, `pause`, `unpause`, `resolvePrediction` |

## 2. Emergency Procedures

1. **Market Halt** – Call `pause()` on the exchange. This blocks new listings and purchases immediately.
2. **Asset Freeze** – Call `pause()` on the Nova-Seed to prevent transfers/minting. Use `setMinter(address, false)` to revoke agent minters.
3. **Liquidity Freeze** – Call `pause()` on the settlement token to suspend token transfers if treasury risk is detected.
4. **Oracle Override** – Use `setOracle(owner)` to take direct control of prediction resolution during an incident.

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
- [ ] Telemetry log reviewed for anomalies.
- [ ] `insight-control-matrix.json` imported into owner dashboard.
- [ ] Oracle address verified via `owner:verify-control` tooling.

## 5. Future Extensions

- Swap the settlement token by calling `setPaymentToken(newToken)` once the new ERC-20 is deployed.
- Route fees to a multisig or treasury module using `setTreasury(multisigAddress)`.
- Chainlink or in-house AI oracle integrations can be layered by configuring `setOracle(oracleContract)`.

Maintaining this briefing ensures every production launch or change adheres to auditable, repeatable owner governance procedures.
