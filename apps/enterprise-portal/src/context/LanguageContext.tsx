'use client';

import type { ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  fallbackLocale,
  messages,
  supportedLocales,
  type MessageTree,
  type SupportedLocale,
} from '../lib/i18n';

type TranslateVariables = Record<string, string | number>;

type TranslateFn = (key: string, vars?: TranslateVariables) => string;

type LanguageContextValue = {
  locale: SupportedLocale;
  setLocale: (next: SupportedLocale) => void;
  t: TranslateFn;
};

const STORAGE_KEY = 'agi-portal-language';

const LanguageContext = createContext<LanguageContextValue | undefined>(
  undefined
);

const isBrowser = typeof window !== 'undefined';

const normaliseLocale = (
  candidate: string | null | undefined
): SupportedLocale => {
  if (!candidate) return fallbackLocale;
  const lowered = candidate.toLowerCase();
  const direct = supportedLocales.find((entry) => entry === lowered);
  if (direct) return direct;
  const prefix = supportedLocales.find((entry) => lowered.startsWith(entry));
  return prefix ?? fallbackLocale;
};

const detectInitialLocale = (): SupportedLocale => {
  if (isBrowser) {
    const stored = window.localStorage?.getItem(STORAGE_KEY);
    if (stored) return normaliseLocale(stored);
    const fromNavigator =
      window.navigator?.languages?.[0] ?? window.navigator?.language;
    if (fromNavigator) return normaliseLocale(fromNavigator);
  }
  return fallbackLocale;
};

const resolveMessage = (
  tree: MessageTree | string | undefined,
  path: string[]
): string | undefined => {
  if (!tree) return undefined;
  if (typeof tree === 'string') {
    return path.length === 0 ? tree : undefined;
  }
  const [head, ...rest] = path;
  const next = tree[head];
  return resolveMessage(next as MessageTree | string | undefined, rest);
};

const applyTemplate = (template: string, vars?: TranslateVariables): string => {
  if (!vars) return template;
  return template.replace(/{{(.*?)}}/g, (_, rawKey: string) => {
    const key = rawKey.trim();
    if (!Object.prototype.hasOwnProperty.call(vars, key)) return '';
    return String(vars[key]);
  });
};

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [locale, setLocale] = useState<SupportedLocale>(() =>
    detectInitialLocale()
  );

  useEffect(() => {
    if (!isBrowser) return;
    window.localStorage?.setItem(STORAGE_KEY, locale);
  }, [locale]);

  const translate = useCallback<TranslateFn>(
    (key, vars) => {
      const segments = key.split('.').filter(Boolean);
      const candidate = resolveMessage(messages[locale], segments);
      const fallback =
        locale === fallbackLocale
          ? undefined
          : resolveMessage(messages[fallbackLocale], segments);
      const resolved = candidate ?? fallback ?? key;
      return applyTemplate(resolved, vars);
    },
    [locale]
  );

  const value = useMemo<LanguageContextValue>(
    () => ({
      locale,
      setLocale: (next) => {
        setLocale(next);
      },
      t: translate,
    }),
    [locale, translate]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextValue => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

export const useTranslation = () => {
  const { t, locale, setLocale } = useLanguage();
  return { t, locale, setLocale };
};
