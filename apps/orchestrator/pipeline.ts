import templates from './pipelines.json';
import { StageDefinition } from './execution';
import { getHandler, AgentHandler, AgentHandlerContext } from './agents';
import { JobStageSpec } from './jobClassifier';
import { approveAgentEndpoint } from './agentPolicy';

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

function buildStageContext(
  pipeline: PipelineContext,
  stage: PipelineStageConfig
): AgentHandlerContext {
  return {
    jobId: pipeline.jobId,
    stageName: stage.name,
    category: pipeline.category,
    tags: pipeline.tags,
    metadata: {
      ...(pipeline.metadata ?? {}),
      stageDescription: stage.description,
    },
  };
}

function wrapHandler(
  handler: AgentHandler,
  context: AgentHandlerContext
): (payload: unknown) => Promise<unknown> {
  return async (payload: unknown) => handler({ context, payload });
}

export function buildPipeline(
  context: PipelineContext,
  pipelineSpec?: JobStageSpec[]
): StageDefinition[] {
  const stages = normalizeStages(context.category, pipelineSpec);
  if (context.category === 'computer-work' && pipelineSpec?.length)
    throw new Error(
      'Computer work uses its reviewed pipeline; custom stages are not allowed'
    );
  return stages.map((stage) => {
    if (
      stage.handler === 'computer.execute' &&
      context.category !== 'computer-work'
    )
      throw new Error('Computer worker requires the computer-work category');
    const handlerContext = buildStageContext(context, stage);
    const definition: StageDefinition = {
      name: stage.name,
      agent: stage.endpoint
        ? approveAgentEndpoint(stage.endpoint)
        : wrapHandler(
            getHandler(stage.handler ?? 'report.generate'),
            handlerContext
          ),
      signerId: stage.signer,
      context: handlerContext,
    };
    return definition;
  });
}
