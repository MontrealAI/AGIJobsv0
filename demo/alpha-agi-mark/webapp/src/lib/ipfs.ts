export async function pinJSON(apiUrl: string, token: string | undefined, payload: unknown) {
  const body = new FormData();
  body.append('file', new Blob([JSON.stringify(payload)], { type: 'application/json' }));

  const response = await fetch(`${apiUrl}/add?pin=true`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body
  });

  if (!response.ok) {
    throw new Error(`IPFS pin failed: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  const match = text.match(/"(Hash|cid)":"([^"]+)"/);
  if (!match) {
    throw new Error('Unable to parse CID from IPFS response');
  }
  return `ipfs://${match[2]}`;
}
