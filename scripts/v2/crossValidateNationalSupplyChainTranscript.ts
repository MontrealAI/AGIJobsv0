#!/usr/bin/env ts-node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { validateTranscript } from './lib/nationalSupplyChainTranscript';
import {
  NationalSupplyChainTranscriptSchema,
  parseNationalSupplyChainTranscript,
  type NationalSupplyChainTranscriptParsed,
} from './lib/nationalSupplyChainTranscriptSchema';

function loadTranscript(pathOverride?: string): unknown {
  const path = resolve(
    process.cwd(),
    pathOverride ??
      process.env.AGI_JOBS_DEMO_EXPORT ??
      'demo/National-Supply-Chain-v0/ui/export/latest.json'
  );
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(raw);
}

function ensureChronologicalOrder(
  timeline: NationalSupplyChainTranscriptParsed['timeline']
): void {
  const violations: Array<{
    index: number;
    previous: string;
    current: string;
  }> = [];
  for (let i = 1; i < timeline.length; i += 1) {
    const previousTime = Date.parse(timeline[i - 1].at);
    const currentTime = Date.parse(timeline[i].at);
    if (Number.isNaN(previousTime) || Number.isNaN(currentTime)) {
      continue;
    }
    if (currentTime < previousTime) {
      violations.push({
        index: i,
        previous: timeline[i - 1].at,
        current: timeline[i].at,
      });
    }
  }

  if (violations.length > 0) {
    const detail = violations
      .slice(0, 5)
      .map(
        (violation) =>
          `index ${violation.index} (${violation.current}) < previous (${violation.previous})`
      )
      .join('; ');
    throw new Error(`Timeline chronology violated: ${detail}`);
  }
}

function ensureScenarioCoverage(
  parsed: NationalSupplyChainTranscriptParsed
): void {
  const scenarioJobIds = new Set(
    parsed.scenarios.map((scenario) => scenario.jobId)
  );
  const orphanCertificates = parsed.market.mintedCertificates.filter(
    (certificate) => !scenarioJobIds.has(certificate.jobId)
  );
  if (orphanCertificates.length > 0) {
    const detail = orphanCertificates
      .map((certificate) => certificate.jobId)
      .join(', ');
    throw new Error(`Found certificate(s) without scenarios: ${detail}`);
  }

  parsed.scenarios.forEach((scenario) => {
    const uniqueTimelineIndices = new Set(scenario.timelineIndices);
    if (uniqueTimelineIndices.size !== scenario.timelineIndices.length) {
      throw new Error(
        `Scenario ${scenario.title} references duplicate timeline indices.`
      );
    }
  });
}

function computeSummary(parsed: NationalSupplyChainTranscriptParsed) {
  const ownerActionTimelineCount = parsed.timeline.filter(
    (entry) => entry.kind === 'owner-action'
  ).length;
  const insightCategories = new Set(
    parsed.insights.map((insight) => {
      const record = insight as Record<string, unknown>;
      const candidate = record.category;
      return typeof candidate === 'string' && candidate.trim().length > 0
        ? candidate
        : 'unknown';
    })
  );
  const validatorAddresses = parsed.market.validatorCouncil.map(
    (validator) => validator.address
  );

  return {
    ownerActionTimelineCount,
    timelineLength: parsed.timeline.length,
    insightCategories: insightCategories.size,
    validatorAddresses: new Set(validatorAddresses).size,
    unstoppableScore: parsed.automation.unstoppableScore,
  };
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(
    value
  );
}

function main(): void {
  const transcript = loadTranscript();

  const zodResult = NationalSupplyChainTranscriptSchema.safeParse(transcript);
  if (!zodResult.success) {
    const issueSummary = zodResult.error.issues
      .slice(0, 10)
      .map((issue) => `${issue.path.join('.') || '(root)'} → ${issue.message}`)
      .join('\n');
    throw new Error(`Schema validation failed:\n${issueSummary}`);
  }

  const parsed = parseNationalSupplyChainTranscript(transcript);
  ensureChronologicalOrder(parsed.timeline);
  ensureScenarioCoverage(parsed);

  const imperativeSummary = validateTranscript(transcript);
  const derivedSummary = computeSummary(parsed);

  if (imperativeSummary.timelineLength !== derivedSummary.timelineLength) {
    throw new Error('Timeline length mismatch between validation passes.');
  }
  if (imperativeSummary.ownerActions !== parsed.ownerActions.length) {
    throw new Error('Owner actions mismatch between validation passes.');
  }
  if (
    imperativeSummary.mintedCertificates !==
    parsed.market.mintedCertificates.length
  ) {
    throw new Error(
      'Minted certificate count mismatch between validation passes.'
    );
  }
  if (
    Math.abs(
      imperativeSummary.unstoppableScore - derivedSummary.unstoppableScore
    ) > Number.EPSILON
  ) {
    throw new Error('Unstoppable score mismatch between validation passes.');
  }

  console.log(
    '✅ National supply chain transcript cross-validated by dual engines.'
  );
  console.log(`   • Timeline entries: ${derivedSummary.timelineLength}`);
  console.log(
    `   • Owner actions (timeline / roster): ${derivedSummary.ownerActionTimelineCount} / ${parsed.ownerActions.length}`
  );
  console.log(
    `   • Distinct insight channels: ${derivedSummary.insightCategories}`
  );
  console.log(
    `   • Validator council members confirmed: ${derivedSummary.validatorAddresses}`
  );
  console.log(
    `   • Unstoppable score: ${formatNumber(derivedSummary.unstoppableScore)}`
  );
}

try {
  main();
} catch (error) {
  console.error('❌ Cross-validation failed.');
  if (error instanceof Error) {
    console.error(`   → ${error.message}`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
}
