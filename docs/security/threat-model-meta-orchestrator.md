# Meta-Orchestrator Threat Model (March 2025)

This document captures a manual assessment of the AGI Jobs meta-orchestrator and
operator UI following the introduction of new rate-limiting, CSRF protection, and
privacy controls. It focuses on the attack surfaces most relevant to the
CULTURE deployment profile.

## System Overview

* **API surface** – FastAPI service exposed via `services/meta_api/app/main.py`
  and mounted routers under `routes/`.
* **Operator console / UI** – Express one-box server at
  `apps/orchestrator/oneboxRouter.ts` that brokers planner/runner calls and
  persists receipts on disk (`apps/orchestrator/receiptStore.ts`).
* **Critical secrets** – API tokens, relayer private keys, SSO credentials, and
  optional receipt-encryption keys (see `docs/security/secrets-rotation.md`).

The threat scenarios below track the most sensitive assets and the controls now
in place to protect them.

## Relayer Compromise

*Impact*: An attacker with the relayer key could submit fraudulent transactions,
interfere with planner approval flow, or leak user deliverables.

*Mitigations*:

1. **Strict rate limiting** – Requests to `/onebox/*` now pass through an
   in-memory sliding-window rate limiter that keys on API token and client IP to
   throttle credential stuffing and replay attempts before they reach the
   signing stack (`services/meta_api/app/main.py`,
   `apps/orchestrator/oneboxRouter.ts`).
2. **CSRF tokens for browser clients** – The UI sets a `onebox_csrf_token`
   cookie and requires the matching `X-CSRF-Token` header on state-changing
   calls, preventing attackers from exercising the relayer via a victim’s
   browser session.
3. **Secrets rotation & storage** – Relayer keys are rotated per the process in
   `docs/security/secrets-rotation.md`, ensuring suspected compromises can be
   contained without downtime.
4. **Privacy-preserving receipts** – All receipts are scrubbed for PII before
   disk persistence; optional AES-GCM encryption can be enabled to contain the
   blast radius of a filesystem leak (`apps/orchestrator/privacy.ts`,
   `apps/orchestrator/receiptStore.ts`).

## Validator Collusion

*Impact*: Validators could collectively approve malicious or plagiarised work,
impacting rewards and reputation.

*Mitigations*:

1. **Planner-level moderation** – The planner auto-inserts a moderation gate,
   now fed with differentiated title/description strings to avoid false
   positives while still surfacing repeated or malicious content
   (`orchestrator/planner.py`).
2. **Rate limiting of validator endpoints** – The same middleware guards
   validator control-plane calls, preventing rapid approval/rejection storms.
3. **Audit trail hardening** – Scrubbed receipts ensure moderators reviewing
   potential collusion have clean artefacts that exclude user PII and can be
   distributed for independent verification.
4. **CULTURE addendum** – Validator norms specific to the CULTURE arena are
   codified in `SECURITY.md` to align human processes with the technical
   safeguards.

## Content Abuse & Data Leakage

*Impact*: User-submitted artefacts could include PII or malicious payloads; log
persistence could leak sensitive attachments.

*Mitigations*:

1. **Input validation** – Planner prompts are trimmed, bounded to 4,000
   characters, and rejected if they contain control characters
   (`orchestrator/models.py`, `apps/orchestrator/oneboxRouter.ts`).
2. **Privacy filtering** – Recursive scrubbing removes email addresses, phone
   numbers, hex secrets, and control characters from receipts and metadata
   before storage or attestation (`apps/orchestrator/privacy.ts`).
3. **Optional encryption** – Operators can set
   `ONEBOX_RECEIPT_ENCRYPTION_KEY` to persist receipts as AES-256-GCM envelopes,
   supporting at-rest secrecy for sensitive deliverables.
4. **Moderation audit** – The moderation engine now records augmented
   descriptions so duplicate detection remains effective without over-blocking
   legitimate requests (`orchestrator/planner.py`, `orchestrator/moderation.py`).

## Denial of Service (DoS)

*Impact*: Attackers could exhaust orchestrator threads, block validators, or
force relayer downtime through request floods.

*Mitigations*:

1. **Global rate limiting** – Both FastAPI and Express layers enforce sliding
   windows with configurable defaults (60 requests/minute) and `Retry-After`
   signalling (`services/meta_api/app/main.py`, `apps/orchestrator/oneboxRouter.ts`).
2. **CSRF enforcement** – Browser-origin traffic must prove intent, removing an
   entire class of cross-site request forgeries that otherwise inflate load.
3. **Configurable limits** – Administrators can tune
   `META_API_RATE_LIMIT_MAX_REQUESTS`, `ONEBOX_RATE_LIMIT_MAX_REQUESTS`, and
   related environment variables to adapt to traffic spikes while preserving
   safety margins.

## Reentrancy & Execution Safety

*Impact*: Malicious plans could attempt to re-enter execution flows or persist
state between runs, leading to inconsistent ledger state.

*Mitigations*:

1. **Stateless receipt pipeline** – Receipts are written as sanitized JSON blobs
   with optional encryption; no shared mutable state is exposed to plan
   execution (`apps/orchestrator/receiptStore.ts`).
2. **Moderation gates remain first class** – Even with UI hardening, the planner
   retains the moderation step to inspect intent before any stateful execution
   occurs (`orchestrator/planner.py`).
3. **Run identifier validation** – `/onebox/status` now validates the run ID
   shape to prevent filesystem traversal or cache poisoning attacks
   (`routes/meta_orchestrator.py`).

## Residual Risks & Follow-ups

* Legacy tooling (`slither`, `mythril`) requires a full Foundry toolchain to run
  end-to-end; see the tooling triage report for interim coverage gaps.
* The UI-side rate limiter is in-memory. Distributed deployments should replace
  it with Redis or Redis-compatible stores to enforce global limits.
* Encrypted receipts rely on symmetric keys; operators must integrate with the
  rotation plan to avoid key reuse.

