import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

type FetchMode = 'json' | 'text';

export interface ApiConfig {
  baseUrl: string;
  token: string;
}

interface ApiContextValue {
  config: ApiConfig | null;
  setConfig: (config: ApiConfig | null) => void;
  request: <T = unknown>(
    path: string,
    init?: RequestInit,
    mode?: FetchMode
  ) => Promise<T>;
}

const STORAGE_KEY = 'agi-console.api-config';

const ApiContext = createContext<ApiContextValue | undefined>(undefined);

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/$/, '');
  if (!trimmed) {
    return '';
  }
  if (!/^https?:/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

function loadStoredConfig(): ApiConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ApiConfig>;
    if (
      typeof parsed.baseUrl === 'string' &&
      typeof parsed.token === 'string'
    ) {
      return {
        baseUrl: normalizeBaseUrl(parsed.baseUrl),
        token: parsed.token.trim(),
      };
    }
  } catch (error) {
    console.warn('Failed to read stored API config', error);
  }
  return null;
}

export function ApiProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfigState] = useState<ApiConfig | null>(() =>
    loadStoredConfig()
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!config) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ baseUrl: config.baseUrl, token: config.token })
    );
  }, [config]);

  const setConfig = useCallback((next: ApiConfig | null) => {
    setConfigState(next);
  }, []);

  const request = useCallback(
    async <T = unknown,>(
      path: string,
      init?: RequestInit,
      mode: FetchMode = 'json'
    ): Promise<T> => {
      if (!config) {
        throw new Error('Configure orchestrator base URL and API token.');
      }
      const base = normalizeBaseUrl(config.baseUrl);
      if (!base) {
        throw new Error('Provide a valid orchestrator base URL.');
      }
      const url = `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
      const headers = new Headers(init?.headers ?? {});
      if (config.token) {
        headers.set('Authorization', `Bearer ${config.token}`);
      }
      if (
        !headers.has('Content-Type') &&
        init?.body &&
        typeof init.body === 'string'
      ) {
        headers.set('Content-Type', 'application/json');
      }
      const response = await fetch(url, { ...init, headers });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `(${response.status}) ${errorText || response.statusText}`
        );
      }
      if (response.status === 204) {
        return undefined as T;
      }

      const contentType = response.headers.get('content-type') ?? '';
      const text = await response.text();

      if (!text) {
        return undefined as T;
      }

      if (mode === 'text' || !contentType.includes('application/json')) {
        return text as unknown as T;
      }

      try {
        return JSON.parse(text) as T;
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`Failed to parse JSON response: ${reason}`);
      }
    },
    [config]
  );

  const value = useMemo<ApiContextValue>(
    () => ({
      config,
      setConfig,
      request,
    }),
    [config, setConfig, request]
  );

  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
}

export function useApi(): ApiContextValue {
  const ctx = useContext(ApiContext);
  if (!ctx) {
    throw new Error('useApi must be used within an ApiProvider');
  }
  return ctx;
}
