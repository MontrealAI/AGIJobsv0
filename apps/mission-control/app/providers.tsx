'use client';

import { ApolloProvider } from '@apollo/client';
import { ChakraProvider, ColorModeScript, extendTheme } from '@chakra-ui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useMemo } from 'react';
import { Toaster } from 'react-hot-toast';

import { SystemStatusProvider } from '../context/SystemStatusContext';
import { getApolloClient } from '../lib/apolloClient';

const theme = extendTheme({
  styles: {
    global: {
      body: {
        bg: '#0f172a',
        color: 'gray.100'
      }
    }
  },
  config: {
    initialColorMode: 'dark',
    useSystemColorMode: false
  }
});

export function AppProviders({ children }: { children: ReactNode }) {
  const queryClient = useMemo(() => new QueryClient(), []);
  const apolloClient = useMemo(() => getApolloClient(), []);

  return (
    <ChakraProvider theme={theme}>
      <ColorModeScript initialColorMode={theme.config.initialColorMode} />
      <QueryClientProvider client={queryClient}>
        <ApolloProvider client={apolloClient}>
          <SystemStatusProvider>
            {children}
            <Toaster position="bottom-right" toastOptions={{ style: { background: '#1e293b', color: '#f1f5f9' } }} />
          </SystemStatusProvider>
        </ApolloProvider>
      </QueryClientProvider>
    </ChakraProvider>
  );
}
