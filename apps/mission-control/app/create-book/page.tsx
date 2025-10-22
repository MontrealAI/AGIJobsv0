import { Metadata } from 'next';
import { Heading, Text } from '@chakra-ui/react';

import { CreateBookWizard } from '../../components/CreateBookWizard';

export const metadata: Metadata = {
  title: 'Create Book Artifact'
};

export default function Page() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Heading size="lg">Create Book Artifact</Heading>
        <Text color="gray.300">
          Use the orchestrator-assisted wizard to co-author a knowledge artifact. Interleave chat feedback, inspect Markdown
          preview, and finalize by uploading to IPFS before mint confirmation.
        </Text>
      </div>
      <CreateBookWizard />
    </div>
  );
}
