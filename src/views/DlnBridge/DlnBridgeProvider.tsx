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
import { SwapCreateTxResponse, SwapEstimationResponse } from './singleChainOrderTypes';

export const SOLANA_CHAIN_ID = 7565164;
const DLN_REFERRAL_CODE = 5211;
const FEE_PERCENT = 0.25;

export interface DlnErrorResponse {
  errorCode: number;
  errorId: string;
  errorMessage: string;
  requestId: string;
}

export const SUPPORTED_CHAINS: FeeRecipient[] = [
  {
    chainName: 'Ethereum',
    chainId: 1,
    chainIcon: '/assets/networks/ethereum.svg',
    networkFeeToken: '0x0000000000000000000000000000000000000000',
    feeRecipient: '0x2198A86deE1901fCF0907603385a7FC6956283B6',
  },
  {
    chainName: 'Polygon',
    chainId: 137,
    chainIcon: '/assets/networks/polygon.svg',
    networkFeeToken: '0x0000000000000000000000000000000000000000',
    feeRecipient: '0x8E2919c5363Bd5c02D4A7F1228EeECbF8248F757',
  },
  {
    chainName: 'Solana',
    chainId: SOLANA_CHAIN_ID,
    chainIcon: '/assets/networks/sol-dark.svg',
    networkFeeToken: '11111111111111111111111111111111',
    feeRecipient: '51HpTxzERCvW7EPeWffDpdK5EkRD2yMyF4UKc81vMSYY',
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
  lastQuoteError: DlnErrorResponse | undefined;
  setSourceChain: (chainId: number) => void;
  setDestinationChain: (chainId: number) => void;
  setSrcChainTokenIn: (token: TokenInfo | undefined) => void;
  setDstChainTokenOut: (token: TokenInfo | undefined) => void;
  setDstChainTokenOutRecipient: (address: string) => void;
  setSenderAddress: (address: string) => void;
  setAmountIn: (amount: string) => void;
  flipNetworks: () => void;
  forceRefresh: () => void;
  resetQuote: () => void;
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
  lastQuoteError: undefined,
  setSourceChain: () => void 0,
  setDestinationChain: () => void 0,
  setSrcChainTokenIn: () => void 0,
  setDstChainTokenOut: () => void 0,
  setDstChainTokenOutRecipient: () => void 0,
  setSenderAddress: () => void 0,
  setAmountIn: () => void 0,
  flipNetworks: () => void 0,
  forceRefresh: () => void 0,
  resetQuote: () => void 0,
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
  const [isFetchingQuote, setIsFetchingQuote] = useState<boolean>(defaultProvider.isFetchingQuote);
  const [amountIn, setAmountIn] = useState(defaultProvider.amountIn);
  const [srcChainTokenInAmount, setSrcChainTokenInAmount] = useState(defaultProvider.srcChainTokenInAmount);
  const [dstChainTokenOutAmount, setDstChainTokenOutAmount] = useState(defaultProvider.dstChainTokenOutAmount);
  const [dstChainTokenOutRecipient, setDstChainTokenOutRecipient] = useState(defaultProvider.dstChainTokenOutRecipient);
  const [senderAddress, setSenderAddress] = useState(defaultProvider.senderAddress);
  const [srcChainTokensResponse, setSrcChainTokensResponse] = useState<GetDlnChainTokenListResponse>();
  const [dstChainTokensResponse, setDstChainTokensResponse] = useState<GetDlnChainTokenListResponse>();
  const [quote, setQuote] = useState<DlnOrderQuoteResponse | DlnOrderCreateTxResponse | undefined>(
    defaultProvider.quote,
  );
  const [singlChainQuote, setSinglChainQuote] = useState<SwapEstimationResponse | SwapCreateTxResponse | undefined>(
    defaultProvider.singlChainQuote,
  );
  const [lastQuoteError, setLastQuoteError] = useState<DlnErrorResponse | undefined>();

  const isSrcChainSolana = sourceChain === SOLANA_CHAIN_ID;
  const isSameChainSwap = sourceChain === destinationChain;

  const affiliateFeeRecipient = useMemo(() => {
    if (isSrcChainSolana && isSameChainSwap) {
      return undefined;
      // return appConfig.getConfig().jupiterReferralKey;
    }

    return getAffiliateFeeRecipient(sourceChain);
  }, [isSameChainSwap, isSrcChainSolana, sourceChain]);

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
    const newSrcToken = { ...dstChainTokenOut };
    const newDstChain = sourceChain;
    const newDstToken = { ...srcChainTokenIn };
    // New destination network params => chainId and token from source network
    setDestinationChain(newDstChain);
    setDstChainTokenOut(newDstToken);
    setSourceChain(newSrcChain);
    setSrcChainTokenIn(newSrcToken);
    setAmountIn('');
  }, [destinationChain, dstChainTokenOut, dstTokens, sourceChain, srcChainTokenIn, srcTokens]);

  // Clear the quote/estimate
  const resetQuote = useCallback(() => {
    setQuote(defaultProvider.quote);
    setSinglChainQuote(defaultProvider.singlChainQuote);
    setDstChainTokenOutAmount('');
  }, []);

  // Takes care of running the DlnOrderQuote or DlnOrderTransaction accordingly
  useEffect(() => {
    // Nothing to do here for single chain swap
    if (sourceChain === destinationChain) return;

    if (!amountIn || !srcChainTokenIn?.address || !dstChainTokenOut?.address) {
      setQuote(undefined);
      setDstChainTokenOutAmount('');

      return;
    }

    if (srcChainTokenIn.address !== dstChainTokenOut.address) {
      const tokenAmount = toTokenAmount(amountIn, srcChainTokenIn.decimals, true) as string;
      setSrcChainTokenInAmount(tokenAmount);

      setIsFetchingQuote(true);
      if (dstChainTokenOutRecipient) {
        // If recipient is available then call /v1.0/dln/order/create-tx
        fetchInstance<DlnOrderCreateTxResponse | DlnErrorResponse>({
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
            referralCode: DLN_REFERRAL_CODE,
            affiliateFeePercent: affiliateFeeRecipient ? FEE_PERCENT : 0,
            ...(affiliateFeeRecipient ? { affiliateFeeRecipient } : {}),
            prependOperatingExpenses: true,
            enableEstimate: false,
            deBridgeApp: 'DLN',
          },
        })
          .then(quoteResponse => {
            if ('errorId' in quoteResponse) {
              setLastQuoteError(quoteResponse);

              return;
            }
            console.log('quoteResponse:', quoteResponse);
            setLastQuoteError(undefined);
            setQuote(quoteResponse);
            setDstChainTokenOutAmount(quoteResponse.estimation.dstChainTokenOut.amount);
          })
          .catch(rejection => {
            console.error('/create-tx rejection:', rejection);
          })
          .finally(() => setIsFetchingQuote(false));
      } else {
        fetchInstance<DlnOrderQuoteResponse | DlnErrorResponse>({
          url: '/v1.0/dln/order/quote',
          method: 'get',
          params: {
            srcChainId: sourceChain,
            srcChainTokenIn: srcChainTokenIn.address,
            srcChainTokenInAmount: tokenAmount,
            dstChainId: destinationChain,
            dstChainTokenOut: dstChainTokenOut.address,
            dstChainTokenOutAmount: 'auto',
            prependOperatingExpenses: true,
          },
        })
          .then(quoteResponse => {
            if ('errorId' in quoteResponse) {
              setLastQuoteError(quoteResponse);

              return;
            }
            console.log('quoteResponse:', quoteResponse);
            setLastQuoteError(undefined);
            setQuote(quoteResponse);
            setDstChainTokenOutAmount(quoteResponse.estimation.dstChainTokenOut.amount);
          })
          .catch(rejection => {
            console.error('/quote rejection:', rejection);
          })
          .finally(() => setIsFetchingQuote(false));
      }
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

    if (!amountIn || !srcChainTokenIn?.address || !dstChainTokenOut?.address) {
      setSinglChainQuote(undefined);
      setDstChainTokenOutAmount('');

      return;
    }

    if (srcChainTokenIn.address !== dstChainTokenOut.address) {
      const tokenAmount = toTokenAmount(amountIn, srcChainTokenIn.decimals, true) as string;
      setSrcChainTokenInAmount(tokenAmount);
      const destination = dstChainTokenOutRecipient ?? senderAddress;

      setIsFetchingQuote(true);
      if (destination) {
        // If sender is known then call /v1.0/chain/transaction
        fetchInstance<SwapCreateTxResponse | DlnErrorResponse>({
          url: '/v1.0/chain/transaction',
          method: 'get',
          params: {
            chainId: sourceChain,
            tokenIn: srcChainTokenIn.address,
            tokenInAmount: tokenAmount,
            tokenOutRecipient: destination,
            slippage: 1,
            tokenOut: dstChainTokenOut.address,
            referralCode: DLN_REFERRAL_CODE,
            affiliateFeePercent: affiliateFeeRecipient ? FEE_PERCENT : 0,
            ...(affiliateFeeRecipient ? { affiliateFeeRecipient } : {}),
          },
        })
          .then(createTxResponse => {
            if ('errorId' in createTxResponse) {
              setLastQuoteError(createTxResponse);

              return;
            }
            console.log('createTxResponse:', createTxResponse);
            setLastQuoteError(undefined);
            setSinglChainQuote(createTxResponse);
            setDstChainTokenOutAmount(createTxResponse.tokenOut.amount);
          })
          .catch(rejection => {
            console.error('/transaction rejection:', rejection);
          })
          .finally(() => setIsFetchingQuote(false));
      } else {
        // Otherwise go with estimation /v1.0/chain/estimation
        fetchInstance<SwapEstimationResponse | DlnErrorResponse>({
          url: '/v1.0/chain/estimation',
          method: 'get',
          params: {
            chainId: sourceChain,
            tokenIn: srcChainTokenIn.address,
            tokenInAmount: tokenAmount,
            slippage: 1,
            tokenOut: dstChainTokenOut.address,
          },
        })
          .then(estimationResponse => {
            if ('errorId' in estimationResponse) {
              setLastQuoteError(estimationResponse);

              return;
            }
            console.log('estimationResponse:', estimationResponse);
            setLastQuoteError(undefined);
            console.log('estimationResponse:', estimationResponse);
            setSinglChainQuote(estimationResponse);
            setDstChainTokenOutAmount(estimationResponse.estimation.tokenOut.amount);
          })
          .catch(rejection => {
            console.error('/estimation rejection:', rejection);
          })
          .finally(() => setIsFetchingQuote(false));
      }
    }
  }, [
    amountIn,
    sourceChain,
    senderAddress,
    destinationChain,
    affiliateFeeRecipient,
    srcChainTokenIn?.address,
    srcChainTokenIn?.decimals,
    dstChainTokenOutRecipient,
    dstChainTokenOut?.address,
    dstChainTokenOut?.decimals,
    forceRenderRef,
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
        dstChainTokenOutRecipient,
        isFetchingQuote,
        quote,
        singlChainQuote,
        lastQuoteError,
        resetQuote,
        setSourceChain,
        setDestinationChain,
        setSrcChainTokenIn,
        setDstChainTokenOut,
        setDstChainTokenOutRecipient,
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
      dstChainTokenOutRecipient,
      isFetchingQuote,
      quote,
      singlChainQuote,
      lastQuoteError,
      resetQuote,
      forceRefresh,
      flipNetworks,
    ],
  );

  return <DlnBridgeContext.Provider value={value}>{children}</DlnBridgeContext.Provider>;
};

export { DlnBridgeProvider };

export const useDlnBridge = () => useContext(DlnBridgeContext);
