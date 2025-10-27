import { Metadata } from 'next';

import { OrchestrationDashboardView } from '../../components/OrchestrationDashboardView';

export const metadata: Metadata = {
  title: 'Orchestration Mission Console'
};

export default function OrchestrationDashboardPage() {
  return <OrchestrationDashboardView />;
}
