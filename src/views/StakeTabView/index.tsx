import { useCallback, useContext, useEffect, useState } from "react";
import './style.scss';
import { LoadingOutlined,  } from "@ant-design/icons";
import { Button, Col, Row } from "antd";
import { useTranslation } from 'react-i18next';
import { TokenDisplay } from "../../components/TokenDisplay";
import { useWallet } from "../../contexts/wallet";
import { AppStateContext } from "../../contexts/appstate";
import { cutNumber, formatAmount, formatThousands, getAmountWithSymbol, getTxIxResume, isValidNumber } from "../../utils/utils";
import { StakeQuote, StakingClient } from "@mean-dao/staking";
import { Transaction } from "@solana/web3.js";
import { confirmationEvents, TxConfirmationContext, TxConfirmationInfo } from "../../contexts/transaction-status";
import { EventType, OperationType, TransactionStatus } from "../../models/enums";
import { consoleOut, getTransactionStatusForLogs } from "../../utils/ui";
import { customLogger } from "../..";
import { useConnection } from "../../contexts/connection";
import { TokenInfo } from "@solana/spl-token-registry";
import { INPUT_DEBOUNCE_TIME } from "../../constants";
import { AppUsageEvent, SegmentStakeMeanData } from "../../utils/segment-service";
import { segmentAnalytics } from "../../App";
import { openNotification } from "../../components/Notifications";
import { INVEST_ROUTE_BASE_PATH } from "../../pages/invest";

let inputDebounceTimeout: any;

export const StakeTabView = (props: {
  stakeClient: StakingClient;
  meanBalance: number;
  smeanBalance: number;
  selectedToken: TokenInfo | undefined;
}) => {
  const {
    loadingPrices,
    transactionStatus,
    getTokenPriceBySymbol,
    setTransactionStatus,
    refreshPrices,
  } = useContext(AppStateContext);
  const { enqueueTransactionConfirmation } = useContext(TxConfirmationContext);
  const connection = useConnection();
  const [isBusy, setIsBusy] = useState(false);
  const { connected, wallet, publicKey } = useWallet();
  const { t } = useTranslation('common');

  /*
  const periods = [
    {
      value: 0,
      time: t("invest.panel-right.tabset.stake.days"),
      multiplier: 1
    },
    {
      value: 30,
      time: t("invest.panel-right.tabset.stake.days"),
      multiplier: 1.1
    },
    {
      value: 90,
      time: t("invest.panel-right.tabset.stake.days"),
      multiplier: 1.2
    },
    {
      value: 1,
      time: t("invest.panel-right.tabset.stake.year"),
      multiplier: 2.0
    },
    {
      value: 4,
      time: t("invest.panel-right.tabset.stake.years"),
      multiplier: 4.0
    },
  ];
  */

  const [fromCoinAmount, setFromCoinAmount] = useState<string>('');
  // const [periodValue, setPeriodValue] = useState<number>(periods[0].value);
  // const [periodTime, setPeriodTime] = useState<string>(periods[0].time);
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
      setFetchingStakeQuote(true);
      // Debouncing
      fetchQuoteFromInput(newValue);
    }
  };

  const getStakeButtonLabel = useCallback(() => {
    return !connected
      ? t('transactions.validation.not-connected')
      : isBusy
        ? `${t("invest.panel-right.tabset.stake.stake-button-busy")} ${props.selectedToken && props.selectedToken.symbol}`
        : !props.selectedToken || !props.meanBalance
          ? t('transactions.validation.no-balance')
          : !fromCoinAmount || !isValidNumber(fromCoinAmount) || !parseFloat(fromCoinAmount)
            ? t('transactions.validation.no-amount')
            : parseFloat(fromCoinAmount) > props.meanBalance
              ? t('transactions.validation.amount-high')
              : `${t("invest.panel-right.tabset.stake.stake-button")} ${props.selectedToken && props.selectedToken.symbol}`;
  }, [
    fromCoinAmount,
    props.selectedToken,
    props.meanBalance,
    connected,
    isBusy,
    t,
  ]);

  const isStakingFormValid = (): boolean => {
    return  connected &&
            props.selectedToken &&
            props.meanBalance &&
            fromCoinAmount &&
            parseFloat(fromCoinAmount) > 0 &&
            parseFloat(fromCoinAmount) <= props.meanBalance
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
    let signedTransaction: Transaction;
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

        const price = getTokenPriceBySymbol(props.selectedToken.symbol);

        // Report event to Segment analytics
        const segmentData: SegmentStakeMeanData = {
          asset: props.selectedToken.symbol,
          assetPrice: price,
          stakedAsset: 'sMEAN',
          stakedAssetPrice: stakedMeanPrice,
          amount: uiAmount,
          quote: stakeQuote,
          valueInUsd: price * uiAmount
        };
        consoleOut('segment data:', segmentData, 'brown');
        segmentAnalytics.recordEvent(AppUsageEvent.StakeMeanFormButton, segmentData);

        return await props.stakeClient
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

    const signTx = async (): Promise<boolean> => {
      if (wallet && publicKey) {
        consoleOut("Signing transaction...");
        return await wallet
          .signTransaction(transaction)
          .then((signed: Transaction) => {
            consoleOut(
              "signTransaction returned a signed transaction:",
              signed
            );
            signedTransaction = signed;
            // Try signature verification by serializing the transaction
            try {
              encodedTx = signedTransaction.serialize().toString("base64");
              consoleOut("encodedTx:", encodedTx, "orange");
            } catch (error) {
              console.error(error);
              setTransactionStatus({
                lastOperation: TransactionStatus.SignTransaction,
                currentOperation: TransactionStatus.SignTransactionFailure,
              });
              transactionLog.push({
                action: getTransactionStatusForLogs(
                  TransactionStatus.SignTransactionFailure
                ),
                result: {
                  signer: `${publicKey.toBase58()}`,
                  error: `${error}`,
                },
              });
              customLogger.logError("Stake transaction failed", {
                transcript: transactionLog,
              });
              segmentAnalytics.recordEvent(AppUsageEvent.StakeMeanFailed, { transcript: transactionLog });
              return false;
            }
            setTransactionStatus({
              lastOperation: TransactionStatus.SignTransaction,
              currentOperation: TransactionStatus.SignTransactionSuccess,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(
                TransactionStatus.SignTransactionSuccess
              ),
              result: { signer: publicKey.toBase58() },
            });
            segmentAnalytics.recordEvent(AppUsageEvent.StakeMeanSigned, {
              signature,
              encodedTx
            });
            return true;
          })
          .catch((error) => {
            console.error("Signing transaction failed!");
            setTransactionStatus({
              lastOperation: TransactionStatus.SignTransaction,
              currentOperation: TransactionStatus.SignTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(
                TransactionStatus.SignTransactionFailure
              ),
              result: {
                signer: `${publicKey.toBase58()}`,
                error: `${error}`,
              },
            });
            customLogger.logError("Stake transaction failed", {transcript: transactionLog});
            segmentAnalytics.recordEvent(AppUsageEvent.StakeMeanFailed, { transcript: transactionLog });
            return false;
          });
      } else {
        console.error("Cannot sign transaction! Wallet not found!");
        setTransactionStatus({
          lastOperation: TransactionStatus.SignTransaction,
          currentOperation: TransactionStatus.WalletNotFound,
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: "Cannot sign transaction! Wallet not found!",
        });
        customLogger.logError("Stake transaction failed", {transcript: transactionLog});
        segmentAnalytics.recordEvent(AppUsageEvent.StakeMeanFailed, { transcript: transactionLog });
        return false;
      }
    };

    const sendTx = async (): Promise<boolean> => {
      if (wallet) {
        return await connection
          .sendEncodedTransaction(encodedTx)
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

    if (wallet && props.selectedToken) {
      setIsBusy(true);
      const create = await createTx();
      consoleOut("created:", create);
      if (create) {
        const sign = await signTx();
        consoleOut("signed:", sign);
        if (sign) {
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
                props.selectedToken.decimals
              )} ${props.selectedToken.symbol}`,
              completedTitle: "Transaction confirmed",
              completedMessage: `Successfully staked ${formatThousands(
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
      } else {
        setIsBusy(false);
      }
    }
  }, [
    wallet,
    publicKey,
    connection,
    stakeQuote,
    fromCoinAmount,
    stakedMeanPrice,
    props.stakeClient,
    props.selectedToken,
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
    if (!path.startsWith(INVEST_ROUTE_BASE_PATH)) {
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
      reloadStakePools();
    }

  }, [recordTxConfirmation]);

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
      openNotification({
        title: 'Create vesting contract status',
        description: 'The transaction to create the vesting contract was not confirmed within 40 seconds. Solana may be congested right now. This page needs to be reloaded to verify the contract was successfully created.',
        duration: null,
        type: "info",
        handleClose: () => reloadStakePools()
      });
    }
  }, [
    recordTxConfirmation,
  ]);


  /////////////////////
  // Data management //
  /////////////////////

  // Stake quote for 1 MEAN
  useEffect(() => {
    if (!props.stakeClient) { return; }

    props.stakeClient.getStakeQuote(1).then((value: StakeQuote) => {
      consoleOut('stakeQuote:', value, 'blue');
      setStakedMeanPrice(value.sMeanOutUiAmount);
      consoleOut(`Quote for 1 MEAN:`, `${formatThousands(value.sMeanOutUiAmount, 6)} sMEAN`, 'blue');
    }).catch((error: any) => {
      console.error(error);
    });

  }, [
    fromCoinAmount,
    props.stakeClient,
    canFetchStakeQuote,
  ]);

  // Stake quote for input amount
  useEffect(() => {
    if (!props.stakeClient) { return; }

    if (parseFloat(fromCoinAmount) > 0 && canFetchStakeQuote) {
      setFetchingStakeQuote(true);
      setCanFetchStakeQuote(false);
      props.stakeClient.getStakeQuote(parseFloat(fromCoinAmount)).then((value: StakeQuote) => {
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
    props.stakeClient,
    canFetchStakeQuote,
  ]);

  // Unstake quote
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

    if (props.selectedToken) {
      if (props.smeanBalance > 0) {
        getMeanQuote(props.smeanBalance).then((value) => {
          consoleOut(`Quote for ${formatThousands(props.smeanBalance, props.selectedToken?.decimals)} sMEAN`, `${formatThousands(value, props.selectedToken?.decimals)} MEAN`, 'blue');
          setMeanWorthOfsMean(value);
        })
      } else {
        setMeanWorthOfsMean(0);
      }
    }
  }, [
    props.stakeClient, 
    props.selectedToken, 
    props.smeanBalance,
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

  // Unsubscribed from events
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
            props.smeanBalance
              ? (
                <span>You have {cutNumber(props.smeanBalance, 6)} sMEAN staked{meanWorthOfsMean ? ` which is currently worth ${cutNumber(meanWorthOfsMean, 6)} MEAN.` : '.'}</span>
              )
              : t("invest.panel-right.tabset.unstake.notification-label-one-error")
          }
        </span>
      </div>
      <div className="form-label">{t("invest.panel-right.tabset.stake.amount-label")}</div>
      <div className={`well mb-1${isBusy ? ' disabled' : ''}`}>
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
              {props.selectedToken && props.meanBalance ? (
                <div className="token-max simplelink" onClick={() => {
                  const newAmount = props.meanBalance.toFixed(props.selectedToken?.decimals || 6);
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
              {`${props.meanBalance && props.selectedToken
                  ? getAmountWithSymbol(props.meanBalance, props.selectedToken?.address, true)
                  : "0"
              }`}
            </span>
          </div>
          <div className="right inner-label">
            <span className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'} onClick={() => refreshPrices()}>
              ~${fromCoinAmount && props.selectedToken
                ? formatAmount(parseFloat(fromCoinAmount) * getTokenPriceBySymbol(props.selectedToken.symbol), 2)
                : "0.00"}
            </span>
          </div>
        </div>
      </div>

      <div className="p-2">
        {
          (!fetchingStakeQuote && fromCoinAmount && parseFloat(fromCoinAmount) > 0 && parseFloat(fromCoinAmount) <= props.meanBalance && stakeQuote > 0) &&
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

      {/* Periods */}
      {/* <span className="info-label">{t("invest.panel-right.tabset.stake.period-label")}</span>
      <div className="flexible-left mb-1 mt-2">
        <div className="left token-group">
          {periods.map((period, index) => (
            <div key={index} className="mb-1 d-flex flex-column align-items-center">
              <div className={`token-max simplelink ${period.value === 7 ? "active" : "disabled"}`} onClick={() => onChangeValue(period.value, period.time, period.multiplier)}>{period.value} {period.time}</div>
              <span>{`${period.multiplier}x`}</span>
            </div>
          ))}
        </div>
      </div>
      <span className="info-label">{t("invest.panel-right.tabset.stake.notification-label", { periodValue: periodValue, periodTime: periodTime, unstakeStartDate: unstakeStartDate })}</span> */}

      {/* Confirm that have read the terms and conditions */}
      {/* <div className="mt-2 d-flex confirm-terms">
        <Checkbox checked={isVerifiedRecipient} onChange={onIsVerifiedRecipientChange}>{t("invest.panel-right.tabset.stake.verified-label")}</Checkbox>
        <Tooltip placement="top" title={t("invest.panel-right.tabset.stake.terms-and-conditions-tooltip")}>
          <span>
            <IconHelpCircle className="mean-svg-icons" />
          </span>
        </Tooltip>
      </div> */}

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
