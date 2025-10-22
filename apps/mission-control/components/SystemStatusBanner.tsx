'use client';

import { Alert, AlertDescription, AlertIcon, AlertTitle, Button, HStack, Switch, Tooltip } from '@chakra-ui/react';
import { useState } from 'react';
import toast from 'react-hot-toast';

import { useSystemStatus } from '../context/SystemStatusContext';

export function SystemStatusBanner() {
  const { paused, setPaused } = useSystemStatus();
  const [autoResume, setAutoResume] = useState(true);

  const togglePause = () => {
    setPaused(!paused);
    toast.success(`System ${!paused ? 'paused' : 'resumed'}`);
  };

  return (
    <Alert status={paused ? 'warning' : 'success'} variant="solid" className="rounded-none">
      <AlertIcon />
      <AlertTitle>{paused ? 'Safeguards Engaged' : 'System Operational'}</AlertTitle>
      <AlertDescription className="flex flex-1 flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
        <span>
          {paused
            ? 'Interactions are routed to read-only mirrors until validators re-affirm honesty guarantees.'
            : 'Live operations with validator honesty quorum confirmed. Contract calls permitted.'}
        </span>
        <HStack spacing={3}>
          <Tooltip label="Automatically resume when validator honesty exceeds 95%">
            <HStack spacing={2}>
              <Switch isChecked={autoResume} onChange={(evt) => setAutoResume(evt.target.checked)} colorScheme="purple" />
              <span className="text-xs">Auto-resume</span>
            </HStack>
          </Tooltip>
          <Button size="sm" variant="outline" colorScheme={paused ? 'yellow' : 'green'} onClick={togglePause}>
            {paused ? 'Resume' : 'Pause'}
          </Button>
        </HStack>
      </AlertDescription>
    </Alert>
  );
}
