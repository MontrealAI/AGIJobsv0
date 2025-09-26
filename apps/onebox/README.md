# AGI Jobs One-Box UI

A minimal Next.js application that delivers the ChatGPT-style "one input box" user experience for AGI Jobs. It streams responses from the meta-orchestrator backend while abstracting blockchain complexity behind natural language confirmations.

## Static build

Need an IPFS-hostable version without the Next.js runtime? Use the self-contained bundle in [`static/`](./static/). Pin the entire folder to IPFS and point the page at your orchestrator by setting `localStorage.ORCH_URL` or appending `#orch=<encoded-url>` to the gateway URL. The bundle supports a demo mode when no orchestrator URL is provided, making it safe to preview offline.

## Getting started

```bash
npm install --prefix apps/onebox
npm install --prefix packages/orchestrator
npm run build --prefix packages/orchestrator
npm run dev --prefix apps/onebox
```

The development server runs on [http://localhost:3000](http://localhost:3000). The `/api/chat` endpoint proxies requests to the orchestrator planner implemented in `packages/orchestrator`.

## Environment

Create an `.env.local` file inside `apps/onebox` if you need to expose additional environment variables to the client or API routes. The orchestrator package reads from process environment variables like `RPC_URL`, `TX_MODE`, and contract addresses when executing real transactions.
