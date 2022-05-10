import { useCallback, useContext, useEffect, useState } from "react";
import './style.scss';
import { Button, Modal, Spin } from "antd";
import { useTranslation } from 'react-i18next';
import { TokenDisplay } from "../../components/TokenDisplay";
import { AppStateContext } from "../../contexts/appstate";
import { cutNumber, formatThousands, getAmountWithSymbol, getTxIxResume, isValidNumber } from "../../utils/utils";
import { CheckOutlined, InfoCircleOutlined, LoadingOutlined } from "@ant-design/icons";
import { StakingClient, UnstakeQuote } from "@mean-dao/staking";
import { Transaction } from "@solana/web3.js";
import { TxConfirmationContext } from "../../contexts/transaction-status";
import { OperationType, TransactionStatus } from "../../models/enums";
import { consoleOut, getTransactionModalTitle, getTransactionOperationDescription, getTransactionStatusForLogs } from "../../utils/ui";
import { customLogger } from "../..";
import { useConnection } from "../../contexts/connection";
import { useWallet } from "../../contexts/wallet";
import { TokenInfo } from "@solana/spl-token-registry";
import { INPUT_DEBOUNCE_TIME } from "../../constants";
import { AppUsageEvent, SegmentUnstakeMeanData } from "../../utils/segment-service";
import { segmentAnalytics } from "../../App";
import { openNotification } from "../../components/Notifications";

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;
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
    setTransactionStatus,
    refreshPrices
  } = useContext(AppStateContext);
  const { enqueueTransactionConfirmation } = useContext(TxConfirmationContext);
  const { t } = useTranslation('common');
  const percentages = ["25", "50", "75", "100"];
  const [fromCoinAmount, setFromCoinAmount] = useState<string>('');
  const [percentageValue, setPercentageValue] = useState<string>('');
  const [meanWorthOfsMean, setMeanWorthOfsMean] = useState<number>(0);
  const [unstakeMeanValue, setUnstakeMeanValue] = useState<string>();
  const [canFetchUnstakeQuote, setCanFetchUnstakeQuote] = useState(false);
  const [sMeanToMeanRate, setSMeanToMeanRate] = useState(0);
  const [meanPrice, setMeanPrice] = useState<number>(0);
  const [isBusy, setIsBusy] = useState(false);
  const { connected, wallet } = useWallet();
  const connection = useConnection();

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
    setPercentageValue("");
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
        ? `${t("invest.panel-right.tabset.unstake.unstake-button-busy")} ${props.selectedToken && props.selectedToken.symbol}`
        : !props.selectedToken || !props.tokenBalance
          ? `${t("invest.panel-right.tabset.unstake.unstake-button-unavailable")} ${props.selectedToken && props.selectedToken.symbol}`
          : !fromCoinAmount || !isValidNumber(fromCoinAmount) || !parseFloat(fromCoinAmount)
            ? t('transactions.validation.no-amount')
            : parseFloat(fromCoinAmount) > props.tokenBalance
              ? t('transactions.validation.amount-high')
              : `${t("invest.panel-right.tabset.unstake.unstake-button-available")} ${props.selectedToken && props.selectedToken.symbol}`;
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

  const onTransactionStart = useCallback(async () => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature = "";
    let encodedTx: string;
    const transactionLog: any[] = [];

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
          quote: parseFloat(unstakeMeanValue || '0')
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

    const signTx = async (): Promise<boolean> => {
      if (wallet) {
        consoleOut("Signing transaction...");
        const miamia = transaction.serialize({ verifySignatures: false, requireAllSignatures: false }).toString("base64");
        consoleOut("encodedTx before sending:", miamia, "orange");
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
              segmentAnalytics.recordEvent(AppUsageEvent.UnstakeMeanFailed, { transcript: transactionLog });
              return false;
            }
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransaction,
              currentOperation: TransactionStatus.SignTransactionSuccess,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(
                TransactionStatus.SignTransactionSuccess
              ),
              result: { signer: wallet.publicKey.toBase58() },
            });
            segmentAnalytics.recordEvent(AppUsageEvent.UnstakeMeanSigned, {
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
                signer: `${wallet.publicKey.toBase58()}`,
                error: `${error}`,
              },
            });
            customLogger.logError("Unstake transaction failed", {transcript: transactionLog});
            segmentAnalytics.recordEvent(AppUsageEvent.UnstakeMeanFailed, { transcript: transactionLog });
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
        customLogger.logError("Unstake transaction failed", {transcript: transactionLog});
        segmentAnalytics.recordEvent(AppUsageEvent.UnstakeMeanFailed, { transcript: transactionLog });
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
            setIsBusy(false);
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
    meanPrice,
    connection,
    fromCoinAmount,
    sMeanToMeanRate,
    unstakeMeanValue,
    props.stakeClient,
    props.selectedToken,
    transactionStatus.currentOperation,
    enqueueTransactionConfirmation,
    showTransactionExecutionModal,
    setTransactionStatus,
    t
  ]);

  const getPricePerToken = useCallback((token: TokenInfo): number => {
    if (!token || !coinPrices) { return 0; }

    return coinPrices && coinPrices[token.symbol]
      ? coinPrices[token.symbol]
      : 0;
  }, [coinPrices])

  // Keep MEAN price updated
  useEffect(() => {

    if (coinPrices && props.unstakedToken) {
      const price = getPricePerToken(props.unstakedToken);
      consoleOut('meanPrice:', price, 'crimson');
      console.log('coinPrices:', coinPrices);
      setMeanPrice(price);
    }

  }, [coinPrices, getPricePerToken, props.unstakedToken]);

  // Handler paste clipboard data
  const pasteHandler = useCallback((e: any) => {
    const getClipBoardData = e.clipboardData.getData('Text');
    const replaceCommaToDot = getClipBoardData.replace(",", "")
    const onlyNumbersAndDot = replaceCommaToDot.replace(/[^.\d]/g, '');

    setFromCoinAmount(onlyNumbersAndDot.trim());
    setCanFetchUnstakeQuote(true);
  }, []);

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
    const percentageFromCoinAmount = props.tokenBalance > 0 ? `${(props.tokenBalance*parseFloat(percentageValue)/100).toFixed(props.selectedToken?.decimals || 6)}` : '';

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

  return (
    <>
      <div className="mb-2 px-1">
        <span className="info-label">
          {
            props.tokenBalance
              ? (
                <span>You have {cutNumber(props.tokenBalance, 6)} sMEAN staked{meanWorthOfsMean ? ` which is currently worth ${cutNumber(meanWorthOfsMean, 6)} MEAN.` : '.'}</span>
              )
              : t("invest.panel-right.tabset.unstake.notification-label-one-error")
          }
        </span>
      </div>
      <div className="form-label mt-2">{t("invest.panel-right.tabset.unstake.amount-label")}</div>
      <div className="well">
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
            <span>{t('invest.panel-right.tabset.unstake.send-amount.label-right')}:</span>
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
              <div className="info-label">Unstaking {formatThousands(parseFloat(fromCoinAmount), 6)} sMEAN</div>
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
                {unstakeMeanValue && (
                  t("invest.panel-right.tabset.unstake.success-transaction-message", {sMeanValue: formatThousands(parseFloat(fromCoinAmount), 6), meanValue: formatThousands(parseFloat(unstakeMeanValue), 6)})
                )}
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
