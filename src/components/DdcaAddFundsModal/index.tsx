import React, { useCallback, useContext, useEffect, useMemo } from 'react';
import { useState } from 'react';
import { Button, Col, Modal, Progress, Row } from 'antd';
import { findATokenAddress, getAmountWithSymbol, getTxIxResume, shortenAddress } from '../../middleware/utils';
import { consoleOut, getTransactionStatusForLogs, isLocal, percentage, percentual } from '../../middleware/ui';
import { useTranslation } from 'react-i18next';
import { DdcaClient, DdcaDetails, TransactionFees } from '@mean-dao/ddca';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { useWallet } from '../../contexts/wallet';
import Slider, { SliderMarks } from 'antd/lib/slider';
import { NATIVE_SOL_MINT, WRAPPED_SOL_MINT } from '../../middleware/ids';
import { LoadingOutlined } from '@ant-design/icons';
import { MEAN_TOKEN_LIST } from '../../constants/tokens';
import { AppStateContext } from '../../contexts/appstate';
import { OperationType, TransactionStatus } from '../../models/enums';
import { customLogger } from '../..';
import { TxConfirmationContext } from '../../contexts/transaction-status';
import { getTokenAccountBalanceByAddress } from '../../middleware/accounts';

export const DdcaAddFundsModal = (props: {
  connection: Connection;
  ddcaDetails: DdcaDetails | undefined;
  ddcaTxFees: TransactionFees;
  endpoint: string;
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
  userBalance: number;
}) => {
  const {
    connection,
    ddcaDetails,
    ddcaTxFees,
    endpoint,
    handleClose,
    handleOk,
    isVisible,
    userBalance,
  } = props;
  const { t } = useTranslation('common');
  const { publicKey, wallet } = useWallet();
  const {
    transactionStatus,
    setTransactionStatus,
  } = useContext(AppStateContext);
  const {
    lastSentTxSignature,
    clearTxConfirmationContext,
    startFetchTxSignatureInfo,
  } = useContext(TxConfirmationContext);

  const [rangeMin, setRangeMin] = useState(0);
  const [rangeMax, setRangeMax] = useState(0);
  const [marks, setMarks] = useState<SliderMarks>();
  const [, setRecurrencePeriod] = useState(0);
  const [lockedSliderValue, setLockedSliderValue] = useState(0);
  const [fromTokenBalance, setFromTokenBalance] = useState(0);
  const [usableTokenAmount, setUsableTokenAmount] = useState(0);
  const [fromTokenPercentualAmount, setFromTokenPercentualAmount] = useState(0);
  const [solPercentualAmount, setSolPercentualAmount] = useState(0);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  const fromToken = useMemo(() => MEAN_TOKEN_LIST.find(t => t.address === ddcaDetails?.fromMint), [ddcaDetails]);

  const getModalHeadline = useCallback(() => {
    if (!ddcaDetails) { return ''; }
    return `<span>${t('ddcas.add-funds.headline', {
      fromTokenAmount: getAmountWithSymbol(
        ddcaDetails.amountPerSwap * lockedSliderValue,
        ddcaDetails.fromMint)
    })}</span>`;
  }, [
    lockedSliderValue,
    ddcaDetails,
    t,
  ]);

  const getGasFeeAmount = (): number => {
    return ddcaTxFees.maxBlockchainFee + (ddcaTxFees.maxFeePerSwap * (lockedSliderValue));
  }

  const hasEnoughNativeBalanceForFees = (): boolean => {
    return userBalance >= getGasFeeAmount() ? true : false;
  }

  const getTotalCombinedSolanaAmount = (): number => {
    if (!ddcaDetails) { return 0; }
    const settingAmount = lockedSliderValue * ddcaDetails.amountPerSwap
    return settingAmount + getGasFeeAmount();
  }

  const getMaxRangeFromInterval = (intervalInSeconds: number): number => {
    if (!intervalInSeconds) { return 12; }
    switch (intervalInSeconds) {
      case 86400: // every day
        return 365;
      case 604800:  // week
        return 52;
      case 1209600: // every two weeks
        return 26;
      case 2629750: // every month
        return 12;
      default:
        return 12;
    }
  }

  const getRecurrencePeriod = (): string => {
    let strOut = '';
    if (ddcaDetails) {
      switch (ddcaDetails.intervalInSeconds) {
        case 86400:
          strOut = t('ddca-selector.repeating-daily.recurrence-period');
          break;
        case 604800:
          strOut = t('ddca-selector.repeating-weekly.recurrence-period');
          break;
        case 1209600:
          strOut = t('ddca-selector.repeating-twice-month.recurrence-period');
          break;
        case 2629750:
          strOut = t('ddca-selector.repeating-once-month.recurrence-period');
          break;
        default:
          break;
      }
    }
    return strOut;
  }

  const getTotalPeriod = useCallback((periodValue: number): string => {
    let strOut = '';
    if (ddcaDetails) {
      switch (ddcaDetails.intervalInSeconds) {
        case 86400:
          strOut = `${periodValue} ${t('general.days')}`;
          break;
        case 604800:
          strOut = `${periodValue} ${t('general.weeks')}`;
          break;
        case 1209600:
          strOut = `${periodValue * 2} ${t('general.weeks')}`;
          break;
        case 2629750:
          strOut = `${periodValue} ${t('general.months')}`;
          break;
        default:
          break;
      }
    }
    return strOut;
  }, [
    t,
    ddcaDetails
  ])

  function sliderTooltipFormatter(value?: number) {
    return (
      <>
      <svg className="tooltip-svg" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M9.99999 3.57843C9.58578 3.57843 9.24999 3.24264 9.24999 2.82843C9.24999 2.41422 9.58578 2.07843 9.99999 2.07843H13.5355C13.9497 2.07843 14.2855 2.41422 14.2855 2.82843C14.2855 3.24264 13.9497 3.57843 13.5355 3.57843H9.99999Z" fill="currentColor"/>
        <path d="M6.53033 4.03033C6.82322 4.32323 6.82322 4.7981 6.53033 5.09099L4.03033 7.59099C3.73744 7.88389 3.26256 7.88389 2.96967 7.59099C2.67678 7.2981 2.67678 6.82323 2.96967 6.53033L5.46967 4.03033C5.76256 3.73744 6.23744 3.73744 6.53033 4.03033Z" fill="currentColor"/>
        <path fillRule="evenodd" clipRule="evenodd" d="M12 5.06066C7.30558 5.06066 3.5 8.86624 3.5 13.5607C3.5 18.2551 7.30558 22.0607 12 22.0607C16.6944 22.0607 20.5 18.2551 20.5 13.5607C20.5 8.86624 16.6944 5.06066 12 5.06066ZM16.9909 8.77144C17.1457 8.5724 17.128 8.28922 16.9497 8.11092C16.7714 7.93261 16.4883 7.91498 16.2892 8.06979L13.1153 10.5384L11.0397 12.021C10.6629 12.2901 10.4393 12.7246 10.4393 13.1876C10.4393 13.9794 11.0812 14.6213 11.873 14.6213C12.3361 14.6213 12.7706 14.3977 13.0397 14.0209L14.5223 11.9454L16.9909 8.77144Z" fill="currentColor"/>
      </svg>
      <span className="fg-primary-highlight font-bold">{getTotalPeriod(value || 0)}</span>
      </>
    );
  }

  const isWrappedSol = useCallback((): boolean => {
    return ddcaDetails?.fromMint === WRAPPED_SOL_MINT.toBase58() ? true : false;
  }, [ddcaDetails])

  //////////////////////////
  //   Data Preparation   //
  //////////////////////////

  useEffect(() => {

    (async () => {
      if (ddcaDetails) {
        let balance = 0;
        const selectedTokenAddress = await findATokenAddress(publicKey as PublicKey, new PublicKey(ddcaDetails.fromMint));
        const result = await getTokenAccountBalanceByAddress(connection, selectedTokenAddress);
        if (result) {
          balance = result.uiAmount || 0;
        }
        setFromTokenBalance(balance);
      }
    })();

    return () => { }
  }, [
    publicKey,
    ddcaDetails,
    connection,
  ]);

  useEffect(() => {

    if (ddcaDetails) {
      const maxRangeFromSelection = getMaxRangeFromInterval(ddcaDetails.intervalInSeconds);
      const maxRangeFromBalance = Math.floor(
        isWrappedSol()
          ? (fromTokenBalance + userBalance) / ddcaDetails.amountPerSwap
          : fromTokenBalance / ddcaDetails.amountPerSwap
      );
      const minRangeSelectable = 3;
      const maxRangeSelectable =
        maxRangeFromBalance <= maxRangeFromSelection
          ? Math.max(minRangeSelectable + 10, maxRangeFromBalance)
          : maxRangeFromSelection;
      // Set state
      setRangeMin(minRangeSelectable);
      setRangeMax(maxRangeSelectable);
      const initialValue = Math.floor(percentage(50, maxRangeSelectable));
      const marks: SliderMarks = {
        [minRangeSelectable]: getTotalPeriod(minRangeSelectable),
        [maxRangeSelectable]: getTotalPeriod(maxRangeSelectable)
      };
      setMarks(marks);

      // Set minimum required and valid flag
      const minimumRequired = ddcaDetails.amountPerSwap * (minRangeSelectable + 1);
      const isOpValid = minimumRequired < fromTokenBalance ? true : false;
      let period = 0;
      // Set the slider position
      if (isOpValid) {
        period = initialValue;
      } else {
        period = minRangeSelectable;
      }
      setRecurrencePeriod(period);
    }
  }, [
    ddcaDetails,
    fromTokenBalance,
    userBalance,
    isWrappedSol,
    getTotalPeriod
  ]);

  // Calculate token amount progress bar percentual value
  useEffect(() => {
    if (lockedSliderValue && ddcaDetails) {
      const effectiveTokenAmount = ddcaDetails.amountPerSwap * lockedSliderValue;
      if (effectiveTokenAmount <= fromTokenBalance) {
        setUsableTokenAmount(effectiveTokenAmount);
        const percentualValue = percentual(effectiveTokenAmount, fromTokenBalance);
        setFromTokenPercentualAmount(percentualValue);
      } else {
        setFromTokenPercentualAmount(100);
      }
    }
  }, [
    fromTokenBalance,
    lockedSliderValue,
    ddcaDetails
  ]);

  // Calculate native amount progress bar percentual value
  useEffect(() => {
    if (lockedSliderValue && ddcaDetails && userBalance) {
      const effectiveTokenAmount = ddcaDetails.amountPerSwap * lockedSliderValue;
      if (effectiveTokenAmount > fromTokenBalance) {
        const additionalNativeBalance = effectiveTokenAmount - fromTokenBalance;
        const percentualValue = percentual(additionalNativeBalance, userBalance);
        setSolPercentualAmount(percentualValue);
      } else {
        setSolPercentualAmount(0);
      }
    }
  }, [
    fromTokenBalance,
    lockedSliderValue,
    ddcaDetails,
    userBalance
  ]);

  ////////////////////////
  //  Events & Actions  //
  ////////////////////////

  const onSliderChange = (value?: number) => {
    setRecurrencePeriod(value || 0);
    setLockedSliderValue(value || 0);
  }

  const onFinishedAddFundsTx = () => {
    setIsBusy(false);
    handleOk();
  }

  // Execute Add funds transaction
  const onExecuteAddFundsTx = async () => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTxConfirmationContext();
    setTransactionCancelled(false);
    setIsBusy(true);

    const ddcaClient = new DdcaClient(endpoint, wallet, { commitment: "confirmed" })

    const createTx = async (): Promise<boolean> => {
      if (wallet && publicKey && ddcaDetails) {

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        const ddcaAccountAddress = new PublicKey(ddcaDetails.ddcaAccountAddress);
        const payload = {
          ddcaAccountAddress: ddcaDetails.ddcaAccountAddress,
          swapsCount: lockedSliderValue
        };

        consoleOut('createAddFundsTx params:', payload, 'brown');

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
          inputs: payload
        });

        // Create a transaction
        return await ddcaClient.createAddFundsTx(
          ddcaAccountAddress,
          payload.swapsCount,
          isWrappedSol()
        )
        .then(value => {
          consoleOut('createAddFundsTx returned transaction:', value);
          setTransactionStatus({
            lastOperation: TransactionStatus.InitTransactionSuccess,
            currentOperation: TransactionStatus.SignTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
            result: getTxIxResume(value)
          });
          transaction = value;
          return true;
        })
        .catch(error => {
          console.error('createAddFundsTx error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Add funds to DDCA vault transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Add funds to DDCA vault transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const signTx = async (): Promise<boolean> => {
      if (wallet && publicKey) {
        consoleOut('Signing transaction...');
        return await wallet.signTransaction(transaction)
        .then((signed: Transaction) => {
          consoleOut('signTransaction returned a signed transaction:', signed);
          signedTransaction = signed;
          // Try signature verification by serializing the transaction
          try {
            encodedTx = signedTransaction.serialize().toString('base64');
            consoleOut('encodedTx:', encodedTx, 'orange');
          } catch (error) {
            console.error(error);
            setTransactionStatus({
              lastOperation: TransactionStatus.SignTransaction,
              currentOperation: TransactionStatus.SignTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
              result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
            });
            customLogger.logError('Add funds to DDCA vault transaction failed', { transcript: transactionLog });
            return false;
          }
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
            result: {signer: publicKey.toBase58()}
          });
          return true;
        })
        .catch(error => {
          console.error('Signing transaction failed!');
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransaction,
            currentOperation: TransactionStatus.SignTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
            result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logWarning('Add funds to DDCA vault transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        console.error('Cannot sign transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SignTransaction,
          currentOperation: TransactionStatus.WalletNotFound
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot sign transaction! Wallet not found!'
        });
        customLogger.logError('Add funds to DDCA vault transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const sendTx = async (): Promise<boolean> => {
      if (wallet) {
        return await connection
          .sendEncodedTransaction(encodedTx)
          .then(sig => {
            consoleOut('sendSignedTransaction returned a signature:', sig);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransactionSuccess,
              currentOperation: TransactionStatus.ConfirmTransaction
            });
            signature = sig;
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SendTransactionSuccess),
              result: `signature: ${signature}`
            });
            return true;
          })
          .catch(error => {
            console.error(error);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransaction,
              currentOperation: TransactionStatus.SendTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SendTransactionFailure),
              result: { error, encodedTx }
            });
            customLogger.logError('Add funds to DDCA vault transaction failed', { transcript: transactionLog });
            return false;
          });
      } else {
        console.error('Cannot send transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SendTransaction,
          currentOperation: TransactionStatus.WalletNotFound
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot send transaction! Wallet not found!'
        });
        customLogger.logError('Add funds to DDCA vault transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (wallet && publicKey) {
      const create = await createTx();
      consoleOut('create:', create);
      if (create && !transactionCancelled) {
        const sign = await signTx();
        consoleOut('sign:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            consoleOut('Send Tx to confirmation queue:', signature);
            startFetchTxSignatureInfo(signature, "confirmed", OperationType.DdcaAddFunds);
            onFinishedAddFundsTx();
          } else { onFinishedAddFundsTx(); }
        } else { onFinishedAddFundsTx(); }
      } else { onFinishedAddFundsTx(); }
    }

  };

  ////////////////////
  //   Validation   //
  ////////////////////

  const hasEnoughFromTokenBalance = (): boolean => {
    if (!ddcaDetails) { return false; }

    const settingAmount = lockedSliderValue * ddcaDetails.amountPerSwap
    return fromTokenBalance > settingAmount;
  }

  const isValidSetting = (): boolean => {
    if (!ddcaDetails) { return false; }

    const settingAmount = lockedSliderValue * ddcaDetails.amountPerSwap
    const gasFeeAmount = getGasFeeAmount();

    if (isWrappedSol()) {
      return getTotalCombinedSolanaAmount() <= (userBalance + fromTokenBalance) ? true : false;
    }

    const hasEnoughFromTokenBalance = settingAmount < fromTokenBalance ? true : false;
    return hasEnoughFromTokenBalance && userBalance > gasFeeAmount ? true : false;
  }

  const infoRow = (caption: string, value: string, separator = '≈', route = false) => {
    return (
      <Row>
        <Col span={11} className="text-right">
          {caption}
        </Col>
        <Col span={1} className="text-center fg-secondary-70">
          {separator}
        </Col>
        <Col span={11} className="text-left fg-secondary-70">
          {value}
        </Col>
      </Row>
    );
  };

  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">{t('ddcas.add-funds.modal-title')}</div>}
      footer={null}
      maskClosable={false}
      open={isVisible}
      onCancel={handleClose}
      width={480}>
      <div className="mb-3">
        <div className="ddca-setup-heading" dangerouslySetInnerHTML={{ __html: getModalHeadline() }}></div>
      </div>
      <div className="slider-container">
        <Slider
          marks={marks}
          min={rangeMin}
          max={rangeMax}
          included={false}
          tipFormatter={sliderTooltipFormatter}
          value={lockedSliderValue}
          onChange={onSliderChange}
          tooltipVisible
          dots={false}/>
      </div>
      <div className="flexible-right mb-2">
        <span className="left from-token-balance">Token balance<br />
          {ddcaDetails &&
            getAmountWithSymbol(
              fromTokenBalance,
              ddcaDetails.fromMint
            )
          }
        </span>
        <span className="right pl-3 position-relative">
          <Progress
            percent={fromTokenPercentualAmount}
            status={fromTokenPercentualAmount < 100 ? "success" : "exception"}
            showInfo={true}
          />
          <span className="amount">
            {ddcaDetails &&
              getAmountWithSymbol(
                usableTokenAmount,
                ddcaDetails.fromMint
              )
            }
          </span>
        </span>
      </div>
      {isWrappedSol() && (
        <div className="flexible-right mb-2">
          <span className="left from-token-balance">SOL balance<br />
            {userBalance &&
              getAmountWithSymbol(
                userBalance,
                NATIVE_SOL_MINT.toBase58()
              )
            }
          </span>
          <span className="right pl-3 position-relative">
            <Progress
              percent={solPercentualAmount}
              status={solPercentualAmount < 100 ? "success" : "exception"}
              showInfo={true}
            />
            <span className="amount">
              {ddcaDetails &&
                getAmountWithSymbol(
                  (ddcaDetails.amountPerSwap * lockedSliderValue) - usableTokenAmount,
                  ddcaDetails.fromMint
                )
              }
            </span>
          </span>
        </div>
      )}
      <div className="mb-3">
        <div className="font-bold">{t('ddca-setup-modal.help.how-does-it-work')}</div>
        <ol className="greek">
          <li>
            {ddcaDetails &&
              t('ddca-setup-modal.help.help-item-01-topup', {
                fromTokenAmount: getAmountWithSymbol(
                  ddcaDetails.amountPerSwap * lockedSliderValue,
                  ddcaDetails.fromMint
                )
              })
            }
          </li>
          <li>
            {
              t('ddca-setup-modal.help.help-item-02', {
                recurrencePeriod: getRecurrencePeriod(),
              })
            }
          </li>
          <li>
            {ddcaDetails &&
              t('ddca-setup-modal.help.help-item-03', {
                toTokenSymbol: fromToken ? fromToken.symbol : shortenAddress(ddcaDetails.toMint),
              })
            }
          </li>
        </ol>
      </div>
      {(ddcaDetails && isWrappedSol() && isLocal()) && (
        <div className="mb-3">
          {infoRow(
            'Slider setting',
            getAmountWithSymbol(
              ddcaDetails.amountPerSwap * lockedSliderValue,
              ddcaDetails.fromMint
            )
          )}
          {infoRow(
            'Gas Fees',
            getAmountWithSymbol(
              getGasFeeAmount(),
              NATIVE_SOL_MINT.toBase58()
            )
          )}
          {infoRow(
            'Combined amount',
            getAmountWithSymbol(
              getTotalCombinedSolanaAmount(),
              NATIVE_SOL_MINT.toBase58()
            )
          )}
          {infoRow(
            'Usable token amount',
            getAmountWithSymbol(
              usableTokenAmount,
              NATIVE_SOL_MINT.toBase58()
            )
          )}
        </div>
      )}
      <div className="mt-3">
        <Button
          className={`main-cta ${isBusy ? 'inactive' : ''}`}
          block
          type="primary"
          shape="round"
          size="large"
          disabled={!isValidSetting()}
          onClick={onExecuteAddFundsTx}>
          {isBusy && (<LoadingOutlined className="mr-1" />)}
          {isBusy
            ? t('ddca-setup-modal.cta-label-depositing')
            : lastSentTxSignature
              ? t('general.finished')
              : isWrappedSol()
                ? getTotalCombinedSolanaAmount() > (userBalance + fromTokenBalance)
                  ? `Need at least ${getAmountWithSymbol(getTotalCombinedSolanaAmount() - usableTokenAmount, NATIVE_SOL_MINT.toBase58())}`
                  : t('ddca-setup-modal.cta-label-deposit')
                : !hasEnoughFromTokenBalance()
                  ? t('transactions.validation.amount-low')
                  : !hasEnoughNativeBalanceForFees()
                    ? `Need at least ${getAmountWithSymbol(getGasFeeAmount(), NATIVE_SOL_MINT.toBase58())}`
                    : t('ddca-setup-modal.cta-label-deposit')
          }
        </Button>
      </div>

    </Modal>
  );

};
