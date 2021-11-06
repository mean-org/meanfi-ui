import React, { useCallback, useEffect, useState } from 'react';
import { Button, Modal, Slider } from "antd";
import { useContext } from "react";
import { AppStateContext } from "../../contexts/appstate";
import { useTranslation } from "react-i18next";
import { DcaInterval } from '../../models/ddca-models';
import { consoleOut, getTransactionStatusForLogs, percentage } from '../../utils/ui';
import { TokenInfo } from '@solana/spl-token-registry';
import { getTokenAmountAndSymbolByTokenAddress } from '../../utils/utils';
import "./style.less";
import { SliderMarks } from 'antd/lib/slider';
import { IconShield } from '../../Icons';
import { InfoIcon } from '../InfoIcon';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { useWallet } from '../../contexts/wallet';
import { NATIVE_SOL_MINT } from '../../utils/ids';
import { environment } from '../../environments/environment';
import { OperationType, TransactionStatus } from '../../models/enums';
import { customLogger } from '../..';
import { DdcaClient, TransactionFees } from '@mean-dao/ddca';
import { LoadingOutlined } from '@ant-design/icons';
import { HlaInfo } from '@mean-dao/hybrid-liquidity-ag/lib/types';
import { notify } from '../../utils/notifications';
import { TransactionStatusContext } from '../../contexts/transaction-status';

export const DdcaSetupModal = (props: {
  endpoint: string;
  connection: Connection;
  fromToken: TokenInfo | undefined;
  fromTokenBalance: number;
  fromTokenAmount: number;
  toToken: TokenInfo | undefined;
  handleClose: any;
  handleOk: any;
  onAfterClose: any;
  isVisible: boolean;
  userBalance: number;
  ddcaTxFees: TransactionFees;
  slippage: number;
  hlaInfo: HlaInfo;
}) => {
  const { t } = useTranslation("common");
  const { publicKey, wallet } = useWallet();
  // Transaction control
  const {
    ddcaOption,
    transactionStatus,
    setTransactionStatus,
  } = useContext(AppStateContext);
  const {
    setRecentlyCreatedVault,
    startFetchTxSignatureInfo
  } = useContext(TransactionStatusContext);
  const [isBusy, setIsBusy] = useState(false);
  const [rangeMin, setRangeMin] = useState(0);
  const [rangeMax, setRangeMax] = useState(0);
  const [marks, setMarks] = useState<SliderMarks>();
  const [vaultCreated, setVaultCreated] = useState(false);
  const [swapExecuted, setSwapExecuted] = useState(false);
  const [recurrencePeriod, setRecurrencePeriod] = useState(0);
  const [lockedSliderValue, setLockedSliderValue] = useState(0);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [ddcaAccountPda, setDdcaAccountPda] = useState<PublicKey | undefined>();
  const [lockedFromTokenBalance, setLockedFromTokenBalance] = useState<number | undefined>(undefined);

  // Set lockedFromTokenBalance from injected props.fromTokenBalance once por modal open
  useEffect(() => {
    if (!lockedFromTokenBalance) {
      setLockedFromTokenBalance(props.fromTokenBalance);
    }
  }, [
    lockedFromTokenBalance,
    props.fromTokenBalance
  ]);

  const isProd = (): boolean => {
    return environment === 'production';
  }

  const getGasFeeAmount = (): number => {
    return props.ddcaTxFees.maxBlockchainFee + (props.ddcaTxFees.maxFeePerSwap * (lockedSliderValue + 1));
  }

  const hasEnoughNativeBalanceForFees = (): boolean => {
    return props.userBalance >= getGasFeeAmount() ? true : false;
  }

  const getTotalSolAmount = (): number => {
    const depositAmount = props.fromTokenAmount * (lockedSliderValue + 1);
    return depositAmount + getGasFeeAmount();
  }

  const isNative = (): boolean => {
    return props.fromToken && props.fromToken.symbol === 'SOL' ? true : false;
  }

  const getInterval = (): number => {
    switch (ddcaOption?.dcaInterval) {
      case DcaInterval.RepeatingDaily:
        return 86400;
      case DcaInterval.RepeatingWeekly:
        return 604800;
      case DcaInterval.RepeatingTwiceMonth:
        return 1209600;
      case DcaInterval.RepeatingOnceMonth:
        return 2592000;
      default:
        return 0;
    }
  }

  const getRecurrencePeriod = (): string => {
    let strOut = '';
    switch (ddcaOption?.dcaInterval) {
      case DcaInterval.RepeatingDaily:
        strOut = t('ddca-selector.repeating-daily.recurrence-period');
        break;
      case DcaInterval.RepeatingWeekly:
        strOut = t('ddca-selector.repeating-weekly.recurrence-period');
        break;
      case DcaInterval.RepeatingTwiceMonth:
        strOut = t('ddca-selector.repeating-twice-month.recurrence-period');
        break;
      case DcaInterval.RepeatingOnceMonth:
        strOut = t('ddca-selector.repeating-once-month.recurrence-period');
        break;
      default:
        break;
    }
    return strOut;
  }

  const getTotalPeriod = useCallback((periodValue: number): string => {
    let strOut = '';
    switch (ddcaOption?.dcaInterval) {
      case DcaInterval.RepeatingDaily:
        strOut = `${periodValue} ${t('general.days')}`;
        break;
      case DcaInterval.RepeatingWeekly:
        strOut = `${periodValue} ${t('general.weeks')}`;
        break;
      case DcaInterval.RepeatingTwiceMonth:
        strOut = `${periodValue * 2} ${t('general.weeks')}`;
        break;
      case DcaInterval.RepeatingOnceMonth:
        strOut = `${periodValue} ${t('general.months')}`;
        break;
      default:
        break;
    }
    return strOut;
  }, [
    t,
    ddcaOption?.dcaInterval
  ])

  const getModalHeadline = () => {
    // Buy 100 USDC worth of SOL every week ,for 6 weeks, starting today.
    // Buy {{fromTokenAmount}} worth of {{toTokenSymbol}} {{recurrencePeriod}} for {{totalPeriod}}, starting today.
    return `<span>${t('ddca-setup-modal.headline', {
      fromTokenAmount: getTokenAmountAndSymbolByTokenAddress(props.fromTokenAmount, props.fromToken?.address as string),
      toTokenSymbol: props.toToken?.symbol,
      recurrencePeriod: getRecurrencePeriod(),
      totalPeriod: getTotalPeriod(lockedSliderValue)
    })}</span>`;
  }

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

  const hasEnoughFromTokenBalance = (): boolean => {
    return (lockedFromTokenBalance || 0) > props.fromTokenAmount * (lockedSliderValue + 1);
  }

  //////////////////////////
  //   Data Preparation   //
  //////////////////////////

  /**
   * Set values for rangeMin, rangeMax and recurrencePeriod
   * 
   * var maxRangeFromSelection = daily->365 | weekly->52 | by-weekly -> 26 | monthly -> 12
   * var maxRangeFromBalance = fromTokenBalance/fromInputAmount;
   * var minRangeSelectable = 3 weeks;
   * var maxRangeSelectable = maxRangeFromBalance <= maxRangeFromSelection
   *     ? max(minRangeSelectable + 10, maxRangeFromBalance)
   *     : maxRangeFromSelection;
   * MAX = "[maxRangeSelectable] [range]"
   * Set minimum required and valid flag
  */
  useEffect(() => {
    if (ddcaOption && props.fromTokenAmount && lockedFromTokenBalance) {
      const maxRangeFromSelection =
        ddcaOption.dcaInterval === DcaInterval.RepeatingDaily
          ? 365
          : ddcaOption.dcaInterval === DcaInterval.RepeatingWeekly
          ? 52
          : ddcaOption.dcaInterval === DcaInterval.RepeatingTwiceMonth
          ? 26
          : 12;
      const maxRangeFromBalance = Math.floor(lockedFromTokenBalance / props.fromTokenAmount);
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
      const minimumRequired = props.fromTokenAmount * (minRangeSelectable + 1);
      const isOpValid = minimumRequired < lockedFromTokenBalance ? true : false;

      // Set the slider position
      if (isOpValid) {
        setRecurrencePeriod(initialValue);
      } else {
        setRecurrencePeriod(minRangeSelectable);
      }

      consoleOut('HLA INFO', props.hlaInfo, 'blue');
      consoleOut('remainingAccounts', props.hlaInfo.remainingAccounts.map(a => a.pubkey.toBase58()), 'blue');
    }
  }, [
    ddcaOption,
    props.fromTokenAmount,
    lockedFromTokenBalance,
    props.hlaInfo,
    getTotalPeriod
  ]);

  ////////////////
  //   Events   //
  ////////////////

  const onSliderChange = (value?: number) => {
    setRecurrencePeriod(value || 0);
    setLockedSliderValue(value || 0);
  }

  const onTxErrorCreatingVaultWithNotify = () => {
    notify({
      message: t('notifications.error-title'),
      description: t('notifications.error-creating-vault-message'),
      type: "error"
    });
    setIsBusy(false);
  }

  const onFinishedSwapTx = () => {
    setIsBusy(false);
    setSwapExecuted(true);
    props.handleOk();
  }

  const onOperationCancel = () => {
    if (isBusy) {
      setTransactionCancelled(true);
    }
    props.handleClose();
  }

  const onOperationSuccess = () => {
    props.handleOk();
  }

  // Create vault and deposit
  const onCreateVaultTxStart = async () => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    const transactionLog: any[] = [];

    setLockedSliderValue(recurrencePeriod);
    setRecentlyCreatedVault('')
    setDdcaAccountPda(undefined);
    setVaultCreated(false);
    setSwapExecuted(false);
    setTransactionCancelled(false);
    setIsBusy(true);

    const ddcaClient = new DdcaClient(props.endpoint, wallet, { commitment: "confirmed" })

    const createTx = async (): Promise<boolean> => {
      if (wallet) {

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        const payload = {
          ownerAccountAddress: publicKey,
          amountPerSwap: props.fromTokenAmount,
          fromMint: new PublicKey(props.fromToken?.address as string),
          toMint: new PublicKey(props.toToken?.address as string),
          intervalinSeconds: getInterval(),
          totalSwaps: recurrencePeriod + 1
        }

        consoleOut('ddca params:', payload, 'brown');

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
          inputs: payload
        });

        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
          result: ''
        });

        // Create a transaction
        return await ddcaClient.createDdcaTx(
          payload.fromMint,
          payload.toMint,
          payload.amountPerSwap,
          payload.totalSwaps,
          payload.intervalinSeconds)
        .then((value: [PublicKey, Transaction]) => {
          consoleOut('createDdca returned transaction:', value);
          setTransactionStatus({
            lastOperation: TransactionStatus.InitTransactionSuccess,
            currentOperation: TransactionStatus.SignTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
            result: ''
          });
          setDdcaAccountPda(value[0]);
          transaction = value[1];
          return true;
        })
        .catch(error => {
          console.error('createDdca error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('DDCA Create vault transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('DDCA Create vault transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const signTx = async (): Promise<boolean> => {
      if (wallet) {
        consoleOut('Signing transaction...');
        return await wallet.signTransaction(transaction)
        .then((signed: Transaction) => {
          consoleOut('signTransaction returned a signed transaction:', signed);
          signedTransaction = signed;
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
            result: `Signer: ${wallet.publicKey.toBase58()}`
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
            result: `Signer: ${wallet.publicKey.toBase58()}\n${error}`
          });
          customLogger.logError('DDCA Create vault transaction failed', { transcript: transactionLog });
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
        customLogger.logError('DDCA Create vault transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const sendTx = async (): Promise<boolean> => {
      let encodedTx: Buffer;
      try {
        encodedTx = signedTransaction.serialize();
      } catch (error) {
        throw new Error("Transaction serialization error");
      }
      if (wallet) {
        return await props.connection
          .sendRawTransaction(encodedTx)
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
            customLogger.logError('DDCA Create vault transaction failed', { transcript: transactionLog });
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
        customLogger.logError('DDCA Create vault transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const confirmTx = async (): Promise<boolean> => {

      return await props.connection
        .confirmTransaction(signature, "finalized")
        .then(result => {
          consoleOut('confirmTransaction result:', result);
          if (result && result.value && !result.value.err) {
            setTransactionStatus({
              lastOperation: TransactionStatus.ConfirmTransactionSuccess,
              currentOperation: TransactionStatus.ConfirmTransactionSuccess
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.ConfirmTransactionSuccess),
              result: result.value
            });
            return true;
          } else {
            setTransactionStatus({
              lastOperation: TransactionStatus.ConfirmTransaction,
              currentOperation: TransactionStatus.ConfirmTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.ConfirmTransactionFailure),
              result: signature
            });
            customLogger.logError('DDCA Create vault transaction failed', { transcript: transactionLog });
            return false;
          }
        })
        .catch(e => {
          setTransactionStatus({
            lastOperation: TransactionStatus.ConfirmTransaction,
            currentOperation: TransactionStatus.ConfirmTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.ConfirmTransactionFailure),
            result: signature
          });
          customLogger.logError('DDCA Create vault transaction failed', { transcript: transactionLog });
          return false;
        });
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
            const confirmed = await confirmTx();
            if (confirmed && !transactionCancelled) {
              setRecentlyCreatedVault(ddcaAccountPda?.toBase58() || '');
              setVaultCreated(true);
              setIsBusy(false);
            } else { onTxErrorCreatingVaultWithNotify(); }
          } else { onTxErrorCreatingVaultWithNotify(); }
        } else { onTxErrorCreatingVaultWithNotify(); }
      } else { onTxErrorCreatingVaultWithNotify(); }
    }

  };

  // Exec first swap
  const onSpawnSwapTxStart = async () => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    const transactionLog: any[] = [];

    setSwapExecuted(false);
    setTransactionCancelled(false);
    setIsBusy(true);

    const ddcaClient = new DdcaClient(props.endpoint, wallet, { commitment: "confirmed" })

    const createTx = async (): Promise<boolean> => {
      if (wallet && publicKey && ddcaAccountPda) {

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        const swapPayload = {
          ddcaAccountPda: ddcaAccountPda,
          hlaInfo: props.hlaInfo
        };

        consoleOut('ddca swap params:', swapPayload, 'brown');

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
          inputs: swapPayload
        });

        // Create a transaction
        return await ddcaClient.createWakeAndSwapTx(
          ddcaAccountPda,
          props.hlaInfo
        )
        .then(value => {
          consoleOut('createWakeAndSwapTx returned transaction:', value);
          setTransactionStatus({
            lastOperation: TransactionStatus.InitTransactionSuccess,
            currentOperation: TransactionStatus.SignTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
            result: 'createWakeAndSwapTx succeeded'
          });
          transaction = value;
          return true;
        })
        .catch(error => {
          console.error('createWakeAndSwapTx error:', error);
          const parsedError = ddcaClient.tryParseRpcError(error);
          consoleOut('tryParseRpcError -> createWakeAndSwapTx', parsedError, 'red');
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Recurring scheduled exchange transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Recurring scheduled exchange transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const signTx = async (): Promise<boolean> => {
      if (wallet) {
        consoleOut('Signing transaction...');
        return await wallet.signTransaction(transaction)
        .then((signed: Transaction) => {
          consoleOut('signTransaction returned a signed transaction:', signed);
          signedTransaction = signed;
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
            result: `Signer: ${wallet.publicKey.toBase58()}`
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
            result: `Signer: ${wallet.publicKey.toBase58()}\n${error}`
          });
          customLogger.logError('DDCA Create vault transaction failed', { transcript: transactionLog });
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
        customLogger.logError('DDCA Create vault transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const sendTx = async (): Promise<boolean> => {
      const encodedTx = signedTransaction.serialize().toString('base64');
      if (wallet) {
        return await props.connection
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
            console.error('createWakeAndSwapTx -> sendSignedTransaction error:', error);
            const parsedError = ddcaClient.tryParseRpcError(error);
            consoleOut('tryParseRpcError -> createWakeAndSwapTx -> sendSignedTransaction', parsedError, 'red');
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransaction,
              currentOperation: TransactionStatus.SendTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SendTransactionFailure),
              result: { error, encodedTx }
            });
            customLogger.logError('DDCA Create vault transaction failed', { transcript: transactionLog });
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
        customLogger.logError('DDCA Create vault transaction failed', { transcript: transactionLog });
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
            startFetchTxSignatureInfo(signature, "finalized", OperationType.Create);
            onFinishedSwapTx();
          } else { onFinishedSwapTx(); }
        } else { onFinishedSwapTx(); }
      } else { onFinishedSwapTx(); }
    }

  };

  ///////////////////
  //   Rendering   //
  ///////////////////

  // Info items will draw inside the popover
  const importantNotesPopoverContent = () => {
    return (
      <>
        <div className="font-bold">{t('ddca-setup-modal.notes.notes-title')}</div>
        <ol className="greek small">
          <li>{t('ddca-setup-modal.notes.note-item-01')}</li>
          <li>{t('ddca-setup-modal.notes.note-item-02')}</li>
          <li>{t('ddca-setup-modal.notes.note-item-03')}</li>
        </ol>
      </>
    );
  }

  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">{t('ddca-setup-modal.modal-title')}</div>}
      footer={null}
      maskClosable={false}
      visible={props.isVisible}
      onCancel={onOperationCancel}
      afterClose={props.onAfterClose}
      width={480}>
      <div className="mb-3">
        <div className="ddca-setup-heading" dangerouslySetInnerHTML={{ __html: getModalHeadline() }}></div>
      </div>
      <div className="slider-container">
        <Slider
          disabled={isBusy || vaultCreated}
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
      <div className="mb-3">
        <div className="font-bold">{t('ddca-setup-modal.help.how-does-it-work')}</div>
        <ol className="greek">
          <li>
            {
              t('ddca-setup-modal.help.help-item-01', {
                fromTokenAmount: getTokenAmountAndSymbolByTokenAddress(
                  props.fromTokenAmount * (lockedSliderValue + 1),
                  props.fromToken?.address as string)
              })
            }
          </li>
          <li>
            {
              t('ddca-setup-modal.help.help-item-02', {
                lockedSliderValue: getRecurrencePeriod(),
              })
            }
          </li>
          <li>
            {
              t('ddca-setup-modal.help.help-item-03', {
                toTokenSymbol: props.toToken?.symbol,
              })
            }
          </li>
        </ol>
      </div>
      <div className="mb-2 text-center">
        <span className="yellow-pill">
          <InfoIcon trigger="click" content={importantNotesPopoverContent()} placement="top">
            <IconShield className="mean-svg-icons"/>
          </InfoIcon>
          <span>{t('ddca-setup-modal.notes.note-item-01')}</span>
        </span>
      </div>
      <div className="row two-col-ctas">
        <div className="col-6">
          {/**
           * repetitions = sliderPosition + 1
           * nativeFees = maxBlockchainFee + (maxFeePerSwap * repetitions)
           * 
           * IF fromToken !== SOL
           *   setting  = fromTokenAmount * repetitions
           *   disabled = fromTokenBalance < setting || userNativeBalance < nativeFees
           *   buttonLabel = !enoughFromTokenBalance
           *                   ? 'Need at least {{setting}}'
           *                   : !enoughUserNativeBalance
           *                     ? 'Need at least {{nativeFees}}'
           *                     : 'Deposit'
           * 
           * IF fromToken  === SOL
           *   setting  = fromTokenAmount * repetitions
           *   disabled = userNativeBalance < (setting + nativeFees)
           *   buttonLabel = userNativeBalance < (setting + nativeFees)
           *                   ? 'Need at least {{setting + nativeFees}}'
           *                   : 'Deposit'
           */}
          <Button
            className={`main-cta ${!vaultCreated && isBusy ? 'inactive' : vaultCreated ? 'completed' : ''}`}
            block
            type="primary"
            shape="round"
            size="large"
            disabled={!isProd() ||
              (isNative() && props.userBalance < getTotalSolAmount()) ||
              (!isNative() && !hasEnoughFromTokenBalance())
            }
            onClick={() => onCreateVaultTxStart()}>
            {
              !vaultCreated && isBusy
                ? t('ddca-setup-modal.cta-label-depositing')
                : vaultCreated
                ? t('ddca-setup-modal.cta-label-vault-created')
                : isNative()
                  ? getTotalSolAmount() > props.userBalance
                      ? `Need at least ${getTokenAmountAndSymbolByTokenAddress(getTotalSolAmount(), NATIVE_SOL_MINT.toBase58())}`
                      : t('ddca-setup-modal.cta-label-deposit')
                  : !hasEnoughFromTokenBalance()
                    ? t('transactions.validation.amount-low')
                    : !hasEnoughNativeBalanceForFees()
                        ? `Need at least ${getTokenAmountAndSymbolByTokenAddress(getGasFeeAmount(), NATIVE_SOL_MINT.toBase58())}`
                        : t('ddca-setup-modal.cta-label-deposit')
            }
          </Button>
        </div>
        <div className="col-6">
          <Button
            className={`main-cta ${isBusy ? 'inactive' : ''}`}
            block
            type="primary"
            shape="round"
            size="large"
            disabled={!vaultCreated}
            onClick={() => {
              if (vaultCreated && swapExecuted) {
                onOperationSuccess();
              } else {
                onSpawnSwapTxStart();
              }
            }}>
            {vaultCreated && isBusy ? t('general.starting') : vaultCreated && swapExecuted ? t('general.finished') : t('general.start')}
          </Button>
        </div>
      </div>
      <div className="transaction-timeline-wrapper">
        <ul className="transaction-timeline">
          <li>
            {!vaultCreated && !swapExecuted && isBusy ? (
              <span className="value"><LoadingOutlined style={{ fontSize: '16px' }} /></span>
            ) : vaultCreated ? (
              <span className="value">✔︎</span>
            ) : (
              <span className="value">1</span>
            )}
          </li>
          <li>
            {vaultCreated && isBusy ? (
              <span className="value"><LoadingOutlined style={{ fontSize: '16px' }} /></span>
            ) : vaultCreated && swapExecuted ? (
              <span className="value">✔︎</span>
            ) : (
              <span className="value">2</span>
            )}
          </li>
        </ul>
      </div>
    </Modal>
  );
};
