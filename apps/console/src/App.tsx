import { useCallback, useEffect, useState } from 'react';
import ConnectionPanel from './components/ConnectionPanel';
import PoliciesPanel from './components/PoliciesPanel';
import GovernanceActionForm from './components/GovernanceActionForm';
import GasPanel from './components/GasPanel';
import ReceiptsViewer from './components/ReceiptsViewer';
import { ApiProvider, useApi } from './context/ApiContext';
import { GovernanceSnapshot } from './types';

function AppShell() {
  const { config, request } = useApi();
  const [snapshot, setSnapshot] = useState<GovernanceSnapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);

  const refreshSnapshot = useCallback(
    async (signal?: AbortSignal) => {
      if (!config) {
        setSnapshot(null);
        setSnapshotLoading(false);
        setSnapshotError(null);
        return;
      }
      setSnapshotLoading(true);
      setSnapshotError(null);
      try {
        const data = await request<GovernanceSnapshot>(
          'governance/snapshot',
          { signal }
        );
        if (signal?.aborted) return;
        setSnapshot(data);
      } catch (error) {
        if (signal?.aborted) return;
        setSnapshotError(
          error instanceof Error
            ? error.message
            : 'Failed to load governance snapshot.'
        );
      } finally {
        if (signal?.aborted) return;
        setSnapshotLoading(false);
      }
    },
    [config, request]
  );

  useEffect(() => {
    if (!config) {
      setSnapshot(null);
      setSnapshotLoading(false);
      return;
    }
    const controller = new AbortController();
    refreshSnapshot(controller.signal);
    return () => controller.abort();
  }, [config, refreshSnapshot]);

  return (
    <div className="app-shell">
      <h1>AGI Jobs Owner Console</h1>
      <div className="panel-grid">
        <ConnectionPanel onConfigSaved={() => setSnapshot(null)} />
        <PoliciesPanel
          snapshot={snapshot}
          refreshing={snapshotLoading}
          onRefresh={refreshSnapshot}
        />
        <GovernanceActionForm onAfterSubmit={refreshSnapshot} />
        <GasPanel />
        <ReceiptsViewer />
      </div>
      {snapshotError && (
        <p className="helper-text" role="alert" style={{ marginTop: '1rem' }}>
          {snapshotError}
        </p>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ApiProvider>
      <AppShell />
    </ApiProvider>
  );
}
