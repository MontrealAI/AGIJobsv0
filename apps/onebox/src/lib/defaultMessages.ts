export const defaultMessages = [
  {
    id: 'intro-1',
    role: 'assistant' as const,
    kind: 'text' as const,
    content:
      'Welcome to the AGI Jobs One‑Box. Describe the outcome you need and I will design, simulate, and execute the on-chain workflow for you.',
  },
  {
    id: 'intro-2',
    role: 'assistant' as const,
    kind: 'text' as const,
    content:
      'Example: “Create a data-labelling mission for 500 satellite images. Reward 45 AGIALPHA, require validator sign-off, deadline 7 days.”',
  },
  {
    id: 'intro-3',
    role: 'assistant' as const,
    kind: 'text' as const,
    content:
      'All owner safeguards remain active — pause switches, fee updates, validator rules, and relayer rotation are one command away via the owner console.',
  },
];

export type DefaultMessage = (typeof defaultMessages)[number];
