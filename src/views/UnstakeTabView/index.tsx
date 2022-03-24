import { useCallback, useContext, useEffect, useState } from "react";
import './style.less';
import { Button } from "antd";
import { useTranslation } from 'react-i18next';
import { TokenDisplay } from "../../components/TokenDisplay";
import { AppStateContext } from "../../contexts/appstate";
import { cutNumber, formatAmount, formatThousands, getAmountWithSymbol, getTxIxResume, isValidNumber } from "../../utils/utils";
import { LoadingOutlined } from "@ant-design/icons";
import { StakingClient } from "@mean-dao/staking";
import { Transaction } from "@solana/web3.js";
import { TransactionStatusContext } from "../../contexts/transaction-status";
import { OperationType, TransactionStatus } from "../../models/enums";
import { consoleOut, getTransactionStatusForLogs } from "../../utils/ui";
import { customLogger } from "../..";
import { useConnection } from "../../contexts/connection";
import { notify } from "../../utils/notifications";
import { useWallet } from "../../contexts/wallet";

export const UnstakeTabView = (props: {
  stakeClient: StakingClient;
}) => {
  const {
    selectedToken,
    tokenBalance,
    effectiveRate,
    loadingPrices,
    fromCoinAmount,
    transactionStatus,
    setTransactionStatus,
    setFromCoinAmount,
    refreshPrices
  } = useContext(AppStateContext);
  const { enqueueTransactionConfirmation } = useContext(TransactionStatusContext);
  const { t } = useTranslation('common');
  const percentages = [25, 50, 75, 100];
  const [percentageValue, setPercentageValue] = useState<number>(0);
  const [meanWorthOfsMean, setMeanWorthOfsMean] = useState<number>(0);
  const [isBusy, setIsBusy] = useState(false);
  const { connected, wallet } = useWallet();
  const connection = useConnection();

  const onChangeValue = (value: number) => {
    setPercentageValue(value);
  };  

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

  const getUnstakeButtonLabel = useCallback(() => {
    return !connected
      ? t('transactions.validation.not-connected')
      : isBusy
        ? `${t("invest.panel-right.tabset.unstake.unstake-button-busy")} ${selectedToken && selectedToken.symbol}`
        : !selectedToken || !tokenBalance
          ? `${t("invest.panel-right.tabset.unstake.unstake-button-unavailable")} ${selectedToken && selectedToken.symbol}`
          : !fromCoinAmount || !isValidNumber(fromCoinAmount) || !parseFloat(fromCoinAmount)
            ? t('transactions.validation.no-amount')
            : parseFloat(fromCoinAmount) > tokenBalance
              ? t('transactions.validation.amount-high')
              : `${t("invest.panel-right.tabset.unstake.unstake-button-available")} ${selectedToken && selectedToken.symbol}`;
  }, [
    fromCoinAmount,
    selectedToken,
    tokenBalance,
    connected,
    isBusy,
    t,
  ]);

  const isUnstakingFormValid = (): boolean => {
    return  fromCoinAmount &&
            parseFloat(fromCoinAmount) > 0 &&
            parseFloat(fromCoinAmount) <= tokenBalance
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
              customLogger.logError("Unstake transaction failed", {
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
            customLogger.logError("Unstake transaction failed", {
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
        customLogger.logError("Unstake transaction failed", {
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
            customLogger.logError("Unstake transaction failed", {
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
        customLogger.logError("Unstake transaction failed", {
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
              completedTitle: "Confirming transaction",
              completedMessage: `Successfully staked ${formatThousands(
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

  // useEffect(() => {
  //   if (!props.stakeClient) {
  //     return;
  //   }

  //   props.stakeClient.getUnstakeQuote(tokenBalance).then((value: any) => {
  //     setUnstakeQuote(value.meanOutUiAmount);
      
  //   }).catch((error: any) => {
  //     console.error(error);
  //   });
    
  // }, [
  //   props.stakeClient,
  //   tokenBalance
  // ]);

  useEffect(() => {
    const getMeanQuote = async (sMEAN: number) => {
      if (!props.stakeClient) {
        return 0;
      }

      try {
        const result = await props.stakeClient.getUnstakeQuote(sMEAN);
        return result.meanOutUiAmount;
      } catch (error) {
        console.error(error);
        return 0;
      }
    }

    if (selectedToken && selectedToken.symbol === "sMEAN") {
      console.log("Token Balance", tokenBalance);
      
      getMeanQuote(tokenBalance).then((value) => {
        console.log("Mean Quote", value);
        
        setMeanWorthOfsMean(value);
      })
    }
  }, [
    props.stakeClient, 
    selectedToken, 
    tokenBalance
  ]);

  useEffect(() => {
    const percentageFromCoinAmount = tokenBalance > 0 ? `${(tokenBalance*percentageValue/100)}` : '';

    setFromCoinAmount(percentageFromCoinAmount);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [percentageValue]);

  return (
    <>
      {/* <span className="info-label">{stakedAmount ? t("invest.panel-right.tabset.unstake.notification-label-one", {stakedAmount: cutNumber(parseFloat(stakedAmount), 6), unstakeStartDate: unstakeStartDate}) : t("invest.panel-right.tabset.unstake.notification-label-one-error")}</span> */}
      <span className="info-label">{tokenBalance ? `You currently have ${cutNumber(tokenBalance, 6)} sMEAN staked which is currently worth ${cutNumber(meanWorthOfsMean, 6)} MEAN` : t("invest.panel-right.tabset.unstake.notification-label-one-error")}</span>
      <div className="form-label mt-2">{t("invest.panel-right.tabset.unstake.amount-label")}</div>
      <div className="well">
        <div className="flexible-right mb-1">
          <div className="token-group">
            {percentages.map((percentage, index) => (
              <div key={index} className="mb-1 d-flex flex-column align-items-center">
                <div className={`token-max simplelink ${tokenBalance !== 0 ? "active" : "disabled"}`} onClick={() => onChangeValue(percentage)}>{percentage}%</div>
              </div>
            ))}
          </div>
        </div>
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
              value={fromCoinAmount}
            />
          </div>
        </div>
        <div className="flex-fixed-right">
          <div className="left inner-label">
            <span>{t('invest.panel-right.tabset.unstake.send-amount.label-right')}:</span>
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
      <span className="info-label">{t("invest.panel-right.tabset.unstake.notification-label-two")}</span>
      
      {/* Confirm that have read the terms and conditions */}
      {/* <div className="mt-2 confirm-terms">
        <Checkbox checked={isVerifiedRecipient} onChange={onIsVerifiedRecipientChange}>{t("invest.panel-right.tabset.unstake.verified-label")}</Checkbox>
        <Tooltip placement="top" title={t("invest.panel-right.tabset.unstake.terms-and-conditions-tooltip")}>
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
          !isUnstakingFormValid()
        }>
        {isBusy && (<span className="mr-1"><LoadingOutlined style={{ fontSize: '16px' }} /></span>)}
        {getUnstakeButtonLabel()}
      </Button>
    </>
  )
}
