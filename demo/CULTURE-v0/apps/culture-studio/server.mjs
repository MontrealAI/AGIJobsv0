import http from "http";

const port = Number(process.env.CULTURE_UI_PORT ?? 3000);
const orchestratorPort = Number(process.env.CULTURE_ORCHESTRATOR_PORT ?? 8080);
const indexerPort = Number(process.env.CULTURE_INDEXER_PORT ?? 8000);
const rpcPort = Number(process.env.CULTURE_RPC_PORT ?? 8545);
const host = "0.0.0.0";

const html = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>CULTURE Studio (Scaffold)</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 0; background: #0b1221; color: #f5f6fa; }
      header { padding: 1.5rem; background: #141d33; border-bottom: 1px solid rgba(255, 255, 255, 0.1); }
      main { padding: 1.5rem; }
      section { margin-bottom: 2rem; }
      h1 { margin: 0; font-size: 1.75rem; }
      table { border-collapse: collapse; width: 100%; max-width: 640px; }
      th, td { border: 1px solid rgba(255,255,255,0.2); padding: 0.5rem; text-align: left; }
      th { background: rgba(255,255,255,0.1); }
      .status { display: inline-flex; align-items: center; gap: 0.4rem; }
      .status::before { content: ""; width: 0.65rem; height: 0.65rem; border-radius: 50%; background: #2ecc71; }
      button { background: #5b8def; color: #fff; border: none; padding: 0.6rem 1rem; border-radius: 0.5rem; cursor: pointer; }
      button:disabled { opacity: 0.6; cursor: not-allowed; }
      pre { background: rgba(0,0,0,0.35); padding: 1rem; border-radius: 0.5rem; overflow-x: auto; }
      a { color: #5b8def; }
    </style>
  </head>
  <body>
    <header>
      <h1>🎖️ CULTURE 👁️✨ Studio</h1>
      <p class="status">Demo stack online – data generated from scaffold services.</p>
    </header>
    <main>
      <section>
        <h2>Arena Telemetry</h2>
        <button id="refresh">Refresh scoreboard</button>
        <pre id="scoreboard">Loading…</pre>
      </section>
      <section>
        <h2>Influence Graph (Top Artifacts)</h2>
        <pre id="artifacts">Loading…</pre>
      </section>
      <section>
        <h2>Helpful Links</h2>
        <table>
          <tbody>
            <tr><th>Orchestrator health</th><td><a href="http://localhost:${orchestratorPort}/health" target="_blank" rel="noreferrer">http://localhost:${orchestratorPort}/health</a></td></tr>
            <tr><th>Indexer GraphQL</th><td><code>POST http://localhost:${indexerPort}/</code></td></tr>
            <tr><th>JSON-RPC (contracts)</th><td><code>http://localhost:${rpcPort}</code></td></tr>
          </tbody>
        </table>
      </section>
    </main>
    <script type="module">
      const orchestratorPort = ${orchestratorPort};
      const indexerPort = ${indexerPort};
      async function fetchScoreboard() {
        const scoreboardUrl = 'http://' + location.hostname + ':' + orchestratorPort + '/arena/scoreboard';
        const res = await fetch(scoreboardUrl);
        if (!res.ok) throw new Error('Failed to fetch scoreboard');
        return res.json();
      }
      async function fetchArtifacts() {
        const artifactsUrl = 'http://' + location.hostname + ':' + indexerPort + '/';
        const res = await fetch(artifactsUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ query: '{ topInfluential { id author influence } }' })
        });
        if (!res.ok) throw new Error('Failed to query artifacts');
        return res.json();
      }
      async function refresh() {
        const scoreEl = document.querySelector('#scoreboard');
        const artifactEl = document.querySelector('#artifacts');
        try {
          scoreEl.textContent = JSON.stringify(await fetchScoreboard(), null, 2);
        } catch (error) {
          scoreEl.textContent = error.message;
        }
        try {
          artifactEl.textContent = JSON.stringify(await fetchArtifacts(), null, 2);
        } catch (error) {
          artifactEl.textContent = error.message;
        }
      }
      document.querySelector('#refresh').addEventListener('click', refresh);
      refresh();
    </script>
  </body>
</html>`;

const server = http.createServer((req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url?.startsWith("/?"))) {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.writeHead(200);
    res.end(html);
    return;
  }

  if (req.method === "GET" && (req.url === "/health" || req.url === "/healthz")) {
    res.setHeader("content-type", "application/json");
    res.writeHead(200);
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

server.listen(port, host, () => {
  console.log(`Culture studio UI listening on ${host}:${port}`);
});

const shutdown = () => {
  server.close(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
