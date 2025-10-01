export const resolveResourceUri = (value?: string, gateway = 'https://ipfs.io/ipfs/'):
  | string
  | undefined => {
  if (!value) return undefined;
  if (value.startsWith('ipfs://')) {
    const path = value.slice(7);
    const normalised = path.replace(/^ipfs\//, '');
    return `${gateway}${normalised}`;
  }
  return value;
};

export const isIpfsUri = (value?: string): boolean => {
  if (!value) return false;
  return value.startsWith('ipfs://');
};

export const displayResourceUri = (value?: string): string | undefined => {
  if (!value) return undefined;
  if (isIpfsUri(value)) {
    return value;
  }
  return value.replace(/^https?:\/\//, '').replace(/\/$/, '');
};
