export const defaultMessages = [
  {
    id: 'intro-1',
    role: 'assistant' as const,
    kind: 'text' as const,
    content:
      'Welcome to AGI Jobs One‑Box. Describe a mission in natural language and I will orchestrate the on-chain workflow end-to-end.',
  },
  {
    id: 'onebox-clarity',
    role: 'assistant' as const,
    kind: 'text' as const,
    content:
      'Every plan is simulated for cost, risk, and guardrails. Confirm when ready and the orchestrator will sign, pin to IPFS, and post receipts automatically.',
  },
  {
    id: 'onebox-ownership',
    role: 'assistant' as const,
    kind: 'text' as const,
    content:
      'Owner controls stay in your hands: pause switches, fee tuning, validator policy, and deployment rollouts are reachable through the owner toolchain at any time.',
  },
];

export type DefaultMessage = (typeof defaultMessages)[number];
