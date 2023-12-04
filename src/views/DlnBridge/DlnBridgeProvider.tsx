import { useFetch } from 'hooks/useFetch';
import {
  DlnSupportedChain,
  DlnTokenInfo,
  GetDlnChainTokenListResponse,
  GetDlnSupportedChainsResponse,
} from 'middleware/api';
import { ReactNode, createContext, useContext, useMemo, useState } from 'react';

export const SUPPORTED_CHAINS: DlnSupportedChain[] = [
  { chainName: 'Ethereum', chainId: 1 },
  { chainName: 'Optimism', chainId: 10 },
  { chainName: 'BNB Chain', chainId: 56 },
  { chainName: 'Polygon', chainId: 137 },
  { chainName: 'Base', chainId: 8453 },
  { chainName: 'Arbitrum', chainId: 42161 },
  { chainName: 'Avalanche', chainId: 43114 },
  { chainName: 'Linea', chainId: 59144 },
  { chainName: 'Solana', chainId: 7565164 },
];

type Value = {
  supportedChains: number[];
  sourceChain: number;
  destinationChain: number;
  tokens: Map<string, DlnTokenInfo> | undefined;
};

const defaultProvider: Value = {
  supportedChains: [],
  sourceChain: 7565164,
  destinationChain: 1,
  tokens: undefined,
};

const DlnBridgeContext = createContext(defaultProvider);

interface Props {
  children: ReactNode;
}

const DlnBridgeProvider = ({ children }: Props) => {
  const { data: chains } = useFetch<GetDlnSupportedChainsResponse>({
    url: '/v1.0/supported-chains',
    method: 'get',
  });

  const suppChains = useMemo(() => chains?.chains ?? [], [chains?.chains]);

  const [sourceChain, setSourceChain] = useState<number>(defaultProvider.sourceChain);
  const [destinationChain, setDestinationChain] = useState<number | undefined>(defaultProvider.destinationChain);
  const { data: tokensResponse } = useFetch<GetDlnChainTokenListResponse>({
    url: '/v1.0/token-list',
    method: 'get',
    params: { chainId: sourceChain },
  });

  const value = useMemo(
    () =>
      ({
        supportedChains: suppChains,
        sourceChain,
        destinationChain,
        tokens: tokensResponse?.tokens,
      } as Value),
    [destinationChain, sourceChain, suppChains, tokensResponse?.tokens],
  );

  return <DlnBridgeContext.Provider value={value}>{children}</DlnBridgeContext.Provider>;
};

export { DlnBridgeProvider };

export const useDlnBridge = () => useContext(DlnBridgeContext);
