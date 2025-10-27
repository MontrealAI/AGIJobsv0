'use client';

import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Badge,
  Box,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Flex,
  Heading,
  Icon,
  SimpleGrid,
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
import { useMemo } from 'react';
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

type ShardStatus = {
  id: string;
  temperature: string;
  health: 'Nominal' | 'Degraded' | 'Critical';
  load: number;
  jobsActive: number;
  latencyMs: number;
  anomalies: string[];
};

type MarketplaceNode = {
  id: string;
  operator: string;
  specialization: string;
  credibility: number;
  slotPrice: number;
  eta: string;
  status: 'Available' | 'Negotiating' | 'Queued';
};

type JobMetric = {
  label: string;
  value: string;
  delta: string;
};

const statusAccent: Record<ShardStatus['health'], string> = {
  Nominal: 'green',
  Degraded: 'orange',
  Critical: 'red'
};

export function OrchestrationDashboardView() {
  const shardStatuses = useMemo<ShardStatus[]>(
    () => [
      {
        id: 'Shard Atlas-01',
        temperature: '19.4°C',
        health: 'Nominal',
        load: 0.72,
        jobsActive: 342,
        latencyMs: 58,
        anomalies: ['Adaptive routing engaged', 'Validator gossip stable']
      },
      {
        id: 'Shard Beacon-07',
        temperature: '23.1°C',
        health: 'Nominal',
        load: 0.64,
        jobsActive: 288,
        latencyMs: 64,
        anomalies: ['Thermal fan boost scheduled 21:05z']
      },
      {
        id: 'Shard Horizon-12',
        temperature: '24.8°C',
        health: 'Degraded',
        load: 0.89,
        jobsActive: 417,
        latencyMs: 91,
        anomalies: ['Rollback buffer at 73%', 'AI ethics sentinel issued amber advisory']
      },
      {
        id: 'Shard Lumen-03',
        temperature: '18.7°C',
        health: 'Nominal',
        load: 0.51,
        jobsActive: 196,
        latencyMs: 43,
        anomalies: ['Quantum cache refresh completed']
      }
    ],
    []
  );

  const marketplace = useMemo<MarketplaceNode[]>(
    () => [
      {
        id: 'Node Saffron-Halo',
        operator: 'Madrigal ExoSystems',
        specialization: 'Interlingual arbitration',
        credibility: 0.96,
        slotPrice: 430,
        eta: 'Provisioned in 8m',
        status: 'Available'
      },
      {
        id: 'Node Graphite-Spark',
        operator: 'TeV Horizon Labs',
        specialization: 'Tensor forge simulation',
        credibility: 0.92,
        slotPrice: 680,
        eta: 'Negotiation window 12m',
        status: 'Negotiating'
      },
      {
        id: 'Node Prism-Echo',
        operator: 'Aurora Guild',
        specialization: 'Narrative QA amplification',
        credibility: 0.88,
        slotPrice: 355,
        eta: 'Ready in 3m',
        status: 'Queued'
      }
    ],
    []
  );

  const jobMetrics = useMemo<JobMetric[]>(
    () => [
      { label: 'Jobs cleared past hour', value: '1,872', delta: '+14% vs avg' },
      { label: 'Critical escalations auto-resolved', value: '41', delta: '92% success' },
      { label: 'Marketplace fill rate', value: '97%', delta: 'High demand equilibrium' },
      { label: 'Governance policy sync', value: '11m', delta: 'Next window 19m' }
    ],
    []
  );

  const orchestratorFlow = useMemo(
    () => `flowchart LR
      subgraph Operator
        Intent["Mission Intent\n(story-driven prompts)"]
      end
      subgraph Marketplace
        Queue>Dynamic Node Queue]
        Auction((Credibility Auction))
      end
      subgraph Fabric
        Intake{{Policy Gate}}
        Planner["Job Planner\n(shard aware)"]
        Router["Shard Router"]
        Telemetry[(Telemetry Lake)]
      end
      Intent --> Intake
      Intake --> Planner --> Router
      Router -->|Shard Atlas| Atlas((Shard Atlas-01))
      Router -->|Shard Beacon| Beacon((Shard Beacon-07))
      Router -->|Shard Horizon| Horizon((Shard Horizon-12))
      Atlas --> Telemetry
      Beacon --> Telemetry
      Horizon --> Telemetry
      Queue --> Planner
      Auction --> Queue
    `,
    []
  );

  const upgradeFlow = useMemo(
    () => `sequenceDiagram
      participant Owner as Owner CLI
      participant Sentinel as Safety Sentinel
      participant Contracts as Smart Contracts
      participant Nodes as Marketplace Nodes
      Owner->>Sentinel: Submit upgrade manifest
      Sentinel-->>Owner: Risk assessment & approvals
      Owner->>Contracts: Execute owner:upgrade queue
      Contracts-->>Nodes: Broadcast new runtime
      Nodes-->>Contracts: Attest policy adoption
      Contracts-->>Owner: Emit upgrade completion event
    `,
    []
  );

  const storytellingFlow = useMemo(
    () => `journey
      title Dawn Corridor Scenario
      section Pre-Launch
        Narrative briefing: 5
        Council alignment: 4
      section Execution
        Marketplace onboarding: 4
        Coordinated shard surge: 5
      section Reflection
        Story capture & lessons: 4
    `,
    []
  );

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
          <Stack direction={{ base: 'column', md: 'row' }} spacing={4}>
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
      </Box>

      <Stack spacing={6}>
        <Heading size="md" color="white">
          Shard Status & Telemetry
        </Heading>
        <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={6}>
          {shardStatuses.map((shard) => (
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
                  <Badge colorScheme={node.status === 'Available' ? 'green' : node.status === 'Negotiating' ? 'orange' : 'blue'}>
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
              chart={orchestratorFlow}
              caption="Shard-aware routing with marketplace feedback loops."
            />
          </TabPanel>
          <TabPanel px={0}>
            <MermaidDiagram chart={upgradeFlow} caption="Automated upgrade guardrail handshake." />
          </TabPanel>
          <TabPanel px={0}>
            <MermaidDiagram chart={storytellingFlow} caption="Story-first coordination pulses." />
          </TabPanel>
        </TabPanels>
      </Tabs>

      <Stack spacing={6}>
        <Heading size="md" color="white">
          Story-driven Operational Scenarios
        </Heading>
        <Text color="gray.300">
          Rehearse superintelligent-scale coordination with curated story beats. Each vignette pairs CLI automation with
          human oversight rituals—dive deeper in the accompanying playbook within <code>docs/orchestration/scenarios</code>.
        </Text>
        <Accordion allowToggle>
          <AccordionItem border="none">
            <AccordionButton className="rounded-xl border border-slate-700/60 bg-slate-900/70 px-4 py-3">
              <Box as="span" flex="1" textAlign="left">
                <Text color="white" fontWeight="semibold">
                  Dawn Corridor – Coordinated shard surge
                </Text>
                <Text color="gray.400" fontSize="sm">
                  Blend narrative assets with automated shard expansion during peak diplomacy workload.
                </Text>
              </Box>
              <AccordionIcon color="purple.200" />
            </AccordionButton>
            <AccordionPanel pt={4} pb={2} color="gray.200" className="border border-slate-700/60 bg-slate-900/40 rounded-xl mt-2">
              <Text mb={3}>
                1. Launch <code>npm run mission-control:ops deploy -- --network sepolia</code> to stage the surge sandbox.
              </Text>
              <Text mb={3}>2. Stream marketplace negotiation script for Saffron-Halo and Graphite-Spark pairings.</Text>
              <Text>
                3. Capture climax metrics and annotate the storytelling timeline via <code>docs/orchestration/scenarios/superintelligence-playbook.md</code>.
              </Text>
            </AccordionPanel>
          </AccordionItem>
          <AccordionItem border="none">
            <AccordionButton className="rounded-xl border border-slate-700/60 bg-slate-900/70 px-4 py-3">
              <Box as="span" flex="1" textAlign="left">
                <Text color="white" fontWeight="semibold">
                  Aurora Whisper – Rapid policy harmonization
                </Text>
                <Text color="gray.400" fontSize="sm">
                  Use the policy CLI wrapper to synchronize sentiment guardrails without interrupting creative throughput.
                </Text>
              </Box>
              <AccordionIcon color="purple.200" />
            </AccordionButton>
            <AccordionPanel pt={4} pb={2} color="gray.200" className="border border-slate-700/60 bg-slate-900/40 rounded-xl mt-2">
              <Text mb={3}>
                1. Dry-run new policy bundle with <code>npm run mission-control:ops policy -- apply --file policies/aurora-whisper.yaml --dry-run</code>.
              </Text>
              <Text mb={3}>2. Narrate the ethics sentinel review and capture transcript in the operations log.</Text>
              <Text>3. Commit the upgrade timestamp for the council briefing kit.</Text>
            </AccordionPanel>
          </AccordionItem>
        </Accordion>
      </Stack>

      <Divider borderColor="slateblue" opacity={0.3} />

      <Text color="gray.400" fontSize="sm">
        Tip: pair this dashboard with the mission control CLI <code>npm run mission-control:ops -- --help</code> and the
        non-technical tutorial under <code>docs/orchestration/mission-control-tutorial.md</code> for an end-to-end command
        center.
      </Text>
    </Stack>
  );
}
