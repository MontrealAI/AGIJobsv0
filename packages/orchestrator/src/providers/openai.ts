export type ChatMessage = { role: string; content: string };
export type StreamOptions = { expect?: "json" };

export async function streamLLM(
  messages: ChatMessage[],
  _options: StreamOptions
): Promise<string> {
  const last = messages[messages.length - 1]?.content ?? "";
  const text = last.toLowerCase();

  if (text.includes("apply") && text.includes("job")) {
    const jobId = extractJobId(last);
    return JSON.stringify({
      intent: "apply_job",
      params: { jobId },
      confirm: false,
    });
  }

  if (text.includes("submit") && text.includes("job")) {
    const jobId = extractJobId(last);
    return JSON.stringify({
      intent: "submit_work",
      params: { jobId, result: { note: last } },
      confirm: true,
    });
  }

  if (text.includes("finalize")) {
    const jobId = extractJobId(last);
    return JSON.stringify({
      intent: "finalize",
      params: { jobId },
      confirm: true,
    });
  }

  const reward = extractReward(last);
  const deadline = extractDeadline(last);
  const title = buildTitle(last);

  return JSON.stringify({
    intent: "create_job",
    params: {
      job: {
        title,
        description: last,
        deadlineDays: deadline ?? null,
        rewardAGIA: reward ?? null,
        attachments: [],
      },
    },
    confirm: true,
  });
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

function capitalize(value: string): string {
  if (!value) return value;
  return value[0].toUpperCase() + value.slice(1);
}
