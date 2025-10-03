'use client';

import { ConnectionPanel } from './ConnectionPanel';
import { JobLifecycleDashboard } from './JobLifecycleDashboard';
import { DeliverableVerificationPanel } from './DeliverableVerificationPanel';
import { CertificateGallery } from './CertificateGallery';
import { SlaViewer } from './SlaViewer';
import { useJobFeed } from '../hooks/useJobFeed';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ConversationalJobComposer } from './ConversationalJobComposer';
import { AgentOpportunitiesPanel } from './AgentOpportunitiesPanel';
import { ValidatorInbox } from './ValidatorInbox';
import { HelpCenterDrawer } from './HelpCenterDrawer';
import { SupportChecklist } from './SupportChecklist';
import { useLocalization } from '../context/LocalizationContext';

export const PortalPage = () => {
  const { jobs, events, loading, error } = useJobFeed({ watch: true });
  const { t } = useLocalization();

  return (
    <div className="portal-shell">
      <header className="portal-header">
        <div>
          <h1>{t('app.title')}</h1>
          <p>{t('app.subtitle')}</p>
        </div>
        <LanguageSwitcher />
      </header>
      <div className="portal-grid">
        <div className="primary-column">
          <ConnectionPanel />
          <ConversationalJobComposer />
          <JobLifecycleDashboard jobs={jobs} events={events} loading={loading} error={error} />
        </div>
        <aside className="secondary-column">
          <AgentOpportunitiesPanel jobs={jobs} loading={loading} error={error} />
          <ValidatorInbox events={events} loading={loading} />
          <SupportChecklist />
          <HelpCenterDrawer />
        </aside>
      </div>
      <div className="portal-lower-grid">
        <DeliverableVerificationPanel events={events} />
        <div className="grid">
          <CertificateGallery />
          <SlaViewer />
        </div>
      </div>
    </div>
  );
};
