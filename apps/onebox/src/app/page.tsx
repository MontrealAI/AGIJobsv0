'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChatWindow } from '../components/ChatWindow';
import { OneBoxMissionPanel } from '../components/OneBoxMissionPanel';
import { OnboardingModal } from '../components/OnboardingModal';
import styles from './page.module.css';

type PrefillState = {
  id: string;
  text: string;
};

export default function Page() {
  const [prefill, setPrefill] = useState<PrefillState | null>(null);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);

  const handlePromptSelect = useCallback((text: string) => {
    setPrefill({ id: crypto.randomUUID(), text });
  }, []);

  const handlePrefillConsumed = useCallback(() => {
    setPrefill(null);
  }, []);

  const openOnboarding = useCallback(() => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem('onebox:onboarding:dismissed');
      } catch (error) {
        console.error('Failed to clear onboarding dismissal', error);
      }
    }
    setIsOnboardingOpen(true);
  }, []);

  const closeOnboarding = useCallback(() => {
    setIsOnboardingOpen(false);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('onebox:onboarding:dismissed', '1');
      } catch (error) {
        console.error('Failed to persist onboarding dismissal', error);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      const dismissed = window.localStorage.getItem('onebox:onboarding:dismissed');
      if (!dismissed) {
        setIsOnboardingOpen(true);
      }
    } catch (error) {
      console.error('Failed to read onboarding state', error);
      setIsOnboardingOpen(true);
    }
  }, []);

  return (
    <>
      <div className={styles.pageLayout}>
        <div className={styles.chatPane}>
          <ChatWindow
            prefillRequest={prefill}
            onPrefillConsumed={handlePrefillConsumed}
          />
        </div>
        <aside className={styles.cockpitPane}>
          <OneBoxMissionPanel
            onPromptSelect={handlePromptSelect}
            onOpenOnboarding={openOnboarding}
          />
        </aside>
      </div>
      <OnboardingModal
        open={isOnboardingOpen}
        onClose={closeOnboarding}
        onPromptSelect={handlePromptSelect}
      />
    </>
  );
}
