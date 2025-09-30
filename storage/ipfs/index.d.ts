export type IpfsProviderKind = "self-hosted" | "pinning";

export interface IpfsProviderConfig {
  name: string;
  endpoint: string;
  kind: IpfsProviderKind;
  headers?: Record<string, string>;
  formField?: string;
  filename?: string;
  timeoutMs?: number;
}

export interface ArweaveMirrorConfig {
  endpoint: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  enabled?: boolean;
}

export interface IpfsUploaderOptions {
  providers?: IpfsProviderConfig[];
  fetch?: typeof fetch;
  maxAttempts?: number;
  initialBackoffMs?: number;
  timeoutMs?: number;
  contentType?: string;
  filename?: string;
  mirrorToArweave?: boolean;
  arweave?: ArweaveMirrorConfig | null;
}

export interface PinOptions {
  contentType?: string;
  filename?: string;
  mirrorToArweave?: boolean;
}

export interface PinResult {
  cid: string;
  uri: string;
  provider: string;
  size: number;
  mirrors?: {
    arweave?: {
      id: string;
      uri: string;
    };
  };
}

export interface IpfsUploader {
  pin(payload: unknown, options?: PinOptions): Promise<PinResult>;
}

export function createIpfsUploader(options?: IpfsUploaderOptions): IpfsUploader;

export function resolveProvidersFromEnv(env?: Record<string, string | undefined>): IpfsProviderConfig[];

export function resolveArweaveConfig(env?: Record<string, string | undefined>): ArweaveMirrorConfig | null;
