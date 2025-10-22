'use client';

import { useCallback, useMemo } from 'react';
import type { MouseEvent } from 'react';
import styles from './OnboardingModal.module.css';
import { MermaidDiagram } from './MermaidDiagram';

type OnboardingPrompt = {
  id: string;
  title: string;
  description: string;
  prompt: string;
};

type OnboardingModalProps = {
  open: boolean;
  onClose: () => void;
  onPromptSelect?: (prompt: string) => void;
};

const diagramDefinition = `
flowchart TD
    start(["Describe mission in chat"]) --> plan["Planner drafts JobIntent"]
    plan --> simulate["Simulator validates policy + budget"]
    simulate --> confirm{User confirms?}
    confirm -- Yes --> execute["Relayer signs & posts on-chain"]
    execute --> attest["IPFS receipts + explorer links"]
    attest --> finalise["Finalize & release rewards"]
`;

const prompts: readonly OnboardingPrompt[] = [
  {
    id: 'starter-mission',
    title: 'Launch a mission',
    description: 'Spin up a complex workforce request with a single sentence.',
    prompt:
      'Launch a planetary research synthesis: gather 500 reports, reward 45 AGIALPHA, deadline 72 hours, validators must countersign before payout.',
  },
  {
    id: 'finalise',
    title: 'Finalize delivery',
    description: 'Release escrow once the mission is complete.',
    prompt: 'Finalize job 77 and release the escrowed AGIALPHA once validator approvals are recorded.',
  },
  {
    id: 'audit',
    title: 'Audit receipts',
    description: 'Ask the assistant to surface attested history instantly.',
    prompt: 'Show me the attested receipt and explorer link for the most recent mission.',
  },
];

export function OnboardingModal({ open, onClose, onPromptSelect }: OnboardingModalProps) {
  const handleOverlayClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  const promptButtons = useMemo(
    () =>
      prompts.map((item) => (
        <button
          key={item.id}
          type="button"
          className={styles.promptButton}
          onClick={() => {
            onPromptSelect?.(item.prompt);
            onClose();
          }}
        >
          <span className={styles.promptTitle}>{item.title}</span>
          <span className={styles.promptDescription}>{item.description}</span>
        </button>
      )),
    [onClose, onPromptSelect]
  );

  if (!open) {
    return null;
  }

  return (
    <div className={styles.overlay} role="presentation" onClick={handleOverlayClick}>
      <div role="dialog" aria-modal="true" className={styles.modal}>
        <header className={styles.header}>
          <div className={styles.headerText}>
            <p className={styles.eyebrow}>🎖️ AGI Jobs One-Box</p>
            <h2 className={styles.title}>Deploy unstoppable missions from a single command centre.</h2>
            <p className={styles.subtitle}>
              Describe what you need, approve the plan, and the orchestrator will escrow funds, publish specs, and stream back attested receipts—all without leaving this page.
            </p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close onboarding">
            ✕
          </button>
        </header>
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Mission lifecycle</h3>
          <p className={styles.sectionIntro}>
            Every mission flows through a verifiable pipeline with contract-owner guardrails enforced at each step.
          </p>
          <div className={styles.diagramWrapper}>
            <MermaidDiagram definition={diagramDefinition} />
          </div>
        </section>
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Operator checklist</h3>
          <ul className={styles.checklist}>
            <li>
              <span className={styles.checkEmoji}>✅</span>
              <span>
                Confirm the orchestration banner is green—health checks and pause status stream directly from your contracts.
              </span>
            </li>
            <li>
              <span className={styles.checkEmoji}>🛡️</span>
              <span>
                Guardrails honour <code>ONEBOX_MAX_JOB_BUDGET_AGIA</code> and <code>ONEBOX_MAX_JOB_DURATION_DAYS</code>; increase or tighten them in seconds.
              </span>
            </li>
            <li>
              <span className={styles.checkEmoji}>🧾</span>
              <span>
                Each execution returns explorer links, IPFS CIDs, and signed receipts so you can prove compliance instantly.
              </span>
            </li>
          </ul>
        </section>
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Try it now</h3>
          <p className={styles.sectionIntro}>
            Pick a ready-made instruction or type your own. The assistant will plan, simulate, and execute with production-grade safeguards.
          </p>
          <div className={styles.promptGrid}>{promptButtons}</div>
        </section>
      </div>
    </div>
  );
}
