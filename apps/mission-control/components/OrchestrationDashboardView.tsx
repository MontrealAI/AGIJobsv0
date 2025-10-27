'use client';

import { Box, Flex, Heading, Icon, Stack, Tag, Text, Tooltip } from '@chakra-ui/react';
import {
  FaBolt,
  FaChartLine,
  FaCloudUploadAlt,
  FaServer,
  FaShieldAlt
} from 'react-icons/fa';

import { MermaidTabs } from './orchestration/MermaidTabs';
import { JobMetricsPanel } from './orchestration/JobMetricsPanel';
import { MarketplaceGrid } from './orchestration/MarketplaceGrid';
import { ShardStatusGrid } from './orchestration/ShardStatusGrid';
import { StoryScenarios } from './orchestration/StoryScenarios';
import {
  FlowTab,
  JobMetric,
  MarketplaceNode,
  ShardStatus,
  StoryScenario
} from './orchestration/types';

const shardStatuses: ShardStatus[] = [
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
];

const marketplaceNodes: MarketplaceNode[] = [
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
];

const jobMetrics: JobMetric[] = [
  { label: 'Jobs cleared past hour', value: '1,872', delta: '+14% vs avg' },
  { label: 'Critical escalations auto-resolved', value: '41', delta: '92% success' },
  { label: 'Marketplace fill rate', value: '97%', delta: 'High demand equilibrium' },
  { label: 'Governance policy sync', value: '11m', delta: 'Next window 19m' }
];

const flowTabs: FlowTab[] = [
  {
    id: 'shard-choreography',
    title: 'Shard choreography',
    icon: FaServer,
    chart: `flowchart LR
      subgraph Operator
        Intent["Mission Intent\\n(story-driven prompts)"]
      end
      subgraph Marketplace
        Queue>Dynamic Node Queue]
        Auction((Credibility Auction))
      end
      subgraph Fabric
        Intake{{Policy Gate}}
        Planner["Job Planner\\n(shard aware)"]
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
    caption: 'Shard-aware routing with marketplace feedback loops.'
  },
  {
    id: 'deployment-upgrades',
    title: 'Deployment & upgrades',
    icon: FaCloudUploadAlt,
    chart: `sequenceDiagram
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
    caption: 'Automated upgrade guardrail handshake.'
  },
  {
    id: 'narrative-scenarios',
    title: 'Narrative scenarios',
    icon: FaChartLine,
    chart: `journey
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
    caption: 'Story-first coordination pulses.'
  }
];

const storyScenarios: StoryScenario[] = [
  {
    id: 'dawn-corridor',
    title: 'Dawn Corridor – Coordinated shard surge',
    summary: 'Blend narrative assets with automated shard expansion during peak diplomacy workload.',
    steps: [
      <Text key="dawn-step-1">
        1. Launch <code>npm run mission-control:ops deploy -- --network sepolia</code> to stage the surge sandbox.
      </Text>,
      <Text key="dawn-step-2">2. Stream marketplace negotiation script for Saffron-Halo and Graphite-Spark pairings.</Text>,
      <Text key="dawn-step-3">
        3. Capture climax metrics and annotate the storytelling timeline via <code>docs/orchestration/scenarios/superintelligence-playbook.md</code>.
      </Text>
    ]
  },
  {
    id: 'aurora-whisper',
    title: 'Aurora Whisper – Rapid policy harmonization',
    summary: 'Use the policy CLI wrapper to synchronize sentiment guardrails without interrupting creative throughput.',
    steps: [
      <Text key="aurora-step-1">
        1. Dry-run new policy bundle with <code>npm run mission-control:ops policy -- apply --file policies/aurora-whisper.yaml --dry-run</code>.
      </Text>,
      <Text key="aurora-step-2">2. Narrate the ethics sentinel review and capture transcript in the operations log.</Text>,
      <Text key="aurora-step-3">3. Commit the upgrade timestamp for the council briefing kit.</Text>
    ]
  }
];

export function OrchestrationDashboardView() {
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

      <ShardStatusGrid shards={shardStatuses} />

      <MarketplaceGrid nodes={marketplaceNodes} />

      <JobMetricsPanel metrics={jobMetrics} />

      <MermaidTabs flows={flowTabs} />

      <StoryScenarios scenarios={storyScenarios} />
    </Stack>
  );
}
