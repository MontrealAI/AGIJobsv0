import templates from './pipelines.json';
import { StageDefinition } from './execution';
import { getHandler, AgentHandler } from './agents';
import { JobStageSpec } from './jobClassifier';

type PipelineStageConfig = JobStageSpec;

interface PipelineTemplate {
  stages: PipelineStageConfig[];
}

const pipelineTemplates: Record<string, PipelineTemplate> = templates as Record<
  string,
  PipelineTemplate
>;

export interface PipelineContext {
  jobId: string;
  category: string;
  tags: string[];
  metadata?: Record<string, unknown>;
}

function normalizeStages(
  category: string,
  pipelineSpec?: JobStageSpec[]
): PipelineStageConfig[] {
  if (pipelineSpec && pipelineSpec.length) {
    return pipelineSpec;
  }
  const template = pipelineTemplates[category] || pipelineTemplates.default;
  if (!template) {
    throw new Error(`No pipeline template for category ${category}`);
  }
  return template.stages;
}

function wrapHandler(
  handler: AgentHandler,
  context: PipelineContext,
  stage: PipelineStageConfig
): (payload: unknown) => Promise<unknown> {
  return async (payload: unknown) =>
    handler({
      context: {
        jobId: context.jobId,
        stageName: stage.name,
        category: context.category,
        tags: context.tags,
        metadata: {
          ...(context.metadata ?? {}),
          stageDescription: stage.description,
        },
      },
      payload,
    });
}

export function buildPipeline(
  context: PipelineContext,
  pipelineSpec?: JobStageSpec[]
): StageDefinition[] {
  const stages = normalizeStages(context.category, pipelineSpec);
  return stages.map((stage) => {
    const definition: StageDefinition = {
      name: stage.name,
      agent: stage.endpoint
        ? stage.endpoint
        : wrapHandler(
            getHandler(stage.handler ?? 'report.generate'),
            context,
            stage
          ),
      signerId: stage.signer,
    };
    return definition;
  });
}
