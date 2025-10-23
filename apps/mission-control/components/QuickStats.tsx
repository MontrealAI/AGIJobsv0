'use client';

import {
  Card,
  CardBody,
  Flex,
  Progress,
  SimpleGrid,
  Stat,
  StatArrow,
  StatHelpText,
  StatLabel,
  StatNumber,
  Text
} from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';

type Summary = {
  week: string;
  artifactCount: number;
  artifactDelta: number;
  citationDepth: number;
  influenceDispersion: number;
  reuse: number;
  finalizedRounds: number;
  validatorHonesty: number;
  honestyDelta: number;
  difficultyTrend: number;
  paused: boolean;
};

const fetchSummary = async (): Promise<Summary> => {
  const res = await fetch('/api/summary', { cache: 'no-store' });
  if (!res.ok) {
    throw new Error('Failed to load summary');
  }
  return (await res.json()) as Summary;
};

export function QuickStats() {
  const { data } = useQuery<Summary>({
    queryKey: ['summary'],
    queryFn: fetchSummary,
    initialData: {
      week: 'n/a',
      artifactCount: 0,
      artifactDelta: 0,
      citationDepth: 0,
      influenceDispersion: 0,
      reuse: 0,
      finalizedRounds: 0,
      validatorHonesty: 0,
      honestyDelta: 0,
      difficultyTrend: 0,
      paused: false
    }
  });

  const deltaType = (value: number) => (value >= 0 ? 'increase' : 'decrease');

  return (
    <SimpleGrid columns={{ base: 1, md: 2, xl: 5 }} spacing={4}>
      <Card className="border border-slate-700/60 bg-slate-900/80">
        <CardBody>
          <Stat>
            <StatLabel>Artifacts Minted</StatLabel>
            <StatNumber>{data?.artifactCount ?? 0}</StatNumber>
            <StatHelpText>
              <StatArrow type={deltaType(data?.artifactDelta ?? 0)} />
              {Math.abs(data?.artifactDelta ?? 0)} vs prev. week
            </StatHelpText>
            <Text fontSize="sm" color="gray.400">Week {data?.week}</Text>
          </Stat>
        </CardBody>
      </Card>

      <Card className="border border-slate-700/60 bg-slate-900/80">
        <CardBody>
          <Stat>
            <StatLabel>Citation Depth</StatLabel>
            <StatNumber>{(data?.citationDepth ?? 0).toFixed(2)}</StatNumber>
            <StatHelpText>{data?.reuse ?? 0} derivative jobs</StatHelpText>
          </Stat>
        </CardBody>
      </Card>

      <Card className="border border-slate-700/60 bg-slate-900/80">
        <CardBody>
          <Stat>
            <StatLabel>Influence Dispersion</StatLabel>
            <Flex align="center" gap={4}>
              <StatNumber>{(data?.influenceDispersion ?? 0).toFixed(3)}</StatNumber>
              <Progress
                value={(data?.influenceDispersion ?? 0) * 100}
                colorScheme="purple"
                rounded="lg"
                className="flex-1"
              />
            </Flex>
            <StatHelpText>Lower is more equitable</StatHelpText>
          </Stat>
        </CardBody>
      </Card>

      <Card className="border border-slate-700/60 bg-slate-900/80">
        <CardBody>
          <Stat>
            <StatLabel>Validator Honesty</StatLabel>
            <Flex align="center" gap={4}>
              <StatNumber>{(data?.validatorHonesty ?? 0).toFixed(1)}%</StatNumber>
              <Progress
                value={data?.validatorHonesty ?? 0}
                colorScheme={(data?.validatorHonesty ?? 0) > 90 ? 'green' : 'yellow'}
                rounded="lg"
                className="flex-1"
              />
            </Flex>
            <StatHelpText>
              <StatArrow type={deltaType(data?.honestyDelta ?? 0)} />
              {Math.abs(data?.honestyDelta ?? 0).toFixed(1)} pts • {data?.paused ? 'Paused' : 'Active'}
            </StatHelpText>
          </Stat>
        </CardBody>
      </Card>

      <Card className="border border-slate-700/60 bg-slate-900/80">
        <CardBody>
          <Stat>
            <StatLabel>Self-Play Rounds</StatLabel>
            <StatNumber>{data?.finalizedRounds ?? 0}</StatNumber>
            <StatHelpText>
              Difficulty Δ {(data?.difficultyTrend ?? 0).toFixed(2)}
            </StatHelpText>
          </Stat>
        </CardBody>
      </Card>
    </SimpleGrid>
  );
}
