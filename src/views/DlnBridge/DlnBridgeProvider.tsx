import { useFetch } from 'views/DlnBridge/useFetch';
import { fetchInstance } from 'views/DlnBridge/fetchInstance';
import { toTokenAmount } from 'middleware/utils';
import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  DlnOrderQuoteResponse,
  FeeRecipient,
  GetDlnChainTokenListResponse,
  GetDlnSupportedChainsResponse,
} from './types';
import { TokenInfo } from 'models/SolanaTokenInfo';

export const SUPPORTED_CHAINS: FeeRecipient[] = [
  { chainName: 'Ethereum', chainId: 1, chainIcon: '/assets/networks/ethereum.svg', feeRecipient: '' },
  { chainName: 'Optimism', chainId: 10, chainIcon: '/assets/networks/optimism.svg', feeRecipient: '' },
  // { chainName: 'BNB Chain', chainId: 56, chainIcon: '/assets/networks/bnb.svg', feeRecipient: '' },
  { chainName: 'Polygon', chainId: 137, chainIcon: '/assets/networks/polygon.svg', feeRecipient: '' },
  // { chainName: 'Base', chainId: 8453, chainIcon: '', feeRecipient: '' },
  // { chainName: 'Arbitrum', chainId: 42161, chainIcon: '', feeRecipient: '' },
  { chainName: 'Avalanche', chainId: 43114, chainIcon: '/assets/networks/avalanche.svg', feeRecipient: '' },
  // { chainName: 'Linea', chainId: 59144, chainIcon: '', feeRecipient: '' },
  {
    chainName: 'Solana',
    chainId: 7565164,
    chainIcon: '/assets/networks/sol-dark.svg',
    feeRecipient: 'CLazQV1BhSrxfgRHko4sC8GYBU3DoHcX4xxRZd12Kohr',
  },
];

const getAffiliateFeeRecipient = (srcChainId: number) =>
  SUPPORTED_CHAINS.find(c => c.chainId === srcChainId)?.feeRecipient ?? '';

type Value = {
  supportedChains: number[];
  sourceChain: number;
  destinationChain: number;
  srcTokens: TokenInfo[] | undefined;
  dstTokens: TokenInfo[] | undefined;
  srcChainTokenIn: TokenInfo | undefined;
  dstChainTokenOut: TokenInfo | undefined;
  amountIn: string;
  srcChainTokenInAmount: string;
  quote: DlnOrderQuoteResponse | undefined;
  dstChainTokenOutAmount: string;
  setSourceChain: (chainId: number) => void;
  setDestinationChain: (chainId: number) => void;
  setSrcChainTokenIn: (token: TokenInfo | undefined) => void;
  setDstChainTokenOut: (token: TokenInfo | undefined) => void;
  setAmountIn: (amount: string) => void;
};

const defaultProvider: Value = {
  supportedChains: [],
  sourceChain: 7565164,
  destinationChain: 1,
  srcTokens: undefined,
  dstTokens: undefined,
  srcChainTokenIn: undefined,
  dstChainTokenOut: undefined,
  amountIn: '',
  srcChainTokenInAmount: '',
  quote: undefined,
  dstChainTokenOutAmount: '',
  setSourceChain: () => void 0,
  setDestinationChain: () => void 0,
  setSrcChainTokenIn: () => void 0,
  setDstChainTokenOut: () => void 0,
  setAmountIn: () => void 0,
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
  const [srcChainTokenIn, setSrcChainTokenIn] = useState<TokenInfo | undefined>(defaultProvider.srcChainTokenIn);
  const [dstChainTokenOut, setDstChainTokenOut] = useState<TokenInfo | undefined>(defaultProvider.dstChainTokenOut);
  const [amountIn, setAmountIn] = useState(defaultProvider.amountIn);
  const [srcChainTokenInAmount, setSrcChainTokenInAmount] = useState('');
  const [dstChainTokenOutAmount, setDstChainTokenOutAmount] = useState('');
  const [srcChainTokensResponse, setSrcChainTokensResponse] = useState<GetDlnChainTokenListResponse>();
  const [dstChainTokensResponse, setDstChainTokensResponse] = useState<GetDlnChainTokenListResponse>();
  const [quote, setQuote] = useState<DlnOrderQuoteResponse>();

  const affiliateFeeRecipient = useMemo(() => getAffiliateFeeRecipient(sourceChain), [sourceChain]);

  // Get tokens map for source chain
  useEffect(() => {
    fetchInstance<GetDlnChainTokenListResponse>({
      url: '/v1.0/token-list',
      method: 'get',
      params: { chainId: sourceChain },
    }).then(response => setSrcChainTokensResponse(response));
  }, [sourceChain]);

  // Convert source chain tokens map to array
  const srcTokens = useMemo(() => {
    if (!srcChainTokensResponse?.tokens) {
      return [];
    }

    return Object.keys(srcChainTokensResponse.tokens).map(key => srcChainTokensResponse.tokens[key]) as TokenInfo[];
  }, [srcChainTokensResponse]);

  // Get tokens map for destination chain
  useEffect(() => {
    fetchInstance<GetDlnChainTokenListResponse>({
      url: '/v1.0/token-list',
      method: 'get',
      params: { chainId: destinationChain },
    }).then(response => setDstChainTokensResponse(response));
  }, [destinationChain]);

  // Convert destination chain tokens map to array
  const dstTokens = useMemo(() => {
    if (!dstChainTokensResponse?.tokens) {
      return [];
    }

    return Object.keys(dstChainTokensResponse.tokens).map(key => dstChainTokensResponse.tokens[key]) as TokenInfo[];
  }, [dstChainTokensResponse]);

  // Set input token amount from input value
  useEffect(() => {
    if (amountIn && srcChainTokenIn) {
      const tokenAmount = toTokenAmount(amountIn, srcChainTokenIn.decimals, true) as string;
      setSrcChainTokenInAmount(tokenAmount);
    } else {
      setSrcChainTokenInAmount('');
    }
  }, [amountIn, srcChainTokenIn]);

  useEffect(() => {
    if (sourceChain && srcChainTokenIn?.address && amountIn && dstChainTokenOut?.address && affiliateFeeRecipient) {
      const tokenAmount = toTokenAmount(amountIn, srcChainTokenIn.decimals, true) as string;
      setSrcChainTokenInAmount(tokenAmount);

      fetchInstance<DlnOrderQuoteResponse>({
        url: '/v1.0/dln/order/quote',
        method: 'get',
        params: {
          srcChainId: sourceChain,
          srcChainTokenIn: srcChainTokenIn.address,
          srcChainTokenInAmount: tokenAmount,
          dstChainId: destinationChain,
          dstChainTokenOut: dstChainTokenOut.address,
          dstChainTokenOutAmount: 'auto',
          additionalTakerRewardBps: 0.25 * 100,
          affiliateFeePercent: 0.1,
          affiliateFeeRecipient,
          prependOperatingExpenses: true,
        },
      }).then(quoteResponse => {
        console.log('quoteResponse:', quoteResponse);
        setQuote(quoteResponse);
        setDstChainTokenOutAmount(quoteResponse.estimation.dstChainTokenOut.amount);
      });
    } else {
      setQuote(undefined);
      setDstChainTokenOutAmount('');
    }
  }, [
    affiliateFeeRecipient,
    amountIn,
    destinationChain,
    dstChainTokenOut?.address,
    dstChainTokenOut?.decimals,
    sourceChain,
    srcChainTokenIn?.address,
    srcChainTokenIn?.decimals,
  ]);

  const value = useMemo(
    () =>
      ({
        supportedChains: suppChains,
        sourceChain,
        destinationChain,
        srcTokens,
        dstTokens,
        srcChainTokenIn,
        dstChainTokenOut,
        amountIn,
        srcChainTokenInAmount,
        dstChainTokenOutAmount,
        quote,
        setSourceChain,
        setDestinationChain,
        setSrcChainTokenIn,
        setDstChainTokenOut,
        setAmountIn,
      } as Value),
    [
      suppChains,
      sourceChain,
      destinationChain,
      srcTokens,
      dstTokens,
      srcChainTokenIn,
      dstChainTokenOut,
      amountIn,
      srcChainTokenInAmount,
      dstChainTokenOutAmount,
      quote,
    ],
  );

  return <DlnBridgeContext.Provider value={value}>{children}</DlnBridgeContext.Provider>;
};

export { DlnBridgeProvider };

export const useDlnBridge = () => useContext(DlnBridgeContext);
