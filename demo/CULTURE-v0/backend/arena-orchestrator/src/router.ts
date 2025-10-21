import { createServer, IncomingMessage, ServerResponse } from "http";
import { nextDifficulty, successRateFromOutcomes } from "./difficulty.js";
import { eloUpdate } from "./elo.js";

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

const routes: Record<string, Handler> = {
  "/healthz": (_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
  },
  "/arena/scoreboard": (_req, res) => {
    const [teacherNext] = eloUpdate({ ratingA: 1200, ratingB: 1200, scoreA: 0.5 });
    const difficulty = nextDifficulty({
      current: 3,
      targetSuccessRate: 6000,
      observedSuccessRate: successRateFromOutcomes(5, 3),
      minDifficulty: 1,
      maxDifficulty: 20,
      maxStep: 2,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        agents: [
          { id: "teacher", rating: teacherNext },
          { id: "student-alpha", rating: teacherNext + 12 },
        ],
        difficulty,
      })
    );
  },
};

export function startServer(port = Number(process.env.ORCHESTRATOR_PORT) || 4000) {
  const server = createServer((req, res) => {
    const handler = req && req.url ? routes[req.url] : undefined;
    if (handler) {
      handler(req, res);
    } else {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Not Found" }));
    }
  });
  server.listen(port);
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}
