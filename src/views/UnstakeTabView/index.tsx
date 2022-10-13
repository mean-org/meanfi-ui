import { LoadingOutlined } from "@ant-design/icons";
import { StakingClient, UnstakeQuote } from "@mean-dao/staking";
import { Transaction } from "@solana/web3.js";
import { Button } from "antd";
import { segmentAnalytics } from "App";
import { openNotification } from "components/Notifications";
import { TokenDisplay } from "components/TokenDisplay";
import { INPUT_DEBOUNCE_TIME } from "constants/common";
import { useAccountsContext } from "contexts/accounts";
import { AppStateContext } from "contexts/appstate";
import { useConnection } from "contexts/connection";
import { confirmationEvents, TxConfirmationContext, TxConfirmationInfo } from "contexts/transaction-status";
import { useWallet } from "contexts/wallet";
import { customLogger } from "index";
import { AppUsageEvent, SegmentUnstakeMeanData } from "middleware/segment-service";
import { consoleOut, getTransactionStatusForLogs } from "middleware/ui";
import { cutNumber, formatThousands, getAmountWithSymbol, getTxIxResume, isValidNumber } from "middleware/utils";
import { EventType, OperationType, TransactionStatus } from "models/enums";
import { TokenInfo } from "models/SolanaTokenInfo";
import { STAKING_ROUTE_BASE_PATH } from "pages/staking";
import { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from 'react-i18next';
import './style.scss';

let inputDebounceTimeout: any;

export const UnstakeTabView = (props: {
  stakeClient: StakingClient;
  tokenBalance: number;
  selectedToken: TokenInfo | undefined;
  unstakedToken: TokenInfo | undefined;
}) => {
  const {
    coinPrices,
    loadingPrices,
    transactionStatus,
    getTokenPriceBySymbol,
    setTransactionStatus,
    refreshPrices,
  } = useContext(AppStateContext);
  const { enqueueTransactionConfirmation } = useContext(TxConfirmationContext);
  const { t } = useTranslation('common');
  const connection = useConnection();
  const { connected, wallet } = useWallet();
  const { refreshAccount } = useAccountsContext();
  const percentages = ["25", "50", "75", "100"];
  const [fromCoinAmount, setFromCoinAmount] = useState<string>('');
  const [percentageValue, setPercentageValue] = useState<string>('');
  const [meanWorthOfsMean, setMeanWorthOfsMean] = useState<number>(0);
  const [unstakeMeanValue, setUnstakeMeanValue] = useState<string>();
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
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });

  }, [
    setTransactionStatus
  ]);

  const onChangeValue = (value: string) => {
    setPercentageValue(value);
    setCanFetchUnstakeQuote(true);
  };  

  const handleFromCoinAmountChange = (e: any) => {

    let newValue = e.target.value;

    const decimals = props.selectedToken ? props.selectedToken.decimals : 0;
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
        ? `${t("staking.panel-right.tabset.unstake.unstake-button-busy")} ${props.selectedToken && props.selectedToken.symbol}`
        : !props.selectedToken || !props.tokenBalance
          ? `${t("staking.panel-right.tabset.unstake.unstake-button-unavailable")} ${props.selectedToken && props.selectedToken.symbol}`
          : !fromCoinAmount || !isValidNumber(fromCoinAmount) || !parseFloat(fromCoinAmount)
            ? t('transactions.validation.no-amount')
            : parseFloat(fromCoinAmount) > props.tokenBalance
              ? t('transactions.validation.amount-high')
              : `${t("staking.panel-right.tabset.unstake.unstake-button-available")} ${props.selectedToken && props.selectedToken.symbol}`;
  }, [
    fromCoinAmount,
    props.selectedToken,
    props.tokenBalance,
    connected,
    isBusy,
    t,
  ]);

  const isUnstakingFormValid = (): boolean => {
    return  fromCoinAmount &&
            parseFloat(fromCoinAmount) > 0 &&
            parseFloat(fromCoinAmount) <= props.tokenBalance
      ? true
      : false;
  }

  // Handler paste clipboard data
  const pasteHandler = useCallback((e: any) => {
    const getClipBoardData = e.clipboardData.getData('Text');
    const replaceCommaToDot = getClipBoardData.replace(",", "")
    const onlyNumbersAndDot = replaceCommaToDot.replace(/[^.\d]/g, '');

    setFromCoinAmount(onlyNumbersAndDot.trim());
    setCanFetchUnstakeQuote(true);
  }, []);

  const onTransactionStart = useCallback(async () => {
    let transaction: Transaction;
    let signature = "";
    let encodedTx: string;
    const transactionLog: any[] = [];
    resetTransactionStatus();

    const createTx = async (): Promise<boolean> => {
      if (wallet && props.stakeClient && props.selectedToken) {
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

        // Report event to Segment analytics
        const segmentData: SegmentUnstakeMeanData = {
          asset: props.selectedToken.symbol,
          assetPrice: sMeanToMeanRate,
          unstakedAsset: 'MEAN',
          unstakedAssetPrice: meanPrice,
          amount: uiAmount,
          quote: parseFloat(unstakeMeanValue || '0'),
          valueInUsd: sMeanToMeanRate * parseFloat(unstakeMeanValue || '0')
        };
        consoleOut('segment data:', segmentData, 'brown');
        segmentAnalytics.recordEvent(AppUsageEvent.UnstakeMeanFormButton, segmentData);

        return await props.stakeClient
          .unstakeTransaction(
            uiAmount // uiAmount
          )
          .then((value) => {
            consoleOut("unstakeTransaction returned transaction:", value);
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
            console.error("unstakeTransaction init error:", error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: `${error}`,
            });
            customLogger.logError("Unstake transaction failed", {
              transcript: transactionLog,
            });
            segmentAnalytics.recordEvent(AppUsageEvent.UnstakeMeanFailed, { transcript: transactionLog });
            return false;
          });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: "Cannot start transaction! Wallet not found!",
        });
        customLogger.logError("Unstake transaction failed", {
          transcript: transactionLog,
        });
        segmentAnalytics.recordEvent(AppUsageEvent.UnstakeMeanFailed, { transcript: transactionLog });
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
            customLogger.logError("Unstake transaction failed", {
              transcript: transactionLog,
            });
            segmentAnalytics.recordEvent(AppUsageEvent.UnstakeMeanFailed, { transcript: transactionLog });
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
        customLogger.logError("Unstake transaction failed", {
          transcript: transactionLog,
        });
        segmentAnalytics.recordEvent(AppUsageEvent.UnstakeMeanFailed, { transcript: transactionLog });
        return false;
      }
    };

    if (wallet && props.selectedToken) {
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
            operationType: OperationType.Unstake,
            finality: "confirmed",
            txInfoFetchStatus: "fetching",
            loadingTitle: "Confirming transaction",
            loadingMessage: `Unstaking ${formatThousands(
              parseFloat(fromCoinAmount),
              props.selectedToken.decimals
            )} ${props.selectedToken.symbol}`,
            completedTitle: "Transaction confirmed",
            completedMessage: `Successfully unstaked ${formatThousands(
              parseFloat(fromCoinAmount),
              props.selectedToken.decimals
            )} ${props.selectedToken.symbol}`,
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
    meanPrice,
    connection,
    fromCoinAmount,
    sMeanToMeanRate,
    unstakeMeanValue,
    props.stakeClient,
    props.selectedToken,
    transactionStatus.currentOperation,
    enqueueTransactionConfirmation,
    resetTransactionStatus,
    setTransactionStatus,
    t
  ]);

  const recordTxConfirmation = useCallback((signature: string, operation: OperationType, success = true) => {
    let event: any;
    if (operation === OperationType.Unstake) {
      event = success ? AppUsageEvent.UnstakeMeanCompleted : AppUsageEvent.UnstakeMeanFailed;
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

    if (item.operationType === OperationType.Unstake) {
      consoleOut(`onTxConfirmed event handled for operation ${OperationType[item.operationType]}`, item, 'crimson');
      recordTxConfirmation(item.signature, item.operationType, true);
      setIsBusy(false);
      refreshAccount();
      reloadStakePools();
    }

  }, [
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

    if (item.operationType === OperationType.Unstake) {
      consoleOut("onTxTimedout event executed:", item, 'crimson');
      recordTxConfirmation(item.signature, item.operationType, false);
      setIsBusy(false);
      refreshAccount();
      openNotification({
        title: 'Unstake MEAN status',
        description: 'The transaction to unstake MEAN was not confirmed within 40 seconds. Solana may be congested right now. This page needs to be reloaded to verify the contract was successfully created.',
        duration: null,
        type: "info",
        handleClose: () => reloadStakePools()
      });
    }
  }, [
    refreshAccount,
    recordTxConfirmation,
  ]);


  /////////////////////
  // Data management //
  /////////////////////

  // Keep MEAN price updated
  useEffect(() => {

    if (coinPrices && props.unstakedToken) {
      const price = getTokenPriceBySymbol(props.unstakedToken.symbol);
      consoleOut('meanPrice:', price, 'crimson');
      setMeanPrice(price);
    }

  }, [coinPrices, getTokenPriceBySymbol, props.unstakedToken]);

  // Unstake quote - For full unstaked balance
  useEffect(() => {

    const getMeanQuote = async (sMEAN: number) => {
      if (!props.stakeClient) { return 0; }

      try {
        const result = await props.stakeClient.getUnstakeQuote(sMEAN);
        return result.meanOutUiAmount;
      } catch (error) {
        console.error(error);
        return 0;
      }
    }

    if (props.selectedToken && props.selectedToken.symbol === "sMEAN") {
      if (props.tokenBalance > 0) {
        getMeanQuote(props.tokenBalance).then((value) => {
          consoleOut(`Quote for ${formatThousands(props.tokenBalance, props.selectedToken?.decimals)} sMEAN`, `${formatThousands(value, props.selectedToken?.decimals)} MEAN`, 'blue');
          setMeanWorthOfsMean(value);
        })
      } else {
        setMeanWorthOfsMean(0);
      }
    }
  }, [
    props.stakeClient, 
    props.selectedToken, 
    props.tokenBalance,
    fromCoinAmount
  ]);

  // Stake quote - For input amount
  useEffect(() => {
    if (!props.stakeClient) {
      return;
    }

    if (parseFloat(fromCoinAmount) > 0 && canFetchUnstakeQuote) {
      setCanFetchUnstakeQuote(false);

      props.stakeClient.getUnstakeQuote(parseFloat(fromCoinAmount)).then((value: UnstakeQuote) => {
        consoleOut('unStakeQuote:', value, 'blue');
        setUnstakeMeanValue(value.meanOutUiAmount.toString());
        consoleOut(`Quote for ${formatThousands(parseFloat(fromCoinAmount), props.selectedToken?.decimals)} sMEAN`, `${formatThousands(value.meanOutUiAmount, props.selectedToken?.decimals)} MEAN`, 'blue');
        setSMeanToMeanRate(value.sMeanToMeanRateUiAmount);
      }).catch((error: any) => {
        console.error(error);
      });
    }

  }, [
    fromCoinAmount,
    props.stakeClient,
    canFetchUnstakeQuote,
    props.selectedToken,
  ]);

  useEffect(() => {
    const percentageFromCoinAmount = props.tokenBalance > 0 ? `${(props.tokenBalance*parseFloat(percentageValue)/100).toFixed(props.selectedToken?.decimals || 9)}` : '';

    if (percentageValue) {
      setFromCoinAmount(percentageFromCoinAmount);
      setPercentageValue("");
    }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [percentageValue]);

  /**
   * The UnstakeQuote method returns sMeanToMeanRateUiAmount which is (MEAN/sMEAN rate)
   * So we calculate the USD Amount relative to the input sMEAN: sMEAN x sMeanToMeanRateUiAmount x MEAN_current_price
   */
   const getUsdAmountForSmeanInput = useCallback(() => {
    if (fromCoinAmount && parseFloat(fromCoinAmount) > 0 && sMeanToMeanRate && meanPrice ) {
      const usdAmount = parseFloat(fromCoinAmount) * sMeanToMeanRate * meanPrice;
      return usdAmount;
    }
    return 0;
  }, [fromCoinAmount, meanPrice, sMeanToMeanRate]);

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

  return (
    <>
      <div className="mb-2 px-1">
        <span className="info-label">
          {
            props.tokenBalance
              ? (
                <span>You have {cutNumber(props.tokenBalance, 6)} sMEAN staked{meanWorthOfsMean ? ` which is currently worth ${cutNumber(meanWorthOfsMean, 6)} MEAN.` : '.'}</span>
              )
              : t("staking.panel-right.tabset.unstake.notification-label-one-error")
          }
        </span>
      </div>
      <div className="form-label mt-2">{t("staking.panel-right.tabset.unstake.amount-label")}</div>
      <div className={`well${isBusy ? ' disabled' : ''}`}>
        <div className="flexible-right mb-1">
          <div className="token-group">
            {percentages.map((percentage, index) => (
              <div key={index} className="mb-1 d-flex flex-column align-items-center">
                <div className={`token-max simplelink ${props.tokenBalance !== 0 ? "active" : "disabled"}`} onClick={() => onChangeValue(percentage)}>{percentage}%</div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex-fixed-left">
          <div className="left">
            <span className="add-on">
              {props.selectedToken && (
                <TokenDisplay onClick={() => {}}
                  mintAddress={props.selectedToken.address}
                  name={props.selectedToken.name}
                  className="click-disabled"
                />
              )}
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
            <span>{t('staking.panel-right.tabset.unstake.send-amount.label-right')}:</span>
            <span>
              {`${props.tokenBalance && props.selectedToken
                  ? getAmountWithSymbol(props.tokenBalance, props.selectedToken?.address, true)
                  : "0"
              }`}
            </span>
          </div>
          <div className="right inner-label">
            <span className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'} onClick={() => refreshPrices()}>
              ~${fromCoinAmount
                ? formatThousands(getUsdAmountForSmeanInput(), 2, 2)
                : "0.00"}
            </span>
          </div>
        </div>
      </div>
      <span className="info-label">{t("staking.panel-right.tabset.unstake.notification-label-two")}</span>

      {/* Action button */}
      <Button
        className="main-cta mt-2"
        block
        type="primary"
        shape="round"
        size="large"
        onClick={onTransactionStart}
        disabled={
          isBusy ||
          !isUnstakingFormValid()
        }>
        {isBusy && (<span className="mr-1"><LoadingOutlined style={{ fontSize: '16px' }} /></span>)}
        {getUnstakeButtonLabel()}
      </Button>
    </>
  )
}
