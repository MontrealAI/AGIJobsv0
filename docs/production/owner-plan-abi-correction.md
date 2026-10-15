# PlatformRegistry owner-plan ABI correction

`buildPlatformRegistryPlan` produced an `applyConfiguration` tuple without the current contract's `setPauserManager` and `pauserManager` components. Encoding a real planned transaction failed before submission. The old test expected eight individual calls and did not execute the actual atomic plan.

The planner now reads the current manager, includes both tuple components, preserves it when no change was requested, and supports an explicit configured update or removal. The configuration loader/type now validates that address. No owner, pauser, contract, token policy or live setting is changed by creating a plan.

The replacement regression retains all eight original configuration outcomes and executes the generated atomic call against the real local PlatformRegistry. It verifies every resulting module, minimum stake, pauser, registrar and blacklist value, plus preservation of the existing pauser manager. A separate case exercises explicit manager update, removal and an unchanged no-op. The adjacent governance pause regression now checks OpenZeppelin's actual `EnforcedPause` error. All seven focused tests pass. CI now explicitly runs these TypeScript regressions; no assertion or security/coverage threshold is reduced.

This is separate from the percentage-stake economic candidate and demo/release aggregate. It requires exact-head hosted qualification and review before merge. No mainnet transaction or persistent host setting was changed.
