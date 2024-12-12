import { LoadingOutlined } from '@ant-design/icons';
import type { StakingClient, UnstakeQuote } from '@mean-dao/staking';
import type { Transaction } from '@solana/web3.js';
import { Button, Col, Row } from 'antd';
import { useCallback, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { segmentAnalytics } from 'src/App';
import { INPUT_DEBOUNCE_TIME, STAKING_ROUTE_BASE_PATH } from 'src/app-constants/common';
import { openNotification } from 'src/components/Notifications';
import { TokenDisplay } from 'src/components/TokenDisplay';
import { useAccountsContext } from 'src/contexts/accounts';
import { AppStateContext } from 'src/contexts/appstate';
import { useConnection } from 'src/contexts/connection';
import { TxConfirmationContext, type TxConfirmationInfo, confirmationEvents } from 'src/contexts/transaction-status';
import { useWallet } from 'src/contexts/wallet';
import { customLogger } from 'src/main';
import { AppUsageEvent, type SegmentUnstakeMeanData } from 'src/middleware/segment-service';
import { composeTxWithPrioritizationFees, sendTx, signTx } from 'src/middleware/transactions';
import { consoleOut, getTransactionStatusForLogs } from 'src/middleware/ui';
import { cutNumber, formatThousands, getAmountWithSymbol, getTxIxResume, isValidNumber } from 'src/middleware/utils';
import type { TokenInfo } from 'src/models/SolanaTokenInfo';
import { EventType, OperationType, TransactionStatus } from 'src/models/enums';
import type { LooseObject } from 'src/types/LooseObject';

let inputDebounceTimeout: NodeJS.Timeout;

export const UnstakeTabView = (props: {
  stakeClient: StakingClient;
  tokenBalance: number;
  selectedToken: TokenInfo | undefined;
  unstakedToken: TokenInfo | undefined;
}) => {
  const { stakeClient, tokenBalance, selectedToken, unstakedToken } = props;

  const { priceList, loadingPrices, transactionStatus, getTokenPriceByAddress, setTransactionStatus, refreshPrices } =
    useContext(AppStateContext);
  const { enqueueTransactionConfirmation } = useContext(TxConfirmationContext);
  const { t } = useTranslation('common');
  const connection = useConnection();
  const { connected, wallet, publicKey } = useWallet();
  const { refreshAccount } = useAccountsContext();
  const percentages = ['25', '50', '75', '100'];
  const [fromCoinAmount, setFromCoinAmount] = useState<string>('');
  const [percentageValue, setPercentageValue] = useState<string>('');
  const [meanWorthOfsMean, setMeanWorthOfsMean] = useState<number>(0);
  const [unstakeMeanValue, setUnstakeMeanValue] = useState<number>(0);
  const [canFetchUnstakeQuote, setCanFetchUnstakeQuote] = useState(false);
  const [sMeanToMeanRate, setSMeanToMeanRate] = useState(0);
  const [meanPrice, setMeanPrice] = useState<number>(0);
  const [isBusy, setIsBusy] = useState(false);
  const [canSubscribe, setCanSubscribe] = useState(true);

  //////////////////////////
  //  CALLBACKS & EVENTS  //
  //////////////////////////

  const resetTransactionStatus = useCallback(() => {
    setTransactionStatus({
      lastOperation: TransactionStatus.Idle,
      currentOperation: TransactionStatus.Idle,
    });
  }, [setTransactionStatus]);

  const setFailureStatusAndNotify = useCallback(
    (txStep: 'sign' | 'send') => {
      const operation =
        txStep === 'sign' ? TransactionStatus.SignTransactionFailure : TransactionStatus.SendTransactionFailure;
      setTransactionStatus({
        lastOperation: transactionStatus.currentOperation,
        currentOperation: operation,
      });
      openNotification({
        title: t('notifications.error-title'),
        description: t('notifications.error-sending-transaction'),
        type: 'error',
      });
      setIsBusy(false);
    },
    [setTransactionStatus, t, transactionStatus.currentOperation],
  );

  const setSuccessStatus = useCallback(() => {
    setIsBusy(false);
    resetTransactionStatus();
  }, [resetTransactionStatus]);

  const onChangeValue = (value: string) => {
    setPercentageValue(value);
    setCanFetchUnstakeQuote(true);
  };

  const handleFromCoinAmountChange = (e: string) => {
    let newValue = e;

    const decimals = selectedToken ? selectedToken.decimals : 0;
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
      setFromCoinAmount('');
    } else if (newValue === '.') {
      setFromCoinAmount('.');
    } else if (isValidNumber(newValue)) {
      setFromCoinAmount(newValue);
      // Debouncing
      clearTimeout(inputDebounceTimeout);
      inputDebounceTimeout = setTimeout(() => {
        consoleOut('input ====>', newValue, 'orange');
        setCanFetchUnstakeQuote(true);
      }, INPUT_DEBOUNCE_TIME);
    }
  };

  const getUnstakeButtonLabel = useCallback(() => {
    return !connected
      ? t('transactions.validation.not-connected')
      : isBusy
        ? `${t('staking.panel-right.tabset.unstake.unstake-button-busy')} ${selectedToken?.symbol}`
        : !selectedToken || !tokenBalance
          ? `${t('staking.panel-right.tabset.unstake.unstake-button-unavailable')} ${selectedToken?.symbol}`
          : !fromCoinAmount || !isValidNumber(fromCoinAmount) || !Number.parseFloat(fromCoinAmount)
            ? t('transactions.validation.no-amount')
            : Number.parseFloat(fromCoinAmount) > tokenBalance
              ? t('transactions.validation.amount-high')
              : `${t('staking.panel-right.tabset.unstake.unstake-button-available')} ${selectedToken?.symbol}`;
  }, [fromCoinAmount, selectedToken, tokenBalance, connected, isBusy, t]);

  const isUnstakingFormValid = (): boolean => {
    return !!(
      fromCoinAmount &&
      Number.parseFloat(fromCoinAmount) > 0 &&
      Number.parseFloat(fromCoinAmount) <= tokenBalance
    );
  };

  // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
  const pasteHandler = useCallback((e: any) => {
    const getClipBoardData = e.clipboardData.getData('Text');
    const replaceCommaToDot = getClipBoardData.replace(',', '');
    const onlyNumbersAndDot = replaceCommaToDot.replace(/[^.\d]/g, '');

    setFromCoinAmount(onlyNumbersAndDot.trim());
    setCanFetchUnstakeQuote(true);
  }, []);

  const onStartTransaction = useCallback(async () => {
    let transaction: Transaction | null = null;
    let signature: string;
    let encodedTx: string;
    let transactionLog: LooseObject[] = [];

    resetTransactionStatus();

    const unstakeAmountTx = async ({ stakeClient, uiAmount }: { stakeClient: StakingClient; uiAmount: number }) => {
      if (!publicKey) throw new Error('Wallet publicKey not found');

      const transaction = await stakeClient.unstakeTransaction(
        uiAmount, // uiAmount
      );

      return await composeTxWithPrioritizationFees(connection, publicKey, transaction.instructions);
    };

    const createTx = async (): Promise<boolean> => {
      if (wallet && stakeClient && selectedToken) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction,
        });

        const uiAmount = Number.parseFloat(fromCoinAmount);
        consoleOut('uiAmount:', uiAmount, 'blue');

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
          inputs: `uiAmount: ${uiAmount}`,
        });

        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
          result: '',
        });

        // Report event to Segment analytics
        const segmentData: SegmentUnstakeMeanData = {
          asset: selectedToken.symbol,
          assetPrice: sMeanToMeanRate,
          unstakedAsset: 'MEAN',
          unstakedAssetPrice: meanPrice,
          amount: uiAmount,
          quote: unstakeMeanValue || 0,
          valueInUsd: sMeanToMeanRate * (unstakeMeanValue || 0),
        };
        consoleOut('segment data:', segmentData, 'blue');
        segmentAnalytics.recordEvent(AppUsageEvent.UnstakeMeanFormButton, segmentData);

        return await unstakeAmountTx({ stakeClient, uiAmount })
          .then(value => {
            consoleOut('unstakeTransaction returned transaction:', value);
            // Stage 1 completed - The transaction is created and returned
            setTransactionStatus({
              lastOperation: TransactionStatus.InitTransactionSuccess,
              currentOperation: TransactionStatus.SignTransaction,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
              result: getTxIxResume(value),
            });
            transaction = value;
            return true;
          })
          .catch(error => {
            console.error('unstakeTransaction init error:', error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: `${error}`,
            });
            customLogger.logError('Unstake transaction failed', {
              transcript: transactionLog,
            });
            segmentAnalytics.recordEvent(AppUsageEvent.UnstakeMeanFailed, {
              transcript: transactionLog,
            });
            return false;
          });
      }

      transactionLog.push({
        action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
        result: 'Cannot start transaction! Wallet not found!',
      });
      customLogger.logError('Unstake transaction failed', {
        transcript: transactionLog,
      });
      segmentAnalytics.recordEvent(AppUsageEvent.UnstakeMeanFailed, {
        transcript: transactionLog,
      });
      return false;
    };

    if (wallet && publicKey && selectedToken) {
      setIsBusy(true);
      const created = await createTx();
      consoleOut('created:', created);
      if (created) {
        const sign = await signTx('Unstake MEAN', wallet.adapter, publicKey, transaction);
        if (sign.encodedTransaction) {
          encodedTx = sign.encodedTransaction;
          transactionLog = transactionLog.concat(sign.log);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.SignTransactionSuccess,
          });
          const sent = await sendTx('Unstake MEAN', connection, encodedTx);
          consoleOut('sent:', sent);
          if (sent.signature) {
            signature = sent.signature;
            consoleOut('Send Tx to confirmation queue:', signature);
            enqueueTransactionConfirmation({
              signature,
              operationType: OperationType.Unstake,
              finality: 'confirmed',
              txInfoFetchStatus: 'fetching',
              loadingTitle: 'Confirming transaction',
              loadingMessage: `Unstaking ${formatThousands(
                Number.parseFloat(fromCoinAmount),
                selectedToken.decimals,
              )} ${selectedToken.symbol}`,
              completedTitle: 'Transaction confirmed',
              completedMessage: `Successfully unstaked ${formatThousands(
                Number.parseFloat(fromCoinAmount),
                selectedToken.decimals,
              )} ${selectedToken.symbol}`,
            });
            setFromCoinAmount('');
            setSuccessStatus();
          } else {
            setFailureStatusAndNotify('send');
          }
        } else {
          setFailureStatusAndNotify('sign');
        }
      } else {
        setIsBusy(false);
      }
    }
  }, [
    wallet,
    meanPrice,
    publicKey,
    connection,
    stakeClient,
    selectedToken,
    fromCoinAmount,
    sMeanToMeanRate,
    unstakeMeanValue,
    transactionStatus.currentOperation,
    enqueueTransactionConfirmation,
    setFailureStatusAndNotify,
    resetTransactionStatus,
    setTransactionStatus,
    setSuccessStatus,
  ]);

  const recordTxConfirmation = useCallback((signature: string, operation: OperationType, success = true) => {
    if (operation === OperationType.Unstake) {
      segmentAnalytics.recordEvent(success ? AppUsageEvent.UnstakeMeanCompleted : AppUsageEvent.UnstakeMeanFailed, {
        signature: signature,
      });
    }
  }, []);

  const reloadStakePools = useCallback(() => {
    const stakePoolsRefreshCta = document.getElementById('refresh-stake-pool-info');
    if (stakePoolsRefreshCta) {
      stakePoolsRefreshCta.click();
    } else {
      console.log('element not found:', '#refresh-stake-pool-info', 'red');
    }
  }, []);

  // Setup event handler for Tx confirmed
  const onTxConfirmed = useCallback(
    // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
    (param: any) => {
      const item = param as TxConfirmationInfo;
      const path = window.location.pathname;
      if (!path.startsWith(STAKING_ROUTE_BASE_PATH)) {
        return;
      }

      if (item.operationType === OperationType.Unstake) {
        consoleOut(
          `UnstakeTabView -> onTxConfirmed event handled for operation ${OperationType[item.operationType]}`,
          item,
          'crimson',
        );
        recordTxConfirmation(item.signature, item.operationType, true);
        setIsBusy(false);
        refreshAccount();
        reloadStakePools();
      }
    },
    [refreshAccount, recordTxConfirmation, reloadStakePools],
  );

  // Setup event handler for Tx confirmation error
  const onTxTimedout = useCallback(
    // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
    (param: any) => {
      const item = param as TxConfirmationInfo;
      if (item.operationType === OperationType.Unstake) {
        consoleOut('onTxTimedout event executed:', item, 'crimson');
        recordTxConfirmation(item.signature, item.operationType, false);
        setIsBusy(false);
        refreshAccount();
        openNotification({
          title: 'Unstake MEAN status',
          description:
            'The transaction to unstake MEAN was not confirmed within 40 seconds. Solana may be congested right now. This page needs to be reloaded to verify the contract was successfully created.',
          duration: null,
          type: 'info',
          handleClose: () => reloadStakePools(),
        });
      }
    },
    [refreshAccount, recordTxConfirmation, reloadStakePools],
  );

  const getMeanQuote = useCallback(
    async (sMEAN: number) => {
      if (!stakeClient) {
        return 0;
      }

      try {
        const result = await stakeClient.getUnstakeQuote(sMEAN);
        return result.meanOutUiAmount;
      } catch (error) {
        console.error(error);
        return 0;
      }
    },
    [stakeClient],
  );

  /////////////////////
  // Data management //
  /////////////////////

  // Keep MEAN price updated
  useEffect(() => {
    if (priceList && unstakedToken) {
      const price = getTokenPriceByAddress(unstakedToken.address, unstakedToken.symbol);
      consoleOut('meanPrice:', price, 'crimson');
      setMeanPrice(price);
    }
  }, [getTokenPriceByAddress, priceList, unstakedToken]);

  // Unstake quote - For full unstaked balance
  // biome-ignore lint/correctness/useExhaustiveDependencies: Deps managed manually
  useEffect(() => {
    if (selectedToken && selectedToken.symbol === 'sMEAN') {
      if (tokenBalance > 0) {
        getMeanQuote(tokenBalance).then(value => {
          consoleOut(
            `Quote for ${formatThousands(tokenBalance, selectedToken?.decimals)} sMEAN`,
            `${formatThousands(value, selectedToken?.decimals)} MEAN`,
            'blue',
          );
          setMeanWorthOfsMean(value);
        });
      } else {
        setMeanWorthOfsMean(0);
      }
    }
  }, [stakeClient, selectedToken, tokenBalance, fromCoinAmount, getMeanQuote]);

  // Stake quote - For input amount
  useEffect(() => {
    if (!stakeClient) {
      return;
    }

    if (Number.parseFloat(fromCoinAmount) > 0 && canFetchUnstakeQuote) {
      setCanFetchUnstakeQuote(false);

      stakeClient
        .getUnstakeQuote(Number.parseFloat(fromCoinAmount))
        .then((value: UnstakeQuote) => {
          consoleOut('unStakeQuote:', value, 'blue');
          setUnstakeMeanValue(value.meanOutUiAmount);
          consoleOut(
            `Quote for ${formatThousands(Number.parseFloat(fromCoinAmount), selectedToken?.decimals)} sMEAN`,
            `${formatThousands(value.meanOutUiAmount, selectedToken?.decimals)} MEAN`,
            'blue',
          );
          setSMeanToMeanRate(value.sMeanToMeanRateUiAmount);
        })
        .catch(error => {
          console.error(error);
        });
    }
  }, [fromCoinAmount, stakeClient, canFetchUnstakeQuote, selectedToken]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Deps managed manually
  useEffect(() => {
    const percentageFromCoinAmount =
      tokenBalance > 0
        ? `${((tokenBalance * Number.parseFloat(percentageValue)) / 100).toFixed(selectedToken?.decimals ?? 9)}`
        : '';

    if (percentageValue) {
      setFromCoinAmount(percentageFromCoinAmount);
      setPercentageValue('');
    }
  }, [percentageValue]);

  /**
   * The UnstakeQuote method returns sMeanToMeanRateUiAmount which is (MEAN/sMEAN rate)
   * So we calculate the USD Amount relative to the input sMEAN: sMEAN x sMeanToMeanRateUiAmount x MEAN_current_price
   */
  const getUsdAmountForSmeanInput = useCallback(() => {
    if (fromCoinAmount && Number.parseFloat(fromCoinAmount) > 0 && sMeanToMeanRate && meanPrice) {
      return Number.parseFloat(fromCoinAmount) * sMeanToMeanRate * meanPrice;
    }
    return 0;
  }, [fromCoinAmount, meanPrice, sMeanToMeanRate]);

  // Setup event listeners
  useEffect(() => {
    if (!canSubscribe) {
      return;
    }
    setCanSubscribe(false);
    consoleOut('Setup event subscriptions -> UnstakeTabView', '', 'brown');
    confirmationEvents.on(EventType.TxConfirmSuccess, onTxConfirmed);
    consoleOut('Subscribed to event txConfirmed with:', 'onTxConfirmed', 'brown');
    confirmationEvents.on(EventType.TxConfirmTimeout, onTxTimedout);
    consoleOut('Subscribed to event txTimedout with:', 'onTxTimedout', 'brown');
  }, [canSubscribe, onTxConfirmed, onTxTimedout]);

  // Unsubscribe from events
  // biome-ignore lint/correctness/useExhaustiveDependencies: Deps managed manually
  useEffect(() => {
    return () => {
      consoleOut('Stop event subscriptions -> UnstakeTabView', '', 'brown');
      confirmationEvents.off(EventType.TxConfirmSuccess, onTxConfirmed);
      consoleOut('Unsubscribed from event txConfirmed!', '', 'brown');
      confirmationEvents.off(EventType.TxConfirmTimeout, onTxTimedout);
      consoleOut('Unsubscribed from event onTxTimedout!', '', 'brown');
      setCanSubscribe(true);
    };
  }, []);

  ///////////////
  // Rendering //
  ///////////////

  const infoRow = (caption: string, value: string) => {
    return (
      <Row>
        <Col span={12} className='font-size-75 fg-secondary-60 text-right pr-1'>
          {caption}
        </Col>
        <Col span={12} className='font-size-75 fg-secondary-60 text-left'>
          {value}
        </Col>
      </Row>
    );
  };

  return (
    <>
      <div className='mb-2 px-1'>
        <span className='info-label'>
          {tokenBalance ? (
            <span>
              You have {formatThousands(tokenBalance, 6)} sMEAN staked
              {meanWorthOfsMean ? ` which is currently worth ${formatThousands(meanWorthOfsMean, 6)} MEAN.` : '.'}&nbsp;
              {t('staking.panel-right.tabset.unstake.notification-label-two')}
            </span>
          ) : (
            t('staking.panel-right.tabset.unstake.notification-label-one-error')
          )}
        </span>
      </div>
      <div className='form-label mt-2'>{t('staking.panel-right.tabset.unstake.amount-label')}</div>
      <div className={`well${isBusy ? ' disabled' : ''}`}>
        <div className='flexible-right mb-1'>
          <div className='token-group'>
            {percentages.map(percentage => (
              <div key={percentage} className='mb-1 d-flex flex-column align-items-center'>
                <div
                  className={`token-max simplelink ${tokenBalance !== 0 ? 'active' : 'disabled'}`}
                  onKeyDown={() => onChangeValue(percentage)}
                  onClick={() => onChangeValue(percentage)}
                >
                  {percentage}%
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className='flex-fixed-left'>
          <div className='left'>
            <span className='add-on'>
              {selectedToken && (
                <TokenDisplay
                  onClick={() => {}}
                  mintAddress={selectedToken.address}
                  name={selectedToken.name}
                  className='click-disabled'
                />
              )}
            </span>
          </div>
          <div className='right'>
            <input
              className='general-text-input text-right'
              inputMode='decimal'
              autoComplete='off'
              autoCorrect='off'
              type='text'
              onChange={e => handleFromCoinAmountChange(e.target.value)}
              pattern='^[0-9]*[.,]?[0-9]*$'
              placeholder='0.0'
              minLength={1}
              maxLength={79}
              spellCheck='false'
              onPaste={pasteHandler}
              value={fromCoinAmount}
            />
          </div>
        </div>
        <div className='flex-fixed-right'>
          <div className='left inner-label'>
            <span>{t('staking.panel-right.tabset.unstake.send-amount.label-right')}:</span>
            <span>
              {`${
                tokenBalance && selectedToken ? getAmountWithSymbol(tokenBalance, selectedToken?.address, true) : '0'
              }`}
            </span>
          </div>
          <div className='right inner-label'>
            <span
              className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'}
              onKeyDown={() => refreshPrices()}
              onClick={() => refreshPrices()}
            >
              ~$
              {fromCoinAmount ? formatThousands(getUsdAmountForSmeanInput(), 2, 2) : '0.00'}
            </span>
          </div>
        </div>
      </div>

      <div className='p-2'>
        {fromCoinAmount &&
          Number.parseFloat(fromCoinAmount) > 0 &&
          Number.parseFloat(fromCoinAmount) <= tokenBalance &&
          unstakeMeanValue > 0 &&
          infoRow(
            `${formatThousands(Number.parseFloat(fromCoinAmount), 6)} sMEAN ≈`,
            `${formatThousands(unstakeMeanValue, 6)} MEAN`,
          )}
        {sMeanToMeanRate > 0 && infoRow('1 sMEAN ≈', `${cutNumber(sMeanToMeanRate, 6)} MEAN`)}
      </div>

      {/* Action button */}
      <Button
        className='main-cta mt-2'
        block
        type='primary'
        shape='round'
        size='large'
        onClick={onStartTransaction}
        disabled={isBusy || !isUnstakingFormValid()}
      >
        {isBusy && (
          <span className='mr-1'>
            <LoadingOutlined style={{ fontSize: '16px' }} />
          </span>
        )}
        {getUnstakeButtonLabel()}
      </Button>
    </>
  );
};
