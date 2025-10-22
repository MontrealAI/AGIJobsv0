import { Metadata } from 'next';
import { Heading, Text } from '@chakra-ui/react';

import { ScoreboardView } from '../../components/ScoreboardView';

export const metadata: Metadata = {
  title: 'Scoreboard'
};

export default function Page() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Heading size="lg">Scoreboard</Heading>
        <Text color="gray.300">
          Track artifact Elo performance, inspect difficulty sparklines, monitor success-rate trajectories, and verify validator
          honesty snapshots in one consolidated analytics view.
        </Text>
      </div>
      <ScoreboardView />
    </div>
  );
}
