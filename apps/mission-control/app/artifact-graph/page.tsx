import { Metadata } from 'next';
import { Heading, Text } from '@chakra-ui/react';

import { ArtifactGraph } from '../../components/ArtifactGraph';

export const metadata: Metadata = {
  title: 'Artifact Graph'
};

export default function Page() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Heading size="lg">Artifact Graph</Heading>
        <Text color="gray.300">
          Explore artifact influence pathways, highlight actionable derivatives, and seed new jobs from high-impact nodes.
        </Text>
      </div>
      <ArtifactGraph />
    </div>
  );
}
