import { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardBody, CardHeader, Heading, SimpleGrid, Text } from '@chakra-ui/react';

import { QuickStats } from '../components/QuickStats';

export const metadata: Metadata = {
  title: 'Mission Control Overview'
};

const tiles = [
  {
    title: 'Create Book Artifact',
    description: 'Author guided knowledge artifacts with LLM co-authors and Markdown preview.',
    href: '/create-book'
  },
  {
    title: 'Launch Evaluation Arena',
    description: 'Configure agent cohorts and monitor live success trajectories.',
    href: '/start-arena'
  },
  {
    title: 'Scoreboard & Validator Analytics',
    description: 'Compare artifact Elo, difficulty curves, and validator honesty metrics.',
    href: '/scoreboard'
  },
  {
    title: 'Artifact Graph',
    description: 'Visualize derivative relationships and spawn actionable jobs from graph nodes.',
    href: '/artifact-graph'
  },
  {
    title: 'Owner Control Panel',
    description: 'Pause levers, contract parameters, and identity attestations in one cockpit.',
    href: '/owner-control'
  }
];

export default function Page() {
  return (
    <div className="space-y-8">
      <QuickStats />
      <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing={6}>
        {tiles.map((tile) => (
          <Card key={tile.title} className="border border-slate-700/60 bg-slate-900/80 backdrop-blur transition hover:border-indigo-400/70">
            <CardHeader>
              <Heading size="md">
                <Link href={tile.href} className="text-indigo-300 hover:text-indigo-200">
                  {tile.title}
                </Link>
              </Heading>
            </CardHeader>
            <CardBody>
              <Text color="gray.300">{tile.description}</Text>
            </CardBody>
          </Card>
        ))}
      </SimpleGrid>
    </div>
  );
}
