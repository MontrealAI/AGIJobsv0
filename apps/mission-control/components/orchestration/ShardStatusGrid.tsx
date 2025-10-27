import {
  Badge,
  Box,
  Card,
  CardBody,
  CardHeader,
  Flex,
  Heading,
  Icon,
  SimpleGrid,
  Stack,
  Text
} from '@chakra-ui/react';
import { FaGlobe } from 'react-icons/fa';

import { ShardStatus } from './types';

const statusAccent: Record<ShardStatus['health'], string> = {
  Nominal: 'green',
  Degraded: 'orange',
  Critical: 'red'
};

export interface ShardStatusGridProps {
  shards: ShardStatus[];
}

export function ShardStatusGrid({ shards }: ShardStatusGridProps) {
  return (
    <Stack spacing={6}>
      <Heading size="md" color="white">
        Shard Status & Telemetry
      </Heading>
      <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={6}>
        {shards.map((shard) => (
          <Card key={shard.id} className="border border-slate-700/60 bg-slate-900/70">
            <CardHeader>
              <Flex justify="space-between" align="center">
                <Heading size="sm" color="white">
                  {shard.id}
                </Heading>
                <Badge colorScheme={statusAccent[shard.health]} variant="subtle" px={3} py={1} borderRadius="full">
                  {shard.health}
                </Badge>
              </Flex>
            </CardHeader>
            <CardBody>
              <Stack spacing={3} color="gray.200">
                <Flex justify="space-between">
                  <Text fontWeight="semibold">Thermal</Text>
                  <Text>{shard.temperature}</Text>
                </Flex>
                <Flex justify="space-between">
                  <Text fontWeight="semibold">Active jobs</Text>
                  <Text>{shard.jobsActive.toLocaleString()}</Text>
                </Flex>
                <Flex justify="space-between">
                  <Text fontWeight="semibold">Latency</Text>
                  <Text>{shard.latencyMs} ms</Text>
                </Flex>
                <Box>
                  <Flex justify="space-between" mb={1}>
                    <Text fontWeight="semibold">Load</Text>
                    <Text>{Math.round(shard.load * 100)}%</Text>
                  </Flex>
                  <Box className="h-2 overflow-hidden rounded-full bg-slate-800">
                    <Box
                      className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-indigo-400"
                      width={`${Math.min(shard.load * 100, 100)}%`}
                    />
                  </Box>
                </Box>
                <Stack spacing={1} fontSize="sm">
                  {shard.anomalies.map((note) => (
                    <Flex key={note} align="center" gap={2}>
                      <Icon as={FaGlobe} color="cyan.300" />
                      <Text>{note}</Text>
                    </Flex>
                  ))}
                </Stack>
              </Stack>
            </CardBody>
          </Card>
        ))}
      </SimpleGrid>
    </Stack>
  );
}
