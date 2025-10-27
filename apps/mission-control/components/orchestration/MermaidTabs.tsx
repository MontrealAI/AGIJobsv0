import { Icon, Tab, TabList, TabPanel, TabPanels, Tabs } from '@chakra-ui/react';

import { MermaidDiagram } from '../MermaidDiagram';
import { FlowTab } from './types';

export interface MermaidTabsProps {
  flows: FlowTab[];
}

export function MermaidTabs({ flows }: MermaidTabsProps) {
  return (
    <Tabs variant="enclosed" colorScheme="purple">
      <TabList overflowX="auto">
        {flows.map((flow) => (
          <Tab key={flow.id} gap={2}>
            <Icon as={flow.icon} /> {flow.title}
          </Tab>
        ))}
      </TabList>
      <TabPanels>
        {flows.map((flow) => (
          <TabPanel key={flow.id} px={0}>
            <MermaidDiagram chart={flow.chart} caption={flow.caption} />
          </TabPanel>
        ))}
      </TabPanels>
    </Tabs>
  );
}
