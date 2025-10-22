import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

const RESPONSES: Record<string, string[]> = {
  synopsis: [
    'Let us craft a synopsis that emphasizes the artifact impact on validator trust and multi-agent collaboration.',
    'Consider highlighting the learning objectives for each chapter in less than 140 characters each.'
  ],
  outline: [
    'A three-act outline keeps the cohort engaged: Act I Problem Framing, Act II Multimodal Tactics, Act III Arena Learnings.',
    'Add an appendix summarizing validator honesty calibration exercises.'
  ],
  manuscript: [
    'Draft vivid transcripts between orchestrator and validator to make the learning narrative feel alive.',
    'Ensure each section ends with a call-to-action for follow-on derivative jobs.'
  ]
};

export async function POST(request: Request) {
  const { prompt, context } = (await request.json()) as { prompt: string; context: string };
  const suggestions = RESPONSES[context as keyof typeof RESPONSES] ?? ['Artifact noted. Continue building momentum.'];
  const content = suggestions[Math.floor(Math.random() * suggestions.length)];

  return NextResponse.json({
    id: randomUUID(),
    role: 'assistant',
    content: `${content}\n> ${prompt}`,
    timestamp: new Date().toISOString()
  });
}
