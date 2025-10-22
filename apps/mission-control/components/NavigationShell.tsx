'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';
import { Box, Flex, HStack, Icon, IconButton, Tooltip } from '@chakra-ui/react';
import { InfoIcon } from '@chakra-ui/icons';
import { MdBook, MdDashboard, MdPlayArrow, MdPublic, MdSettings, MdTimeline } from 'react-icons/md';

import { useSystemStatus } from '../context/SystemStatusContext';
import { SystemStatusBanner } from './SystemStatusBanner';

const LINKS = [
  { href: '/', label: 'Overview', icon: MdDashboard, description: 'Mission snapshot & weekly reports' },
  { href: '/create-book', label: 'Create Book', icon: MdBook, description: 'Author and mint artifacts' },
  { href: '/start-arena', label: 'Start Arena', icon: MdPlayArrow, description: 'Launch evaluation arenas' },
  { href: '/scoreboard', label: 'Scoreboard', icon: MdTimeline, description: 'Track Elo and win rates' },
  { href: '/artifact-graph', label: 'Artifact Graph', icon: MdPublic, description: 'Explore artifact lineage' },
  { href: '/owner-control', label: 'Owner Control', icon: MdSettings, description: 'Governance controls & identity' }
];

export function NavigationShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { paused } = useSystemStatus();

  return (
    <Flex minH="100vh" direction="column" className="bg-slate-900 text-slate-100">
      <SystemStatusBanner />
      <Flex as="header" px={6} py={4} align="center" justify="space-between" borderBottom="1px" borderColor="whiteAlpha.200">
        <Box>
          <Link href="/" className="text-2xl font-semibold tracking-wide">
            AGIJobs Mission Control
          </Link>
          <p className="text-sm text-slate-400">Operational intelligence, artifact creation, and arena orchestration.</p>
        </Box>
        <Tooltip label="Review the latest owner digest and resilience scorecards." hasArrow>
          <IconButton aria-label="Weekly reports" icon={<Icon as={InfoIcon} />} variant="outline" colorScheme="purple" />
        </Tooltip>
      </Flex>
      <Flex flex="1" direction={{ base: 'column', xl: 'row' }}>
        <Box as="nav" w={{ base: '100%', xl: '280px' }} borderRight={{ base: 'none', xl: '1px' }} borderColor="whiteAlpha.200" p={4}>
          <HStack as="ul" spacing={3} align="stretch" flexDir="column">
            {LINKS.map((link) => {
              const active = pathname === link.href;
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={`group flex items-center gap-3 rounded-lg border border-transparent px-3 py-3 transition-all duration-200 hover:border-indigo-400 hover:bg-slate-800 ${
                      active ? 'border-indigo-500 bg-slate-800 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-300'
                    }`}
                  >
                    <Icon as={link.icon} boxSize={5} className="text-indigo-300" />
                    <div className="flex flex-col">
                      <span className="text-base font-medium">{link.label}</span>
                      <span className="text-xs text-slate-400">{link.description}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </HStack>
          <Box mt={6} className="rounded-lg border border-indigo-500/40 bg-slate-800/70 p-4 text-xs text-slate-300">
            <p className="font-semibold text-indigo-200">Weekly Ops Reports</p>
            <ul className="mt-2 space-y-2">
              {["Week 42: LLM Resilience", "Week 41: Validator Trust", "Week 40: Artifact Throughput"].map((report) => (
                <li key={report}>
                  <Link href="#" className="text-indigo-300 hover:text-indigo-200">
                    {report}
                  </Link>
                </li>
              ))}
            </ul>
          </Box>
        </Box>
        <Box flex="1" position="relative">
          {paused && (
            <Box className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/80 backdrop-blur">
              <div className="rounded-xl border border-yellow-400/60 bg-slate-900 p-10 text-center shadow-2xl shadow-yellow-400/30">
                <h2 className="text-2xl font-semibold text-yellow-200">System Paused</h2>
                <p className="mt-2 text-sm text-yellow-100/80">
                  Interactions are temporarily disabled while on-chain safeguards are engaged.
                </p>
              </div>
            </Box>
          )}
          <Box as="main" className="relative z-10 space-y-6 p-6">
            {children}
          </Box>
        </Box>
      </Flex>
    </Flex>
  );
}
