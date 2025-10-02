import type { IPFSHTTPClient } from 'ipfs-http-client';

const IPFS_API_URL = process.env.IPFS_API_URL || 'http://127.0.0.1:5001';

type IpfsFactory = () => IPFSHTTPClient | Promise<IPFSHTTPClient>;

let ipfsClient: IPFSHTTPClient | null = null;
let customFactory: IpfsFactory | null = null;
let defaultFactoryPromise: Promise<IPFSHTTPClient> | null = null;

async function resolveDefaultFactory(): Promise<IPFSHTTPClient> {
  if (!defaultFactoryPromise) {
    defaultFactoryPromise = import('ipfs-http-client').then(({ create }) =>
      create({ url: IPFS_API_URL })
    );
  }
  return defaultFactoryPromise;
}

export function resetIpfsClient(): void {
  ipfsClient = null;
}

export function setIpfsClientFactory(factory: IpfsFactory | null): void {
  customFactory = factory;
  ipfsClient = null;
}

export async function getIpfsClient(): Promise<IPFSHTTPClient> {
  if (ipfsClient) {
    return ipfsClient;
  }
  if (customFactory) {
    ipfsClient = await Promise.resolve(customFactory());
    return ipfsClient;
  }
  ipfsClient = await resolveDefaultFactory();
  return ipfsClient;
}
