'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from '../context/LanguageContext';
import { useWeb3 } from '../context/Web3Context';

const STORAGE_ENS = 'agi-checklist-ens';
const STORAGE_STAKE = 'agi-checklist-stake';

const isBrowser = typeof window !== 'undefined';

const readBoolean = (key: string): boolean => {
  if (!isBrowser) return false;
  return window.localStorage?.getItem(key) === 'true';
};

const writeBoolean = (key: string, value: boolean) => {
  if (!isBrowser) return;
  window.localStorage?.setItem(key, value ? 'true' : 'false');
};

export const OnboardingChecklist = () => {
  const { t } = useTranslation();
  const { address, hasAcknowledged, loadingAck, refreshAcknowledgement } =
    useWeb3();
  const [ensVerified, setEnsVerified] = useState(() =>
    readBoolean(STORAGE_ENS)
  );
  const [stakeReady, setStakeReady] = useState(() =>
    readBoolean(STORAGE_STAKE)
  );

  useEffect(() => {
    writeBoolean(STORAGE_ENS, ensVerified);
  }, [ensVerified]);

  useEffect(() => {
    writeBoolean(STORAGE_STAKE, stakeReady);
  }, [stakeReady]);

  const toggleEns = useCallback(() => {
    setEnsVerified((prev) => !prev);
  }, []);

  const toggleStake = useCallback(() => {
    setStakeReady((prev) => !prev);
  }, []);

  const steps = [
    {
      id: 'wallet',
      label: t('checklist.wallet'),
      completed: Boolean(address),
      actionLabel: undefined,
      action: undefined,
    },
    {
      id: 'ens',
      label: t('checklist.ens'),
      completed: ensVerified,
      actionLabel: ensVerified ? t('checklist.undo') : t('checklist.markDone'),
      action: toggleEns,
    },
    {
      id: 'stake',
      label: t('checklist.stake'),
      completed: stakeReady,
      actionLabel: stakeReady ? t('checklist.undo') : t('checklist.markDone'),
      action: toggleStake,
    },
    {
      id: 'ack',
      label: t('checklist.acknowledgement'),
      completed: Boolean(hasAcknowledged),
      actionLabel: loadingAck ? t('common.loading') : t('checklist.refreshAck'),
      action: loadingAck
        ? undefined
        : () => refreshAcknowledgement().catch(() => undefined),
    },
  ];

  return (
    <section className="checklist-panel">
      <div className="card-title">
        <div>
          <h2>{t('checklist.title')}</h2>
          <p>{t('checklist.instructions')}</p>
        </div>
        <div className="tag blue">Setup</div>
      </div>
      <ul className="checklist">
        {steps.map((step) => (
          <li
            key={step.id}
            className={
              step.completed
                ? 'checklist__item checklist__item--done'
                : 'checklist__item'
            }
          >
            <div>
              <span className="checklist__status" aria-hidden="true">
                {step.completed ? '✅' : '○'}
              </span>
              <span>{step.label}</span>
            </div>
            {step.action && (
              <button
                type="button"
                className="link-button"
                onClick={step.action}
              >
                {step.actionLabel}
              </button>
            )}
            {!step.action && step.actionLabel && (
              <span className="chat-meta">{step.actionLabel}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};
