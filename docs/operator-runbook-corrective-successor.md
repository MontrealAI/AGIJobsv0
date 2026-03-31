# Operator Runbook — Corrective Successor

## Economic truth
- Employer funds payout escrow and burn at create time.
- Burn is not escrow.
- Burn is not protocol revenue.
- AGIALPHA burned during job creation is permanently removed from circulation and is not received by the protocol, its owner, or any third party. The protocol does not derive revenue from this burn.
- Users are solely responsible for any tax consequences arising from token burns, transfers, or usage.

## Live AGI surplus withdrawal
Use `withdrawAGI(amount)` while unpaused. It is bounded by `withdrawableAGI()` and cannot consume escrow or locked bonds.
