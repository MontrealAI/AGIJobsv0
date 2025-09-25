import type { NextApiRequest, NextApiResponse } from "next";
import { planAndExecute } from "@agi/orchestrator";

type ChatRequest = {
  message: string;
  history?: unknown[];
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { message, history } = (req.body ?? {}) as ChatRequest;
  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "Missing message" });
    return;
  }

  const stream = await planAndExecute({ message, history });
  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Transfer-Encoding": "chunked"
  });

  for await (const chunk of stream) {
    res.write(chunk);
  }

  res.end();
}
