export async function pinJSON(apiUrl: string, token: string | undefined, data: unknown) {
  const payload = JSON.stringify(data);
  const url = `${apiUrl.replace(/\/$/, '')}/api/v0/add?pin=true`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: payload,
  });
  const text = await response.text();
  const match = text.match(/"Hash"\s*:\s*"([^"]+)"/) || text.match(/"cid"\s*:\s*"([^"]+)"/);
  if (!match) {
    throw new Error(`Unable to parse IPFS response: ${text}`);
  }
  return `ipfs://${match[1]}`;
}
