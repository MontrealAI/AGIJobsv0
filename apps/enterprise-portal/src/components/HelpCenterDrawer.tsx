'use client';

import { useState } from 'react';
import { useLocalization } from '../context/LocalizationContext';

export const HelpCenterDrawer = () => {
  const { t } = useLocalization();
  const [open, setOpen] = useState(false);

  return (
    <section className={`help-drawer ${open ? 'open' : ''}`}>
      <button className="secondary" type="button" onClick={() => setOpen((value) => !value)}>
        {t('help.title')}
      </button>
      {open && (
        <div className="help-content">
          <p>{t('help.subtitle')}</p>
          <div className="help-links">
            <a href="/docs/enterprise-portal-user-guides" target="_blank" rel="noreferrer">
              {t('help.guides.employer')}
            </a>
            <a href="/docs/enterprise-portal-user-guides#agent" target="_blank" rel="noreferrer">
              {t('help.guides.agent')}
            </a>
            <a href="/docs/enterprise-portal-user-guides#validator" target="_blank" rel="noreferrer">
              {t('help.guides.validator')}
            </a>
          </div>
          <ul className="faq-list">
            <li>{t('help.faq.agents')}</li>
            <li>{t('help.faq.deadlines')}</li>
            <li>{t('help.faq.disputes')}</li>
          </ul>
          <a className="tag purple" href="https://github.com/MontrealAI/AGIJobsv0" target="_blank" rel="noreferrer">
            {t('help.cta')}
          </a>
        </div>
      )}
    </section>
  );
};
