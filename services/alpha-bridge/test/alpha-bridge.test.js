const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

const { createServer } = require("../src/server.js");

const PROTO_PATH = path.join(__dirname, "..", "proto", "alpha_bridge.proto");
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const proto = grpc.loadPackageDefinition(packageDefinition);
const AlphaBridgeClient = proto.agi.alpha.bridge.v1.AlphaBridge;

const CANONICAL_FLOWS = [
  {
    name: "employer_create_job",
    utterance: "Create a job to label 500 cat photos for 50 AGIALPHA by next Friday",
    traceId: "trace-employer",
    requiresConsent: true,
    expectedConsent: true,
    consentToken: "consent-create",
    plan: {
      intent: {
        action: "post_job",
        payload: {
          title: "Label 500 cat photos",
          reward: "50",
          deadlineDays: 7,
        },
        userContext: {
          role: "employer",
        },
      },
      steps: [
        {
          id: "simulate",
          tool: "simulate_job_posting",
          summary: "Simulate escrow of 50 AGIALPHA and validate deadline",
          needs: [],
        },
        {
          id: "execute",
          tool: "submit_job",
          summary: "Post job via JobRegistry.postJob",
          needs: ["simulate"],
          consent: true,
        },
      ],
    },
    receipt: {
      status: "submitted",
      jobId: 101,
      txHashes: ["0xcreate"],
    },
  },
  {
    name: "agent_apply_job",
    utterance: "I want to apply to job 101 with my agent badge",
    traceId: "trace-agent",
    requiresConsent: false,
    expectedConsent: false,
    consentToken: "",
    plan: {
      intent: {
        action: "apply_job",
        payload: {
          jobId: 101,
          ens: { subdomain: "alice" },
        },
        userContext: {
          role: "agent",
        },
      },
      steps: [
        {
          id: "check",
          tool: "check_stake",
          summary: "Verify stake and allowlist before applying",
          needs: [],
        },
        {
          id: "submit",
          tool: "apply_onchain",
          summary: "Submit on-chain application",
          needs: ["check"],
        },
      ],
    },
    receipt: {
      status: "applied",
      jobId: 101,
      txHashes: ["0xapply"],
    },
  },
  {
    name: "validator_finalize_job",
    utterance: "Finalize payout for job 101",
    traceId: "trace-validator",
    requiresConsent: true,
    expectedConsent: true,
    consentToken: "consent-finalize",
    plan: {
      intent: {
        action: "finalize_job",
        payload: {
          jobId: 101,
        },
        userContext: {
          role: "validator",
        },
      },
      steps: [
        {
          id: "audit",
          tool: "validate_receipts",
          summary: "Confirm validator quorum and work receipt",
          needs: [],
        },
        {
          id: "finalize",
          tool: "finalize_onchain",
          summary: "Finalize payout via JobRegistry.finalize",
          needs: ["audit"],
          consent: true,
        },
      ],
    },
    receipt: {
      status: "finalized",
      jobId: 101,
      txHashes: ["0xfinal"],
    },
  },
];

test("alpha-bridge proxies canonical flows via gRPC", async (t) => {
  const receivedPlanBodies = [];
  const receivedExecuteBodies = [];
  const receivedPlanHeaders = [];
  const receivedExecuteHeaders = [];

  const httpServer = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      let body;
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch (error) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: String(error) }));
        return;
      }

      if (req.url === "/plan") {
        receivedPlanHeaders.push(req.headers);
        receivedPlanBodies.push(body);
        const traceId = body?.meta?.traceId;
        const flow = CANONICAL_FLOWS.find((item) => item.traceId === traceId);
        if (!flow) {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: "unknown trace" }));
          return;
        }
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            plan: flow.plan,
            meta: {
              traceId,
              consent: {
                required: flow.requiresConsent,
                token: flow.consentToken || undefined,
              },
            },
          }),
        );
        return;
      }

      if (req.url === "/execute") {
        receivedExecuteHeaders.push(req.headers);
        receivedExecuteBodies.push(body);
        const traceId = body?.meta?.traceId;
        const flow = CANONICAL_FLOWS.find((item) => item.traceId === traceId);
        if (!flow) {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: "unknown trace" }));
          return;
        }
        const consent = body?.meta?.consent ?? {};
        if (Boolean(consent.granted) !== Boolean(flow.expectedConsent)) {
          res.statusCode = 422;
          res.end(JSON.stringify({ error: "consent mismatch" }));
          return;
        }
        if ((consent.token || "") !== (flow.consentToken || "")) {
          res.statusCode = 422;
          res.end(JSON.stringify({ error: "consent token mismatch" }));
          return;
        }
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            receipt: flow.receipt,
            meta: {
              traceId,
            },
          }),
        );
        return;
      }

      res.statusCode = 404;
      res.end();
    });
  });

  await new Promise((resolve) => httpServer.listen(0, resolve));
  const upstreamPort = httpServer.address().port;
  const upstreamUrl = `http://127.0.0.1:${upstreamPort}`;

  const bridge = createServer({ baseUrl: upstreamUrl });
  const { port: grpcPort } = await bridge.listen("127.0.0.1:0");

  const client = new AlphaBridgeClient(
    `127.0.0.1:${grpcPort}`,
    grpc.credentials.createInsecure(),
  );

  for (const flow of CANONICAL_FLOWS) {
    const planResponse = await new Promise((resolve, reject) => {
      client.Plan(
        {
          utterance: flow.utterance,
          trace_id: flow.traceId,
          require_consent: flow.requiresConsent,
          consent_token: flow.consentToken,
          metadata: { flow: flow.name, stage: "plan" },
        },
        (error, response) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(response);
        },
      );
    });

    assert.equal(planResponse.trace_id, flow.traceId);
    assert.equal(planResponse.requires_consent, flow.requiresConsent);
    assert.equal(planResponse.consent_token, flow.consentToken || "");

    const parsedPlan = JSON.parse(planResponse.plan_json);
    assert.deepEqual(parsedPlan, flow.plan);

    const executeResponse = await new Promise((resolve, reject) => {
      client.Execute(
        {
          plan_json: planResponse.plan_json,
          trace_id: planResponse.trace_id,
          consent_granted: flow.expectedConsent,
          consent_token: planResponse.consent_token,
          metadata: { flow: flow.name, stage: "execute" },
        },
        (error, response) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(response);
        },
      );
    });

    assert.equal(executeResponse.trace_id, flow.traceId);
    const parsedReceipt = JSON.parse(executeResponse.receipt_json);
    assert.deepEqual(parsedReceipt, flow.receipt);
  }

  client.close();
  await bridge.shutdown();
  await new Promise((resolve) => httpServer.close(resolve));

  assert.equal(receivedPlanBodies.length, CANONICAL_FLOWS.length);
  assert.equal(receivedExecuteBodies.length, CANONICAL_FLOWS.length);

  for (const [index, flow] of CANONICAL_FLOWS.entries()) {
    const planHeaders = receivedPlanHeaders[index];
    assert.equal(planHeaders["x-agi-trace-id"], flow.traceId);
    assert.equal(planHeaders["x-agi-require-consent"], String(flow.requiresConsent));
    if (flow.consentToken) {
      assert.equal(planHeaders["x-agi-consent-token"], flow.consentToken);
    }
    assert.equal(planHeaders["x-agi-meta-flow"], flow.name);
    assert.equal(planHeaders["x-agi-meta-stage"], "plan");

    const executeHeaders = receivedExecuteHeaders[index];
    assert.equal(executeHeaders["x-agi-trace-id"], flow.traceId);
    assert.equal(
      executeHeaders["x-agi-consent-granted"],
      String(flow.expectedConsent),
    );
    if (flow.consentToken) {
      assert.equal(executeHeaders["x-agi-consent-token"], flow.consentToken);
    }
    assert.equal(executeHeaders["x-agi-meta-flow"], flow.name);
    assert.equal(executeHeaders["x-agi-meta-stage"], "execute");
  }
});
