import { CloseOutlined, LoadingOutlined } from '@ant-design/icons';
import { DdcaClient, TransactionFees } from '@mean-dao/ddca';
import { HlaInfo } from '@mean-dao/hybrid-liquidity-ag/lib/types';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { Button, Modal, Popconfirm, Slider } from 'antd';
import { SliderMarks } from 'antd/lib/slider';
import { InfoIcon } from 'components/InfoIcon';
import { openNotification } from 'components/Notifications';
import { AppStateContext } from 'contexts/appstate';
import { TxConfirmationContext } from 'contexts/transaction-status';
import { useWallet } from 'contexts/wallet';
import { IconShieldSolid } from 'Icons/IconShieldSolid';
import { customLogger } from 'index';
import { NATIVE_SOL_MINT } from 'middleware/ids';
import {
  consoleOut,
  getTransactionStatusForLogs,
  isProd,
  percentage,
} from 'middleware/ui';
import { getAmountWithSymbol, getTxIxResume } from 'middleware/utils';
import { DcaInterval } from 'models/ddca-models';
import { OperationType, TransactionStatus } from 'models/enums';
import { TokenInfo } from 'models/SolanaTokenInfo';
import { useCallback, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './style.scss';

export const DdcaSetupModal = (props: {
  connection: Connection;
  ddcaTxFees: TransactionFees;
  endpoint: string;
  fromToken: TokenInfo | undefined;
  fromTokenAmount: number;
  fromTokenBalance: number;
  handleClose: any;
  handleOk: any;
  hlaInfo: HlaInfo;
  isVisible: boolean;
  onAfterClose: any;
  slippage: number;
  toToken: TokenInfo | undefined;
  userBalance: number;
}) => {
  const {
    connection,
    ddcaTxFees,
    endpoint,
    fromToken,
    fromTokenAmount,
    fromTokenBalance,
    handleClose,
    handleOk,
    hlaInfo,
    isVisible,
    onAfterClose,
    slippage,
    toToken,
    userBalance,
  } = props;
  const { t } = useTranslation('common');
  const { publicKey, wallet } = useWallet();
  // Transaction control
  const { ddcaOption, transactionStatus, setTransactionStatus } =
    useContext(AppStateContext);
  const { setRecentlyCreatedVault, startFetchTxSignatureInfo } = useContext(
    TxConfirmationContext,
  );
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
  const [lockedFromTokenBalance, setLockedFromTokenBalance] = useState<
    number | undefined
  >(undefined);

  const getGasFeeAmount = useCallback((): number => {
    return (
      ddcaTxFees.maxBlockchainFee +
      ddcaTxFees.maxFeePerSwap * (lockedSliderValue + 1)
    );
  }, [
    lockedSliderValue,
    ddcaTxFees.maxFeePerSwap,
    ddcaTxFees.maxBlockchainFee,
  ]);

  const hasEnoughNativeBalanceForFees = (): boolean => {
    return userBalance >= getGasFeeAmount() ? true : false;
  };

  const getTotalSolAmountNeeded = useCallback((): number => {
    const depositAmount = fromTokenAmount * (lockedSliderValue + 1);
    return depositAmount + getGasFeeAmount();
  }, [lockedSliderValue, fromTokenAmount, getGasFeeAmount]);

  const isNative = useCallback((): boolean => {
    return fromToken && fromToken.symbol === 'SOL' ? true : false;
  }, [fromToken]);

  const getInterval = useCallback((): number => {
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
  }, [ddcaOption?.dcaInterval]);

  const getRecurrencePeriod = useCallback((): string => {
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
  }, [ddcaOption?.dcaInterval, t]);

  const getTotalPeriod = useCallback(
    (periodValue: number): string => {
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
    },
    [t, ddcaOption?.dcaInterval],
  );

  const getModalHeadline = useCallback(() => {
    // Buy 100 USDC worth of SOL every week ,for 6 weeks, starting today.
    // Buy {{fromTokenAmount}} worth of {{toTokenSymbol}} {{recurrencePeriod}} for {{totalPeriod}}, starting today.
    return `<span>${t('ddca-setup-modal.headline', {
      fromTokenAmount: getAmountWithSymbol(
        fromTokenAmount,
        fromToken?.address as string,
      ),
      toTokenSymbol: toToken?.symbol,
      recurrencePeriod: getRecurrencePeriod(),
      totalPeriod: getTotalPeriod(lockedSliderValue),
    })}</span>`;
  }, [
    lockedSliderValue,
    fromTokenAmount,
    toToken?.symbol,
    fromToken?.address,
    getRecurrencePeriod,
    getTotalPeriod,
    t,
  ]);

  function sliderTooltipFormatter(value?: number) {
    return (
      <>
        <svg
          className="tooltip-svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M9.99999 3.57843C9.58578 3.57843 9.24999 3.24264 9.24999 2.82843C9.24999 2.41422 9.58578 2.07843 9.99999 2.07843H13.5355C13.9497 2.07843 14.2855 2.41422 14.2855 2.82843C14.2855 3.24264 13.9497 3.57843 13.5355 3.57843H9.99999Z"
            fill="currentColor"
          />
          <path
            d="M6.53033 4.03033C6.82322 4.32323 6.82322 4.7981 6.53033 5.09099L4.03033 7.59099C3.73744 7.88389 3.26256 7.88389 2.96967 7.59099C2.67678 7.2981 2.67678 6.82323 2.96967 6.53033L5.46967 4.03033C5.76256 3.73744 6.23744 3.73744 6.53033 4.03033Z"
            fill="currentColor"
          />
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M12 5.06066C7.30558 5.06066 3.5 8.86624 3.5 13.5607C3.5 18.2551 7.30558 22.0607 12 22.0607C16.6944 22.0607 20.5 18.2551 20.5 13.5607C20.5 8.86624 16.6944 5.06066 12 5.06066ZM16.9909 8.77144C17.1457 8.5724 17.128 8.28922 16.9497 8.11092C16.7714 7.93261 16.4883 7.91498 16.2892 8.06979L13.1153 10.5384L11.0397 12.021C10.6629 12.2901 10.4393 12.7246 10.4393 13.1876C10.4393 13.9794 11.0812 14.6213 11.873 14.6213C12.3361 14.6213 12.7706 14.3977 13.0397 14.0209L14.5223 11.9454L16.9909 8.77144Z"
            fill="currentColor"
          />
        </svg>
        <span className="fg-primary-highlight font-bold">
          {getTotalPeriod(value || 0)}
        </span>
      </>
    );
  }

  const hasEnoughFromTokenBalance = (): boolean => {
    return (
      (lockedFromTokenBalance || 0) > fromTokenAmount * (lockedSliderValue + 1)
    );
  };

  //////////////////////////
  //   Data Preparation   //
  //////////////////////////

  // Set lockedFromTokenBalance from injected fromTokenBalance once por modal open
  useEffect(() => {
    if (!lockedFromTokenBalance) {
      setLockedFromTokenBalance(fromTokenBalance);
    }
  }, [lockedFromTokenBalance, fromTokenBalance]);

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
    if (ddcaOption && fromTokenAmount && lockedFromTokenBalance) {
      const maxRangeFromSelection =
        ddcaOption.dcaInterval === DcaInterval.RepeatingDaily
          ? 365
          : ddcaOption.dcaInterval === DcaInterval.RepeatingWeekly
          ? 52
          : ddcaOption.dcaInterval === DcaInterval.RepeatingTwiceMonth
          ? 26
          : 12;
      const maxRangeFromBalance = Math.floor(
        lockedFromTokenBalance / fromTokenAmount,
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
        [maxRangeSelectable]: getTotalPeriod(maxRangeSelectable),
      };
      setMarks(marks);

      // Set minimum required and valid flag
      const minimumRequired = fromTokenAmount * (minRangeSelectable + 1);
      const isOpValid = minimumRequired < lockedFromTokenBalance ? true : false;

      // Set the slider position
      const sliderPosition = isOpValid ? initialValue : minRangeSelectable;
      setRecurrencePeriod(sliderPosition);

      consoleOut('HLA INFO', hlaInfo, 'blue');
      consoleOut(
        'remainingAccounts',
        hlaInfo.remainingAccounts.map(a => a.pubkey.toBase58()),
        'blue',
      );
    }
  }, [
    ddcaOption,
    fromTokenAmount,
    lockedFromTokenBalance,
    hlaInfo,
    getTotalPeriod,
  ]);

  // Set lockedSliderValue once when the modal is openes but we have a recurrencePeriod > 0
  useEffect(() => {
    if (isVisible && recurrencePeriod) {
      setLockedSliderValue(recurrencePeriod);
    }
  }, [isVisible, recurrencePeriod]);

  ////////////////
  //   Events   //
  ////////////////

  const onSliderChange = (value?: number) => {
    setRecurrencePeriod(value || 0);
    setLockedSliderValue(value || 0);
  };

  const onTxErrorCreatingVaultWithNotify = () => {
    setRecentlyCreatedVault('');
    openNotification({
      title: t('notifications.error-title'),
      description: t('notifications.error-creating-vault-message'),
      type: 'error',
    });
    setIsBusy(false);
  };

  const onFinishedSwapTx = () => {
    setIsBusy(false);
    setSwapExecuted(true);
    handleOk();
  };

  const onOperationCancel = (shouldReload = false) => {
    if (isBusy) {
      setTransactionCancelled(true);
    }
    handleClose(shouldReload);
  };

  const onOperationSuccess = () => {
    handleOk();
  };

  // Create vault and deposit
  const onCreateVaultTxStart = async () => {
    let transaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    setLockedSliderValue(recurrencePeriod);
    setRecentlyCreatedVault('');
    setDdcaAccountPda(undefined);
    setVaultCreated(false);
    setSwapExecuted(false);
    setTransactionCancelled(false);
    setIsBusy(true);

    const ddcaClient = new DdcaClient(endpoint, wallet, {
      commitment: 'confirmed',
    });

    const createTx = async (): Promise<boolean> => {
      if (wallet) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction,
        });

        const payload = {
          ownerAccountAddress: publicKey,
          amountPerSwap: fromTokenAmount,
          fromMint: new PublicKey(fromToken?.address as string),
          toMint: new PublicKey(toToken?.address as string),
          intervalinSeconds: getInterval(),
          totalSwaps: recurrencePeriod + 1,
        };

        consoleOut('ddca params:', payload, 'brown');

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(
            TransactionStatus.TransactionStart,
          ),
          inputs: payload,
        });

        transactionLog.push({
          action: getTransactionStatusForLogs(
            TransactionStatus.InitTransaction,
          ),
          result: '',
        });

        // Create a transaction
        return await ddcaClient
          .createDdcaTx(
            payload.fromMint,
            payload.toMint,
            payload.amountPerSwap,
            payload.totalSwaps,
            payload.intervalinSeconds,
          )
          .then((value: [PublicKey, Transaction]) => {
            consoleOut(
              'createDdca returned vault pubKey and transaction:',
              value,
            );
            setTransactionStatus({
              lastOperation: TransactionStatus.InitTransactionSuccess,
              currentOperation: TransactionStatus.SignTransaction,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(
                TransactionStatus.InitTransactionSuccess,
              ),
              result: getTxIxResume(value[1]),
            });
            setRecentlyCreatedVault(value[0].toBase58());
            setDdcaAccountPda(value[0]);
            transaction = value[1];
            return true;
          })
          .catch(error => {
            console.error('createDdca error:', error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(
                TransactionStatus.InitTransactionFailure,
              ),
              result: `${error}`,
            });
            customLogger.logError('DDCA Create vault transaction failed', {
              transcript: transactionLog,
            });
            return false;
          });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!',
        });
        customLogger.logError('DDCA Create vault transaction failed', {
          transcript: transactionLog,
        });
        return false;
      }
    };

    const sendTx = async (): Promise<boolean> => {
      if (connection && wallet && wallet.publicKey && transaction) {
        const {
          context: { slot: minContextSlot },
          value: { blockhash },
        } = await connection.getLatestBlockhashAndContext();

        transaction.feePayer = wallet.publicKey;
        transaction.recentBlockhash = blockhash;

        return wallet
          .sendTransaction(transaction, connection, { minContextSlot })
          .then(sig => {
            consoleOut('sendEncodedTransaction returned a signature:', sig);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransactionSuccess,
              currentOperation: TransactionStatus.ConfirmTransaction,
            });
            signature = sig;
            transactionLog.push({
              action: getTransactionStatusForLogs(
                TransactionStatus.SendTransactionSuccess,
              ),
              result: `signature: ${signature}`,
            });
            return true;
          })
          .catch(error => {
            console.error(error);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransaction,
              currentOperation: TransactionStatus.SendTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(
                TransactionStatus.SendTransactionFailure,
              ),
              result: { error, encodedTx },
            });
            customLogger.logError('DDCA Create vault transaction failed', {
              transcript: transactionLog,
            });
            return false;
          });
      } else {
        console.error('Cannot send transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SendTransaction,
          currentOperation: TransactionStatus.WalletNotFound,
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot send transaction! Wallet not found!',
        });
        customLogger.logError('DDCA Create vault transaction failed', {
          transcript: transactionLog,
        });
        return false;
      }
    };

    const confirmTx = async (): Promise<boolean> => {
      return await connection
        .confirmTransaction(signature, 'confirmed')
        .then(result => {
          consoleOut('confirmTransaction result:', result);
          if (result && result.value && !result.value.err) {
            setTransactionStatus({
              lastOperation: TransactionStatus.ConfirmTransactionSuccess,
              currentOperation: TransactionStatus.ConfirmTransactionSuccess,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(
                TransactionStatus.ConfirmTransactionSuccess,
              ),
              result: result.value,
            });
            return true;
          } else {
            setTransactionStatus({
              lastOperation: TransactionStatus.ConfirmTransaction,
              currentOperation: TransactionStatus.ConfirmTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(
                TransactionStatus.ConfirmTransactionFailure,
              ),
              result: signature,
            });
            customLogger.logError('DDCA Create vault transaction failed', {
              transcript: transactionLog,
            });
            return false;
          }
        })
        .catch(e => {
          setTransactionStatus({
            lastOperation: TransactionStatus.ConfirmTransaction,
            currentOperation: TransactionStatus.ConfirmTransactionFailure,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(
              TransactionStatus.ConfirmTransactionFailure,
            ),
            result: signature,
          });
          customLogger.logError('DDCA Create vault transaction failed', {
            transcript: transactionLog,
          });
          return false;
        });
    };

    if (wallet && publicKey) {
      const create = await createTx();
      consoleOut('create:', create);
      if (create && !transactionCancelled) {
        const sent = await sendTx();
        consoleOut('sent:', sent);
        if (sent && !transactionCancelled) {
          const confirmed = await confirmTx();
          if (confirmed && !transactionCancelled) {
            setVaultCreated(true);
            setIsBusy(false);
          } else {
            onTxErrorCreatingVaultWithNotify();
          }
        } else {
          onTxErrorCreatingVaultWithNotify();
        }
      } else {
        onTxErrorCreatingVaultWithNotify();
      }
    }
  };

  // Exec first swap
  const onSpawnSwapTxStart = async () => {
    let transaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    setSwapExecuted(false);
    setTransactionCancelled(false);
    setIsBusy(true);

    const ddcaClient = new DdcaClient(endpoint, wallet, {
      commitment: 'confirmed',
    });

    const createTx = async (): Promise<boolean> => {
      if (wallet && publicKey && ddcaAccountPda) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction,
        });

        const swapPayload = {
          ddcaAccountPda: ddcaAccountPda,
          hlaInfo: hlaInfo,
        };

        consoleOut('ddca swap params:', swapPayload, 'brown');

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(
            TransactionStatus.TransactionStart,
          ),
          inputs: swapPayload,
        });

        // Create a transaction
        return await ddcaClient
          .createWakeAndSwapTx(ddcaAccountPda, hlaInfo)
          .then(value => {
            consoleOut('createWakeAndSwapTx returned transaction:', value);
            setTransactionStatus({
              lastOperation: TransactionStatus.InitTransactionSuccess,
              currentOperation: TransactionStatus.SignTransaction,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(
                TransactionStatus.InitTransactionSuccess,
              ),
              result: getTxIxResume(value),
            });
            transaction = value;
            return true;
          })
          .catch(error => {
            console.error('createWakeAndSwapTx error:', error);
            const parsedError = ddcaClient.tryParseRpcError(error);
            consoleOut(
              'tryParseRpcError -> createWakeAndSwapTx',
              parsedError,
              'red',
            );
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(
                TransactionStatus.InitTransactionFailure,
              ),
              result: `${error}`,
            });
            customLogger.logError('WakeAndSwap transaction failed', {
              transcript: transactionLog,
            });
            return false;
          });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!',
        });
        customLogger.logError('WakeAndSwap transaction failed', {
          transcript: transactionLog,
        });
        return false;
      }
    };

    const sendTx = async (): Promise<boolean> => {
      if (connection && wallet && wallet.publicKey && transaction) {
        const {
          context: { slot: minContextSlot },
          value: { blockhash },
        } = await connection.getLatestBlockhashAndContext();

        transaction.feePayer = wallet.publicKey;
        transaction.recentBlockhash = blockhash;

        return wallet
          .sendTransaction(transaction, connection, { minContextSlot })
          .then(sig => {
            consoleOut('sendSignedTransaction returned a signature:', sig);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransactionSuccess,
              currentOperation: TransactionStatus.ConfirmTransaction,
            });
            signature = sig;
            transactionLog.push({
              action: getTransactionStatusForLogs(
                TransactionStatus.SendTransactionSuccess,
              ),
              result: `signature: ${signature}`,
            });
            return true;
          })
          .catch(error => {
            console.error(
              'createWakeAndSwapTx -> sendSignedTransaction error:',
              error,
            );
            const parsedError = ddcaClient.tryParseRpcError(error);
            consoleOut(
              'tryParseRpcError -> createWakeAndSwapTx -> sendSignedTransaction',
              parsedError,
              'red',
            );
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransaction,
              currentOperation: TransactionStatus.SendTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(
                TransactionStatus.SendTransactionFailure,
              ),
              result: { error, encodedTx },
            });
            customLogger.logError('WakeAndSwap transaction failed', {
              transcript: transactionLog,
            });
            return false;
          });
      } else {
        console.error('Cannot send transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SendTransaction,
          currentOperation: TransactionStatus.WalletNotFound,
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot send transaction! Wallet not found!',
        });
        customLogger.logError('WakeAndSwap transaction failed', {
          transcript: transactionLog,
        });
        return false;
      }
    };

    if (wallet && publicKey) {
      const create = await createTx();
      consoleOut('create:', create);
      if (create && !transactionCancelled) {
        const sent = await sendTx();
        consoleOut('sent:', sent);
        if (sent && !transactionCancelled) {
          consoleOut('Send Tx to confirmation queue:', signature);
          startFetchTxSignatureInfo(
            signature,
            'confirmed',
            OperationType.DdcaCreate,
          );
          onFinishedSwapTx();
        } else {
          onFinishedSwapTx();
        }
      } else {
        onFinishedSwapTx();
      }
    }
  };

  function onConfirm(e: any) {
    consoleOut('close confirmation accepted');
    onOperationCancel(true);
  }

  function onCancel(e: any) {
    consoleOut('close confirmation cancelled');
  }

  ////////////////
  // Validation //
  ////////////////

  const isDdcaValid = () => {
    return isProd() &&
      ((isNative() && userBalance > getTotalSolAmountNeeded()) ||
        (!isNative() && hasEnoughFromTokenBalance()))
      ? true
      : false;
  };

  const getMainCtaLabel = () => {
    return vaultCreated
      ? t('ddca-setup-modal.cta-label-vault-created')
      : isNative()
      ? getTotalSolAmountNeeded() > userBalance
        ? `Need at least ${getAmountWithSymbol(
            getTotalSolAmountNeeded(),
            NATIVE_SOL_MINT.toBase58(),
          )}`
        : t('ddca-setup-modal.cta-label-deposit')
      : !hasEnoughFromTokenBalance()
      ? t('transactions.validation.amount-low')
      : !hasEnoughNativeBalanceForFees()
      ? `Need at least ${getAmountWithSymbol(
          getGasFeeAmount(),
          NATIVE_SOL_MINT.toBase58(),
        )}`
      : t('ddca-setup-modal.cta-label-deposit');
  };

  ///////////////////
  //   Rendering   //
  ///////////////////

  // Info items will draw inside the popover
  const importantNotesPopoverContent = () => {
    return (
      <>
        <div className="font-bold">
          {t('ddca-setup-modal.notes.notes-title')}
        </div>
        <ol className="greek small">
          <li>{t('ddca-setup-modal.notes.note-item-01')}</li>
          <li>{t('ddca-setup-modal.notes.note-item-02')}</li>
          <li>{t('ddca-setup-modal.notes.note-item-03')}</li>
        </ol>
      </>
    );
  };

  return (
    <Modal
      className="mean-modal simple-modal"
      title={
        <div className="modal-title">{t('ddca-setup-modal.modal-title')}</div>
      }
      closeIcon={
        <Popconfirm
          placement="bottomRight"
          title={t('ddcas.setup-close-warning')}
          onConfirm={onConfirm}
          onCancel={onCancel}
          okText={t('general.yes')}
          cancelText={t('general.no')}
          className="max-popover-width"
        >
          <CloseOutlined />
        </Popconfirm>
      }
      footer={null}
      maskClosable={false}
      open={isVisible}
      onCancel={(e: any) => {
        if (!vaultCreated) {
          e.preventDefault();
          e.stopPropagation();
          onOperationCancel();
        }
      }}
      afterClose={onAfterClose}
      width={480}
    >
      <div className="mb-3">
        <div
          className="ddca-setup-heading"
          dangerouslySetInnerHTML={{ __html: getModalHeadline() }}
        ></div>
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
          dots={false}
        />
      </div>
      <div className="mb-3">
        <div className="font-bold">
          {t('ddca-setup-modal.help.how-does-it-work')}
        </div>
        <ol className="greek">
          <li>
            {t('ddca-setup-modal.help.help-item-01', {
              fromTokenAmount: getAmountWithSymbol(
                fromTokenAmount * (lockedSliderValue + 1),
                fromToken?.address as string,
              ),
            })}
          </li>
          <li>
            {t('ddca-setup-modal.help.help-item-02', {
              recurrencePeriod: getRecurrencePeriod(),
            })}
          </li>
          <li>
            {t('ddca-setup-modal.help.help-item-03', {
              toTokenSymbol: toToken?.symbol,
            })}
          </li>
        </ol>
      </div>
      <div className="mb-2 text-center">
        <span className="yellow-pill">
          <InfoIcon
            trigger="click"
            content={importantNotesPopoverContent()}
            placement="top"
          >
            <IconShieldSolid className="mean-svg-icons" />
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
            className={`main-cta ${
              !vaultCreated && isBusy
                ? 'inactive'
                : vaultCreated
                ? 'completed'
                : ''
            }`}
            block
            type="primary"
            shape="round"
            size="large"
            disabled={!isDdcaValid()}
            onClick={() => onCreateVaultTxStart()}
          >
            {!vaultCreated && isBusy
              ? t('ddca-setup-modal.cta-label-depositing')
              : getMainCtaLabel()}
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
            }}
          >
            {vaultCreated && isBusy
              ? t('general.starting')
              : vaultCreated && swapExecuted
              ? t('general.finished')
              : t('general.start')}
          </Button>
        </div>
      </div>
      <div className="transaction-timeline-wrapper">
        <ul className="transaction-timeline">
          <li>
            {!vaultCreated && !swapExecuted && isBusy ? (
              <span className="value">
                <LoadingOutlined style={{ fontSize: '16px' }} />
              </span>
            ) : vaultCreated ? (
              <span className="value">✔︎</span>
            ) : (
              <span className="value">1</span>
            )}
          </li>
          <li>
            {vaultCreated && isBusy ? (
              <span className="value">
                <LoadingOutlined style={{ fontSize: '16px' }} />
              </span>
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
