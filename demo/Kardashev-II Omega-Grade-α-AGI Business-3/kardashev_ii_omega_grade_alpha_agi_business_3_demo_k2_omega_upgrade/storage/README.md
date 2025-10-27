# Runtime storage

This directory is intentionally empty in source control. When the demo runs it will populate:

- `status.jsonl` – append-only structured telemetry for operators and dashboards.
- `checkpoints/` – resumable state for the resource manager and job registry.

Feel free to wipe the directory between runs; the orchestrator recreates it automatically.
