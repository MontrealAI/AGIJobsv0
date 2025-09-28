# Orchestrator ↔ One-Box Call Graph

This document captures the runtime call graph between the TypeScript
meta-orchestrator (`packages/orchestrator/src/llm.ts`), the FastAPI One-Box
service (`routes/onebox.py`), and the new gRPC/HTTP alpha bridge. It also defines
the JSON envelopes that flow between planner, simulator, and execution layers so
client and server implementations can share a single contract.

## 1. End-to-end sequence

```mermaid
sequenceDiagram
  actor U as User chat
  participant ORCH as planAndExecute()
  participant BRIDGE as alpha-bridge (gRPC)
  participant BOX as /onebox routes
  participant CHAIN as Tool router

  U->>ORCH: message, history
  ORCH->>ORCH: detect confirmations & ensure userId
  ORCH->>BRIDGE: PlanRequest (gRPC)
  BRIDGE->>BOX: POST /plan (JSON)
  BOX-->>BRIDGE: Plan payload (intent, planHash, requiresConfirmation)
  BRIDGE-->>ORCH: PlanResponse (plan JSON, consent token)
  ORCH->>ORCH: ask clarification? / prompt for consent
  ORCH->>BRIDGE: ExecuteRequest (gRPC)
  BRIDGE->>BOX: POST /execute (JSON)
  BOX-->>BRIDGE: Execute payload (job status / tx receipts)
  BRIDGE-->>ORCH: ExecuteResponse (receipt JSON)
  ORCH-->>CHAIN: route(ICS)
  CHAIN-->>U: streamed execution events
```

### Planner responsibilities

* `planAndExecute` resolves user identity, confirmations, and pending intents
  before emitting any network calls.【F:packages/orchestrator/src/llm.ts†L24-L111】
* When an action requires consent, it caches the intent under a trace identifier
  so follow-up “yes/no” answers can be correlated later.【F:packages/orchestrator/src/llm.ts†L120-L178】
* Confirmation or decline decisions short-circuit and never hit downstream
  services, keeping the planner responsible for user-facing guardrails.【F:packages/orchestrator/src/llm.ts†L30-L74】

### One-Box API responsibilities

* `/plan` converts free-form text into an intent, summary, plan hash, and missing
  fields. It records timing metadata and emits warnings or blockers as needed.【F:routes/onebox.py†L1739-L1809】
* `/simulate` replays the canonical hash, checks policies, and returns blockers
  or a ready-to-execute summary; `/execute` enforces the same hash, applies
  policy checks, and either produces wallet instructions or relayed receipts.【F:routes/onebox.py†L1813-L2130】
* Both endpoints log correlation identifiers, emit Prometheus metrics, and reuse
  cached plan metadata so retries remain idempotent.【F:routes/onebox.py†L1747-L1779】【F:routes/onebox.py†L2015-L2088】

## 2. Shared payload contract

The planner, bridge, and FastAPI service now share a stable JSON structure. All
payloads ride inside the envelopes shown below.

### 2.1 Planner → Bridge (gRPC `Plan`)

```proto
message PlanRequest {
  string utterance = 1;           // User prompt
  string history_json = 2;        // Optional JSON array of prior turns
  string trace_id = 3;            // Stable correlation id
  bool require_consent = 4;       // Planner-side expectation
  string consent_token = 5;       // Sticky token for follow-up confirmations
  map<string, string> metadata = 6; // Arbitrary tags (role=employer, etc)
}
```

The bridge converts this request into:

```json
{
  "input": { "text": "Create a job…" },
  "history": [...],
  "meta": {
    "traceId": "trace-employer",
    "consent": { "required": true, "token": "consent-create" },
    "tags": { "flow": "employer_create_job", "stage": "plan" }
  }
}
```

HTTP headers carry the same metadata so legacy services that rely on header-only
propagation continue to work:

```
x-agi-trace-id: trace-employer
x-agi-require-consent: true
x-agi-consent-token: consent-create
x-agi-meta-flow: employer_create_job
x-agi-meta-stage: plan
```

### 2.2 Bridge → Planner (gRPC `PlanResponse`)

```proto
message PlanResponse {
  string plan_json = 1;        // Canonical intent + steps JSON string
  string trace_id = 2;         // Echoed or upgraded trace id from upstream
  bool requires_consent = 3;   // Server-detected consent requirement
  string consent_token = 4;    // Sticky token to reuse during Execute
}
```

The `plan_json` blob mirrors the One-Box payload and contains
`intent`, `steps`, and `planHash` fields returned by `/plan`. The planner stores
that JSON alongside the cached trace id for future confirmations.

### 2.3 Planner → Bridge (gRPC `Execute`)

```proto
message ExecuteRequest {
  string plan_json = 1;          // Exact blob returned by PlanResponse
  string trace_id = 2;           // Same correlation id
  bool consent_granted = 3;      // Whether the user confirmed
  string consent_token = 4;      // Token from PlanResponse
  map<string, string> metadata = 5; // Optional stage tags
}
```

The bridge turns this into:

```json
{
  "plan": { ... },
  "meta": {
    "traceId": "trace-employer",
    "consent": { "granted": true, "token": "consent-create" },
    "tags": { "flow": "employer_create_job", "stage": "execute" }
  }
}
```

HTTP headers now express consent decisions explicitly:

```
x-agi-trace-id: trace-employer
x-agi-consent-granted: true
x-agi-consent-token: consent-create
x-agi-meta-flow: employer_create_job
x-agi-meta-stage: execute
```

### 2.4 Bridge → Planner (gRPC `ExecuteResponse`)

```proto
message ExecuteResponse {
  string receipt_json = 1;  // Job status, transaction receipts, etc.
  string trace_id = 2;      // Mirrors upstream response trace id
}
```

The receipt blob is the raw body returned by `/execute` (job id, transaction
hashes, receipt artifacts) so the orchestrator can stream updates directly to
clients.

## 3. Canonical flows exercised in tests

Integration tests replay the canonical flows from
`docs/onebox-sprint.md`: employer job creation, agent application, and validator
finalization. Each flow asserts that:

1. Planner metadata survives the gRPC hop and lands in HTTP headers.
2. Consent flags and tokens remain consistent across plan and execute calls.
3. Receipts echo the upstream trace id so follow-up confirmations can be matched
   against cached intents.

See `services/alpha-bridge/test/alpha-bridge.test.js` for full coverage of these
flows and the HTTP assertions enforced by the stub AGI-Alpha agent.【F:services/alpha-bridge/test/alpha-bridge.test.js†L1-L227】

## 4. Operational notes

* The bridge can bind to any address via `ALPHA_BRIDGE_BIND` and defaults to
  `ALPHA_AGENT_URL=http://localhost:8080` when no upstream is specified.【F:services/alpha-bridge/src/server.js†L146-L210】
* All JSON parsing failures raise gRPC `INVALID_ARGUMENT` so clients receive
  immediate feedback before an upstream roundtrip.【F:services/alpha-bridge/src/server.js†L42-L104】【F:services/alpha-bridge/src/server.js†L213-L254】
* Upstream HTTP status codes are mapped onto canonical gRPC errors (400 →
  `INVALID_ARGUMENT`, 422 → `FAILED_PRECONDITION`, 5xx → `UNAVAILABLE`) to keep
  retries and client telemetry consistent.【F:services/alpha-bridge/src/server.js†L20-L100】
