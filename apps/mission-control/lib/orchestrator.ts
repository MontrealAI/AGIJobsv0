export type OrchestratorMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
};

export type BookDraft = {
  title: string;
  synopsis: string;
  outline: string;
  manuscript: string;
};

export async function sendOrchestratorPrompt(prompt: string, context: string) {
  const response = await fetch('/api/orchestrator', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ prompt, context })
  });

  if (!response.ok) {
    throw new Error('Failed to contact orchestrator');
  }

  return (await response.json()) as OrchestratorMessage;
}

export async function uploadToIpfs(payload: { name: string; content: string }) {
  const response = await fetch('/api/ipfs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error('IPFS upload failed');
  }

  return (await response.json()) as { cid: string; url: string };
}

export async function launchArena(config: {
  artifactName: string;
  cohort: string;
  targetSuccessRate: number;
}) {
  const response = await fetch('/api/arena/launch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(config)
  });

  if (!response.ok) {
    throw new Error('Failed to launch arena');
  }

  return (await response.json()) as { arenaId: string };
}

export type ArenaEvent = {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'completed' | 'error';
  detail: string;
  timestamp: string;
};

export function createArenaMockSocket(events: ArenaEvent[], onMessage: (event: ArenaEvent) => void) {
  let index = 0;
  const interval = setInterval(() => {
    if (index >= events.length) {
      clearInterval(interval);
      return;
    }
    onMessage(events[index]);
    index += 1;
  }, 1200);

  return () => clearInterval(interval);
}
