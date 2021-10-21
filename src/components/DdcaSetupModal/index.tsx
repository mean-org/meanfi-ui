import React, { useCallback, useEffect, useState } from 'react';
import { Button, Modal, Slider } from "antd";
import { useContext } from "react";
import { AppStateContext } from "../../contexts/appstate";
import { useTranslation } from "react-i18next";
import { DcaInterval } from '../../models/ddca-models';
import { consoleOut, delay, getTransactionStatusForLogs, percentage } from '../../utils/ui';
import { TokenInfo } from '@solana/spl-token-registry';
import { getTokenAmountAndSymbolByTokenAddress } from '../../utils/utils';
import "./style.less";
import { SliderMarks } from 'antd/lib/slider';
import { IconShield } from '../../Icons';
import { InfoIcon } from '../InfoIcon';
import { AccountMeta, Connection, PublicKey, Transaction } from '@solana/web3.js';
import { useWallet } from '../../contexts/wallet';
import { EXCEPTION_LIST } from '../../constants';
import { NATIVE_SOL_MINT } from '../../utils/ids';
import { environment } from '../../environments/environment';
import { TransactionStatus } from '../../models/enums';
import { customLogger } from '../..';
import { DdcaClient, TransactionFees } from '@mean-dao/ddca';
import { LoadingOutlined } from '@ant-design/icons';
import { HlaInfo } from '../../hybrid-liquidity-ag/types';

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
  const [rangeMin, setRangeMin] = useState(0);
  const [rangeMax, setRangeMax] = useState(0);
  const [recurrencePeriod, setRecurrencePeriod] = useState(0);
  const [minimumRequiredBalance, setMinimumRequiredBalance] = useState(0);
  const [marks, setMarks] = useState<SliderMarks>();
  const [isOperationValid, setIsOperationValid] = useState(false);
  // Transaction control
  const {
    ddcaOption,
    transactionStatus,
    setTransactionStatus,
  } = useContext(AppStateContext);
  const [isBusy, setIsBusy] = useState(false);
  const [vaultCreated, setVaultCreated] = useState(false);
  const [swapExecuted, setSwapExecuted] = useState(false);
  const [transactionCancelled, setTransactionCancelled] = useState(false);

  const isProd = (): boolean => {
    return environment === 'production';
  }

  const hasEnoughNativeBalance = (): boolean => {
    return props.userBalance >= props.ddcaTxFees.maxFeePerSwap * (recurrencePeriod + 1) ? true : false;
  }

  const isUserAllowed = (): boolean => {
    if (!publicKey) { return true; }
    return EXCEPTION_LIST.some(a => a === publicKey.toBase58());
  }

  const isSuccess = (): boolean => {
    return transactionStatus.currentOperation === TransactionStatus.ConfirmTransactionSuccess ||
           transactionStatus.currentOperation === TransactionStatus.TransactionFinished
      ? true
      : false;
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
      totalPeriod: getTotalPeriod(recurrencePeriod)
    })}</span>`;
  }

  const onSliderChange = (value?: number) => {
    setRecurrencePeriod(value || 0);
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
    if (ddcaOption && props.fromTokenAmount && props.fromTokenBalance) {
      const maxRangeFromSelection =
        ddcaOption.dcaInterval === DcaInterval.RepeatingDaily
          ? 365
          : ddcaOption.dcaInterval === DcaInterval.RepeatingWeekly
          ? 52
          : ddcaOption.dcaInterval === DcaInterval.RepeatingTwiceMonth
          ? 26
          : 12;
      const maxRangeFromBalance = Math.floor(props.fromTokenBalance / props.fromTokenAmount);
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
      const minimumRequired = props.fromTokenAmount * (rangeMin + 1);
      const isOpValid = minimumRequired < props.fromTokenBalance ? true : false;
      setMinimumRequiredBalance(minimumRequired);
      setIsOperationValid(isOpValid);

      // Set the slider position
      if (isOpValid) {
        setRecurrencePeriod(initialValue);
      } else {
        setRecurrencePeriod(minRangeSelectable);
      }

      consoleOut('HLA INFO', props.hlaInfo, 'blue');
      consoleOut('HLA INFO ACCOUNTS', props.hlaInfo?.remainingAccounts.map(a => a.toBase58()));
    
    }
  }, [
    ddcaOption,
    rangeMin,
    props.fromTokenAmount,
    props.fromTokenBalance,
    props.hlaInfo,
    getTotalPeriod
  ]);

  ////////////////
  //   Events   //
  ////////////////

  const onOperationCancel = () => {
    if (isBusy) {
      setTransactionCancelled(true);
    }
    props.handleClose();
  }

  const onOperationSuccess = () => {
    props.handleOk();
  }

  const onCreateVaultTxStart = async () => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let ddcaAccountPda: PublicKey;
    const transactionLog: any[] = [];

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
          depositAmount: props.fromTokenAmount * (recurrencePeriod + 1),
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
          payload.depositAmount,
          payload.amountPerSwap,
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
          ddcaAccountPda = value[0];
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
      const encodedTx = signedTransaction.serialize().toString('base64');
      if (wallet) {
        return await props.connection
          .sendEncodedTransaction(encodedTx, { preflightCommitment: "finalized" })
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
          consoleOut('Simulating TxSend for 2 seconds', '', 'purple');
          await delay(2000);
          setVaultCreated(true);
          setIsBusy(false);
        }  else { setIsBusy(false); }

        // if (sign && !transactionCancelled) {
        //   const sent = await sendTx();
        //   consoleOut('sent:', sent);
        //   if (sent && !transactionCancelled) {
        //     const confirmed = await confirmTx();
        //     if (confirmed && !transactionCancelled) {
        //       setVaultCreated(true);
        //       setIsBusy(false);
        //     } else { setIsBusy(false); }
        //   } else { setIsBusy(false); }
        // } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  };

  const onSpawnSwapTxStart = async () => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let ddcaAccountPda: PublicKey;
    const transactionLog: any[] = [];

    const saberAmmAddress = new PublicKey("VeNkoB1HvSP6bSeGybQDnx9wTWFsQb2NBCemeCDSuKL");
    const saberPoolTokenAddress = new PublicKey("YakofBo4X3zMxa823THQJwZ8QeoU8pxPdFdxJs7JW57");
    const sabarUsdcReservesAddress = new PublicKey("6aFutFMWR7PbWdBQhdfrcKrAor9WYa2twtSinTMb9tXv");
    const saberUsdtReservesAddress = new PublicKey("HXbhpnLTxSDDkTg6deDpsXzJRBf8j7T6Dc3GidwrLWeo");
    const saberProtocolProgramAddress = new PublicKey("SSwpkEEcbUqx4vtoEByFjSkhKdCT862DNVb52nZg1UZ");
    const hlaAmmAccounts: Array<AccountMeta> = [
      { pubkey: saberProtocolProgramAddress, isWritable: false, isSigner: false},
      { pubkey: saberAmmAddress, isWritable: false, isSigner: false},
      { pubkey: saberPoolTokenAddress, isWritable: false, isSigner: false},
      { pubkey: sabarUsdcReservesAddress, isWritable: true, isSigner: false},
      { pubkey: saberUsdtReservesAddress, isWritable: true, isSigner: false},
    ];

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

        const swapPayload = {
          ddcaAccountPda: ddcaAccountPda,
          fromMint: new PublicKey(props.fromToken?.address as string),
          toMint: new PublicKey(props.toToken?.address as string),
          hlaAmmAccounts: hlaAmmAccounts,
          swapMinimumOutAmount: 0,      // TODO: where to get this from?
          swapSlippage: props.slippage
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
          swapPayload.fromMint,
          swapPayload.toMint,
          hlaAmmAccounts,
          swapPayload.swapMinimumOutAmount,
          swapPayload.swapSlippage)
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
          .sendEncodedTransaction(encodedTx, { preflightCommitment: "finalized" })
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
      // Simulation via setTimeout
      consoleOut('Simulating TxStart...', '', 'purple');
      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction
      });
      consoleOut('Simulating TxSign for 2 seconds...', '', 'purple');
      await delay(2000);
      setTransactionStatus({
        lastOperation: TransactionStatus.InitTransactionSuccess,
        currentOperation: TransactionStatus.SignTransaction
      });
      consoleOut('Set SignTransactionSuccess...', '', 'purple');
      await delay(350);
      setTransactionStatus({
        lastOperation: TransactionStatus.SignTransactionSuccess,
        currentOperation: TransactionStatus.SendTransaction
      });
      consoleOut('Simulating TxSend for 2 seconds', '', 'purple');
      await delay(2000);
      setTransactionStatus({
        lastOperation: transactionStatus.currentOperation,
        currentOperation: TransactionStatus.ConfirmTransaction
      });
      consoleOut('Simulating TxConfirm for 2 second', '', 'purple');
      await delay(2000);
      setTransactionStatus({
        lastOperation: TransactionStatus.ConfirmTransactionSuccess,
        currentOperation: TransactionStatus.TransactionFinished
      });
      setIsBusy(false);
      setSwapExecuted(true);

      // const create = await createTx();
      // consoleOut('create:', create);
      // if (create && !transactionCancelled) {
      //   const sign = await signTx();
      //   consoleOut('sign:', sign);
      //   if (sign && !transactionCancelled) {
      //     const sent = await sendTx();
      //     consoleOut('sent:', sent);
      //     if (sent && !transactionCancelled) {
      //       const confirmed = await confirmTx();
      //       if (confirmed && !transactionCancelled) {
      //         setIsBusy(false);
      //         setSwapExecuted(true);
      //       } else { setIsBusy(false); }
      //     } else { setIsBusy(false); }
      //   } else { setIsBusy(false); }
      // } else { setIsBusy(false); }
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
          value={recurrencePeriod}
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
                  props.fromTokenAmount * (recurrencePeriod + 1),
                  props.fromToken?.address as string)
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
      {!isOperationValid && (
        <div className="mb-2 text-center">
          <span className="fg-error">
            {
              t('transactions.validation.minimum-repeating-buy-amount', {
                fromTokenAmount: getTokenAmountAndSymbolByTokenAddress(
                  minimumRequiredBalance,
                  props.fromToken?.address as string
                )
              })
            }
          </span>
        </div>
      )}
      <div className="row two-col-ctas">
        <div className="col-6">
          <Button
            className={`main-cta ${vaultCreated ? 'completed' : ''}`}
            block
            type="primary"
            shape="round"
            size="large"
            disabled={!isOperationValid || !isUserAllowed() || !hasEnoughNativeBalance() || !isProd()}
            onClick={() => onCreateVaultTxStart()}>
              {
                !isOperationValid
                  ? t('transactions.validation.amount-low')
                  : !isUserAllowed()
                    ? 'Repeating buy temporarily unavailable'
                    : !hasEnoughNativeBalance()
                      ? `Need at least ${getTokenAmountAndSymbolByTokenAddress(props.ddcaTxFees.maxFeePerSwap * (recurrencePeriod + 1), NATIVE_SOL_MINT.toBase58())}`
                      : vaultCreated
                        ? t('ddca-setup-modal.cta-label-vault-created')
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
            {vaultCreated && isBusy ? 'Starting' : vaultCreated && swapExecuted ? 'Finished' : 'Start'}
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
