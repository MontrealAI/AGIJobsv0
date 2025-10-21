export function normalisePrefix(value) {
  if (value === undefined || value === null) {
    return '';
  }
  const trimmed = String(value).trim();
  if (!trimmed) {
    return '';
  }
  const withLeading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeading.replace(/\/+$/, '');
}

export function buildOneboxUrl(baseUrl, prefix, path) {
  if (!baseUrl || typeof baseUrl !== 'string') {
    throw new Error('ORCH_NOT_SET');
  }
  const trimmedBase = baseUrl.trim().replace(/\/+$/, '');
  let route = typeof path === 'string' ? path : '';
  let query = '';
  const queryIndex = route.indexOf('?');
  if (queryIndex >= 0) {
    query = route.slice(queryIndex + 1);
    route = route.slice(0, queryIndex);
  }
  let cleanedRoute = route.replace(/^\/+/, '');
  if (cleanedRoute.startsWith('onebox/')) {
    cleanedRoute = cleanedRoute.slice('onebox/'.length);
  } else if (cleanedRoute === 'onebox') {
    cleanedRoute = '';
  }
  const normalisedPrefix = normalisePrefix(prefix);
  const prefixSegment = normalisedPrefix ? normalisedPrefix.replace(/^\/+/, '') : '';
  const segments = [trimmedBase];
  if (prefixSegment) {
    segments.push(prefixSegment);
  }
  if (cleanedRoute) {
    segments.push(cleanedRoute);
  }
  const joined = segments.join('/');
  return query ? `${joined}?${query}` : joined;
}

export function parseOverrideParams(href) {
  const result = {
    orchestrator: undefined,
    prefix: undefined,
    token: undefined,
    mode: undefined,
    welcome: undefined,
    examples: undefined,
    appliedParams: [],
  };
  if (!href) {
    return result;
  }
  try {
    const url = new URL(href, 'http://localhost');
    if (url.searchParams.has('orchestrator')) {
      result.appliedParams.push('orchestrator');
      const raw = url.searchParams.get('orchestrator');
      if (raw && raw.trim().toLowerCase() === 'demo') {
        result.orchestrator = '';
      } else if (raw && raw.trim()) {
        result.orchestrator = raw.trim();
      } else {
        result.orchestrator = '';
      }
    }
    if (url.searchParams.has('oneboxPrefix')) {
      result.appliedParams.push('oneboxPrefix');
      result.prefix = normalisePrefix(url.searchParams.get('oneboxPrefix'));
    }
    if (url.searchParams.has('token')) {
      result.appliedParams.push('token');
      const rawToken = url.searchParams.get('token');
      result.token = rawToken ? rawToken.trim() : '';
    }
    if (url.searchParams.has('mode')) {
      result.appliedParams.push('mode');
      const rawMode = url.searchParams.get('mode');
      result.mode = rawMode ? rawMode.trim().toLowerCase() : '';
    }
    if (url.searchParams.has('welcome')) {
      result.appliedParams.push('welcome');
      const rawWelcome = url.searchParams.get('welcome');
      result.welcome = rawWelcome ? rawWelcome.trim() : '';
    }
    if (url.searchParams.has('examples')) {
      result.appliedParams.push('examples');
      const rawExamples = url.searchParams.get('examples');
      if (rawExamples) {
        let parsedExamples = [];
        try {
          const parsed = JSON.parse(rawExamples);
          if (Array.isArray(parsed)) {
            parsedExamples = parsed.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim());
          } else if (typeof parsed === 'string' && parsed.trim()) {
            parsedExamples = [parsed.trim()];
          }
        } catch (error) {
          parsedExamples = rawExamples
            .split(/[\n\r]+|\s*\|\s*/)
            .map((segment) => segment.trim())
            .filter(Boolean);
        }
        result.examples = [...new Set(parsedExamples)];
      } else {
        result.examples = [];
      }
    }
  } catch (error) {
    // ignore malformed URLs but surface them for debugging in non-production contexts
    if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production') {
      console.warn('Failed to parse one-box override parameters', error);
    }
  }
  return result;
}
