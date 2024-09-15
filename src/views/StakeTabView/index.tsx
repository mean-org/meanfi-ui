import { LoadingOutlined } from '@ant-design/icons';
import type { StakeQuote, StakingClient } from '@mean-dao/staking';
import type { Transaction } from '@solana/web3.js';
import { segmentAnalytics } from 'App';
import { Button, Col, Row } from 'antd';
import { INPUT_DEBOUNCE_TIME, STAKING_ROUTE_BASE_PATH } from 'app-constants/common';
import { openNotification } from 'components/Notifications';
import { TokenDisplay } from 'components/TokenDisplay';
import { useAccountsContext } from 'contexts/accounts';
import { AppStateContext } from 'contexts/appstate';
import { useConnection } from 'contexts/connection';
import { TxConfirmationContext, type TxConfirmationInfo, confirmationEvents } from 'contexts/transaction-status';
import { useWallet } from 'contexts/wallet';
import { customLogger } from 'main';
import { AppUsageEvent, type SegmentStakeMeanData } from 'middleware/segment-service';
import { composeTxWithPrioritizationFees, sendTx, signTx } from 'middleware/transactions';
import { consoleOut, getTransactionStatusForLogs } from 'middleware/ui';
import {
  cutNumber,
  formatAmount,
  formatThousands,
  getAmountWithSymbol,
  getTxIxResume,
  isValidNumber,
} from 'middleware/utils';
import type { TokenInfo } from 'models/SolanaTokenInfo';
import { EventType, OperationType, TransactionStatus } from 'models/enums';
import { useCallback, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LooseObject } from 'types/LooseObject';
import useRealmsDeposit from './useRealmsDeposit';
import useUnstakeQuote from './useUnstakeQuote';

let inputDebounceTimeout: NodeJS.Timeout;

export const StakeTabView = (props: {
  meanBalance: number;
  onTxFinished: () => void;
  selectedToken: TokenInfo | undefined;
  smeanBalance: number;
  smeanDecimals: number;
  stakeClient: StakingClient;
}) => {
  const { meanBalance, onTxFinished, selectedToken, smeanBalance, smeanDecimals, stakeClient } = props;
  const { loadingPrices, transactionStatus, getTokenPriceByAddress, setTransactionStatus, refreshPrices } =
    useContext(AppStateContext);
  const { enqueueTransactionConfirmation } = useContext(TxConfirmationContext);
  const { refreshAccount } = useAccountsContext();
  const connection = useConnection();
  const [isBusy, setIsBusy] = useState(false);
  const { connected, wallet, publicKey } = useWallet();
  const { t } = useTranslation('common');
  const [fromCoinAmount, setFromCoinAmount] = useState<string>('');
  const [stakeQuote, setStakeQuote] = useState<number>(0);
  const [stakedMeanPrice, setStakedMeanPrice] = useState<number>(0);
  const [canFetchStakeQuote, setCanFetchStakeQuote] = useState(false);
  const [fetchingStakeQuote, setFetchingStakeQuote] = useState(false);
  const [canSubscribe, setCanSubscribe] = useState(true);
  const meanWorthOfsMean = useUnstakeQuote({
    stakeClient,
    selectedToken,
    smeanBalance,
  });
  const { depositAmount: realmsDepositAmount } = useRealmsDeposit({
    decimals: smeanDecimals,
  });

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

  const fetchQuoteFromInput = (value: string) => {
    clearTimeout(inputDebounceTimeout);
    inputDebounceTimeout = setTimeout(() => {
      consoleOut('input ====>', value, 'orange');
      setCanFetchStakeQuote(true);
    }, INPUT_DEBOUNCE_TIME);
  };

  // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
  const handleFromCoinAmountChange = (e: any) => {
    let newValue = e.target.value;

    const decimals = selectedToken ? selectedToken.decimals : 0;
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
      setFromCoinAmount('');
    } else if (newValue === '.') {
      setFromCoinAmount('.');
    } else if (isValidNumber(newValue)) {
      setFromCoinAmount(newValue);
      setFetchingStakeQuote(true);
      // Debouncing
      fetchQuoteFromInput(newValue);
    }
  };

  const getStakeButtonLabel = useCallback(() => {
    return !connected
      ? t('transactions.validation.not-connected')
      : isBusy
        ? `${t('staking.panel-right.tabset.stake.stake-button-busy')} ${selectedToken?.symbol}`
        : !selectedToken || !meanBalance
          ? t('transactions.validation.no-balance')
          : !fromCoinAmount || !isValidNumber(fromCoinAmount) || !Number.parseFloat(fromCoinAmount)
            ? t('transactions.validation.no-amount')
            : Number.parseFloat(fromCoinAmount) > meanBalance
              ? t('transactions.validation.amount-high')
              : `${t('staking.panel-right.tabset.stake.stake-button')} ${selectedToken?.symbol}`;
  }, [fromCoinAmount, selectedToken, meanBalance, connected, isBusy, t]);

  const isStakingFormValid = (): boolean => {
    return !!(
      connected &&
      selectedToken &&
      meanBalance &&
      fromCoinAmount &&
      Number.parseFloat(fromCoinAmount) > 0 &&
      Number.parseFloat(fromCoinAmount) <= meanBalance
    );
  };

  // Handler paste clipboard data
  // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
  const pasteHandler = (e: any) => {
    const getClipBoardData = e.clipboardData.getData('Text');
    const replaceCommaToDot = getClipBoardData.replace(',', '');
    const onlyNumbersAndDot = replaceCommaToDot.replace(/[^.\d]/g, '');

    setFromCoinAmount(onlyNumbersAndDot.trim());
    setFetchingStakeQuote(true);
  };

  const getMaxDecimalsForValue = (value: number) => {
    if (value < 5) {
      return 6;
    }
    if (value >= 5 && value < 100) {
      return 4;
    }

    return 2;
  };

  const onStartTransaction = useCallback(async () => {
    let transaction: Transaction | null = null;
    let signature: string;
    let encodedTx: string;
    let transactionLog: LooseObject[] = [];

    resetTransactionStatus();

    const stakeAmountTx = async ({ stakeClient, uiAmount }: { stakeClient: StakingClient; uiAmount: number }) => {
      if (!publicKey) throw new Error('Wallet publicKey not found');

      const transaction = await stakeClient.stakeTransaction(
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

        const price = getTokenPriceByAddress(selectedToken.address, selectedToken.symbol);

        // Report event to Segment analytics
        const segmentData: SegmentStakeMeanData = {
          asset: selectedToken.symbol,
          assetPrice: price,
          stakedAsset: 'sMEAN',
          stakedAssetPrice: stakedMeanPrice,
          amount: uiAmount,
          quote: stakeQuote,
          valueInUsd: price * uiAmount,
        };
        consoleOut('segment data:', segmentData, 'blue');
        segmentAnalytics.recordEvent(AppUsageEvent.StakeMeanFormButton, segmentData);

        return await stakeAmountTx({ stakeClient, uiAmount })
          .then(value => {
            consoleOut('stakeTransaction returned transaction:', value);
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
            console.error('stakeTransaction init error:', error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: `${error}`,
            });
            customLogger.logError('Stake transaction failed', {
              transcript: transactionLog,
            });
            segmentAnalytics.recordEvent(AppUsageEvent.StakeMeanFailed, {
              transcript: transactionLog,
            });
            return false;
          });
      }

      transactionLog.push({
        action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
        result: 'Cannot start transaction! Wallet not found!',
      });
      customLogger.logError('Stake transaction failed', {
        transcript: transactionLog,
      });
      segmentAnalytics.recordEvent(AppUsageEvent.StakeMeanFailed, {
        transcript: transactionLog,
      });
      return false;
    };

    if (wallet && publicKey && selectedToken) {
      setIsBusy(true);
      const created = await createTx();
      consoleOut('created:', created);
      if (created) {
        const sign = await signTx('Stake MEAN', wallet.adapter, publicKey, transaction);
        if (sign.encodedTransaction) {
          encodedTx = sign.encodedTransaction;
          transactionLog = transactionLog.concat(sign.log);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.SignTransactionSuccess,
          });
          const sent = await sendTx('Stake MEAN', connection, encodedTx);
          consoleOut('sent:', sent);
          if (sent.signature) {
            signature = sent.signature;
            consoleOut('Send Tx to confirmation queue:', signature);
            enqueueTransactionConfirmation({
              signature,
              operationType: OperationType.Stake,
              finality: 'confirmed',
              txInfoFetchStatus: 'fetching',
              loadingTitle: 'Confirming transaction',
              loadingMessage: `Staking ${formatThousands(Number.parseFloat(fromCoinAmount), selectedToken.decimals)} ${
                selectedToken.symbol
              }`,
              completedTitle: 'Transaction confirmed',
              completedMessage: `Successfully staked ${formatThousands(
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
    publicKey,
    connection,
    stakeQuote,
    stakeClient,
    selectedToken,
    fromCoinAmount,
    stakedMeanPrice,
    transactionStatus.currentOperation,
    enqueueTransactionConfirmation,
    setFailureStatusAndNotify,
    getTokenPriceByAddress,
    resetTransactionStatus,
    setTransactionStatus,
    setSuccessStatus,
  ]);

  const recordTxConfirmation = useCallback((signature: string, operation: OperationType, success = true) => {
    if (operation === OperationType.Stake) {
      segmentAnalytics.recordEvent(success ? AppUsageEvent.StakeMeanCompleted : AppUsageEvent.StakeMeanFailed, {
        signature: signature,
      });
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

      const reloadStakePools = () => {
        const stakePoolsRefreshCta = document.getElementById('refresh-stake-pool-info');
        if (stakePoolsRefreshCta) {
          stakePoolsRefreshCta.click();
        } else {
          console.log('element not found:', '#refresh-stake-pool-info', 'red');
        }
      };

      if (item.operationType === OperationType.Stake) {
        consoleOut(
          `StakeTabView -> onTxConfirmed event handled for operation ${OperationType[item.operationType]}`,
          item,
          'crimson',
        );
        recordTxConfirmation(item.signature, item.operationType, true);
        setIsBusy(false);
        onTxFinished();
        refreshAccount();
        reloadStakePools();
      }
    },
    [onTxFinished, refreshAccount, recordTxConfirmation],
  );

  // Setup event handler for Tx confirmation error
  const onTxTimedout = useCallback(
    // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
    (param: any) => {
      const item = param as TxConfirmationInfo;
      const reloadStakePools = () => {
        const stakePoolsRefreshCta = document.getElementById('refresh-stake-pool-info');
        if (stakePoolsRefreshCta) {
          stakePoolsRefreshCta.click();
        } else {
          console.log('element not found:', '#refresh-stake-pool-info', 'red');
        }
      };

      if (item.operationType === OperationType.Stake) {
        consoleOut('onTxTimedout event executed:', item, 'crimson');
        recordTxConfirmation(item.signature, item.operationType, false);
        setIsBusy(false);
        refreshAccount();
        openNotification({
          title: 'Stake MEAN status',
          description:
            'The transaction to stake MEAN was not confirmed within 40 seconds. Solana may be congested right now. This page needs to be reloaded to verify the contract was successfully created.',
          duration: null,
          type: 'info',
          handleClose: () => reloadStakePools(),
        });
        onTxFinished();
      }
    },
    [onTxFinished, refreshAccount, recordTxConfirmation],
  );

  /////////////////////
  // Data management //
  /////////////////////

  // Stake quote for 1 MEAN
  // biome-ignore lint/correctness/useExhaustiveDependencies: Deps managed manually
  useEffect(() => {
    if (!stakeClient) {
      return;
    }

    stakeClient
      .getStakeQuote(1)
      .then((value: StakeQuote) => {
        consoleOut('stakeQuote:', value, 'blue');
        setStakedMeanPrice(value.sMeanOutUiAmount);
        consoleOut('Quote for 1 MEAN:', `${formatThousands(value.sMeanOutUiAmount, 6)} sMEAN`, 'blue');
      })
      .catch(error => {
        console.error(error);
      });
  }, [fromCoinAmount, stakeClient, canFetchStakeQuote]);

  // Stake quote for input amount
  useEffect(() => {
    if (!stakeClient) {
      return;
    }

    if (Number.parseFloat(fromCoinAmount) > 0 && canFetchStakeQuote) {
      setFetchingStakeQuote(true);
      setCanFetchStakeQuote(false);
      stakeClient
        .getStakeQuote(Number.parseFloat(fromCoinAmount))
        .then((value: StakeQuote) => {
          consoleOut('stakeQuote:', value, 'blue');
          setStakeQuote(value.sMeanOutUiAmount);
          consoleOut(
            `Quote for ${formatThousands(Number.parseFloat(fromCoinAmount), 6)} MEAN`,
            `${formatThousands(value.sMeanOutUiAmount, 6)} sMEAN`,
            'blue',
          );
        })
        .catch(error => {
          console.error(error);
        })
        .finally(() => setFetchingStakeQuote(false));
    }
  }, [fromCoinAmount, stakeClient, canFetchStakeQuote]);

  // Setup event listeners
  useEffect(() => {
    if (canSubscribe) {
      setCanSubscribe(false);
      consoleOut('Setup event subscriptions -> StakeTabView', '', 'brown');
      confirmationEvents.on(EventType.TxConfirmSuccess, onTxConfirmed);
      consoleOut('Subscribed to event txConfirmed with:', 'onTxConfirmed', 'brown');
      confirmationEvents.on(EventType.TxConfirmTimeout, onTxTimedout);
      consoleOut('Subscribed to event txTimedout with:', 'onTxTimedout', 'brown');
    }
  }, [canSubscribe, onTxConfirmed, onTxTimedout]);

  // Unsubscribe from events
  // biome-ignore lint/correctness/useExhaustiveDependencies: Deps managed manually
  useEffect(() => {
    return () => {
      consoleOut('Stop event subscriptions -> StakeTabView', '', 'brown');
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
          {smeanBalance ? (
            <span>
              You have {formatThousands(smeanBalance, 6)} sMEAN staked
              {meanWorthOfsMean ? ` which is currently worth ${formatThousands(meanWorthOfsMean, 6)} MEAN.` : '.'}
            </span>
          ) : (
            t('staking.panel-right.tabset.unstake.notification-label-one-error')
          )}
        </span>
        <span className='info-label d-block'>
          {realmsDepositAmount && (
            <>
              At this time, {formatThousands(realmsDepositAmount)} of your sMEAN are committed to{' '}
              <a href='https://app.realms.today/dao/MEAN' target='_blank' rel='noopener noreferrer'>
                Realms
              </a>{' '}
              for voting purposes. You can find them there and withdraw them at any point.
            </>
          )}
        </span>
      </div>
      <div className='form-label'>{t('staking.panel-right.tabset.stake.amount-label')}</div>
      <div className={`well mb-1${isBusy ? ' disabled' : ''}`}>
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
              {selectedToken && meanBalance ? (
                <div
                  className='token-max simplelink'
                  onKeyDown={() => {}}
                  onClick={() => {
                    const newAmount = meanBalance.toFixed(selectedToken?.decimals || 9);
                    setFromCoinAmount(newAmount);
                    // Debouncing
                    fetchQuoteFromInput(newAmount);
                  }}
                >
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
              onChange={handleFromCoinAmountChange}
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
            <span>{t('transactions.send-amount.label-right')}:</span>
            <span>
              {`${meanBalance && selectedToken ? getAmountWithSymbol(meanBalance, selectedToken?.address, true) : '0'}`}
            </span>
          </div>
          <div className='right inner-label'>
            <span
              className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'}
              onKeyDown={() => refreshPrices()}
              onClick={() => refreshPrices()}
            >
              ~$
              {fromCoinAmount && selectedToken
                ? formatAmount(
                    Number.parseFloat(fromCoinAmount) *
                      getTokenPriceByAddress(selectedToken.address, selectedToken.symbol),
                    2,
                  )
                : '0.00'}
            </span>
          </div>
        </div>
      </div>

      <div className='p-2'>
        {!fetchingStakeQuote &&
          fromCoinAmount &&
          Number.parseFloat(fromCoinAmount) > 0 &&
          Number.parseFloat(fromCoinAmount) <= meanBalance &&
          stakeQuote > 0 &&
          infoRow(
            `${formatThousands(
              Number.parseFloat(fromCoinAmount),
              getMaxDecimalsForValue(Number.parseFloat(fromCoinAmount)),
            )} MEAN ≈`,
            `${formatThousands(stakeQuote, getMaxDecimalsForValue(stakeQuote))} sMEAN`,
          )}
        {stakedMeanPrice > 0 && infoRow('1 MEAN ≈', `${cutNumber(stakedMeanPrice, 6)} sMEAN`)}
      </div>

      {/* Action button */}
      <Button
        className='main-cta mt-1'
        block
        type='primary'
        shape='round'
        size='large'
        onClick={onStartTransaction}
        disabled={isBusy || !isStakingFormValid()}
      >
        {isBusy && (
          <span className='mr-1'>
            <LoadingOutlined style={{ fontSize: '16px' }} />
          </span>
        )}
        {getStakeButtonLabel()}
      </Button>
      <div className='pt-2'>
        <span className='info-label d-block'>
          sMEAN allows for the consistent earning of rewards, while also providing token holders with the ability to
          engage with governacne proposals, by giving voting rights in said proposals, helping shape the course of the
          Mean DAO. You can make use of this here:{' '}
          <a href='https://app.realms.today/dao/MEAN' target='_blank' rel='noopener noreferrer'>
            https://app.realms.today/dao/MEAN
          </a>
        </span>
      </div>
    </>
  );
};
