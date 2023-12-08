import { useContext, useEffect, useMemo, useState } from 'react';
import { SOLANA_CHAIN_ID, SUPPORTED_CHAINS, getChainById, useDlnBridge } from './DlnBridgeProvider';
import TokenSelector from './TokenSelector';
import { Button, Modal, Select, Switch, Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';
import { Identicon } from 'components/Identicon';
import { IconSwapFlip } from 'Icons';
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
import { INPUT_DEBOUNCE_TIME, MIN_SOL_BALANCE_REQUIRED } from 'constants/common';
import { BN } from '@project-serum/anchor';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from 'contexts/wallet';
import { useConnection } from 'contexts/connection';
import { getTokenAccountBalanceByAddress } from 'middleware/accounts';
import { AppStateContext } from 'contexts/appstate';
import DebugInfo from './DebugInfo';
import { LoadingOutlined, ReloadOutlined, SyncOutlined } from '@ant-design/icons';
import { useDebounce } from 'hooks/useDebounce';
import useTransaction from 'hooks/useTransaction';
import { DlnOrderCreateTxResponse } from './dlnOrderTypes';
import { OperationType } from 'models/enums';
import createVersionedTxFromEncodedTx from './createVersionedTxFromEncodedTx';
import { SwapCreateTxResponse } from './singlChainOrderTypes';

const { Option } = Select;
type ActionTarget = 'source' | 'destination';

const DlnBridgeUi = () => {
  const { t } = useTranslation('common');
  const { account } = useNativeAccount();
  const connection = useConnection();
  const { publicKey } = useWallet();
  const { loadingPrices, isWhitelisted, refreshPrices, getTokenPriceByAddress } = useContext(AppStateContext);
  const [isBusy, setIsBusy] = useState(false);
  const [amountInput, setAmountInput] = useState('');
  const debouncedAmountInput = useDebounce<string>(amountInput, INPUT_DEBOUNCE_TIME);

  const [nativeBalance, setNativeBalance] = useState(0);
  const [tokenBalance, setSelectedTokenBalance] = useState<number>(0);
  const [tokenBalanceBn, setSelectedTokenBalanceBn] = useState(new BN(0));

  const [isTokenSelectorModalVisible, setTokenSelectorModalVisibility] = useState(false);
  const [selectedTokenSet, setSelectedTokenSet] = useState<ActionTarget>('source');

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
    senderAddress,
    srcChainTokenInAmount,
    dstChainTokenOutAmount,
    dstChainTokenOutRecipient,
    sendToDifferentAddress,
    isFetchingQuote,
    setSourceChain,
    setDestinationChain,
    setDstChainTokenOut,
    setSrcChainTokenIn,
    setSendToDifferentAddress,
    setDstChainTokenOutRecipient,
    setSenderAddress,
    setAmountIn,
    flipNetworks,
    forceRefresh,
  } = useDlnBridge();

  const sameChainSwap = sourceChain === destinationChain;

  const getMaxAmount = () => {
    const amount = nativeBalance - MIN_SOL_BALANCE_REQUIRED;
    return amount > 0 ? amount : 0;
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
  };

  const onDstChainSelected = (e: any) => {
    consoleOut('Selected chain:', e, 'blue');
    setDestinationChain(e);
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

  const onToggleSendToDifferentAddress = (value: boolean) => {
    setSendToDifferentAddress(value);
    if (
      !dstChainTokenOutRecipient &&
      senderAddress &&
      sourceChain === destinationChain &&
      sourceChain === SOLANA_CHAIN_ID &&
      value
    ) {
      setDstChainTokenOutRecipient(senderAddress);
    }
  };

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

  const isTransferValid = useMemo(() => {
    if (sourceChain !== SOLANA_CHAIN_ID) {
      return false;
    } else if (!publicKey) {
      return false;
    } else if (destinationChain !== sourceChain && !dstChainTokenOutRecipient) {
      return false;
    } else if (sourceChain === destinationChain) {
      return true;
    } else {
      return true;
    }
  }, [destinationChain, dstChainTokenOutRecipient, publicKey, sourceChain]);

  const transactionStartButtonLabel = useMemo(() => {
    if (sourceChain !== SOLANA_CHAIN_ID) {
      return srcChainData ? `Cannot execute on ${srcChainData.chainName} yet` : 'Unsupported network';
    } else if (!publicKey) {
      return 'Connect wallet';
    } else if (sourceChain === destinationChain) {
      return 'Confirm transfer';
    } else if (destinationChain !== sourceChain && !dstChainTokenOutRecipient) {
      return `Missing recipient's ${dstChainName} address`;
    } else {
      return 'Create trade';
    }
  }, [destinationChain, dstChainName, dstChainTokenOutRecipient, publicKey, sourceChain, srcChainData]);

  const onTransactionFinished = () => {
    console.log('Transaction finished!');
  };

  const { onExecute } = useTransaction();

  const onStartSwapTx = async () => {
    if (sourceChain !== SOLANA_CHAIN_ID) return;

    if (!publicKey) return;

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

    const payload = () => {
      // Lets ensure we have the tx data
      if ((sameChainSwap && !singleChainSwapTxData.tx.data) || (!sameChainSwap && !dlnOrderTxData.tx.data)) return;
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
          data.txData.tx.data, // hex-encoded tx
        );
      },
    });
    onTransactionFinished();
  };

  // Establish sender address. So far only for Solana
  useEffect(() => {
    if (sourceChain !== SOLANA_CHAIN_ID) {
      setSenderAddress('');
      return;
    }

    if (publicKey) {
      setSenderAddress(publicKey.toBase58());
    }
  }, [sourceChain, publicKey, setSenderAddress]);

  // Keep account balance updated
  useEffect(() => {
    setNativeBalance(getAmountFromLamports(account?.lamports));
  }, [account?.lamports]);

  // Keep token balance updated
  useEffect(() => {
    if (sourceChain !== SOLANA_CHAIN_ID) {
      setSelectedTokenBalance(0);
      setSelectedTokenBalanceBn(new BN(0));

      return;
    }

    if (!publicKey || !srcChainTokenIn) {
      setSelectedTokenBalance(0);
      setSelectedTokenBalanceBn(new BN(0));

      return;
    }

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
  }, [connection, nativeBalance, publicKey, sourceChain, srcChainTokenIn]);

  // srcTokens are loaded by setting srcChainId.
  // dstTokens are loaded by setting dstChainId.

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

  // Force switch ON on different chains if OFF
  useEffect(() => {
    if (sourceChain === destinationChain && !sendToDifferentAddress) {
      setSendToDifferentAddress(false);
      setDstChainTokenOutRecipient(senderAddress);
    } else if (sourceChain !== destinationChain && !sendToDifferentAddress) {
      setSendToDifferentAddress(true);
    }
  }, [
    sourceChain,
    senderAddress,
    destinationChain,
    sendToDifferentAddress,
    setDstChainTokenOutRecipient,
    setSendToDifferentAddress,
  ]);

  // Process debounced input
  useEffect(() => {
    console.log('Reflecting debounced value:', debouncedAmountInput);
    setAmountIn(debouncedAmountInput);
  }, [debouncedAmountInput, setAmountIn]);

  return (
    <>
      <div className="debridge-wrapper">
        {/* Source chain, token & amount */}
        <div className="form-label">FROM</div>
        <div className="well mb-0">
          <div className="two-column-form-layout col40x60 mb-0">
            <div className="left">
              <div className="dropdown-trigger no-decoration flex-fixed-right align-items-center">
                <Select
                  className={`auto-height`}
                  value={sourceChain}
                  style={{ width: '100%', maxWidth: 'none' }}
                  popupClassName="chain-select-dropdown"
                  onChange={onSrcChainSelected}
                  bordered={false}
                  showArrow={true}
                  dropdownRender={menu => <div>{menu}</div>}
                >
                  {SUPPORTED_CHAINS.map(item => (
                    <Option key={`source-${item.chainId}`} value={item.chainId}>
                      <div className="transaction-list-row">
                        <div className="icon-cell">
                          {item.chainIcon ? (
                            <img alt={`${item.chainName}`} width={30} height={30} src={item.chainIcon} />
                          ) : (
                            <Identicon address={item.chainName} style={{ width: '30', display: 'inline-flex' }} />
                          )}
                        </div>
                        <div className="description-cell">{item.chainName}</div>
                      </div>
                    </Option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="well-divider">&nbsp;</div>
            <div className="right pl-3">
              <div className="flex-fixed-left">
                <div className="left">
                  <span className="add-on simplelink">
                    {srcChainTokenIn ? (
                      <TokenDisplay
                        onClick={() => showTokenSelector('source')}
                        mintAddress={srcChainTokenIn.address}
                        name={srcChainTokenIn.name}
                        showCaretDown={true}
                        fullTokenInfo={srcChainTokenIn}
                      />
                    ) : null}
                    {/* MAX CTA */}
                    {srcChainTokenIn ? (
                      <div
                        className="token-max simplelink"
                        onClick={() => {
                          if (srcChainTokenIn.address === NATIVE_SOL.address) {
                            const amount = getMaxAmount();
                            setAmountInput(cutNumber(amount > 0 ? amount : 0, srcChainTokenIn.decimals));
                          } else {
                            setAmountInput(toUiAmount(tokenBalanceBn, srcChainTokenIn.decimals));
                          }
                        }}
                      >
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
              {sourceChain === SOLANA_CHAIN_ID && nativeBalance < MIN_SOL_BALANCE_REQUIRED && (
                <div className="form-field-error">{t('transactions.validation.minimum-balance-required')}</div>
              )}
            </div>
          </div>
        </div>
        <div className="flip-button-container">
          {/* Flip button */}
          <div className="flip-button" onClick={flipNetworks}>
            <IconSwapFlip className="mean-svg-icons" />
          </div>
          {isFetchingQuote || (srcChainTokenIn && dstChainTokenOut && dstChainTokenOutAmount) ? (
            <span className="icon-button-container">
              {isFetchingQuote ? (
                <span className="icon-container">
                  <SyncOutlined spin />
                </span>
              ) : (
                <Tooltip placement="bottom" title="Refresh quote">
                  <Button type="default" shape="circle" size="small" icon={<ReloadOutlined />} onClick={forceRefresh} />
                </Tooltip>
              )}
            </span>
          ) : (
            <span>&nbsp;</span>
          )}
        </div>
        {/* Destination chain, token & amount */}
        <div className="form-label">TO</div>
        <div className="well mb-3">
          <div className="two-column-form-layout col40x60 mb-0">
            <div className="left">
              <div className="dropdown-trigger no-decoration flex-fixed-right align-items-center">
                <Select
                  className={`auto-height`}
                  value={destinationChain}
                  style={{ width: '100%', maxWidth: 'none' }}
                  popupClassName="chain-select-dropdown"
                  onChange={onDstChainSelected}
                  bordered={false}
                  showArrow={true}
                  dropdownRender={menu => <div>{menu}</div>}
                >
                  {SUPPORTED_CHAINS.map(item => (
                    <Option key={`source-${item.chainId}`} value={item.chainId}>
                      <div className="transaction-list-row">
                        <div className="icon-cell">
                          {item.chainIcon ? (
                            <img alt={`${item.chainName}`} width={30} height={30} src={item.chainIcon} />
                          ) : (
                            <Identicon address={item.chainName} style={{ width: '30', display: 'inline-flex' }} />
                          )}
                        </div>
                        <div className="description-cell">{item.chainName}</div>
                      </div>
                    </Option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="well-divider">&nbsp;</div>
            <div className="right pl-3">
              <div className="flex-fixed-left">
                <div className="left">
                  <span className="add-on simplelink">
                    {dstChainTokenOut ? (
                      <TokenDisplay
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
                  <div className="static-data-field text-right">{`${parseFloat(getOutputAmount())}`}</div>
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
                      ~{amountIn ? toUsCurrency(getDstTokenPrice()) : '$0.00'}
                    </span>
                  ) : (
                    <span>~$0.00</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* Recipient address switch */}
        <div
          className="flex-row align-items-center mb-2"
          onClick={() => onToggleSendToDifferentAddress(!sendToDifferentAddress)}
        >
          <Switch
            size="small"
            checked={sendToDifferentAddress}
            onChange={onToggleSendToDifferentAddress}
            disabled={sourceChain !== destinationChain}
          />
          <div className="form-label mb-0 ml-1 simplelink">Send to different wallet</div>
        </div>
        {/* Recipient address */}
        {sendToDifferentAddress ? (
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
                    placeholder={`Recipient's ${dstChainName} address`}
                    required={true}
                    spellCheck="false"
                    value={dstChainTokenOutRecipient}
                  />
                  <span
                    id="payment-recipient-static-field"
                    className={`${dstChainTokenOutRecipient ? 'overflow-ellipsis-middle' : 'placeholder-text'}`}
                  >
                    {dstChainTokenOutRecipient || `Recipient's ${dstChainName} address`}
                  </span>
                </span>
              </div>
              <div className="right">
                <span>&nbsp;</span>
              </div>
            </div>
            {!dstChainTokenOutRecipient ||
            (dstChainTokenOutRecipient &&
              destinationChain === SOLANA_CHAIN_ID &&
              !isValidAddress(dstChainTokenOutRecipient)) ? (
              <span className="form-field-error">Please enter a valid address</span>
            ) : null}
          </div>
        ) : null}
        {/* Action button */}
        <Button
          className={`main-cta ${isBusy ? 'inactive' : ''}`}
          block
          type="primary"
          shape="round"
          size="large"
          onClick={onStartSwapTx}
          disabled={isBusy || isFetchingQuote || !isTransferValid}
        >
          {isBusy && (
            <span className="mr-1">
              <LoadingOutlined style={{ fontSize: '16px' }} />
            </span>
          )}
          {isBusy ? 'Swapping' : transactionStartButtonLabel}
        </Button>
      </div>

      {isWhitelisted ? (
        <div className="well-group text-monospace small mt-4">
          <DebugInfo caption="Source chain ID:" value={`${sourceChain} (${srcChainData?.chainName ?? '?'})`} />
          <DebugInfo caption="Destination chain ID:" value={`${destinationChain} (${dstChainName})`} />
          <DebugInfo caption="Source chain tokens:" value={srcTokens ? Object.keys(srcTokens).length : '-'} />
          <DebugInfo caption="Destination chain tokens:" value={dstTokens ? Object.keys(dstTokens).length : '-'} />
          <DebugInfo caption="Amount in:" value={amountIn} />
          <DebugInfo caption="Token amount in:" value={srcChainTokenInAmount} />
          <DebugInfo
            caption="Selected In token:"
            value={
              srcChainTokenIn
                ? `${srcChainTokenIn.symbol} (${srcChainTokenIn.name}) | ${srcChainTokenIn.address}`
                : null
            }
          />
          <DebugInfo caption="Amount out:" value={`${parseFloat(getOutputAmount())}`} />
          <DebugInfo caption="Token amount out:" value={dstChainTokenOutAmount} />
          <DebugInfo
            caption="Selected Out token:"
            value={
              dstChainTokenOut
                ? `${dstChainTokenOut.symbol} (${dstChainTokenOut.name}) | ${dstChainTokenOut.address}`
                : null
            }
          />
          <DebugInfo caption="Sender address:" value={senderAddress} />
          <DebugInfo caption="Recipient address:" value={dstChainTokenOutRecipient} />
        </div>
      ) : null}

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
              isSolana={sourceChain === SOLANA_CHAIN_ID}
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
    </>
  );
};

export default DlnBridgeUi;
