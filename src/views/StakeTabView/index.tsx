import { LoadingOutlined } from "@ant-design/icons";
import { StakeQuote, StakingClient } from "@mean-dao/staking";
import { Transaction } from "@solana/web3.js";
import { Button, Col, Row } from "antd";
import { segmentAnalytics } from "App";
import { openNotification } from "components/Notifications";
import { TokenDisplay } from "components/TokenDisplay";
import { INPUT_DEBOUNCE_TIME, STAKING_ROUTE_BASE_PATH } from "constants/common";
import { useAccountsContext } from "contexts/accounts";
import { AppStateContext } from "contexts/appstate";
import { useConnection } from "contexts/connection";
import { confirmationEvents, TxConfirmationContext, TxConfirmationInfo } from "contexts/transaction-status";
import { useWallet } from "contexts/wallet";
import { customLogger } from "index";
import { AppUsageEvent, SegmentStakeMeanData } from "middleware/segment-service";
import { consoleOut, getTransactionStatusForLogs } from "middleware/ui";
import { cutNumber, formatAmount, formatThousands, getAmountWithSymbol, getTxIxResume, isValidNumber } from "middleware/utils";
import { EventType, OperationType, TransactionStatus } from "models/enums";
import { TokenInfo } from "models/SolanaTokenInfo";
import { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from 'react-i18next';
import './style.scss';

let inputDebounceTimeout: any;

export const StakeTabView = (props: {
  meanBalance: number;
  onTxFinished: any;
  selectedToken: TokenInfo | undefined;
  smeanBalance: number;
  stakeClient: StakingClient;
}) => {
  const {
    meanBalance,
    onTxFinished,
    selectedToken,
    smeanBalance,
    stakeClient,
  } = props;
  const {
    loadingPrices,
    transactionStatus,
    getTokenPriceBySymbol,
    setTransactionStatus,
    refreshPrices,
  } = useContext(AppStateContext);
  const { enqueueTransactionConfirmation } = useContext(TxConfirmationContext);
  const { refreshAccount } = useAccountsContext();
  const connection = useConnection();
  const [isBusy, setIsBusy] = useState(false);
  const { connected, wallet } = useWallet();
  const { t } = useTranslation('common');
  const [fromCoinAmount, setFromCoinAmount] = useState<string>('');
  const [stakeQuote, setStakeQuote] = useState<number>(0);
  const [stakedMeanPrice, setStakedMeanPrice] = useState<number>(0);
  const [canFetchStakeQuote, setCanFetchStakeQuote] = useState(false);
  const [fetchingStakeQuote, setFetchingStakeQuote] = useState(false);
  const [meanWorthOfsMean, setMeanWorthOfsMean] = useState<number>(0);
  const [canSubscribe, setCanSubscribe] = useState(true);


  //////////////////////////
  //  CALLBACKS & EVENTS  //
  //////////////////////////

  const resetTransactionStatus = useCallback(() => {

    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });

  }, [
    setTransactionStatus
  ]);

  const fetchQuoteFromInput = (value: string) => {
    clearTimeout(inputDebounceTimeout);
    inputDebounceTimeout = setTimeout(() => {
      consoleOut('input ====>', value, 'orange');
      setCanFetchStakeQuote(true);
    }, INPUT_DEBOUNCE_TIME);
  }

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

    if (newValue === null || newValue === undefined || newValue === "") {
      setFromCoinAmount("");
    } else if (newValue === '.') {
      setFromCoinAmount(".");
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
        ? `${t("staking.panel-right.tabset.stake.stake-button-busy")} ${selectedToken && selectedToken.symbol}`
        : !selectedToken || !meanBalance
          ? t('transactions.validation.no-balance')
          : !fromCoinAmount || !isValidNumber(fromCoinAmount) || !parseFloat(fromCoinAmount)
            ? t('transactions.validation.no-amount')
            : parseFloat(fromCoinAmount) > meanBalance
              ? t('transactions.validation.amount-high')
              : `${t("staking.panel-right.tabset.stake.stake-button")} ${selectedToken && selectedToken.symbol}`;
  }, [
    fromCoinAmount,
    selectedToken,
    meanBalance,
    connected,
    isBusy,
    t,
  ]);

  const isStakingFormValid = (): boolean => {
    return  connected &&
            selectedToken &&
            meanBalance &&
            fromCoinAmount &&
            parseFloat(fromCoinAmount) > 0 &&
            parseFloat(fromCoinAmount) <= meanBalance
      ? true
      : false;
  }

  // Handler paste clipboard data
  const pasteHandler = (e: any) => {
    const getClipBoardData = e.clipboardData.getData('Text');
    const replaceCommaToDot = getClipBoardData.replace(",", "")
    const onlyNumbersAndDot = replaceCommaToDot.replace(/[^.\d]/g, '');

    setFromCoinAmount(onlyNumbersAndDot.trim());
    setFetchingStakeQuote(true);
  }

  const getMaxDecimalsForValue = (value: number) => {
    return value < 5
      ? 6
      : value >= 5 && value < 100
        ? 4
        : 2;
  }

  const onTransactionStart = useCallback(async () => {
    let transaction: Transaction;
    let signature = "";
    let encodedTx: string;
    const transactionLog: any[] = [];
    resetTransactionStatus();

    const createTx = async (): Promise<boolean> => {
      if (wallet && stakeClient && selectedToken) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction,
        });

        const uiAmount = parseFloat(fromCoinAmount);
        consoleOut("uiAmount:", uiAmount, "blue");

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
          inputs: `uiAmount: ${uiAmount}`,
        });

        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
          result: "",
        });

        const price = getTokenPriceBySymbol(selectedToken.symbol);

        // Report event to Segment analytics
        const segmentData: SegmentStakeMeanData = {
          asset: selectedToken.symbol,
          assetPrice: price,
          stakedAsset: 'sMEAN',
          stakedAssetPrice: stakedMeanPrice,
          amount: uiAmount,
          quote: stakeQuote,
          valueInUsd: price * uiAmount
        };
        consoleOut('segment data:', segmentData, 'brown');
        segmentAnalytics.recordEvent(AppUsageEvent.StakeMeanFormButton, segmentData);

        return await stakeClient
          .stakeTransaction(
            uiAmount // uiAmount
          )
          .then((value) => {
            consoleOut("stakeTransaction returned transaction:", value);
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
          .catch((error) => {
            console.error("stakeTransaction init error:", error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: `${error}`,
            });
            customLogger.logError("Stake transaction failed", {
              transcript: transactionLog,
            });
            segmentAnalytics.recordEvent(AppUsageEvent.StakeMeanFailed, { transcript: transactionLog });
            return false;
          });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: "Cannot start transaction! Wallet not found!",
        });
        customLogger.logError("Stake transaction failed", {
          transcript: transactionLog,
        });
        segmentAnalytics.recordEvent(AppUsageEvent.StakeMeanFailed, { transcript: transactionLog });
        return false;
      }
    };

    const sendTx = async (): Promise<boolean> => {
      if (connection && wallet && wallet.publicKey && transaction) {
        const {
          context: { slot: minContextSlot },
          value: { blockhash, lastValidBlockHeight },
        } = await connection.getLatestBlockhashAndContext();

        transaction.feePayer = wallet.publicKey;
        transaction.recentBlockhash = blockhash;

        return wallet.sendTransaction(transaction, connection, { minContextSlot })
          .then((sig: any) => {
            consoleOut("sendEncodedTransaction returned a signature:", sig);
            setTransactionStatus({
              lastOperation: TransactionStatus.SignTransactionSuccess,
              currentOperation: TransactionStatus.SendTransactionSuccess,
            });
            signature = sig;
            transactionLog.push({
              action: getTransactionStatusForLogs(
                TransactionStatus.SendTransactionSuccess
              ),
              result: `signature: ${signature}`,
            });
            return true;
          })
          .catch((error: any) => {
            console.error(error);
            setTransactionStatus({
              lastOperation: TransactionStatus.SignTransactionSuccess,
              currentOperation: TransactionStatus.SendTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(
                TransactionStatus.SendTransactionFailure
              ),
              result: { error, encodedTx },
            });
            customLogger.logError("Stake transaction failed", {
              transcript: transactionLog,
            });
            segmentAnalytics.recordEvent(AppUsageEvent.StakeMeanFailed, { transcript: transactionLog });
            return false;
          });
      } else {
        setTransactionStatus({
          lastOperation: TransactionStatus.SendTransaction,
          currentOperation: TransactionStatus.WalletNotFound,
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: "Cannot send transaction! Wallet not found!",
        });
        customLogger.logError("Stake transaction failed", {
          transcript: transactionLog,
        });
        segmentAnalytics.recordEvent(AppUsageEvent.StakeMeanFailed, { transcript: transactionLog });
        return false;
      }
    };

    if (wallet && selectedToken) {
      setIsBusy(true);
      const create = await createTx();
      consoleOut("created:", create);
      if (create) {
        const sent = await sendTx();
        consoleOut("sent:", sent);
        if (sent) {
          setTransactionStatus({
            lastOperation: TransactionStatus.SendTransactionSuccess,
            currentOperation: TransactionStatus.TransactionFinished,
          });
          enqueueTransactionConfirmation({
            signature: signature,
            operationType: OperationType.Stake,
            finality: "confirmed",
            txInfoFetchStatus: "fetching",
            loadingTitle: "Confirming transaction",
            loadingMessage: `Staking ${formatThousands(
              parseFloat(fromCoinAmount),
              selectedToken.decimals
            )} ${selectedToken.symbol}`,
            completedTitle: "Transaction confirmed",
            completedMessage: `Successfully staked ${formatThousands(
              parseFloat(fromCoinAmount),
              selectedToken.decimals
            )} ${selectedToken.symbol}`,
          });
          resetTransactionStatus();
          setFromCoinAmount("");
        } else {
          openNotification({
            title: t("notifications.error-title"),
            description: t("notifications.error-sending-transaction"),
            type: "error",
          });
          setIsBusy(false);
        }
      } else {
        setIsBusy(false);
      }
    }
  }, [
    wallet,
    connection,
    stakeQuote,
    fromCoinAmount,
    stakedMeanPrice,
    stakeClient,
    selectedToken,
    transactionStatus.currentOperation,
    enqueueTransactionConfirmation,
    resetTransactionStatus,
    getTokenPriceBySymbol,
    setTransactionStatus,
    t
  ]);

  const recordTxConfirmation = useCallback((signature: string, operation: OperationType, success = true) => {
    let event: any;
    if (operation === OperationType.Stake) {
      event = success ? AppUsageEvent.StakeMeanCompleted : AppUsageEvent.StakeMeanFailed;
      segmentAnalytics.recordEvent(event, { signature: signature });
    }
  }, []);

  // Setup event handler for Tx confirmed
  const onTxConfirmed = useCallback((item: TxConfirmationInfo) => {

    const path = window.location.pathname;
    if (!path.startsWith(STAKING_ROUTE_BASE_PATH)) {
      return;
    }

    const reloadStakePools = () => {
      const stakePoolsRefreshCta = document.getElementById("refresh-stake-pool-info-cta");
      if (stakePoolsRefreshCta) {
        stakePoolsRefreshCta.click();
      } else {
        console.log('element not found:', '#refresh-stake-pool-info-cta', 'red');
      }
    };

    if (item.operationType === OperationType.Stake) {
      consoleOut(`onTxConfirmed event handled for operation ${OperationType[item.operationType]}`, item, 'crimson');
      recordTxConfirmation(item.signature, item.operationType, true);
      setIsBusy(false);
      onTxFinished();
      refreshAccount();
      reloadStakePools();
    }

  }, [
    onTxFinished,
    refreshAccount,
    recordTxConfirmation
  ]);

  // Setup event handler for Tx confirmation error
  const onTxTimedout = useCallback((item: TxConfirmationInfo) => {

    const reloadStakePools = () => {
      const stakePoolsRefreshCta = document.getElementById("refresh-stake-pool-info-cta");
      if (stakePoolsRefreshCta) {
        stakePoolsRefreshCta.click();
      } else {
        console.log('element not found:', '#refresh-stake-pool-info-cta', 'red');
      }
    };

    if (item.operationType === OperationType.Stake) {
      consoleOut("onTxTimedout event executed:", item, 'crimson');
      recordTxConfirmation(item.signature, item.operationType, false);
      setIsBusy(false);
      refreshAccount();
      openNotification({
        title: 'Stake MEAN status',
        description: 'The transaction to stake MEAN was not confirmed within 40 seconds. Solana may be congested right now. This page needs to be reloaded to verify the contract was successfully created.',
        duration: null,
        type: "info",
        handleClose: () => reloadStakePools()
      });
      onTxFinished();
    }
  }, [
    onTxFinished,
    refreshAccount,
    recordTxConfirmation
  ]);


  /////////////////////
  // Data management //
  /////////////////////

  // Stake quote for 1 MEAN
  useEffect(() => {
    if (!stakeClient) { return; }

    stakeClient.getStakeQuote(1).then((value: StakeQuote) => {
      consoleOut('stakeQuote:', value, 'blue');
      setStakedMeanPrice(value.sMeanOutUiAmount);
      consoleOut(`Quote for 1 MEAN:`, `${formatThousands(value.sMeanOutUiAmount, 6)} sMEAN`, 'blue');
    }).catch((error: any) => {
      console.error(error);
    });

  }, [
    fromCoinAmount,
    stakeClient,
    canFetchStakeQuote,
  ]);

  // Stake quote for input amount
  useEffect(() => {
    if (!stakeClient) { return; }

    if (parseFloat(fromCoinAmount) > 0 && canFetchStakeQuote) {
      setFetchingStakeQuote(true);
      setCanFetchStakeQuote(false);
      stakeClient.getStakeQuote(parseFloat(fromCoinAmount)).then((value: StakeQuote) => {
        consoleOut('stakeQuote:', value, 'blue');
        setStakeQuote(value.sMeanOutUiAmount);
        consoleOut(`Quote for ${formatThousands(parseFloat(fromCoinAmount), 6)} MEAN`, `${formatThousands(value.sMeanOutUiAmount, 6)} sMEAN`, 'blue');
      })
      .catch((error: any) => {
        console.error(error);
      })
      .finally(() => setFetchingStakeQuote(false));
    }

  }, [
    fromCoinAmount,
    stakeClient,
    canFetchStakeQuote,
  ]);

  // Unstake quote
  useEffect(() => {
    const getMeanQuote = async (sMEAN: number) => {
      if (!stakeClient) { return 0; }

      try {
        const result = await stakeClient.getUnstakeQuote(sMEAN);
        return result.meanOutUiAmount;
      } catch (error) {
        console.error(error);
        return 0;
      }
    }

    if (selectedToken) {
      if (smeanBalance > 0) {
        getMeanQuote(smeanBalance).then((value) => {
          consoleOut(`Quote for ${formatThousands(smeanBalance, selectedToken?.decimals)} sMEAN`, `${formatThousands(value, selectedToken?.decimals)} MEAN`, 'blue');
          setMeanWorthOfsMean(value);
        })
      } else {
        setMeanWorthOfsMean(0);
      }
    }
  }, [
    stakeClient, 
    selectedToken, 
    smeanBalance,
    fromCoinAmount
  ]);

  // Setup event listeners
  useEffect(() => {
    if (canSubscribe) {
      setCanSubscribe(false);
      confirmationEvents.on(EventType.TxConfirmSuccess, onTxConfirmed);
      consoleOut('Subscribed to event txConfirmed with:', 'onTxConfirmed', 'blue');
      confirmationEvents.on(EventType.TxConfirmTimeout, onTxTimedout);
      consoleOut('Subscribed to event txTimedout with:', 'onTxTimedout', 'blue');
    }
  }, [
    canSubscribe,
    onTxConfirmed,
    onTxTimedout
  ]);

  // Unsubscribe from events
  useEffect(() => {
    // Do unmounting stuff here
    return () => {
      confirmationEvents.off(EventType.TxConfirmSuccess, onTxConfirmed);
      consoleOut('Unsubscribed from event txConfirmed!', '', 'blue');
      confirmationEvents.off(EventType.TxConfirmTimeout, onTxTimedout);
      consoleOut('Unsubscribed from event onTxTimedout!', '', 'blue');
      setCanSubscribe(true);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  ///////////////
  // Rendering //
  ///////////////

  const infoRow = (caption: string, value: string) => {
    return (
      <Row>
        <Col span={12} className="font-size-75 fg-secondary-60 text-right pr-1">{caption}</Col>
        <Col span={12} className="font-size-75 fg-secondary-60 text-left">{value}</Col>
      </Row>
    );
  }

  return (
    <>
      <div className="mb-2 px-1">
        <span className="info-label">
          {
            smeanBalance
              ? (
                <span>You have {cutNumber(smeanBalance, 6)} sMEAN staked{meanWorthOfsMean ? ` which is currently worth ${cutNumber(meanWorthOfsMean, 6)} MEAN.` : '.'}</span>
              )
              : t("staking.panel-right.tabset.unstake.notification-label-one-error")
          }
        </span>
      </div>
      <div className="form-label">{t("staking.panel-right.tabset.stake.amount-label")}</div>
      <div className={`well mb-1${isBusy ? ' disabled' : ''}`}>
        <div className="flex-fixed-left">
          <div className="left">
            <span className="add-on">
              {selectedToken && (
                <TokenDisplay onClick={() => {}}
                  mintAddress={selectedToken.address}
                  name={selectedToken.name}
                  className="click-disabled"
                />
              )}
              {selectedToken && meanBalance ? (
                <div className="token-max simplelink" onClick={() => {
                  const newAmount = meanBalance.toFixed(selectedToken?.decimals || 9);
                  setFromCoinAmount(newAmount);
                  // Debouncing
                  fetchQuoteFromInput(newAmount);
                }}>
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
              onChange={handleFromCoinAmountChange}
              pattern="^[0-9]*[.,]?[0-9]*$"
              placeholder="0.0"
              minLength={1}
              maxLength={79}
              spellCheck="false"
              onPaste={pasteHandler}
              value={fromCoinAmount}
            />
          </div>
        </div>
        <div className="flex-fixed-right">
          <div className="left inner-label">
            <span>{t('transactions.send-amount.label-right')}:</span>
            <span>
              {`${meanBalance && selectedToken
                  ? getAmountWithSymbol(meanBalance, selectedToken?.address, true)
                  : "0"
              }`}
            </span>
          </div>
          <div className="right inner-label">
            <span className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'} onClick={() => refreshPrices()}>
              ~${fromCoinAmount && selectedToken
                ? formatAmount(parseFloat(fromCoinAmount) * getTokenPriceBySymbol(selectedToken.symbol), 2)
                : "0.00"}
            </span>
          </div>
        </div>
      </div>

      <div className="p-2">
        {
          (!fetchingStakeQuote && fromCoinAmount && parseFloat(fromCoinAmount) > 0 && parseFloat(fromCoinAmount) <= meanBalance && stakeQuote > 0) &&
            infoRow(
              `${formatThousands(parseFloat(fromCoinAmount), getMaxDecimalsForValue(parseFloat(fromCoinAmount)))} MEAN ≈`,
              `${formatThousands(stakeQuote, getMaxDecimalsForValue(stakeQuote))} sMEAN`
            )
        }
        {
          stakedMeanPrice > 0 &&
            infoRow(
              `1 MEAN ≈`,
              `${cutNumber(stakedMeanPrice, 6)} sMEAN`
            )
        }
      </div>

      {/* Action button */}
      <Button
        className="main-cta mt-1"
        block
        type="primary"
        shape="round"
        size="large"
        onClick={onTransactionStart}
        disabled={
          isBusy ||
          !isStakingFormValid()
        }>
        {isBusy && (<span className="mr-1"><LoadingOutlined style={{ fontSize: '16px' }} /></span>)}
        {getStakeButtonLabel()}
      </Button>
    </>
  )
}
