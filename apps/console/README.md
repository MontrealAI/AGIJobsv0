# Owner console

This React/Vite application presents the AGI Jobs owner interface. Start with local development, inspect the displayed network and addresses, and follow the [operator runbook](../../OperatorRunbook.md) before connecting an operational wallet.

From the repository root, with Node 22.23.3 and npm 10.x:

```bash
npm ci --prefix apps/console
npm run dev --prefix apps/console -- --host 127.0.0.1
```

Open the local URL printed by Vite. In the connection panel, provide the orchestrator base URL and API token. Configuration is retained in browser local storage; use a dedicated operator browser profile. For a production asset build:

```bash
npm run webapp:typecheck
npm run webapp:build
npm run preview --prefix apps/console -- --host 127.0.0.1
```

The Docker image serves the compiled `dist/` assets with nginx; its single-page routing is configured in `nginx.conf`. Vite's preview server is for inspecting a build locally.

Building this interface does not deploy contracts. Check the [production readiness report](../../docs/production/readiness-2026-10-03.md) for the current deployment blockers. Wallet transactions and live network configuration require the appropriate owner authority.
