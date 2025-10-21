import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "http";
import { startServer } from "../src/router";

const PORT = 5055;

function request(path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port: PORT, path }, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        resolve({ status: res.statusCode ?? 0, body: data });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

describe("router", () => {
  let server: ReturnType<typeof startServer>;

  beforeAll(() => {
    server = startServer(PORT);
  });

  afterAll(() => {
    server.close();
  });

  it("responds to health checks", async () => {
    const res = await request("/healthz");
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).status).toBe("ok");
  });

  it("returns scoreboard sample", async () => {
    const res = await request("/arena/scoreboard");
    expect(res.status).toBe(200);
    const payload = JSON.parse(res.body);
    expect(payload.agents).toHaveLength(2);
    expect(payload.difficulty).toBeGreaterThan(0);
  });

  it("404s for unknown route", async () => {
    const res = await request("/nope");
    expect(res.status).toBe(404);
  });
});
