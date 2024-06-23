import { CheckCircleFilled, CloseCircleFilled, LoadingOutlined, ReloadOutlined, SyncOutlined } from '@ant-design/icons';
import { BN } from '@project-serum/anchor';
import { PublicKey } from '@solana/web3.js';
// wagmi & viem
import { estimateFeesPerGas } from '@wagmi/core';
import { Button, Modal, Select, Tooltip } from 'antd';
import { Identicon } from 'components/Identicon';
import { TokenDisplay } from 'components/TokenDisplay';
import { INPUT_DEBOUNCE_TIME, SOLANA_EXPLORER_URI_INSPECT_TRANSACTION } from 'constants/common';
import { NATIVE_SOL } from 'constants/tokens';
import { useNativeAccount } from 'contexts/accounts';
import { AppStateContext } from 'contexts/appstate';
import { getSolanaExplorerClusterParam, useConnection } from 'contexts/connection';
import { TxConfirmationContext } from 'contexts/transaction-status';
import { useWallet } from 'contexts/wallet';
import { useDebounce } from 'hooks/useDebounce';
import useTransaction from 'hooks/useTransaction';
import { getTokenAccountBalanceByAddress } from 'middleware/accounts';
import { consoleOut, isEvmValidAddress, isValidAddress, percentageBn, toUsCurrency } from 'middleware/ui';
import {
  findATokenAddress,
  formatThousands,
  getAmountFromLamports,
  isValidNumber,
  toTokenAmount,
  toUiAmount,
} from 'middleware/utils';
import type { TokenInfo } from 'models/SolanaTokenInfo';
import { OperationType } from 'models/enums';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type UseEstimateGasParameters,
  useAccount,
  useBalance,
  useEstimateGas,
  useReadContract,
  useSendTransaction,
  useSwitchChain,
} from 'wagmi';
import CustomConnectButton from './CustomConnectButton';
import { FEE_PERCENT, SOLANA_CHAIN_ID, SUPPORTED_CHAINS, getChainById, useDlnBridge } from './DlnBridgeProvider';
import SwapRate from './SwapRate';
import TokenSelector from './TokenSelector';
import createVersionedTxFromEncodedTx from './createVersionedTxFromEncodedTx';
import type { DlnOrderCreateTxResponse } from './dlnOrderTypes';
import getUiErrorString from './getUiErrorString';
import type { SwapCreateTxResponse } from './singleChainOrderTypes';
import './style.scss';
import { wagmiConfig } from './wagmiConfig';

const { Option } = Select;
type ActionTarget = 'source' | 'destination';
type UiStage = 'order-setup' | 'order-submitted';
const QUOTE_REFRESH_TIMEOUT = 29000;
export const abi = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'totalSupply',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: 'supply', type: 'uint256' }],
  },
] as const;

type EstimatedFeeDataResult = {
  gasPrice?: undefined;
  maxFeePerBlobGas?: undefined;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  formatted: {
    gasPrice?: undefined;
    maxFeePerBlobGas?: undefined;
    maxFeePerGas: string;
    maxPriorityFeePerGas: string;
  };
};

interface DlnBridgeUiProps {
  fromAssetSymbol?: string;
}

const DlnBridgeUi = ({ fromAssetSymbol }: DlnBridgeUiProps) => {
  const { t } = useTranslation('common');
  const { account } = useNativeAccount();
  const connection = useConnection();
  const { publicKey } = useWallet();
  const { loadingPrices, refreshPrices, getTokenPriceByAddress } = useContext(AppStateContext);
  const { addTransactionNotification } = useContext(TxConfirmationContext);
  const [uiStage, setUiStage] = useState<UiStage>('order-setup');
  const [orderSubmittedContent, setOrderSubmittedContent] = useState<{
    message: string;
    txHash: string;
    explorer?: {
      name: string;
      url: string;
    };
  }>();
  const [orderFailedContent, setOrderFailedContent] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [amountInput, setAmountInput] = useState('');
  const debouncedAmountInput = useDebounce<string>(amountInput, INPUT_DEBOUNCE_TIME);

  const [nativeBalance, setNativeBalance] = useState(0);
  const [tokenBalanceBn, setTokenBalanceBn] = useState(new BN(0));
  const [swapRate, setSwapRate] = useState(false);
  const [isTokenSelectorModalVisible, setTokenSelectorModalVisibility] = useState(false);
  const [selectedTokenSet, setSelectedTokenSet] = useState<ActionTarget>('source');
  const [chainFeeData, setChainFeeData] = useState<EstimatedFeeDataResult>();

  const {
    sourceChain,
    destinationChain,
    srcTokens,
    dstTokens,
    srcChainTokenIn,
    srcChainTokenInAmount,
    dstChainTokenOut,
    quote,
    singlChainQuote,
    amountIn,
    dstChainTokenOutAmount,
    dstChainTokenOutRecipient,
    isFetchingQuote,
    lastQuoteError,
    setSourceChain,
    setDestinationChain,
    setDstChainTokenOut,
    setSrcChainTokenIn,
    setDstChainTokenOutRecipient,
    setSenderAddress,
    forceRefresh,
    setAmountIn,
    resetQuote,
  } = useDlnBridge();

  const { address, chain } = useAccount();

  const isAddressConnected = !!address;
  const isSrcChainSolana = sourceChain === SOLANA_CHAIN_ID;
  const isCrossChainSwap = sourceChain !== destinationChain;
  const sameChainSwap = sourceChain === destinationChain;
  const srcChainData = useMemo(() => getChainById(sourceChain), [sourceChain]);
  const networkFeeToken = useMemo(() => {
    if (srcTokens && srcChainData?.networkFeeToken) {
      const feeToken = srcTokens.find(t => t.address === srcChainData.networkFeeToken);
      consoleOut('feeToken', feeToken, 'cadetblue');
      return feeToken;
    }

    return undefined;
  }, [srcChainData?.networkFeeToken, srcTokens]);
  const dstChainName = useMemo(() => getChainById(destinationChain)?.chainName ?? 'Unknown', [destinationChain]);

  const { switchChain } = useSwitchChain();

  const inputAmountBn = useMemo(() => new BN(srcChainTokenInAmount ?? 0), [srcChainTokenInAmount]);

  const evmToken =
    srcChainTokenIn?.address === srcChainData?.networkFeeToken ? undefined : srcChainTokenIn?.address.slice(2);
  const balance = useBalance({
    query: {
      enabled: sourceChain !== SOLANA_CHAIN_ID && srcChainTokenIn?.chainId !== SOLANA_CHAIN_ID,
    },
    address,
    chainId: sourceChain,
    token:
      srcChainTokenIn?.address === srcChainData?.networkFeeToken ? undefined : `0x${srcChainTokenIn?.address.slice(2)}`,
  });

  const { data: evmTokenBalance } = useReadContract({
    abi,
    address: `0x${evmToken}`,
    functionName: 'balanceOf',
    account: address,
    query: {
      enabled: sourceChain !== SOLANA_CHAIN_ID && srcChainTokenIn?.chainId !== SOLANA_CHAIN_ID,
    },
  });

  const operatingExpensesBn = useMemo(() => {
    const opsExpenses = BigInt(isCrossChainSwap ? quote?.prependedOperatingExpenseCost ?? 0 : 0);

    return new BN(opsExpenses.toString());
  }, [isCrossChainSwap, quote?.prependedOperatingExpenseCost]);

  useEffect(() => {
    console.log('evmTokenBalance:', evmTokenBalance);
  }, [evmTokenBalance]);

  // Get EVM fee data
  useEffect(() => {
    if (sourceChain === SOLANA_CHAIN_ID) {
      setChainFeeData(undefined);
      return;
    }

    estimateFeesPerGas(wagmiConfig).then(value => setChainFeeData(value));
  }, [sourceChain]);

  const minBalanceRequired = useMemo(() => {
    if (!srcChainTokenIn) return 0;

    const protocolFixFee = BigInt(isCrossChainSwap ? quote?.fixFee ?? 0 : 0);
    const opsExpenses = BigInt(isCrossChainSwap ? quote?.prependedOperatingExpenseCost ?? 0 : 0);

    return Number.parseFloat(toUiAmount(new BN((protocolFixFee + opsExpenses).toString()), srcChainTokenIn.decimals));
  }, [isCrossChainSwap, quote?.fixFee, quote?.prependedOperatingExpenseCost, srcChainTokenIn]);

  const maxAmount = useMemo(() => {
    if (!srcChainTokenIn) return 0;

    // If source chain is Solana lets force a margin of 0.05 SOL as min balance
    if (srcChainTokenIn.address === NATIVE_SOL.address) {
      const safeAmount = nativeBalance - minBalanceRequired;
      const amount = safeAmount > 0 ? safeAmount : 0;
      return amount;
    }

    if (tokenBalanceBn.isZero()) return 0;

    /**
      - userBalance = balance of user's wallet
      - operatingExpenses = prependedOperatingExpenseCost saved from the last /create-tx query
      - maxGas = current max gas for the current fromChain (that's a regular gas calculation dapps use for fast confirmation)
        maxFeePerGas = baseFeePerGas + maxPriorityFeePerGas https://docs.alchemy.com/docs/maxpriorityfeepergas-vs-maxfeepergas
      - protocolFixFee - fixFee in native token for this chain (https://docs.dln.trade/the-core-protocol/fees-and-supported-chains)

      From balance we deduct maxGas, and also operatingExpenses with 15% margin and fixFee
      Final formula:
      max = userBalance - maxGas - (isCrossChainSwap ? protocolFixFee : 0) - (isCrossChainSwap ? operatingExpenses : 0);
    */

    consoleOut('tokenBalanceBn:', tokenBalanceBn.toString(), 'blue');
    const affiliateFeeBn = percentageBn(FEE_PERCENT, tokenBalanceBn) as BN;
    consoleOut('userBalance:', toUiAmount(tokenBalanceBn, srcChainTokenIn.decimals), 'cadetblue');
    if (isCrossChainSwap) {
      const maxGas = chainFeeData?.maxFeePerGas ?? BigInt(0);
      const protocolFixFee = BigInt(!isSrcChainSolana ? quote?.fixFee ?? 0 : 0);
      const userBalance = BigInt(tokenBalanceBn.toString());
      const affiliateFee = BigInt(affiliateFeeBn.toString());
      const opsExpenses = BigInt(isCrossChainSwap ? quote?.prependedOperatingExpenseCost ?? 0 : 0);
      const max = userBalance - maxGas - protocolFixFee - opsExpenses - affiliateFee;
      consoleOut('maxGas:', toUiAmount(new BN(maxGas.toString()), srcChainTokenIn.decimals), 'cadetblue');
      consoleOut(
        'operatingExpenses:',
        toUiAmount(new BN(opsExpenses.toString()), srcChainTokenIn.decimals),
        'cadetblue',
      );
      consoleOut('affiliateFee:', toUiAmount(affiliateFeeBn, srcChainTokenIn.decimals), 'cadetblue');
      consoleOut('max:', toUiAmount(new BN(max.toString()), srcChainTokenIn.decimals), 'cadetblue');

      if (max <= 0) {
        return 0;
      }

      const calculatedMax = toUiAmount(max.toString(), srcChainTokenIn.decimals);
      return Number.parseFloat(calculatedMax);
    }

    const deducted = tokenBalanceBn.sub(affiliateFeeBn);
    const calculatedMax = toUiAmount(deducted, srcChainTokenIn.decimals);
    consoleOut('affiliateFee:', toUiAmount(affiliateFeeBn, srcChainTokenIn.decimals), 'cadetblue');
    consoleOut('max:', toUiAmount(deducted, srcChainTokenIn.decimals), 'cadetblue');
    return Number.parseFloat(calculatedMax);
  }, [
    nativeBalance,
    chainFeeData?.maxFeePerGas,
    quote?.fixFee,
    quote?.prependedOperatingExpenseCost,
    minBalanceRequired,
    isSrcChainSolana,
    isCrossChainSwap,
    srcChainTokenIn,
    tokenBalanceBn,
  ]);

  const getMaxAmountIn = useCallback(() => {
    if (!srcChainTokenIn) {
      setAmountInput('');
      resetQuote();

      return;
    }

    setAmountInput(maxAmount.toString());
  }, [maxAmount, resetQuote, srcChainTokenIn]);

  const getSrcTokenPrice = () => {
    if (!amountIn || !srcChainTokenIn) {
      return 0;
    }

    return Number.parseFloat(amountIn) * getTokenPriceByAddress(srcChainTokenIn.address, srcChainTokenIn.symbol);
  };

  const getOutputAmount = useCallback(() => {
    if (!dstChainTokenOut || !dstChainTokenOutAmount) {
      return '0';
    }

    return toUiAmount(dstChainTokenOutAmount, dstChainTokenOut.decimals);
  }, [dstChainTokenOut, dstChainTokenOutAmount]);

  const getDstTokenPrice = () => {
    if (!dstChainTokenOut || !dstChainTokenOutAmount) {
      return 0;
    }

    const uiAmount = getOutputAmount();
    const price = getTokenPriceByAddress('', dstChainTokenOut.symbol);

    return Number.parseFloat(uiAmount) * price;
  };

  const showTokenSelector = (tokenSet: ActionTarget) => {
    setSelectedTokenSet(tokenSet);
    setTokenSelectorModalVisibility(true);
  };

  const closeTokenSelector = () => setTokenSelectorModalVisibility(false);

  const onSrcChainSelected = (e: number) => {
    consoleOut('Selected chain:', e, 'cadetblue');
    setSourceChain(e);
    resetQuote();
    if (e === destinationChain) {
      if (e === SOLANA_CHAIN_ID && publicKey) {
        setDstChainTokenOutRecipient(publicKey.toBase58());
      } else if (e !== SOLANA_CHAIN_ID && isAddressConnected) {
        setDstChainTokenOutRecipient(address);
      }
    }
  };

  const onDstChainSelected = (e: number) => {
    consoleOut('Selected chain:', e, 'cadetblue');
    setDestinationChain(e);
    resetQuote();
    if (e === SOLANA_CHAIN_ID && publicKey) {
      setDstChainTokenOutRecipient(publicKey.toBase58());
    } else if (e === sourceChain && isAddressConnected) {
      setDstChainTokenOutRecipient(address);
    } else {
      setDstChainTokenOutRecipient('');
    }
  };

  const handleTokenSelection = (target: ActionTarget, token: TokenInfo) => {
    resetQuote();
    if (target === 'source') {
      setSrcChainTokenIn(token);
    } else {
      setDstChainTokenOut(token);
    }
  };

  const onAmountInChange = (e: string) => {
    let newValue = e;

    const decimals = srcChainTokenIn?.decimals ?? 0;
    const splitted = newValue.toString().split('.');
    const left = splitted[0];

    if (decimals && splitted[1]) {
      if (splitted[1].length > decimals) {
        splitted[1] = splitted[1].slice(0, -1);
        newValue = splitted.join('.');
      }
    } else if (left.length > 1) {
      const number = +splitted[0] - 0;
      splitted[0] = `${number}`;
      newValue = splitted.join('.');
    }

    if (newValue === null || newValue === undefined || newValue === '') {
      setAmountInput('');
    } else if (newValue === '.') {
      setAmountInput('.');
    } else if (isValidNumber(newValue)) {
      setAmountInput(newValue);
    }
  };

  const handleRecipientAddressChange = (e: string) => {
    const inputValue = e;
    // Set the input value
    const trimmedValue = inputValue.trim();
    setDstChainTokenOutRecipient(trimmedValue);
  };

  const inputAmount = Number.parseFloat(amountIn);
  const outputAmount = Number.parseFloat(getOutputAmount());
  const to = !isSrcChainSolana
    ? quote
      ? (quote as DlnOrderCreateTxResponse).tx.to
      : singlChainQuote
        ? (singlChainQuote as SwapCreateTxResponse)?.tx?.data
        : undefined
    : undefined;

  const config: UseEstimateGasParameters = {
    to: `0x${to}`,
    value:
      !isSrcChainSolana && quote
        ? BigInt((quote as DlnOrderCreateTxResponse).tx?.value ?? 0)
        : singlChainQuote
          ? BigInt((singlChainQuote as SwapCreateTxResponse)?.tx?.value ?? 0)
          : undefined,
    data:
      !isSrcChainSolana && quote
        ? `0x${(quote as DlnOrderCreateTxResponse).tx?.data?.slice(2)}`
        : singlChainQuote
          ? `0x${(singlChainQuote as SwapCreateTxResponse)?.tx?.data?.slice(2)}`
          : undefined,
  };

  const {
    data,
    isError: isErrorPreparingTx,
    error: preparedTxError,
  } = useEstimateGas({
    ...config,
    query: {
      enabled:
        !isSrcChainSolana &&
        !!(
          to ||
          (quote && (quote as DlnOrderCreateTxResponse).tx.data) ||
          (singlChainQuote && (singlChainQuote as SwapCreateTxResponse)?.tx?.data)
        ),
    },
  });

  const { isPending: isExecutingTx, sendTransactionAsync } = useSendTransaction();

  const evmSwapTx = async () => {
    if (!isAddressConnected) return;

    consoleOut('config', config, 'cadetblue');

    setOrderFailedContent('');
    setOrderSubmittedContent(undefined);

    const dlnOrderTxData = quote as DlnOrderCreateTxResponse;
    const singleChainSwapTxData = singlChainQuote as SwapCreateTxResponse;

    const displayAmountIn = sameChainSwap
      ? `${
          singleChainSwapTxData && srcChainTokenIn
            ? formatThousands(
                Number.parseFloat(toUiAmount(singleChainSwapTxData.tokenIn.amount, srcChainTokenIn.decimals)),
                4,
              )
            : '0'
        } ${srcChainTokenIn?.symbol}`
      : `${
          dlnOrderTxData && srcChainTokenIn
            ? formatThousands(
                Number.parseFloat(
                  toUiAmount(dlnOrderTxData.estimation.srcChainTokenIn.amount, srcChainTokenIn.decimals),
                ),
                4,
              )
            : '0'
        } ${srcChainTokenIn?.symbol}`;
    const displayAmountOut = sameChainSwap
      ? `${
          singleChainSwapTxData && dstChainTokenOut
            ? formatThousands(
                Number.parseFloat(toUiAmount(singleChainSwapTxData.tokenOut.amount, dstChainTokenOut.decimals)),
                4,
              )
            : '0'
        } ${dstChainTokenOut?.symbol}`
      : `${
          dlnOrderTxData && dstChainTokenOut
            ? formatThousands(
                Number.parseFloat(
                  toUiAmount(dlnOrderTxData.estimation.dstChainTokenOut.amount, dstChainTokenOut.decimals),
                ),
                4,
              )
            : '0'
        } ${dstChainTokenOut?.symbol}`;

    const orderSubmittedMessage = sameChainSwap
      ? `You have successfully submitted the order to swap ${displayAmountIn} for ${displayAmountOut} in ${dstChainName}.`
      : `You have successfully submitted the order to move ${displayAmountIn} from ${srcChainData?.chainName} to ${dstChainName} for ${displayAmountOut}.`;

    if (sendTransactionAsync) {
      try {
        const txHash = await sendTransactionAsync({
          gas: data,
          ...config,
        });
        if (txHash) {
          const explorerName = chain?.blockExplorers?.default.name;
          const explorerLink = `${chain?.blockExplorers?.default.url}/tx/${txHash}`;
          addTransactionNotification({
            completedTitle: sameChainSwap ? 'Swap transaction' : 'Cross-chain trade',
            completedMessage: orderSubmittedMessage,
            finality: 'processed',
            operationType: OperationType.Swap,
            signature: txHash as string,
            txInfoFetchStatus: 'fetched',
            explorerLink,
          });
          consoleOut('explorerLink', explorerLink, 'cadetblue');
          setUiStage('order-submitted');
          setOrderSubmittedContent({
            message: orderSubmittedMessage,
            txHash: txHash,
            explorer: {
              name: explorerName ?? 'Mainnet Explorer',
              url: explorerLink,
            },
          });
        }
      } catch (error) {
        console.error(error);
        setOrderFailedContent(`${error}`);
      }
    }
  };

  const { onExecute } = useTransaction();

  const solanaSwapTx = async () => {
    if (!publicKey) return;

    setOrderFailedContent('');
    setOrderSubmittedContent(undefined);

    const dlnOrderTxData = quote as DlnOrderCreateTxResponse;
    const singleChainSwapTxData = singlChainQuote as SwapCreateTxResponse;

    const displayAmountIn = sameChainSwap
      ? `${
          singleChainSwapTxData && srcChainTokenIn
            ? formatThousands(
                Number.parseFloat(toUiAmount(singleChainSwapTxData.tokenIn.amount, srcChainTokenIn.decimals)),
                4,
              )
            : '0'
        } ${srcChainTokenIn?.symbol}`
      : `${
          dlnOrderTxData && srcChainTokenIn
            ? formatThousands(
                Number.parseFloat(
                  toUiAmount(dlnOrderTxData.estimation.srcChainTokenIn.amount, srcChainTokenIn.decimals),
                ),
                4,
              )
            : '0'
        } ${srcChainTokenIn?.symbol}`;
    const displayAmountOut = sameChainSwap
      ? `${
          singleChainSwapTxData && dstChainTokenOut
            ? formatThousands(
                Number.parseFloat(toUiAmount(singleChainSwapTxData.tokenOut.amount, dstChainTokenOut.decimals)),
                4,
              )
            : '0'
        } ${dstChainTokenOut?.symbol}`
      : `${
          dlnOrderTxData && dstChainTokenOut
            ? formatThousands(
                Number.parseFloat(
                  toUiAmount(dlnOrderTxData.estimation.dstChainTokenOut.amount, dstChainTokenOut.decimals),
                ),
                4,
              )
            : '0'
        } ${dstChainTokenOut?.symbol}`;
    const orderSubmittedMessage = sameChainSwap
      ? `You have successfully submitted the order to swap ${displayAmountIn} for ${displayAmountOut} in ${dstChainName}.`
      : `You have successfully submitted the order to move ${displayAmountIn} from ${srcChainData?.chainName} to ${dstChainName} for ${displayAmountOut}.`;

    const payload = () => {
      // Lets ensure we have the tx data
      if ((sameChainSwap && !singleChainSwapTxData?.tx?.data) || (!sameChainSwap && !dlnOrderTxData?.tx.data))
        return undefined;

      return {
        txData: sameChainSwap ? singleChainSwapTxData : dlnOrderTxData,
      };
    };

    await onExecute({
      name: 'Swap asset',
      loadingMessage: () =>
        sameChainSwap
          ? `Swapping ${displayAmountIn} → ${displayAmountOut} in ${dstChainName}`
          : `Bridge ${displayAmountIn} ${srcChainData?.chainName} → ${displayAmountOut} in ${dstChainName}`,
      completedMessage: () =>
        sameChainSwap
          ? `Successfully swapped ${displayAmountIn} → ${displayAmountOut} in ${dstChainName}`
          : `Order created to bridge ${displayAmountIn} ${srcChainData?.chainName} → ${displayAmountOut} in ${dstChainName}`,
      operationType: OperationType.Swap,
      payload,
      setIsBusy,
      nativeBalance,
      generateTransaction: async ({ data }) => {
        return createVersionedTxFromEncodedTx(
          connection, // connection
          data.txData?.tx?.data ?? '', // hex-encoded tx
        );
      },
      onTxSent: txHash => {
        setUiStage('order-submitted');
        setOrderSubmittedContent({
          message: orderSubmittedMessage,
          txHash,
        });
      },
    }).catch(reason => {
      console.error(reason);
      setOrderFailedContent(reason.toString());
    });
  };

  const onStartTransaction = () => {
    if (isSrcChainSolana) {
      solanaSwapTx();
    } else {
      evmSwapTx();
    }
  };

  //** Validation

  const getTxPreparationErrorMessage = useCallback(() => {
    let errorString = '';
    if (preparedTxError) {
      errorString = preparedTxError.toString();
      if (errorString.indexOf('EstimateGasExecutionError') !== -1) {
        return 'Insufficient funds to send the transaction';
      }
    }

    return 'Error preparing the Tx';
  }, [preparedTxError]);

  const isRecipientValid =
    dstChainTokenOutRecipient &&
    ((destinationChain !== SOLANA_CHAIN_ID && isEvmValidAddress(dstChainTokenOutRecipient)) ||
      (destinationChain === SOLANA_CHAIN_ID && isValidAddress(dstChainTokenOutRecipient)));

  const isBuildingTx = dstChainTokenOutRecipient && (quote || singlChainQuote);

  const isTransferValid = useMemo(() => {
    if (isSrcChainSolana && !publicKey) {
      return false;
    }
    if (destinationChain === sourceChain && srcChainTokenIn?.address === dstChainTokenOut?.address) {
      return false;
    }
    if (inputAmountBn.isZero()) {
      return false;
    }
    if (tokenBalanceBn.isZero() || tokenBalanceBn.lt(inputAmountBn)) {
      return false;
    }
    if (tokenBalanceBn.lt(operatingExpensesBn.add(inputAmountBn))) {
      return false;
    }
    if (lastQuoteError) {
      return false;
    }
    if (destinationChain !== sourceChain && !dstChainTokenOutRecipient) {
      return false;
    }
    if (!isRecipientValid) {
      return false;
    }
    if (isErrorPreparingTx) {
      return false;
    }
    if (sourceChain === destinationChain) {
      return true;
    }

    return true;
  }, [
    inputAmountBn,
    tokenBalanceBn,
    destinationChain,
    operatingExpensesBn,
    srcChainTokenIn?.address,
    dstChainTokenOut?.address,
    dstChainTokenOutRecipient,
    isErrorPreparingTx,
    isRecipientValid,
    isSrcChainSolana,
    lastQuoteError,
    sourceChain,
    publicKey,
  ]);

  const transactionStartButtonLabel = useMemo(() => {
    if (isFetchingQuote) {
      return isBuildingTx ? 'Refreshing order' : 'Refreshing quote';
    }
    if (isSrcChainSolana && !publicKey) {
      return 'Connect wallet';
    }
    if (destinationChain === sourceChain && srcChainTokenIn?.address === dstChainTokenOut?.address) {
      return 'Tokens should be different';
    }
    if (inputAmountBn.isZero()) {
      return 'No amount';
    }
    if (tokenBalanceBn.isZero()) {
      return 'No balance';
    }
    if (tokenBalanceBn.lt(inputAmountBn)) {
      return srcChainTokenIn ? `Amount exceeds your ${srcChainTokenIn.symbol} balance` : 'Amount exceeds your balance';
    }
    if (tokenBalanceBn.lt(operatingExpensesBn.add(inputAmountBn))) {
      return srcChainTokenIn
        ? `Insufficient balance for this trade (min ${formatThousands(
            Number.parseFloat(toUiAmount(operatingExpensesBn.add(inputAmountBn), srcChainTokenIn.decimals)),
            5,
          )})`
        : 'Insufficient balance to cover fees';
    }
    if (lastQuoteError) {
      return getUiErrorString(lastQuoteError);
    }
    if (destinationChain !== sourceChain && !dstChainTokenOutRecipient) {
      return `Missing recipient's ${dstChainName} address`;
    }
    if (!isRecipientValid) {
      return 'Recipient address is not valid';
    }
    if (isErrorPreparingTx) {
      return getTxPreparationErrorMessage();
    }
    if (sourceChain === destinationChain) {
      return 'Confirm transfer';
    }

    return 'Create trade';
  }, [
    isBuildingTx,
    dstChainName,
    inputAmountBn,
    tokenBalanceBn,
    isFetchingQuote,
    srcChainTokenIn,
    destinationChain,
    operatingExpensesBn,
    dstChainTokenOut?.address,
    dstChainTokenOutRecipient,
    getTxPreparationErrorMessage,
    isErrorPreparingTx,
    isRecipientValid,
    isSrcChainSolana,
    lastQuoteError,
    sourceChain,
    publicKey,
  ]);

  // Set EVM chain on the connected adapter when source chain is changed
  useEffect(() => {
    if (isAddressConnected && sourceChain !== SOLANA_CHAIN_ID) {
      switchChain?.({ chainId: sourceChain });
    }
  }, [isAddressConnected, sourceChain, switchChain]);

  // Establish sender address.
  useEffect(() => {
    if (isSrcChainSolana && publicKey) {
      consoleOut('Establishing sender:', publicKey.toBase58(), 'cadetblue');
      setSenderAddress(publicKey.toBase58());
    } else if (!isSrcChainSolana && isAddressConnected && address) {
      consoleOut('Establishing sender:', address, 'cadetblue');
      setSenderAddress(address);
    } else {
      consoleOut('Establishing sender:', '', 'cadetblue');
      setSenderAddress('');
    }
  }, [address, isAddressConnected, isSrcChainSolana, publicKey, setSenderAddress]);

  // Keep solana native account balance updated
  useEffect(() => {
    setNativeBalance(getAmountFromLamports(account?.lamports));
  }, [account?.lamports]);

  // Keep selected token balance updated
  useEffect(() => {
    if (isSrcChainSolana) {
      // Update for Solana
      if (!publicKey || !srcChainTokenIn || !isValidAddress(srcChainTokenIn.address)) {
        setTokenBalanceBn(new BN(0));

        return;
      }
      if (srcChainTokenIn.address === NATIVE_SOL.address) {
        const balanceBn = toTokenAmount(nativeBalance, srcChainTokenIn.decimals);
        setTokenBalanceBn(new BN(balanceBn.toString()));
      } else {
        consoleOut('Creating PK for', srcChainTokenIn.address, 'cadetblue');
        const srcTokenPk = new PublicKey(srcChainTokenIn.address);
        const srcTokenAddress = findATokenAddress(publicKey, srcTokenPk);
        getTokenAccountBalanceByAddress(connection, srcTokenAddress)
          .then(result => {
            const balance = result?.uiAmount ?? 0;
            consoleOut('srcToken balance:', balance, 'cadetblue');
            const balanceBn = toTokenAmount(balance, srcChainTokenIn.decimals);
            setTokenBalanceBn(new BN(balanceBn.toString()));
          })
          .catch(() => {
            setTokenBalanceBn(new BN(0));
          });
      }
    } else {
      // Update for EVM
      if (srcChainTokenIn?.chainId !== SOLANA_CHAIN_ID && balance.data) {
        consoleOut('srcToken balance:', balance.data.value.toString(), 'cadetblue');
        setTokenBalanceBn(new BN(balance.data.value.toString()));
      } else {
        setTokenBalanceBn(new BN(0));
      }
    }
  }, [balance.data, connection, isSrcChainSolana, nativeBalance, publicKey, srcChainTokenIn]);

  // Set srcChainTokenIn if srcTokens are loaded
  useEffect(() => {
    if (srcTokens && !srcChainTokenIn) {
      let initialToken: TokenInfo | undefined = undefined;
      consoleOut('srcTokens', srcTokens, 'cadetblue');
      if (fromAssetSymbol) {
        initialToken = srcTokens.find(t => t.symbol === fromAssetSymbol);
      }
      setSrcChainTokenIn(initialToken ?? srcTokens[0]);
    }
  }, [fromAssetSymbol, setSrcChainTokenIn, srcChainTokenIn, srcTokens]);

  // Set dstChainTokenOut if dstTokens are loaded
  useEffect(() => {
    if (dstTokens) {
      consoleOut('dstTokens', dstTokens, 'cadetblue');
      setDstChainTokenOut(dstTokens[0]);
    }
  }, [dstTokens, setDstChainTokenOut]);

  // Process debounced input
  useEffect(() => setAmountIn(debouncedAmountInput), [debouncedAmountInput, setAmountIn]);

  // Refresh routes every 29 seconds
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (!sourceChain || !destinationChain) return;

    if (inputAmountBn.gt(new BN(0)) && srcChainTokenIn?.address && dstChainTokenOut?.address) {
      timer = setInterval(() => {
        if (!isFetchingQuote) {
          consoleOut(`Refreshing quote after ${QUOTE_REFRESH_TIMEOUT / 1000} seconds`);
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
    inputAmountBn,
    destinationChain,
    dstChainTokenOut?.address,
    srcChainTokenIn?.address,
    isFetchingQuote,
    forceRefresh,
    sourceChain,
  ]);

  const getPanel1Classes = () => {
    return `panel1 ${uiStage === 'order-setup' ? 'show' : 'hide'}`;
  };

  const getPanel2Classes = () => {
    return `panel2 ${uiStage === 'order-submitted' ? 'show' : 'hide'}`;
  };

  return (
    <>
      <div className='place-transaction-box debridge-wrapper'>
        <div className='debridge-container'>
          <div className={getPanel1Classes()}>
            {/* Source chain, token & amount */}
            <div className='flex-fixed-left mb-1 align-items-center'>
              <div className='left flex-row align-items-center gap-2'>
                <div className='form-label mb-0'>From</div>
                <div className='dropdown-trigger no-decoration'>
                  <Select
                    className='auto-height'
                    value={sourceChain}
                    style={{ width: 'auto', maxWidth: 'none' }}
                    popupClassName='chain-select-dropdown'
                    onChange={onSrcChainSelected}
                    bordered={false}
                    showArrow={false}
                    disabled={isBusy || isFetchingQuote}
                    dropdownRender={menu => <div>{menu}</div>}
                  >
                    {SUPPORTED_CHAINS.map(item => (
                      <Option key={`source-${item.chainId}`} value={item.chainId}>
                        <div className='transaction-list-row no-pointer'>
                          <div className='icon-cell'>
                            {item.chainIcon ? (
                              <img alt={`${item.chainName}`} width={18} height={18} src={item.chainIcon} />
                            ) : (
                              <Identicon address={item.chainName} style={{ width: '18', display: 'inline-flex' }} />
                            )}
                          </div>
                          <div className='description-cell'>{item.chainName}</div>
                        </div>
                      </Option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className='right flex-row justify-content-end'>
                {!isSrcChainSolana && isAddressConnected ? <CustomConnectButton /> : null}
              </div>
            </div>
            <div className='well mb-3'>
              <div className='flex-fixed-left'>
                <div className='left'>
                  <span className={`add-on ${isBusy || isFetchingQuote ? 'click-disabled' : 'simplelink'}`}>
                    {srcChainTokenIn ? (
                      <TokenDisplay
                        iconSize='large'
                        onClick={() => showTokenSelector('source')}
                        mintAddress={srcChainTokenIn.address}
                        name={srcChainTokenIn.name}
                        showCaretDown={true}
                        fullTokenInfo={srcChainTokenIn}
                      />
                    ) : null}
                    {/* MAX CTA */}
                    {srcChainTokenIn ? (
                      <div className='token-max simplelink' onKeyDown={() => {}} onClick={getMaxAmountIn}>
                        MAX
                      </div>
                    ) : null}
                  </span>
                </div>
                <div className='right'>
                  <input
                    className='general-text-input text-right'
                    inputMode='decimal'
                    autoComplete='off'
                    autoCorrect='off'
                    type='text'
                    onChange={e => onAmountInChange(e.target.value)}
                    pattern='^[0-9]*[.,]?[0-9]*$'
                    placeholder='0.0'
                    minLength={1}
                    maxLength={79}
                    spellCheck='false'
                    value={amountInput}
                  />
                </div>
              </div>
              <div className='flex-fixed-right'>
                <div className='left inner-label'>
                  <span>{t('transactions.send-amount.label-right')}:</span>
                  <span>
                    {`${
                      tokenBalanceBn && srcChainTokenIn
                        ? formatThousands(Number.parseFloat(toUiAmount(tokenBalanceBn, srcChainTokenIn.decimals)), 5)
                        : '0'
                    }`}
                  </span>
                  {srcChainTokenIn && operatingExpensesBn.gt(new BN(0)) ? (
                    <Tooltip
                      placement='bottom'
                      title={`Included gas paid on top of the amount and covers takers' gas costs to fulfill your trade`}
                    >
                      <span>
                        {` (Gas: ${formatThousands(
                          Number.parseFloat(toUiAmount(operatingExpensesBn, srcChainTokenIn.decimals)),
                          5,
                        )})`}
                      </span>
                    </Tooltip>
                  ) : null}
                </div>
                <div className='right inner-label'>
                  {publicKey ? (
                    <span
                      className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'}
                      onKeyDown={() => {}}
                      onClick={() => refreshPrices()}
                    >
                      ~{amountIn ? toUsCurrency(getSrcTokenPrice()) : '$0.00'}
                    </span>
                  ) : (
                    <span>~$0.00</span>
                  )}
                </div>
              </div>
            </div>

            {/* Destination chain, token & amount */}
            <div className='flex-fixed-left mb-1 align-items-center'>
              <div className='left flex-row align-items-center gap-2'>
                <div className='form-label mb-0'>To</div>
                <div className='dropdown-trigger no-decoration'>
                  <Select
                    className='auto-height'
                    value={destinationChain}
                    style={{ width: 'auto', maxWidth: 'none' }}
                    popupClassName='chain-select-dropdown'
                    onChange={onDstChainSelected}
                    bordered={false}
                    showArrow={false}
                    disabled={isBusy || isFetchingQuote}
                    dropdownRender={menu => <div>{menu}</div>}
                  >
                    {SUPPORTED_CHAINS.map(item => (
                      <Option key={`destination-${item.chainId}`} value={item.chainId}>
                        <div className='transaction-list-row no-pointer'>
                          <div className='icon-cell'>
                            {item.chainIcon ? (
                              <img alt={`${item.chainName}`} width={18} height={18} src={item.chainIcon} />
                            ) : (
                              <Identicon address={item.chainName} style={{ width: '18', display: 'inline-flex' }} />
                            )}
                          </div>
                          <div className='description-cell'>{item.chainName}</div>
                        </div>
                      </Option>
                    ))}
                  </Select>
                </div>
              </div>
            </div>
            <div className='well mb-3'>
              <div className='flex-fixed-left'>
                <div className='left'>
                  <span className={`add-on ${isBusy || isFetchingQuote ? 'click-disabled' : 'simplelink'}`}>
                    {dstChainTokenOut ? (
                      <TokenDisplay
                        iconSize='large'
                        onClick={() => showTokenSelector('destination')}
                        mintAddress={dstChainTokenOut.address}
                        name={dstChainTokenOut.name}
                        showCaretDown={true}
                        fullTokenInfo={dstChainTokenOut}
                      />
                    ) : null}
                  </span>
                </div>
                <div className='right'>
                  <div
                    className={`static-data-field text-right ${
                      isFetchingQuote ? 'click-disabled fg-orange-red pulsate' : ''
                    }`}
                  >
                    {outputAmount}
                  </div>
                </div>
              </div>
              <div className='flex-fixed-right'>
                <div className='left inner-label'>
                  <span>Protocol fee:</span>
                  <span>{`${
                    quote && networkFeeToken
                      ? formatThousands(Number.parseFloat(toUiAmount(quote.fixFee, networkFeeToken.decimals)), 4)
                      : '0'
                  } ${networkFeeToken?.symbol}`}</span>
                </div>
                <div className='right inner-label'>
                  <span
                    className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'}
                    onKeyDown={() => {}}
                    onClick={() => refreshPrices()}
                  >
                    ~{outputAmount ? toUsCurrency(getDstTokenPrice()) : '$0.00'}
                  </span>
                </div>
              </div>
            </div>

            {/* Recipient address */}
            <div className='form-label'>Recipient address{sameChainSwap ? ' (Same wallet)' : ''}</div>
            <div className='well mb-3'>
              <div className='flex-fixed-right mb-1'>
                <div className='left position-relative'>
                  <span className='recipient-field-wrapper'>
                    <input
                      id='payment-recipient-field'
                      className='general-text-input'
                      autoComplete='on'
                      autoCorrect='off'
                      type='text'
                      onChange={e => handleRecipientAddressChange(e.target.value)}
                      placeholder={`Enter recipient's ${dstChainName} address`}
                      required={true}
                      spellCheck='false'
                      value={dstChainTokenOutRecipient}
                    />
                    <span
                      id='payment-recipient-static-field'
                      className={`${
                        dstChainTokenOutRecipient ? 'overflow-ellipsis-middle no-tail' : 'placeholder-text'
                      }`}
                    >
                      {dstChainTokenOutRecipient || `Enter recipient's ${dstChainName} address`}
                    </span>
                  </span>
                </div>
                <div className='right'>
                  <span>&nbsp;</span>
                </div>
              </div>
            </div>

            {/* Action button */}
            {!isSrcChainSolana && !isAddressConnected ? <CustomConnectButton /> : null}
            {isSrcChainSolana || isAddressConnected ? (
              <Button
                className={`main-cta ${isBusy ? 'inactive' : ''}`}
                block
                type='primary'
                shape='round'
                size='large'
                onClick={onStartTransaction}
                disabled={isExecutingTx || isFetchingQuote || !isTransferValid}
              >
                {isBusy && (
                  <span className='mr-1'>
                    <LoadingOutlined style={{ fontSize: '16px' }} />
                  </span>
                )}
                <span className={isFetchingQuote ? 'inactive fg-orange-red pulsate' : ''}>
                  {isBusy || isExecutingTx ? 'Swapping' : transactionStartButtonLabel}
                </span>
              </Button>
            ) : null}
          </div>
          <div className={getPanel2Classes()} style={{}}>
            {orderSubmittedContent ? (
              <div className='order-submitted'>
                <h2 className='highlight-title'>Order Submitted!</h2>
                <CheckCircleFilled style={{ fontSize: 64 }} className='icon' />
                <p className='font-size-120 text-center'>
                  {orderSubmittedContent.message}
                  <br />
                  Check the transaction status on
                  {isSrcChainSolana ? (
                    <a
                      className='secondary-link ml-1'
                      href={`${SOLANA_EXPLORER_URI_INSPECT_TRANSACTION}${
                        orderSubmittedContent.txHash
                      }${getSolanaExplorerClusterParam()}`}
                      target='_blank'
                      rel='noopener noreferrer'
                    >
                      solana.fm
                    </a>
                  ) : orderSubmittedContent.explorer ? (
                    <a
                      className='secondary-link ml-1'
                      href={orderSubmittedContent.explorer.url}
                      target='_blank'
                      rel='noopener noreferrer'
                    >
                      {orderSubmittedContent.explorer.name}
                    </a>
                  ) : null}
                </p>
                <Button
                  block
                  type='primary'
                  shape='round'
                  size='large'
                  onClick={() => {
                    setAmountInput('');
                    setUiStage('order-setup');
                  }}
                >
                  New Swap
                </Button>
              </div>
            ) : null}
            {orderFailedContent ? (
              <div className='order-submitted'>
                <h2 className='highlight-title'>Order Not Submitted!</h2>
                <CloseCircleFilled style={{ fontSize: 64 }} className='icon' />
                <p>Your order failed to submit. You can try a different amount and restart the transaction.</p>
                <Button block type='primary' shape='round' size='large' onClick={() => setUiStage('order-setup')}>
                  Review Swap
                </Button>
              </div>
            ) : null}
          </div>
        </div>
        {/* Token selection modal */}
        {isTokenSelectorModalVisible ? (
          <Modal
            className='mean-modal unpadded-content'
            open={isTokenSelectorModalVisible}
            title={<div className='modal-title'>{t('token-selector.modal-title')}</div>}
            onCancel={closeTokenSelector}
            width={420}
            footer={null}
          >
            {selectedTokenSet === 'source' ? (
              <TokenSelector
                tokens={srcTokens}
                isSolana={isSrcChainSolana}
                selectedToken={srcChainTokenIn?.address}
                onClose={closeTokenSelector}
                onTokenSelected={t => handleTokenSelection('source', t)}
              />
            ) : (
              <TokenSelector
                tokens={dstTokens}
                isSolana={destinationChain === SOLANA_CHAIN_ID}
                selectedToken={dstChainTokenOut?.address}
                onClose={closeTokenSelector}
                onTokenSelected={t => handleTokenSelection('destination', t)}
              />
            )}
          </Modal>
        ) : null}
      </div>

      {/* Rate and refresh */}
      {uiStage === 'order-setup' ? (
        <div className='debridge-wrapper'>
          <div className='flex-fixed-right'>
            {/* Rate display */}
            <div className='left text-center'>
              <SwapRate
                swapRate={swapRate}
                srcChainTokenIn={srcChainTokenIn}
                dstChainTokenOut={dstChainTokenOut}
                inputAmount={inputAmount}
                outputAmount={outputAmount}
                onFlipRate={() => setSwapRate(!swapRate)}
              />
            </div>
            {/* Refresh button */}
            <div className='right flex justify-content-end'>
              {isFetchingQuote || (srcChainTokenIn && dstChainTokenOut && dstChainTokenOutAmount) ? (
                <span className='icon-button-container'>
                  {isFetchingQuote ? (
                    <span className='icon-container'>
                      <SyncOutlined spin />
                    </span>
                  ) : (
                    <Tooltip placement='bottom' title='Refresh quote'>
                      <Button
                        type='default'
                        shape='circle'
                        size='small'
                        icon={<ReloadOutlined />}
                        onClick={forceRefresh}
                      />
                    </Tooltip>
                  )}
                </span>
              ) : (
                <span>&nbsp;</span>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};

export default DlnBridgeUi;
