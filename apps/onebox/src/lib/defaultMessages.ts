export const defaultMessages = [
  {
    id: 'intro-1',
    role: 'assistant' as const,
    kind: 'text' as const,
    content: 'Ask → Confirm → Done + Receipt.',
  },
  {
    id: 'solving-alpha-agi-governance',
    role: 'assistant' as const,
    kind: 'text' as const,
    content:
      'Welcome to the “Solving α‑AGI Governance” cockpit. Use the right-hand mission panel to stage actors, parameters, and prompts, then paste the generated instructions here to capture the policy proposal, validator commits, reveal votes, and finalise the on-chain outcome. Owner pause + parameter controls remain available via the mission bundle.',
  },
  {
    id: 'solving-alpha-agi-governance-actions',
    role: 'assistant' as const,
    kind: 'text' as const,
    content:
      'Tip: paste the owner quickstart summary or validator CLI receipts here so non-technical stakeholders can follow along. Full runbook: demo/solving-alpha-agi-governance/README.md.',
  },
];

export type DefaultMessage = (typeof defaultMessages)[number];
