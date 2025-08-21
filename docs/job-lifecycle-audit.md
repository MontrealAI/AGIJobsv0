# Job Lifecycle Audit

This document cross-checks key `JobRegistry` entry points with the v1 `AGIJobManager` function map to ensure parity in parameters, state transitions, and emitted events.

| v1 function | v2 function | Parameters match | Status change | Event emitted |
|-------------|-------------|------------------|---------------|---------------|
| `createJob` | `createJob` | `reward`, `deadline`, `uri` retained. | `None -> Created` | `JobCreated` |
| `applyForJob` | `applyForJob` | `jobId`, ENS `subdomain`, `proof`. | `Created -> Applied` | `JobApplied` |
| `requestJobCompletion` | `submit` | `jobId`, `result`, ENS proof. | `Applied -> Submitted` | `JobSubmitted` |
| `resolveStalledJob` / `finalizeJob` | `finalize` | `jobId`. | `Completed -> Finalized` or refunds on failure. | `JobFinalized` |
| `cancelJob` | `cancelJob` | `jobId`. | `Created -> Cancelled` | `JobCancelled` |
| `disputeJob` | `raiseDispute`/`dispute` | `jobId`, `evidence`. | `Completed -> Disputed` | `JobDisputed` |
| `resolveDispute` | `resolveDispute` | `jobId`, `employerWins`. | `Disputed -> Completed` before finalisation. | `DisputeResolved` |

Each function preserves the semantics and logging behaviour of its v1 counterpart while integrating tax-policy acknowledgement and modular hooks in v2.
