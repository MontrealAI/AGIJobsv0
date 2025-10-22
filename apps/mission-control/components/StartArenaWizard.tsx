'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Divider,
  Flex,
  FormControl,
  FormLabel,
  Input,
  NumberInput,
  NumberInputField,
  Select,
  Stack,
  Text
} from '@chakra-ui/react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import { ArenaEvent, createArenaMockSocket, launchArena } from '../lib/orchestrator';

const cohorts = [
  { id: 'vanguard', label: 'Vanguard Validators' },
  { id: 'codex', label: 'Codex Co-Author Agents' },
  { id: 'synthesis', label: 'Synthesis Orchestrators' }
];

const timelineTemplate: ArenaEvent[] = [
  {
    id: 'prepare',
    label: 'Preparing agent sandboxes',
    status: 'pending',
    detail: 'Packaging prompts and risk guards.',
    timestamp: new Date().toISOString()
  },
  {
    id: 'launch',
    label: 'Arena launching',
    status: 'pending',
    detail: 'Dispatching orchestrator handshake to validators.',
    timestamp: new Date().toISOString()
  },
  {
    id: 'evaluation',
    label: 'Evaluations running',
    status: 'pending',
    detail: 'Streaming metrics and validator honesty checks.',
    timestamp: new Date().toISOString()
  },
  {
    id: 'complete',
    label: 'Arena complete',
    status: 'pending',
    detail: 'Publishing scoreboard entries and summaries.',
    timestamp: new Date().toISOString()
  }
];

export function StartArenaWizard() {
  const [artifactName, setArtifactName] = useState('');
  const [cohort, setCohort] = useState(cohorts[0]?.id ?? 'vanguard');
  const [target, setTarget] = useState(75);
  const [events, setEvents] = useState<ArenaEvent[]>(timelineTemplate);
  const [arenaId, setArenaId] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => launchArena({ artifactName, cohort, targetSuccessRate: target }),
    onSuccess: (result) => {
      toast.success(`Arena ${result.arenaId} launched`);
      setArenaId(result.arenaId);
      const enrichedEvents: ArenaEvent[] = timelineTemplate.map((event, index) => ({
        ...event,
        status: (index === 0 ? 'active' : 'pending') as ArenaEvent['status']
      }));
      setEvents(enrichedEvents);
      createArenaMockSocket(
        [
          { ...enrichedEvents[0], status: 'completed' as const },
          { ...enrichedEvents[1], status: 'active' as const },
          { ...enrichedEvents[1], status: 'completed' as const },
          { ...enrichedEvents[2], status: 'active' as const },
          { ...enrichedEvents[2], status: 'completed' as const },
          { ...enrichedEvents[3], status: 'active' as const },
          { ...enrichedEvents[3], status: 'completed' as const }
        ],
        (event) => {
          setEvents((current) =>
            current.map((existing) => (existing.id === event.id ? { ...existing, status: event.status } : existing))
          );
        }
      );
    },
    onError: (err) => toast.error((err as Error).message)
  });

  const validationMessage = useMemo(() => {
    if (!artifactName.trim()) {
      return 'Artifact name is required to contextualize the arena.';
    }
    if (target < 10 || target > 100) {
      return 'Target success rate should be between 10 and 100%.';
    }
    return null;
  }, [artifactName, target]);

  const launchEnabled = !validationMessage && !mutation.isPending;

  useEffect(() => {
    setEvents(timelineTemplate.map((event) => ({ ...event, status: 'pending' })));
  }, []);

  return (
    <Stack spacing={6}>
      <Stack direction={{ base: 'column', md: 'row' }} spacing={6} align="flex-start">
        <FormControl isRequired maxW="lg">
          <FormLabel>Artifact</FormLabel>
          <Input value={artifactName} onChange={(event) => setArtifactName(event.target.value)} placeholder="Nebula Recovery Codex" />
        </FormControl>
        <FormControl maxW="xs">
          <FormLabel>Agent Cohort</FormLabel>
          <Select value={cohort} onChange={(event) => setCohort(event.target.value)}>
            {cohorts.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
        </FormControl>
        <FormControl maxW="xs">
          <FormLabel>Target success rate %</FormLabel>
          <NumberInput value={target} min={10} max={100} onChange={(_, value) => setTarget(Number.isNaN(value) ? target : value)}>
            <NumberInputField />
          </NumberInput>
        </FormControl>
      </Stack>

      <Button colorScheme="purple" size="lg" alignSelf="flex-start" onClick={() => mutation.mutate()} isDisabled={!launchEnabled} isLoading={mutation.isPending}>
        Launch arena
      </Button>
      {validationMessage && <Text color="orange.300">{validationMessage}</Text>}

      {arenaId && (
        <Box className="rounded-lg border border-indigo-500/40 bg-slate-900/70 p-4">
          <Text fontWeight="semibold" color="indigo.200">
            Live status for {arenaId}
          </Text>
          <Divider my={4} borderColor="whiteAlpha.200" />
          <Stack spacing={4}>
            {events.map((event) => (
              <Flex key={event.id} align="center" justify="space-between" className="rounded-lg border border-slate-700/40 bg-slate-800/60 px-4 py-3">
                <div>
                  <Text fontWeight="medium">{event.label}</Text>
                  <Text fontSize="sm" color="gray.400">
                    {event.detail}
                  </Text>
                </div>
                <Badge colorScheme={event.status === 'completed' ? 'green' : event.status === 'active' ? 'purple' : 'gray'}>
                  {event.status}
                </Badge>
              </Flex>
            ))}
          </Stack>
        </Box>
      )}
    </Stack>
  );
}
