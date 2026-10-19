export const resolveResourceUri = (value?: string, gateway = 'https://ipfs.io/ipfs/'):
  | string
  | undefined => {
  if (typeof value !== 'string' || !value || value.length > 8192 || /[\s\u0000-\u001f\u007f\\]/u.test(value)) return undefined;
  if (/^ipfs:\/\//i.test(value)) {
    const resource = value.slice(7).replace(/^ipfs\//i, '');
    const [root, ...segments] = resource.split('/');
    if (!/^[a-z0-9]{1,128}$/i.test(root)) return undefined;
    try {
      for (const segment of segments) {
        const decoded = decodeURIComponent(segment);
        if (decoded === '.' || decoded === '..' || /[\u0000-\u001f\u007f%\\/?#]/u.test(decoded)) return undefined;
      }
      const base = resolveResourceUri(gateway);
      if (!base || !base.endsWith('/')) return undefined;
      return `${base}${root}${segments.length ? '/' + segments.join('/') : ''}`;
    } catch { return undefined; }
  }
  if (!/^https:\/\//i.test(value)) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return undefined;
    return url.href;
  } catch { return undefined; }
};

export const isIpfsUri = (value?: string): boolean => {
  if (!value) return false;
  return /^ipfs:\/\//i.test(value);
};

export const displayResourceUri = (value?: string): string | undefined => {
  if (!value) return undefined;
  if (isIpfsUri(value)) {
    return value;
  }
  return value.replace(/^https?:\/\//, '').replace(/\/$/, '');
};
