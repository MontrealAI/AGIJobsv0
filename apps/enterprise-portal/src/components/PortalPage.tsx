'use client';

import { LanguageSelector } from './LanguageSelector';
import { ConversationalJobCreator } from './ConversationalJobCreator';
import { AgentInbox } from './AgentInbox';
import { ValidatorConsole } from './ValidatorConsole';
import { HelpCenter } from './SupportHelpCenter';
import { OnboardingChecklist } from './SetupChecklist';
import { NotificationPanel } from './SmartNotificationPanel';
import { useJobFeed } from '../hooks/useJobFeed';
import { useTranslation } from '../context/LanguageContext';

export const PortalPage = () => {
  const { jobs, events, validators, loading, error, hasValidationModule } =
    useJobFeed({ watch: true });
  const { t } = useTranslation();

  return (
    <div className="portal-shell">
      <header className="portal-header">
        <div>
          <h1>{t('header.title')}</h1>
          <p>{t('header.subtitle')}</p>
        </div>
        <LanguageSelector />
      </header>
      {error && (
        <div className="alert error">
          {t('common.error', { message: error })}
        </div>
      )}
      <main className="portal-main">
        <div className="portal-content">
          <div className="portal-column portal-column--primary">
            <ConversationalJobCreator />
            <AgentInbox jobs={jobs} loading={loading} error={error} />
            <ValidatorConsole
              events={events}
              validators={validators}
              loading={loading}
              hasValidationModule={hasValidationModule}
            />
          </div>
          <aside className="portal-column portal-column--secondary">
            <OnboardingChecklist />
            <NotificationPanel jobs={jobs} />
            <HelpCenter />
          </aside>
        </div>
      </main>
    </div>
  );
};
