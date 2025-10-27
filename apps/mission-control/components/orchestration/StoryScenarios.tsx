import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
  Divider,
  Heading,
  Stack,
  Text
} from '@chakra-ui/react';

import { StoryScenario } from './types';

export interface StoryScenariosProps {
  scenarios: StoryScenario[];
}

export function StoryScenarios({ scenarios }: StoryScenariosProps) {
  return (
    <Stack spacing={6}>
      <Heading size="md" color="white">
        Story-driven Operational Scenarios
      </Heading>
      <Text color="gray.300">
        Rehearse superintelligent-scale coordination with curated story beats. Each vignette pairs CLI automation with human
        oversight rituals—dive deeper in the accompanying playbook within <code>docs/orchestration/scenarios</code>.
      </Text>
      <Accordion allowToggle>
        {scenarios.map((scenario) => (
          <AccordionItem border="none" key={scenario.id}>
            <AccordionButton className="rounded-xl border border-slate-700/60 bg-slate-900/70 px-4 py-3">
              <Box as="span" flex="1" textAlign="left">
                <Text color="white" fontWeight="semibold">
                  {scenario.title}
                </Text>
                <Text color="gray.400" fontSize="sm">
                  {scenario.summary}
                </Text>
              </Box>
              <AccordionIcon color="purple.200" />
            </AccordionButton>
            <AccordionPanel
              pt={4}
              pb={2}
              color="gray.200"
              className="border border-slate-700/60 bg-slate-900/40 rounded-xl mt-2"
            >
              <Stack spacing={3}>{scenario.steps}</Stack>
            </AccordionPanel>
          </AccordionItem>
        ))}
      </Accordion>
      <Divider borderColor="slateblue" opacity={0.3} />
      <Text color="gray.400" fontSize="sm">
        Tip: pair this dashboard with the mission control CLI <code>npm run mission-control:ops -- --help</code> and the
        non-technical tutorial under <code>docs/orchestration/mission-control-tutorial.md</code> for an end-to-end command center.
      </Text>
    </Stack>
  );
}
