# CULTURE Demo Reporting Framework

Weekly reports (`culture-weekly.md`, `arena-weekly.md`) are generated from deterministic JSON exports checked into `data/analytics/`. The `export.weekly.ts` script renders the Markdown snapshots and can be executed via Node or the Docker Compose `culture-reports` profile:

```bash
npm exec ts-node --project tsconfig.json demo/CULTURE-v0/scripts/export.weekly.ts
# or
docker compose --profile reports run --rm culture-reports
```

The resulting Markdown is suitable for sharing with stakeholders or archiving inside your observability tooling. Each run reuses the most recent snapshot files so historical reports remain reproducible.
