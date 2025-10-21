# Arena Orchestrator Skeleton

This directory contains the TypeScript orchestrator that automates teacher → student → critic self-play loops. The sprint playbook outlines modules (`arena.service.ts`, `difficulty.ts`, `elo.ts`, `qd.ts`, `ipfs.ts`, `agijobs.ts`) and accompanying tests.

## Runtime overview

The orchestrator exposes REST and WebSocket interfaces for managing automated CULTURE rounds. It coordinates teacher prompt generation, student/validator job creation, rating updates, and safety controls.

### REST endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| `POST` | `/arena/start` | Creates a new round and issues jobs for the teacher, students, and validators. |
| `POST` | `/arena/close/:roundId` | Transitions the round into the review phase. |
| `POST` | `/arena/submit/:roundId` | Records an off-chain submission CID for a participant. |
| `POST` | `/arena/finalize/:roundId` | Finalises the round, updates Elo ratings, and produces an IPFS snapshot. |
| `GET` | `/arena/scoreboard` | Returns difficulty, rating, and historical round data. |
| `GET` | `/arena/status/:roundId` | Returns the state for a single round. |
| `GET` | `/metrics` | Prometheus metrics. |

The `/ws/arena` websocket pushes scoreboard deltas whenever a round or rating change occurs.

### Safety & resilience

* All teacher prompts run through moderation and plagiarism filters prior to round creation.
* Job lifecycle calls are wrapped in retry + timeout guards and emit structured logs for observability.
* StakeManager hooks lock stakes for each participant and release or slash on finalisation.
* A PID-style difficulty controller regulates round difficulty based on observed success rates, while Elo ratings persist to disk (`storage/culture/state/elo.json` by default).

### Manual intervention runbook

1. **Timeouts** – If an operation keeps timing out, call `POST /arena/close/:roundId` to halt intake and manually update submissions with `/arena/submit/:roundId` before retrying `/arena/finalize/:roundId`.
2. **Safety filter trip** – Review the generated prompt in the logs (`component=arena-service action=round-started`). Adjust the artifact metadata or override with `difficultyOverride` and retry.
3. **Stake adjustments** – When automated release/slash results look incorrect, replay the round by invoking `/arena/scoreboard` to gather state, then issue compensating transfers via the StakeManager admin CLI referenced in `services/stake-manager`.
4. **Websocket recovery** – Restart the service (`npm run dev`) to rebuild the scoreboard subscription list; clients will automatically receive a fresh snapshot on reconnect.
