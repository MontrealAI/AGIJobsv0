# One-Box Orchestrator Overview

The one-box initiative wraps the AGI Jobs v2 modules behind a natural-language orchestration layer. The goal is to let an operator type a single instruction, receive clarifying questions when the request is ambiguous, and have the platform execute the full lifecycle through guarded adapters.

This document captures the shared contract between the planner (LLM or meta-agent) and the execution adapters that bridge into the deployed contracts.

## Intent Constraint Schema (ICS)

The planner must emit a JSON object that satisfies the [`IntentConstraintSchema`](../../packages/onebox-orchestrator/src/ics/schema.ts). The schema is validated with [`zod`](https://github.com/colinhacks/zod) to guarantee:

- only supported intents are produced;
- amounts are encoded as positive decimal strings (no implicit unit conversions);
- confirmations for token-moving actions include a ≤140 character natural-language summary;
- optional metadata—trace identifiers, planner model versions—are propagated end-to-end for observability.

If an LLM produces an object that fails validation, the orchestrator returns a structured error and the chat surface prompts the user for clarification instead of guessing.

## Planner client

`PlannerClient` (see [`packages/onebox-orchestrator/src/planner/client.ts`](../../packages/onebox-orchestrator/src/planner/client.ts)) calls into the Meta-Agent orchestrator exposed by `AGI-Alpha-Agent-v0`. It wraps the HTTP call with:

- configurable timeouts (default 15 seconds);
- bearer-token authentication support;
- ICS validation before dispatching any tool.

Timeouts or malformed replies surface as `PlannerClientError` instances that the UI can translate into user-friendly chat messages.

## Tool registry

Execution adapters are registered per intent through [`ToolRegistry`](../../packages/onebox-orchestrator/src/router/registry.ts). The registry supplies a default "not implemented" handler for any intent without a concrete adapter so we can enable the conversational surface before all blockchain integrations are in place.

Each handler receives the validated ICS envelope and a `ToolExecutionContext` containing chain configuration and optional identity metadata (ENS name, address). Handlers return a `ToolResponse` that the chat surface can render to the user, including friendly error messaging if a policy gate (stake, ENS ownership, spend caps) fails.

## Next steps

- Wire ERC-4337 or relayer signing into the `ToolExecutionContext`.
- Implement the concrete adapters for job creation, staking, validation, and settlement using the v2 ABIs.
- Extend the CI workflow with forked-chain integration tests once adapters are available.
