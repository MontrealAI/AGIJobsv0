import { create as createIpfs } from 'ipfs-http-client';

export async function pinJSON(apiUrl: string, token: string | undefined, data: unknown) {
  const client = token
    ? createIpfs({ url: apiUrl, headers: { Authorization: `Bearer ${token}` } })
    : createIpfs({ url: apiUrl });
  const { cid } = await client.add(JSON.stringify(data));
  return `ipfs://${cid.toString()}`;
}
