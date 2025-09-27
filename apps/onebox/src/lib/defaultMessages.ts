export const defaultMessages = [
  {
    id: 'intro-1',
    role: 'assistant' as const,
    content:
      'Hi! I can plan, run, and finalize your job. Ask → Confirm → Done + Receipt. Configure the orchestrator URL in Advanced or paste a JSON intent to proceed.',
  },
];

export type DefaultMessage = (typeof defaultMessages)[number];
