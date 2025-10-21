import { loadArtifactMetadata } from './artifacts.js';

export interface PromptContext {
  readonly artifactId: number;
  readonly difficulty: number;
  readonly roundId: number;
}

export interface TeacherPrompt {
  readonly prompt: string;
  readonly metadata: Awaited<ReturnType<typeof loadArtifactMetadata>>;
}

const BASE_TEMPLATE = `You are the culture programme's lead educator.

Round {{roundId}} focuses on artifact {{artifactId}} ({{title}}).

Provide a challenge for students operating at difficulty {{difficulty}}.
Summarise the historical significance and reference the source URI when available.
Ensure instructions are safe, constructive, and respect cultural sensitivities.`;

function renderTemplate(context: PromptContext, metadata: TeacherPrompt['metadata']): string {
  return BASE_TEMPLATE.replace('{{roundId}}', String(context.roundId))
    .replace('{{artifactId}}', String(context.artifactId))
    .replace('{{difficulty}}', String(context.difficulty))
    .replace('{{title}}', metadata.title);
}

export async function buildTeacherPrompt(context: PromptContext): Promise<TeacherPrompt> {
  const metadata = await loadArtifactMetadata(context.artifactId);
  const prompt = renderTemplate(context, metadata);
  return { prompt, metadata };
}
