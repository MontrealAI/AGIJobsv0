'use client';

import { createContext, useContext, useMemo, useState } from 'react';

type SystemStatus = {
  paused: boolean;
  setPaused: (value: boolean) => void;
};

const SystemStatusContext = createContext<SystemStatus | undefined>(undefined);

export function useSystemStatus() {
  const ctx = useContext(SystemStatusContext);
  if (!ctx) {
    throw new Error('SystemStatusContext is not available');
  }
  return ctx;
}

export function SystemStatusProvider({ children }: { children: React.ReactNode }) {
  const [paused, setPaused] = useState(false);
  const value = useMemo(() => ({ paused, setPaused }), [paused]);

  return <SystemStatusContext.Provider value={value}>{children}</SystemStatusContext.Provider>;
}
