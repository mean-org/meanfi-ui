import { useCallback, useContext, useEffect, useState } from "react";
import './style.less';
import { CheckOutlined, InfoCircleOutlined, LoadingOutlined,  } from "@ant-design/icons";
import { Button, Modal, Spin } from "antd";
import moment from 'moment';
import { useTranslation } from 'react-i18next';
import { TokenDisplay } from "../../components/TokenDisplay";
import { useWallet } from "../../contexts/wallet";
import { AppStateContext } from "../../contexts/appstate";
import { cutNumber, formatAmount, formatThousands, getAmountWithSymbol, getTxIxResume, isValidNumber } from "../../utils/utils";
import { StakeQuote, StakingClient } from "@mean-dao/staking";
import { Transaction } from "@solana/web3.js";
import { TransactionStatusContext } from "../../contexts/transaction-status";
import { OperationType, TransactionStatus } from "../../models/enums";
import { consoleOut, getTransactionModalTitle, getTransactionOperationDescription, getTransactionStatusForLogs } from "../../utils/ui";
import { customLogger } from "../..";
import { useConnection } from "../../contexts/connection";
import { notify } from "../../utils/notifications";
import { TokenInfo } from "@solana/spl-token-registry";

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const StakeTabView = (props: {
  stakeClient: StakingClient;
  meanBalance: number;
  smeanBalance: number;
  selectedToken: TokenInfo | undefined;
}) => {
  const {
    coinPrices,
    stakedAmount,
    loadingPrices,
    fromCoinAmount,
    paymentStartDate,
    transactionStatus,
    refreshTokenBalance,
    setIsVerifiedRecipient,
    setTransactionStatus,
    // setUnstakeStartDate,
    setFromCoinAmount,
    setStakedAmount,
    refreshPrices,
  } = useContext(AppStateContext);
  const { enqueueTransactionConfirmation } = useContext(TransactionStatusContext);
  const connection = useConnection();
  const [isBusy, setIsBusy] = useState(false);
  const { connected, wallet } = useWallet();
  const { t } = useTranslation('common');
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

  const [periodValue, setPeriodValue] = useState<number>(periods[0].value);
  const [periodTime, setPeriodTime] = useState<string>(periods[0].time);
  const [stakeQuote, setStakeQuote] = useState<number>(0);
  const [meanWorthOfsMean, setMeanWorthOfsMean] = useState<number>(0);

  ///////////////////////
  //  EVENTS & MODALS  //
  ///////////////////////

  // Common transaction execution modal
  const [isTransactionExecutionModalVisible, setTransactionExecutionModalVisibility] = useState(false);
  const showTransactionExecutionModal = useCallback(() => setTransactionExecutionModalVisibility(true), []);
  const hideTransactionExecutionModal = useCallback(() => setTransactionExecutionModalVisibility(false), []);

  const refreshPage = () => {
    hideTransactionExecutionModal();
    window.location.reload();
  }

  const onCloseTransactionExecutionModal = () => {
    setFromCoinAmount("");
    hideTransactionExecutionModal();
  }

  // Transaction execution (Applies to all transactions)
  const isSuccess = (): boolean => {
    return transactionStatus.currentOperation === TransactionStatus.TransactionFinished;
  }
 
  const isError = (): boolean => {
    return  transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ||
            transactionStatus.currentOperation === TransactionStatus.InitTransactionFailure ||
            transactionStatus.currentOperation === TransactionStatus.SignTransactionFailure ||
            transactionStatus.currentOperation === TransactionStatus.SendTransactionFailure ||
            transactionStatus.currentOperation === TransactionStatus.ConfirmTransactionFailure ||
            transactionStatus.currentOperation === TransactionStatus.FeatureTemporarilyDisabled
            ? true
            : false;
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
    }
  };

  const getPricePerToken = useCallback((token: TokenInfo): number => {
    if (!token || !token.symbol) { return 0; }
    const tokenSymbol = token.symbol.toUpperCase();
    const symbol = tokenSymbol[0] === 'W' ? tokenSymbol.slice(1) : tokenSymbol;

    return coinPrices && coinPrices[symbol]
      ? coinPrices[symbol]
      : 0;
  }, [coinPrices])

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

  const onTransactionStart = useCallback(async () => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature = "";
    let encodedTx: string;
    const transactionLog: any[] = [];

    const createTx = async (): Promise<boolean> => {
      if (wallet && props.stakeClient) {
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
        return false;
      }
    };

    const signTx = async (): Promise<boolean> => {
      if (wallet) {
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
                  signer: `${wallet.publicKey.toBase58()}`,
                  error: `${error}`,
                },
              });
              customLogger.logError("Stake transaction failed", {
                transcript: transactionLog,
              });
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
              result: { signer: wallet.publicKey.toBase58() },
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
                signer: `${wallet.publicKey.toBase58()}`,
                error: `${error}`,
              },
            });
            customLogger.logError("Stake transaction failed", {
              transcript: transactionLog,
            });
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
        customLogger.logError("Stake transaction failed", {
          transcript: transactionLog,
        });
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
        return false;
      }
    };

    if (wallet && props.selectedToken) {
      showTransactionExecutionModal();
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
            setIsBusy(false);
          } else {
            notify({
              message: t("notifications.error-title"),
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
    connection,
    props.selectedToken,
    fromCoinAmount,
    props.stakeClient,
    transactionStatus.currentOperation,
    showTransactionExecutionModal,
    enqueueTransactionConfirmation,
    setTransactionStatus,
    t
  ]);

  // Stake quote
  useEffect(() => {
    if (!props.stakeClient) {
      return;
    }

    if (parseFloat(fromCoinAmount) > 0) {
      props.stakeClient.getStakeQuote(parseFloat(fromCoinAmount)).then((value: StakeQuote) => {
        consoleOut('stakeQuote:', value, 'blue');
        setStakeQuote(value.sMeanOutUiAmount);
        consoleOut(`Quote for ${formatThousands(parseFloat(fromCoinAmount), 6)} MEAN`, `${formatThousands(value.sMeanOutUiAmount, 6)} sMEAN`, 'blue');
      }).catch((error: any) => {
        console.error(error);
      });
    }

  }, [
    props.stakeClient,
    fromCoinAmount
  ]);

  // Handler paste clipboard data
  const pasteHandler = (e: any) => {
    const getClipBoardData = e.clipboardData.getData('Text');
    const replaceCommaToDot = getClipBoardData.replace(",", "")
    const onlyNumbersAndDot = replaceCommaToDot.replace(/[^.\d]/g, '');

    setFromCoinAmount(onlyNumbersAndDot.trim());
  }

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
      <div className="well mb-1">
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
                <div className="token-max simplelink" onClick={() =>
                    setFromCoinAmount(
                      props.meanBalance.toFixed(props.selectedToken?.decimals || 6)
                    )
                  }>
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
                ? formatAmount(parseFloat(fromCoinAmount) * getPricePerToken(props.selectedToken), 2)
                : "0.00"}
            </span>
          </div>
        </div>
      </div>

      <div className="mb-2">
        {(fromCoinAmount && parseFloat(fromCoinAmount) > 0 && stakeQuote > 0) && (
          <span className="form-field-hint pl-2">
            {`Amount staked ≈ ${cutNumber(stakeQuote, 6)} sMEAN.`}
          </span>
        )}
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
        className="main-cta mt-2"
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

      {/* Common transaction execution modal */}
      <Modal
        className="mean-modal no-full-screen"
        maskClosable={false}
        visible={isTransactionExecutionModalVisible}
        title={getTransactionModalTitle(transactionStatus, isBusy, t)}
        onCancel={hideTransactionExecutionModal}
        width={360}
        footer={null}>
        <div className="transaction-progress">
          {isBusy ? (
            <>
              <Spin indicator={bigLoadingIcon} className="icon" />
              <h4 className="font-bold mb-1">
                {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
              </h4>
              <div className="info-label">Staking {formatThousands(parseFloat(fromCoinAmount), 6)} MEAN</div>
              {transactionStatus.currentOperation === TransactionStatus.SignTransaction && (
                <div className="indication">
                  {t('transactions.status.instructions')}
                </div>
              )}
            </>
          ) : isSuccess() ? (
            <>
              <CheckOutlined style={{ fontSize: 48 }} className="icon" />
              <h4 className="font-bold mb-1 text-uppercase">
                {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
              </h4>
              <p className="operation">
                {formatThousands(parseFloat(fromCoinAmount), 6)} MEAN has been staked successfully
              </p>
              <Button
                block
                type="primary"
                shape="round"
                size="middle"
                onClick={onCloseTransactionExecutionModal}>
                {t('general.cta-finish')}
              </Button>
            </>
          ) : isError() ? (
            <>
              <InfoCircleOutlined style={{ fontSize: 48 }} className="icon" />
              {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
                <h4 className="font-bold mb-3">
                  {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
                </h4>
              ) : (
                <h4 className="font-bold mb-3">
                  {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
                </h4>
              )}
              {transactionStatus.currentOperation === TransactionStatus.SendTransactionFailure ? (
                <div className="row two-col-ctas mt-3">
                  <div className="col-6">
                    <Button
                      block
                      type="text"
                      shape="round"
                      size="middle"
                      onClick={onCloseTransactionExecutionModal}>
                      {t('general.retry')}
                    </Button>
                  </div>
                  <div className="col-6">
                    <Button
                      block
                      type="primary"
                      shape="round"
                      size="middle"
                      onClick={() => refreshPage()}>
                      {t('general.refresh')}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  block
                  type="primary"
                  shape="round"
                  size="middle"
                  onClick={onCloseTransactionExecutionModal}>
                  {t('general.cta-close')}
                </Button>
              )}
            </>
          ) : (
            <>
              <Spin indicator={bigLoadingIcon} className="icon" />
              <h4 className="font-bold mb-4 text-uppercase">{t('transactions.status.tx-wait')}...</h4>
            </>
          )}
        </div>
      </Modal>
    </>
  )
}
