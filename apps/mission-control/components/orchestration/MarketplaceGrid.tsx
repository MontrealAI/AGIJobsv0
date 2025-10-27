import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  Flex,
  Heading,
  Icon,
  SimpleGrid,
  Stack,
  Text
} from '@chakra-ui/react';
import { FaProjectDiagram } from 'react-icons/fa';

import { MarketplaceNode } from './types';

export interface MarketplaceGridProps {
  nodes: MarketplaceNode[];
}

export function MarketplaceGrid({ nodes }: MarketplaceGridProps) {
  return (
    <Stack spacing={6}>
      <Heading size="md" color="white">
        Node Marketplace Pulse
      </Heading>
      <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing={6}>
        {nodes.map((node) => (
          <Card key={node.id} className="border border-slate-700/60 bg-slate-900/70">
            <CardHeader>
              <Heading size="sm" color="white">
                {node.id}
              </Heading>
              <Text color="gray.400" fontSize="sm">
                {node.operator}
              </Text>
            </CardHeader>
            <CardBody>
              <Stack spacing={3} color="gray.200">
                <Flex align="center" gap={2}>
                  <Icon as={FaProjectDiagram} color="purple.200" />
                  <Text>{node.specialization}</Text>
                </Flex>
                <Flex justify="space-between">
                  <Text>Credibility</Text>
                  <Badge colorScheme="purple" borderRadius="md">
                    {(node.credibility * 100).toFixed(0)}%
                  </Badge>
                </Flex>
                <Flex justify="space-between">
                  <Text>Slot price</Text>
                  <Text>{node.slotPrice} credits/hr</Text>
                </Flex>
                <Flex justify="space-between">
                  <Text>Availability</Text>
                  <Text>{node.eta}</Text>
                </Flex>
                <Badge
                  colorScheme={node.status === 'Available' ? 'green' : node.status === 'Negotiating' ? 'orange' : 'blue'}
                >
                  {node.status}
                </Badge>
              </Stack>
            </CardBody>
          </Card>
        ))}
      </SimpleGrid>
    </Stack>
  );
}
