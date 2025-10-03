'use client';

import { useTranslation } from '../context/LanguageContext';

const resources = [
  {
    key: 'helpCenter.employerGuide',
    href: 'https://github.com/MontrealAI/AGIJobsv0/blob/main/docs/user-guides/employer.md',
  },
  {
    key: 'helpCenter.agentGuide',
    href: 'https://github.com/MontrealAI/AGIJobsv0/blob/main/docs/user-guides/agent.md',
  },
  {
    key: 'helpCenter.validatorGuide',
    href: 'https://github.com/MontrealAI/AGIJobsv0/blob/main/docs/user-guides/validator.md',
  },
  {
    key: 'helpCenter.faq',
    href: 'https://github.com/MontrealAI/AGIJobsv0/blob/main/README.md#faq',
  },
  {
    key: 'helpCenter.docs',
    href: 'https://github.com/MontrealAI/AGIJobsv0/tree/main/docs',
  },
];

export const HelpCenter = () => {
  const { t } = useTranslation();
  return (
    <section className="help-panel">
      <div className="card-title">
        <div>
          <h2>{t('helpCenter.title')}</h2>
          <p>{t('helpCenter.subtitle')}</p>
        </div>
        <div className="tag purple">Docs</div>
      </div>
      <ul className="help-list">
        {resources.map((resource) => (
          <li key={resource.key}>
            <a
              className="chat-link"
              href={resource.href}
              target="_blank"
              rel="noreferrer"
            >
              {t(resource.key)}
            </a>
          </li>
        ))}
      </ul>
      <p className="chat-meta">{t('helpCenter.support')}</p>
    </section>
  );
};
