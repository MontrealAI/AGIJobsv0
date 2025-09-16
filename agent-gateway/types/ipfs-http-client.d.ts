declare module 'ipfs-http-client' {
  export interface IPFSHTTPClient {
    add(
      data: Parameters<typeof JSON.stringify>[0] | Uint8Array,
      options?: Record<string, unknown>
    ): Promise<{ cid: { toString(): string } }>;
    addAll?(
      input: AsyncIterable<any> | Iterable<any>,
      options?: Record<string, unknown>
    ): AsyncIterable<{ cid: { toString(): string } }>;
    pin: {
      add(cid: unknown, options?: Record<string, unknown>): Promise<void>;
    };
  }

  export function create(
    options?:
      | string
      | URL
      | {
          url?: string | URL;
          protocol?: string;
          host?: string;
          port?: string | number;
          headers?: Record<string, string>;
        }
  ): IPFSHTTPClient;
}
