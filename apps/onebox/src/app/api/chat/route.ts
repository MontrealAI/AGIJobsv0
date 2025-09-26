import { NextResponse } from 'next/server';
import { PlannerClient } from '@agijobs/onebox-orchestrator';
import type { PlannerMessage } from '@agijobs/onebox-orchestrator';

const planner = PlannerClient.fromEnv();

export async function POST(request: Request) {
  const body = (await request.json()) as { messages?: PlannerMessage[] };
  const messages = body.messages ?? [];

  const result = await planner.plan(messages);

  const reply = result.intent.ok
    ? 'Intent validated. Use the orchestrator tool layer to execute when ready.'
    : result.message ??
      'I could not validate your request. Provide more details or configure the AGI-Alpha orchestrator URL.';

  return NextResponse.json({
    reply,
    source: result.source,
    issues: result.intent.ok ? undefined : result.intent.issues,
    confirmation: result.intent.ok
      ? {
          required: result.intent.data.payload.confirm ?? false,
          text: result.intent.data.payload.confirmationText,
        }
      : undefined,
  });
}
