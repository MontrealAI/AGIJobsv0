export interface ScoreboardResponse {
  agents: { id: string; rating: number }[];
  difficulty: number;
}

export async function fetchScoreboard(baseUrl = "http://localhost:4000"): Promise<ScoreboardResponse> {
  const res = await fetch(`${baseUrl}/arena/scoreboard`);
  if (!res.ok) {
    throw new Error(`Failed to fetch scoreboard: ${res.status}`);
  }
  return (await res.json()) as ScoreboardResponse;
}
