import { Metadata } from 'next';
import { Heading, Text } from '@chakra-ui/react';

import { OwnerControlPanel } from '../../components/OwnerControlPanel';

export const metadata: Metadata = {
  title: 'Owner Control Panel'
};

export default function Page() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Heading size="lg">Owner Control Panel</Heading>
        <Text color="gray.300">
          Manage pause levers, orchestrator parameter bundles, and validator identity attestations directly from mission
          control.
        </Text>
      </div>
      <OwnerControlPanel />
    </div>
  );
}
