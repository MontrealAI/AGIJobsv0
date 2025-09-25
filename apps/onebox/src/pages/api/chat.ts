import { randomUUID } from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { serialize } from "cookie";

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

    const userId = resolveUserId(req, res);
    const historyWithMeta = Array.isArray(history)
      ? history.map((entry) => attachUserMeta(entry, userId))
      : [];

    const stream = planAndExecute({
      message,
      history: historyWithMeta,
      meta: { userId },
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

type HistoryEntry =
  | { [key: string]: unknown; meta?: Record<string, unknown> }
  | undefined
  | null;

function attachUserMeta(entry: unknown, userId: string) {
  if (!entry || typeof entry !== "object") {
    return entry;
  }
  const typed = entry as HistoryEntry;
  const baseMeta = typed?.meta && typeof typed.meta === "object" ? typed.meta : {};
  const existingMeta = baseMeta as Record<string, unknown>;
  const currentUserId = typeof existingMeta.userId === "string" ? existingMeta.userId : undefined;
  if (currentUserId === userId) {
    return { ...typed, meta: existingMeta };
  }
  return {
    ...typed,
    meta: { ...existingMeta, userId },
  };
}

const SESSION_COOKIE = "agi-onebox-session";

function resolveUserId(req: NextApiRequest, res: NextApiResponse): string {
  const headerCandidates = [
    req.headers["x-agi-user"],
    req.headers["x-agi-user-id"],
    req.headers["x-user-id"],
  ];
  for (const candidate of headerCandidates) {
    const resolved = Array.isArray(candidate) ? candidate[0] : candidate;
    if (typeof resolved === "string" && resolved.trim()) {
      return resolved.trim();
    }
  }

  const walletHeader = req.headers["x-wallet-address"];
  if (typeof walletHeader === "string" && walletHeader.trim()) {
    return walletHeader.trim().toLowerCase();
  }

  const existingCookie = req.cookies?.[SESSION_COOKIE];
  if (typeof existingCookie === "string" && existingCookie.trim()) {
    return existingCookie.trim();
  }

  const generated = `session:${randomUUID()}`;
  const cookie = serialize(SESSION_COOKIE, generated, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  res.setHeader("Set-Cookie", cookie);
  return generated;
}
