# Owner Command Matrix — α-Dominion

- **Guardian quorum**: 3 of 4 primaries with 2 failover guardians standing by.
- **Emergency pause**: Always armed; single command halts orchestrator actions.
- **Circuit breaker**: 15 minute cooldown on any treasury outflow beyond limits.
- **Unstoppable reserve**: 26% of treasury ring-fenced with owner override rights.
- **Delegation**: Owner can re-route treasury allocations, rotate guardians, and rebind session keys.
- **Account abstraction**: Bundler `meta-dominion-bundler` and paymaster `meta-dominion-paymaster.json` ensure gasless execution.

The owner modifies any parameter using `scripts/owner_controls.py` with the V6 scenario YAML.
