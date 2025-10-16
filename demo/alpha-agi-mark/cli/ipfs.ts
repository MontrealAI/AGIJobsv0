import { create } from 'ipfs-http-client';

export async function pinJSON(
  apiUrl: string,
  token: string | undefined,
  payload: Record<string, unknown>
): Promise<string> {
  const client = token
    ? create({ url: apiUrl, headers: { Authorization: `Bearer ${token}` } })
    : create({ url: apiUrl });
  const { cid } = await client.add(JSON.stringify(payload));
  return `ipfs://${cid.toString()}`;
}
