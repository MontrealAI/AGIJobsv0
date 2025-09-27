export const defaultMessages = [
  {
    id: 'intro-1',
    role: 'assistant' as const,
    kind: 'text' as const,
    content: 'Ask → Confirm → Done + Receipt.',
  },
];

export type DefaultMessage = (typeof defaultMessages)[number];
