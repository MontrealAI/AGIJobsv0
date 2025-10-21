'use client';

import { useCallback, useState } from 'react';
import { ChatWindow } from '../components/ChatWindow';
import { OneBoxMissionPanel } from '../components/OneBoxMissionPanel';
import styles from './page.module.css';

type PrefillState = {
  id: string;
  text: string;
};

export default function Page() {
  const [prefill, setPrefill] = useState<PrefillState | null>(null);

  const handlePromptSelect = useCallback((text: string) => {
    setPrefill({ id: crypto.randomUUID(), text });
  }, []);

  const handlePrefillConsumed = useCallback(() => {
    setPrefill(null);
  }, []);

  return (
    <div className={styles.pageLayout}>
      <div className={styles.chatPane}>
        <ChatWindow
          prefillRequest={prefill}
          onPrefillConsumed={handlePrefillConsumed}
        />
      </div>
      <aside className={styles.cockpitPane}>
        <OneBoxMissionPanel onPromptSelect={handlePromptSelect} />
      </aside>
    </div>
  );
}
