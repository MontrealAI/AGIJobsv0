'use client';

import { useLocalization } from '../context/LocalizationContext';

export const SupportChecklist = () => {
  const { t } = useLocalization();

  const items = [
    { id: 'wallet', label: t('support.checklist.wallet') },
    { id: 'ens', label: t('support.checklist.ens') },
    { id: 'stake', label: t('support.checklist.stake') },
    { id: 'job', label: t('support.checklist.job') }
  ];

  return (
    <section className="support-checklist">
      <h3>{t('support.checklist.title')}</h3>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <span aria-hidden="true">✅</span>
            {item.label}
          </li>
        ))}
      </ul>
      <p className="tip">{t('support.checklist.tip')}</p>
    </section>
  );
};
