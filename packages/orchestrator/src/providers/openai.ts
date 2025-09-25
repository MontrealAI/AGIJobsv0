export type ChatMessage = { role: string; content: string };
export type StreamOptions = {
  expect?: "json";
  meta?: MetaOptions;
};

type MetaOptions = {
  traceId?: string;
  userId?: string;
};

export async function streamLLM(
  messages: ChatMessage[],
  _options: StreamOptions
): Promise<string> {
  const last = messages[messages.length - 1]?.content ?? "";
  const meta = resolveMeta(_options.meta);
  const text = last.toLowerCase();

  if (text.includes("apply") && text.includes("job")) {
    const jobId = extractJobId(last);
    const ens = buildEns(last);
    return JSON.stringify({
      intent: "apply_job",
      params: { jobId: jobId ?? 0, ens },
      confirm: false,
      meta,
    });
  }

  if (text.includes("submit") && text.includes("job")) {
    const jobId = extractJobId(last);
    const ens = buildEns(last);
    return JSON.stringify({
      intent: "submit_work",
      params: {
        jobId: jobId ?? 0,
        result: { payload: { note: last } },
        ens,
      },
      confirm: true,
      meta,
    });
  }

  if (text.includes("finalize")) {
    const jobId = extractJobId(last);
    const success = inferSuccess(last);
    return JSON.stringify({
      intent: "finalize",
      params: { jobId: jobId ?? 0, success },
      confirm: true,
      meta,
    });
  }

  const reward = extractReward(last);
  const deadline = extractDeadline(last);
  const title = buildTitle(last);
  const spec = buildSpec(last);

  return JSON.stringify({
    intent: "create_job",
    params: {
      job: {
        title,
        description: last,
        deadline: deadline ?? "",
        rewardAGIA: reward ?? "",
        spec,
        attachments: [],
      },
    },
    confirm: true,
    meta,
  });
}

function resolveMeta(meta?: MetaOptions) {
  return {
    traceId: meta?.traceId ?? "00000000-0000-4000-8000-000000000000",
    userId: meta?.userId ?? "user-sandbox",
  } satisfies Required<MetaOptions>;
}

export function extractJobId(text: string): number | null {
  const directPatterns = [
    /\b(?:job|jobs)\s*(?:id|number|no\.)?\s*#?\s*(\d+)/i,
    /\bid\s*(?:number|no\.)?\s*#?\s*(\d+)/i,
  ];

  for (const pattern of directPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return Number.parseInt(match[1], 10);
    }
  }

  const hashRegex = /#(\d+)/g;
  let hashMatch: RegExpExecArray | null;
  while ((hashMatch = hashRegex.exec(text)) !== null) {
    const preceding = text.slice(0, hashMatch.index).toLowerCase();
    const contextRegex = /\b(job|jobs|id)\b/gi;
    let nearestIndex = -1;
    let contextMatch: RegExpExecArray | null;
    while ((contextMatch = contextRegex.exec(preceding)) !== null) {
      nearestIndex = contextMatch.index;
    }

    if (nearestIndex === -1) continue;

    if (hashMatch.index - nearestIndex <= 80) {
      return Number.parseInt(hashMatch[1], 10);
    }
  }

  return null;
}

function buildEns(text: string) {
  const subdomain = extractEnsSubdomain(text) ?? "agent";
  return { subdomain };
}

function extractEnsSubdomain(text: string): string | null {
  const match = text.match(/\b([a-z0-9-]+)\.agijobs\.eth\b/i);
  if (match?.[1]) return match[1].toLowerCase();
  return null;
}

function extractReward(text: string): string | null {
  const rewardMatch = text.match(/(\d+(?:\.\d+)?)\s*(agi[a-z]*)/i);
  if (!rewardMatch) return null;
  return rewardMatch[1];
}

function extractDeadline(text: string): number | null {
  const daysMatch = text.match(/(\d+)\s*day/);
  if (daysMatch) return Number.parseInt(daysMatch[1], 10);
  const weekMatch = text.match(/(\d+)\s*week/);
  if (weekMatch) return Number.parseInt(weekMatch[1], 10) * 7;
  if (text.includes("next week")) return 7;
  return null;
}

function buildTitle(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= 80) return capitalize(trimmed);
  return capitalize(trimmed.slice(0, 77)) + "…";
}

function buildSpec(text: string): Record<string, unknown> {
  return {
    summary: text.trim(),
  };
}

function capitalize(value: string): string {
  if (!value) return value;
  return value[0].toUpperCase() + value.slice(1);
}

function inferSuccess(text: string): boolean {
  const normalized = text.toLowerCase();
  if (/\b(fail|reject|unsuccessful|failed)\b/.test(normalized)) return false;
  if (/(success|successful|approve|approved|complete|completed|finished)/.test(normalized)) return true;
  return false;
}
