import React from "react";

export interface ScoreboardAgent {
  id: string;
  rating: number;
}

export interface ScoreboardProps {
  agents: ScoreboardAgent[];
  difficulty: number;
}

export const Scoreboard: React.FC<ScoreboardProps> = ({ agents, difficulty }) => {
  return (
    <section aria-labelledby="scoreboard-heading" className="rounded-lg border border-purple-400 p-6 shadow-xl bg-slate-950/60 text-white">
      <div className="flex items-center justify-between">
        <h2 id="scoreboard-heading" className="text-2xl font-bold tracking-wide">
          CULTURE Self-Play Scoreboard
        </h2>
        <span className="text-sm uppercase tracking-widest text-purple-200">Difficulty {difficulty}</span>
      </div>
      <ol className="mt-4 space-y-2">
        {agents.map((agent) => (
          <li key={agent.id} className="flex items-center justify-between rounded-md bg-white/5 px-4 py-2">
            <span className="font-semibold">{agent.id}</span>
            <span className="text-purple-200">{agent.rating}</span>
          </li>
        ))}
      </ol>
    </section>
  );
};
