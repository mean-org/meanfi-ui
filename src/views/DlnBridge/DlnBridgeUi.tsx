import { useContext, useEffect, useMemo, useState } from 'react';
import { SOLANA_CHAIN_ID, SUPPORTED_CHAINS, getChainById, useDlnBridge } from './DlnBridgeProvider';
import TokenSelector from './TokenSelector';
import { Button, Modal, Select, Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';
import { Identicon } from 'components/Identicon';
import { consoleOut, isValidAddress, toUsCurrency } from 'middleware/ui';
import './style.scss';
import { TokenDisplay } from 'components/TokenDisplay';
import { NATIVE_SOL } from 'constants/tokens';
import { useNativeAccount } from 'contexts/accounts';
import {
  cutNumber,
  findATokenAddress,
  formatThousands,
  getAmountFromLamports,
  getAmountWithSymbol,
  isValidNumber,
  toTokenAmount,
  toUiAmount,
} from 'middleware/utils';
import {
  INPUT_DEBOUNCE_TIME,
  MIN_SOL_BALANCE_REQUIRED,
  SOLANA_EXPLORER_URI_INSPECT_TRANSACTION,
} from 'constants/common';
import { BN } from '@project-serum/anchor';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from 'contexts/wallet';
import { getSolanaExplorerClusterParam, useConnection } from 'contexts/connection';
import { getTokenAccountBalanceByAddress } from 'middleware/accounts';
import { AppStateContext } from 'contexts/appstate';
import { CheckCircleFilled, CloseCircleFilled, LoadingOutlined, ReloadOutlined, SyncOutlined } from '@ant-design/icons';
import { useDebounce } from 'hooks/useDebounce';
import useTransaction from 'hooks/useTransaction';
import { DlnOrderCreateTxResponse } from './dlnOrderTypes';
import { OperationType } from 'models/enums';
import createVersionedTxFromEncodedTx from './createVersionedTxFromEncodedTx';
import { SwapCreateTxResponse } from './singlChainOrderTypes';
import {
  useAccount,
  useBalance,
  useNetwork,
  usePrepareSendTransaction,
  useSendTransaction,
  useSwitchNetwork,
} from 'wagmi';
import { fetchFeeData, FetchFeeDataResult } from '@wagmi/core';
import CustomConnectButton from './CustomConnectButton';
import { TxConfirmationContext } from 'contexts/transaction-status';
import SwapRate from './SwapRate';

const { Option } = Select;
type ActionTarget = 'source' | 'destination';
type UiStage = 'order-setup' | 'order-submitted';
const QUOTE_REFRESH_TIMEOUT = 29000;

const DlnBridgeUi = () => {
  const { t } = useTranslation('common');
  const { account } = useNativeAccount();
  const connection = useConnection();
  const { publicKey } = useWallet();
  const { loadingPrices, refreshPrices, getTokenPriceByAddress } = useContext(AppStateContext);
  const { addTransactionNotification } = useContext(TxConfirmationContext);
  const [uiStage, setUiStage] = useState<UiStage>('order-setup');
  const [orderSubmittedContent, setOrderSubmittedContent] = useState<{ message: string; txHash: string }>();
  const [orderFailedContent, setOrderFailedContent] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [amountInput, setAmountInput] = useState('');
  const debouncedAmountInput = useDebounce<string>(amountInput, INPUT_DEBOUNCE_TIME);

  const [nativeBalance, setNativeBalance] = useState(0);
  const [tokenBalance, setSelectedTokenBalance] = useState<number>(0);
  const [tokenBalanceBn, setSelectedTokenBalanceBn] = useState(new BN(0));
  const [swapRate, setSwapRate] = useState(false);
  const [isTokenSelectorModalVisible, setTokenSelectorModalVisibility] = useState(false);
  const [selectedTokenSet, setSelectedTokenSet] = useState<ActionTarget>('source');
  const [chainFeeData, setChainFeeData] = useState<FetchFeeDataResult>();

  const {
    sourceChain,
    destinationChain,
    srcTokens,
    dstTokens,
    srcChainTokenIn,
    dstChainTokenOut,
    quote,
    singlChainQuote,
    amountIn,
    dstChainTokenOutAmount,
    dstChainTokenOutRecipient,
    isFetchingQuote,
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

  const { address } = useAccount();
  const { chain } = useNetwork();

  const isAddressConnected = !!address;
  const isSrcChainSolana = sourceChain === SOLANA_CHAIN_ID;
  const isCrossChainSwap = sourceChain !== destinationChain;
  const sameChainSwap = sourceChain === destinationChain;
  const srcChainData = useMemo(() => getChainById(sourceChain), [sourceChain]);
  const networkFeeToken = useMemo(() => {
    if (srcTokens && srcChainData?.networkFeeToken) {
      const feeToken = srcTokens.find(t => t.address === srcChainData.networkFeeToken);
      console.log('feeToken:', feeToken);
      return feeToken;
    }

    return undefined;
  }, [srcChainData?.networkFeeToken, srcTokens]);
  const dstChainName = useMemo(() => getChainById(destinationChain)?.chainName ?? 'Unknown', [destinationChain]);

  const { switchNetwork } = useSwitchNetwork();

  const balance = useBalance({
    enabled: sourceChain !== SOLANA_CHAIN_ID && srcChainTokenIn?.chainId !== SOLANA_CHAIN_ID,
    address,
    chainId: sourceChain,
    token:
      srcChainTokenIn?.address === srcChainData?.networkFeeToken ? undefined : `0x${srcChainTokenIn?.address.slice(2)}`,
  });

  useEffect(() => {
    if (sourceChain === SOLANA_CHAIN_ID) {
      setChainFeeData(undefined);
      return;
    }

    fetchFeeData().then(value => setChainFeeData(value));
  }, [sourceChain]);

  const getMaxAmountIn = () => {
    if (!srcChainTokenIn) {
      setAmountInput('');
      return;
    }

    // If source chain is Solana lets force a margin of 0.05 SOL as min balance
    if (srcChainTokenIn.address === NATIVE_SOL.address) {
      const safeAmount = nativeBalance - MIN_SOL_BALANCE_REQUIRED;
      const amount = safeAmount > 0 ? safeAmount : 0;
      setAmountInput(cutNumber(amount > 0 ? amount : 0, srcChainTokenIn.decimals));

      return;
    }

    /**
      - userBalance = balance of user's wallet
      - operatingExpenses = prependedOperatingExpenseCost saved from the last /create-tx query
      - maxGas = current max gas for the current fromChain (that's a regular gas calculation dapps use for fast confirmation)
        maxFeePerGas = baseFeePerGas + maxPriorityFeePerGas
        WAGMI already covers this calculation https://wagmi.sh/core/actions/fetchFeeData
      - protocolFixFee - fixFee in native token for this chain (https://docs.dln.trade/the-core-protocol/fees-and-supported-chains)

      From balance we deduct maxGas, and also operatingExpenses with 15% margin and fixFee
      Final formula:
      max = userBalance - maxGas - (isCrossChainSwap ? protocolFixFee : 0) - (isCrossChainSwap ? operatingExpenses : 0);
    */

    consoleOut('tokenBalanceBn:', tokenBalanceBn, 'brown');
    if (sameChainSwap) {
      const maxAmount = toUiAmount(tokenBalanceBn, srcChainTokenIn.decimals);
      consoleOut('maxAmount:', maxAmount, 'brown');
      setAmountInput(maxAmount);
    } else {
      const maxGas = chainFeeData?.maxFeePerGas ?? BigInt(0);
      const protocolFixFee = BigInt(isCrossChainSwap ? quote?.fixFee ?? 0 : 0);
      const userBalance = BigInt(tokenBalanceBn.toString());
      const operatingExpenses = BigInt(isCrossChainSwap ? quote?.prependedOperatingExpenseCost ?? 0 : 0);
      const max = userBalance - maxGas - protocolFixFee - operatingExpenses;

      consoleOut('chainFeeData:', chainFeeData, 'brown');
      consoleOut('userBalance:', userBalance, 'brown');
      consoleOut('maxGas:', maxGas, 'brown');
      consoleOut('protocolFixFee:', protocolFixFee, 'brown');
      consoleOut('operatingExpenses:', operatingExpenses, 'brown');
      consoleOut('max = userBalance - maxGas - protocolFixFee - operatingExpenses =>', max.toString(), 'brown');

      const maxAmount = toUiAmount(max.toString(), srcChainTokenIn.decimals);
      consoleOut('maxAmount:', maxAmount, 'brown');
      setAmountInput(maxAmount);
    }
  };

  const getSrcTokenPrice = () => {
    if (!amountIn || !srcChainTokenIn) {
      return 0;
    }

    return parseFloat(amountIn) * getTokenPriceByAddress(srcChainTokenIn.address, srcChainTokenIn.symbol);
  };

  const getOutputAmount = () => {
    if (!dstChainTokenOut || !dstChainTokenOutAmount) {
      return '0';
    }

    return toUiAmount(dstChainTokenOutAmount, dstChainTokenOut.decimals);
  };

  const getDstTokenPrice = () => {
    if (!dstChainTokenOut || !dstChainTokenOutAmount) {
      return 0;
    }

    const uiAmount = getOutputAmount();

    return parseFloat(uiAmount) * getTokenPriceByAddress('', dstChainTokenOut.symbol);
  };

  const showTokenSelector = (tokenSet: ActionTarget) => {
    setSelectedTokenSet(tokenSet);
    setTokenSelectorModalVisibility(true);
  };

  const closeTokenSelector = () => setTokenSelectorModalVisibility(false);

  const onSrcChainSelected = (e: any) => {
    consoleOut('Selected chain:', e, 'blue');
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

  const onDstChainSelected = (e: any) => {
    consoleOut('Selected chain:', e, 'blue');
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

  const onAmountInChange = (e: any) => {
    let newValue = e.target.value;

    const decimals = srcChainTokenIn?.decimals ?? 0;
    const splitted = newValue.toString().split('.');
    const left = splitted[0];

    if (decimals && splitted[1]) {
      if (splitted[1].length > decimals) {
        splitted[1] = splitted[1].slice(0, -1);
        newValue = splitted.join('.');
      }
    } else if (left.length > 1) {
      const number = splitted[0] - 0;
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

  const handleRecipientAddressChange = (e: any) => {
    const inputValue = e.target.value as string;
    // Set the input value
    const trimmedValue = inputValue.trim();
    setDstChainTokenOutRecipient(trimmedValue);
  };

  const inputAmount = parseFloat(amountIn);
  const outputAmount = parseFloat(getOutputAmount());

  const isRecipientValid =
    dstChainTokenOutRecipient && destinationChain === SOLANA_CHAIN_ID && isValidAddress(dstChainTokenOutRecipient);

  const isTransferValid = useMemo(() => {
    if (isSrcChainSolana && !publicKey) {
      return false;
    } else if (destinationChain === sourceChain && srcChainTokenIn?.address === dstChainTokenOut?.address) {
      return false;
    } else if (destinationChain !== sourceChain && !dstChainTokenOutRecipient) {
      return false;
    } else if (!isRecipientValid) {
      return false;
    } else if (sourceChain === destinationChain) {
      return true;
    } else {
      return true;
    }
  }, [
    destinationChain,
    dstChainTokenOut?.address,
    dstChainTokenOutRecipient,
    publicKey,
    sourceChain,
    isRecipientValid,
    isSrcChainSolana,
    srcChainTokenIn?.address,
  ]);

  const transactionStartButtonLabel = useMemo(() => {
    if (isSrcChainSolana && !publicKey) {
      return 'Connect wallet';
    } else if (destinationChain === sourceChain && srcChainTokenIn?.address === dstChainTokenOut?.address) {
      return 'Change source or destination token';
    } else if (sourceChain === destinationChain) {
      return 'Confirm transfer';
    } else if (destinationChain !== sourceChain && !dstChainTokenOutRecipient) {
      return `Missing recipient's ${dstChainName} address`;
    } else if (!isRecipientValid) {
      return `Recipient address is not valid`;
    } else {
      return 'Create trade';
    }
  }, [
    destinationChain,
    dstChainName,
    dstChainTokenOut?.address,
    dstChainTokenOutRecipient,
    publicKey,
    sourceChain,
    isRecipientValid,
    isSrcChainSolana,
    srcChainTokenIn?.address,
  ]);

  const { config } = usePrepareSendTransaction({
    enabled:
      !isSrcChainSolana &&
      !!(
        (quote && (quote as DlnOrderCreateTxResponse).tx.data) ||
        (singlChainQuote && (singlChainQuote as SwapCreateTxResponse).tx.data)
      ),
    to:
      !isSrcChainSolana && quote
        ? (quote as DlnOrderCreateTxResponse).tx.to
        : singlChainQuote
        ? (singlChainQuote as SwapCreateTxResponse).tx.data
        : undefined,
    value:
      !isSrcChainSolana && quote
        ? BigInt((quote as DlnOrderCreateTxResponse).tx?.value ?? 0)
        : singlChainQuote
        ? BigInt((singlChainQuote as SwapCreateTxResponse).tx.value ?? 0)
        : undefined,
    data:
      !isSrcChainSolana && quote
        ? `0x${(quote as DlnOrderCreateTxResponse).tx?.data?.slice(2)}`
        : singlChainQuote
        ? `0x${(singlChainQuote as SwapCreateTxResponse).tx?.data?.slice(2)}`
        : undefined,
  });

  const { isLoading, sendTransactionAsync } = useSendTransaction(config);

  const evmSwapTx = async () => {
    if (!isAddressConnected) return;

    console.log('config:', config);

    setOrderFailedContent('');
    setOrderSubmittedContent(undefined);

    const dlnOrderTxData = quote as DlnOrderCreateTxResponse;
    const singleChainSwapTxData = singlChainQuote as SwapCreateTxResponse;

    const displayAmountIn = sameChainSwap
      ? `${
          singleChainSwapTxData && srcChainTokenIn
            ? formatThousands(parseFloat(toUiAmount(singleChainSwapTxData.tokenIn.amount, srcChainTokenIn.decimals)), 4)
            : '0'
        } ${srcChainTokenIn?.symbol}`
      : `${
          dlnOrderTxData && srcChainTokenIn
            ? formatThousands(
                parseFloat(toUiAmount(dlnOrderTxData.estimation.srcChainTokenIn.amount, srcChainTokenIn.decimals)),
                4,
              )
            : '0'
        } ${srcChainTokenIn?.symbol}`;
    const displayAmountOut = sameChainSwap
      ? `${
          singleChainSwapTxData && dstChainTokenOut
            ? formatThousands(
                parseFloat(toUiAmount(singleChainSwapTxData.tokenOut.amount, dstChainTokenOut.decimals)),
                4,
              )
            : '0'
        } ${dstChainTokenOut?.symbol}`
      : `${
          dlnOrderTxData && dstChainTokenOut
            ? formatThousands(
                parseFloat(toUiAmount(dlnOrderTxData.estimation.dstChainTokenOut.amount, dstChainTokenOut.decimals)),
                4,
              )
            : '0'
        } ${dstChainTokenOut?.symbol}`;

    const orderSubmittedMessage = sameChainSwap
      ? `You have successfully submitted the order to swap ${displayAmountIn} for ${displayAmountOut} in ${dstChainName}.`
      : `You have successfully submitted the order to move ${displayAmountIn} from ${srcChainData?.chainName} to ${dstChainName} for ${displayAmountOut}.`;

    if (sendTransactionAsync) {
      try {
        const result = await sendTransactionAsync();
        if (result.hash) {
          const explorerLink = `${chain?.blockExplorers?.default.url}/tx/${result.hash}`;
          addTransactionNotification({
            completedTitle: sameChainSwap ? 'Swap transaction' : 'Cross-chain trade',
            completedMessage: orderSubmittedMessage,
            finality: 'processed',
            operationType: OperationType.Swap,
            signature: result.hash as string,
            txInfoFetchStatus: 'fetched',
            explorerLink,
          });
          console.log('explorerLink:', explorerLink);
          setUiStage('order-submitted');
          setOrderSubmittedContent({
            message: orderSubmittedMessage,
            txHash: result.hash,
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
            ? formatThousands(parseFloat(toUiAmount(singleChainSwapTxData.tokenIn.amount, srcChainTokenIn.decimals)), 4)
            : '0'
        } ${srcChainTokenIn?.symbol}`
      : `${
          dlnOrderTxData && srcChainTokenIn
            ? formatThousands(
                parseFloat(toUiAmount(dlnOrderTxData.estimation.srcChainTokenIn.amount, srcChainTokenIn.decimals)),
                4,
              )
            : '0'
        } ${srcChainTokenIn?.symbol}`;
    const displayAmountOut = sameChainSwap
      ? `${
          singleChainSwapTxData && dstChainTokenOut
            ? formatThousands(
                parseFloat(toUiAmount(singleChainSwapTxData.tokenOut.amount, dstChainTokenOut.decimals)),
                4,
              )
            : '0'
        } ${dstChainTokenOut?.symbol}`
      : `${
          dlnOrderTxData && dstChainTokenOut
            ? formatThousands(
                parseFloat(toUiAmount(dlnOrderTxData.estimation.dstChainTokenOut.amount, dstChainTokenOut.decimals)),
                4,
              )
            : '0'
        } ${dstChainTokenOut?.symbol}`;
    const orderSubmittedMessage = sameChainSwap
      ? `You have successfully submitted the order to swap ${displayAmountIn} for ${displayAmountOut} in ${dstChainName}.`
      : `You have successfully submitted the order to move ${displayAmountIn} from ${srcChainData?.chainName} to ${dstChainName} for ${displayAmountOut}.`;

    const payload = () => {
      // Lets ensure we have the tx data
      if ((sameChainSwap && !singleChainSwapTxData?.tx.data) || (!sameChainSwap && !dlnOrderTxData?.tx.data))
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
          publicKey, // feePayer
          data.txData?.tx.data, // hex-encoded tx
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

  // Set EVM chain on the connected adapter when source chain is changed
  useEffect(() => {
    if (isAddressConnected && sourceChain !== SOLANA_CHAIN_ID) {
      switchNetwork?.(sourceChain);
    }
  }, [isAddressConnected, sourceChain, switchNetwork]);

  // Establish sender address. So far only for Solana
  useEffect(() => {
    if (isSrcChainSolana && publicKey) {
      setSenderAddress(publicKey.toBase58());
    } else if (!isSrcChainSolana && address) {
      setSenderAddress(address);
    } else {
      setSenderAddress('');
    }
  }, [address, isSrcChainSolana, publicKey, setSenderAddress, sourceChain]);

  // Keep solana account balance updated
  useEffect(() => {
    setNativeBalance(getAmountFromLamports(account?.lamports));
  }, [account?.lamports]);

  // Keep selected token balance updated for EVM
  useEffect(() => {
    if (srcChainTokenIn && srcChainTokenIn.chainId !== SOLANA_CHAIN_ID) {
      if (balance.data) {
        console.log('balance:', balance.data);
        setSelectedTokenBalance(parseFloat(balance.data.formatted));
        setSelectedTokenBalanceBn(new BN(balance.data.value.toString()));
      }
    }
  }, [balance.data, srcChainTokenIn]);

  // Keep selected token balance updated for solana
  useEffect(() => {
    if (!isSrcChainSolana) return;

    if (!publicKey || !srcChainTokenIn) {
      setSelectedTokenBalance(0);
      setSelectedTokenBalanceBn(new BN(0));

      return;
    }

    if (!isValidAddress(srcChainTokenIn.address)) return;

    if (srcChainTokenIn.address === NATIVE_SOL.address) {
      setSelectedTokenBalance(nativeBalance);
      const balanceBn = toTokenAmount(nativeBalance, srcChainTokenIn.decimals);
      setSelectedTokenBalanceBn(new BN(balanceBn.toString()));

      return;
    }

    console.log('Creating PK for:', srcChainTokenIn.address);
    const srcTokenPk = new PublicKey(srcChainTokenIn.address);
    const srcTokenAddress = findATokenAddress(publicKey, srcTokenPk);
    getTokenAccountBalanceByAddress(connection, srcTokenAddress)
      .then(result => {
        const balance = result?.uiAmount ?? 0;
        consoleOut('srcToken balance:', balance, 'blue');
        setSelectedTokenBalance(balance);
        const balanceBn = toTokenAmount(balance, srcChainTokenIn.decimals);
        setSelectedTokenBalanceBn(new BN(balanceBn.toString()));
      })
      .catch(() => {
        setSelectedTokenBalance(0);
        setSelectedTokenBalanceBn(new BN(0));
      });
  }, [connection, isSrcChainSolana, nativeBalance, publicKey, srcChainTokenIn]);

  // Set srcChainTokenIn if srcTokens are loaded
  useEffect(() => {
    if (srcTokens) {
      console.log('srcTokens:', srcTokens);
      setSrcChainTokenIn(srcTokens[0]);
    }
  }, [setSrcChainTokenIn, srcTokens]);

  // Set dstChainTokenOut if dstTokens are loaded
  useEffect(() => {
    if (dstTokens) {
      console.log('dstTokens:', dstTokens);
      setDstChainTokenOut(dstTokens[0]);
    }
  }, [dstTokens, setDstChainTokenOut]);

  // Process debounced input
  useEffect(() => {
    console.log('Reflecting debounced value:', debouncedAmountInput);
    setAmountIn(debouncedAmountInput);
  }, [debouncedAmountInput, setAmountIn]);

  // Refresh routes every 29 seconds
  useEffect(() => {
    let timer: any;
    if (!sourceChain || !destinationChain) return;

    if (amountIn && parseFloat(amountIn) && srcChainTokenIn?.address && dstChainTokenOut?.address) {
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

  const getPanel1Classes = () => {
    return `panel1 ${uiStage === 'order-setup' ? 'show' : 'hide'}`;
  };

  const getPanel2Classes = () => {
    return `panel2 ${uiStage === 'order-submitted' ? 'show' : 'hide'}`;
  };

  return (
    <>
      <div className="place-transaction-box debridge-wrapper">
        <div className="debridge-container">
          <div className={getPanel1Classes()}>
            {/* Source chain, token & amount */}
            <div className="flex-fixed-left mb-1 align-items-center">
              <div className="left flex-row align-items-center gap-2">
                <div className="form-label mb-0">From</div>
                <div className="dropdown-trigger no-decoration">
                  <Select
                    className={`auto-height`}
                    value={sourceChain}
                    style={{ width: 'auto', maxWidth: 'none' }}
                    popupClassName="chain-select-dropdown"
                    onChange={onSrcChainSelected}
                    bordered={false}
                    showArrow={false}
                    dropdownRender={menu => <div>{menu}</div>}
                  >
                    {SUPPORTED_CHAINS.map(item => (
                      <Option key={`source-${item.chainId}`} value={item.chainId}>
                        <div className="transaction-list-row no-pointer">
                          <div className="icon-cell">
                            {item.chainIcon ? (
                              <img alt={`${item.chainName}`} width={18} height={18} src={item.chainIcon} />
                            ) : (
                              <Identicon address={item.chainName} style={{ width: '18', display: 'inline-flex' }} />
                            )}
                          </div>
                          <div className="description-cell">{item.chainName}</div>
                        </div>
                      </Option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="right flex-row justify-content-end">
                {!isSrcChainSolana && isAddressConnected ? <CustomConnectButton /> : null}
              </div>
            </div>
            <div className="well mb-3">
              <div className="flex-fixed-left">
                <div className="left">
                  <span className="add-on simplelink">
                    {srcChainTokenIn ? (
                      <TokenDisplay
                        iconSize="large"
                        onClick={() => showTokenSelector('source')}
                        mintAddress={srcChainTokenIn.address}
                        name={srcChainTokenIn.name}
                        showCaretDown={true}
                        fullTokenInfo={srcChainTokenIn}
                      />
                    ) : null}
                    {/* MAX CTA */}
                    {srcChainTokenIn ? (
                      <div className="token-max simplelink" onClick={getMaxAmountIn}>
                        MAX
                      </div>
                    ) : null}
                  </span>
                </div>
                <div className="right">
                  <input
                    className="general-text-input text-right"
                    inputMode="decimal"
                    autoComplete="off"
                    autoCorrect="off"
                    type="text"
                    onChange={onAmountInChange}
                    pattern="^[0-9]*[.,]?[0-9]*$"
                    placeholder="0.0"
                    minLength={1}
                    maxLength={79}
                    spellCheck="false"
                    value={amountInput}
                  />
                </div>
              </div>
              <div className="flex-fixed-right">
                <div className="left inner-label">
                  <span>{t('transactions.send-amount.label-right')}:</span>
                  <span>
                    {`${
                      tokenBalance && srcChainTokenIn
                        ? getAmountWithSymbol(tokenBalance, srcChainTokenIn.address, true)
                        : '0'
                    }`}
                  </span>
                </div>
                <div className="right inner-label">
                  {publicKey ? (
                    <span
                      className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'}
                      onClick={() => refreshPrices()}
                    >
                      ~{amountIn ? toUsCurrency(getSrcTokenPrice()) : '$0.00'}
                    </span>
                  ) : (
                    <span>~$0.00</span>
                  )}
                </div>
              </div>
              {isSrcChainSolana && nativeBalance < MIN_SOL_BALANCE_REQUIRED && (
                <div className="form-field-error">{t('transactions.validation.minimum-balance-required')}</div>
              )}
            </div>

            {/* Destination chain, token & amount */}
            <div className="flex-fixed-left mb-1 align-items-center">
              <div className="left flex-row align-items-center gap-2">
                <div className="form-label mb-0">To</div>
                <div className="dropdown-trigger no-decoration">
                  <Select
                    className={`auto-height`}
                    value={destinationChain}
                    style={{ width: 'auto', maxWidth: 'none' }}
                    popupClassName="chain-select-dropdown"
                    onChange={onDstChainSelected}
                    bordered={false}
                    showArrow={false}
                    dropdownRender={menu => <div>{menu}</div>}
                  >
                    {SUPPORTED_CHAINS.map(item => (
                      <Option key={`destination-${item.chainId}`} value={item.chainId}>
                        <div className="transaction-list-row no-pointer">
                          <div className="icon-cell">
                            {item.chainIcon ? (
                              <img alt={`${item.chainName}`} width={18} height={18} src={item.chainIcon} />
                            ) : (
                              <Identicon address={item.chainName} style={{ width: '18', display: 'inline-flex' }} />
                            )}
                          </div>
                          <div className="description-cell">{item.chainName}</div>
                        </div>
                      </Option>
                    ))}
                  </Select>
                </div>
              </div>
            </div>
            <div className="well mb-3">
              <div className="flex-fixed-left">
                <div className="left">
                  <span className="add-on simplelink">
                    {dstChainTokenOut ? (
                      <TokenDisplay
                        iconSize="large"
                        onClick={() => showTokenSelector('destination')}
                        mintAddress={dstChainTokenOut.address}
                        name={dstChainTokenOut.name}
                        showCaretDown={true}
                        fullTokenInfo={dstChainTokenOut}
                      />
                    ) : null}
                  </span>
                </div>
                <div className="right">
                  <div
                    className={`static-data-field text-right ${
                      isFetchingQuote ? 'click-disabled fg-orange-red pulsate' : ''
                    }`}
                  >
                    {outputAmount}
                  </div>
                </div>
              </div>
              <div className="flex-fixed-right">
                <div className="left inner-label">
                  <span>Protocol fee:</span>
                  <span>{`${
                    quote && networkFeeToken
                      ? formatThousands(parseFloat(toUiAmount(quote.fixFee, networkFeeToken.decimals)), 4)
                      : '0'
                  } ${networkFeeToken?.symbol}`}</span>
                </div>
                <div className="right inner-label">
                  {publicKey ? (
                    <span
                      className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'}
                      onClick={() => refreshPrices()}
                    >
                      ~{outputAmount ? toUsCurrency(getDstTokenPrice()) : '$0.00'}
                    </span>
                  ) : (
                    <span>~$0.00</span>
                  )}
                </div>
              </div>
            </div>

            {/* Recipient address */}
            <div className="form-label">Recipient address{sameChainSwap ? ' (Same wallet)' : ''}</div>
            <div className="well mb-3">
              <div className="flex-fixed-right mb-1">
                <div className="left position-relative">
                  <span className="recipient-field-wrapper">
                    <input
                      id="payment-recipient-field"
                      className="general-text-input"
                      autoComplete="on"
                      autoCorrect="off"
                      type="text"
                      onChange={handleRecipientAddressChange}
                      placeholder={`Enter recipient's ${dstChainName} address`}
                      required={true}
                      spellCheck="false"
                      value={dstChainTokenOutRecipient}
                    />
                    <span
                      id="payment-recipient-static-field"
                      className={`${
                        dstChainTokenOutRecipient ? 'overflow-ellipsis-middle no-tail' : 'placeholder-text'
                      }`}
                    >
                      {dstChainTokenOutRecipient || `Enter recipient's ${dstChainName} address`}
                    </span>
                  </span>
                </div>
                <div className="right">
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
                type="primary"
                shape="round"
                size="large"
                onClick={onStartTransaction}
                disabled={isLoading || isFetchingQuote || !isTransferValid}
              >
                {isBusy && (
                  <span className="mr-1">
                    <LoadingOutlined style={{ fontSize: '16px' }} />
                  </span>
                )}
                {isBusy ? 'Swapping' : transactionStartButtonLabel}
              </Button>
            ) : null}
          </div>
          <div className={getPanel2Classes()} style={{}}>
            {orderSubmittedContent ? (
              <div className="order-submitted">
                <h2 className="highlight-title">Order Submitted!</h2>
                <CheckCircleFilled style={{ fontSize: 64 }} className="icon" />
                <p className="font-size-120 text-center">
                  {orderSubmittedContent.message}
                  <br />
                  Check the transaction status on
                  <a
                    className="secondary-link ml-1"
                    href={`${SOLANA_EXPLORER_URI_INSPECT_TRANSACTION}${
                      orderSubmittedContent.txHash
                    }${getSolanaExplorerClusterParam()}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    solana.fm
                  </a>
                </p>
                <Button
                  block
                  type="primary"
                  shape="round"
                  size="large"
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
              <div className="order-submitted">
                <h2 className="highlight-title">Order Not Submitted!</h2>
                <CloseCircleFilled style={{ fontSize: 64 }} className="icon" />
                <p>Your order failed to submit. You can try a different amount and restart the transaction.</p>
                <Button block type="primary" shape="round" size="large" onClick={() => setUiStage('order-setup')}>
                  Review Swap
                </Button>
              </div>
            ) : null}
          </div>
        </div>
        {/* Token selection modal */}
        {isTokenSelectorModalVisible ? (
          <Modal
            className="mean-modal unpadded-content"
            open={isTokenSelectorModalVisible}
            title={<div className="modal-title">{t('token-selector.modal-title')}</div>}
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
                onTokenSelected={t => setSrcChainTokenIn(t)}
              />
            ) : (
              <TokenSelector
                tokens={dstTokens}
                isSolana={destinationChain === SOLANA_CHAIN_ID}
                selectedToken={dstChainTokenOut?.address}
                onClose={closeTokenSelector}
                onTokenSelected={t => setDstChainTokenOut(t)}
              />
            )}
          </Modal>
        ) : null}
      </div>

      {/* Rate and refresh */}
      {uiStage === 'order-setup' ? (
        <div className="debridge-wrapper">
          <div className="flex-fixed-right">
            {/* Rate display */}
            <div className="left text-center">
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
            <div className="right flex justify-content-end">
              {isFetchingQuote || (srcChainTokenIn && dstChainTokenOut && dstChainTokenOutAmount) ? (
                <span className="icon-button-container">
                  {isFetchingQuote ? (
                    <span className="icon-container">
                      <SyncOutlined spin />
                    </span>
                  ) : (
                    <Tooltip placement="bottom" title="Refresh quote">
                      <Button
                        type="default"
                        shape="circle"
                        size="small"
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
