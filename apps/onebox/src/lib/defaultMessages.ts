export const defaultMessages = [
  {
    id: 'intro-1',
    role: 'assistant' as const,
    content:
      'Hi! I am the AGI Jobs orchestrator. Describe what you want and I will prepare the intent. Configure AGI-Alpha or paste a JSON intent to proceed.',
  },
];

export type DefaultMessage = (typeof defaultMessages)[number];
