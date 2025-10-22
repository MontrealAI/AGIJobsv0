'use client';

import { Card, CardBody, Flex, Progress, SimpleGrid, Stat, StatArrow, StatHelpText, StatLabel, StatNumber } from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';

const fetchSummary = async () => {
  const res = await fetch('/api/summary');
  if (!res.ok) {
    throw new Error('Failed to load summary');
  }
  return (await res.json()) as {
    activeArenas: number;
    mintedArtifacts: number;
    validatorHonesty: number;
    paused: boolean;
  };
};

export function QuickStats() {
  const { data } = useQuery({ queryKey: ['summary'], queryFn: fetchSummary, initialData: { activeArenas: 2, mintedArtifacts: 148, validatorHonesty: 97, paused: false } });

  return (
    <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
      <Card className="border border-slate-700/60 bg-slate-900/80">
        <CardBody>
          <Stat>
            <StatLabel>Active Arenas</StatLabel>
            <StatNumber>{data?.activeArenas ?? 0}</StatNumber>
            <StatHelpText>
              <StatArrow type="increase" /> 12% vs last week
            </StatHelpText>
          </Stat>
        </CardBody>
      </Card>
      <Card className="border border-slate-700/60 bg-slate-900/80">
        <CardBody>
          <Stat>
            <StatLabel>Minted Artifacts</StatLabel>
            <StatNumber>{data?.mintedArtifacts ?? 0}</StatNumber>
            <StatHelpText>
              <StatArrow type="increase" /> 8 new this week
            </StatHelpText>
          </Stat>
        </CardBody>
      </Card>
      <Card className="border border-slate-700/60 bg-slate-900/80">
        <CardBody>
          <Stat>
            <StatLabel>Validator Honesty</StatLabel>
            <Flex align="center" gap={4}>
              <StatNumber>{data?.validatorHonesty ?? 0}%</StatNumber>
              <Progress value={data?.validatorHonesty ?? 0} colorScheme="green" rounded="lg" className="flex-1" />
            </Flex>
            <StatHelpText>{data?.paused ? 'Paused' : 'Healthy quorum'}</StatHelpText>
          </Stat>
        </CardBody>
      </Card>
    </SimpleGrid>
  );
}
