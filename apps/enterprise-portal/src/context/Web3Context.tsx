'use client';

import { BrowserProvider, JsonRpcSigner } from 'ethers';
import type { ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';
import { portalConfig, getTaxPolicyContract } from '../lib/contracts';

interface Web3ContextValue {
  provider?: BrowserProvider;
  signer?: JsonRpcSigner;
  address?: string;
  chainId?: number;
  hasAcknowledged?: boolean;
  acknowledgementVersion?: bigint;
  loadingAck: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  refreshAcknowledgement: () => Promise<void>;
}

const Web3Context = createContext<Web3ContextValue | undefined>(undefined);

const isBrowser = typeof window !== 'undefined';

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

const getInjectedProvider = (): EthereumProvider | null => {
  if (!isBrowser) return null;
  const { ethereum } = window as unknown as { ethereum?: EthereumProvider };
  return ethereum ?? null;
};

export const Web3Provider = ({ children }: { children: ReactNode }) => {
  const [provider, setProvider] = useState<BrowserProvider>();
  const [signer, setSigner] = useState<JsonRpcSigner>();
  const [address, setAddress] = useState<string>();
  const [chainId, setChainId] = useState<number>();
  const [hasAcknowledged, setHasAcknowledged] = useState<boolean>();
  const [ackVersion, setAckVersion] = useState<bigint>();
  const [loadingAck, setLoadingAck] = useState(false);

  const readAcknowledgement = useCallback(
    async (nextSigner?: JsonRpcSigner, nextAddress?: string) => {
      const effectiveSigner = nextSigner ?? signer;
      const effectiveAddress = nextAddress ?? address;
      if (!effectiveSigner || !effectiveAddress) {
        setHasAcknowledged(undefined);
        setAckVersion(undefined);
        return;
      }
      setLoadingAck(true);
      try {
        const contract = getTaxPolicyContract(effectiveSigner);
        const [ack, version] = await Promise.all([
          contract.hasAcknowledged(effectiveAddress),
          contract.acknowledgedVersion(effectiveAddress)
        ]);
        setHasAcknowledged(Boolean(ack));
        setAckVersion(BigInt(version));
      } catch (error) {
        console.error('Failed to read acknowledgement', error);
        setHasAcknowledged(undefined);
        setAckVersion(undefined);
      } finally {
        setLoadingAck(false);
      }
    },
    [address, signer]
  );

  const connect = useCallback(async () => {
    const injected = getInjectedProvider();
    if (!injected) {
      throw new Error('No Web3 wallet detected. Please install MetaMask or another provider.');
    }
    const browserProvider = new BrowserProvider(injected as never, portalConfig.chainId);
    const nextSigner = await browserProvider.getSigner();
    const nextAddress = await nextSigner.getAddress();
    const network = await browserProvider.getNetwork();
    setProvider(browserProvider);
    setSigner(nextSigner);
    setAddress(nextAddress);
    setChainId(Number(network.chainId));
    await readAcknowledgement(nextSigner, nextAddress);
  }, [readAcknowledgement]);

  const disconnect = useCallback(() => {
    setProvider(undefined);
    setSigner(undefined);
    setAddress(undefined);
    setChainId(undefined);
    setHasAcknowledged(undefined);
    setAckVersion(undefined);
  }, []);

  useEffect(() => {
    if (!isBrowser) return;
    const injected = getInjectedProvider();
    if (!injected?.on) return;

    const handleAccountsChanged = (accounts: unknown) => {
      if (Array.isArray(accounts) && accounts.length > 0) {
        const newAddress = String(accounts[0]);
        setAddress(newAddress);
        if (signer) {
          readAcknowledgement(signer, newAddress).catch((err) => console.error(err));
        }
      } else {
        disconnect();
      }
    };

    const handleChainChanged = (chain: unknown) => {
      const parsed = typeof chain === 'string' ? Number.parseInt(chain, 16) : Number(chain);
      setChainId(Number.isFinite(parsed) ? parsed : undefined);
    };

    injected.on?.('accountsChanged', handleAccountsChanged);
    injected.on?.('chainChanged', handleChainChanged);

    return () => {
      injected.removeListener?.('accountsChanged', handleAccountsChanged);
      injected.removeListener?.('chainChanged', handleChainChanged);
    };
  }, [disconnect, readAcknowledgement, signer]);

  const refreshAcknowledgement = useCallback(async () => {
    if (signer && address) {
      await readAcknowledgement(signer, address);
    }
  }, [address, readAcknowledgement, signer]);

  const value = useMemo(
    () => ({
      provider,
      signer,
      address,
      chainId,
      hasAcknowledged,
      acknowledgementVersion: ackVersion,
      loadingAck,
      connect,
      disconnect,
      refreshAcknowledgement
    }),
    [
      provider,
      signer,
      address,
      chainId,
      hasAcknowledged,
      ackVersion,
      loadingAck,
      connect,
      disconnect,
      refreshAcknowledgement
    ]
  );

  return <Web3Context.Provider value={value}>{children}</Web3Context.Provider>;
};

export const useWeb3 = (): Web3ContextValue => {
  const context = useContext(Web3Context);
  if (!context) {
    throw new Error('useWeb3 must be used within a Web3Provider');
  }
  return context;
};
