'use client';

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';

import en from '../i18n/en.json';
import es from '../i18n/es.json';
import fr from '../i18n/fr.json';
import ja from '../i18n/ja.json';
import zh from '../i18n/zh.json';

type TranslationTree = Record<string, string | TranslationTree>;

export type SupportedLanguage = 'en' | 'fr' | 'es' | 'ja' | 'zh';

const translations: Record<SupportedLanguage, TranslationTree> = {
  en,
  fr,
  es,
  ja,
  zh
};

interface LocalizationContextValue {
  language: SupportedLanguage;
  setLanguage: (language: SupportedLanguage) => void;
  t: (key: string, fallback?: string) => string;
  availableLanguages: { code: SupportedLanguage; label: string }[];
}

const labels: Record<SupportedLanguage, string> = {
  en: 'English',
  fr: 'Français',
  es: 'Español',
  ja: '日本語',
  zh: '中文'
};

const LocalizationContext = createContext<LocalizationContextValue | undefined>(undefined);

export const LocalizationProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguage] = useState<SupportedLanguage>('en');

  const value = useMemo<LocalizationContextValue>(() => {
    const dictionary = translations[language] ?? translations.en;

    const translate = (key: string, fallback?: string) => {
      if (!key) return fallback ?? key;
      const resolved = dictionary[key];
      if (typeof resolved === 'string') return resolved;
      const nested = key.split('.').reduce<string | TranslationTree | undefined>((acc, part) => {
        if (!acc) return undefined;
        if (typeof acc === 'string') return acc;
        return acc[part];
      }, dictionary);
      if (typeof nested === 'string') return nested;
      return fallback ?? key;
    };

    const availableLanguages = (Object.keys(labels) as SupportedLanguage[]).map((code) => ({
      code,
      label: labels[code]
    }));

    return {
      language,
      setLanguage,
      t: translate,
      availableLanguages
    };
  }, [language]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language;
    }
  }, [language]);

  return <LocalizationContext.Provider value={value}>{children}</LocalizationContext.Provider>;
};

export const useLocalization = () => {
  const context = useContext(LocalizationContext);
  if (!context) {
    throw new Error('useLocalization must be used within a LocalizationProvider');
  }
  return context;
};
