export const defaultMessages = [
  {
    id: 'intro-1',
    role: 'assistant' as const,
    content: 'Ask → Confirm → Done + Receipt.',
  },
];

export type DefaultMessage = (typeof defaultMessages)[number];
