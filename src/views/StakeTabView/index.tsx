import { useCallback, useContext, useEffect, useState } from "react";
import './style.less';
import { CheckOutlined, LoadingOutlined,  } from "@ant-design/icons";
import { Button, Modal } from "antd";
import moment from 'moment';
import { useTranslation } from 'react-i18next';
import { TokenDisplay } from "../../components/TokenDisplay";
import { useWallet } from "../../contexts/wallet";
import { AppStateContext } from "../../contexts/appstate";
import { formatAmount, formatThousands, getAmountWithSymbol, getTxIxResume, isValidNumber } from "../../utils/utils";
import { DebounceInput } from "react-debounce-input";
import { StakeQuote, StakingClient } from "@mean-dao/staking";
import { Transaction } from "@solana/web3.js";
import { TransactionStatusContext } from "../../contexts/transaction-status";
import { OperationType, TransactionStatus } from "../../models/enums";
import { consoleOut, getTransactionStatusForLogs } from "../../utils/ui";
import { customLogger } from "../..";
import { useConnection } from "../../contexts/connection";
import { notify } from "../../utils/notifications";

export const StakeTabView = (props: {
  stakeClient: StakingClient;
}) => {
  const {
    stakedAmount,
    tokenBalance,
    selectedToken,
    effectiveRate,
    loadingPrices,
    fromCoinAmount,
    paymentStartDate,
    transactionStatus,
    setIsVerifiedRecipient,
    setTransactionStatus,
    setUnstakeStartDate,
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
  const [stakeQuote, setStakeQuote] = useState<StakeQuote>();

  // Transaction execution modal
  const [isTransactionModalVisible, setTransactionModalVisible] = useState(false);
  const showTransactionModal = useCallback(() => setTransactionModalVisible(true), []);
  const closeTransactionModal = useCallback(() => setTransactionModalVisible(false), []);

  const handleFromCoinAmountChange = (e: any) => {
    const newValue = e.target.value;
    if (newValue === null || newValue === undefined || newValue === "") {
      setFromCoinAmount("");
    } else if (newValue === '.') {
      setFromCoinAmount(".");
    } else if (isValidNumber(newValue)) {
      setFromCoinAmount(newValue);
    }
  };

  const isSendAmountValid = (): boolean => {
    return  connected &&
            selectedToken &&
            tokenBalance &&
            fromCoinAmount &&
            parseFloat(fromCoinAmount) > 0 &&
            parseFloat(fromCoinAmount) <= tokenBalance
      ? true
      : false;
  }

  const areSendAmountSettingsValid = (): boolean => {
    return paymentStartDate && isSendAmountValid() ? true : false;
  }  

  const onIsVerifiedRecipientChange = (e: any) => {
    setIsVerifiedRecipient(e.target.checked);
  }

  const onAfterTransactionModalClosed = () => {
    const unstakeAmountAfterTransaction = !stakedAmount ? fromCoinAmount : `${parseFloat(stakedAmount) + parseFloat(fromCoinAmount)}`;

    setStakedAmount(unstakeAmountAfterTransaction);
    setFromCoinAmount("");
    setIsVerifiedRecipient(false);
    closeTransactionModal();
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
              lastOperation: TransactionStatus.SignTransactionSuccess,
              currentOperation: TransactionStatus.SendTransaction,
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
              lastOperation: TransactionStatus.SendTransactionSuccess,
              currentOperation: TransactionStatus.ConfirmTransaction,
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
              lastOperation: TransactionStatus.SendTransaction,
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

    if (wallet && selectedToken) {
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
            enqueueTransactionConfirmation({
              signature: signature,
              operationType: OperationType.Stake,
              finality: "confirmed",
              txInfoFetchStatus: "fetching",
              notificationTitle: "Confirming transaction",
              notificationMessage: `Successfully staked ${formatThousands(
                parseFloat(fromCoinAmount),
                selectedToken.decimals
              )} ${selectedToken.symbol}`,
            });
            setIsBusy(false);
            setFromCoinAmount("");
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
    selectedToken,
    fromCoinAmount,
    props.stakeClient,
    transactionStatus.currentOperation,
    enqueueTransactionConfirmation,
    setTransactionStatus,
    setFromCoinAmount,
    t,
  ]);

  // const onChangeValue = (value: number, time: string, rate: number) => {
  //   setPeriodValue(value);
  //   setPeriodTime(time);
  //   setStakingMultiplier(rate);
  // }

  useEffect(() => {
    if (!props.stakeClient) {
      return;
    }

    props.stakeClient.getStakeQuote(parseFloat(stakedAmount)).then((value: any) => {
      setStakeQuote(value.meanInUiAmount);
    }).catch((error: any) => {
      console.error(error);
    });

  }, [
    props.stakeClient,
    stakedAmount
  ]);

  useEffect(() => {
    const unstakeStartDateUpdate = moment().add(periodValue, periodValue === 1 ? "year" : periodValue === 4 ? "years" : "days").format("LL")

    setUnstakeStartDate(unstakeStartDateUpdate);
  }, [periodTime, periodValue, setUnstakeStartDate]);

  return (
    <>
      <div className="form-label">{t("invest.panel-right.tabset.stake.amount-label")}</div>
      <div className="well">
        <div className="flex-fixed-left">
          <div className="left">
            <span className="add-on simplelink">
              {selectedToken && (
                <TokenDisplay onClick={() => {}}
                  mintAddress={selectedToken.address}
                  name={selectedToken.name}
                />
              )}
            </span>
          </div>
          <div className="right">
            <DebounceInput
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
              debounceTimeout={400}
              spellCheck="false"
              value={fromCoinAmount}
            />
          </div>
        </div>
        <div className="flex-fixed-right">
          <div className="left inner-label">
            <span>{t('transactions.send-amount.label-right')}:</span>
            <span>
              {`${tokenBalance && selectedToken
                  ? getAmountWithSymbol(tokenBalance, selectedToken?.address, true)
                  : "0"
              }`}
            </span>
          </div>
          <div className="right inner-label">
            <span className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'} onClick={() => refreshPrices()}>
              ~${fromCoinAmount && effectiveRate
                ? formatAmount(parseFloat(fromCoinAmount) * effectiveRate, 2)
                : "0.00"}
            </span>
          </div>
        </div>
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
          !areSendAmountSettingsValid()
        }>
        {isBusy && (<span className="mr-1"><LoadingOutlined style={{ fontSize: '16px' }} /></span>)}
        {
          isBusy
            ? t("invest.panel-right.tabset.stake.stake-button-busy")
            : t("invest.panel-right.tabset.stake.stake-button")
        }
        {` ${selectedToken && selectedToken.symbol}`}
      </Button>

      {/* Transaction execution modal */}
      <Modal
        className="mean-modal no-full-screen"
        maskClosable={false}
        visible={isTransactionModalVisible}
        onCancel={closeTransactionModal}
        afterClose={onAfterTransactionModalClosed}
        width={330}
        footer={null}>
        <div className="transaction-progress"> 
          <CheckOutlined style={{ fontSize: 48 }} className="icon" />
          <h4 className="font-bold mb-1 text-uppercase">
            Operation completed
          </h4>
          <p className="operation">
            {fromCoinAmount} MEAN has been staked successfully
          </p>
          <Button
            block
            type="primary"
            shape="round"
            size="middle"
            onClick={closeTransactionModal}>
            {t('general.cta-close')}
          </Button>
        </div>
      </Modal>
    </>
  )
}