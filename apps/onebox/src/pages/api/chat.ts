import type { NextApiRequest, NextApiResponse } from "next";
import { planAndExecute } from "@agi/orchestrator/llm";

type ChatPayload = {
  message: string;
  history?: unknown[];
};

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "1mb",
    },
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  try {
    const { message, history }: ChatPayload = req.body ?? {};
    if (!message || typeof message !== "string") {
      res.status(400).json({ error: "Missing message" });
      return;
    }

    const stream = planAndExecute({
      message,
      history: Array.isArray(history) ? history : [],
    });

    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      Connection: "keep-alive",
    });

    for await (const chunk of stream) {
      res.write(chunk);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (!res.headersSent) {
      res.status(500).json({ error: message });
    } else {
      res.write(`\n[orchestrator-error] ${message}`);
    }
  } finally {
    res.end();
  }
}
