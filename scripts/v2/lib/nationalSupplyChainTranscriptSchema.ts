import { z } from 'zod';

import type { NationalSupplyChainTranscript } from './nationalSupplyChainTranscript';

const timelineEntrySchema = z.object({
  kind: z.enum([
    'section',
    'step',
    'job-summary',
    'balance',
    'owner-action',
    'summary',
    'insight',
  ]),
  label: z.string().min(1, 'timeline entry label required'),
  at: z.string().min(1, 'timeline entry timestamp required'),
  scenario: z.string().min(1).optional(),
  meta: z.record(z.unknown()).optional(),
});

const ownerActionSchema = z.object({
  label: z.string().min(1, 'owner action label required'),
  contract: z.string().min(1, 'owner action contract required'),
  method: z.string().min(1, 'owner action method required'),
  at: z.string().min(1, 'owner action timestamp required'),
  parameters: z.record(z.unknown()).optional(),
});

const scenarioEntrySchema = z.object({
  title: z.string().min(1, 'scenario title required'),
  jobId: z.string().min(1, 'scenario jobId required'),
  timelineIndices: z
    .array(z.number().int())
    .min(5, 'scenario must reference at least five timeline entries'),
});

const mintedCertificateSchema = z.object({
  jobId: z.string().min(1, 'certificate jobId required'),
  owner: z.string().min(1).optional(),
  uri: z.string().min(1).optional(),
});

const agentPortfolioSchema = z.object({
  name: z.string().min(1, 'agent portfolio name required'),
  address: z.string().min(1, 'agent portfolio address required'),
  certificates: z.array(mintedCertificateSchema).min(0),
});

const validatorPortfolioSchema = z.object({
  name: z.string().min(1, 'validator portfolio name required'),
  address: z.string().min(1, 'validator portfolio address required'),
});

const marketSnapshotSchema = z.object({
  totalJobs: z.string().min(1, 'market.totalJobs missing'),
  totalBurned: z.string().min(1, 'market.totalBurned missing'),
  finalSupply: z.string().min(1, 'market.finalSupply missing'),
  feePct: z.number().finite('market.feePct missing'),
  validatorRewardPct: z.number().finite('market.validatorRewardPct missing'),
  pendingFees: z.string().min(1, 'market.pendingFees missing'),
  totalAgentStake: z.string().min(1, 'market.totalAgentStake missing'),
  totalValidatorStake: z.string().min(1, 'market.totalValidatorStake missing'),
  mintedCertificates: z
    .array(mintedCertificateSchema)
    .min(2, 'at least two certificates required'),
  agentPortfolios: z
    .array(agentPortfolioSchema)
    .min(2, 'need at least two agent portfolios'),
  validatorCouncil: z
    .array(validatorPortfolioSchema)
    .min(3, 'validator council must have at least three members'),
});

const pauseMatrixSchema = z.object({
  registry: z.boolean(),
  stake: z.boolean(),
  validation: z.boolean(),
});

const controlMatrixSchema = z
  .object({
    module: z.string().min(1, 'control matrix module required'),
    address: z.string().min(1, 'control matrix address required'),
    delegatedTo: z.string().min(1, 'control matrix delegatedTo required'),
    capabilities: z
      .array(z.unknown())
      .min(1, 'control matrix capabilities required'),
    status: z.string().min(1, 'control matrix status required'),
  })
  .array()
  .min(6, 'owner control matrix must enumerate core modules');

const ownerControlSchema = z.object({
  ownerAddress: z.string().min(1, 'owner address missing'),
  moderatorAddress: z.string().min(1, 'moderator address missing'),
  baseline: z.record(z.unknown(), {
    required_error: 'baseline controls missing',
  }),
  upgraded: z.record(z.unknown(), {
    required_error: 'upgraded controls missing',
  }),
  restored: z.record(z.unknown(), {
    required_error: 'restored controls missing',
  }),
  pauseDrill: z.object({
    owner: pauseMatrixSchema,
    moderator: pauseMatrixSchema,
  }),
  drillCompletedAt: z
    .string()
    .min(1, 'pause drill completion timestamp missing'),
  controlMatrix: controlMatrixSchema,
});

const automationSchema = z.object({
  unstoppableScore: z.number().min(95, 'unstoppable score must be at least 95'),
  commands: z
    .object({
      replayDemo: z.string().min(1, 'replay command missing'),
      exportTranscript: z.string().min(1, 'export command missing'),
      launchControlRoom: z.string().min(1, 'control room command missing'),
    })
    .catchall(z.string().min(1)),
});

export const NationalSupplyChainTranscriptSchema = z
  .object({
    generatedAt: z.string().min(1, 'generatedAt timestamp missing'),
    network: z.string().min(1, 'network metadata missing'),
    actors: z.array(z.record(z.unknown())).min(1, 'actors roster missing'),
    ownerActions: z
      .array(ownerActionSchema)
      .min(40, 'insufficient owner actions recorded'),
    timeline: z
      .array(timelineEntrySchema)
      .min(150, 'timeline must contain at least 150 entries'),
    scenarios: z
      .array(scenarioEntrySchema)
      .min(3, 'need at least three scenarios'),
    market: marketSnapshotSchema,
    ownerControl: ownerControlSchema,
    insights: z
      .array(z.record(z.unknown()))
      .min(5, 'insights array must include strategic findings'),
    automation: automationSchema,
  })
  .superRefine((data, ctx) => {
    const ownerTimelineActions = data.timeline.filter(
      (entry) => entry.kind === 'owner-action'
    ).length;
    if (ownerTimelineActions < 20) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'timeline must include at least 20 owner-action events',
        path: ['timeline'],
      });
    }

    const timelineLength = data.timeline.length;
    data.scenarios.forEach((scenario, scenarioIndex) => {
      scenario.timelineIndices.forEach((idx, indexWithinScenario) => {
        if (idx < 0 || idx >= timelineLength) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `scenario ${scenario.title} references out-of-bounds timeline index ${idx}`,
            path: [
              'scenarios',
              scenarioIndex,
              'timelineIndices',
              indexWithinScenario,
            ],
          });
          return;
        }
        const timelineEntry = data.timeline[idx];
        if (
          timelineEntry.scenario &&
          timelineEntry.scenario !== scenario.title
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `timeline entry ${idx} scenario mismatch; expected ${scenario.title}`,
            path: [
              'scenarios',
              scenarioIndex,
              'timelineIndices',
              indexWithinScenario,
            ],
          });
        }
      });
    });

    const scenarioJobIds = new Set(
      data.scenarios.map((scenario) => scenario.jobId)
    );
    data.market.mintedCertificates.forEach((certificate, index) => {
      if (!scenarioJobIds.has(certificate.jobId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `certificate at index ${index} references unknown jobId ${certificate.jobId}`,
          path: ['market', 'mintedCertificates', index, 'jobId'],
        });
      }
    });
  });

export type NationalSupplyChainTranscriptParsed = z.infer<
  typeof NationalSupplyChainTranscriptSchema
>;

export function parseNationalSupplyChainTranscript(
  transcript: unknown
): NationalSupplyChainTranscript & NationalSupplyChainTranscriptParsed {
  const parsed = NationalSupplyChainTranscriptSchema.parse(transcript);
  return parsed as NationalSupplyChainTranscript &
    NationalSupplyChainTranscriptParsed;
}
