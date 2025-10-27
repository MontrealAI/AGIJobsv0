import { Heading, Stat, StatGroup, StatHelpText, StatLabel, StatNumber, Stack } from '@chakra-ui/react';

import { JobMetric } from './types';

export interface JobMetricsPanelProps {
  metrics: JobMetric[];
}

export function JobMetricsPanel({ metrics }: JobMetricsPanelProps) {
  return (
    <Stack spacing={4}>
      <Heading size="md" color="white">
        Job Metrics & Governance Rhythm
      </Heading>
      <StatGroup className="rounded-3xl border border-slate-700/60 bg-slate-900/70 p-6">
        {metrics.map((metric) => (
          <Stat key={metric.label} px={{ base: 0, md: 4 }} py={2} minW={{ md: '200px' }}>
            <StatLabel color="gray.400">{metric.label}</StatLabel>
            <StatNumber color="white">{metric.value}</StatNumber>
            <StatHelpText color="green.300">{metric.delta}</StatHelpText>
          </Stat>
        ))}
      </StatGroup>
    </Stack>
  );
}
