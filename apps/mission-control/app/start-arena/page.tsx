import { Metadata } from 'next';
import { Heading, Text } from '@chakra-ui/react';

import { StartArenaWizard } from '../../components/StartArenaWizard';

export const metadata: Metadata = {
  title: 'Start Arena'
};

export default function Page() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Heading size="lg">Start Arena</Heading>
        <Text color="gray.300">
          Configure an artifact evaluation arena, select agent cohorts, and monitor live WebSocket-inspired updates that trace
          sandbox preparation through validator-signed completion.
        </Text>
      </div>
      <StartArenaWizard />
    </div>
  );
}
