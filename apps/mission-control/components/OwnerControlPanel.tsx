'use client';

import { useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardBody,
  CardHeader,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Tooltip
} from '@chakra-ui/react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import { launchArena } from '../lib/orchestrator';
import { useSystemStatus } from '../context/SystemStatusContext';

export function OwnerControlPanel() {
  const { paused, setPaused } = useSystemStatus();
  const [gasLimit, setGasLimit] = useState('1200000');
  const [cooldown, setCooldown] = useState('12');
  const [identityStatus, setIdentityStatus] = useState<'verified' | 'pending' | 'revoked'>('verified');
  const [cohort, setCohort] = useState('vanguard');

  const mutation = useMutation({
    mutationFn: () => launchArena({ artifactName: 'Owner parameter change', cohort, targetSuccessRate: 88 }),
    onSuccess: () => toast.success('Parameter change submitted via orchestrator'),
    onError: (err) => toast.error((err as Error).message)
  });

  const togglePause = () => {
    setPaused(!paused);
    toast.success(`System ${!paused ? 'paused' : 'resumed'} via control panel`);
  };

  return (
    <Stack spacing={6}>
      <Card className="border border-slate-700/60 bg-slate-900/80">
        <CardHeader>
          <Heading size="md" color="indigo.200">
            System Safeguards
          </Heading>
        </CardHeader>
        <CardBody>
          <Stack spacing={4}>
            <FormControl display="flex" alignItems="center" justifyContent="space-between">
              <FormLabel mb="0">Pause orchestrator interactions</FormLabel>
              <Switch colorScheme="red" isChecked={paused} onChange={togglePause} />
            </FormControl>
            <Tooltip label="Select the validator cohort used for emergency calls" hasArrow>
              <FormControl>
                <FormLabel>Validator cohort</FormLabel>
                <Select value={cohort} onChange={(event) => setCohort(event.target.value)}>
                  <option value="vanguard">Vanguard Validators</option>
                  <option value="codex">Codex Co-Authors</option>
                  <option value="synthesis">Synthesis Orchestrators</option>
                </Select>
              </FormControl>
            </Tooltip>
            <Button colorScheme="red" onClick={() => toast.success('Emergency pause transaction queued')}>
              Trigger emergency pause transaction
            </Button>
          </Stack>
        </CardBody>
      </Card>

      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6}>
        <Card className="border border-slate-700/60 bg-slate-900/80">
          <CardHeader>
            <Heading size="sm" color="indigo.200">
              Parameter Updates
            </Heading>
          </CardHeader>
          <CardBody>
            <Stack spacing={4}>
              <FormControl>
                <FormLabel>Max gas per job</FormLabel>
                <Input value={gasLimit} onChange={(event) => setGasLimit(event.target.value)} />
              </FormControl>
              <FormControl>
                <FormLabel>Cooldown (hours)</FormLabel>
                <Input value={cooldown} onChange={(event) => setCooldown(event.target.value)} />
              </FormControl>
              <Button colorScheme="purple" onClick={() => mutation.mutate()} isLoading={mutation.isPending}>
                Submit parameter bundle
              </Button>
            </Stack>
          </CardBody>
        </Card>

        <Card className="border border-slate-700/60 bg-slate-900/80">
          <CardHeader>
            <Heading size="sm" color="indigo.200">
              Identity Management
            </Heading>
          </CardHeader>
          <CardBody>
            <Stack spacing={4}>
              <FormControl>
                <FormLabel>Validator identity status</FormLabel>
                <Select value={identityStatus} onChange={(event) => setIdentityStatus(event.target.value as typeof identityStatus)}>
                  <option value="verified">Verified</option>
                  <option value="pending">Pending</option>
                  <option value="revoked">Revoked</option>
                </Select>
              </FormControl>
              <Box className="rounded-lg border border-slate-600/60 bg-slate-800/80 p-4 text-sm text-slate-200">
                <Text>
                  ENS registry attestation is {identityStatus}. Validators receive weekly identity pings with fallback to
                  guardian quorum if status degrades.
                </Text>
              </Box>
              <Button variant="outline" colorScheme="green" onClick={() => toast.success('Identity refresh broadcasted')}>
                Refresh identity attestations
              </Button>
            </Stack>
          </CardBody>
        </Card>
      </SimpleGrid>
    </Stack>
  );
}
