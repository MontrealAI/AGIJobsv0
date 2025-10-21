import http from "http";

const req = http.request({
  hostname: "localhost",
  port: process.env.ORCHESTRATOR_PORT || 4000,
  path: "/healthz",
  method: "GET",
  timeout: 2000,
});

req.on("response", (res) => {
  if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
    process.exit(0);
  } else {
    process.exit(1);
  }
});

req.on("error", () => process.exit(1));
req.end();
