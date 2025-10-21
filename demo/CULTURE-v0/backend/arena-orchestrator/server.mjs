import http from "http";

const port = Number(process.env.ARENA_ORCHESTRATOR_PORT ?? process.env.CULTURE_ORCHESTRATOR_PORT ?? 8080);
const host = "0.0.0.0";

const healthPayload = JSON.stringify({ status: "ok" });

function scoreboardPayload() {
  const now = new Date();
  return JSON.stringify({
    generatedAt: now.toISOString(),
    round: {
      id: "sim-round-1",
      status: "idle",
      nextDifficulty: 5,
    },
    agents: [
      { id: "teacher", rating: 1216 },
      { id: "student-alpha", rating: 1184 },
      { id: "critic", rating: 1192 },
    ],
  });
}

function setJson(res) {
  res.setHeader("content-type", "application/json");
  res.setHeader("access-control-allow-origin", "*");
}

const server = http.createServer((req, res) => {
  const path = req?.url?.split("?")[0] ?? "/";
  if (req?.method === "GET" && (path === "/health" || path === "/healthz")) {
    setJson(res);
    res.writeHead(200);
    res.end(healthPayload);
    return;
  }

  if (req?.method === "GET" && path === "/arena/scoreboard") {
    setJson(res);
    res.writeHead(200);
    res.end(scoreboardPayload());
    return;
  }

  if (req?.method === "OPTIONS") {
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type");
    res.writeHead(204);
    res.end();
    return;
  }

  if (req?.method === "POST" && path === "/arena/start") {
    setJson(res);
    res.writeHead(202);
    res.end(
      JSON.stringify({
        status: "scheduled",
        roundId: "sim-round-" + Date.now().toString(36),
      })
    );
    return;
  }

  setJson(res);
  res.writeHead(404);
  res.end(JSON.stringify({ error: "Not Found", path }));
});

server.listen(port, host, () => {
  console.log(`Arena orchestrator listening on ${host}:${port}`);
});

const shutdown = () => {
  server.close(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
