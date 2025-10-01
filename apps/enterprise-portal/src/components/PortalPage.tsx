'use client';

import { ConnectionPanel } from './ConnectionPanel';
import { JobSubmissionForm } from './JobSubmissionForm';
import { JobLifecycleDashboard } from './JobLifecycleDashboard';
import { DeliverableVerificationPanel } from './DeliverableVerificationPanel';
import { ValidatorLogPanel } from './ValidatorLogPanel';
import { CertificateGallery } from './CertificateGallery';
import { SlaViewer } from './SlaViewer';
import { useJobFeed } from '../hooks/useJobFeed';

export const PortalPage = () => {
  const { jobs, events, loading, error } = useJobFeed({ watch: true });

  return (
    <div className="grid" style={{ gap: '2.5rem' }}>
      <ConnectionPanel />
      <JobSubmissionForm />
      <JobLifecycleDashboard jobs={jobs} events={events} loading={loading} error={error} />
      <ValidatorLogPanel events={events} />
      <div className="grid two-column">
        <DeliverableVerificationPanel events={events} />
        <div className="grid">
          <CertificateGallery />
          <SlaViewer />
        </div>
      </div>
    </div>
  );
};
