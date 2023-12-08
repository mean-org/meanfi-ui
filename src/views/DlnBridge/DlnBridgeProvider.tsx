import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { toTokenAmount } from 'middleware/utils';
import { TokenInfo } from 'models/SolanaTokenInfo';
import { fetchInstance } from 'views/DlnBridge/fetchInstance';
import { useFetch } from 'views/DlnBridge/useFetch';
import {
  DlnOrderCreateTxResponse,
  DlnOrderQuoteResponse,
  FeeRecipient,
  GetDlnChainTokenListResponse,
  GetDlnSupportedChainsResponse,
} from './dlnOrderTypes';
import { SwapCreateTxResponse, SwapEstimationResponse } from './singlChainOrderTypes';
import { consoleOut } from 'middleware/ui';

export const SOLANA_CHAIN_ID = 7565164;
const QUOTE_REFRESH_TIMEOUT = 29000;

export const SUPPORTED_CHAINS: FeeRecipient[] = [
  {
    chainName: 'Ethereum',
    chainId: 1,
    chainIcon: '/assets/networks/ethereum.svg',
    networkFeeToken: '0x0000000000000000000000000000000000000000',
    feeRecipient: '',
  },
  {
    chainName: 'Optimism',
    chainId: 10,
    chainIcon: '/assets/networks/optimism.svg',
    networkFeeToken: '0x0000000000000000000000000000000000000000',
    feeRecipient: '',
  },
  // { chainName: 'BNB Chain', chainId: 56, chainIcon: '/assets/networks/bnb.svg', feeRecipient: '' },
  {
    chainName: 'Polygon',
    chainId: 137,
    chainIcon: '/assets/networks/polygon.svg',
    networkFeeToken: '0x0000000000000000000000000000000000000000',
    feeRecipient: '',
  },
  // { chainName: 'Base', chainId: 8453, chainIcon: '', feeRecipient: '' },
  // { chainName: 'Arbitrum', chainId: 42161, chainIcon: '', feeRecipient: '' },
  {
    chainName: 'Avalanche',
    chainId: 43114,
    chainIcon: '/assets/networks/avalanche.svg',
    networkFeeToken: '0x0000000000000000000000000000000000000000',
    feeRecipient: '',
  },
  // { chainName: 'Linea', chainId: 59144, chainIcon: '', feeRecipient: '' },
  {
    chainName: 'Solana',
    chainId: SOLANA_CHAIN_ID,
    chainIcon: '/assets/networks/sol-dark.svg',
    networkFeeToken: '11111111111111111111111111111111',
    feeRecipient: 'CLazQV1BhSrxfgRHko4sC8GYBU3DoHcX4xxRZd12Kohr',
  },
];

export const getChainById = (srcChainId: number) => SUPPORTED_CHAINS.find(c => c.chainId === srcChainId);

const getAffiliateFeeRecipient = (srcChainId: number) => getChainById(srcChainId)?.feeRecipient ?? '';

type Value = {
  supportedChains: number[];
  sourceChain: number;
  srcTokens: TokenInfo[] | undefined;
  srcChainTokenIn: TokenInfo | undefined;
  srcChainTokenInAmount: string;
  amountIn: string;
  senderAddress: string;
  destinationChain: number;
  dstTokens: TokenInfo[] | undefined;
  dstChainTokenOut: TokenInfo | undefined;
  dstChainTokenOutAmount: string;
  dstChainTokenOutRecipient: string;
  quote: DlnOrderQuoteResponse | DlnOrderCreateTxResponse | undefined;
  singlChainQuote: SwapEstimationResponse | SwapCreateTxResponse | undefined;
  isFetchingQuote: boolean;
  sendToDifferentAddress: boolean;
  setSourceChain: (chainId: number) => void;
  setDestinationChain: (chainId: number) => void;
  setSrcChainTokenIn: (token: TokenInfo | undefined) => void;
  setDstChainTokenOut: (token: TokenInfo | undefined) => void;
  setDstChainTokenOutRecipient: (address: string) => void;
  setSendToDifferentAddress: (value: boolean) => void;
  setSenderAddress: (address: string) => void;
  setAmountIn: (amount: string) => void;
  flipNetworks: () => void;
  forceRefresh: () => void;
};

const defaultProvider: Value = {
  supportedChains: [],
  sourceChain: SOLANA_CHAIN_ID,
  srcTokens: undefined,
  srcChainTokenIn: undefined,
  srcChainTokenInAmount: '',
  amountIn: '',
  senderAddress: '',
  destinationChain: 1,
  dstTokens: undefined,
  dstChainTokenOut: undefined,
  dstChainTokenOutAmount: '',
  dstChainTokenOutRecipient: '',
  quote: undefined,
  singlChainQuote: undefined,
  isFetchingQuote: false,
  sendToDifferentAddress: true,
  setSourceChain: () => void 0,
  setDestinationChain: () => void 0,
  setSrcChainTokenIn: () => void 0,
  setDstChainTokenOut: () => void 0,
  setDstChainTokenOutRecipient: () => void 0,
  setSendToDifferentAddress: () => void 0,
  setSenderAddress: () => void 0,
  setAmountIn: () => void 0,
  flipNetworks: () => void 0,
  forceRefresh: () => void 0,
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
  const [forceRenderRef, setForceRenderRef] = useState(0);
  const [sourceChain, setSourceChain] = useState<number>(defaultProvider.sourceChain);
  const [destinationChain, setDestinationChain] = useState<number>(defaultProvider.destinationChain);
  const [srcChainTokenIn, setSrcChainTokenIn] = useState<TokenInfo | undefined>(defaultProvider.srcChainTokenIn);
  const [dstChainTokenOut, setDstChainTokenOut] = useState<TokenInfo | undefined>(defaultProvider.dstChainTokenOut);
  const [sendToDifferentAddress, setSendToDifferentAddress] = useState<boolean>(defaultProvider.sendToDifferentAddress);
  const [isFetchingQuote, setIsFetchingQuote] = useState<boolean>(defaultProvider.isFetchingQuote);
  const [amountIn, setAmountIn] = useState(defaultProvider.amountIn);
  const [srcChainTokenInAmount, setSrcChainTokenInAmount] = useState(defaultProvider.srcChainTokenInAmount);
  const [dstChainTokenOutAmount, setDstChainTokenOutAmount] = useState(defaultProvider.dstChainTokenOutAmount);
  const [dstChainTokenOutRecipient, setDstChainTokenOutRecipient] = useState(defaultProvider.dstChainTokenOutRecipient);
  const [senderAddress, setSenderAddress] = useState(defaultProvider.senderAddress);
  const [srcChainTokensResponse, setSrcChainTokensResponse] = useState<GetDlnChainTokenListResponse>();
  const [dstChainTokensResponse, setDstChainTokensResponse] = useState<GetDlnChainTokenListResponse>();
  const [quote, setQuote] = useState<DlnOrderQuoteResponse | DlnOrderCreateTxResponse>();
  const [singlChainQuote, setSinglChainQuote] = useState<SwapEstimationResponse | SwapCreateTxResponse>();

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

  const forceRefresh = useCallback(() => {
    setForceRenderRef(current => current + 1);
  }, []);

  const flipNetworks = useCallback(() => {
    if (!srcTokens || !dstTokens || !srcChainTokenIn || !dstChainTokenOut) {
      return;
    }

    // New source network params => those of the destination network
    const newSrcChain = destinationChain;
    const newSrcToken = dstChainTokenOut;
    // New destination network params => chainId and token from source network
    setDestinationChain(sourceChain);
    setDstChainTokenOut(srcChainTokenIn);
    setSourceChain(newSrcChain);
    setSrcChainTokenIn(newSrcToken);
    setAmountIn('');
  }, [destinationChain, dstChainTokenOut, dstTokens, sourceChain, srcChainTokenIn, srcTokens]);

  // Takes care of running the DlnOrderQuote or DlnOrderTransaction accordingly
  useEffect(() => {
    // Nothing to do here for single chain swap
    if (sourceChain === destinationChain) return;

    if (srcChainTokenIn?.address && amountIn && dstChainTokenOut?.address) {
      const tokenAmount = toTokenAmount(amountIn, srcChainTokenIn.decimals, true) as string;
      setSrcChainTokenInAmount(tokenAmount);

      setIsFetchingQuote(true);
      if (dstChainTokenOutRecipient) {
        // If recipient is available then call /v1.0/dln/order/create-tx
        fetchInstance<DlnOrderCreateTxResponse>({
          url: '/v1.0/dln/order/create-tx',
          method: 'get',
          params: {
            srcChainId: sourceChain,
            srcChainTokenIn: srcChainTokenIn.address,
            srcChainTokenInAmount: tokenAmount,
            dstChainId: destinationChain,
            dstChainTokenOut: dstChainTokenOut.address,
            dstChainTokenOutAmount: 'auto',
            dstChainTokenOutRecipient,
            dstChainOrderAuthorityAddress: dstChainTokenOutRecipient,
            senderAddress,
            srcChainOrderAuthorityAddress: senderAddress,
            additionalTakerRewardBps: 0.1 * 100,
            affiliateFeePercent: affiliateFeeRecipient ? 0.1 : 0,
            ...(affiliateFeeRecipient ? { affiliateFeeRecipient } : {}),
            prependOperatingExpenses: true,
            enableEstimate: false,
            deBridgeApp: 'DLN',
          },
        })
          .then(quoteResponse => {
            console.log('quoteResponse:', quoteResponse);
            setQuote(quoteResponse);
            setDstChainTokenOutAmount(quoteResponse.estimation.dstChainTokenOut.amount);
          })
          .finally(() => setIsFetchingQuote(false));
      } else {
        // Otherwise go with a quote /v1.0/dln/order/quote
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
            additionalTakerRewardBps: 0.1 * 100,
            affiliateFeePercent: affiliateFeeRecipient ? 0.1 : 0,
            affiliateFeeRecipient,
            prependOperatingExpenses: true,
          },
        })
          .then(quoteResponse => {
            console.log('quoteResponse:', quoteResponse);
            setQuote(quoteResponse);
            setDstChainTokenOutAmount(quoteResponse.estimation.dstChainTokenOut.amount);
          })
          .finally(() => setIsFetchingQuote(false));
      }
    } else {
      setQuote(undefined);
      setDstChainTokenOutAmount('');
    }
  }, [
    forceRenderRef,
    affiliateFeeRecipient,
    dstChainTokenOutRecipient,
    senderAddress,
    amountIn,
    destinationChain,
    dstChainTokenOut?.address,
    dstChainTokenOut?.decimals,
    sourceChain,
    srcChainTokenIn?.address,
    srcChainTokenIn?.decimals,
  ]);

  // Takes care of running the SingleChainEstimate or SingleChainTransaction accordingly
  useEffect(() => {
    // Nothing to do here for cross chain transfer order
    if (sourceChain !== destinationChain) return;

    if (srcChainTokenIn?.address && amountIn && dstChainTokenOut?.address) {
      const tokenAmount = toTokenAmount(amountIn, srcChainTokenIn.decimals, true) as string;
      setSrcChainTokenInAmount(tokenAmount);

      setIsFetchingQuote(true);
      if (senderAddress) {
        // If sender is known then call /v1.0/chain/transaction
        fetchInstance<SwapCreateTxResponse>({
          url: '/v1.0/chain/transaction',
          method: 'get',
          params: {
            chainId: sourceChain,
            tokenIn: srcChainTokenIn.address,
            tokenInAmount: tokenAmount,
            slippage: 1,
            tokenOut: dstChainTokenOut.address,
            tokenOutRecipient: dstChainTokenOutRecipient ?? senderAddress,
            // affiliateFeePercent: affiliateFeeRecipient ? 0.1 : 0,
            // ...(affiliateFeeRecipient ? { affiliateFeeRecipient } : {}),
          },
        })
          .then(createTxResponse => {
            console.log('createTxResponse:', createTxResponse);
            setSinglChainQuote(createTxResponse);
            setDstChainTokenOutAmount(createTxResponse.tokenOut.amount);
          })
          .finally(() => setIsFetchingQuote(false));
      } else {
        // Otherwise go with estimation /v1.0/chain/estimation
        fetchInstance<SwapEstimationResponse>({
          url: '/v1.0/dln/order/quote',
          method: 'get',
          params: {
            chainId: sourceChain,
            tokenIn: srcChainTokenIn.address,
            tokenInAmount: tokenAmount,
            slippage: 1,
            tokenOut: dstChainTokenOut.address,
            // affiliateFeePercent: affiliateFeeRecipient ? 0.1 : 0,
            // ...(affiliateFeeRecipient ? { affiliateFeeRecipient } : {}),
          },
        })
          .then(estimationResponse => {
            console.log('estimationResponse:', estimationResponse);
            setSinglChainQuote(estimationResponse);
            setDstChainTokenOutAmount(estimationResponse.estimation.tokenOut.amount);
          })
          .finally(() => setIsFetchingQuote(false));
      }
    } else {
      setSinglChainQuote(undefined);
      setDstChainTokenOutAmount('');
    }
  }, [
    forceRenderRef,
    affiliateFeeRecipient,
    dstChainTokenOutRecipient,
    senderAddress,
    amountIn,
    destinationChain,
    dstChainTokenOut?.address,
    dstChainTokenOut?.decimals,
    sourceChain,
    srcChainTokenIn?.address,
    srcChainTokenIn?.decimals,
  ]);

  // Refresh routes every 29 seconds
  useEffect(() => {
    let timer: any;
    if (!sourceChain || !destinationChain) return;

    if (amountIn && srcChainTokenIn?.address && dstChainTokenOut?.address) {
      timer = setInterval(() => {
        if (!isFetchingQuote) {
          consoleOut(`Trigger refresh quote after ${QUOTE_REFRESH_TIMEOUT / 1000} seconds`);
          forceRefresh();
        }
      }, QUOTE_REFRESH_TIMEOUT);
    }

    return () => {
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [
    amountIn,
    destinationChain,
    dstChainTokenOut?.address,
    srcChainTokenIn?.address,
    isFetchingQuote,
    forceRefresh,
    sourceChain,
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
        senderAddress,
        srcChainTokenInAmount,
        dstChainTokenOutAmount,
        sendToDifferentAddress,
        dstChainTokenOutRecipient,
        isFetchingQuote,
        quote,
        singlChainQuote,
        setSourceChain,
        setDestinationChain,
        setSrcChainTokenIn,
        setDstChainTokenOut,
        setDstChainTokenOutRecipient,
        setSendToDifferentAddress,
        setSenderAddress,
        setAmountIn,
        flipNetworks,
        forceRefresh,
      } as Value),
    [
      suppChains,
      sourceChain,
      destinationChain,
      senderAddress,
      srcTokens,
      dstTokens,
      srcChainTokenIn,
      dstChainTokenOut,
      amountIn,
      srcChainTokenInAmount,
      dstChainTokenOutAmount,
      sendToDifferentAddress,
      dstChainTokenOutRecipient,
      isFetchingQuote,
      quote,
      singlChainQuote,
      forceRefresh,
      flipNetworks,
    ],
  );

  return <DlnBridgeContext.Provider value={value}>{children}</DlnBridgeContext.Provider>;
};

export { DlnBridgeProvider };

export const useDlnBridge = () => useContext(DlnBridgeContext);
