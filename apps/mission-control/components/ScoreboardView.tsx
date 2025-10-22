'use client';

import { gql, useQuery } from '@apollo/client';
import {
  Badge,
  Box,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Heading,
  SimpleGrid,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr
} from '@chakra-ui/react';
import { ResponsiveContainer, LineChart, Line, Tooltip as ChartTooltip, XAxis, YAxis, CartesianGrid, AreaChart, Area } from 'recharts';

const SCOREBOARD_QUERY = gql`
  query Scoreboard {
    artifacts {
      id
      name
      elo
      difficultyTrend
      successRate
    }
    validatorHonesty {
      median
      latestSample {
        label
        honesty
      }
    }
  }
`;

export function ScoreboardView() {
  const { data } = useQuery(SCOREBOARD_QUERY, { fetchPolicy: 'cache-first' });
  const artifacts = data?.artifacts ?? [];
  const validatorHonesty = data?.validatorHonesty ?? { median: 0, latestSample: [] };

  return (
    <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={6}>
      <Card className="border border-slate-700/60 bg-slate-900/80">
        <CardHeader>
          <Heading size="md" color="indigo.200">
            Artifact Elo Scoreboard
          </Heading>
        </CardHeader>
        <CardBody>
          <Table variant="simple" size="sm">
            <Thead>
              <Tr>
                <Th color="gray.300">Artifact</Th>
                <Th color="gray.300">Elo</Th>
                <Th color="gray.300">Success rate</Th>
                <Th color="gray.300">Difficulty sparkline</Th>
              </Tr>
            </Thead>
            <Tbody>
              {artifacts.map((artifact: any) => (
                <Tr key={artifact.id}>
                  <Td>{artifact.name}</Td>
                  <Td>{artifact.elo}</Td>
                  <Td>
                    <Badge colorScheme={artifact.successRate > 0.75 ? 'green' : artifact.successRate > 0.6 ? 'yellow' : 'orange'}>
                      {(artifact.successRate * 100).toFixed(1)}%
                    </Badge>
                  </Td>
                  <Td>
                    <ResponsiveContainer width={120} height={40}>
                      <LineChart data={artifact.difficultyTrend.map((value: number, index: number) => ({ index, value }))}>
                        <Line type="monotone" dataKey="value" stroke="#a855f7" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </CardBody>
      </Card>

      <Card className="border border-slate-700/60 bg-slate-900/80">
        <CardHeader>
          <Heading size="md" color="indigo.200">
            Success Rate Trajectory
          </Heading>
        </CardHeader>
        <CardBody>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={artifacts.map((artifact: any) => ({ name: artifact.name, success: artifact.successRate * 100 }))}>
              <defs>
                <linearGradient id="colorSuccess" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.7} />
                  <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
              <XAxis dataKey="name" stroke="#cbd5f5" />
              <YAxis stroke="#cbd5f5" domain={[0, 100]} />
              <ChartTooltip contentStyle={{ background: '#0f172a', border: '1px solid #475569' }} />
              <Area type="monotone" dataKey="success" stroke="#38bdf8" fillOpacity={1} fill="url(#colorSuccess)" />
            </AreaChart>
          </ResponsiveContainer>
          <Divider my={4} borderColor="whiteAlpha.200" />
          <Box>
            <Heading size="sm" color="indigo.200">
              Validator Honesty Median: {(validatorHonesty.median * 100).toFixed(1)}%
            </Heading>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={validatorHonesty.latestSample}>
                <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                <XAxis dataKey="label" stroke="#cbd5f5" />
                <YAxis stroke="#cbd5f5" domain={[0, 1]} tickFormatter={(value) => `${Math.round(value * 100)}%`} />
                <ChartTooltip formatter={(value: number) => `${Math.round(value * 100)}%`} contentStyle={{ background: '#0f172a', border: '1px solid #475569' }} />
                <Line type="monotone" dataKey="honesty" stroke="#22c55e" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          </Box>
        </CardBody>
      </Card>
    </SimpleGrid>
  );
}
