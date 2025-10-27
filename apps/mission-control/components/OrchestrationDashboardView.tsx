'use client';

import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Alert,
  AlertIcon,
  Badge,
  Box,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Flex,
  Heading,
  Icon,
  Link as ChakraLink,
  SimpleGrid,
  Spinner,
  Stack,
  Stat,
  StatGroup,
  StatHelpText,
  StatLabel,
  StatNumber,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Tag,
  Text,
  Tooltip
} from '@chakra-ui/react';
import NextLink from 'next/link';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FaBolt,
  FaChartLine,
  FaCloudUploadAlt,
  FaGlobe,
  FaProjectDiagram,
  FaServer,
  FaShieldAlt
} from 'react-icons/fa';

import { MermaidDiagram } from './MermaidDiagram';
import fallbackDashboard from '../data/orchestration/dashboard.json';
import type {
  JobMetric,
  MarketplaceNode,
  MissionControlDashboard,
  ShardHealth,
  ShardStatus,
  StoryScenario
} from '../types/orchestration-dashboard';

const initialDashboard = fallbackDashboard as MissionControlDashboard;

const statusAccent: Record<ShardHealth, string> = {
  Nominal: 'green',
  Degraded: 'orange',
  Critical: 'red'
};

const fetchDashboard = async (): Promise<MissionControlDashboard> => {
  const res = await fetch('/api/orchestration/dashboard', { cache: 'no-store' });
  if (!res.ok) {
    throw new Error('Failed to load mission control telemetry');
  }
  return (await res.json()) as MissionControlDashboard;
};

const toTemperature = (value: number) => `${value.toFixed(1)}°C`;

export function OrchestrationDashboardView() {
  const { data, isFetching, isError, error } = useQuery<MissionControlDashboard>({
    queryKey: ['mission-control-dashboard'],
    queryFn: fetchDashboard,
    initialData: initialDashboard,
    refetchInterval: 60_000,
    staleTime: 30_000
  });

  const shards = useMemo<ShardStatus[]>(() => data?.shards ?? [], [data?.shards]);
  const marketplace = useMemo<MarketplaceNode[]>(() => data?.marketplace ?? [], [data?.marketplace]);
  const jobMetrics = useMemo<JobMetric[]>(() => data?.jobMetrics ?? initialDashboard.jobMetrics, [data?.jobMetrics]);
  const scenarios = useMemo<StoryScenario[]>(() => data?.scenarios ?? [], [data?.scenarios]);
  const flows = data?.flows ?? initialDashboard.flows;

  return (
    <Stack spacing={8} pb={16}>
      <Box className="rounded-3xl border border-indigo-500/40 bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 p-8">
        <Flex direction={{ base: 'column', lg: 'row' }} justify="space-between" align={{ base: 'flex-start', lg: 'center' }}>
          <Box mb={{ base: 6, lg: 0 }}>
            <Heading size="lg" color="white">
              Orchestration Mission Console
            </Heading>
            <Text color="gray.300" maxW="3xl" mt={3} fontSize="lg">
              Track shard thermals, broker specialized nodes, and narrate superintelligent job lifecycles with live policy
              checkpoints.
            </Text>
          </Box>
          <Stack direction={{ base: 'column', md: 'row' }} spacing={4} align="center">
            {isFetching ? (
              <Tag colorScheme="purple" size="lg" px={4} py={2} fontWeight="bold">
                <Spinner size="sm" mr={2} /> Refreshing telemetry
              </Tag>
            ) : null}
            <Tooltip label="Mean inference actions cleared per second" placement="top">
              <Tag colorScheme="purple" size="lg" px={4} py={2} fontWeight="bold">
                <Icon as={FaBolt} mr={2} /> 312 actions/s
              </Tag>
            </Tooltip>
            <Tooltip label="Policy safety sentinel uptime across shards" placement="top">
              <Tag colorScheme="cyan" size="lg" px={4} py={2} fontWeight="bold">
                <Icon as={FaShieldAlt} mr={2} /> 99.996% sentinel uptime
              </Tag>
            </Tooltip>
          </Stack>
        </Flex>
        {isError ? (
          <Alert status="warning" mt={6} borderRadius="lg" bg="yellow.900" borderColor="yellow.600" borderWidth="1px">
            <AlertIcon />
            {error instanceof Error ? error.message : 'Mission console telemetry unavailable; showing cached data.'}
          </Alert>
        ) : null}
      </Box>

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
                    <Text>{toTemperature(shard.temperatureC)}</Text>
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

      <Stack spacing={6}>
        <Heading size="md" color="white">
          Node Marketplace Pulse
        </Heading>
        <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing={6}>
          {marketplace.map((node) => (
            <Card key={node.id} className="border border-slate-700/60 bg-slate-900/70">
              <CardHeader>
                <Heading size="sm" color="white">
                  {node.id}
                </Heading>
                <Text color="gray.400" fontSize="sm">
                  {node.operator}
                </Text>
              </CardHeader>
              <CardBody>
                <Stack spacing={3} color="gray.200">
                  <Flex align="center" gap={2}>
                    <Icon as={FaProjectDiagram} color="purple.300" />
                    <Text>{node.specialization}</Text>
                  </Flex>
                  <Flex justify="space-between">
                    <Text>Credibility</Text>
                    <Badge colorScheme="purple" borderRadius="md">
                      {(node.credibility * 100).toFixed(0)}%
                    </Badge>
                  </Flex>
                  <Flex justify="space-between">
                    <Text>Slot price</Text>
                    <Text>{node.slotPrice} credits/hr</Text>
                  </Flex>
                  <Flex justify="space-between">
                    <Text>Availability</Text>
                    <Text>{node.eta}</Text>
                  </Flex>
                  <Badge
                    colorScheme={
                      node.status === 'Available' ? 'green' : node.status === 'Negotiating' ? 'orange' : 'blue'
                    }
                  >
                    {node.status}
                  </Badge>
                </Stack>
              </CardBody>
            </Card>
          ))}
        </SimpleGrid>
      </Stack>

      <Stack spacing={4}>
        <Heading size="md" color="white">
          Job Metrics & Governance Rhythm
        </Heading>
        <StatGroup className="rounded-3xl border border-slate-700/60 bg-slate-900/70 p-6">
          {jobMetrics.map((metric) => (
            <Stat key={metric.label} px={{ base: 0, md: 4 }} py={2} minW={{ md: '200px' }}>
              <StatLabel color="gray.400">{metric.label}</StatLabel>
              <StatNumber color="white">{metric.value}</StatNumber>
              <StatHelpText color="green.300">{metric.delta}</StatHelpText>
            </Stat>
          ))}
        </StatGroup>
      </Stack>

      <Tabs variant="enclosed" colorScheme="purple">
        <TabList overflowX="auto">
          <Tab gap={2}>
            <Icon as={FaServer} /> Shard choreography
          </Tab>
          <Tab gap={2}>
            <Icon as={FaCloudUploadAlt} /> Deployment & upgrades
          </Tab>
          <Tab gap={2}>
            <Icon as={FaChartLine} /> Narrative scenarios
          </Tab>
        </TabList>
        <TabPanels>
          <TabPanel px={0}>
            <MermaidDiagram
              chart={flows.orchestrator}
              caption="Shard-aware routing with marketplace feedback loops."
            />
          </TabPanel>
          <TabPanel px={0}>
            <MermaidDiagram chart={flows.upgrade} caption="Automated upgrade guardrail handshake." />
          </TabPanel>
          <TabPanel px={0}>
            <MermaidDiagram chart={flows.storytelling} caption="Story-first coordination pulses." />
          </TabPanel>
        </TabPanels>
      </Tabs>

      <Stack spacing={6}>
        <Heading size="md" color="white">
          Story-driven Operational Scenarios
        </Heading>
        <Text color="gray.300">
          Rehearse superintelligent-scale coordination with curated story beats. Each vignette pairs CLI automation with human
          oversight rituals—dive deeper in the accompanying playbook within <code>docs/orchestration/scenarios</code>.
        </Text>
        <Accordion allowToggle>
          {scenarios.map((scenario) => (
            <AccordionItem key={scenario.slug} border="none">
              <AccordionButton className="rounded-xl border border-slate-700/60 bg-slate-900/70 px-4 py-3">
                <Box as="span" flex="1" textAlign="left">
                  <Text color="white" fontWeight="semibold">
                    {scenario.title}
                  </Text>
                  <Text color="gray.400" fontSize="sm">
                    {scenario.summary}
                  </Text>
                </Box>
                <AccordionIcon color="purple.200" />
              </AccordionButton>
              <AccordionPanel
                pt={4}
                pb={2}
                color="gray.200"
                className="border border-slate-700/60 bg-slate-900/40 rounded-xl mt-2"
              >
                <Stack spacing={3} mb={scenario.assets?.length ? 4 : 0}>
                  {scenario.steps.map((step) => (
                    <Text key={step}>{step}</Text>
                  ))}
                </Stack>
                {scenario.assets?.length ? (
                  <Stack spacing={2} fontSize="sm">
                    <Text fontWeight="semibold" color="white">
                      Storytelling assets
                    </Text>
                    {scenario.assets.map((asset) => {
                      const isExternal = asset.href.startsWith('http');
                      const href = isExternal ? asset.href : `/${asset.href}`;
                      return (
                        <ChakraLink
                          key={asset.href}
                          as={isExternal ? undefined : NextLink}
                          href={href}
                          color="cyan.300"
                          isExternal={isExternal}
                        >
                          {asset.label}
                        </ChakraLink>
                      );
                    })}
                  </Stack>
                ) : null}
              </AccordionPanel>
            </AccordionItem>
          ))}
        </Accordion>
      </Stack>

      <Divider borderColor="slateblue" opacity={0.3} />

      <Text color="gray.400" fontSize="sm">
        {data?.tip ?? initialDashboard.tip}
      </Text>
    </Stack>
  );
}
